import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.brand_protection.domain_utils import generate_verification_token
from app.models.brand_protection import (
    BrandAsset,
    BrandProfile,
    BrandVerificationEvent,
    DetectedImpersonation,
    OfficialDomain,
)
from app.repositories.base import BaseRepository
from app.schemas.brand_protection import BrandProfileCreate, BrandProfileUpdate


class BrandProtectionRepository(BaseRepository[BrandProfile]):
    """Data access repository for Brand Profiles, Official Domains, Assets, Verification Events, and Detected Impersonations."""

    def __init__(self, db: Session) -> None:
        super().__init__(BrandProfile, db)

    def get_by_brand_id(self, brand_id: str, load_relations: bool = False) -> Optional[BrandProfile]:
        query = select(BrandProfile).where(BrandProfile.brand_id == brand_id)
        if load_relations:
            query = query.options(
                selectinload(BrandProfile.domains),
                selectinload(BrandProfile.assets),
                selectinload(BrandProfile.verification_events),
            )
        return self.db.execute(query).scalar_one_or_none()

    def list_brands(
        self,
        owner_id: Optional[str] = None,
        verification_status: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[BrandProfile], int]:
        query = select(BrandProfile)
        count_query = select(func.count(BrandProfile.id))

        if owner_id:
            query = query.where(BrandProfile.owner_id == owner_id)
            count_query = count_query.where(BrandProfile.owner_id == owner_id)

        if verification_status:
            query = query.where(BrandProfile.verification_status == verification_status)
            count_query = count_query.where(BrandProfile.verification_status == verification_status)

        total = self.db.execute(count_query).scalar() or 0

        query = (
            query.options(
                selectinload(BrandProfile.domains),
                selectinload(BrandProfile.assets),
            )
            .order_by(BrandProfile.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        items = list(self.db.execute(query).scalars().all())
        return items, total

    def create_brand(
        self,
        data: BrandProfileCreate,
        owner_id: str,
        is_demo: bool = False,
    ) -> BrandProfile:
        brand_id = f"brd_{uuid.uuid4().hex[:12]}"
        brand = BrandProfile(
            brand_id=brand_id,
            name=data.name.strip(),
            description=data.description.strip() if data.description else None,
            owner_id=owner_id,
            contact_email=data.contact_email.strip() if data.contact_email else None,
            registration_status="draft",
            verification_status="unverified",
            is_demo=is_demo,
        )
        self.db.add(brand)
        self.db.flush()

        # Add initial registration event
        self.add_verification_event(
            brand_id=brand.id,
            action="brand_registered",
            status="draft",
            evidence={"owner_id": owner_id, "brand_name": brand.name},
        )
        self.db.commit()
        self.db.refresh(brand)
        return brand

    def update_brand(self, brand: BrandProfile, data: BrandProfileUpdate) -> BrandProfile:
        if data.name is not None:
            brand.name = data.name.strip()
        if data.description is not None:
            brand.description = data.description.strip()
        if data.contact_email is not None:
            brand.contact_email = data.contact_email.strip()

        self.db.commit()
        self.db.refresh(brand)
        return brand

    # Official Domains
    def add_domain(
        self,
        brand: BrandProfile,
        canonical_domain: str,
        verification_method: str = "dns_txt",
    ) -> OfficialDomain:
        domain_id = f"dom_{uuid.uuid4().hex[:12]}"
        verification_token = generate_verification_token()

        domain = OfficialDomain(
            domain_id=domain_id,
            brand_id=brand.id,
            domain_name=canonical_domain,
            verification_status="unverified",
            verification_method=verification_method,
            verification_token=verification_token,
            is_active=True,
        )
        self.db.add(domain)
        self.db.flush()

        self.add_verification_event(
            brand_id=brand.id,
            action="domain_added",
            status=brand.verification_status,
            evidence={
                "domain_name": canonical_domain,
                "verification_method": verification_method,
                "domain_id": domain_id,
            },
        )
        self.db.commit()
        self.db.refresh(domain)
        return domain

    def get_domain(self, brand_id: int, domain_id: str) -> Optional[OfficialDomain]:
        query = select(OfficialDomain).where(
            OfficialDomain.brand_id == brand_id,
            OfficialDomain.domain_id == domain_id,
        )
        return self.db.execute(query).scalar_one_or_none()

    def list_domains(self, brand_id: int) -> List[OfficialDomain]:
        query = (
            select(OfficialDomain)
            .where(OfficialDomain.brand_id == brand_id)
            .order_by(OfficialDomain.created_at.asc())
        )
        return list(self.db.execute(query).scalars().all())

    # Brand Assets
    def add_asset(
        self,
        brand: BrandProfile,
        asset_type: str,
        storage_path: str,
        file_hash: str,
        content_type: str,
        file_size: int,
        metadata: Dict[str, Any],
    ) -> BrandAsset:
        asset_id = f"ast_{uuid.uuid4().hex[:12]}"
        asset = BrandAsset(
            asset_id=asset_id,
            brand_id=brand.id,
            asset_type=asset_type,
            storage_path=storage_path,
            file_hash=file_hash,
            content_type=content_type,
            file_size_bytes=file_size,
            asset_metadata=metadata,
            verification_status="unverified",
        )
        self.db.add(asset)
        self.db.flush()

        self.add_verification_event(
            brand_id=brand.id,
            action="asset_added",
            status=brand.verification_status,
            evidence={
                "asset_id": asset_id,
                "asset_type": asset_type,
                "file_hash": file_hash,
                "content_type": content_type,
            },
        )
        self.db.commit()
        self.db.refresh(asset)
        return asset

    def list_assets(self, brand_id: int) -> List[BrandAsset]:
        query = (
            select(BrandAsset)
            .where(BrandAsset.brand_id == brand_id)
            .order_by(BrandAsset.created_at.asc())
        )
        return list(self.db.execute(query).scalars().all())

    # Verification Events
    def add_verification_event(
        self,
        brand_id: int,
        action: str,
        status: str,
        evidence: Dict[str, Any],
        reviewed_by: Optional[str] = None,
    ) -> BrandVerificationEvent:
        event_id = f"bve_{uuid.uuid4().hex[:12]}"
        event = BrandVerificationEvent(
            event_id=event_id,
            brand_id=brand_id,
            verification_action=action,
            status=status,
            sanitized_evidence=evidence,
            reviewed_by=reviewed_by,
        )
        self.db.add(event)
        self.db.flush()
        return event

    def list_verification_events(self, brand_id: int) -> List[BrandVerificationEvent]:
        query = (
            select(BrandVerificationEvent)
            .where(BrandVerificationEvent.brand_id == brand_id)
            .order_by(BrandVerificationEvent.timestamp.desc())
        )
        return list(self.db.execute(query).scalars().all())

    # Detected Impersonations
    def get_detection_by_id(self, detection_id: str, load_brand: bool = True) -> Optional[DetectedImpersonation]:
        query = select(DetectedImpersonation).where(DetectedImpersonation.detection_id == detection_id)
        if load_brand:
            query = query.options(
                selectinload(DetectedImpersonation.brand),
                selectinload(DetectedImpersonation.incident),
            )
        return self.db.execute(query).scalar_one_or_none()

    def find_existing_detection(self, brand_id: int, suspicious_domain: str) -> Optional[DetectedImpersonation]:
        query = select(DetectedImpersonation).where(
            DetectedImpersonation.brand_id == brand_id,
            DetectedImpersonation.suspicious_domain == suspicious_domain,
        )
        return self.db.execute(query).scalar_one_or_none()

    def create_or_update_detection(
        self,
        brand_id: int,
        suspicious_url: str,
        suspicious_domain: str,
        intake_source: str,
        assessment_data: Dict[str, Any],
        incident_id: Optional[int] = None,
        incident_ref: Optional[str] = None,
        correlation_id: Optional[str] = None,
        is_demo: bool = False,
    ) -> Tuple[DetectedImpersonation, bool]:
        """Creates or updates a detected impersonation to suppress duplicate candidates.
        Returns (detection, is_created).
        """
        existing = self.find_existing_detection(brand_id, suspicious_domain)
        now = datetime.now(timezone.utc)

        if existing:
            # Update existing candidate with new analysis observation
            existing.suspicious_url = suspicious_url
            existing.last_analyzed_at = now
            existing.risk_score = assessment_data.get("risk_score", existing.risk_score)
            existing.severity = assessment_data.get("severity", existing.severity)
            existing.confidence_score = assessment_data.get("confidence_score", existing.confidence_score)
            existing.evidence_quality = assessment_data.get("evidence_quality", existing.evidence_quality)
            existing.attack_vector = assessment_data.get("attack_vector", existing.attack_vector)
            existing.detection_reasons = assessment_data.get("detection_reasons", existing.detection_reasons)
            existing.evidence_references = assessment_data.get("evidence_references", existing.evidence_references)
            existing.missing_evidence = assessment_data.get("missing_evidence", existing.missing_evidence)
            existing.review_recommendation = assessment_data.get("review_recommendation", existing.review_recommendation)
            if incident_id and not existing.incident_id:
                existing.incident_id = incident_id
                existing.incident_ref = incident_ref
            if correlation_id and not existing.correlation_id:
                existing.correlation_id = correlation_id
            self.db.commit()
            self.db.refresh(existing)
            return existing, False

        # Create new detected candidate
        detection_id = f"det_{uuid.uuid4().hex[:12]}"
        detection = DetectedImpersonation(
            detection_id=detection_id,
            brand_id=brand_id,
            incident_id=incident_id,
            incident_ref=incident_ref,
            suspicious_url=suspicious_url,
            suspicious_domain=suspicious_domain,
            intake_source=intake_source,
            attack_vector=assessment_data.get("attack_vector", "domain_typosquat"),
            risk_score=assessment_data.get("risk_score", 0.0),
            severity=assessment_data.get("severity", "low"),
            confidence_score=assessment_data.get("confidence_score", 0.5),
            evidence_quality=assessment_data.get("evidence_quality", "moderate"),
            status="candidate",
            detection_reasons=assessment_data.get("detection_reasons", []),
            evidence_references=assessment_data.get("evidence_references", {}),
            missing_evidence=assessment_data.get("missing_evidence", []),
            review_recommendation=assessment_data.get("review_recommendation", "monitor"),
            correlation_id=correlation_id,
            first_detected_at=now,
            last_analyzed_at=now,
            is_demo=is_demo,
        )
        self.db.add(detection)
        self.db.commit()
        self.db.refresh(detection)
        return detection, True

    def list_detections(
        self,
        brand_id: Optional[int] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[DetectedImpersonation], int]:
        query = select(DetectedImpersonation)
        count_query = select(func.count(DetectedImpersonation.id))

        if brand_id is not None:
            query = query.where(DetectedImpersonation.brand_id == brand_id)
            count_query = count_query.where(DetectedImpersonation.brand_id == brand_id)

        if severity:
            query = query.where(DetectedImpersonation.severity == severity)
            count_query = count_query.where(DetectedImpersonation.severity == severity)

        if status:
            query = query.where(DetectedImpersonation.status == status)
            count_query = count_query.where(DetectedImpersonation.status == status)

        if start_date:
            query = query.where(DetectedImpersonation.first_detected_at >= start_date)
            count_query = count_query.where(DetectedImpersonation.first_detected_at >= start_date)

        if end_date:
            query = query.where(DetectedImpersonation.first_detected_at <= end_date)
            count_query = count_query.where(DetectedImpersonation.first_detected_at <= end_date)

        total = self.db.execute(count_query).scalar() or 0

        query = (
            query.options(selectinload(DetectedImpersonation.brand))
            .order_by(DetectedImpersonation.last_analyzed_at.desc())
            .offset(skip)
            .limit(limit)
        )
        items = list(self.db.execute(query).scalars().all())
        return items, total

    def update_detection_review(
        self,
        detection: DetectedImpersonation,
        status: str,
        reviewed_by: str,
        review_notes: Optional[str] = None,
    ) -> DetectedImpersonation:
        detection.status = status
        detection.reviewed_by = reviewed_by
        detection.reviewed_at = datetime.now(timezone.utc)
        if review_notes is not None:
            detection.review_notes = review_notes
        self.db.commit()
        self.db.refresh(detection)
        return detection
