from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.synthetic.thresholds import MonitoringThresholds, SimulationScenario


class StartSyntheticJourneyRequest(BaseModel):
    journey_id: Optional[int] = Field(default=None, description="Optional target database journey ID")
    template_id: Optional[str] = Field(
        default="retail_checkout",
        description="Template identifier if no journey_id provided: 'retail_checkout', 'payment_failover', 'auth_and_search'",
    )
    scenario: SimulationScenario = Field(
        default=SimulationScenario.NONE,
        description="Simulated failure scenario (development/testing only)",
    )
    correlation_id: Optional[str] = Field(default=None, description="Custom trace correlation ID")
    environment: str = Field(default="development", description="Execution environment tag")
    max_retries_per_step: int = Field(default=1, ge=0, le=3, description="Bounded retry attempts per step")


class SyntheticStepResult(BaseModel):
    step_order: int
    step_name: str
    service_name: str
    status: str
    latency_ms: float
    http_status: Optional[int] = None
    attempts: int
    failure_category: Optional[str] = None
    correlation_id: str


class IncidentSummary(BaseModel):
    incident_id: str
    title: str
    severity: str
    failure_category: Optional[str] = None


class MatchedPatternSummary(BaseModel):
    pattern_id: str
    name: str
    confidence_score: float
    incident_count: int
    status: str


class SyntheticJourneyStatusResponse(BaseModel):
    execution_id: str
    journey_id: Optional[int] = None
    correlation_id: str
    environment: str
    status: str
    scenario: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[float] = None
    total_steps: int
    executed_steps_count: int
    step_results: List[SyntheticStepResult] = Field(default_factory=list)
    incident: Optional[IncidentSummary] = None
    matched_pattern: Optional[MatchedPatternSummary] = None
    recovery_orchestration: Optional[Dict[str, Any]] = None


class SimulateFailureRequest(BaseModel):
    scenario: SimulationScenario = Field(..., description="Target simulated failure scenario to trigger")
    journey_id: Optional[int] = Field(default=None, description="Optional target journey ID")
    template_id: Optional[str] = Field(default="retail_checkout", description="Template to run with failure injection")


class DemonstrateWorkflowRequest(BaseModel):
    scenario: SimulationScenario = Field(
        default=SimulationScenario.AUTH_5XX,
        description="Failure scenario to demonstrate end-to-end monitoring, detection, and recovery workflow",
    )
    template_id: Optional[str] = Field(default="retail_checkout")
    auto_recover: bool = Field(default=True, description="Whether to trigger automated recovery orchestration")


class StepTemplateResponse(BaseModel):
    step_name: str
    step_order: int
    service_name: str
    step_type: str
    timeout_ms: int
    is_required: bool


class JourneyTemplateResponse(BaseModel):
    template_id: str
    name: str
    description: str
    journey_type: str
    steps: List[StepTemplateResponse]
