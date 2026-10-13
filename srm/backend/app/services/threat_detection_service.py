from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import uuid
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.models.incident import Incident
from app.models.website_threat import (
    DetectedWebsiteThreat,
    SecurityEvent,
    ThreatDetectionRuleConfig,
)
from app.patterns.detector import RuleBasedPatternDetector
from app.repositories.incident_repository import IncidentRepository
from app.repositories.threat_detection_repository import ThreatDetectionRepository
from app.schemas.incident import IncidentCreate, IncidentEventCreate
from app.schemas.pagination import PaginatedResponse
from app.schemas.threat_detection import (
    DetectedWebsiteThreatResponse,
    FalsePositiveReviewRequest,
    IngestResultResponse,
    SecurityEventBatchIngestRequest,
    SecurityEventIngestRequest,
    SecurityEventResponse,
    ThreatRuleConfigUpdate,
)
from app.services.incident_service import IncidentService
from app.threat_detection.adapters import TelemetryAdapterRegistry
from app.threat_detection.engine import DetectionAssessment, ThreatDetectionEngine
from app.threat_detection.sanitizer import sanitize_security_telemetry

logger = get_logger("app.threat_detection.service")


class ThreatDetectionService:
    """Orchestrates security telemetry ingestion, detection analysis, incident creation, and threat review."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ThreatDetectionRepository(db)
        self.incident_service = IncidentService(db)
        self.incident_repo = IncidentRepository(db)

    # ------------------------------------------------------------------
    # Telemetry Ingestion
    # ------------------------------------------------------------------
    def ingest_single_event(
        self,
        request: SecurityEventIngestRequest,
        adapter_name: Optional[str] = None,
    ) -> Tuple[SecurityEvent, List[DetectedWebsiteThreat]]:
        """Ingest, sanitize, and evaluate a single security event."""
        # Normalize with registered adapter if needed
        adapter_key = adapter_name or request.source_integration
        adapter = TelemetryAdapterRegistry.get_adapter(adapter_key)

        raw_dict = request.model_dump()
        normalized = adapter.normalize(raw_dict)

        # Sanitize sensitive request indicators (passwords, tokens, cookies, etc.)
        sanitized_indicators = sanitize_security_telemetry(normalized.get("request_indicators", {}))
        sanitized_provenance = sanitize_security_telemetry(normalized.get("provenance", {}))

        event_timestamp = normalized.get("timestamp") or datetime.now(timezone.utc)
        if event_timestamp.tzinfo is None:
            event_timestamp = event_timestamp.replace(tzinfo=timezone.utc)

        event_id = f"evt-sec-{uuid.uuid4().hex[:12]}"
        correlation_id = normalized.get("correlation_id") or f"corr-sec-{uuid.uuid4().hex[:8]}"

        event = SecurityEvent(
            event_id=event_id,
            timestamp=event_timestamp,
            source_integration=normalized.get("source_integration", "api_gateway"),
            service_name=normalized.get("service_name", "web_app"),
            http_method=normalized.get("http_method", "GET").upper(),
            endpoint=normalized.get("endpoint", "/"),
            status_code=int(normalized.get("status_code", 200)),
            event_category=normalized.get("event_category", "api_request"),
            rule_id=normalized.get("rule_id"),
            client_ip=normalized.get("client_ip", "127.0.0.1"),
            user_agent=normalized.get("user_agent"),
            request_indicators=sanitized_indicators,
            auth_outcome=normalized.get("auth_outcome", "none"),
            action_taken=normalized.get("action_taken", "allowed"),
            correlation_id=correlation_id,
            environment=normalized.get("environment", "production"),
            provenance=sanitized_provenance,
        )

        persisted_event = self.repo.create_event(event)

        # Evaluate threat detection rules
        detected_threats = self._evaluate_and_persist_threats(persisted_event)
        return persisted_event, detected_threats

    def ingest_batch(
        self,
        batch_request: SecurityEventBatchIngestRequest,
    ) -> IngestResultResponse:
        """Batch ingestion for telemetry with deduplication and incident suppression."""
        ingested_count = 0
        total_threats: List[str] = []
        created_incidents = 0

        for event_req in batch_request.events:
            _, threats = self.ingest_single_event(event_req)
            ingested_count += 1
            for t in threats:
                if t.threat_id not in total_threats:
                    total_threats.append(t.threat_id)
                if t.incident_id:
                    created_incidents += 1

        is_simulated = any(
            e.source_integration == "synthetic_dev" or "mock" in e.source_integration
            for e in batch_request.events
        )

        return IngestResultResponse(
            ingested_count=ingested_count,
            threats_detected=len(total_threats),
            incidents_created=created_incidents,
            sample_threat_ids=total_threats[:5],
            simulated_telemetry=is_simulated,
        )

    # ------------------------------------------------------------------
    # Threat Evaluation & Incident Integration
    # ------------------------------------------------------------------
    def _evaluate_and_persist_threats(
        self,
        event: SecurityEvent,
    ) -> List[DetectedWebsiteThreat]:
        """Runs detection baseline rules and coordinates deduplication & incident creation."""
        # 1. Fetch recent events in sliding window (max 15 mins lookback)
        window_events = self.repo.get_events_in_window(
            service_name=event.service_name,
            endpoint=None,  # Include multi-endpoint telemetry for correlation rules
            client_ip=None,
            window_seconds=900,
            since=event.timestamp,
        )

        # 2. Load configured rules
        rule_configs = self.repo.get_rule_configs_dict()

        # 3. Evaluate rules
        assessments: List[DetectionAssessment] = ThreatDetectionEngine.evaluate_event(
            current_event=event,
            window_events=window_events,
            rule_configs=rule_configs,
        )

        resulting_threats: List[DetectedWebsiteThreat] = []

        for assessment in assessments:
            threat = self._process_assessment(event, assessment)
            if threat:
                resulting_threats.append(threat)

        return resulting_threats

    def _process_assessment(
        self,
        event: SecurityEvent,
        assessment: DetectionAssessment,
    ) -> Optional[DetectedWebsiteThreat]:
        """Deduplicates threats during traffic spikes and creates incidents for high-confidence threats."""
        cooldown_window = 600  # 10 minutes sliding cooldown
        existing_threat = self.repo.find_active_threat(
            service_name=event.service_name,
            endpoint=event.endpoint,
            threat_category=assessment.threat_category,
            client_ip=event.client_ip,
            cooldown_seconds=cooldown_window,
        )

        # Traffic spike deduplication: if an active threat is already in progress, correlate it
        if existing_threat:
            existing_threat.correlated_event_count += 1
            existing_threat.last_observed_at = event.timestamp
            # Merge evidence references
            for k, v in assessment.evidence_references.items():
                existing_threat.evidence_references[k] = v

            # Append timeline audit entry to existing incident if one is attached
            if existing_threat.incident_id:
                try:
                    self.incident_repo.add_event(
                        existing_threat.incident_id,
                        IncidentEventCreate(
                            event_type="telemetry_surge_correlated",
                            timestamp=event.timestamp,
                            details={
                                "threat_id": existing_threat.threat_id,
                                "rule_id": assessment.rule_id,
                                "correlated_count": existing_threat.correlated_event_count,
                                "client_ip": event.client_ip,
                            },
                            correlation_id=existing_threat.correlation_id,
                        ),
                    )
                except Exception as exc:
                    logger.warning(f"Failed to record audit timeline event for threat: {exc}")

            return self.repo.update_threat(existing_threat)

        # Create new detected threat
        threat_id = f"thrt-{uuid.uuid4().hex[:12]}"
        correlation_id = event.correlation_id or f"corr-sec-{uuid.uuid4().hex[:8]}"

        # Check threshold for Incident integration (risk >= 0.70 or high/critical severity)
        threshold_met = assessment.risk_score >= 0.70 or assessment.severity in ["high", "critical"]
        linked_incident_id = None
        linked_incident_ref = None

        if threshold_met:
            try:
                incident_title = (
                    f"Website Threat: {assessment.rule_name} on {event.service_name}:{event.endpoint}"
                )
                incident_desc = (
                    f"Detection rule '{assessment.rule_name}' ({assessment.rule_id}) identified suspicious "
                    f"behavior on service '{event.service_name}' endpoint '{event.endpoint}'. "
                    f"Reasons: {'; '.join(assessment.detection_reasons)}. "
                    f"Recommended defensive action: {assessment.recommended_response}."
                )

                incident_create = IncidentCreate(
                    service_name=event.service_name,
                    incident_type="security_threat",
                    severity=assessment.severity,
                    title=incident_title[:200],
                    description=incident_desc,
                    failure_category=f"threat_{assessment.threat_category}",
                    root_cause_hypothesis=f"Threat activity: {assessment.rule_name} from IP {event.client_ip}",
                    detected_at=event.timestamp,
                    initial_event=IncidentEventCreate(
                        event_type="threat_detected",
                        timestamp=event.timestamp,
                        details={
                            "threat_id": threat_id,
                            "rule_id": assessment.rule_id,
                            "risk_score": assessment.risk_score,
                            "evidence": assessment.evidence_references,
                            "recommended_response": assessment.recommended_response,
                            "requires_human_review": assessment.requires_human_review,
                        },
                        correlation_id=correlation_id,
                    ),
                )

                created_inc = self.incident_service.record_incident(incident_create)
                linked_incident_id = created_inc.id
                linked_incident_ref = created_inc.incident_id

                # Run historical pattern detection engine on created incident
                try:
                    inc_record = self.incident_repo.get_by_id(created_inc.id)
                    if inc_record:
                        pattern_detector = RuleBasedPatternDetector(self.db)
                        matched_pattern = pattern_detector.evaluate_incident(inc_record)
                        if matched_pattern:
                            logger.info(
                                f"Correlated threat incident {created_inc.incident_id} to pattern {matched_pattern.pattern_id}"
                            )
                except Exception as p_err:
                    logger.warning(f"Historical pattern correlation warning: {p_err}")

            except Exception as e:
                logger.error(f"Failed to create incident for threat {threat_id}: {e}")

        new_threat = DetectedWebsiteThreat(
            threat_id=threat_id,
            threat_category=assessment.threat_category,
            severity=assessment.severity,
            risk_score=assessment.risk_score,
            detection_rule_id=assessment.rule_id,
            rule_name=assessment.rule_name,
            status="confirmed_incident" if linked_incident_id else "detected",
            service_name=event.service_name,
            endpoint=event.endpoint,
            client_ip=event.client_ip,
            first_observed_at=event.timestamp,
            last_observed_at=event.timestamp,
            correlated_event_count=1,
            confidence_score=assessment.confidence_score,
            evidence_quality=assessment.evidence_quality,
            recommended_response=assessment.recommended_response,
            requires_human_review=assessment.requires_human_review,
            evidence_references=assessment.evidence_references,
            detection_reasons=assessment.detection_reasons,
            incident_id=linked_incident_id,
            incident_ref=linked_incident_ref,
            correlation_id=correlation_id,
        )

        return self.repo.create_threat(new_threat)

    # ------------------------------------------------------------------
    # Query Endpoints
    # ------------------------------------------------------------------
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
    ) -> PaginatedResponse[SecurityEventResponse]:
        limit = min(limit, 100)
        items, total = self.repo.list_events(
            skip=skip,
            limit=limit,
            service_name=service_name,
            endpoint=endpoint,
            source_integration=source_integration,
            event_category=event_category,
            auth_outcome=auth_outcome,
            action_taken=action_taken,
            client_ip=client_ip,
            correlation_id=correlation_id,
            start_date=start_date,
            end_date=end_date,
        )
        return PaginatedResponse(
            items=[SecurityEventResponse.model_validate(e) for e in items],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )

    def get_event(self, event_id: str) -> SecurityEvent:
        event = self.repo.get_event_by_id(event_id)
        if not event:
            raise NotFoundError(message=f"Security event '{event_id}' not found.")
        return event

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
    ) -> PaginatedResponse[DetectedWebsiteThreatResponse]:
        limit = min(limit, 100)
        items, total = self.repo.list_threats(
            skip=skip,
            limit=limit,
            service_name=service_name,
            endpoint=endpoint,
            threat_category=threat_category,
            severity=severity,
            status=status,
            detection_rule_id=detection_rule_id,
            client_ip=client_ip,
            correlation_id=correlation_id,
            start_date=start_date,
            end_date=end_date,
        )
        return PaginatedResponse(
            items=[DetectedWebsiteThreatResponse.model_validate(t) for t in items],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )

    def get_threat(self, threat_id: str) -> Tuple[DetectedWebsiteThreat, List[SecurityEvent]]:
        threat = self.repo.get_threat_by_id(threat_id)
        if not threat and threat_id.isdigit():
            threat = self.repo.get_threat_by_pk(int(threat_id))
        if not threat:
            raise NotFoundError(message=f"Detected threat '{threat_id}' not found.")

        # Query supporting security events
        supporting_events = self.repo.get_events_in_window(
            service_name=threat.service_name,
            endpoint=threat.endpoint,
            client_ip=threat.client_ip,
            window_seconds=1800,  # 30 minutes surrounding threat
            since=threat.last_observed_at,
        )
        return threat, supporting_events

    # ------------------------------------------------------------------
    # False Positive Review & Governance
    # ------------------------------------------------------------------
    def review_false_positive(
        self,
        threat_id: str,
        review_data: FalsePositiveReviewRequest,
        reviewer_email: Optional[str] = None,
    ) -> DetectedWebsiteThreat:
        threat = self.repo.get_threat_by_id(threat_id)
        if not threat:
            raise NotFoundError(message=f"Detected threat '{threat_id}' not found.")

        old_status = threat.status
        threat.status = review_data.status
        threat.review_notes = review_data.review_notes
        threat.reviewed_by = reviewer_email or "security-admin"
        threat.reviewed_at = datetime.now(timezone.utc)

        # Audit timeline logging on linked incident if applicable
        if threat.incident_id:
            try:
                self.incident_repo.add_event(
                    threat.incident_id,
                    IncidentEventCreate(
                        event_type="threat_review_status_changed",
                        timestamp=datetime.now(timezone.utc),
                        details={
                            "threat_id": threat.threat_id,
                            "old_status": old_status,
                            "new_status": review_data.status,
                            "reviewed_by": threat.reviewed_by,
                            "notes": review_data.review_notes,
                        },
                        correlation_id=threat.correlation_id,
                    ),
                )
            except Exception as exc:
                logger.warning(f"Could not add event to incident: {exc}")

        return self.repo.update_threat(threat)

    # ------------------------------------------------------------------
    # Rule Configuration Management
    # ------------------------------------------------------------------
    def list_rules(self) -> List[ThreatDetectionRuleConfig]:
        return self.repo.list_rule_configs()

    def get_rule(self, rule_id: str) -> ThreatDetectionRuleConfig:
        rule = self.repo.get_rule_config(rule_id)
        if not rule:
            raise NotFoundError(message=f"Threat detection rule '{rule_id}' not found.")
        return rule

    def update_rule(
        self,
        rule_id: str,
        update_data: ThreatRuleConfigUpdate,
    ) -> ThreatDetectionRuleConfig:
        updates = update_data.model_dump(exclude_unset=True)
        if not updates:
            raise BadRequestError(message="No configuration fields provided to update.")

        updated = self.repo.update_rule_config(rule_id, updates)
        if not updated:
            raise NotFoundError(message=f"Threat detection rule '{rule_id}' not found.")
        return updated
