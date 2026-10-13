from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.incident import Incident


class BrandProfile(Base, TimestampMixin):
    """Authorized brand identity and digital asset registry for impersonation monitoring."""

    __tablename__ = "brand_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    registration_status: Mapped[str] = mapped_column(
        String(30),
        default="draft",
        index=True,
        nullable=False,
    )  # draft, submitted, verified, rejected, suspended
    verification_status: Mapped[str] = mapped_column(
        String(30),
        default="unverified",
        index=True,
        nullable=False,
    )  # unverified, pending_review, verified, rejected
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    domains: Mapped[List["OfficialDomain"]] = relationship(
        "OfficialDomain",
        back_populates="brand",
        cascade="all, delete-orphan",
        order_by="OfficialDomain.created_at.asc()",
    )
    assets: Mapped[List["BrandAsset"]] = relationship(
        "BrandAsset",
        back_populates="brand",
        cascade="all, delete-orphan",
        order_by="BrandAsset.created_at.asc()",
    )
    verification_events: Mapped[List["BrandVerificationEvent"]] = relationship(
        "BrandVerificationEvent",
        back_populates="brand",
        cascade="all, delete-orphan",
        order_by="BrandVerificationEvent.timestamp.desc()",
    )
    detections: Mapped[List["DetectedImpersonation"]] = relationship(
        "DetectedImpersonation",
        back_populates="brand",
        cascade="all, delete-orphan",
        order_by="DetectedImpersonation.first_detected_at.desc()",
    )
    complaints: Mapped[List["CyberComplaint"]] = relationship(
        "CyberComplaint",
        back_populates="brand",
        cascade="all, delete-orphan",
        order_by="CyberComplaint.created_at.desc()",
    )


class OfficialDomain(Base, TimestampMixin):
    """Canonicalized official domain authorized for a registered brand."""

    __tablename__ = "official_domains"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    domain_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    brand_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("brand_profiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    domain_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    verification_status: Mapped[str] = mapped_column(
        String(30),
        default="unverified",
        index=True,
        nullable=False,
    )  # unverified, pending, verified, failed
    verification_method: Mapped[str] = mapped_column(
        String(50),
        default="dns_txt",
        nullable=False,
    )  # dns_txt, meta_tag, well_known_file, admin_manual
    verification_token: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True, nullable=False)

    # Relationships
    brand: Mapped["BrandProfile"] = relationship("BrandProfile", back_populates="domains")


class BrandAsset(Base, TimestampMixin):
    """Secure asset reference (logo, image, font, text sample, color palette) belonging to a brand."""

    __tablename__ = "brand_assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    brand_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("brand_profiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    asset_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # logo, brand_image, website_text_sample, color_palette, font_info, app_identifier, social_profile
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    asset_metadata: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    verification_status: Mapped[str] = mapped_column(
        String(30),
        default="unverified",
        index=True,
        nullable=False,
    )  # unverified, verified, rejected

    # Relationships
    brand: Mapped["BrandProfile"] = relationship("BrandProfile", back_populates="assets")


class BrandVerificationEvent(Base, TimestampMixin):
    """Audit log of verification events, submissions, and administrative reviews."""

    __tablename__ = "brand_verification_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    brand_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("brand_profiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    verification_action: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # brand_registered, domain_added, domain_verified, asset_added, submitted_for_review, admin_approved, admin_rejected
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    sanitized_evidence: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Relationships
    brand: Mapped["BrandProfile"] = relationship("BrandProfile", back_populates="verification_events")


class DetectedImpersonation(Base, TimestampMixin):
    """Suspicious candidate domain detected for potential brand impersonation."""

    __tablename__ = "detected_impersonations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    detection_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    brand_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("brand_profiles.id", ondelete="CASCADE"),
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
    suspicious_url: Mapped[str] = mapped_column(Text, nullable=False)
    suspicious_domain: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    intake_source: Mapped[str] = mapped_column(
        String(50),
        default="manual_submission",
        index=True,
        nullable=False,
    )  # manual_submission, threat_feed, scheduled_scan, reprocessed
    attack_vector: Mapped[str] = mapped_column(
        String(50),
        default="domain_typosquat",
        index=True,
        nullable=False,
    )  # domain_typosquat, homoglyph_idn, combosquat, subdomain_deception, phishing_portal, brand_impersonation
    risk_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    severity: Mapped[str] = mapped_column(
        String(20),
        default="low",
        index=True,
        nullable=False,
    )  # low, medium, high, critical
    confidence_score: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    evidence_quality: Mapped[str] = mapped_column(
        String(30),
        default="moderate",
        nullable=False,
    )  # high, moderate, low, insufficient
    status: Mapped[str] = mapped_column(
        String(30),
        default="candidate",
        index=True,
        nullable=False,
    )  # candidate, analyzed, confirmed_malicious, false_positive, dismissed, mitigated
    detection_reasons: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    evidence_references: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    missing_evidence: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    review_recommendation: Mapped[str] = mapped_column(
        String(50),
        default="monitor",
        nullable=False,
    )  # dismiss, monitor, investigate, escalate_takedown
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    first_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    last_analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    brand: Mapped["BrandProfile"] = relationship("BrandProfile", back_populates="detections")
    incident: Mapped[Optional["Incident"]] = relationship("Incident")


class CyberComplaint(Base, TimestampMixin):
    """Structured cyber complaint package for reporting or taking down suspected brand impersonations."""

    __tablename__ = "cyber_complaints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    brand_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("brand_profiles.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    brand_ref: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    incident_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("incidents.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    incident_ref: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    detection_id: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)

    reporting_party_id: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    reporting_party_name: Mapped[str] = mapped_column(String(150), nullable=False)
    reporting_party_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    suspected_domain: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    suspected_url: Mapped[str] = mapped_column(Text, nullable=False)
    incident_description: Mapped[str] = mapped_column(Text, nullable=False)
    detection_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    evidence_references: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    threat_assessment_summary: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    reporting_channel: Mapped[str] = mapped_column(
        String(50),
        default="registrar_abuse",
        index=True,
        nullable=False,
    )  # registrar_abuse, hosting_provider, national_cert, icann_drp, manual_portal, download_package
    complaint_status: Mapped[str] = mapped_column(
        String(30),
        default="draft",
        index=True,
        nullable=False,
    )  # draft, pending_review, changes_requested, approved, rejected
    submission_status: Mapped[str] = mapped_column(
        String(30),
        default="not_submitted",
        index=True,
        nullable=False,
    )  # not_submitted, submitted, acknowledged, under_review, action_taken, rejected_by_channel, closed

    narrative_sections: Mapped[Dict[str, str]] = mapped_column(JSON, default=dict, nullable=False)
    unsupported_allegations: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    missing_evidence: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)

    official_reference_number: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    submission_details: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    resolution_status: Mapped[str] = mapped_column(
        String(30),
        default="pending",
        index=True,
        nullable=False,
    )  # pending, takedown_completed, domain_suspended, rejected, dismissed
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    # Relationships
    brand: Mapped["BrandProfile"] = relationship("BrandProfile", back_populates="complaints")
    incident: Mapped[Optional["Incident"]] = relationship("Incident")
    events: Mapped[List["ComplaintEvent"]] = relationship(
        "ComplaintEvent",
        back_populates="complaint",
        cascade="all, delete-orphan",
        order_by="ComplaintEvent.timestamp.asc()",
    )


class ComplaintEvent(Base, TimestampMixin):
    """Audit timeline, human reviews, and follow-up history for a cyber complaint."""

    __tablename__ = "complaint_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    complaint_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("cyber_complaints.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
    )  # created, narrative_updated, submitted_for_review, approved, rejected, changes_requested, submitted_externally, follow_up_added, status_updated, resolved
    actor_id: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(50), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_data: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )

    # Relationships
    complaint: Mapped["CyberComplaint"] = relationship("CyberComplaint", back_populates="events")

