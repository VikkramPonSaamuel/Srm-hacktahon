from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.pagination import PaginatedResponse
from app.schemas.service_health import ServiceHealthSnapshotCreate, ServiceHealthSnapshotResponse
from app.services.service_health_service import ServiceHealthService

router = APIRouter()


@router.post(
    "",
    response_model=ServiceHealthSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record Service Health Snapshot",
    description="Captures point-in-time latency and error-rate telemetry for a monitored service or component.",
)
def record_service_health(
    payload: ServiceHealthSnapshotCreate,
    db: Session = Depends(get_db),
) -> ServiceHealthSnapshotResponse:
    service = ServiceHealthService(db)
    return service.record_snapshot(payload)


@router.get(
    "",
    response_model=PaginatedResponse[ServiceHealthSnapshotResponse],
    summary="Query Service Health History",
    description="Retrieves historical service health and latency telemetry snapshots filtered by service name and time range.",
)
def query_service_health(
    service_name: Optional[str] = Query(None, description="Target service or microservice name"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (healthy, degraded, down)"),
    start_date: Optional[datetime] = Query(None, description="Filter start timestamp (UTC)"),
    end_date: Optional[datetime] = Query(None, description="Filter end timestamp (UTC)"),
    skip: int = Query(0, ge=0, description="Offset index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    db: Session = Depends(get_db),
) -> PaginatedResponse[ServiceHealthSnapshotResponse]:
    service = ServiceHealthService(db)
    return service.get_history(
        service_name=service_name,
        status=status_filter,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit,
    )
