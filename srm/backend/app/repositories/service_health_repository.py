from datetime import datetime
from typing import List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.sanitizer import sanitize_data
from app.models.health import ServiceHealthSnapshot
from app.repositories.base import BaseRepository
from app.schemas.service_health import ServiceHealthSnapshotCreate


class ServiceHealthRepository(BaseRepository[ServiceHealthSnapshot]):
    """Repository handling ServiceHealthSnapshot records."""

    def __init__(self, db: Session) -> None:
        super().__init__(ServiceHealthSnapshot, db)

    def create_snapshot(self, data: ServiceHealthSnapshotCreate) -> ServiceHealthSnapshot:
        snapshot = ServiceHealthSnapshot(
            service_name=data.service_name,
            status=data.status,
            response_latency_ms=data.response_latency_ms,
            error_rate=data.error_rate,
            timestamp=data.timestamp,
            details=sanitize_data(data.details),
            is_demo=data.is_demo,
        )
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        return snapshot

    def list_history(
        self,
        service_name: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[ServiceHealthSnapshot], int]:
        base_query = select(ServiceHealthSnapshot)
        count_query = select(func.count(ServiceHealthSnapshot.id))

        if service_name:
            base_query = base_query.where(ServiceHealthSnapshot.service_name == service_name)
            count_query = count_query.where(ServiceHealthSnapshot.service_name == service_name)

        if status:
            base_query = base_query.where(ServiceHealthSnapshot.status == status)
            count_query = count_query.where(ServiceHealthSnapshot.status == status)

        if start_date:
            base_query = base_query.where(ServiceHealthSnapshot.timestamp >= start_date)
            count_query = count_query.where(ServiceHealthSnapshot.timestamp >= start_date)

        if end_date:
            base_query = base_query.where(ServiceHealthSnapshot.timestamp <= end_date)
            count_query = count_query.where(ServiceHealthSnapshot.timestamp <= end_date)

        total = self.db.scalar(count_query) or 0
        stmt = base_query.order_by(ServiceHealthSnapshot.timestamp.desc()).offset(skip).limit(limit)
        items = list(self.db.scalars(stmt).all())
        return items, total
