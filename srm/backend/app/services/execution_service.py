from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.repositories.execution_repository import ExecutionRepository
from app.repositories.journey_repository import JourneyRepository
from app.schemas.execution import (
    JourneyExecutionCreate,
    JourneyExecutionDetailResponse,
    JourneyExecutionResponse,
    StepExecutionCreate,
    StepExecutionResponse,
)
from app.schemas.pagination import PaginatedResponse


class ExecutionService:
    """Business logic for recording journey executions and individual step telemetry."""

    def __init__(self, db: Session) -> None:
        self.repo = ExecutionRepository(db)
        self.journey_repo = JourneyRepository(db)

    def _find_execution(self, identifier: str):
        # Allow lookup either by business execution_id or numeric PK
        execution = self.repo.get_by_execution_id(identifier)
        if not execution and identifier.isdigit():
            execution = self.repo.get_by_id_with_steps(int(identifier))
        if not execution:
            raise NotFoundError(message=f"Journey execution '{identifier}' not found.")
        return execution

    def record_execution(self, data: JourneyExecutionCreate) -> JourneyExecutionDetailResponse:
        if data.journey_id is not None:
            journey = self.journey_repo.get_by_id(data.journey_id)
            if not journey:
                raise NotFoundError(message=f"Target business journey {data.journey_id} does not exist.")

        execution = self.repo.create_execution(data)
        return JourneyExecutionDetailResponse.model_validate(execution)

    def get_execution(self, identifier: str) -> JourneyExecutionDetailResponse:
        execution = self._find_execution(identifier)
        return JourneyExecutionDetailResponse.model_validate(execution)

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
    ) -> PaginatedResponse[JourneyExecutionResponse]:
        limit = min(limit, 100)
        items, total = self.repo.list_executions(
            skip=skip,
            limit=limit,
            journey_id=journey_id,
            status=status,
            correlation_id=correlation_id,
            environment=environment,
            start_date=start_date,
            end_date=end_date,
        )

        return PaginatedResponse(
            items=[JourneyExecutionResponse.model_validate(item) for item in items],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )

    def record_step_result(self, execution_identifier: str, data: StepExecutionCreate) -> StepExecutionResponse:
        execution = self._find_execution(execution_identifier)

        if data.journey_step_id is not None:
            step = self.journey_repo.get_step(data.journey_step_id)
            if not step:
                raise NotFoundError(message=f"Journey step {data.journey_step_id} does not exist.")

        step_exec = self.repo.add_step_execution(execution.id, data)
        return StepExecutionResponse.model_validate(step_exec)

    def list_step_results(self, execution_identifier: str) -> List[StepExecutionResponse]:
        execution = self._find_execution(execution_identifier)
        steps = self.repo.list_step_executions(execution.id)
        return [StepExecutionResponse.model_validate(s) for s in steps]
