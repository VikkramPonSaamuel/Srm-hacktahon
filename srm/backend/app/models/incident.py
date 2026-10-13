from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.journey import BusinessJourney
    from app.models.execution import JourneyExecution, StepExecution
    from app.models.investigation import IncidentInvestigation


class Incident(Base, TimestampMixin):
    """Incident record capturing failure anomalies and recovery state."""

    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    journey_execution_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("journey_executions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    step_execution_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("step_executions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    journey_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("business_journeys.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    service_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    incident_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # transaction_failure, latency_spike, auth_breakdown, service_degradation
    severity: Mapped[str] = mapped_column(
        String(20),
        index=True,
        nullable=False,
    )  # low, medium, high, critical
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        default="open",
        index=True,
        nullable=False,
    )  # open, investigating, mitigated, resolved, closed
    failure_category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    root_cause_hypothesis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolution_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recovery_status: Mapped[str] = mapped_column(
        String(30),
        default="not_started",
        index=True,
        nullable=False,
    )  # not_started, in_progress, recovered, failed
    recovery_duration_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    journey: Mapped[Optional["BusinessJourney"]] = relationship(
        "BusinessJourney",
        back_populates="incidents",
    )
    journey_execution: Mapped[Optional["JourneyExecution"]] = relationship(
        "JourneyExecution",
        back_populates="incidents",
    )
    step_execution: Mapped[Optional["StepExecution"]] = relationship(
        "StepExecution",
        back_populates="incidents",
    )
    events: Mapped[List["IncidentEvent"]] = relationship(
        "IncidentEvent",
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentEvent.timestamp",
    )
    investigations: Mapped[List["IncidentInvestigation"]] = relationship(
        "IncidentInvestigation",
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentInvestigation.created_at.desc()",
    )

    @property
    def module(self) -> str:
        """Normalized module classification across platform services."""
        if (
            self.incident_type in ("brand_impersonation", "brand_threat", "impersonation_threat")
            or self.service_name == "brand_protection"
            or (self.failure_category and "impersonation" in self.failure_category)
        ):
            return "brand_impersonation"
        if (
            self.incident_type in ("security_threat", "website_threat", "api_abuse", "ddos_surge")
            or (self.failure_category and (self.failure_category.startswith("threat_") or "threat" in self.failure_category))
        ):
            return "website_security"
        return "transaction_reliability"


class IncidentEvent(Base, TimestampMixin):
    """Historical timeline event within an incident lifecycle."""

    __tablename__ = "incident_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # detected, analyzed, recovery_attempted, status_changed, note_added, resolved
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    # Relationships
    incident: Mapped["Incident"] = relationship("Incident", back_populates="events")

    @property
    def stage(self) -> str:
        """Standardized lifecycle stage milestone."""
        evt = (self.event_type or "").lower()
        if any(k in evt for k in ("detect", "observed", "incident_detected")):
            return "detection"
        if any(k in evt for k in ("evid", "analyz", "investigat", "telemetry")):
            return "evidence_collection"
        if any(k in evt for k in ("pattern", "cluster")):
            return "pattern_matching"
        if any(k in evt for k in ("review", "note", "comment", "evaluat", "threat_confirmed")):
            return "human_review"
        if any(k in evt for k in ("approv", "authoriz")):
            return "approval"
        if any(k in evt for k in ("execut", "attempt", "recover", "mitigat", "action", "applied", "policy_applied")):
            return "response_execution"
        if any(k in evt for k in ("verif", "check")):
            return "verification"
        if any(k in evt for k in ("resolv", "closed", "recovered")):
            return "resolution"
        if any(k in evt for k in ("escalat", "failed")):
            return "escalation"
        return "general"

