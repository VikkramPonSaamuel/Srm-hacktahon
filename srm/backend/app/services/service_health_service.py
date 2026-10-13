from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.repositories.service_health_repository import ServiceHealthRepository
from app.schemas.pagination import PaginatedResponse
from app.schemas.service_health import ServiceHealthSnapshotCreate, ServiceHealthSnapshotResponse


class ServiceHealthService:
    """Business logic for ingesting and querying service health telemetry."""

    def __init__(self, db: Session) -> None:
        self.repo = ServiceHealthRepository(db)

    def record_snapshot(self, data: ServiceHealthSnapshotCreate) -> ServiceHealthSnapshotResponse:
        snapshot = self.repo.create_snapshot(data)
        return ServiceHealthSnapshotResponse.model_validate(snapshot)

    def get_history(
        self,
        service_name: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> PaginatedResponse[ServiceHealthSnapshotResponse]:
        limit = min(limit, 100)
        items, total = self.repo.list_history(
            service_name=service_name,
            status=status,
            start_date=start_date,
            end_date=end_date,
            skip=skip,
            limit=limit,
        )

        return PaginatedResponse(
            items=[ServiceHealthSnapshotResponse.model_validate(s) for s in items],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )
