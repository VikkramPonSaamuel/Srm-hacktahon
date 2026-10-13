from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.execution import JourneyExecution
from app.models.health import ServiceHealthSnapshot
from app.schemas.execution import StepExecutionResponse
from app.schemas.service_health import ServiceHealthSnapshotResponse
from app.schemas.synthetic import (
    DemonstrateWorkflowRequest,
    JourneyTemplateResponse,
    SimulateFailureRequest,
    StartSyntheticJourneyRequest,
    SyntheticJourneyStatusResponse,
)
from app.synthetic.engine import SyntheticJourneyEngine
from app.synthetic.scenarios import SimulationScenario
from app.synthetic.templates import list_templates
from app.synthetic.thresholds import (
    MonitoringThresholds,
    get_monitoring_thresholds,
    update_monitoring_thresholds,
)

router = APIRouter()


@router.post(
    "/start",
    response_model=SyntheticJourneyStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Start a Synthetic Journey Execution",
    description="Executes a complete synthetic customer journey sequentially across mock business services.",
)
def start_synthetic_journey(
    payload: StartSyntheticJourneyRequest,
    db: Session = Depends(get_db),
) -> SyntheticJourneyStatusResponse:
    if payload.scenario != SimulationScenario.NONE and settings.ENVIRONMENT not in ("development", "testing"):
        raise BadRequestError(
            message=f"Failure injection '{payload.scenario.value}' is disallowed in {settings.ENVIRONMENT}."
        )

    engine = SyntheticJourneyEngine(db)
    result = engine.execute_journey(
        journey_id=payload.journey_id,
        template_id=payload.template_id,
        scenario=payload.scenario,
        correlation_id=payload.correlation_id,
        environment=payload.environment,
        max_retries_per_step=payload.max_retries_per_step,
    )
    return SyntheticJourneyStatusResponse.model_validate(result)


@router.get(
    "/executions/{execution_id}/status",
    summary="Retrieve Execution Status",
    description="Retrieves the high-level status, duration, and completion details for a synthetic journey run.",
)
def get_execution_status(
    execution_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    exec_record = db.query(JourneyExecution).filter(JourneyExecution.execution_id == execution_id).first()
    if not exec_record:
        raise NotFoundError(message=f"Synthetic execution '{execution_id}' not found.")

    return {
        "execution_id": exec_record.execution_id,
        "journey_id": exec_record.journey_id,
        "correlation_id": exec_record.correlation_id,
        "status": exec_record.status,
        "environment": exec_record.environment,
        "started_at": exec_record.started_at,
        "completed_at": exec_record.completed_at,
        "duration_ms": exec_record.duration_ms,
        "step_count": len(exec_record.step_executions),
        "incident_count": len(exec_record.incidents),
    }


@router.get(
    "/executions/{execution_id}/steps",
    response_model=List[StepExecutionResponse],
    summary="Retrieve Execution Step Results",
    description="Retrieves granular telemetry and diagnostic results for all steps executed during a synthetic run.",
)
def get_execution_steps(
    execution_id: str,
    db: Session = Depends(get_db),
) -> List[StepExecutionResponse]:
    exec_record = db.query(JourneyExecution).filter(JourneyExecution.execution_id == execution_id).first()
    if not exec_record:
        raise NotFoundError(message=f"Synthetic execution '{execution_id}' not found.")

    return [StepExecutionResponse.model_validate(s) for s in exec_record.step_executions]


@router.get(
    "/templates",
    response_model=List[JourneyTemplateResponse],
    summary="List Journey Templates",
    description="Lists predefined out-of-the-box synthetic business journey templates.",
)
def get_journey_templates() -> List[JourneyTemplateResponse]:
    templates = list_templates()
    return [JourneyTemplateResponse.model_validate(t.model_dump()) for t in templates]


@router.get(
    "/thresholds",
    response_model=MonitoringThresholds,
    summary="Get Monitoring Thresholds",
    description="Retrieves active SLA warning, critical, and timeout thresholds per service.",
)
def get_thresholds() -> MonitoringThresholds:
    return get_monitoring_thresholds()


@router.put(
    "/thresholds",
    response_model=MonitoringThresholds,
    summary="Configure Monitoring Thresholds",
    description="Updates in-memory SLA latency and timeout thresholds for synthetic service monitoring.",
)
def set_thresholds(
    payload: MonitoringThresholds,
) -> MonitoringThresholds:
    return update_monitoring_thresholds(payload)


@router.post(
    "/simulate-failure",
    response_model=SyntheticJourneyStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger Predefined Development Failure Simulation",
    description="Triggers a controlled synthetic failure scenario (development/testing environments only).",
)
def simulate_failure(
    payload: SimulateFailureRequest,
    db: Session = Depends(get_db),
) -> SyntheticJourneyStatusResponse:
    if settings.ENVIRONMENT not in ("development", "testing"):
        raise BadRequestError(
            message=f"Failure injection is disabled in {settings.ENVIRONMENT}. Switch to development/testing."
        )

    engine = SyntheticJourneyEngine(db)
    result = engine.execute_journey(
        journey_id=payload.journey_id,
        template_id=payload.template_id,
        scenario=payload.scenario,
        environment=settings.ENVIRONMENT,
        max_retries_per_step=1,
    )
    return SyntheticJourneyStatusResponse.model_validate(result)


@router.post(
    "/demonstrate-workflow",
    summary="Demonstrate End-to-End Monitoring, Detection & Recovery Workflow",
    description="Development mode endpoint that executes journey, records failure, identifies pattern, verifies playbook, executes countermeasures, and verifies resolution safely.",
)
def demonstrate_workflow(
    payload: DemonstrateWorkflowRequest,
    db: Session = Depends(get_db),
):
    if settings.ENVIRONMENT not in ("development", "testing"):
        raise BadRequestError(
            message=f"Demonstration mode is disabled in {settings.ENVIRONMENT}."
        )

    engine = SyntheticJourneyEngine(db)
    result = engine.execute_journey(
        template_id=payload.template_id,
        scenario=payload.scenario,
        environment=settings.ENVIRONMENT,
        max_retries_per_step=1,
        auto_recover=payload.auto_recover,
    )
    return result


@router.get(
    "/health-checks",
    response_model=List[ServiceHealthSnapshotResponse],
    summary="Retrieve Recent Service Health Checks",
    description="Returns the most recent service telemetry and health observation snapshots.",
)
def get_recent_health_checks(
    service_name: Optional[str] = Query(None, description="Filter by service name"),
    limit: int = Query(50, ge=1, le=100, description="Max snapshots to retrieve"),
    db: Session = Depends(get_db),
) -> List[ServiceHealthSnapshotResponse]:
    query = db.query(ServiceHealthSnapshot)
    if service_name:
        query = query.filter(ServiceHealthSnapshot.service_name == service_name)
    snapshots = query.order_by(ServiceHealthSnapshot.timestamp.desc()).limit(limit).all()
    return [ServiceHealthSnapshotResponse.model_validate(s) for s in snapshots]
