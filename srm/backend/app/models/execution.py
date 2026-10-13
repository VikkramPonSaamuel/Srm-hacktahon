from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.journey import BusinessJourney, JourneyStep
    from app.models.incident import Incident


class JourneyExecution(Base, TimestampMixin):
    """Execution instance of a business journey."""

    __tablename__ = "journey_executions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execution_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    journey_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("business_journeys.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    correlation_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    environment: Mapped[str] = mapped_column(String(30), default="development", index=True, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        default="in_progress",
        index=True,
        nullable=False,
    )  # pending, in_progress, success, failed, partially_recovered
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    journey: Mapped[Optional["BusinessJourney"]] = relationship(
        "BusinessJourney",
        back_populates="executions",
    )
    step_executions: Mapped[List["StepExecution"]] = relationship(
        "StepExecution",
        back_populates="journey_execution",
        cascade="all, delete-orphan",
        order_by="StepExecution.id",
    )
    incidents: Mapped[List["Incident"]] = relationship(
        "Incident",
        back_populates="journey_execution",
    )


class StepExecution(Base, TimestampMixin):
    """Execution record for an individual step in a journey run."""

    __tablename__ = "step_executions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    journey_execution_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("journey_executions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    journey_step_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("journey_steps.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        index=True,
        nullable=False,
    )  # pending, running, success, failed, skipped, timed_out
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    http_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    failure_category: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )  # network_timeout, auth_failure, validation_error, service_unavailable, etc.
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    diagnostic_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # Relationships
    journey_execution: Mapped["JourneyExecution"] = relationship(
        "JourneyExecution",
        back_populates="step_executions",
    )
    journey_step: Mapped[Optional["JourneyStep"]] = relationship(
        "JourneyStep",
        back_populates="step_executions",
    )
    incidents: Mapped[List["Incident"]] = relationship(
        "Incident",
        back_populates="step_execution",
    )
