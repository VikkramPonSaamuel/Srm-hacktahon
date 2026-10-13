from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.website_threat import (
    DetectedWebsiteThreat,
    SecurityEvent,
    ThreatDetectionRuleConfig,
)
from app.repositories.base import BaseRepository
from app.threat_detection.engine import ThreatDetectionEngine


class ThreatDetectionRepository(BaseRepository[DetectedWebsiteThreat]):
    """Data access repository for security events, detected threats, and rule configurations."""

    def __init__(self, db: Session) -> None:
        super().__init__(DetectedWebsiteThreat, db)

    # ---------------------------------------------------------
    # Security Events
    # ---------------------------------------------------------
    def create_event(self, event: SecurityEvent) -> SecurityEvent:
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def create_events_batch(self, events: List[SecurityEvent]) -> List[SecurityEvent]:
        self.db.add_all(events)
        self.db.commit()
        for ev in events:
            self.db.refresh(ev)
        return events

    def get_event_by_id(self, event_id: str) -> Optional[SecurityEvent]:
        stmt = select(SecurityEvent).where(SecurityEvent.event_id == event_id)
        return self.db.scalars(stmt).first()

    def list_events(
        self,
        skip: int = 0,
        limit: int = 50,
        service_name: Optional[str] = None,
        endpoint: Optional[str] = None,
        source_integration: Optional[str] = None,
        event_category: Optional[str] = None,
        auth_outcome: Optional[str] = None,
        action_taken: Optional[str] = None,
        client_ip: Optional[str] = None,
        correlation_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Tuple[List[SecurityEvent], int]:
        base_query = select(SecurityEvent)
        count_query = select(func.count(SecurityEvent.id))

        if service_name:
            base_query = base_query.where(SecurityEvent.service_name == service_name)
            count_query = count_query.where(SecurityEvent.service_name == service_name)

        if endpoint:
            base_query = base_query.where(SecurityEvent.endpoint == endpoint)
            count_query = count_query.where(SecurityEvent.endpoint == endpoint)

        if source_integration:
            base_query = base_query.where(SecurityEvent.source_integration == source_integration)
            count_query = count_query.where(SecurityEvent.source_integration == source_integration)

        if event_category:
            base_query = base_query.where(SecurityEvent.event_category == event_category)
            count_query = count_query.where(SecurityEvent.event_category == event_category)

        if auth_outcome:
            base_query = base_query.where(SecurityEvent.auth_outcome == auth_outcome)
            count_query = count_query.where(SecurityEvent.auth_outcome == auth_outcome)

        if action_taken:
            base_query = base_query.where(SecurityEvent.action_taken == action_taken)
            count_query = count_query.where(SecurityEvent.action_taken == action_taken)

        if client_ip:
            base_query = base_query.where(SecurityEvent.client_ip == client_ip)
            count_query = count_query.where(SecurityEvent.client_ip == client_ip)

        if correlation_id:
            base_query = base_query.where(SecurityEvent.correlation_id == correlation_id)
            count_query = count_query.where(SecurityEvent.correlation_id == correlation_id)

        if start_date:
            base_query = base_query.where(SecurityEvent.timestamp >= start_date)
            count_query = count_query.where(SecurityEvent.timestamp >= start_date)

        if end_date:
            base_query = base_query.where(SecurityEvent.timestamp <= end_date)
            count_query = count_query.where(SecurityEvent.timestamp <= end_date)

        total = self.db.scalar(count_query) or 0
        events = list(
            self.db.scalars(
                base_query.order_by(SecurityEvent.timestamp.desc()).offset(skip).limit(limit)
            ).all()
        )
        return events, total

    def get_events_in_window(
        self,
        service_name: Optional[str] = None,
        endpoint: Optional[str] = None,
        client_ip: Optional[str] = None,
        window_seconds: int = 300,
        since: Optional[datetime] = None,
    ) -> List[SecurityEvent]:
        reference_time = since or datetime.now(timezone.utc)
        start_time = reference_time - timedelta(seconds=window_seconds)

        query = select(SecurityEvent).where(
            SecurityEvent.timestamp >= start_time,
            SecurityEvent.timestamp <= reference_time,
        )

        if service_name:
            query = query.where(SecurityEvent.service_name == service_name)
        if endpoint:
            query = query.where(SecurityEvent.endpoint == endpoint)
        if client_ip:
            query = query.where(SecurityEvent.client_ip == client_ip)

        query = query.order_by(SecurityEvent.timestamp.asc())
        return list(self.db.scalars(query).all())

    # ---------------------------------------------------------
    # Detected Threats
    # ---------------------------------------------------------
    def create_threat(self, threat: DetectedWebsiteThreat) -> DetectedWebsiteThreat:
        self.db.add(threat)
        self.db.commit()
        self.db.refresh(threat)
        return threat

    def update_threat(self, threat: DetectedWebsiteThreat) -> DetectedWebsiteThreat:
        self.db.commit()
        self.db.refresh(threat)
        return threat

    def get_threat_by_id(self, threat_id: str) -> Optional[DetectedWebsiteThreat]:
        stmt = select(DetectedWebsiteThreat).where(DetectedWebsiteThreat.threat_id == threat_id)
        return self.db.scalars(stmt).first()

    def get_threat_by_pk(self, id: int) -> Optional[DetectedWebsiteThreat]:
        return self.db.get(DetectedWebsiteThreat, id)

    def find_active_threat(
        self,
        service_name: str,
        endpoint: str,
        threat_category: str,
        client_ip: Optional[str] = None,
        cooldown_seconds: int = 600,
    ) -> Optional[DetectedWebsiteThreat]:
        """Find an ongoing active threat to prevent duplicate incident creation during spikes."""
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=cooldown_seconds)
        stmt = select(DetectedWebsiteThreat).where(
            DetectedWebsiteThreat.service_name == service_name,
            DetectedWebsiteThreat.endpoint == endpoint,
            DetectedWebsiteThreat.threat_category == threat_category,
            DetectedWebsiteThreat.status.in_(["detected", "investigating", "confirmed_incident"]),
            DetectedWebsiteThreat.last_observed_at >= cutoff,
        )
        if client_ip:
            stmt = stmt.where(DetectedWebsiteThreat.client_ip == client_ip)

        stmt = stmt.order_by(DetectedWebsiteThreat.last_observed_at.desc())
        return self.db.scalars(stmt).first()

    def list_threats(
        self,
        skip: int = 0,
        limit: int = 50,
        service_name: Optional[str] = None,
        endpoint: Optional[str] = None,
        threat_category: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        detection_rule_id: Optional[str] = None,
        client_ip: Optional[str] = None,
        correlation_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Tuple[List[DetectedWebsiteThreat], int]:
        base_query = select(DetectedWebsiteThreat)
        count_query = select(func.count(DetectedWebsiteThreat.id))

        if service_name:
            base_query = base_query.where(DetectedWebsiteThreat.service_name == service_name)
            count_query = count_query.where(DetectedWebsiteThreat.service_name == service_name)

        if endpoint:
            base_query = base_query.where(DetectedWebsiteThreat.endpoint == endpoint)
            count_query = count_query.where(DetectedWebsiteThreat.endpoint == endpoint)

        if threat_category:
            base_query = base_query.where(DetectedWebsiteThreat.threat_category == threat_category)
            count_query = count_query.where(DetectedWebsiteThreat.threat_category == threat_category)

        if severity:
            base_query = base_query.where(DetectedWebsiteThreat.severity == severity)
            count_query = count_query.where(DetectedWebsiteThreat.severity == severity)

        if status:
            base_query = base_query.where(DetectedWebsiteThreat.status == status)
            count_query = count_query.where(DetectedWebsiteThreat.status == status)

        if detection_rule_id:
            base_query = base_query.where(DetectedWebsiteThreat.detection_rule_id == detection_rule_id)
            count_query = count_query.where(DetectedWebsiteThreat.detection_rule_id == detection_rule_id)

        if client_ip:
            base_query = base_query.where(DetectedWebsiteThreat.client_ip == client_ip)
            count_query = count_query.where(DetectedWebsiteThreat.client_ip == client_ip)

        if correlation_id:
            base_query = base_query.where(DetectedWebsiteThreat.correlation_id == correlation_id)
            count_query = count_query.where(DetectedWebsiteThreat.correlation_id == correlation_id)

        if start_date:
            base_query = base_query.where(DetectedWebsiteThreat.first_observed_at >= start_date)
            count_query = count_query.where(DetectedWebsiteThreat.first_observed_at >= start_date)

        if end_date:
            base_query = base_query.where(DetectedWebsiteThreat.last_observed_at <= end_date)
            count_query = count_query.where(DetectedWebsiteThreat.last_observed_at <= end_date)

        total = self.db.scalar(count_query) or 0
        threats = list(
            self.db.scalars(
                base_query.order_by(DetectedWebsiteThreat.last_observed_at.desc())
                .offset(skip)
                .limit(limit)
            ).all()
        )
        return threats, total

    # ---------------------------------------------------------
    # Detection Rules Configuration
    # ---------------------------------------------------------
    def get_rule_config(self, rule_id: str) -> Optional[ThreatDetectionRuleConfig]:
        stmt = select(ThreatDetectionRuleConfig).where(ThreatDetectionRuleConfig.rule_id == rule_id)
        return self.db.scalars(stmt).first()

    def list_rule_configs(self) -> List[ThreatDetectionRuleConfig]:
        self.ensure_default_rule_configs()
        stmt = select(ThreatDetectionRuleConfig).order_by(ThreatDetectionRuleConfig.rule_id.asc())
        return list(self.db.scalars(stmt).all())

    def get_rule_configs_dict(self) -> Dict[str, ThreatDetectionRuleConfig]:
        configs = self.list_rule_configs()
        return {c.rule_id: c for c in configs}

    def update_rule_config(
        self,
        rule_id: str,
        updates: Dict[str, Any],
    ) -> Optional[ThreatDetectionRuleConfig]:
        cfg = self.get_rule_config(rule_id)
        if not cfg:
            return None

        for field_name, value in updates.items():
            if value is not None and hasattr(cfg, field_name):
                setattr(cfg, field_name, value)

        self.db.commit()
        self.db.refresh(cfg)
        return cfg

    def ensure_default_rule_configs(self) -> None:
        """Seed default configs for all registered rules if they do not exist yet."""
        rules = ThreatDetectionEngine.get_all_rules()
        for rule in rules:
            existing = self.db.scalars(
                select(ThreatDetectionRuleConfig).where(ThreatDetectionRuleConfig.rule_id == rule.rule_id)
            ).first()
            if not existing:
                cfg = ThreatDetectionRuleConfig(
                    rule_id=rule.rule_id,
                    rule_name=rule.rule_name,
                    threat_category=rule.threat_category,
                    description=f"Deterministic detection baseline for {rule.rule_name}",
                    is_enabled=True,
                    severity=rule.default_severity,
                    threshold_count=rule.default_threshold,
                    time_window_seconds=rule.default_time_window,
                    config_parameters={},
                )
                self.db.add(cfg)
        self.db.commit()
