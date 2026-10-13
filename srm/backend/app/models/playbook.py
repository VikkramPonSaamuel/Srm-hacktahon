from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.incident import Incident
    from app.models.pattern import FailurePattern


class RecoveryPlaybook(Base, TimestampMixin):
    """Playbook associating a recognized failure pattern with approved countermeasures."""

    __tablename__ = "recovery_playbooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    playbook_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    pattern_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("failure_patterns.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    pattern_ref: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    applicable_services: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    applicable_journeys: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    trigger_conditions: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    recovery_strategy: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )  # circuit_break, failover, reconcile_and_retry, escalate_manual, notify_and_drain
    approval_status: Mapped[str] = mapped_column(
        String(30),
        default="draft",
        index=True,
        nullable=False,
    )  # draft, pending_approval, approved, rejected
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    verification_conditions: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    rollback_instructions: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    pattern: Mapped[Optional["FailurePattern"]] = relationship("FailurePattern", foreign_keys=[pattern_id])
    actions: Mapped[List["RecoveryAction"]] = relationship(
        "RecoveryAction",
        back_populates="playbook",
        cascade="all, delete-orphan",
        order_by="RecoveryAction.action_order",
    )
    executions: Mapped[List["RecoveryExecution"]] = relationship(
        "RecoveryExecution",
        back_populates="playbook",
        cascade="all, delete-orphan",
        order_by="RecoveryExecution.started_at.desc()",
    )


class RecoveryAction(Base, TimestampMixin):
    """Specific step/action within a recovery playbook belonging to the allowlisted action registry."""

    __tablename__ = "recovery_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    playbook_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("recovery_playbooks.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    action_order: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    action_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # must match an allowlisted action in ActionRegistry
    parameters: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    risk_level: Mapped[str] = mapped_column(
        String(20),
        default="low",
        nullable=False,
    )  # low, medium, high, critical
    preconditions: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    expected_outcome: Mapped[str] = mapped_column(Text, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    playbook: Mapped["RecoveryPlaybook"] = relationship("RecoveryPlaybook", back_populates="actions")


class RecoveryExecution(Base, TimestampMixin):
    """Audit record capturing the evaluation, precondition checks, execution, and verification of a recovery playbook."""

    __tablename__ = "recovery_executions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execution_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    playbook_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("recovery_playbooks.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    incident_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("incidents.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    incident_ref: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30),
        default="pending",
        index=True,
        nullable=False,
    )  # pending, in_progress, succeeded, failed, escalated, simulated, cooldown_skipped, rejected_unapproved
    is_simulation: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    preconditions_evaluation: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    actions_attempted: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    result: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    verification_result: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    failure_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    manual_intervention_required: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    # Relationships
    playbook: Mapped["RecoveryPlaybook"] = relationship("RecoveryPlaybook", back_populates="executions")
    incident: Mapped[Optional["Incident"]] = relationship("Incident")
