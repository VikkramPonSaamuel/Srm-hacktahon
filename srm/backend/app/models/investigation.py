from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.incident import Incident


class IncidentInvestigation(Base, TimestampMixin):
    """Investigation audit record capturing root-cause analysis, evidence, and recommendations."""

    __tablename__ = "incident_investigations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    analysis_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    incident_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("incidents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    incident_ref: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    analysis_mode: Mapped[str] = mapped_column(
        String(30),
        default="deterministic",
        index=True,
        nullable=False,
    )  # deterministic, llm_assisted, fallback
    provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # deterministic_engine, mock_llm, openai, gemini
    model_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    customer_impact: Mapped[str] = mapped_column(Text, nullable=False)
    failed_component: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    failed_step: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    root_cause_hypothesis: Mapped[str] = mapped_column(Text, nullable=False)
    alternative_explanations: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    evidence_assessment: Mapped[str] = mapped_column(
        String(50),
        default="conclusive",
        nullable=False,
    )  # conclusive, moderate, insufficient, inconclusive
    human_investigation_required: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    recommended_playbook_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    recommended_action: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    playbook_eligibility: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    evidence_references: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    related_incident_ids: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    matching_pattern_ids: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    raw_model_response: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    incident: Mapped["Incident"] = relationship("Incident", back_populates="investigations")
