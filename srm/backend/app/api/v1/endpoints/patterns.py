from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, get_db
from app.schemas.incident import IncidentResponse
from app.schemas.pagination import PaginatedResponse
from app.schemas.pattern import (
    FailurePatternDetailResponse,
    FailurePatternResponse,
    PatternEvidenceResponse,
    PatternFrequencyResponse,
    PatternStatusUpdate,
    ReevaluateResponse,
)
from app.services.pattern_service import PatternService

router = APIRouter()


def _background_reevaluate(db: Session):
    """Background task function to re-evaluate patterns asynchronously without blocking API responses."""
    try:
        service = PatternService(db)
        service.reevaluate_patterns()
    except Exception:
        pass


@router.get(
    "",
    response_model=PaginatedResponse[FailurePatternResponse],
    summary="List and Filter Failure Patterns",
    description="Queries recognized recurring failure patterns with filtering by service, severity, status, category, and date range.",
)
def list_patterns(
    skip: int = Query(0, ge=0, description="Offset index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    service_name: Optional[str] = Query(None, description="Filter by service name"),
    severity: Optional[str] = Query(None, description="Filter by severity (low, medium, high, critical)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (candidate, confirmed, rejected, retired)"),
    failure_category: Optional[str] = Query(None, description="Filter by failure category"),
    start_date: Optional[datetime] = Query(None, description="Filter start date (UTC)"),
    end_date: Optional[datetime] = Query(None, description="Filter end date (UTC)"),
    db: Session = Depends(get_db),
) -> PaginatedResponse[FailurePatternResponse]:
    service = PatternService(db)
    return service.list_patterns(
        skip=skip,
        limit=limit,
        service_name=service_name,
        severity=severity,
        status=status_filter,
        failure_category=failure_category,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/{pattern_id}",
    response_model=FailurePatternDetailResponse,
    summary="Retrieve Failure Pattern Details",
    description="Retrieves comprehensive details for a failure pattern including detection rules, evidence incidents, and confidence scores.",
)
def get_pattern(
    pattern_id: str,
    db: Session = Depends(get_db),
) -> FailurePatternDetailResponse:
    service = PatternService(db)
    return service.get_pattern(pattern_id)


@router.get(
    "/{pattern_id}/incidents",
    response_model=List[IncidentResponse],
    summary="Retrieve Incidents Matching Pattern",
    description="Lists all historical incidents linked as evidence to this failure pattern.",
)
def get_pattern_incidents(
    pattern_id: str,
    db: Session = Depends(get_db),
) -> List[IncidentResponse]:
    service = PatternService(db)
    return service.get_pattern_incidents(pattern_id)


@router.get(
    "/{pattern_id}/frequency",
    response_model=PatternFrequencyResponse,
    summary="View Pattern Frequency Over Time",
    description="Returns temporal occurrence distribution and incident frequency buckets for a pattern.",
)
def get_pattern_frequency(
    pattern_id: str,
    db: Session = Depends(get_db),
) -> PatternFrequencyResponse:
    service = PatternService(db)
    return service.get_pattern_frequency(pattern_id)


@router.get(
    "/{pattern_id}/evidence",
    response_model=PatternEvidenceResponse,
    summary="Retrieve Matching Evidence & Explanations",
    description="Retrieves detection rules, match similarity scores, and deterministic explanations of why incidents matched this pattern.",
)
def get_pattern_evidence(
    pattern_id: str,
    db: Session = Depends(get_db),
) -> PatternEvidenceResponse:
    service = PatternService(db)
    return service.get_pattern_evidence(pattern_id)


@router.patch(
    "/{pattern_id}/status",
    response_model=FailurePatternResponse,
    summary="Update Pattern Status (Confirm, Reject, Retire)",
    description="Performs human-in-the-loop review on a pattern: confirm as valid, reject false positive, or retire obsolete pattern.",
)
def update_pattern_status(
    pattern_id: str,
    payload: PatternStatusUpdate,
    db: Session = Depends(get_db),
) -> FailurePatternResponse:
    service = PatternService(db)
    return service.update_status(pattern_id, payload.status)


@router.post(
    "/evaluate",
    response_model=ReevaluateResponse,
    summary="Re-evaluate Patterns Against Historical Data",
    description="Triggers deterministic pattern detection against stored historical incidents. Can run synchronously or scheduled in background.",
)
def reevaluate_patterns(
    background_tasks: BackgroundTasks,
    async_mode: bool = Query(False, description="Whether to run evaluation asynchronously in background"),
    db: Session = Depends(get_db),
) -> ReevaluateResponse:
    if async_mode:
        background_tasks.add_task(_background_reevaluate, db)
        return ReevaluateResponse(
            total_incidents_analyzed=0,
            total_matches_found=0,
            total_patterns_active=0,
            message="Re-evaluation queued in background task",
        )

    service = PatternService(db)
    return service.reevaluate_patterns()
