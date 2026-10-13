from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.incident import Incident


class FailurePattern(Base, TimestampMixin):
    """Recognized recurring failure pattern backed by historical incident evidence."""

    __tablename__ = "failure_patterns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pattern_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    failure_category: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    service_name: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="high", index=True, nullable=False)
    affected_services: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    affected_steps: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    detection_rules: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    incident_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    example_incident_ids: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        default="candidate",
        index=True,
        nullable=False,
    )  # candidate, confirmed, rejected, retired
    first_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    last_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    last_evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    matches: Mapped[List["PatternMatch"]] = relationship(
        "PatternMatch",
        back_populates="pattern",
        cascade="all, delete-orphan",
        order_by="PatternMatch.matched_at.desc()",
    )

    @property
    def module(self) -> str:
        """Module classification: brand_impersonation, website_security, or transaction_reliability."""
        if (
            self.service_name == "brand_protection"
            or (self.failure_category and "impersonation" in self.failure_category)
            or "impersonation" in (self.name or "").lower()
        ):
            return "brand_impersonation"
        if (
            (self.failure_category and self.failure_category.startswith("threat_"))
            or (self.failure_category and "security" in self.failure_category)
            or any(k in (self.name or "").lower() for k in ("attack", "threat", "waf", "rate abuse", "sqli", "xss", "brute force"))
        ):
            return "website_security"
        return "transaction_reliability"


class PatternMatch(Base, TimestampMixin):
    """Link between an incident and a detected failure pattern with evidence details."""

    __tablename__ = "pattern_matches"
    __table_args__ = (
        UniqueConstraint("pattern_id", "incident_id", name="uq_pattern_incident_match"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pattern_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("failure_patterns.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    incident_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("incidents.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    matched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    similarity_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    match_reasons: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    # Relationships
    pattern: Mapped["FailurePattern"] = relationship("FailurePattern", back_populates="matches")
    incident: Mapped["Incident"] = relationship("Incident")
