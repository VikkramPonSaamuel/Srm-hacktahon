from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimiter
from app.core.security import UserRole, require_role
from app.db.session import get_db
from app.schemas.incident import (
    IncidentCreate,
    IncidentDetailResponse,
    IncidentEventCreate,
    IncidentEventResponse,
    IncidentResponse,
    IncidentUpdate,
    RetryRecoveryRequest,
    EscalateIncidentRequest,
)
from app.schemas.pagination import PaginatedResponse
from app.services.incident_service import IncidentService

router = APIRouter()


@router.post(
    "",
    response_model=IncidentDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record Incident",
    description="Logs a detected transaction failure, anomaly, or recovery incident.",
)
def record_incident(
    payload: IncidentCreate,
    db: Session = Depends(get_db),
) -> IncidentDetailResponse:
    service = IncidentService(db)
    return service.record_incident(payload)


@router.get(
    "",
    response_model=PaginatedResponse[IncidentResponse],
    summary="List and Filter Incidents",
    description="Queries historical failure incidents with rich filtering by severity, status, journey, failure category, service, and date range.",
)
def list_incidents(
    skip: int = Query(0, ge=0, description="Offset index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    severity: Optional[str] = Query(None, description="Filter by severity (low, medium, high, critical)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (open, investigating, mitigated, resolved, closed)"),
    journey_id: Optional[int] = Query(None, description="Filter by journey ID"),
    failure_category: Optional[str] = Query(None, description="Filter by failure category"),
    service_name: Optional[str] = Query(None, description="Filter by affected service name"),
    start_date: Optional[datetime] = Query(None, description="Filter detection start timestamp (UTC)"),
    end_date: Optional[datetime] = Query(None, description="Filter detection end timestamp (UTC)"),
    sort_by: str = Query("detected_at", description="Field to sort by"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order ('asc' or 'desc')"),
    db: Session = Depends(get_db),
) -> PaginatedResponse[IncidentResponse]:
    service = IncidentService(db)
    return service.list_incidents(
        skip=skip,
        limit=limit,
        severity=severity,
        status=status_filter,
        journey_id=journey_id,
        failure_category=failure_category,
        service_name=service_name,
        start_date=start_date,
        end_date=end_date,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get(
    "/{incident_id}",
    response_model=IncidentDetailResponse,
    summary="Get Incident Details",
    description="Retrieves incident information and its full chronological event timeline.",
)
def get_incident(
    incident_id: str,
    db: Session = Depends(get_db),
) -> IncidentDetailResponse:
    service = IncidentService(db)
    return service.get_incident(incident_id)


@router.patch(
    "/{incident_id}",
    response_model=IncidentDetailResponse,
    summary="Update Incident Status or Resolution",
    description="Updates status, severity, root-cause hypothesis, or resolution summary of an incident.",
)
def update_incident(
    incident_id: str,
    payload: IncidentUpdate,
    db: Session = Depends(get_db),
) -> IncidentDetailResponse:
    service = IncidentService(db)
    return service.update_incident(incident_id, payload)


@router.post(
    "/{incident_id}/events",
    response_model=IncidentEventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add Incident Event",
    description="Appends a new chronological event or investigation note to the incident timeline.",
)
def add_incident_event(
    incident_id: str,
    payload: IncidentEventCreate,
    db: Session = Depends(get_db),
) -> IncidentEventResponse:
    service = IncidentService(db)
    return service.add_event(incident_id, payload)


@router.get(
    "/{incident_id}/events",
    response_model=List[IncidentEventResponse],
    summary="Retrieve Incident Timeline",
    description="Retrieves the complete chronological audit log of events for an incident.",
)
def get_incident_timeline(
    incident_id: str,
    db: Session = Depends(get_db),
) -> List[IncidentEventResponse]:
    service = IncidentService(db)
    return service.get_timeline(incident_id)


@router.get(
    "/{incident_id}/lifecycle",
    summary="Retrieve Unified Cross-Module Incident Lifecycle",
    description="Retrieves structured incident lifecycle milestones across all three modules.",
)
def get_incident_lifecycle(
    incident_id: str,
    db: Session = Depends(get_db),
) -> Any:
    service = IncidentService(db)
    return service.get_unified_lifecycle(incident_id)


@router.post(
    "/{incident_id}/retry-recovery",
    summary="Manual Recovery Retry",
    description="Operator-initiated recovery retry. Can override cooldown and retry limits if operator_override=True.",
)
def retry_recovery(
    incident_id: str,
    payload: RetryRecoveryRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.OPERATOR)),
    _rate_limit=Depends(RateLimiter(requests_limit=30, window_seconds=60)),
):
    from app.orchestrator.service import RecoveryOrchestrator
    orchestrator = RecoveryOrchestrator(db)
    return orchestrator.retry_recovery(
        incident_id=incident_id,
        operator_override=payload.operator_override,
        notes=payload.notes,
    )


@router.post(
    "/{incident_id}/escalate",
    summary="Manual Incident Escalation",
    description="Transitions an incident to ESCALATED status and dispatches urgent notifications to on-call operators.",
)
def escalate_incident(
    incident_id: str,
    payload: EscalateIncidentRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.OPERATOR)),
    _rate_limit=Depends(RateLimiter(requests_limit=30, window_seconds=60)),
):
    from app.orchestrator.service import RecoveryOrchestrator
    orchestrator = RecoveryOrchestrator(db)
    return orchestrator.escalate_incident(
        incident_id=incident_id,
        reason=payload.reason,
        notes=payload.notes,
    )


@router.get(
    "/{incident_id}/traceability",
    summary="Incident-to-Pattern-to-Playbook Traceability",
    description="Retrieves full end-to-end trace mapping the incident to recognized patterns, playbooks, executions, and audit timeline.",
)
def get_incident_traceability(
    incident_id: str,
    db: Session = Depends(get_db),
):
    from app.orchestrator.service import RecoveryOrchestrator
    orchestrator = RecoveryOrchestrator(db)
    return orchestrator.get_traceability(incident_id)
