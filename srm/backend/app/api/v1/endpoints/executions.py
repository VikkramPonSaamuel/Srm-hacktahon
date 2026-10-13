from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.execution import (
    JourneyExecutionCreate,
    JourneyExecutionDetailResponse,
    JourneyExecutionResponse,
    StepExecutionCreate,
    StepExecutionResponse,
)
from app.schemas.pagination import PaginatedResponse
from app.services.execution_service import ExecutionService

router = APIRouter()


@router.post(
    "",
    response_model=JourneyExecutionDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record Journey Execution",
    description="Logs a new journey execution instance, its correlation ID, environment, and optional batch of steps.",
)
def record_execution(
    payload: JourneyExecutionCreate,
    db: Session = Depends(get_db),
) -> JourneyExecutionDetailResponse:
    service = ExecutionService(db)
    return service.record_execution(payload)


@router.get(
    "",
    response_model=PaginatedResponse[JourneyExecutionResponse],
    summary="List Journey Executions",
    description="Retrieves a paginated collection of journey execution records with filtering by journey, status, correlation ID, and date range.",
)
def list_executions(
    skip: int = Query(0, ge=0, description="Offset record index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    journey_id: Optional[int] = Query(None, description="Filter by journey ID"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by execution status"),
    correlation_id: Optional[str] = Query(None, description="Filter by correlation ID"),
    environment: Optional[str] = Query(None, description="Filter by environment (e.g. production, staging)"),
    start_date: Optional[datetime] = Query(None, description="Filter start timestamp (UTC)"),
    end_date: Optional[datetime] = Query(None, description="Filter end timestamp (UTC)"),
    db: Session = Depends(get_db),
) -> PaginatedResponse[JourneyExecutionResponse]:
    service = ExecutionService(db)
    return service.list_executions(
        skip=skip,
        limit=limit,
        journey_id=journey_id,
        status=status_filter,
        correlation_id=correlation_id,
        environment=environment,
        start_date=start_date,
        end_date=end_date,
    )


@router.get(
    "/{execution_id}",
    response_model=JourneyExecutionDetailResponse,
    summary="Get Execution Details",
    description="Retrieves complete journey execution metrics including all individual step telemetry results.",
)
def get_execution(
    execution_id: str,
    db: Session = Depends(get_db),
) -> JourneyExecutionDetailResponse:
    service = ExecutionService(db)
    return service.get_execution(execution_id)


@router.post(
    "/{execution_id}/steps",
    response_model=StepExecutionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record Step Result",
    description="Appends a step execution telemetry record to an active journey execution.",
)
def record_step_result(
    execution_id: str,
    payload: StepExecutionCreate,
    db: Session = Depends(get_db),
) -> StepExecutionResponse:
    service = ExecutionService(db)
    return service.record_step_result(execution_id, payload)


@router.get(
    "/{execution_id}/steps",
    response_model=List[StepExecutionResponse],
    summary="List Step Execution Results",
    description="Retrieves the sequence of step telemetry records for a journey execution.",
)
def list_step_results(
    execution_id: str,
    db: Session = Depends(get_db),
) -> List[StepExecutionResponse]:
    service = ExecutionService(db)
    return service.list_step_results(execution_id)
