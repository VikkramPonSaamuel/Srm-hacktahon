from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class BrandProfileBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, description="Official brand name")
    description: Optional[str] = Field(None, max_length=2000, description="Description of the brand and primary services")
    contact_email: Optional[str] = Field(None, max_length=255, description="Authorized representative contact email")


class BrandProfileCreate(BrandProfileBase):
    pass


class BrandProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    contact_email: Optional[str] = Field(None, max_length=255)


class OfficialDomainCreate(BaseModel):
    domain_name: str = Field(..., min_length=3, max_length=255, description="Domain name (e.g. brand.com)")
    verification_method: str = Field("dns_txt", description="Verification method: 'dns_txt', 'meta_tag', 'admin_manual'")


class OfficialDomainStatusUpdate(BaseModel):
    is_active: bool = Field(..., description="Enable or disable official domain status")


class OfficialDomainVerifyRequest(BaseModel):
    verification_method: Optional[str] = Field(None, description="Verification method to test")
    proof_token: Optional[str] = Field(None, description="Optional proof token matching DNS TXT record or meta tag")


class OfficialDomainResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    domain_id: str
    domain_name: str
    verification_status: str
    verification_method: str
    verification_token: Optional[str] = None
    verified_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BrandAssetCreate(BaseModel):
    asset_type: str = Field(
        ...,
        description="Asset type: 'logo', 'brand_image', 'website_text_sample', 'color_palette', 'font_info', 'app_identifier', 'social_profile'"
    )
    content_base64: Optional[str] = Field(None, description="Base64-encoded binary content for images")
    text_or_json_payload: Optional[Any] = Field(None, description="Direct text string or JSON object for data assets")
    custom_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Safe client metadata")


class BrandAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asset_id: str
    asset_type: str
    storage_path: str
    file_hash: str
    content_type: str
    file_size_bytes: int
    asset_metadata: Dict[str, Any]
    verification_status: str
    created_at: datetime
    updated_at: datetime


class BrandVerificationEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
    verification_action: str
    status: str
    timestamp: datetime
    sanitized_evidence: Dict[str, Any]
    reviewed_by: Optional[str] = None


class BrandVerificationSubmitRequest(BaseModel):
    notes: Optional[str] = Field(None, max_length=1000, description="Optional submission notes for reviewers")


class BrandVerificationReviewRequest(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$", description="'approve' or 'reject'")
    review_notes: Optional[str] = Field(None, max_length=2000, description="Administrative evaluation notes")
    override_verified_domain_requirement: bool = Field(
        False,
        description="Explicit administrator override allowing approval without verified domain"
    )


class BrandProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    brand_id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    contact_email: Optional[str] = None
    registration_status: str
    verification_status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    is_demo: bool = False
    created_at: datetime
    updated_at: datetime
    domain_count: int = 0
    asset_count: int = 0


class BrandProfileDetailResponse(BrandProfileResponse):
    domains: List[OfficialDomainResponse] = []
    assets: List[BrandAssetResponse] = []
    recent_events: List[BrandVerificationEventResponse] = []


# ------------------------------------------------------------------------------
# Impersonation Detection Schemas
# ------------------------------------------------------------------------------


class SuspiciousUrlIntakeRequest(BaseModel):
    brand_id: str = Field(..., description="Target brand ID to evaluate against")
    url: str = Field(..., min_length=3, description="Suspicious URL or domain name to inspect")
    source: str = Field("manual_submission", description="Intake source name")
    fetch_content: bool = Field(True, description="Whether to attempt SSRF-safe page content analysis")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Optional discovery metadata or threat-feed attributes")


class AnalyzeDomainRequest(BaseModel):
    brand_id: str = Field(..., description="Target brand ID to evaluate against")
    url: str = Field(..., min_length=3, description="URL or domain name to analyze")
    fetch_content: bool = Field(True, description="Whether to attempt SSRF-safe content analysis")


class DetectedImpersonationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    detection_id: str
    brand_id: str
    brand_name: str
    suspicious_url: str
    suspicious_domain: str
    intake_source: str
    attack_vector: str
    risk_score: float
    severity: str
    confidence_score: float
    evidence_quality: str
    status: str
    detection_reasons: List[str]
    evidence_references: Dict[str, Any]
    missing_evidence: List[str]
    review_recommendation: str
    incident_id: Optional[int] = None
    incident_ref: Optional[str] = None
    correlation_id: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    first_detected_at: datetime
    last_analyzed_at: datetime


class DetectedImpersonationReviewRequest(BaseModel):
    action: str = Field(
        ...,
        pattern="^(mark_reviewed|confirm_malicious|mark_false_positive|dismiss)$",
        description="Review decision: 'mark_reviewed', 'confirm_malicious', 'mark_false_positive', 'dismiss'"
    )
    notes: Optional[str] = Field(None, max_length=2000, description="Operator review notes or rationale")


class FeedIngestRequest(BaseModel):
    connector_name: str = Field("mock_threat_intel_feed", description="Name of the configured discovery connector")
    brand_id: str = Field(..., description="Brand ID to discover candidates for")
    limit: int = Field(20, ge=1, le=100, description="Max candidates to ingest")

