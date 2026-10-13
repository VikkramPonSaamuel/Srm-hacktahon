from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.core.time import to_utc
from app.investigations.safety import sanitize_untrusted_structure
from app.models.execution import JourneyExecution, StepExecution
from app.models.health import ServiceHealthSnapshot
from app.models.incident import Incident
from app.models.pattern import PatternMatch
from app.models.playbook import RecoveryExecution
from app.schemas.investigation import IncidentEvidence


class IncidentEvidenceCollector:
    """Collects, aggregates, and sanitizes multi-source telemetry evidence for an incident."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def collect(self, incident_id: str) -> IncidentEvidence:
        inc = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not inc:
            raise NotFoundError(f"Incident with ID '{incident_id}' not found.")

        # 1. Journey & Failed Step Telemetry
        journey_name = inc.journey.name if inc.journey else None
        journey_type = inc.journey.journey_type if inc.journey else None

        failed_step_data: Optional[Dict[str, Any]] = None
        all_step_executions_data: List[Dict[str, Any]] = []

        if inc.journey_execution:
            je = inc.journey_execution
            for se in je.step_executions:
                step_name = se.journey_step.step_name if se.journey_step else "Unknown Step"
                step_svc = se.journey_step.service_name if se.journey_step else (inc.service_name or "unknown")
                step_order = se.journey_step.step_order if se.journey_step else 1
                step_type = se.journey_step.step_type if se.journey_step else "api_call"

                s_dict = {
                    "step_id": se.id,
                    "step_name": step_name,
                    "service_name": step_svc,
                    "step_order": step_order,
                    "step_type": step_type,
                    "status": se.status,
                    "latency_ms": se.latency_ms,
                    "duration_ms": se.duration_ms,
                    "http_status": se.http_status,
                    "error_code": se.error_code,
                    "failure_category": se.failure_category,
                    "diagnostic_data": se.diagnostic_data or {},
                }
                all_step_executions_data.append(s_dict)
                if inc.step_execution_id and se.id == inc.step_execution_id:
                    failed_step_data = s_dict
                elif not failed_step_data and se.status in ["failed", "timed_out"]:
                    failed_step_data = s_dict

        # 2. Service Health Snapshots around incident detection
        det_time = to_utc(inc.detected_at) or datetime.now(timezone.utc)
        window_start = det_time - timedelta(minutes=15)
        window_end = det_time + timedelta(minutes=15)

        snaps_query = self.db.query(ServiceHealthSnapshot).filter(
            ServiceHealthSnapshot.timestamp >= window_start,
            ServiceHealthSnapshot.timestamp <= window_end,
        )
        if inc.service_name:
            snaps_query = snaps_query.filter(ServiceHealthSnapshot.service_name == inc.service_name)
        snaps = snaps_query.order_by(ServiceHealthSnapshot.timestamp.desc()).limit(10).all()

        health_data = [
            {
                "snapshot_id": s.id,
                "service_name": s.service_name,
                "status": s.status,
                "response_latency_ms": s.response_latency_ms,
                "error_rate": s.error_rate,
                "timestamp": s.timestamp.isoformat(),
            }
            for s in snaps
        ]

        # 3. Known Pattern Matches
        matches = self.db.query(PatternMatch).filter(PatternMatch.incident_id == inc.id).all()
        matches_data = [
            {
                "pattern_id": m.pattern.pattern_id if m.pattern else "unknown",
                "pattern_name": m.pattern.name if m.pattern else "Unknown",
                "similarity_score": round(m.similarity_score, 2),
                "matched_at": m.matched_at.isoformat() if m.matched_at else None,
                "match_reasons": m.match_reasons,
            }
            for m in matches
        ]

        # 4. Recovery History
        rec_execs = self.db.query(RecoveryExecution).filter(
            or_(
                RecoveryExecution.incident_id == inc.id,
                RecoveryExecution.incident_ref == inc.incident_id,
            )
        ).all()
        recovery_data = [
            {
                "execution_id": re.execution_id,
                "playbook_id": re.playbook.playbook_id if re.playbook else None,
                "playbook_name": re.playbook.name if re.playbook else "Unknown",
                "strategy": re.playbook.recovery_strategy if re.playbook else None,
                "status": re.status,
                "actions_attempted": re.actions_attempted,
                "result": re.result,
                "verification_result": re.verification_result,
            }
            for re in rec_execs
        ]

        # 5. Similar Historical Incidents
        hist_inc_query = self.db.query(Incident).filter(
            Incident.id != inc.id,
            or_(
                Incident.failure_category == inc.failure_category,
                Incident.service_name == inc.service_name,
            ),
        ).order_by(Incident.detected_at.desc()).limit(5).all()

        similar_inc_data = [
            {
                "incident_id": hi.incident_id,
                "title": hi.title,
                "severity": hi.severity,
                "service_name": hi.service_name,
                "failure_category": hi.failure_category,
                "status": hi.status,
                "detected_at": hi.detected_at.isoformat() if hi.detected_at else None,
                "resolution_summary": hi.resolution_summary,
            }
            for hi in hist_inc_query
        ]

        # 6. Untrusted diagnostics payload
        untrusted_payload = {
            "title": inc.title,
            "description": inc.description,
            "root_cause_hypothesis": inc.root_cause_hypothesis,
            "failed_step": failed_step_data,
        }

        raw_evidence = IncidentEvidence(
            incident_id=inc.incident_id,
            detected_at=inc.detected_at,
            severity=inc.severity,
            title=inc.title,
            description=inc.description,
            service_name=inc.service_name,
            failure_category=inc.failure_category,
            journey_name=journey_name,
            journey_type=journey_type,
            failed_step=failed_step_data,
            all_step_executions=all_step_executions_data,
            service_health_snapshots=health_data,
            pattern_matches=matches_data,
            recovery_executions=recovery_data,
            similar_historical_incidents=similar_inc_data,
            untrusted_diagnostics=untrusted_payload,
        )

        # Sanitize all collected evidence before returning to ensure safety
        sanitized_dict = sanitize_untrusted_structure(raw_evidence.model_dump())
        return IncidentEvidence.model_validate(sanitized_dict)
