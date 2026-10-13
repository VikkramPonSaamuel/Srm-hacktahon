from typing import List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.journey import BusinessJourney, JourneyStep
from app.repositories.base import BaseRepository
from app.schemas.journey import BusinessJourneyCreate, BusinessJourneyUpdate, JourneyStepCreate, JourneyStepUpdate


class JourneyRepository(BaseRepository[BusinessJourney]):
    """Repository handling BusinessJourney and JourneyStep persistence."""

    def __init__(self, db: Session) -> None:
        super().__init__(BusinessJourney, db)

    def get_by_id_with_steps(self, journey_id: int) -> Optional[BusinessJourney]:
        stmt = (
            select(BusinessJourney)
            .options(selectinload(BusinessJourney.steps))
            .where(BusinessJourney.id == journey_id)
        )
        return self.db.scalars(stmt).first()

    def get_by_name(self, name: str) -> Optional[BusinessJourney]:
        stmt = select(BusinessJourney).where(BusinessJourney.name == name)
        return self.db.scalars(stmt).first()

    def list_journeys(
        self,
        skip: int = 0,
        limit: int = 50,
        journey_type: Optional[str] = None,
        is_enabled: Optional[bool] = None,
        search: Optional[str] = None,
    ) -> Tuple[List[BusinessJourney], int]:
        base_query = select(BusinessJourney).options(selectinload(BusinessJourney.steps))
        count_query = select(func.count(BusinessJourney.id))

        if journey_type:
            base_query = base_query.where(BusinessJourney.journey_type == journey_type)
            count_query = count_query.where(BusinessJourney.journey_type == journey_type)

        if is_enabled is not None:
            base_query = base_query.where(BusinessJourney.is_enabled == is_enabled)
            count_query = count_query.where(BusinessJourney.is_enabled == is_enabled)

        if search:
            search_filter = BusinessJourney.name.ilike(f"%{search}%")
            base_query = base_query.where(search_filter)
            count_query = count_query.where(search_filter)

        total = self.db.scalar(count_query) or 0
        stmt = base_query.order_by(BusinessJourney.id.asc()).offset(skip).limit(limit)
        items = list(self.db.scalars(stmt).all())
        return items, total

    def create_journey(self, data: BusinessJourneyCreate) -> BusinessJourney:
        journey = BusinessJourney(
            name=data.name,
            description=data.description,
            journey_type=data.journey_type,
            is_enabled=data.is_enabled,
            is_demo=data.is_demo,
        )
        self.db.add(journey)
        self.db.flush()

        if data.steps:
            for s in data.steps:
                step = JourneyStep(
                    journey_id=journey.id,
                    step_name=s.step_name,
                    step_order=s.step_order,
                    service_name=s.service_name,
                    step_type=s.step_type,
                    timeout_ms=s.timeout_ms,
                    is_required=s.is_required,
                )
                self.db.add(step)

        self.db.commit()
        return self.get_by_id_with_steps(journey.id) or journey

    def update_journey(self, journey: BusinessJourney, data: BusinessJourneyUpdate) -> BusinessJourney:
        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(journey, key, value)
        self.db.commit()
        self.db.refresh(journey)
        return self.get_by_id_with_steps(journey.id) or journey

    def toggle_journey(self, journey: BusinessJourney, is_enabled: bool) -> BusinessJourney:
        journey.is_enabled = is_enabled
        self.db.commit()
        self.db.refresh(journey)
        return self.get_by_id_with_steps(journey.id) or journey

    def get_step(self, step_id: int) -> Optional[JourneyStep]:
        return self.db.get(JourneyStep, step_id)

    def get_step_by_order(self, journey_id: int, step_order: int) -> Optional[JourneyStep]:
        stmt = select(JourneyStep).where(
            JourneyStep.journey_id == journey_id,
            JourneyStep.step_order == step_order,
        )
        return self.db.scalars(stmt).first()

    def list_steps(self, journey_id: int) -> List[JourneyStep]:
        stmt = (
            select(JourneyStep)
            .where(JourneyStep.journey_id == journey_id)
            .order_by(JourneyStep.step_order.asc())
        )
        return list(self.db.scalars(stmt).all())

    def add_step(self, journey_id: int, data: JourneyStepCreate) -> JourneyStep:
        step = JourneyStep(
            journey_id=journey_id,
            step_name=data.step_name,
            step_order=data.step_order,
            service_name=data.service_name,
            step_type=data.step_type,
            timeout_ms=data.timeout_ms,
            is_required=data.is_required,
        )
        self.db.add(step)
        self.db.commit()
        self.db.refresh(step)
        return step

    def update_step(self, step: JourneyStep, data: JourneyStepUpdate) -> JourneyStep:
        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(step, key, value)
        self.db.commit()
        self.db.refresh(step)
        return step

    def delete_step(self, step: JourneyStep) -> None:
        self.db.delete(step)
        self.db.commit()
