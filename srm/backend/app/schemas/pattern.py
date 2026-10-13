from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class FailurePatternBase(BaseModel):
    name: str = Field(..., max_length=150, description="Descriptive human-readable pattern name")
    description: str = Field(..., description="Root cause hypothesis and behavioral explanation")
    failure_category: str = Field(..., max_length=50, description="Failure category identifier")
    module: Optional[str] = Field(default=None, description="Module: transaction_reliability, brand_impersonation, website_security")
    service_name: Optional[str] = Field(default=None, max_length=100, description="Primary affected service")
    severity: str = Field(default="high", max_length=20, description="Severity: low, medium, high, critical")
    affected_services: List[str] = Field(default_factory=list, description="List of all affected services")
    affected_steps: List[str] = Field(default_factory=list, description="List of all affected journey steps")
    status: str = Field(default="candidate", max_length=30, description="Status: candidate, confirmed, rejected, retired")


class FailurePatternResponse(FailurePatternBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pattern_id: str
    incident_count: int
    confidence_score: float
    example_incident_ids: List[str] = Field(default_factory=list)
    first_detected_at: datetime
    last_detected_at: datetime
    last_evaluated_at: datetime
    created_at: datetime
    updated_at: datetime


class PatternMatchEvidence(BaseModel):
    incident_id: str
    matched_at: datetime
    similarity_score: float
    match_reasons: List[str] = Field(default_factory=list)


class FailurePatternDetailResponse(FailurePatternResponse):
    detection_rules: Dict[str, Any] = Field(default_factory=dict)
    evidence_matches: List[PatternMatchEvidence] = Field(default_factory=list)


class PatternStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(candidate|confirmed|rejected|retired)$", description="New status")
    notes: Optional[str] = Field(default=None, description="Optional reviewer justification notes")


class PatternFrequencyPoint(BaseModel):
    date: str = Field(..., description="ISO Date bucket (YYYY-MM-DD)")
    count: int = Field(..., description="Number of matching incidents in period")


class PatternFrequencyResponse(BaseModel):
    pattern_id: str
    pattern_name: str
    total_incidents: int
    frequency: List[PatternFrequencyPoint]


class PatternEvidenceResponse(BaseModel):
    pattern_id: str
    pattern_name: str
    confidence_score: float
    detection_rules: Dict[str, Any]
    matches: List[PatternMatchEvidence]


class ReevaluateResponse(BaseModel):
    total_incidents_analyzed: int
    total_matches_found: int
    total_patterns_active: int
    message: str = "Historical incident re-evaluation complete"
