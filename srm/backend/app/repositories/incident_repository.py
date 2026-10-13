from datetime import datetime
from typing import List, Optional, Tuple
import uuid
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.sanitizer import sanitize_data
from app.models.incident import Incident, IncidentEvent
from app.repositories.base import BaseRepository
from app.schemas.incident import IncidentCreate, IncidentEventCreate, IncidentUpdate


class IncidentRepository(BaseRepository[Incident]):
    """Repository handling Incidents and timeline IncidentEvents."""

    def __init__(self, db: Session) -> None:
        super().__init__(Incident, db)

    def get_by_incident_id(self, incident_id: str) -> Optional[Incident]:
        stmt = (
            select(Incident)
            .options(selectinload(Incident.events))
            .where(Incident.incident_id == incident_id)
        )
        return self.db.scalars(stmt).first()

    def get_by_id_with_events(self, id: int) -> Optional[Incident]:
        stmt = (
            select(Incident)
            .options(selectinload(Incident.events))
            .where(Incident.id == id)
        )
        return self.db.scalars(stmt).first()

    def list_incidents(
        self,
        skip: int = 0,
        limit: int = 50,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        journey_id: Optional[int] = None,
        failure_category: Optional[str] = None,
        service_name: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        sort_by: str = "detected_at",
        sort_order: str = "desc",
    ) -> Tuple[List[Incident], int]:
        base_query = select(Incident)
        count_query = select(func.count(Incident.id))

        if severity:
            base_query = base_query.where(Incident.severity == severity)
            count_query = count_query.where(Incident.severity == severity)

        if status:
            base_query = base_query.where(Incident.status == status)
            count_query = count_query.where(Incident.status == status)

        if journey_id is not None:
            base_query = base_query.where(Incident.journey_id == journey_id)
            count_query = count_query.where(Incident.journey_id == journey_id)

        if failure_category:
            base_query = base_query.where(Incident.failure_category == failure_category)
            count_query = count_query.where(Incident.failure_category == failure_category)

        if service_name:
            base_query = base_query.where(Incident.service_name == service_name)
            count_query = count_query.where(Incident.service_name == service_name)

        if start_date:
            base_query = base_query.where(Incident.detected_at >= start_date)
            count_query = count_query.where(Incident.detected_at >= start_date)

        if end_date:
            base_query = base_query.where(Incident.detected_at <= end_date)
            count_query = count_query.where(Incident.detected_at <= end_date)

        total = self.db.scalar(count_query) or 0

        # Sort field handling
        sort_column = getattr(Incident, sort_by, Incident.detected_at)
        if sort_order.lower() == "asc":
            base_query = base_query.order_by(sort_column.asc())
        else:
            base_query = base_query.order_by(sort_column.desc())

        stmt = base_query.offset(skip).limit(limit)
        items = list(self.db.scalars(stmt).all())
        return items, total

    def create_incident(self, data: IncidentCreate) -> Incident:
        inc_id = data.incident_id or f"inc_{uuid.uuid4().hex[:16]}"
        incident = Incident(
            incident_id=inc_id,
            journey_execution_id=data.journey_execution_id,
            step_execution_id=data.step_execution_id,
            journey_id=data.journey_id,
            service_name=data.service_name,
            incident_type=data.incident_type,
            severity=data.severity,
            title=data.title,
            description=sanitize_data(data.description),
            status=data.status,
            failure_category=data.failure_category,
            root_cause_hypothesis=data.root_cause_hypothesis,
            resolution_summary=data.resolution_summary,
            recovery_status=data.recovery_status,
            recovery_duration_ms=data.recovery_duration_ms,
            detected_at=data.detected_at,
            resolved_at=data.resolved_at,
            is_demo=data.is_demo,
        )
        self.db.add(incident)
        self.db.flush()

        if data.initial_event:
            event = IncidentEvent(
                incident_id=incident.id,
                event_type=data.initial_event.event_type,
                timestamp=data.initial_event.timestamp,
                details=sanitize_data(data.initial_event.details),
                correlation_id=data.initial_event.correlation_id,
            )
            self.db.add(event)

        self.db.commit()
        return self.get_by_incident_id(inc_id) or incident

    def update_incident(self, incident: Incident, data: IncidentUpdate) -> Incident:
        update_dict = data.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(incident, key, value)
        self.db.commit()
        self.db.refresh(incident)
        return incident

    def add_event(self, incident_id: int, data: IncidentEventCreate) -> IncidentEvent:
        event = IncidentEvent(
            incident_id=incident_id,
            event_type=data.event_type,
            timestamp=data.timestamp,
            details=sanitize_data(data.details),
            correlation_id=data.correlation_id,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def list_events(self, incident_id: int) -> List[IncidentEvent]:
        stmt = (
            select(IncidentEvent)
            .where(IncidentEvent.incident_id == incident_id)
            .order_by(IncidentEvent.timestamp.asc())
        )
        return list(self.db.scalars(stmt).all())
