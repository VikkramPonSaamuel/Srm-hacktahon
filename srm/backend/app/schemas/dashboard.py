from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class TimeRangeMeta(BaseModel):
    """Metadata describing the active query time range and data source."""

    start_time: datetime = Field(..., description="Start of evaluated time range (UTC)")
    end_time: datetime = Field(..., description="End of evaluated time range (UTC)")
    preset: Optional[str] = Field(default=None, description="Preset identifier used e.g. 1h, 24h, 7d, 30d, all")
    data_source: str = Field(default="all", description="Data scope: 'all', 'live', or 'demo'")


# ---------------------------------------------------------
# 1. Overview KPIs
# ---------------------------------------------------------
class OverviewKpisResponse(BaseModel):
    """Aggregated high-level resilience and operational KPIs."""

    total_journey_executions: int = Field(..., description="Total journey executions executed in time range")
    overall_journey_success_rate: float = Field(..., description="Percentage (0.0 - 100.0) of successful journeys")
    active_incidents: int = Field(..., description="Currently active incidents (open, investigating, mitigating)")
    incidents_detected_in_range: int = Field(..., description="Incidents first detected within the time range")
    known_failure_patterns: int = Field(..., description="Confirmed recurring failure patterns")
    patterns_awaiting_review: int = Field(..., description="Candidate failure patterns awaiting operator review")
    successful_recovery_rate: float = Field(..., description="Percentage (0.0 - 100.0) of recovery executions that succeeded")
    median_detection_time_ms: Optional[float] = Field(default=None, description="Median latency/duration in ms to detect failure")
    median_recovery_time_ms: Optional[float] = Field(default=None, description="Median elapsed ms to execute recovery")
    incidents_requiring_manual_intervention: int = Field(..., description="Incidents escalated or awaiting manual reconciliation")
    time_range: TimeRangeMeta


# ---------------------------------------------------------
# 2. Journey Health
# ---------------------------------------------------------
class LatestExecutionSummary(BaseModel):
    execution_id: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[float] = None


class JourneyHealthItem(BaseModel):
    journey_id: int
    name: str
    journey_type: str
    is_enabled: bool
    is_demo: bool
    health_status: str = Field(..., description="'healthy', 'degraded', 'failing', or 'unknown'")
    total_executions: int
    successful_executions: int
    failed_executions: int
    success_rate: float
    avg_latency_ms: float
    p50_latency_ms: float
    p90_latency_ms: float
    p99_latency_ms: float
    latest_execution: Optional[LatestExecutionSummary] = None


class SuccessRateTimePoint(BaseModel):
    timestamp_bucket: str
    total_executions: int
    successful_executions: int
    failed_executions: int
    success_rate: float


class FailingStepSummary(BaseModel):
    step_name: str
    service_name: str
    journey_id: Optional[int] = None
    journey_name: Optional[str] = None
    failure_count: int
    total_attempts: int
    failure_rate: float
    common_failure_category: Optional[str] = None


class ServiceHealthSummaryItem(BaseModel):
    service_name: str
    status: str = Field(..., description="'healthy', 'degraded', or 'down'")
    response_latency_ms: float
    error_rate: float
    last_updated: datetime
    is_demo: bool


class JourneyHealthDashboardResponse(BaseModel):
    journeys: List[JourneyHealthItem]
    success_rate_over_time: List[SuccessRateTimePoint]
    frequently_failing_steps: List[FailingStepSummary]
    service_health_summaries: List[ServiceHealthSummaryItem]
    time_range: TimeRangeMeta


# ---------------------------------------------------------
# 3. Incident Analytics
# ---------------------------------------------------------
class IncidentTimeBucket(BaseModel):
    time_bucket: str
    count: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int


class RepeatedIncidentItem(BaseModel):
    service_name: str
    failure_category: str
    incident_count: int
    first_detected_at: datetime
    last_detected_at: datetime
    severities: List[str]


class TopPatternItem(BaseModel):
    pattern_id: str
    name: str
    incident_count: int
    confidence_score: float
    status: str
    severity: str


class RecentIncidentTimelineItem(BaseModel):
    incident_id: str
    title: str
    severity: str
    status: str
    detected_at: datetime
    resolved_at: Optional[datetime] = None
    event_count: int
    latest_event_type: Optional[str] = None


class IncidentAnalyticsResponse(BaseModel):
    volume_over_time: List[IncidentTimeBucket]
    incidents_by_severity: Dict[str, int]
    incidents_by_category: Dict[str, int]
    incidents_by_service: Dict[str, int]
    incidents_by_journey: Dict[str, int]
    repeated_incidents: List[RepeatedIncidentItem]
    top_failure_patterns: List[TopPatternItem]
    recent_incident_timelines: List[RecentIncidentTimelineItem]
    recovery_outcomes: Dict[str, int]
    time_range: TimeRangeMeta
    incidents_by_module: Dict[str, int] = Field(default_factory=dict)
    patterns_by_module: Dict[str, int] = Field(default_factory=dict)
    countermeasures_summary: Dict[str, Any] = Field(default_factory=dict)
    mitigation_outcomes: Dict[str, int] = Field(default_factory=dict)
    manual_intervention_rate: float = Field(default=0.0)
    false_positive_outcomes: Dict[str, Any] = Field(default_factory=dict)


class SharedAnalyticsResponse(BaseModel):
    incident_counts_by_module: Dict[str, int]
    incident_counts_by_severity: Dict[str, int]
    known_patterns_by_module: Dict[str, int]
    countermeasures: Dict[str, Any]
    recovery_and_mitigation_outcomes: Dict[str, int]
    manual_intervention_rate: float
    false_positive_outcomes: Dict[str, Any]
    time_range: TimeRangeMeta


# ---------------------------------------------------------
# 4. Pattern Analytics
# ---------------------------------------------------------
class AssociatedPlaybookSummary(BaseModel):
    playbook_id: str
    name: str
    recovery_strategy: str
    approval_status: str
    is_enabled: bool


class PatternAnalyticsItem(BaseModel):
    pattern_id: str
    name: str
    description: str
    failure_category: str
    service_name: Optional[str] = None
    severity: str
    incident_count: int
    confidence_score: float
    status: str
    first_detected_at: datetime
    last_detected_at: datetime
    is_demo: bool
    associated_playbook: Optional[AssociatedPlaybookSummary] = None


class PatternFrequencyTimePoint(BaseModel):
    time_bucket: str
    pattern_id: str
    pattern_name: str
    match_count: int


class PatternAnalyticsResponse(BaseModel):
    total_patterns: int
    patterns_by_status: Dict[str, int]
    confidence_distribution: Dict[str, int]
    most_frequent_patterns: List[PatternAnalyticsItem]
    pattern_frequency_over_time: List[PatternFrequencyTimePoint]
    time_range: TimeRangeMeta


# ---------------------------------------------------------
# 5. Countermeasure Analytics
# ---------------------------------------------------------
class PlaybookPerformanceItem(BaseModel):
    playbook_id: str
    name: str
    recovery_strategy: str
    approval_status: str
    is_enabled: bool
    execution_count: int
    success_count: int
    success_rate: float
    avg_duration_ms: float
    last_executed_at: Optional[datetime] = None


class CountermeasureAnalyticsResponse(BaseModel):
    total_playbooks: int
    playbooks_by_approval_status: Dict[str, int]
    enabled_count: int
    disabled_count: int
    recovery_executions_total: int
    recovery_executions_by_status: Dict[str, int]
    recovery_success_rate: float
    total_actions_attempted: int
    failed_actions_count: int
    blocked_actions_count: int
    manual_intervention_rate: float
    avg_recovery_duration_ms: float
    playbook_performance: List[PlaybookPerformanceItem]
    time_range: TimeRangeMeta


# ---------------------------------------------------------
# 6. Historical Records
# ---------------------------------------------------------
class HistoricalIncidentSummaryItem(BaseModel):
    incident_id: str
    title: str
    description: str
    severity: str
    status: str
    journey_id: Optional[int] = None
    journey_name: Optional[str] = None
    service_name: Optional[str] = None
    failure_category: Optional[str] = None
    recovery_status: str
    recovery_duration_ms: Optional[float] = None
    detected_at: datetime
    resolved_at: Optional[datetime] = None
    pattern_id: Optional[str] = None
    manual_intervention_required: bool
    is_demo: bool


class HistoricalExecutionStepItem(BaseModel):
    step_id: int
    step_name: str
    step_order: int
    service_name: str
    step_type: str
    status: str
    latency_ms: Optional[float] = None
    duration_ms: Optional[float] = None
    http_status: Optional[int] = None
    error_code: Optional[str] = None
    failure_category: Optional[str] = None
    diagnostic_data: Optional[Dict[str, Any]] = None


class HistoricalRecoveryAttemptItem(BaseModel):
    execution_id: str
    playbook_id: str
    playbook_name: str
    recovery_strategy: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    is_simulation: bool
    actions_attempted: List[Dict[str, Any]]
    result: Dict[str, Any]
    verification_result: Dict[str, Any]
    failure_details: Optional[str] = None
    manual_intervention_required: bool


class HistoricalIncidentDetailResponse(BaseModel):
    incident: HistoricalIncidentSummaryItem
    journey_execution: Optional[Dict[str, Any]] = None
    step_executions: List[HistoricalExecutionStepItem]
    recovery_attempts: List[HistoricalRecoveryAttemptItem]
    timeline_events: List[Dict[str, Any]]
    matched_patterns: List[Dict[str, Any]]


class PaginatedHistoricalIncidentsResponse(BaseModel):
    items: List[HistoricalIncidentSummaryItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    time_range: TimeRangeMeta


# ---------------------------------------------------------
# 7. Seed Demo Data
# ---------------------------------------------------------
class SeedDemoDataResponse(BaseModel):
    message: str
    journeys_created: int
    executions_created: int
    incidents_created: int
    patterns_created: int
    playbooks_created: int
    health_snapshots_created: int
