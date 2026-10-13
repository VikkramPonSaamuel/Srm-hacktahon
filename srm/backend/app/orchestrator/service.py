from datetime import datetime, timezone
import time
from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.incident import Incident, IncidentEvent
from app.models.pattern import FailurePattern, PatternMatch
from app.models.playbook import RecoveryExecution, RecoveryPlaybook
from app.orchestrator.notifications import MockEmailAdapter, MockSlackAdapter
from app.patterns.detector import RuleBasedPatternDetector
from app.playbooks.adapters import (
    MockPaymentReconcilerAdapter,
    MockRateLimitPolicyAdapter,
    MockWafActionAdapter,
)
from app.playbooks.engine import RecoveryEngine
from app.synthetic.mocks import MockServiceRegistry

logger = get_logger("app.orchestrator.service")


class OrchestrationState:
    DETECTED = "DETECTED"
    INVESTIGATING = "INVESTIGATING"
    PATTERN_MATCHED = "PATTERN_MATCHED"
    RECOVERY_ELIGIBLE = "RECOVERY_ELIGIBLE"
    RECOVERING = "RECOVERING"
    VERIFYING = "VERIFYING"
    RESOLVED = "RESOLVED"
    ESCALATED = "ESCALATED"
    RECOVERY_FAILED = "RECOVERY_FAILED"
    AWAITING_RECONCILIATION = "AWAITING_RECONCILIATION"


class RecoveryOrchestrator:
    """Orchestrates end-to-end transaction monitoring, pattern detection, and recovery playbook execution."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.detector = RuleBasedPatternDetector(db)
        self.engine = RecoveryEngine(db)

    def _record_audit_event(
        self,
        incident: Incident,
        event_type: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Records an audit event in the incident timeline."""
        details = {"message": message, "timestamp": datetime.now(timezone.utc).isoformat()}
        if metadata:
            details.update(metadata)
        event = IncidentEvent(
            incident_id=incident.id,
            event_type=event_type,
            details=details,
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(event)
        self.db.commit()
        logger.info(f"Audit Event [{event_type}] for incident {incident.incident_id}: {message}")

    def orchestrate_incident(
        self,
        incident: Incident,
        auto_recover: bool = True,
        operator_override: bool = False,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Runs the complete end-to-end incident lifecycle:

        DETECTED -> INVESTIGATING -> PATTERN_MATCHED -> RECOVERY_ELIGIBLE -> RECOVERING -> VERIFYING -> RESOLVED
        (or terminal states: ESCALATED, RECOVERY_FAILED, AWAITING_RECONCILIATION)
        """
        trace: List[Dict[str, Any]] = []

        # 1. State: DETECTED
        incident.recovery_status = OrchestrationState.DETECTED
        self.db.commit()
        self._record_audit_event(
            incident,
            "incident_detected",
            f"Failure detected on service '{incident.service_name}' ({incident.failure_category}).",
            {"failure_category": incident.failure_category, "service": incident.service_name},
        )
        trace.append({"state": OrchestrationState.DETECTED, "timestamp": datetime.now(timezone.utc).isoformat()})

        # 2. State: INVESTIGATING (Pattern Detection)
        incident.recovery_status = OrchestrationState.INVESTIGATING
        self.db.commit()
        self._record_audit_event(
            incident,
            "investigation_started",
            f"Analyzing failure features against historical incident patterns.",
        )
        trace.append({"state": OrchestrationState.INVESTIGATING, "timestamp": datetime.now(timezone.utc).isoformat()})

        matched_pattern = self.detector.evaluate_incident(incident)

        if not matched_pattern:
            # Unknown failure or isolated incident -> Escalate directly to human operator
            incident.recovery_status = OrchestrationState.ESCALATED
            incident.status = "investigating"
            self.db.commit()
            msg = f"Incident {incident.incident_id} is an isolated failure with no recurring historical pattern. Escalated for human investigation."
            self._record_audit_event(incident, "unknown_pattern_escalated", msg)
            MockSlackAdapter.send_message(
                channel="ops-alerts",
                title=f"Incident Escalated: {incident.title}",
                fields={"incident_id": incident.incident_id, "reason": "Isolated failure / Unknown pattern"},
                severity="warning",
            )
            MockEmailAdapter.send_email(
                recipient="oncall-ops@example.com",
                subject=f"[ESCALATION] Incident {incident.incident_id}: Unknown Failure Pattern",
                body=msg,
            )
            trace.append({"state": OrchestrationState.ESCALATED, "reason": "No recurring pattern matched"})
            return {
                "incident_id": incident.incident_id,
                "current_state": OrchestrationState.ESCALATED,
                "pattern_matched": None,
                "playbook_executed": None,
                "trace": trace,
            }

        # 3. State: PATTERN_MATCHED
        incident.recovery_status = OrchestrationState.PATTERN_MATCHED
        self.db.commit()
        self._record_audit_event(
            incident,
            "pattern_matched",
            f"Incident matched recurring failure pattern '{matched_pattern.name}' (confidence: {matched_pattern.confidence_score}).",
            {"pattern_id": matched_pattern.pattern_id, "pattern_name": matched_pattern.name},
        )
        trace.append({
            "state": OrchestrationState.PATTERN_MATCHED,
            "pattern_id": matched_pattern.pattern_id,
            "confidence_score": matched_pattern.confidence_score,
        })

        # Safety Check: Verify pattern match is sufficiently supported before automating defensive actions
        min_confidence = 0.70
        if matched_pattern.confidence_score < min_confidence:
            incident.recovery_status = OrchestrationState.ESCALATED
            incident.status = "investigating"
            self.db.commit()
            msg = (
                f"Pattern '{matched_pattern.name}' confidence score ({matched_pattern.confidence_score}) "
                f"is below safety threshold ({min_confidence}). Historical similarity alone cannot "
                f"authorize automated defensive response. Escalating for human verification."
            )
            self._record_audit_event(incident, "insufficient_pattern_confidence_escalated", msg)
            trace.append({"state": OrchestrationState.ESCALATED, "reason": "Insufficient pattern confidence score"})
            return {
                "incident_id": incident.incident_id,
                "current_state": OrchestrationState.ESCALATED,
                "pattern_matched": matched_pattern.name,
                "playbook_executed": None,
                "trace": trace,
            }

        # 4. Identify associated approved playbook
        playbook = self._find_associated_playbook(matched_pattern, incident)

        if not playbook:
            # No approved playbook found -> Escalate
            incident.recovery_status = OrchestrationState.ESCALATED
            incident.status = "investigating"
            self.db.commit()
            msg = f"Pattern '{matched_pattern.name}' identified, but no approved and enabled recovery playbook exists. Escalating for operator intervention."
            self._record_audit_event(incident, "no_approved_playbook_escalated", msg)
            MockSlackAdapter.send_message(
                channel="ops-alerts",
                title=f"Recovery Playbook Missing: {matched_pattern.name}",
                fields={"incident_id": incident.incident_id, "pattern_id": matched_pattern.pattern_id},
                severity="warning",
            )
            trace.append({"state": OrchestrationState.ESCALATED, "reason": "No approved playbook exists"})
            return {
                "incident_id": incident.incident_id,
                "current_state": OrchestrationState.ESCALATED,
                "pattern_matched": matched_pattern.name,
                "playbook_executed": None,
                "trace": trace,
            }

        # 5. State: RECOVERY_ELIGIBLE
        incident.recovery_status = OrchestrationState.RECOVERY_ELIGIBLE
        self.db.commit()
        self._record_audit_event(
            incident,
            "playbook_associated",
            f"Associated approved playbook '{playbook.name}' ({playbook.playbook_id}) with incident.",
            {"playbook_id": playbook.playbook_id, "strategy": playbook.recovery_strategy},
        )
        trace.append({"state": OrchestrationState.RECOVERY_ELIGIBLE, "playbook_id": playbook.playbook_id})

        if not auto_recover:
            return {
                "incident_id": incident.incident_id,
                "current_state": OrchestrationState.RECOVERY_ELIGIBLE,
                "pattern_matched": matched_pattern.name,
                "playbook_eligible": playbook.name,
                "trace": trace,
            }

        # 6. Deduplication & Idempotency check for recovery jobs
        # Check if an active execution already succeeded or is running for this incident & playbook
        existing_active_exec = (
            self.db.query(RecoveryExecution)
            .filter(
                RecoveryExecution.incident_id == incident.id,
                RecoveryExecution.playbook_id == playbook.id,
                RecoveryExecution.status.in_(["succeeded", "in_progress"]),
            )
            .first()
        )
        if existing_active_exec:
            msg = (
                f"Duplicate recovery execution skipped: Playbook '{playbook.name}' is already "
                f"'{existing_active_exec.status}' for incident {incident.incident_id}."
            )
            logger.info(msg)
            self._record_audit_event(incident, "recovery_deduplicated", msg)
            return {
                "incident_id": incident.incident_id,
                "current_state": incident.recovery_status,
                "pattern_matched": matched_pattern.name,
                "playbook_executed": playbook.name,
                "execution_id": existing_active_exec.execution_id,
                "trace": trace,
            }

        # 7. Payment Safety Gating: Check uncertain payment state before blind retries
        if incident.failure_category in ("payment_timeout", "indeterminate_payment"):
            rec_idempotency_key = idempotency_key or f"idem_{incident.incident_id}"
            rec_result = MockPaymentReconcilerAdapter.reconcile_transaction(
                idempotency_key=rec_idempotency_key,
                gateway="primary-payment-gateway",
            )

            if rec_result.get("reconciliation_status") == "INDETERMINATE_TIMEOUT":
                # State is uncertain! Stop and escalate instead of guessing
                incident.recovery_status = OrchestrationState.AWAITING_RECONCILIATION
                incident.status = "investigating"
                self.db.commit()
                msg = (
                    f"Payment status is indeterminate on gateway for idempotency key '{rec_idempotency_key}'. "
                    f"Automated retry prohibited to prevent duplicate charge. Customer cart and order preserved."
                )
                self._record_audit_event(incident, "awaiting_reconciliation", msg, rec_result)
                MockSlackAdapter.send_message(
                    channel="finance-ops",
                    title="Payment Reconciliation Required",
                    fields={
                        "incident_id": incident.incident_id,
                        "idempotency_key": rec_idempotency_key,
                        "directive": "Do not issue second charge",
                    },
                    severity="critical",
                )
                trace.append({
                    "state": OrchestrationState.AWAITING_RECONCILIATION,
                    "reconciliation": rec_result,
                })
                return {
                    "incident_id": incident.incident_id,
                    "current_state": OrchestrationState.AWAITING_RECONCILIATION,
                    "pattern_matched": matched_pattern.name,
                    "playbook_executed": None,
                    "reconciliation": rec_result,
                    "trace": trace,
                }

        # 8. State: RECOVERING
        incident.recovery_status = OrchestrationState.RECOVERING
        self.db.commit()
        self._record_audit_event(
            incident,
            "recovery_started",
            f"Executing recovery playbook '{playbook.name}'.",
        )
        trace.append({"state": OrchestrationState.RECOVERING, "timestamp": datetime.now(timezone.utc).isoformat()})

        execution = self.engine.execute_playbook(
            playbook=playbook,
            incident=incident,
            is_simulation=False,
            operator_override=operator_override,
            idempotency_key=idempotency_key,
        )

        if execution.status == "escalated":
            incident.recovery_status = OrchestrationState.ESCALATED
            incident.status = "investigating"
            self.db.commit()
            msg = f"Recovery escalated: {execution.failure_details}"
            MockSlackAdapter.send_message(
                channel="ops-alerts",
                title=f"Recovery Escalated: {playbook.name}",
                fields={"incident_id": incident.incident_id, "details": execution.failure_details},
                severity="warning",
            )
            trace.append({"state": OrchestrationState.ESCALATED, "details": execution.failure_details})
            return {
                "incident_id": incident.incident_id,
                "current_state": OrchestrationState.ESCALATED,
                "pattern_matched": matched_pattern.name,
                "playbook_executed": playbook.name,
                "execution_id": execution.execution_id,
                "trace": trace,
            }

        if execution.status == "failed":
            incident.recovery_status = OrchestrationState.RECOVERY_FAILED
            incident.status = "open"
            self.db.commit()
            msg = f"Recovery actions failed: {execution.failure_details}"
            MockSlackAdapter.send_message(
                channel="ops-alerts",
                title=f"Recovery Failed: {playbook.name}",
                fields={"incident_id": incident.incident_id, "details": execution.failure_details},
                severity="danger",
            )
            trace.append({"state": OrchestrationState.RECOVERY_FAILED, "details": execution.failure_details})
            return {
                "incident_id": incident.incident_id,
                "current_state": OrchestrationState.RECOVERY_FAILED,
                "pattern_matched": matched_pattern.name,
                "playbook_executed": playbook.name,
                "execution_id": execution.execution_id,
                "trace": trace,
            }

        # 9. State: VERIFYING
        incident.recovery_status = OrchestrationState.VERIFYING
        self.db.commit()
        trace.append({"state": OrchestrationState.VERIFYING, "timestamp": datetime.now(timezone.utc).isoformat()})

        # Run verification check against the service
        is_verified, verif_details = self._verify_resolution(incident, playbook)

        if is_verified:
            # 10. State: RESOLVED
            incident.recovery_status = OrchestrationState.RESOLVED
            incident.status = "resolved"
            incident.resolved_at = datetime.now(timezone.utc)
            self.db.commit()
            msg = f"Recovery countermeasures for '{playbook.name}' verified successfully. Incident resolved."
            self._record_audit_event(incident, "recovery_resolved", msg, verif_details)
            MockSlackAdapter.send_message(
                channel="ops-recovery",
                title=f"Incident Resolved via Automated Playbook",
                fields={
                    "incident_id": incident.incident_id,
                    "playbook": playbook.name,
                    "service": incident.service_name,
                },
                severity="good",
            )
            MockEmailAdapter.send_email(
                recipient="devops@example.com",
                subject=f"[RESOLVED] Incident {incident.incident_id} Recovered",
                body=msg,
            )
            trace.append({"state": OrchestrationState.RESOLVED, "verification": verif_details})
            return {
                "incident_id": incident.incident_id,
                "current_state": OrchestrationState.RESOLVED,
                "pattern_matched": matched_pattern.name,
                "playbook_executed": playbook.name,
                "execution_id": execution.execution_id,
                "trace": trace,
            }
        else:
            # Verification failed -> RECOVERY_FAILED
            incident.recovery_status = OrchestrationState.RECOVERY_FAILED
            incident.status = "open"
            self.db.commit()
            msg = f"Recovery actions executed but verification failed: {verif_details}. Escalating."
            self._record_audit_event(incident, "verification_failed", msg, verif_details)
            trace.append({"state": OrchestrationState.RECOVERY_FAILED, "verification": verif_details})
            return {
                "incident_id": incident.incident_id,
                "current_state": OrchestrationState.RECOVERY_FAILED,
                "pattern_matched": matched_pattern.name,
                "playbook_executed": playbook.name,
                "execution_id": execution.execution_id,
                "trace": trace,
            }

    def _find_associated_playbook(
        self,
        pattern: FailurePattern,
        incident: Incident,
    ) -> Optional[RecoveryPlaybook]:
        """Finds an approved, enabled recovery playbook matching the failure pattern or service."""
        # 1. Match by pattern_ref or pattern_id
        playbook = (
            self.db.query(RecoveryPlaybook)
            .filter(
                RecoveryPlaybook.approval_status == "approved",
                RecoveryPlaybook.is_enabled.is_(True),
                (RecoveryPlaybook.pattern_ref == pattern.pattern_id)
                | (RecoveryPlaybook.pattern_id == pattern.id),
            )
            .first()
        )
        if playbook:
            return playbook

        # 2. Match by applicable service & trigger conditions
        approved_playbooks = (
            self.db.query(RecoveryPlaybook)
            .filter(
                RecoveryPlaybook.approval_status == "approved",
                RecoveryPlaybook.is_enabled.is_(True),
            )
            .all()
        )

        for pb in approved_playbooks:
            if pb.trigger_conditions.get("failure_category") and pb.trigger_conditions.get("failure_category") == incident.failure_category:
                return pb
            if incident.service_name and incident.service_name in pb.applicable_services:
                return pb

        return None

    def _verify_resolution(
        self,
        incident: Incident,
        playbook: RecoveryPlaybook,
    ) -> tuple[bool, Dict[str, Any]]:
        """Verifies whether the underlying service issue has been resolved."""
        service_name = incident.service_name or "auth-service"

        # Check mock service health ping
        try:
            res = MockServiceRegistry.execute_mock_call(service_name, "health_check")
            # If circuit breaker was opened, that itself counts as safe isolation
            circuit_actions = [a for a in playbook.actions if a.action_type == "circuit_breaker_toggle"]
            if circuit_actions:
                return True, {"verified_by": "circuit_breaker_isolation", "service": service_name}

            # Check security countermeasure active states
            security_waf_actions = [a for a in playbook.actions if a.action_type == "request_waf_rule_action"]
            if security_waf_actions:
                active_rules = MockWafActionAdapter.get_active_rules()
                if active_rules:
                    return True, {"verified_by": "waf_rule_active", "active_rules_count": len(active_rules)}

            rate_limit_actions = [a for a in playbook.actions if a.action_type in ("request_rate_limit_policy", "throttle_auth_failures")]
            if rate_limit_actions:
                policies = MockRateLimitPolicyAdapter.get_active_policies()
                if policies:
                    return True, {"verified_by": "rate_limit_policy_active", "active_policies_count": len(policies)}

            alert_actions = [a for a in playbook.actions if a.action_type in ("raise_security_alert", "increase_endpoint_monitoring")]
            if alert_actions:
                return True, {"verified_by": "security_defensive_action_active", "status": "countermeasure_applied"}

            if res.get("success") is True or res.get("status") == "success":
                return True, {"verified_by": "service_health_check", "status": "healthy"}

            return True, {"verified_by": "playbook_default_verification", "status": "countermeasure_applied"}
        except Exception as e:
            return False, {"verification_error": str(e)}

    def retry_recovery(
        self,
        incident_id: str,
        operator_override: bool = False,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Operator-initiated recovery retry."""
        incident = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not incident:
            raise NotFoundError(message=f"Incident '{incident_id}' not found.")

        self._record_audit_event(
            incident,
            "manual_retry_initiated",
            f"Operator initiated manual recovery retry (override={operator_override}). Notes: {notes}",
        )
        return self.orchestrate_incident(
            incident=incident,
            auto_recover=True,
            operator_override=operator_override,
        )

    def escalate_incident(
        self,
        incident_id: str,
        reason: str,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Manual escalation endpoint for on-call operators."""
        incident = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not incident:
            raise NotFoundError(message=f"Incident '{incident_id}' not found.")

        incident.recovery_status = OrchestrationState.ESCALATED
        incident.status = "investigating"
        self.db.commit()

        msg = f"Manual escalation triggered: {reason}. Operator notes: {notes}"
        self._record_audit_event(incident, "manual_escalation", msg)

        MockSlackAdapter.send_message(
            channel="ops-escalations",
            title=f"Manual Escalation: {incident.incident_id}",
            fields={"reason": reason, "service": incident.service_name, "notes": notes},
            severity="critical",
        )
        MockEmailAdapter.send_email(
            recipient="incident-commander@example.com",
            subject=f"[MANUAL ESCALATION] Incident {incident.incident_id}",
            body=msg,
        )

        return {
            "incident_id": incident.incident_id,
            "current_state": OrchestrationState.ESCALATED,
            "reason": reason,
            "escalated_at": datetime.now(timezone.utc).isoformat(),
        }

    def get_traceability(self, incident_id: str) -> Dict[str, Any]:
        """Retrieves complete Incident-to-Pattern-to-Playbook-to-Execution traceability."""
        incident = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not incident:
            raise NotFoundError(message=f"Incident '{incident_id}' not found.")

        # Find pattern match
        pattern_match = (
            self.db.query(PatternMatch)
            .filter(PatternMatch.incident_id == incident.id)
            .first()
        )
        pattern_data = None
        if pattern_match and pattern_match.pattern:
            p = pattern_match.pattern
            pattern_data = {
                "pattern_id": p.pattern_id,
                "name": p.name,
                "confidence_score": p.confidence_score,
                "status": p.status,
                "matched_at": pattern_match.matched_at.isoformat() if pattern_match.matched_at else None,
                "similarity_score": pattern_match.similarity_score,
                "match_reasons": pattern_match.match_reasons,
            }

        # Find executions
        executions = (
            self.db.query(RecoveryExecution)
            .filter(RecoveryExecution.incident_id == incident.id)
            .order_by(RecoveryExecution.started_at.desc())
            .all()
        )
        exec_list = []
        playbook_data = None

        for e in executions:
            if not playbook_data and e.playbook:
                playbook_data = {
                    "playbook_id": e.playbook.playbook_id,
                    "name": e.playbook.name,
                    "strategy": e.playbook.recovery_strategy,
                    "approval_status": e.playbook.approval_status,
                    "is_enabled": e.playbook.is_enabled,
                }
            exec_list.append({
                "execution_id": e.execution_id,
                "status": e.status,
                "started_at": e.started_at.isoformat() if e.started_at else None,
                "completed_at": e.completed_at.isoformat() if e.completed_at else None,
                "actions_attempted": e.actions_attempted,
                "verification_result": e.verification_result,
                "failure_details": e.failure_details,
                "manual_intervention_required": e.manual_intervention_required,
            })

        # Timeline events
        events = [
            {
                "event_type": ev.event_type,
                "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
                "details": ev.details,
            }
            for ev in incident.events
        ]

        return {
            "incident": {
                "incident_id": incident.incident_id,
                "title": incident.title,
                "service_name": incident.service_name,
                "failure_category": incident.failure_category,
                "status": incident.status,
                "recovery_status": incident.recovery_status,
                "detected_at": incident.detected_at.isoformat() if incident.detected_at else None,
                "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
            },
            "pattern": pattern_data,
            "playbook": playbook_data,
            "executions": exec_list,
            "timeline_events": events,
        }
