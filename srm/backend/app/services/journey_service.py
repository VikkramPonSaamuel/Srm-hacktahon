from typing import List, Optional
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictError, NotFoundError
from app.models.journey import BusinessJourney, JourneyStep
from app.repositories.journey_repository import JourneyRepository
from app.schemas.journey import (
    BusinessJourneyCreate,
    BusinessJourneyDetailResponse,
    BusinessJourneyResponse,
    BusinessJourneyUpdate,
    JourneyStepCreate,
    JourneyStepResponse,
    JourneyStepUpdate,
)
from app.schemas.pagination import PaginatedResponse


class JourneyService:
    """Business logic for configuring and maintaining business journeys."""

    def __init__(self, db: Session) -> None:
        self.repo = JourneyRepository(db)

    def create_journey(self, data: BusinessJourneyCreate) -> BusinessJourneyDetailResponse:
        existing = self.repo.get_by_name(data.name)
        if existing:
            raise ConflictError(message=f"Journey with name '{data.name}' already exists.")

        # Check unique step orders within initial payload
        if data.steps:
            orders = [s.step_order for s in data.steps]
            if len(orders) != len(set(orders)):
                raise ConflictError(message="Duplicate step_order found in initial steps list.")

        journey = self.repo.create_journey(data)
        return BusinessJourneyDetailResponse.model_validate(journey)

    def get_journey(self, journey_id: int) -> BusinessJourneyDetailResponse:
        journey = self.repo.get_by_id_with_steps(journey_id)
        if not journey:
            raise NotFoundError(message=f"Business journey with ID {journey_id} not found.")
        return BusinessJourneyDetailResponse.model_validate(journey)

    def list_journeys(
        self,
        skip: int = 0,
        limit: int = 50,
        journey_type: Optional[str] = None,
        is_enabled: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> PaginatedResponse[BusinessJourneyResponse]:
        limit = min(limit, 100)  # enforce upper bound
        items, total = self.repo.list_journeys(
            skip=skip,
            limit=limit,
            journey_type=journey_type,
            is_enabled=is_enabled,
            search=search,
        )

        response_items = []
        for j in items:
            resp = BusinessJourneyResponse.model_validate(j)
            resp.step_count = len(j.steps)
            response_items.append(resp)

        return PaginatedResponse(
            items=response_items,
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )

    def update_journey(self, journey_id: int, data: BusinessJourneyUpdate) -> BusinessJourneyDetailResponse:
        journey = self.repo.get_by_id_with_steps(journey_id)
        if not journey:
            raise NotFoundError(message=f"Business journey with ID {journey_id} not found.")

        if data.name and data.name != journey.name:
            existing = self.repo.get_by_name(data.name)
            if existing and existing.id != journey_id:
                raise ConflictError(message=f"Journey with name '{data.name}' already exists.")

        updated = self.repo.update_journey(journey, data)
        return BusinessJourneyDetailResponse.model_validate(updated)

    def toggle_journey(self, journey_id: int, is_enabled: bool) -> BusinessJourneyResponse:
        journey = self.repo.get_by_id_with_steps(journey_id)
        if not journey:
            raise NotFoundError(message=f"Business journey with ID {journey_id} not found.")

        toggled = self.repo.toggle_journey(journey, is_enabled)
        resp = BusinessJourneyResponse.model_validate(toggled)
        resp.step_count = len(toggled.steps)
        return resp

    def add_step(self, journey_id: int, data: JourneyStepCreate) -> JourneyStepResponse:
        journey = self.repo.get_by_id(journey_id)
        if not journey:
            raise NotFoundError(message=f"Business journey with ID {journey_id} not found.")

        existing_step = self.repo.get_step_by_order(journey_id, data.step_order)
        if existing_step:
            raise ConflictError(
                message=f"Step order {data.step_order} is already occupied in journey {journey_id}."
            )

        step = self.repo.add_step(journey_id, data)
        return JourneyStepResponse.model_validate(step)

    def list_steps(self, journey_id: int) -> List[JourneyStepResponse]:
        journey = self.repo.get_by_id(journey_id)
        if not journey:
            raise NotFoundError(message=f"Business journey with ID {journey_id} not found.")

        steps = self.repo.list_steps(journey_id)
        return [JourneyStepResponse.model_validate(s) for s in steps]

    def update_step(self, journey_id: int, step_id: int, data: JourneyStepUpdate) -> JourneyStepResponse:
        step = self.repo.get_step(step_id)
        if not step or step.journey_id != journey_id:
            raise NotFoundError(message=f"Step with ID {step_id} not found for journey {journey_id}.")

        if data.step_order is not None and data.step_order != step.step_order:
            existing_step = self.repo.get_step_by_order(journey_id, data.step_order)
            if existing_step and existing_step.id != step_id:
                raise ConflictError(
                    message=f"Step order {data.step_order} is already occupied in journey {journey_id}."
                )

        updated = self.repo.update_step(step, data)
        return JourneyStepResponse.model_validate(updated)

    def delete_step(self, journey_id: int, step_id: int) -> None:
        step = self.repo.get_step(step_id)
        if not step or step.journey_id != journey_id:
            raise NotFoundError(message=f"Step with ID {step_id} not found for journey {journey_id}.")
        self.repo.delete_step(step)
