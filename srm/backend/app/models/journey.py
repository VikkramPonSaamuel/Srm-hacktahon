from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.execution import JourneyExecution
    from app.models.incident import Incident
    from app.models.execution import StepExecution


class BusinessJourney(Base, TimestampMixin):
    """Business journey model representing a multi-step user/transaction flow."""

    __tablename__ = "business_journeys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    journey_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    steps: Mapped[List["JourneyStep"]] = relationship(
        "JourneyStep",
        back_populates="journey",
        cascade="all, delete-orphan",
        order_by="JourneyStep.step_order",
    )
    executions: Mapped[List["JourneyExecution"]] = relationship(
        "JourneyExecution",
        back_populates="journey",
    )
    incidents: Mapped[List["Incident"]] = relationship(
        "Incident",
        back_populates="journey",
    )


class JourneyStep(Base, TimestampMixin):
    """Individual configured step within a business journey."""

    __tablename__ = "journey_steps"
    __table_args__ = (
        UniqueConstraint("journey_id", "step_order", name="uq_journey_step_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    journey_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("business_journeys.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    step_name: Mapped[str] = mapped_column(String(100), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    service_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    step_type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., api_call, db_query, auth
    timeout_ms: Mapped[int] = mapped_column(Integer, default=5000, nullable=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationships
    journey: Mapped["BusinessJourney"] = relationship("BusinessJourney", back_populates="steps")
    step_executions: Mapped[List["StepExecution"]] = relationship(
        "StepExecution",
        back_populates="journey_step",
    )
