from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.repositories.execution_repository import ExecutionRepository
from app.repositories.incident_repository import IncidentRepository
from app.repositories.journey_repository import JourneyRepository
from app.schemas.incident import (
    IncidentCreate,
    IncidentDetailResponse,
    IncidentEventCreate,
    IncidentEventResponse,
    IncidentResponse,
    IncidentUpdate,
)
from app.schemas.pagination import PaginatedResponse


class IncidentService:
    """Business logic for incident tracking, investigation timelines, and resolution state."""

    def __init__(self, db: Session) -> None:
        self.repo = IncidentRepository(db)
        self.journey_repo = JourneyRepository(db)
        self.execution_repo = ExecutionRepository(db)

    def _find_incident(self, identifier: str):
        incident = self.repo.get_by_incident_id(identifier)
        if not incident and identifier.isdigit():
            incident = self.repo.get_by_id_with_events(int(identifier))
        if not incident:
            raise NotFoundError(message=f"Incident '{identifier}' not found.")
        return incident

    def record_incident(self, data: IncidentCreate) -> IncidentDetailResponse:
        if data.journey_id is not None:
            journey = self.journey_repo.get_by_id(data.journey_id)
            if not journey:
                raise NotFoundError(message=f"Business journey {data.journey_id} does not exist.")

        if data.journey_execution_id is not None:
            exec_record = self.execution_repo.get_by_id(data.journey_execution_id)
            if not exec_record:
                raise NotFoundError(
                    message=f"Journey execution {data.journey_execution_id} does not exist."
                )

        # Default initial event if not provided
        if not data.initial_event:
            data.initial_event = IncidentEventCreate(
                event_type="detected",
                timestamp=data.detected_at,
                details={"title": data.title, "severity": data.severity, "service": data.service_name},
                correlation_id=None,
            )

        incident = self.repo.create_incident(data)
        return IncidentDetailResponse.model_validate(incident)

    def get_incident(self, identifier: str) -> IncidentDetailResponse:
        incident = self._find_incident(identifier)
        return IncidentDetailResponse.model_validate(incident)

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
    ) -> PaginatedResponse[IncidentResponse]:
        limit = min(limit, 100)
        items, total = self.repo.list_incidents(
            skip=skip,
            limit=limit,
            severity=severity,
            status=status,
            journey_id=journey_id,
            failure_category=failure_category,
            service_name=service_name,
            start_date=start_date,
            end_date=end_date,
            sort_by=sort_by,
            sort_order=sort_order,
        )

        return PaginatedResponse(
            items=[IncidentResponse.model_validate(item) for item in items],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )

    def update_incident(self, identifier: str, data: IncidentUpdate) -> IncidentDetailResponse:
        incident = self._find_incident(identifier)

        old_status = incident.status
        if data.status == "resolved" and not data.resolved_at and not incident.resolved_at:
            data.resolved_at = datetime.now(timezone.utc)

        updated = self.repo.update_incident(incident, data)

        # Automatically append timeline event if status changed
        if data.status and data.status != old_status:
            self.repo.add_event(
                incident.id,
                IncidentEventCreate(
                    event_type="status_changed",
                    timestamp=datetime.now(timezone.utc),
                    details={"old_status": old_status, "new_status": data.status},
                ),
            )

        return IncidentDetailResponse.model_validate(self._find_incident(identifier))

    def add_event(self, identifier: str, data: IncidentEventCreate) -> IncidentEventResponse:
        incident = self._find_incident(identifier)
        event = self.repo.add_event(incident.id, data)
        return IncidentEventResponse.model_validate(event)

    def get_timeline(self, identifier: str) -> List[IncidentEventResponse]:
        incident = self._find_incident(identifier)
        events = self.repo.list_events(incident.id)
        return [IncidentEventResponse.model_validate(e) for e in events]

    def get_unified_lifecycle(self, identifier: str) -> Dict[str, Any]:
        """Provides a consistent cross-module lifecycle timeline containing milestones:

        Detection -> Evidence -> Pattern Match -> Human Review -> Approval -> Response -> Verification -> Resolution/Escalation.
        """
        incident = self._find_incident(identifier)
        events = self.repo.list_events(incident.id)
        serialized_events = [IncidentEventResponse.model_validate(e).model_dump() for e in events]
        stages_present = []
        for e in serialized_events:
            stg = e.get("stage")
            if stg and stg not in stages_present:
                stages_present.append(stg)

        return {
            "incident_id": incident.incident_id,
            "module": incident.module,
            "title": incident.title,
            "severity": incident.severity,
            "status": incident.status,
            "recovery_status": incident.recovery_status,
            "stages_reached": stages_present,
            "current_stage": stages_present[-1] if stages_present else "detection",
            "timeline": serialized_events,
        }
