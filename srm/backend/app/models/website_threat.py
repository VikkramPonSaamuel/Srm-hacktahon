from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class SecurityEvent(Base, TimestampMixin):
    """Normalized security telemetry event ingested from web servers, gateways, WAFs, or auth services."""

    __tablename__ = "security_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    source_integration: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # web_server, api_gateway, waf, auth_service, synthetic_dev
    service_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    http_method: Mapped[str] = mapped_column(String(10), nullable=False)  # GET, POST, PUT, DELETE, etc.
    endpoint: Mapped[str] = mapped_column(String(255), index=True, nullable=False)  # /api/v1/login, /checkout
    status_code: Mapped[int] = mapped_column(Integer, index=True, nullable=False)  # 200, 401, 403, 500, etc.
    event_category: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # auth, api_request, waf_block, probe, error, etc.
    rule_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # WAF or gateway rule ID
    client_ip: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    user_agent: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    request_indicators: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    auth_outcome: Mapped[str] = mapped_column(
        String(20),
        default="none",
        index=True,
        nullable=False,
    )  # success, failure, none
    action_taken: Mapped[str] = mapped_column(
        String(30),
        default="allowed",
        index=True,
        nullable=False,
    )  # allowed, blocked, challenged, rate_limited
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    environment: Mapped[str] = mapped_column(String(30), default="production", nullable=False)
    provenance: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class DetectedWebsiteThreat(Base, TimestampMixin):
    """Aggregated or high-confidence website security threat detected by analytical baseline rules."""

    __tablename__ = "detected_website_threats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    threat_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    threat_category: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # sqli, xss, brute_force, auth_failure_surge, abnormal_rate, endpoint_probing, authorization_spike, potential_dos_surge, repeated_waf_blocks, multi_endpoint_correlation
    severity: Mapped[str] = mapped_column(
        String(20),
        default="medium",
        index=True,
        nullable=False,
    )  # low, medium, high, critical
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    detection_rule_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    rule_name: Mapped[str] = mapped_column(String(150), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30),
        default="detected",
        index=True,
        nullable=False,
    )  # detected, investigating, confirmed_incident, false_positive, mitigated, dismissed
    service_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    endpoint: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    client_ip: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    first_observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    last_observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    correlated_event_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, default=0.7, nullable=False)
    evidence_quality: Mapped[str] = mapped_column(String(30), default="moderate", nullable=False)
    recommended_response: Mapped[str] = mapped_column(
        String(50),
        default="investigate",
        nullable=False,
    )  # block_ip, rate_limit_endpoint, challenge_turnstile, monitor, investigate
    requires_human_review: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    evidence_references: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    detection_reasons: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    incident_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("incidents.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    incident_ref: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    incident: Mapped[Optional["Incident"]] = relationship("Incident")


class ThreatDetectionRuleConfig(Base, TimestampMixin):
    """Configurable detection rules, activation states, and dynamic thresholds."""

    __tablename__ = "threat_detection_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_id: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    rule_name: Mapped[str] = mapped_column(String(150), nullable=False)
    threat_category: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    threshold_count: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    time_window_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)  # 5 min
    config_parameters: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
