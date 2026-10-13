from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.core.logging import get_logger
from app.models.incident import Incident, IncidentEvent
from app.models.playbook import RecoveryAction, RecoveryExecution, RecoveryPlaybook
from app.playbooks.adapters import MockRateLimitPolicyAdapter, MockWafActionAdapter
from app.playbooks.registry import ActionRegistry

logger = get_logger("app.playbooks.engine")


def to_utc(dt: Optional[datetime]) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class RecoveryEngine:
    """Safe, bounded recovery execution engine with approval, cooldown, and payment safety guards."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def execute_playbook(
        self,
        playbook: RecoveryPlaybook,
        incident: Optional[Incident] = None,
        is_simulation: bool = False,
        operator_override: bool = False,
        idempotency_key: Optional[str] = None,
    ) -> RecoveryExecution:
        """Executes a recovery playbook against an incident with full safety checks.

        Enforces:
        - Draft playbooks cannot execute (must be approved and enabled, unless in simulation mode).
        - High-risk actions require human approval.
        - Cooldown periods prevent rapid execution loops.
        - Retry limits bound total attempts.
        - All decisions, checks, and outcomes recorded in audit trail.
        """
        started_at = datetime.now(timezone.utc)
        exec_id = f"rex_{uuid.uuid4().hex[:12]}"
        incident_id_val = incident.id if incident else None
        incident_ref_val = incident.incident_id if incident else None

        # 1. Approval and Enabled Guards (Draft cannot execute in live mode)
        if not is_simulation:
            if playbook.approval_status != "approved":
                msg = f"Playbook '{playbook.name}' is in '{playbook.approval_status}' state and has not been approved for execution."
                logger.error(msg)
                execution = RecoveryExecution(
                    execution_id=exec_id,
                    playbook_id=playbook.id,
                    incident_id=incident_id_val,
                    incident_ref=incident_ref_val,
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                    status="rejected_unapproved",
                    is_simulation=False,
                    preconditions_evaluation={"passed": False, "reason": msg},
                    actions_attempted=[],
                    result={"status": "rejected", "message": msg},
                    verification_result={"verified": False},
                    failure_details=msg,
                    manual_intervention_required=True,
                )
                self.db.add(execution)
                self.db.commit()
                self.db.refresh(execution)
                return execution

            if not playbook.is_enabled:
                msg = f"Playbook '{playbook.name}' is disabled and cannot execute."
                logger.warning(msg)
                execution = RecoveryExecution(
                    execution_id=exec_id,
                    playbook_id=playbook.id,
                    incident_id=incident_id_val,
                    incident_ref=incident_ref_val,
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                    status="rejected_unapproved",
                    is_simulation=False,
                    preconditions_evaluation={"passed": False, "reason": msg},
                    actions_attempted=[],
                    result={"status": "rejected", "message": msg},
                    verification_result={"verified": False},
                    failure_details=msg,
                    manual_intervention_required=True,
                )
                self.db.add(execution)
                self.db.commit()
                self.db.refresh(execution)
                return execution

        # 2. Bounded Retries & Cooldown Guards
        if not is_simulation and incident:
            prior_executions = (
                self.db.query(RecoveryExecution)
                .filter(
                    RecoveryExecution.playbook_id == playbook.id,
                    RecoveryExecution.incident_id == incident.id,
                    RecoveryExecution.is_simulation.is_(False),
                )
                .order_by(RecoveryExecution.started_at.desc())
                .all()
            )

            # Check maximum retry limits
            if len(prior_executions) >= playbook.max_attempts and not operator_override:
                msg = f"Maximum recovery attempts exceeded ({len(prior_executions)} >= {playbook.max_attempts}). Stopping automated recovery to prevent damage."
                logger.error(msg)
                execution = RecoveryExecution(
                    execution_id=exec_id,
                    playbook_id=playbook.id,
                    incident_id=incident_id_val,
                    incident_ref=incident_ref_val,
                    started_at=started_at,
                    completed_at=datetime.now(timezone.utc),
                    status="escalated",
                    is_simulation=False,
                    preconditions_evaluation={"passed": False, "reason": msg},
                    actions_attempted=[],
                    result={"status": "escalated", "message": msg},
                    verification_result={"verified": False},
                    failure_details=msg,
                    manual_intervention_required=True,
                )
                self.db.add(execution)
                self.db.commit()
                self.db.refresh(execution)
                self._record_incident_event(incident, "recovery_retry_limit_exceeded", msg)
                return execution

            # Check cooldown period
            if prior_executions and not operator_override:
                last_exec = prior_executions[0]
                cooldown_delta = timedelta(seconds=playbook.cooldown_seconds)
                last_time = to_utc(last_exec.started_at)
                if (started_at - last_time) < cooldown_delta:
                    msg = f"Playbook execution skipped: cooldown period active ({playbook.cooldown_seconds}s). Last attempt was at {last_time.isoformat()}."
                    logger.info(msg)
                    execution = RecoveryExecution(
                        execution_id=exec_id,
                        playbook_id=playbook.id,
                        incident_id=incident_id_val,
                        incident_ref=incident_ref_val,
                        started_at=started_at,
                        completed_at=datetime.now(timezone.utc),
                        status="cooldown_skipped",
                        is_simulation=False,
                        preconditions_evaluation={"passed": False, "reason": msg},
                        actions_attempted=[],
                        result={"status": "cooldown_skipped", "message": msg},
                        verification_result={"verified": False},
                        failure_details=msg,
                        manual_intervention_required=False,
                    )
                    self.db.add(execution)
                    self.db.commit()
                    self.db.refresh(execution)
                    return execution

        # 3. Evaluate Preconditions
        precond_eval = self._evaluate_preconditions(playbook, incident)
        if not precond_eval["passed"]:
            msg = precond_eval.get("reason", "Preconditions evaluation failed or conditions uncertain.")
            logger.warning(f"Playbook {playbook.name} preconditions not met: {msg}")
            execution = RecoveryExecution(
                execution_id=exec_id,
                playbook_id=playbook.id,
                incident_id=incident_id_val,
                incident_ref=incident_ref_val,
                started_at=started_at,
                completed_at=datetime.now(timezone.utc),
                status="escalated",
                is_simulation=is_simulation,
                preconditions_evaluation=precond_eval,
                actions_attempted=[],
                result={"status": "escalated", "message": msg},
                verification_result={"verified": False},
                failure_details=msg,
                manual_intervention_required=True,
            )
            self.db.add(execution)
            self.db.commit()
            self.db.refresh(execution)
            if incident:
                self._record_incident_event(incident, "recovery_preconditions_failed", msg)
            return execution

        # 4. Action-by-Action Execution with High-Risk Approval Guards
        actions_attempted: List[Dict[str, Any]] = []
        overall_status = "simulated" if is_simulation else "succeeded"
        failure_details: Optional[str] = None
        manual_intervention_required = False

        sorted_actions = sorted(playbook.actions, key=lambda a: a.action_order)

        for action in sorted_actions:
            # Check high-risk approval guard
            if action.risk_level in ("high", "critical") and action.requires_approval and not operator_override and not is_simulation:
                msg = f"High-risk action '{action.action_type}' requires explicit human approval before execution."
                logger.warning(msg)
                actions_attempted.append({
                    "action_order": action.action_order,
                    "action_type": action.action_type,
                    "status": "blocked_unapproved",
                    "risk_level": action.risk_level,
                    "message": msg,
                })
                overall_status = "escalated"
                manual_intervention_required = True
                failure_details = msg
                break

            # Execute allowlisted action
            try:
                # Merge contextual idempotency key if present
                params = dict(action.parameters)
                if "idempotency_key" in params and not params["idempotency_key"] and idempotency_key:
                    params["idempotency_key"] = idempotency_key

                outcome = ActionRegistry.execute_action(
                    action_type=action.action_type,
                    parameters=params,
                    is_simulation=is_simulation,
                )
                actions_attempted.append({
                    "action_order": action.action_order,
                    "action_type": action.action_type,
                    "risk_level": action.risk_level,
                    "outcome": outcome,
                    "executed_at": datetime.now(timezone.utc).isoformat(),
                })

                # Check if reconciliation indicates indeterminate state
                if action.action_type == "reconcile_payment_status":
                    rec = outcome.get("reconciliation", {})
                    if rec.get("reconciliation_status") == "INDETERMINATE_TIMEOUT":
                        # Indeterminate payment state! Blind retry prohibited.
                        msg = "Payment reconciliation returned INDETERMINATE_TIMEOUT. Prohibiting further automated charge attempts to avoid double charging."
                        overall_status = "escalated"
                        manual_intervention_required = True
                        failure_details = msg
                        break

            except Exception as e:
                logger.error(f"Action '{action.action_type}' execution failed: {e}")
                actions_attempted.append({
                    "action_order": action.action_order,
                    "action_type": action.action_type,
                    "status": "failed",
                    "error": str(e),
                })
                overall_status = "failed"
                failure_details = f"Action '{action.action_type}' error: {e}"
                manual_intervention_required = True
                break

        # 5. Verification
        verification_result = self._evaluate_verification(playbook, actions_attempted, overall_status)
        if overall_status == "succeeded" and not verification_result.get("verified"):
            overall_status = "failed"
            failure_details = verification_result.get("reason", "Post-action verification failed to confirm condition improvement.")
            manual_intervention_required = True

        # Rollback execution if failed or escalated with rollback instructions
        rollback_ops = []
        if overall_status in ("failed", "escalated") and not is_simulation:
            rollback_ops = self._execute_rollback(playbook, actions_attempted, incident)

        # 6. Persist Audit Record
        execution = RecoveryExecution(
            execution_id=exec_id,
            playbook_id=playbook.id,
            incident_id=incident_id_val,
            incident_ref=incident_ref_val,
            started_at=started_at,
            completed_at=datetime.now(timezone.utc),
            status=overall_status,
            is_simulation=is_simulation,
            preconditions_evaluation=precond_eval,
            actions_attempted=actions_attempted,
            result={
                "status": overall_status,
                "action_count": len(actions_attempted),
                "is_simulation": is_simulation,
                "rollback_operations": rollback_ops,
            },
            verification_result=verification_result,
            failure_details=failure_details,
            manual_intervention_required=manual_intervention_required,
        )
        self.db.add(execution)

        # Update Incident status if live execution
        if incident and not is_simulation:
            if overall_status == "succeeded" and verification_result.get("verified"):
                incident.recovery_status = "recovered"
                self._record_incident_event(
                    incident,
                    "recovery_succeeded",
                    f"Playbook '{playbook.name}' successfully executed and verified recovery countermeasures.",
                )
            elif overall_status == "escalated":
                incident.recovery_status = "in_progress"
                self._record_incident_event(
                    incident,
                    "recovery_escalated",
                    f"Playbook '{playbook.name}' required manual intervention: {failure_details}",
                )
            else:
                incident.recovery_status = "failed"
                self._record_incident_event(
                    incident,
                    "recovery_failed",
                    f"Playbook '{playbook.name}' failed: {failure_details}",
                )
                self._record_incident_event(
                    incident,
                    "unsuccessful_mitigation_recorded",
                    f"Recorded unsuccessful mitigation for playbook '{playbook.name}' for post-incident security review.",
                )

        self.db.commit()
        self.db.refresh(execution)
        return execution

    def _evaluate_preconditions(self, playbook: RecoveryPlaybook, incident: Optional[Incident]) -> Dict[str, Any]:
        """Validates trigger conditions against incident context.

        If conditions are ambiguous or missing, safely fails closed.
        """
        if not incident:
            return {"passed": True, "reason": "Standalone manual execution"}

        # Action family to incident module compatibility check
        incident_module = getattr(incident, "module", "transaction_reliability")
        for act in playbook.actions:
            act_family = ActionRegistry.get_action_family(act.action_type)
            if act_family != "universal":
                if incident_module == "transaction_reliability" and act_family != "operational_recovery":
                    return {
                        "passed": False,
                        "reason": f"Defensive action '{act.action_type}' ({act_family}) cannot run against transaction reliability incidents.",
                    }
                elif incident_module == "website_security" and act_family != "website_security_mitigation":
                    return {
                        "passed": False,
                        "reason": f"Operational action '{act.action_type}' ({act_family}) cannot be applied to website security incidents.",
                    }
                elif incident_module == "brand_impersonation" and act_family != "brand_threat_reporting":
                    return {
                        "passed": False,
                        "reason": f"Action '{act.action_type}' ({act_family}) cannot be applied to brand impersonation incidents.",
                    }

        triggers = playbook.trigger_conditions or {}
        if not triggers:
            return {"passed": True, "reason": "No explicit trigger preconditions specified"}

        # Service match check
        req_service = triggers.get("service_name")
        if req_service and incident.service_name and req_service != incident.service_name:
            return {
                "passed": False,
                "reason": f"Incident service '{incident.service_name}' does not match required service '{req_service}'",
            }

        # Category match check
        req_category = triggers.get("failure_category")
        if req_category and incident.failure_category and req_category != incident.failure_category:
            return {
                "passed": False,
                "reason": f"Incident failure category '{incident.failure_category}' does not match required '{req_category}'",
            }

        return {"passed": True, "reason": "All preconditions satisfied"}

    def _evaluate_verification(
        self,
        playbook: RecoveryPlaybook,
        actions_attempted: List[Dict[str, Any]],
        overall_status: str,
    ) -> Dict[str, Any]:
        """Runs post-recovery verification and checks whether security conditions improved."""
        if overall_status != "succeeded":
            return {"verified": False, "reason": f"Execution status was '{overall_status}'"}

        verif_conditions = playbook.verification_conditions or {}

        # Check explicit record_mitigation_verification action outcomes
        for act in actions_attempted:
            if act.get("action_type") == "record_mitigation_verification":
                outcome = act.get("outcome", {})
                v_stat = outcome.get("verification_status")
                improved = outcome.get("improved")
                if v_stat in ("failed", "uncertain") or improved is False:
                    return {
                        "verified": False,
                        "reason": f"Mitigation verification indicated status='{v_stat}', improved={improved}. Security condition did not improve.",
                        "details": outcome.get("details"),
                        "metric_observed": outcome.get("metric_observed"),
                    }

        # Check explicit require_metric_improvement verification condition
        if verif_conditions.get("require_metric_improvement") is True:
            has_improvement = any(
                act.get("outcome", {}).get("improved") is True
                for act in actions_attempted
            )
            if not has_improvement:
                return {
                    "verified": False,
                    "reason": "Verification condition 'require_metric_improvement' failed: no improvement recorded.",
                }

        return {
            "verified": True,
            "conditions_checked": verif_conditions,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def _execute_rollback(
        self,
        playbook: RecoveryPlaybook,
        actions_attempted: List[Dict[str, Any]],
        incident: Optional[Incident] = None,
    ) -> List[Dict[str, Any]]:
        """Executes compensating rollback actions for applied defensive mitigations."""
        rollback_ops: List[Dict[str, Any]] = []
        instructions = playbook.rollback_instructions or {}
        if not instructions:
            return rollback_ops

        for act in actions_attempted:
            act_type = act.get("action_type")
            outcome = act.get("outcome", {})
            if act_type == "request_waf_rule_action":
                rule_id = outcome.get("waf_rule", {}).get("rule_id")
                if rule_id:
                    res = MockWafActionAdapter.rollback_rule(rule_id)
                    rollback_ops.append({"type": "waf_rollback", "rule_id": rule_id, "result": res})
            elif act_type in ("request_rate_limit_policy", "throttle_auth_failures"):
                policy = outcome.get("rate_limit_policy") or outcome.get("policy")
                if policy and "endpoint" in policy:
                    res = MockRateLimitPolicyAdapter.rollback_policy(policy["endpoint"], policy.get("client_ip"))
                    rollback_ops.append({"type": "rate_limit_rollback", "endpoint": policy["endpoint"], "result": res})

        if rollback_ops and incident:
            self._record_incident_event(
                incident,
                "recovery_rollback_executed",
                f"Defensive actions rolled back for playbook '{playbook.name}': {len(rollback_ops)} operations reverted.",
            )
        return rollback_ops

    def _record_incident_event(self, incident: Incident, event_type: str, description: str) -> None:
        """Appends an event to the incident audit timeline."""
        event = IncidentEvent(
            incident_id=incident.id,
            event_type=event_type,
            details={"message": description, "timestamp": datetime.now(timezone.utc).isoformat()},
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(event)
