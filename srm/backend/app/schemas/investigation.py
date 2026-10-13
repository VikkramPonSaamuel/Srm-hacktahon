from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class IncidentEvidence(BaseModel):
    """Structured evidence package collected from factual database records."""

    incident_id: str
    detected_at: datetime
    severity: str
    title: str
    description: str
    service_name: Optional[str] = None
    failure_category: Optional[str] = None
    journey_name: Optional[str] = None
    journey_type: Optional[str] = None
    failed_step: Optional[Dict[str, Any]] = None
    all_step_executions: List[Dict[str, Any]] = Field(default_factory=list)
    service_health_snapshots: List[Dict[str, Any]] = Field(default_factory=list)
    pattern_matches: List[Dict[str, Any]] = Field(default_factory=list)
    recovery_executions: List[Dict[str, Any]] = Field(default_factory=list)
    similar_historical_incidents: List[Dict[str, Any]] = Field(default_factory=list)
    untrusted_diagnostics: Dict[str, Any] = Field(default_factory=dict)


class PlaybookPolicyValidation(BaseModel):
    """Deterministic validation of an AI-recommended countermeasure against safety policies."""

    playbook_id: Optional[str] = None
    playbook_name: Optional[str] = None
    is_approved: bool = False
    is_enabled: bool = False
    can_execute_automatically: bool = False
    requires_human_approval: bool = True
    blocked_reason: Optional[str] = None
    allowlisted_actions: List[str] = Field(default_factory=list)


class LLMInvestigationOutput(BaseModel):
    """Validated structured schema expected from LLM or deterministic analysis layer."""

    summary: str = Field(..., description="High-level summary of the incident")
    customer_impact: str = Field(..., description="Estimated end-user and business transaction impact")
    failed_component: Optional[str] = Field(default=None, description="Identified microservice or gateway")
    failed_step: Optional[str] = Field(default=None, description="Specific workflow step that broke")
    evidence_supporting_diagnosis: List[str] = Field(default_factory=list, description="Concrete supporting evidence points")
    root_cause_hypothesis: str = Field(..., description="Primary root-cause hypothesis")
    alternative_explanations: List[str] = Field(default_factory=list, description="Alternative hypotheses if evidence is partial")
    related_historical_incidents: List[str] = Field(default_factory=list, description="Matching past incident IDs")
    matching_known_patterns: List[str] = Field(default_factory=list, description="Matching failure pattern names/IDs")
    recommended_countermeasure: Optional[str] = Field(default=None, description="Recommended remediation action or playbook name")
    recommended_playbook_id: Optional[str] = Field(default=None, description="Identifier of the recommended playbook")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Confidence in the diagnosis (0.0 to 1.0)")
    evidence_assessment: str = Field(
        ...,
        description="'conclusive', 'moderate', 'insufficient', or 'inconclusive'",
    )
    human_investigation_required: bool = Field(..., description="Whether human SRE/operator investigation is mandatory")


class AnalyzeIncidentRequest(BaseModel):
    """Request payload to initiate or re-run an incident investigation."""

    force_mode: Optional[str] = Field(
        default=None,
        description="Optional override: 'deterministic', 'llm_assisted', or None (uses config default)",
    )
    notes: Optional[str] = Field(default=None, max_length=500, description="Operator investigation notes")


class InvestigationResponse(BaseModel):
    """Complete investigation result record with evidence references and safety validations."""

    model_config = ConfigDict(from_attributes=True)

    analysis_id: str
    incident_id: str
    analysis_mode: str
    provider: Optional[str] = None
    model_name: Optional[str] = None
    summary: str
    customer_impact: str
    failed_component: Optional[str] = None
    failed_step: Optional[str] = None
    root_cause_hypothesis: str
    alternative_explanations: List[str]
    confidence_score: float
    evidence_assessment: str
    human_investigation_required: bool
    recommended_playbook_id: Optional[str] = None
    recommended_action: Optional[str] = None
    playbook_eligibility: Dict[str, Any]
    evidence_references: Dict[str, Any]
    related_incident_ids: List[str]
    matching_pattern_ids: List[str]
    created_at: datetime


class IncidentComparisonItem(BaseModel):
    """Comparison result against a historical incident."""

    incident_id: str
    similarity_score: float
    shared_service: bool
    shared_failure_category: bool
    title: str
    detected_at: datetime
    status: str
    resolution_summary: Optional[str] = None


class IncidentComparisonResponse(BaseModel):
    """Historical incident comparison report."""

    target_incident_id: str
    comparisons: List[IncidentComparisonItem]
    comparison_summary: str


class PlaybookRecommendationItem(BaseModel):
    """Candidate countermeasure with safety and policy verification."""

    playbook_id: str
    name: str
    recovery_strategy: str
    approval_status: str
    is_enabled: bool
    can_run: bool
    requires_approval: bool
    policy_notes: str
    confidence: float


class PlaybookRecommendationsResponse(BaseModel):
    """List of recommended playbooks validated against backend safety policies."""

    incident_id: str
    recommendations: List[PlaybookRecommendationItem]
