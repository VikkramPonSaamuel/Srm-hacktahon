from datetime import datetime, timezone
from typing import List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.pattern import FailurePattern, PatternMatch
from app.repositories.base import BaseRepository


class PatternRepository(BaseRepository[FailurePattern]):
    """Repository handling FailurePattern and PatternMatch records."""

    def __init__(self, db: Session) -> None:
        super().__init__(FailurePattern, db)

    def get_by_pattern_id(self, pattern_id: str) -> Optional[FailurePattern]:
        stmt = (
            select(FailurePattern)
            .options(selectinload(FailurePattern.matches).selectinload(PatternMatch.incident))
            .where(FailurePattern.pattern_id == pattern_id)
        )
        return self.db.scalars(stmt).first()

    def get_by_id_with_matches(self, id: int) -> Optional[FailurePattern]:
        stmt = (
            select(FailurePattern)
            .options(selectinload(FailurePattern.matches).selectinload(PatternMatch.incident))
            .where(FailurePattern.id == id)
        )
        return self.db.scalars(stmt).first()

    def list_patterns(
        self,
        skip: int = 0,
        limit: int = 50,
        service_name: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        failure_category: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Tuple[List[FailurePattern], int]:
        base_query = select(FailurePattern)
        count_query = select(func.count(FailurePattern.id))

        if service_name:
            base_query = base_query.where(FailurePattern.service_name == service_name)
            count_query = count_query.where(FailurePattern.service_name == service_name)

        if severity:
            base_query = base_query.where(FailurePattern.severity == severity)
            count_query = count_query.where(FailurePattern.severity == severity)

        if status:
            base_query = base_query.where(FailurePattern.status == status)
            count_query = count_query.where(FailurePattern.status == status)

        if failure_category:
            base_query = base_query.where(FailurePattern.failure_category == failure_category)
            count_query = count_query.where(FailurePattern.failure_category == failure_category)

        if start_date:
            base_query = base_query.where(FailurePattern.last_detected_at >= start_date)
            count_query = count_query.where(FailurePattern.last_detected_at >= start_date)

        if end_date:
            base_query = base_query.where(FailurePattern.last_detected_at <= end_date)
            count_query = count_query.where(FailurePattern.last_detected_at <= end_date)

        total = self.db.scalar(count_query) or 0
        stmt = base_query.order_by(FailurePattern.last_detected_at.desc()).offset(skip).limit(limit)
        items = list(self.db.scalars(stmt).all())
        return items, total

    def update_status(self, pattern: FailurePattern, new_status: str) -> FailurePattern:
        pattern.status = new_status
        pattern.last_evaluated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(pattern)
        return pattern
