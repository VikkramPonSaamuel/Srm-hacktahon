from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class SecurityEventIngestRequest(BaseModel):
    """Normalized or raw security event ingestion request."""

    source_integration: str = Field(
        ...,
        description="Source telemetry type: 'web_server', 'api_gateway', 'waf', 'auth_service', 'synthetic_dev'",
    )
    service_name: str = Field(..., min_length=1, max_length=100, description="Target service identifier")
    http_method: str = Field(..., min_length=1, max_length=10, description="HTTP method e.g. GET, POST")
    endpoint: str = Field(..., min_length=1, max_length=255, description="Normalized route or endpoint")
    status_code: int = Field(..., ge=100, le=599, description="HTTP response status code")
    event_category: str = Field("api_request", max_length=50, description="Category of event")
    rule_id: Optional[str] = Field(None, max_length=100, description="WAF or gateway rule identifier")
    client_ip: str = Field(..., min_length=1, max_length=64, description="Client IP address")
    user_agent: Optional[str] = Field(None, max_length=255, description="Client User-Agent")
    request_indicators: Dict[str, Any] = Field(
        default_factory=dict,
        description="Sanitized request indicators (query params, body keys, headers)",
    )
    auth_outcome: str = Field("none", max_length=20, description="'success', 'failure', or 'none'")
    action_taken: str = Field("allowed", max_length=30, description="'allowed', 'blocked', 'rate_limited', etc.")
    correlation_id: Optional[str] = Field(None, max_length=64, description="Correlation identifier")
    environment: str = Field("production", max_length=30, description="Environment name")
    provenance: Dict[str, Any] = Field(default_factory=dict, description="Telemetry origin details")
    timestamp: Optional[datetime] = Field(None, description="Event occurrence timestamp")


class SecurityEventBatchIngestRequest(BaseModel):
    """Batch ingestion schema for security telemetry events."""

    events: List[SecurityEventIngestRequest] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="List of security events to ingest (max 500 per batch)",
    )


class SecurityEventResponse(BaseModel):
    """Normalized security telemetry event response."""

    model_config = ConfigDict(from_attributes=True)

    event_id: str
    timestamp: datetime
    source_integration: str
    service_name: str
    http_method: str
    endpoint: str
    status_code: int
    event_category: str
    rule_id: Optional[str] = None
    client_ip: str
    user_agent: Optional[str] = None
    request_indicators: Dict[str, Any] = Field(default_factory=dict)
    auth_outcome: str
    action_taken: str
    correlation_id: Optional[str] = None
    environment: str
    provenance: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class DetectedWebsiteThreatResponse(BaseModel):
    """Aggregated detected website threat assessment."""

    model_config = ConfigDict(from_attributes=True)

    threat_id: str
    threat_category: str
    severity: str
    risk_score: float
    detection_rule_id: str
    rule_name: str
    status: str
    service_name: str
    endpoint: str
    client_ip: Optional[str] = None
    first_observed_at: datetime
    last_observed_at: datetime
    correlated_event_count: int
    confidence_score: float
    evidence_quality: str
    recommended_response: str
    requires_human_review: bool
    evidence_references: Dict[str, Any] = Field(default_factory=dict)
    detection_reasons: List[str] = Field(default_factory=list)
    incident_id: Optional[int] = None
    incident_ref: Optional[str] = None
    correlation_id: Optional[str] = None
    review_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class ThreatDetailResponse(DetectedWebsiteThreatResponse):
    """Detailed threat assessment including supporting evidence events."""

    supporting_events: List[SecurityEventResponse] = Field(default_factory=list)
    historical_patterns: List[Dict[str, Any]] = Field(default_factory=list)


class ThreatRuleConfigResponse(BaseModel):
    """Configured threat detection rule."""

    model_config = ConfigDict(from_attributes=True)

    rule_id: str
    rule_name: str
    threat_category: str
    description: str
    is_enabled: bool
    severity: str
    threshold_count: int
    time_window_seconds: int
    config_parameters: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ThreatRuleConfigUpdate(BaseModel):
    """Update detection rule configuration and thresholds."""

    is_enabled: Optional[bool] = None
    severity: Optional[str] = Field(None, pattern="^(low|medium|high|critical)$")
    threshold_count: Optional[int] = Field(None, ge=1, le=10000)
    time_window_seconds: Optional[int] = Field(None, ge=5, le=86400)
    config_parameters: Optional[Dict[str, Any]] = None


class FalsePositiveReviewRequest(BaseModel):
    """Submit a false-positive adjudication or status update."""

    status: str = Field("false_positive", pattern="^(false_positive|dismissed|investigating|mitigated)$")
    review_notes: str = Field(..., min_length=3, max_length=2000, description="Auditable reasoning for review decision")


class IngestResultResponse(BaseModel):
    """Result of single or batch telemetry ingestion."""

    ingested_count: int
    threats_detected: int
    incidents_created: int
    sample_threat_ids: List[str] = Field(default_factory=list)
    simulated_telemetry: bool = False
