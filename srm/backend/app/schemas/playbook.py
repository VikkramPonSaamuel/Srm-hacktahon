from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# -----------------------------------------------------------------------------
# Recovery Action Schemas
# -----------------------------------------------------------------------------
class RecoveryActionBase(BaseModel):
    action_order: int = Field(default=1, ge=1, description="Sequential order of execution")
    action_type: str = Field(..., max_length=50, description="Allowlisted action type identifier")
    parameters: Dict[str, Any] = Field(default_factory=dict, description="Validated parameters for this action")
    risk_level: str = Field(default="low", description="Risk level (low, medium, high, critical)")
    preconditions: Dict[str, Any] = Field(default_factory=dict, description="Preconditions required before running")
    expected_outcome: str = Field(..., description="Expected diagnostic or mitigation outcome")
    timeout_seconds: int = Field(default=30, ge=1, le=300, description="Execution timeout threshold in seconds")
    requires_approval: bool = Field(default=False, description="Whether explicit human approval is required")


class RecoveryActionCreate(RecoveryActionBase):
    pass


class RecoveryActionResponse(RecoveryActionBase):
    id: int
    playbook_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# Recovery Playbook Schemas
# -----------------------------------------------------------------------------
class RecoveryPlaybookBase(BaseModel):
    name: str = Field(..., max_length=150, description="Human-readable playbook name")
    description: str = Field(..., description="Playbook operational description")
    pattern_ref: Optional[str] = Field(None, max_length=64, description="Target failure pattern identifier")
    applicable_services: List[str] = Field(default_factory=list, description="Target microservice identifiers")
    applicable_journeys: List[str] = Field(default_factory=list, description="Target business journeys")
    trigger_conditions: Dict[str, Any] = Field(default_factory=dict, description="Deterministic trigger rules")
    recovery_strategy: str = Field(
        ...,
        max_length=50,
        description="Strategy (circuit_break, failover, reconcile_and_retry, escalate_manual, notify_and_drain)",
    )
    max_attempts: int = Field(default=3, ge=1, le=10, description="Maximum bounded automated attempts")
    cooldown_seconds: int = Field(default=300, ge=0, le=86400, description="Cooldown period between runs in seconds")
    verification_conditions: Dict[str, Any] = Field(default_factory=dict, description="Post-recovery verification checks")
    rollback_instructions: Dict[str, Any] = Field(default_factory=dict, description="Rollback or compensation steps")


class RecoveryPlaybookCreate(RecoveryPlaybookBase):
    playbook_id: Optional[str] = Field(None, max_length=64, description="Optional custom ID (auto-generated if empty)")
    actions: List[RecoveryActionCreate] = Field(default_factory=list, description="Ordered recovery actions")
    is_demo: bool = Field(default=False, description="Flag indicating mock/demo record")


class RecoveryPlaybookUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    description: Optional[str] = None
    pattern_ref: Optional[str] = None
    applicable_services: Optional[List[str]] = None
    applicable_journeys: Optional[List[str]] = None
    trigger_conditions: Optional[Dict[str, Any]] = None
    recovery_strategy: Optional[str] = None
    max_attempts: Optional[int] = Field(None, ge=1, le=10)
    cooldown_seconds: Optional[int] = Field(None, ge=0, le=86400)
    verification_conditions: Optional[Dict[str, Any]] = None
    rollback_instructions: Optional[Dict[str, Any]] = None
    actions: Optional[List[RecoveryActionCreate]] = None


class RecoveryPlaybookResponse(RecoveryPlaybookBase):
    id: int
    playbook_id: str
    approval_status: str
    is_enabled: bool
    is_demo: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecoveryPlaybookDetailResponse(RecoveryPlaybookResponse):
    actions: List[RecoveryActionResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# -----------------------------------------------------------------------------
# Lifecycle & Operations Schemas
# -----------------------------------------------------------------------------
class PlaybookApprovalRequest(BaseModel):
    status: str = Field(..., description="Approval status: 'approved' or 'rejected'")
    notes: Optional[str] = Field(None, description="Reviewer notes or comments")


class PlaybookToggleRequest(BaseModel):
    is_enabled: bool = Field(..., description="True to enable, False to disable")


class PlaybookValidateResponse(BaseModel):
    is_valid: bool
    validation_errors: List[str]
    risk_summary: Dict[str, int]
    allowlisted_action_count: int


class PlaybookExecuteRequest(BaseModel):
    incident_id: Optional[str] = Field(None, description="Incident ID to associate recovery with")
    is_simulation: bool = Field(default=False, description="Run in simulation mode (dry-run without mutations)")
    operator_override: bool = Field(default=False, description="Manual operator override for cooldowns/approvals")
    idempotency_key: Optional[str] = Field(None, description="Idempotency key for payment operations")


# -----------------------------------------------------------------------------
# Recovery Execution Schemas
# -----------------------------------------------------------------------------
class RecoveryExecutionResponse(BaseModel):
    id: int
    execution_id: str
    playbook_id: int
    incident_id: Optional[int] = None
    incident_ref: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str
    is_simulation: bool
    preconditions_evaluation: Dict[str, Any]
    actions_attempted: List[Dict[str, Any]]
    result: Dict[str, Any]
    verification_result: Dict[str, Any]
    failure_details: Optional[str] = None
    manual_intervention_required: bool
    correlation_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
