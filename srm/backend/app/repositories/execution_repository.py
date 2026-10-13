from datetime import datetime
from typing import List, Optional, Tuple
import uuid
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.sanitizer import sanitize_data
from app.models.execution import JourneyExecution, StepExecution
from app.repositories.base import BaseRepository
from app.schemas.execution import JourneyExecutionCreate, StepExecutionCreate


class ExecutionRepository(BaseRepository[JourneyExecution]):
    """Repository handling JourneyExecution and StepExecution records."""

    def __init__(self, db: Session) -> None:
        super().__init__(JourneyExecution, db)

    def get_by_execution_id(self, execution_id: str) -> Optional[JourneyExecution]:
        stmt = (
            select(JourneyExecution)
            .options(selectinload(JourneyExecution.step_executions))
            .where(JourneyExecution.execution_id == execution_id)
        )
        return self.db.scalars(stmt).first()

    def get_by_id_with_steps(self, id: int) -> Optional[JourneyExecution]:
        stmt = (
            select(JourneyExecution)
            .options(selectinload(JourneyExecution.step_executions))
            .where(JourneyExecution.id == id)
        )
        return self.db.scalars(stmt).first()

    def list_executions(
        self,
        skip: int = 0,
        limit: int = 50,
        journey_id: Optional[int] = None,
        status: Optional[str] = None,
        correlation_id: Optional[str] = None,
        environment: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Tuple[List[JourneyExecution], int]:
        base_query = select(JourneyExecution)
        count_query = select(func.count(JourneyExecution.id))

        if journey_id is not None:
            base_query = base_query.where(JourneyExecution.journey_id == journey_id)
            count_query = count_query.where(JourneyExecution.journey_id == journey_id)

        if status:
            base_query = base_query.where(JourneyExecution.status == status)
            count_query = count_query.where(JourneyExecution.status == status)

        if correlation_id:
            base_query = base_query.where(JourneyExecution.correlation_id == correlation_id)
            count_query = count_query.where(JourneyExecution.correlation_id == correlation_id)

        if environment:
            base_query = base_query.where(JourneyExecution.environment == environment)
            count_query = count_query.where(JourneyExecution.environment == environment)

        if start_date:
            base_query = base_query.where(JourneyExecution.started_at >= start_date)
            count_query = count_query.where(JourneyExecution.started_at >= start_date)

        if end_date:
            base_query = base_query.where(JourneyExecution.started_at <= end_date)
            count_query = count_query.where(JourneyExecution.started_at <= end_date)

        total = self.db.scalar(count_query) or 0
        stmt = base_query.order_by(JourneyExecution.started_at.desc()).offset(skip).limit(limit)
        items = list(self.db.scalars(stmt).all())
        return items, total

    def create_execution(self, data: JourneyExecutionCreate) -> JourneyExecution:
        exec_id = data.execution_id or f"exec_{uuid.uuid4().hex[:16]}"
        execution = JourneyExecution(
            execution_id=exec_id,
            journey_id=data.journey_id,
            correlation_id=data.correlation_id,
            environment=data.environment,
            status=data.status,
            started_at=data.started_at,
            completed_at=data.completed_at,
            duration_ms=data.duration_ms,
            is_demo=data.is_demo,
        )
        self.db.add(execution)
        self.db.flush()

        if data.steps:
            for s in data.steps:
                cleaned_diag = sanitize_data(s.diagnostic_data) if s.diagnostic_data else None
                step_exec = StepExecution(
                    journey_execution_id=execution.id,
                    journey_step_id=s.journey_step_id,
                    status=s.status,
                    started_at=s.started_at,
                    completed_at=s.completed_at,
                    duration_ms=s.duration_ms,
                    latency_ms=s.latency_ms,
                    http_status=s.http_status,
                    error_code=s.error_code,
                    failure_category=s.failure_category,
                    retry_count=s.retry_count,
                    diagnostic_data=cleaned_diag,
                )
                self.db.add(step_exec)

        self.db.commit()
        return self.get_by_execution_id(exec_id) or execution

    def add_step_execution(self, journey_execution_id: int, data: StepExecutionCreate) -> StepExecution:
        cleaned_diag = sanitize_data(data.diagnostic_data) if data.diagnostic_data else None
        step_exec = StepExecution(
            journey_execution_id=journey_execution_id,
            journey_step_id=data.journey_step_id,
            status=data.status,
            started_at=data.started_at,
            completed_at=data.completed_at,
            duration_ms=data.duration_ms,
            latency_ms=data.latency_ms,
            http_status=data.http_status,
            error_code=data.error_code,
            failure_category=data.failure_category,
            retry_count=data.retry_count,
            diagnostic_data=cleaned_diag,
        )
        self.db.add(step_exec)
        self.db.commit()
        self.db.refresh(step_exec)
        return step_exec

    def list_step_executions(self, journey_execution_id: int) -> List[StepExecution]:
        stmt = (
            select(StepExecution)
            .where(StepExecution.journey_execution_id == journey_execution_id)
            .order_by(StepExecution.id.asc())
        )
        return list(self.db.scalars(stmt).all())
