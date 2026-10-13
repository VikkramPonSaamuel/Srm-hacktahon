import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.brand_protection import ComplaintEvent, CyberComplaint
from app.repositories.base import BaseRepository


class ComplaintRepository(BaseRepository[CyberComplaint]):
    """Data access repository for Cyber Complaints and Complaint Events."""

    def __init__(self, db: Session) -> None:
        super().__init__(CyberComplaint, db)

    def get_by_complaint_id(self, complaint_id: str, load_relations: bool = True) -> Optional[CyberComplaint]:
        query = select(CyberComplaint).where(CyberComplaint.complaint_id == complaint_id)
        if load_relations:
            query = query.options(
                selectinload(CyberComplaint.brand),
                selectinload(CyberComplaint.incident),
                selectinload(CyberComplaint.events),
            )
        return self.db.execute(query).scalar_one_or_none()

    def get_by_pk(self, pk: int, load_relations: bool = True) -> Optional[CyberComplaint]:
        query = select(CyberComplaint).where(CyberComplaint.id == pk)
        if load_relations:
            query = query.options(
                selectinload(CyberComplaint.brand),
                selectinload(CyberComplaint.incident),
                selectinload(CyberComplaint.events),
            )
        return self.db.execute(query).scalar_one_or_none()

    def find_existing_by_incident(self, incident_id: int) -> Optional[CyberComplaint]:
        query = (
            select(CyberComplaint)
            .where(CyberComplaint.incident_id == incident_id)
            .options(
                selectinload(CyberComplaint.brand),
                selectinload(CyberComplaint.events),
            )
            .order_by(CyberComplaint.created_at.desc())
        )
        return self.db.execute(query).scalars().first()

    def create_complaint(
        self,
        brand_id: int,
        brand_ref: Optional[str],
        incident_id: Optional[int],
        incident_ref: Optional[str],
        detection_id: Optional[str],
        reporting_party_id: str,
        reporting_party_name: str,
        reporting_party_email: Optional[str],
        suspected_domain: str,
        suspected_url: str,
        incident_description: str,
        detection_timestamp: datetime,
        evidence_references: Dict[str, Any],
        threat_assessment_summary: Dict[str, Any],
        reporting_channel: str,
        narrative_sections: Dict[str, str],
        unsupported_allegations: List[str],
        missing_evidence: List[str],
        is_demo: bool = False,
    ) -> CyberComplaint:
        complaint_id = f"cmp_{uuid.uuid4().hex[:12]}"
        complaint = CyberComplaint(
            complaint_id=complaint_id,
            brand_id=brand_id,
            brand_ref=brand_ref,
            incident_id=incident_id,
            incident_ref=incident_ref,
            detection_id=detection_id,
            reporting_party_id=reporting_party_id,
            reporting_party_name=reporting_party_name,
            reporting_party_email=reporting_party_email,
            suspected_domain=suspected_domain,
            suspected_url=suspected_url,
            incident_description=incident_description,
            detection_timestamp=detection_timestamp,
            evidence_references=evidence_references,
            threat_assessment_summary=threat_assessment_summary,
            reporting_channel=reporting_channel,
            complaint_status="draft",
            submission_status="not_submitted",
            resolution_status="pending",
            narrative_sections=narrative_sections,
            unsupported_allegations=unsupported_allegations,
            missing_evidence=missing_evidence,
            is_demo=is_demo,
        )
        self.db.add(complaint)
        self.db.flush()

        # Add initial audit event
        self.add_event(
            complaint_id=complaint.id,
            event_type="created",
            actor_id=reporting_party_id,
            actor_role="representative",
            notes=f"Draft complaint package initialized for suspected domain '{suspected_domain}'.",
            event_data={"channel": reporting_channel, "incident_id": incident_id},
        )

        self.db.commit()
        self.db.refresh(complaint)
        return complaint

    def list_complaints(
        self,
        brand_id: Optional[int] = None,
        complaint_status: Optional[str] = None,
        submission_status: Optional[str] = None,
        reporting_channel: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[CyberComplaint], int]:
        query = select(CyberComplaint)
        count_query = select(func.count(CyberComplaint.id))

        if brand_id is not None:
            query = query.where(CyberComplaint.brand_id == brand_id)
            count_query = count_query.where(CyberComplaint.brand_id == brand_id)

        if complaint_status:
            query = query.where(CyberComplaint.complaint_status == complaint_status)
            count_query = count_query.where(CyberComplaint.complaint_status == complaint_status)

        if submission_status:
            query = query.where(CyberComplaint.submission_status == submission_status)
            count_query = count_query.where(CyberComplaint.submission_status == submission_status)

        if reporting_channel:
            query = query.where(CyberComplaint.reporting_channel == reporting_channel)
            count_query = count_query.where(CyberComplaint.reporting_channel == reporting_channel)

        total = self.db.execute(count_query).scalar() or 0

        query = (
            query.options(selectinload(CyberComplaint.brand))
            .order_by(CyberComplaint.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        items = list(self.db.execute(query).scalars().all())
        return items, total

    def add_event(
        self,
        complaint_id: int,
        event_type: str,
        actor_id: str,
        actor_role: str,
        notes: Optional[str] = None,
        event_data: Optional[Dict[str, Any]] = None,
    ) -> ComplaintEvent:
        event_id = f"cme_{uuid.uuid4().hex[:12]}"
        event = ComplaintEvent(
            event_id=event_id,
            complaint_id=complaint_id,
            event_type=event_type,
            actor_id=actor_id,
            actor_role=actor_role,
            notes=notes,
            event_data=event_data or {},
            timestamp=datetime.now(timezone.utc),
        )
        self.db.add(event)
        self.db.flush()
        return event

    def list_events(self, complaint_id: int) -> List[ComplaintEvent]:
        query = (
            select(ComplaintEvent)
            .where(ComplaintEvent.complaint_id == complaint_id)
            .order_by(ComplaintEvent.timestamp.asc())
        )
        return list(self.db.execute(query).scalars().all())
