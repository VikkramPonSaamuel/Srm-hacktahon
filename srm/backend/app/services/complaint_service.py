from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.brand_protection.complaint_channels import (
    ComplaintChannelRegistry,
    DownloadPackageAdapter,
)
from app.brand_protection.complaint_narrative import (
    ComplaintNarrativeGenerator,
    ComplaintValidationReport,
)
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.core.security import AuthenticatedUser, UserRole
from app.models.brand_protection import (
    BrandProfile,
    ComplaintEvent,
    CyberComplaint,
    DetectedImpersonation,
)
from app.models.incident import Incident
from app.repositories.brand_protection_repository import BrandProtectionRepository
from app.repositories.complaint_repository import ComplaintRepository
from app.repositories.incident_repository import IncidentRepository
from app.schemas.complaint import (
    ComplaintCreateRequest,
    ComplaintDetailResponse,
    ComplaintEventResponse,
    ComplaintExportResponse,
    ComplaintFollowUpCreate,
    ComplaintRecordSubmissionRequest,
    ComplaintResponse,
    ComplaintReviewRequest,
    ComplaintUpdateRequest,
)
from app.schemas.incident import IncidentEventCreate
from app.services.incident_service import IncidentService


class ComplaintService:
    """Business logic for cyber complaint preparation, narrative structuring,

    multi-channel packaging, human approval review, and external submission tracking.
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ComplaintRepository(db)
        self.brand_repo = BrandProtectionRepository(db)
        self.incident_repo = IncidentRepository(db)

    def _get_complaint_or_404(self, complaint_id: str) -> CyberComplaint:
        complaint = self.repo.get_by_complaint_id(complaint_id)
        if not complaint:
            raise NotFoundError(f"Cyber complaint '{complaint_id}' not found.")
        return complaint

    def _check_ownership(self, brand: BrandProfile, user: AuthenticatedUser) -> None:
        if user.role == UserRole.ADMIN:
            return
        if brand.owner_id != user.user_id:
            raise ForbiddenError(
                f"Access denied: you do not have permission to manage complaints for brand '{brand.brand_id}'."
            )

    def create_complaint_from_incident(
        self,
        req: ComplaintCreateRequest,
        user: AuthenticatedUser,
    ) -> ComplaintDetailResponse:
        incident = self.incident_repo.get_by_id(req.incident_id)
        if not incident:
            raise NotFoundError(f"Incident {req.incident_id} does not exist.")

        # Prevent duplicate complaint drafts unless explicitly requested
        existing = self.repo.find_existing_by_incident(incident.id)
        if existing and not req.force_new:
            raise ConflictError(
                f"A complaint package '{existing.complaint_id}' already exists for incident {incident.id}. "
                f"Set force_new=True to create an additional draft."
            )

        # Ensure incident belongs to brand impersonation; reject unrelated operational or security incidents
        detection = self.db.execute(
            select(DetectedImpersonation).where(DetectedImpersonation.incident_id == incident.id)
        ).scalar_one_or_none()

        if incident.module != "brand_impersonation" and not detection:
            raise BadRequestError(
                f"Brand complaints cannot be triggered by unrelated incidents. Incident '{incident.incident_id}' "
                f"belongs to module '{incident.module}'."
            )

        brand: Optional[BrandProfile] = None
        if detection:
            brand = self.brand_repo.get_by_id(detection.brand_id)
        else:
            # Fallback: check user's accessible brands
            user_brands, _ = self.brand_repo.list_brands(owner_id=user.user_id, limit=1)
            if user_brands:
                brand = user_brands[0]

        if not brand:
            raise BadRequestError(
                f"Incident {incident.id} is not linked to any registered brand profile."
            )

        self._check_ownership(brand, user)

        # Collect official domains & assets for evidence provenance
        official_domains = [d.domain_name for d in brand.domains if d.is_active]

        # Gather evidence & threat assessment
        suspected_domain = detection.suspicious_domain if detection else "unknown-domain.com"
        suspected_url = detection.suspicious_url if detection else f"https://{suspected_domain}"
        detection_timestamp = detection.first_detected_at if detection else incident.detected_at
        evidence_refs = dict(detection.evidence_references) if detection else {}
        threat_summary = {
            "risk_score": detection.risk_score if detection else 0.80,
            "severity": detection.severity if detection else incident.severity,
            "attack_vector": detection.attack_vector if detection else "domain_typosquat",
            "detection_reasons": detection.detection_reasons if detection else [incident.title],
        }

        # Generate structured narrative separating empirical facts from assessments
        narrative_sections = ComplaintNarrativeGenerator.generate_narrative(
            brand_name=brand.name,
            official_domains=official_domains,
            suspected_domain=suspected_domain,
            suspected_url=suspected_url,
            detection_timestamp=detection_timestamp,
            evidence_references=evidence_refs,
            threat_assessment=threat_summary,
            reporting_party_name=user.username,
            channel=req.reporting_channel,
        )

        # Validate completeness and check for unsupported allegations
        validation = ComplaintNarrativeGenerator.validate_complaint(
            narrative_sections=narrative_sections,
            evidence_references=evidence_refs,
            official_domains=official_domains,
            reporting_party_email=brand.contact_email,
        )

        complaint = self.repo.create_complaint(
            brand_id=brand.id,
            brand_ref=brand.brand_id,
            incident_id=incident.id,
            incident_ref=incident.incident_id,
            detection_id=detection.detection_id if detection else None,
            reporting_party_id=user.user_id,
            reporting_party_name=user.username,
            reporting_party_email=brand.contact_email,
            suspected_domain=suspected_domain,
            suspected_url=suspected_url,
            incident_description=incident.description,
            detection_timestamp=detection_timestamp,
            evidence_references=evidence_refs,
            threat_assessment_summary=threat_summary,
            reporting_channel=req.reporting_channel,
            narrative_sections=narrative_sections,
            unsupported_allegations=validation.unsupported_allegations,
            missing_evidence=validation.missing_evidence,
            is_demo=incident.is_demo,
        )

        # Record audit event on brand
        self.brand_repo.add_verification_event(
            brand_id=brand.id,
            action="complaint_drafted",
            status=brand.verification_status,
            evidence={
                "complaint_id": complaint.complaint_id,
                "incident_id": incident.id,
                "suspected_domain": suspected_domain,
                "channel": req.reporting_channel,
            },
            reviewed_by=user.username,
        )
        self.db.commit()

        return self._to_detail_response(complaint)

    def get_complaint(self, complaint_id: str, user: AuthenticatedUser) -> ComplaintDetailResponse:
        complaint = self._get_complaint_or_404(complaint_id)
        self._check_ownership(complaint.brand, user)
        return self._to_detail_response(complaint)

    def update_complaint(
        self,
        complaint_id: str,
        req: ComplaintUpdateRequest,
        user: AuthenticatedUser,
    ) -> ComplaintDetailResponse:
        complaint = self._get_complaint_or_404(complaint_id)
        self._check_ownership(complaint.brand, user)

        if complaint.complaint_status in ("approved", "submitted"):
            raise BadRequestError(
                f"Cannot edit complaint in '{complaint.complaint_status}' status. "
                f"Request changes or create a revision draft."
            )

        if req.reporting_channel is not None:
            complaint.reporting_channel = req.reporting_channel
        if req.reporting_party_name is not None:
            complaint.reporting_party_name = req.reporting_party_name
        if req.reporting_party_email is not None:
            complaint.reporting_party_email = req.reporting_party_email
        if req.narrative_sections is not None:
            complaint.narrative_sections = req.narrative_sections

        # Revalidate completeness and allegations
        official_domains = [d.domain_name for d in complaint.brand.domains if d.is_active]
        validation = ComplaintNarrativeGenerator.validate_complaint(
            narrative_sections=complaint.narrative_sections,
            evidence_references=complaint.evidence_references,
            official_domains=official_domains,
            reporting_party_email=complaint.reporting_party_email,
        )
        complaint.unsupported_allegations = validation.unsupported_allegations
        complaint.missing_evidence = validation.missing_evidence

        self.repo.add_event(
            complaint_id=complaint.id,
            event_type="narrative_updated",
            actor_id=user.username,
            actor_role=user.role.value,
            notes="Complaint narrative and reporting details updated by representative.",
            event_data={"channel": complaint.reporting_channel},
        )
        self.db.commit()
        self.db.refresh(complaint)

        return self._to_detail_response(complaint)

    def submit_for_review(self, complaint_id: str, user: AuthenticatedUser) -> ComplaintDetailResponse:
        complaint = self._get_complaint_or_404(complaint_id)
        self._check_ownership(complaint.brand, user)

        if complaint.missing_evidence:
            raise BadRequestError(
                f"Cannot submit complaint for review due to missing required evidence: "
                f"{'; '.join(complaint.missing_evidence)}"
            )

        complaint.complaint_status = "pending_review"

        self.repo.add_event(
            complaint_id=complaint.id,
            event_type="submitted_for_review",
            actor_id=user.username,
            actor_role=user.role.value,
            notes="Complaint package submitted for authorized review.",
        )
        self.db.commit()
        self.db.refresh(complaint)

        return self._to_detail_response(complaint)

    def review_complaint(
        self,
        complaint_id: str,
        req: ComplaintReviewRequest,
        user: AuthenticatedUser,
    ) -> ComplaintDetailResponse:
        if not user.has_role(UserRole.OPERATOR):
            raise ForbiddenError("Only operators and administrators can review complaint packages.")

        complaint = self._get_complaint_or_404(complaint_id)
        self._check_ownership(complaint.brand, user)

        now = datetime.now(timezone.utc)
        complaint.reviewed_by = user.username
        complaint.reviewed_at = now
        complaint.review_notes = req.review_notes

        if req.action == "approve":
            complaint.complaint_status = "approved"
            self.repo.add_event(
                complaint_id=complaint.id,
                event_type="approved",
                actor_id=user.username,
                actor_role=user.role.value,
                notes=req.review_notes or "Complaint package approved for external dispatch.",
            )
            self.brand_repo.add_verification_event(
                brand_id=complaint.brand_id,
                action="complaint_approved",
                status=complaint.brand.verification_status,
                evidence={"complaint_id": complaint.complaint_id, "approved_by": user.username},
                reviewed_by=user.username,
            )
        elif req.action == "reject":
            complaint.complaint_status = "rejected"
            self.repo.add_event(
                complaint_id=complaint.id,
                event_type="rejected",
                actor_id=user.username,
                actor_role=user.role.value,
                notes=req.review_notes or "Complaint package rejected by reviewer.",
            )
        elif req.action == "request_changes":
            complaint.complaint_status = "changes_requested"
            self.repo.add_event(
                complaint_id=complaint.id,
                event_type="changes_requested",
                actor_id=user.username,
                actor_role=user.role.value,
                notes=req.review_notes or "Reviewer requested changes to narrative or evidence references.",
            )

        self.db.commit()
        self.db.refresh(complaint)
        return self._to_detail_response(complaint)

    def export_package(self, complaint_id: str, user: AuthenticatedUser) -> ComplaintExportResponse:
        complaint = self._get_complaint_or_404(complaint_id)
        self._check_ownership(complaint.brand, user)

        adapter = ComplaintChannelRegistry.get_adapter(complaint.reporting_channel)
        if not adapter:
            adapter = DownloadPackageAdapter()

        package = adapter.export_package(complaint)
        return ComplaintExportResponse(
            complaint_id=package["complaint_id"],
            channel=package["channel"],
            portal_url=package.get("portal_url"),
            export_timestamp=package["export_timestamp"],
            formatted_text=package["formatted_text"],
            structured_data=package["structured_data"],
        )

    def record_external_submission(
        self,
        complaint_id: str,
        req: ComplaintRecordSubmissionRequest,
        user: AuthenticatedUser,
    ) -> ComplaintDetailResponse:
        complaint = self._get_complaint_or_404(complaint_id)
        self._check_ownership(complaint.brand, user)

        # Enforce approval requirement
        if complaint.complaint_status != "approved":
            raise BadRequestError(
                f"Cannot record external submission for complaint in '{complaint.complaint_status}' status. "
                f"Complaint package must be formally approved before external dispatch."
            )

        now = datetime.now(timezone.utc)
        complaint.submission_status = "submitted"
        complaint.submitted_at = now
        complaint.submitted_by = user.username
        complaint.official_reference_number = req.official_reference_number.strip()
        complaint.submission_details = req.submission_details or {}

        # Log event on complaint timeline
        self.repo.add_event(
            complaint_id=complaint.id,
            event_type="submitted_externally",
            actor_id=user.username,
            actor_role=user.role.value,
            notes=req.submission_notes or f"External submission confirmed with official ref {req.official_reference_number}.",
            event_data={
                "official_reference_number": req.official_reference_number,
                "channel": complaint.reporting_channel,
            },
        )

        # Link to incident timeline if available
        if complaint.incident_id:
            try:
                inc_svc = IncidentService(self.db)
                inc_svc.add_event(
                    identifier=str(complaint.incident_id),
                    data=IncidentEventCreate(
                        event_type="complaint_filed",
                        timestamp=now,
                        details={
                            "complaint_id": complaint.complaint_id,
                            "official_reference": req.official_reference_number,
                            "reporting_channel": complaint.reporting_channel,
                            "submitted_by": user.username,
                        },
                    ),
                )
            except Exception:
                pass

        # Record audit event on brand
        self.brand_repo.add_verification_event(
            brand_id=complaint.brand_id,
            action="complaint_submitted",
            status=complaint.brand.verification_status,
            evidence={
                "complaint_id": complaint.complaint_id,
                "official_reference_number": req.official_reference_number,
                "channel": complaint.reporting_channel,
            },
            reviewed_by=user.username,
        )

        self.db.commit()
        self.db.refresh(complaint)
        return self._to_detail_response(complaint)

    def add_follow_up(
        self,
        complaint_id: str,
        req: ComplaintFollowUpCreate,
        user: AuthenticatedUser,
    ) -> ComplaintDetailResponse:
        complaint = self._get_complaint_or_404(complaint_id)
        self._check_ownership(complaint.brand, user)

        now = datetime.now(timezone.utc)
        if req.submission_status:
            complaint.submission_status = req.submission_status

        if req.resolution_status:
            complaint.resolution_status = req.resolution_status
            if req.resolution_status in ("takedown_completed", "domain_suspended"):
                complaint.resolved_at = now
                # Associate resolution with incident
                if complaint.incident_id:
                    try:
                        inc_svc = IncidentService(self.db)
                        inc_svc.add_event(
                            identifier=str(complaint.incident_id),
                            data=IncidentEventCreate(
                                event_type="threat_mitigated",
                                timestamp=now,
                                details={
                                    "complaint_id": complaint.complaint_id,
                                    "resolution_status": req.resolution_status,
                                    "notes": req.notes,
                                },
                            ),
                        )
                    except Exception:
                        pass

        self.repo.add_event(
            complaint_id=complaint.id,
            event_type="follow_up_added",
            actor_id=user.username,
            actor_role=user.role.value,
            notes=req.notes,
            event_data={
                "submission_status": complaint.submission_status,
                "resolution_status": complaint.resolution_status,
                "custom_details": req.details,
            },
        )

        self.db.commit()
        self.db.refresh(complaint)
        return self._to_detail_response(complaint)

    def list_complaints(
        self,
        user: AuthenticatedUser,
        brand_id: Optional[str] = None,
        complaint_status: Optional[str] = None,
        submission_status: Optional[str] = None,
        reporting_channel: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Dict[str, Any]:
        brand_pk: Optional[int] = None
        if brand_id:
            brand = self.brand_repo.get_by_brand_id(brand_id)
            if not brand:
                raise NotFoundError(f"Brand '{brand_id}' not found.")
            self._check_ownership(brand, user)
            brand_pk = brand.id
        elif user.role != UserRole.ADMIN:
            user_brands, _ = self.brand_repo.list_brands(owner_id=user.user_id, limit=100)
            if not user_brands:
                return {"items": [], "total": 0, "skip": skip, "limit": limit}
            brand_pk = user_brands[0].id

        items, total = self.repo.list_complaints(
            brand_id=brand_pk,
            complaint_status=complaint_status,
            submission_status=submission_status,
            reporting_channel=reporting_channel,
            skip=skip,
            limit=limit,
        )

        return {
            "items": [self._to_summary_response(item) for item in items],
            "total": total,
            "skip": skip,
            "limit": limit,
        }

    def get_timeline(self, complaint_id: str, user: AuthenticatedUser) -> List[ComplaintEventResponse]:
        complaint = self._get_complaint_or_404(complaint_id)
        self._check_ownership(complaint.brand, user)
        events = self.repo.list_events(complaint.id)
        return [ComplaintEventResponse.model_validate(e) for e in events]

    def _to_summary_response(self, c: CyberComplaint) -> ComplaintResponse:
        return ComplaintResponse(
            id=c.id,
            complaint_id=c.complaint_id,
            brand_id=c.brand_id,
            brand_ref=c.brand_ref or (c.brand.brand_id if c.brand else None),
            brand_name=c.brand.name if c.brand else None,
            incident_id=c.incident_id,
            incident_ref=c.incident_ref,
            detection_id=c.detection_id,
            reporting_party_id=c.reporting_party_id,
            reporting_party_name=c.reporting_party_name,
            reporting_party_email=c.reporting_party_email,
            suspected_domain=c.suspected_domain,
            suspected_url=c.suspected_url,
            detection_timestamp=c.detection_timestamp,
            reporting_channel=c.reporting_channel,
            complaint_status=c.complaint_status,
            submission_status=c.submission_status,
            resolution_status=c.resolution_status,
            official_reference_number=c.official_reference_number,
            submitted_at=c.submitted_at,
            submitted_by=c.submitted_by,
            resolved_at=c.resolved_at,
            reviewed_by=c.reviewed_by,
            reviewed_at=c.reviewed_at,
            review_notes=c.review_notes,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )

    def _to_detail_response(self, c: CyberComplaint) -> ComplaintDetailResponse:
        summary = self._to_summary_response(c)
        events = [ComplaintEventResponse.model_validate(e) for e in (c.events or [])]
        return ComplaintDetailResponse(
            **summary.model_dump(),
            incident_description=c.incident_description,
            evidence_references=c.evidence_references or {},
            threat_assessment_summary=c.threat_assessment_summary or {},
            narrative_sections=c.narrative_sections or {},
            unsupported_allegations=c.unsupported_allegations or [],
            missing_evidence=c.missing_evidence or [],
            submission_details=c.submission_details or {},
            events=events,
        )
