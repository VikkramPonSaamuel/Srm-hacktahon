from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimiter
from app.core.security import AuthenticatedUser, UserRole, get_current_user, require_role
from app.db.session import get_db
from app.schemas.brand_protection import (
    AnalyzeDomainRequest,
    BrandAssetCreate,
    BrandAssetResponse,
    BrandProfileCreate,
    BrandProfileDetailResponse,
    BrandProfileResponse,
    BrandProfileUpdate,
    BrandVerificationEventResponse,
    BrandVerificationReviewRequest,
    BrandVerificationSubmitRequest,
    DetectedImpersonationResponse,
    DetectedImpersonationReviewRequest,
    FeedIngestRequest,
    OfficialDomainCreate,
    OfficialDomainResponse,
    OfficialDomainStatusUpdate,
    OfficialDomainVerifyRequest,
    SuspiciousUrlIntakeRequest,
)
from app.services.brand_protection_service import BrandProtectionService

router = APIRouter()


@router.post(
    "",
    response_model=BrandProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register Brand Profile",
    description="Registers official brand identity and establishes owner authorized representative reference.",
)
def register_brand(
    payload: BrandProfileCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> BrandProfileResponse:
    service = BrandProtectionService(db)
    return service.create_brand(data=payload, user=user)


@router.get(
    "",
    response_model=List[BrandProfileResponse],
    summary="List Authorized Brand Profiles",
    description="Lists brand profiles accessible to the user. Non-admins receive only their owned brands.",
)
def list_brands(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    verification_status: Optional[str] = Query(None, description="Filter by verification status"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> List[BrandProfileResponse]:
    service = BrandProtectionService(db)
    return service.list_brands(user=user, verification_status=verification_status, skip=skip, limit=limit)


# ------------------------------------------------------------------------------
# Impersonation Detection Engine & Intake Endpoints
# ------------------------------------------------------------------------------


@router.post(
    "/intake",
    response_model=DetectedImpersonationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit Suspicious URL / Intake",
    description="Submits a suspicious candidate URL for brand impersonation evaluation and SSRF-safe analysis.",
)
def intake_suspicious_url(
    payload: SuspiciousUrlIntakeRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
    _rate_limit: None = Depends(RateLimiter()),
) -> DetectedImpersonationResponse:
    service = BrandProtectionService(db)
    return service.intake_suspicious_url(req=payload, user=user)


@router.post(
    "/analyze",
    response_model=DetectedImpersonationResponse,
    summary="Analyze Domain for Brand Impersonation",
    description="Performs on-demand lookalike analysis, content evaluation, and threat scoring against a registered brand.",
)
def analyze_domain(
    payload: AnalyzeDomainRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> DetectedImpersonationResponse:
    service = BrandProtectionService(db)
    return service.analyze_domain(req=payload, user=user)


@router.post(
    "/feed-ingest",
    response_model=Dict[str, Any],
    summary="Ingest Threat Intelligence Feed",
    description="Ingests suspicious candidate domains from a configured threat discovery connector or source.",
)
def ingest_feed(
    payload: FeedIngestRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> Dict[str, Any]:
    service = BrandProtectionService(db)
    return service.ingest_from_feed(req=payload, user=user)


@router.get(
    "/detections",
    response_model=Dict[str, Any],
    summary="List Suspicious Domains",
    description="Lists suspicious candidate domains with filtering by brand, severity, status, and detection date.",
)
def list_detections(
    brand_id: Optional[str] = Query(None, description="Filter by brand profile ID"),
    severity: Optional[str] = Query(None, description="Filter by severity: low, medium, high, critical"),
    status: Optional[str] = Query(None, description="Filter by status: candidate, analyzed, confirmed_malicious, false_positive, dismissed"),
    start_date: Optional[datetime] = Query(None, description="Earliest detection date (ISO 8601)"),
    end_date: Optional[datetime] = Query(None, description="Latest detection date (ISO 8601)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> Dict[str, Any]:
    service = BrandProtectionService(db)
    return service.list_detections(
        user=user,
        brand_id=brand_id,
        severity=severity,
        status=status,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/detections/{detection_id}",
    response_model=DetectedImpersonationResponse,
    summary="Retrieve Analysis Result",
    description="Retrieves threat assessment, detection reasons, and scoring for a detected candidate.",
)
def get_detection(
    detection_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> DetectedImpersonationResponse:
    service = BrandProtectionService(db)
    return service.get_detection(detection_id=detection_id, user=user)


@router.get(
    "/detections/{detection_id}/evidence",
    response_model=Dict[str, Any],
    summary="View Evidence and Assessment Explanations",
    description="Retrieves granular evidence references, technical indicators, and explainable scoring signals.",
)
def get_detection_evidence(
    detection_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> Dict[str, Any]:
    service = BrandProtectionService(db)
    return service.get_detection_evidence(detection_id=detection_id, user=user)


@router.post(
    "/detections/{detection_id}/review",
    response_model=DetectedImpersonationResponse,
    summary="Review Detected Impersonation",
    description="Marks candidate as reviewed, confirms malicious impersonation, or dismisses as false positive.",
)
def review_detection(
    detection_id: str,
    payload: DetectedImpersonationReviewRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> DetectedImpersonationResponse:
    service = BrandProtectionService(db)
    return service.review_detection(detection_id=detection_id, req=payload, user=user)


@router.get(
    "/detections/{detection_id}/incidents",
    response_model=Dict[str, Any],
    summary="View Associated Incidents and Historical Patterns",
    description="Retrieves linked platform incidents, timeline audit trail, and relevant historical failure patterns.",
)
def get_detection_incidents(
    detection_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> Dict[str, Any]:
    service = BrandProtectionService(db)
    return service.get_detection_incidents(detection_id=detection_id, user=user)


# ------------------------------------------------------------------------------
# Brand Profiles
# ------------------------------------------------------------------------------


@router.get(
    "/{brand_id}",
    response_model=BrandProfileDetailResponse,
    summary="Retrieve Brand Profile Details",
    description="Retrieves brand profile including associated official domains, assets, and verification events.",
)
def get_brand(
    brand_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> BrandProfileDetailResponse:
    service = BrandProtectionService(db)
    return service.get_brand(brand_id=brand_id, user=user)


@router.put(
    "/{brand_id}",
    response_model=BrandProfileResponse,
    summary="Update Brand Profile",
    description="Updates brand profile information. Restricted to brand owner or administrator.",
)
def update_brand(
    brand_id: str,
    payload: BrandProfileUpdate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> BrandProfileResponse:
    service = BrandProtectionService(db)
    return service.update_brand(brand_id=brand_id, data=payload, user=user)


# ------------------------------------------------------------------------------
# Official Domains
# ------------------------------------------------------------------------------


@router.post(
    "/{brand_id}/domains",
    response_model=OfficialDomainResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add Official Domain",
    description="Canonicalizes, normalizes, and registers an official domain for the brand.",
)
def add_official_domain(
    brand_id: str,
    payload: OfficialDomainCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> OfficialDomainResponse:
    service = BrandProtectionService(db)
    return service.add_domain(brand_id=brand_id, data=payload, user=user)


@router.get(
    "/{brand_id}/domains",
    response_model=List[OfficialDomainResponse],
    summary="List Official Domains",
    description="Retrieves all registered official domains for the specified brand.",
)
def list_official_domains(
    brand_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> List[OfficialDomainResponse]:
    service = BrandProtectionService(db)
    return service.list_domains(brand_id=brand_id, user=user)


@router.post(
    "/{brand_id}/domains/{domain_id}/verify",
    response_model=OfficialDomainResponse,
    summary="Verify Official Domain",
    description="Verifies official domain ownership via DNS TXT token, meta tag, or administrator approval.",
)
def verify_official_domain(
    brand_id: str,
    domain_id: str,
    payload: OfficialDomainVerifyRequest = OfficialDomainVerifyRequest(),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> OfficialDomainResponse:
    service = BrandProtectionService(db)
    return service.verify_domain(brand_id=brand_id, domain_id=domain_id, req=payload, user=user)


@router.patch(
    "/{brand_id}/domains/{domain_id}/status",
    response_model=OfficialDomainResponse,
    summary="Update Official Domain Active Status",
    description="Enables or disables an official domain.",
)
def update_domain_status(
    brand_id: str,
    domain_id: str,
    payload: OfficialDomainStatusUpdate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> OfficialDomainResponse:
    service = BrandProtectionService(db)
    return service.update_domain_status(
        brand_id=brand_id, domain_id=domain_id, is_active=payload.is_active, user=user
    )


# ------------------------------------------------------------------------------
# Brand Assets
# ------------------------------------------------------------------------------


@router.post(
    "/{brand_id}/assets",
    response_model=BrandAssetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add Brand Asset (JSON/Base64)",
    description="Registers a brand asset (logo, image, font, text sample, color palette) with magic-byte validation.",
)
def add_brand_asset(
    brand_id: str,
    payload: BrandAssetCreate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> BrandAssetResponse:
    service = BrandProtectionService(db)
    return service.add_asset(brand_id=brand_id, data=payload, user=user)


@router.post(
    "/{brand_id}/assets/upload",
    response_model=BrandAssetResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Brand Asset File",
    description="Uploads a binary asset file (e.g. logo PNG/JPG/SVG) via multipart form data with content inspection.",
)
async def upload_brand_asset_file(
    brand_id: str,
    asset_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> BrandAssetResponse:
    service = BrandProtectionService(db)
    content = await file.read()
    import base64
    payload = BrandAssetCreate(
        asset_type=asset_type,
        content_base64=base64.b64encode(content).decode("utf-8"),
        custom_metadata={"original_filename": file.filename},
    )
    return service.add_asset(brand_id=brand_id, data=payload, user=user)


@router.get(
    "/{brand_id}/assets",
    response_model=List[BrandAssetResponse],
    summary="List Brand Assets",
    description="Retrieves all registered digital assets for the brand.",
)
def list_brand_assets(
    brand_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> List[BrandAssetResponse]:
    service = BrandProtectionService(db)
    return service.list_assets(brand_id=brand_id, user=user)


# ------------------------------------------------------------------------------
# Verification Workflow
# ------------------------------------------------------------------------------


@router.post(
    "/{brand_id}/submit-verification",
    response_model=BrandProfileResponse,
    summary="Submit Brand for Administrative Review",
    description="Submits the brand profile for formal verification review. Requires at least one registered official domain.",
)
def submit_brand_for_verification(
    brand_id: str,
    payload: BrandVerificationSubmitRequest = BrandVerificationSubmitRequest(),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> BrandProfileResponse:
    service = BrandProtectionService(db)
    return service.submit_for_verification(brand_id=brand_id, req=payload, user=user)


@router.post(
    "/{brand_id}/review",
    response_model=BrandProfileResponse,
    summary="Review Brand Verification Request (Administrator)",
    description=(
        "Approves or rejects a brand verification request. "
        "Strictly requires ADMIN role and verified official domain evidence. Rate limited."
    ),
)
def review_brand_verification(
    brand_id: str,
    payload: BrandVerificationReviewRequest,
    db: Session = Depends(get_db),
    admin_user: AuthenticatedUser = Depends(require_role(UserRole.ADMIN)),
    _rate_limit: None = Depends(RateLimiter()),
) -> BrandProfileResponse:
    service = BrandProtectionService(db)
    return service.review_verification(brand_id=brand_id, req=payload, admin_user=admin_user)


@router.get(
    "/{brand_id}/verification-history",
    response_model=List[BrandVerificationEventResponse],
    summary="Retrieve Brand Verification History",
    description="Retrieves chronological verification actions, evidence events, and administrator review records.",
)
def get_verification_history(
    brand_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> List[BrandVerificationEventResponse]:
    service = BrandProtectionService(db)
    return service.get_verification_history(brand_id=brand_id, user=user)
