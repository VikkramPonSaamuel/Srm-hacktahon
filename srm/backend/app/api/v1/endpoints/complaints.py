from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.brand_protection.complaint_channels import ComplaintChannelRegistry
from app.core.rate_limit import RateLimiter
from app.core.security import AuthenticatedUser, UserRole, require_role
from app.db.session import get_db
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
from app.services.complaint_service import ComplaintService

router = APIRouter()


@router.post(
    "",
    response_model=ComplaintDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Complaint Package Draft from Incident",
    description="Initializes a structured, evidence-backed complaint package from an eligible brand impersonation incident.",
)
def create_complaint(
    payload: ComplaintCreateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
    _rate_limit: None = Depends(RateLimiter()),
) -> ComplaintDetailResponse:
    service = ComplaintService(db)
    return service.create_complaint_from_incident(req=payload, user=user)


@router.get(
    "",
    response_model=Dict[str, Any],
    summary="List Cyber Complaints",
    description="Lists complaint packages with filtering by brand, preparation status, submission status, and channel.",
)
def list_complaints(
    brand_id: Optional[str] = Query(None, description="Filter by brand profile ID"),
    complaint_status: Optional[str] = Query(None, description="Filter by complaint preparation status"),
    submission_status: Optional[str] = Query(None, description="Filter by submission status"),
    channel: Optional[str] = Query(None, description="Filter by reporting channel"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> Dict[str, Any]:
    service = ComplaintService(db)
    return service.list_complaints(
        user=user,
        brand_id=brand_id,
        complaint_status=complaint_status,
        submission_status=submission_status,
        reporting_channel=channel,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/channels",
    response_model=List[Dict[str, Any]],
    summary="List Supported Reporting Channels",
    description="Lists configured reporting channel adapters and external integration statuses.",
)
def list_reporting_channels(
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> List[Dict[str, Any]]:
    return ComplaintChannelRegistry.list_channels()


@router.get(
    "/{complaint_id}",
    response_model=ComplaintDetailResponse,
    summary="Retrieve Cyber Complaint Package",
    description="Retrieves structured complaint details, evidence references, narrative sections, and validation findings.",
)
def get_complaint(
    complaint_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> ComplaintDetailResponse:
    service = ComplaintService(db)
    return service.get_complaint(complaint_id=complaint_id, user=user)


@router.put(
    "/{complaint_id}",
    response_model=ComplaintDetailResponse,
    summary="Update Complaint Narrative and Details",
    description="Edits narrative sections or contact details and re-validates evidence sufficiency.",
)
def update_complaint(
    complaint_id: str,
    payload: ComplaintUpdateRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> ComplaintDetailResponse:
    service = ComplaintService(db)
    return service.update_complaint(complaint_id=complaint_id, req=payload, user=user)


@router.post(
    "/{complaint_id}/submit-review",
    response_model=ComplaintDetailResponse,
    summary="Submit Complaint for Authorized Human Review",
    description="Transitions complaint draft to pending_review once all required evidence is validated.",
)
def submit_for_review(
    complaint_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> ComplaintDetailResponse:
    service = ComplaintService(db)
    return service.submit_for_review(complaint_id=complaint_id, user=user)


@router.post(
    "/{complaint_id}/review",
    response_model=ComplaintDetailResponse,
    summary="Review Complaint Package (Approve, Reject, Request Changes)",
    description="Authorized reviewer adjudicates the complaint package. Requires OPERATOR or ADMIN role.",
)
def review_complaint(
    complaint_id: str,
    payload: ComplaintReviewRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> ComplaintDetailResponse:
    service = ComplaintService(db)
    return service.review_complaint(complaint_id=complaint_id, req=payload, user=user)


@router.get(
    "/{complaint_id}/export",
    response_model=ComplaintExportResponse,
    summary="Export Downloadable Complaint Package",
    description="Generates formatted plain text/markdown and structured JSON complaint package for external transmission.",
)
def export_complaint(
    complaint_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> ComplaintExportResponse:
    service = ComplaintService(db)
    return service.export_package(complaint_id=complaint_id, user=user)


@router.post(
    "/{complaint_id}/record-submission",
    response_model=ComplaintDetailResponse,
    summary="Record External Submission Details",
    description="Records external transmission confirmation with official reference/ticket number and audit log.",
)
def record_submission(
    complaint_id: str,
    payload: ComplaintRecordSubmissionRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> ComplaintDetailResponse:
    service = ComplaintService(db)
    return service.record_external_submission(complaint_id=complaint_id, req=payload, user=user)


@router.post(
    "/{complaint_id}/follow-ups",
    response_model=ComplaintDetailResponse,
    summary="Add Complaint Follow-up and Status Update",
    description="Appends follow-up communications, external status changes, and takedown resolution states.",
)
def add_follow_up(
    complaint_id: str,
    payload: ComplaintFollowUpCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> ComplaintDetailResponse:
    service = ComplaintService(db)
    return service.add_follow_up(complaint_id=complaint_id, req=payload, user=user)


@router.get(
    "/{complaint_id}/timeline",
    response_model=List[ComplaintEventResponse],
    summary="Retrieve Complaint Audit Timeline and Follow-up History",
    description="Returns chronological audit trail of draft creation, reviews, external submissions, and follow-ups.",
)
def get_complaint_timeline(
    complaint_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> List[ComplaintEventResponse]:
    service = ComplaintService(db)
    return service.get_timeline(complaint_id=complaint_id, user=user)
