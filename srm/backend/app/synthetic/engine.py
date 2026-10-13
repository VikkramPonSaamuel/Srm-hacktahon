from datetime import datetime, timedelta, timezone
import time
from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.sanitizer import sanitize_data
from app.models.execution import JourneyExecution, StepExecution
from app.models.health import ServiceHealthSnapshot
from app.models.incident import Incident, IncidentEvent
from app.models.journey import BusinessJourney, JourneyStep
from app.patterns.detector import RuleBasedPatternDetector
from app.synthetic.classifier import FailureClassifier
from app.synthetic.mocks import MockServiceRegistry
from app.synthetic.scenarios import SimulationScenario
from app.synthetic.templates import JourneyTemplate, get_template

logger = get_logger("app.synthetic.engine")


class SyntheticJourneyEngine:
    """Modular synthetic execution engine running business journeys in sequence,

    capturing step latencies, enforcing safety rules, and logging audit records.
    """

    def __init__(self, db: Session) -> None:
        self.db = db

    def execute_journey(
        self,
        journey_id: Optional[int] = None,
        template_id: Optional[str] = None,
        scenario: SimulationScenario = SimulationScenario.NONE,
        correlation_id: Optional[str] = None,
        environment: str = "development",
        max_retries_per_step: int = 1,
        auto_recover: bool = False,
    ) -> Dict[str, Any]:
        """Execute all configured steps in sequence, recording step executions,

        telemetry, and incidents on failure.
        """
        correlation_id = correlation_id or f"corr_{uuid.uuid4().hex[:16]}"
        execution_id = f"exec_synth_{uuid.uuid4().hex[:12]}"
        start_time = datetime.now(timezone.utc)
        monotonic_start = time.perf_counter()

        # 1. Resolve steps (either from database journey or predefined template)
        steps_config = []
        journey_record = None

        if journey_id is not None:
            journey_record = self.db.get(BusinessJourney, journey_id)
            if journey_record and journey_record.steps:
                steps_config = [
                    {
                        "id": s.id,
                        "name": s.step_name,
                        "order": s.step_order,
                        "service_name": s.service_name,
                        "timeout_ms": s.timeout_ms,
                        "is_required": s.is_required,
                    }
                    for s in sorted(journey_record.steps, key=lambda x: x.step_order)
                ]

        if not steps_config and template_id:
            tpl = get_template(template_id)
            if tpl:
                steps_config = [
                    {
                        "id": None,
                        "name": s.step_name,
                        "order": s.step_order,
                        "service_name": s.service_name,
                        "timeout_ms": s.timeout_ms,
                        "is_required": s.is_required,
                    }
                    for s in tpl.steps
                ]

        if not steps_config:
            # Default to full retail checkout template
            default_tpl = get_template("retail_checkout")
            steps_config = [
                {
                    "id": None,
                    "name": s.step_name,
                    "order": s.step_order,
                    "service_name": s.service_name,
                    "timeout_ms": s.timeout_ms,
                    "is_required": s.is_required,
                }
                for s in default_tpl.steps
            ]

        # 2. Persist JourneyExecution record
        journey_exec = JourneyExecution(
            execution_id=execution_id,
            journey_id=journey_record.id if journey_record else None,
            correlation_id=correlation_id,
            environment=environment,
            status="in_progress",
            started_at=start_time,
            is_demo=True,
        )
        self.db.add(journey_exec)
        self.db.flush()

        step_results: List[Dict[str, Any]] = []
        overall_status = "success"
        halted = False
        incident_created: Optional[Incident] = None
        matched_pattern_record: Optional[Any] = None

        logger.info(
            f"Starting synthetic journey execution '{execution_id}' with {len(steps_config)} steps [corr: {correlation_id}]"
        )

        # Generate a shared payment idempotency key for this journey execution run
        payment_idempotency_key = f"idem_{execution_id}_pay"

        # 3. Execute steps in sequential order
        for step in steps_config:
            if halted:
                break

            service_name = step["service_name"]
            step_name = step["name"]
            is_required = step["is_required"]
            journey_step_id = step.get("id")

            attempt = 0
            step_succeeded = False
            last_resp: Dict[str, Any] = {}
            step_start = datetime.now(timezone.utc)

            # Bounded retry loop (with strict payment safety checks)
            while attempt <= max_retries_per_step and not step_succeeded:
                attempt += 1

                resp = MockServiceRegistry.execute_mock_call(
                    service_name=service_name,
                    step_name=step_name,
                    scenario=scenario,
                    idempotency_key=payment_idempotency_key if "payment" in service_name else None,
                )
                last_resp = resp
                latency_ms = resp.get("latency_ms", 0.0)

                is_issue, failure_cat, severity, hypothesis = FailureClassifier.evaluate_step(
                    service_name=service_name,
                    step_response=resp,
                    is_required=is_required,
                )

                if not is_issue or failure_cat == "latency_sla_breach":
                    # Step succeeded within acceptable error boundary
                    step_succeeded = True
                else:
                    # SAFETY DIRECTIVE:
                    # If primary payment timed out, outcome is unknown! Do NOT retry blindly!
                    if failure_cat == "payment_timeout":
                        logger.warning(
                            f"Payment timeout detected on {service_name}. Blind retry prohibited for financial safety."
                        )
                        break  # Immediately break retry loop

                    if attempt <= max_retries_per_step:
                        logger.info(f"Retrying step '{step_name}' (attempt {attempt + 1})...")

            step_end = datetime.now(timezone.utc)
            duration_ms = round(last_resp.get("latency_ms", 0.0), 2)
            step_status = "success" if step_succeeded else ("timed_out" if last_resp.get("status") == "timed_out" else "failed")

            # Persist StepExecution
            step_exec = StepExecution(
                journey_execution_id=journey_exec.id,
                journey_step_id=journey_step_id,
                status=step_status,
                started_at=step_start,
                completed_at=step_end,
                duration_ms=duration_ms,
                latency_ms=duration_ms,
                http_status=last_resp.get("http_status"),
                error_code=last_resp.get("error_code"),
                failure_category=last_resp.get("failure_category"),
                retry_count=attempt - 1,
                diagnostic_data=sanitize_data(last_resp.get("error_details") or last_resp.get("response_data")),
            )
            self.db.add(step_exec)
            self.db.flush()

            # Record ServiceHealthSnapshot for telemetry observation
            self.db.add(
                ServiceHealthSnapshot(
                    service_name=service_name,
                    status="degraded" if not step_succeeded else "healthy",
                    response_latency_ms=duration_ms,
                    error_rate=0.0 if step_succeeded else 1.0,
                    timestamp=step_end,
                    details={"correlation_id": correlation_id, "step": step_name},
                    is_demo=True,
                )
            )

            step_summary = {
                "step_order": step["order"],
                "step_name": step_name,
                "service_name": service_name,
                "status": step_status,
                "latency_ms": duration_ms,
                "http_status": last_resp.get("http_status"),
                "attempts": attempt,
                "failure_category": last_resp.get("failure_category"),
                "correlation_id": correlation_id,
            }
            step_results.append(step_summary)

            # If step failed and was required, halt journey and create Incident
            if not step_succeeded:
                overall_status = "failed"
                if is_required:
                    halted = True

                # Create Incident
                is_issue, failure_cat, severity, hypothesis = FailureClassifier.evaluate_step(
                    service_name=service_name,
                    step_response=last_resp,
                    is_required=is_required,
                )
                inc = Incident(
                    incident_id=f"inc_{uuid.uuid4().hex[:12]}",
                    journey_execution_id=journey_exec.id,
                    step_execution_id=step_exec.id,
                    journey_id=journey_record.id if journey_record else None,
                    service_name=service_name,
                    incident_type="transaction_failure",
                    severity=severity or "high",
                    title=f"Synthetic Failure in {step_name} [{service_name}]",
                    description=sanitize_data(
                        f"Synthetic monitoring detected failure in step '{step_name}': "
                        f"{last_resp.get('error_code')} - {last_resp.get('error_details')}"
                    ),
                    status="open",
                    failure_category=failure_cat,
                    root_cause_hypothesis=hypothesis,
                    recovery_status="not_started",
                    detected_at=step_end,
                    is_demo=True,
                )
                self.db.add(inc)
                self.db.flush()

                # Record initial timeline event
                self.db.add(
                    IncidentEvent(
                        incident_id=inc.id,
                        event_type="detected",
                        timestamp=step_end,
                        details=sanitize_data(
                            {
                                "execution_id": execution_id,
                                "correlation_id": correlation_id,
                                "latency_ms": duration_ms,
                                "http_status": last_resp.get("http_status"),
                            }
                        ),
                        correlation_id=correlation_id,
                    )
                )
                incident_created = inc
                logger.warning(
                    f"Created incident {inc.incident_id} for failed step '{step_name}' on {service_name}"
                )

                # Trigger recurring failure pattern detection
                detector = RuleBasedPatternDetector(self.db)
                matched_pattern_record = detector.evaluate_incident(inc)
                if matched_pattern_record:
                    logger.info(
                        f"Incident {inc.incident_id} linked to failure pattern '{matched_pattern_record.name}' [status: {matched_pattern_record.status}]"
                    )

        # Optional end-to-end recovery orchestration
        orchestration_result = None
        if incident_created and auto_recover:
            from app.orchestrator.service import RecoveryOrchestrator
            orchestrator = RecoveryOrchestrator(self.db)
            orchestration_result = orchestrator.orchestrate_incident(
                incident=incident_created,
                auto_recover=True,
                idempotency_key=payment_idempotency_key,
            )

        # 4. Finalize JourneyExecution
        total_duration_ms = round((time.perf_counter() - monotonic_start) * 1000, 2)
        completed_at = datetime.now(timezone.utc)
        journey_exec.status = overall_status
        journey_exec.completed_at = completed_at
        journey_exec.duration_ms = total_duration_ms
        self.db.commit()

        logger.info(
            f"Completed synthetic journey '{execution_id}' with status '{overall_status}' in {total_duration_ms}ms"
        )

        return {
            "execution_id": execution_id,
            "journey_id": journey_record.id if journey_record else None,
            "correlation_id": correlation_id,
            "environment": environment,
            "status": overall_status,
            "scenario": scenario.value,
            "started_at": start_time,
            "completed_at": completed_at,
            "duration_ms": total_duration_ms,
            "total_steps": len(steps_config),
            "executed_steps_count": len(step_results),
            "step_results": step_results,
            "incident": {
                "incident_id": incident_created.incident_id,
                "title": incident_created.title,
                "severity": incident_created.severity,
                "failure_category": incident_created.failure_category,
            }
            if incident_created
            else None,
            "matched_pattern": {
                "pattern_id": matched_pattern_record.pattern_id,
                "name": matched_pattern_record.name,
                "confidence_score": matched_pattern_record.confidence_score,
                "incident_count": matched_pattern_record.incident_count,
                "status": matched_pattern_record.status,
            }
            if matched_pattern_record
            else None,
            "recovery_orchestration": orchestration_result,
        }
