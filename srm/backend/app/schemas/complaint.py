from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ComplaintCreateRequest(BaseModel):
    incident_id: int = Field(..., description="Eligible brand impersonation incident ID")
    reporting_channel: str = Field(
        "registrar_abuse",
        description="Target reporting channel: 'registrar_abuse', 'hosting_provider', 'manual_portal', 'download_package'",
    )
    force_new: bool = Field(False, description="Whether to create a new draft if one already exists for this incident")


class ComplaintUpdateRequest(BaseModel):
    reporting_channel: Optional[str] = Field(None, description="Updated reporting channel")
    reporting_party_name: Optional[str] = Field(None, max_length=150, description="Authorized representative name")
    reporting_party_email: Optional[str] = Field(None, max_length=255, description="Authorized contact email")
    narrative_sections: Optional[Dict[str, str]] = Field(None, description="Updated modular narrative sections")


class ComplaintReviewRequest(BaseModel):
    action: str = Field(
        ...,
        pattern="^(approve|reject|request_changes)$",
        description="Review decision: 'approve', 'reject', or 'request_changes'",
    )
    review_notes: Optional[str] = Field(None, max_length=3000, description="Review feedback or change requests")


class ComplaintRecordSubmissionRequest(BaseModel):
    official_reference_number: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Official external ticket ID, case number, or receipt reference",
    )
    submission_notes: Optional[str] = Field(None, max_length=2000, description="Notes on external submission")
    submission_details: Dict[str, Any] = Field(default_factory=dict, description="Metadata from external portal")


class ComplaintFollowUpCreate(BaseModel):
    notes: str = Field(..., min_length=1, max_length=3000, description="Follow-up note or update transcript")
    submission_status: Optional[str] = Field(
        None,
        pattern="^(acknowledged|under_review|action_taken|rejected_by_channel|closed)$",
        description="Optional submission state update",
    )
    resolution_status: Optional[str] = Field(
        None,
        pattern="^(pending|takedown_completed|domain_suspended|rejected|dismissed)$",
        description="Optional resolution state update",
    )
    details: Dict[str, Any] = Field(default_factory=dict, description="Additional context or attachment metadata")


class ComplaintEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: str
    complaint_id: int
    event_type: str
    actor_id: str
    actor_role: str
    notes: Optional[str] = None
    event_data: Dict[str, Any] = {}
    timestamp: datetime
    created_at: datetime


class ComplaintResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    complaint_id: str
    brand_id: int
    brand_ref: Optional[str] = None
    brand_name: Optional[str] = None
    incident_id: Optional[int] = None
    incident_ref: Optional[str] = None
    detection_id: Optional[str] = None
    reporting_party_id: str
    reporting_party_name: str
    reporting_party_email: Optional[str] = None
    suspected_domain: str
    suspected_url: str
    detection_timestamp: datetime
    reporting_channel: str
    complaint_status: str
    submission_status: str
    resolution_status: str
    official_reference_number: Optional[str] = None
    submitted_at: Optional[datetime] = None
    submitted_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ComplaintDetailResponse(ComplaintResponse):
    incident_description: str
    evidence_references: Dict[str, Any] = {}
    threat_assessment_summary: Dict[str, Any] = {}
    narrative_sections: Dict[str, str] = {}
    unsupported_allegations: List[str] = []
    missing_evidence: List[str] = []
    submission_details: Dict[str, Any] = {}
    events: List[ComplaintEventResponse] = []


class ComplaintExportResponse(BaseModel):
    complaint_id: str
    channel: str
    portal_url: Optional[str] = None
    export_timestamp: str
    formatted_text: str
    structured_data: Dict[str, Any]
