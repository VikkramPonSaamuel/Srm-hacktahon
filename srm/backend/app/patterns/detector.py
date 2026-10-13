from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import uuid
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models.incident import Incident
from app.models.pattern import FailurePattern, PatternMatch
from app.patterns.features import FeatureExtractor

logger = get_logger("app.patterns.detector")


def to_utc_dt(dt: Optional[datetime]) -> datetime:
    """Ensures datetime is timezone-aware UTC for safe comparisons across SQLite and Postgres."""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class PatternDetectionConfig:
    """Configurable detection thresholds and lookup parameters."""

    min_incidents_threshold: int = 2  # At least 2 matching incidents required to create a pattern
    similarity_threshold: float = 0.70  # Minimum similarity score required to match a pattern
    lookback_days: int = 30  # Historical lookback window in days


class RuleBasedPatternDetector:
    """Deterministic rule-based pattern matching and recurring failure clustering."""

    def __init__(self, db: Session, config: Optional[PatternDetectionConfig] = None) -> None:
        self.db = db
        self.config = config or PatternDetectionConfig()

    def evaluate_incident(self, incident: Incident) -> Optional[FailurePattern]:
        """Analyzes an incident against active patterns and historical incidents.

        Returns matching or newly synthesized FailurePattern, or None if isolated failure.
        """
        features = FeatureExtractor.extract_features(self.db, incident)

        # 1. First, check if incident matches any active existing pattern
        active_patterns = (
            self.db.query(FailurePattern)
            .filter(FailurePattern.status.in_(["candidate", "confirmed"]))
            .all()
        )

        best_pattern: Optional[FailurePattern] = None
        best_score = 0.0
        best_reasons: List[str] = []

        for pat in active_patterns:
            rule_features = pat.detection_rules.get("canonical_features", {})
            score, reasons = FeatureExtractor.compute_similarity(features, rule_features)
            if score >= self.config.similarity_threshold and score > best_score:
                best_score = score
                best_pattern = pat
                best_reasons = reasons

        if best_pattern:
            # Check if this incident is already linked
            existing_match = (
                self.db.query(PatternMatch)
                .filter(
                    PatternMatch.pattern_id == best_pattern.id,
                    PatternMatch.incident_id == incident.id,
                )
                .first()
            )
            if not existing_match:
                best_pattern.incident_count += 1
                best_pattern.last_detected_at = to_utc_dt(incident.detected_at)
                best_pattern.last_evaluated_at = datetime.now(timezone.utc)
                best_pattern.confidence_score = min(0.5 + (best_pattern.incident_count * 0.08), 0.99)

                example_ids = list(best_pattern.example_incident_ids)
                if incident.incident_id not in example_ids:
                    example_ids.append(incident.incident_id)
                    best_pattern.example_incident_ids = example_ids[:10]

                match_record = PatternMatch(
                    pattern_id=best_pattern.id,
                    incident_id=incident.id,
                    matched_at=datetime.now(timezone.utc),
                    similarity_score=best_score,
                    match_reasons={"reasons": best_reasons, "similarity": best_score},
                )
                self.db.add(match_record)
                self.db.commit()
                self.db.refresh(best_pattern)
                logger.info(
                    f"Incident {incident.incident_id} matched existing pattern '{best_pattern.name}' (score: {best_score})"
                )
            return best_pattern

        # 2. No existing pattern matched: Check historical incidents to see if a new candidate pattern emerges
        lookback_cutoff = datetime.now(timezone.utc) - timedelta(days=self.config.lookback_days)
        historical_incidents = (
            self.db.query(Incident)
            .filter(
                Incident.id != incident.id,
                Incident.detected_at >= lookback_cutoff,
            )
            .order_by(Incident.detected_at.desc())
            .limit(100)
            .all()
        )

        matching_incidents: List[Tuple[Incident, float, List[str]]] = []

        for hist_inc in historical_incidents:
            hist_feat = FeatureExtractor.extract_features(self.db, hist_inc)
            score, reasons = FeatureExtractor.compute_similarity(features, hist_feat)
            if score >= self.config.similarity_threshold:
                matching_incidents.append((hist_inc, score, reasons))

        # Check evidence support: current incident + matching historical >= min_incidents_threshold
        total_evidence_count = 1 + len(matching_incidents)
        if total_evidence_count < self.config.min_incidents_threshold:
            # Isolated failure! Do not classify as a recurring pattern.
            logger.info(
                f"Incident {incident.incident_id} is an isolated failure with insufficient historical evidence ({total_evidence_count} < {self.config.min_incidents_threshold})."
            )
            return None

        # 3. Sufficient evidence found -> Synthesize new candidate FailurePattern
        pattern_name, description, severity = self._synthesize_pattern_metadata(features, total_evidence_count)

        # Avoid duplicate pattern names
        existing_named = self.db.query(FailurePattern).filter(FailurePattern.name == pattern_name).first()
        if existing_named:
            # Re-link rather than duplicating
            self._link_incident(existing_named, incident, 0.95, ["Matching synthesized pattern definition"])
            return existing_named

        pattern_id = f"pat_{features['failure_category']}_{uuid.uuid4().hex[:8]}"
        all_incident_ids = [incident.incident_id] + [m[0].incident_id for m in matching_incidents]
        incident_dts = [to_utc_dt(incident.detected_at)] + [
            to_utc_dt(m[0].detected_at) for m in matching_incidents if m[0].detected_at
        ]
        first_time = min(incident_dts)
        last_time = max(incident_dts)

        new_pattern = FailurePattern(
            pattern_id=pattern_id,
            name=pattern_name,
            description=description,
            failure_category=features["failure_category"],
            service_name=features["service_name"],
            severity=severity,
            affected_services=[features["service_name"]],
            affected_steps=[features["failed_step"]],
            detection_rules={
                "rule_type": "deterministic_feature_match",
                "canonical_features": features,
                "evidence_count_at_creation": total_evidence_count,
            },
            incident_count=total_evidence_count,
            confidence_score=min(0.5 + (total_evidence_count * 0.1), 0.95),
            example_incident_ids=all_incident_ids[:10],
            status="candidate",
            first_detected_at=first_time,
            last_detected_at=last_time,
            last_evaluated_at=datetime.now(timezone.utc),
            is_demo=incident.is_demo,
        )
        self.db.add(new_pattern)
        self.db.flush()

        # Link current incident
        self.db.add(
            PatternMatch(
                pattern_id=new_pattern.id,
                incident_id=incident.id,
                matched_at=datetime.now(timezone.utc),
                similarity_score=1.0,
                match_reasons={"reasons": ["Seed incident forming candidate pattern"], "similarity": 1.0},
            )
        )

        # Link historical matching incidents
        for hist_inc, score, reasons in matching_incidents:
            self.db.add(
                PatternMatch(
                    pattern_id=new_pattern.id,
                    incident_id=hist_inc.id,
                    matched_at=datetime.now(timezone.utc),
                    similarity_score=score,
                    match_reasons={"reasons": reasons, "similarity": score},
                )
            )

        self.db.commit()
        self.db.refresh(new_pattern)
        logger.info(
            f"Created new candidate failure pattern '{new_pattern.name}' backed by {total_evidence_count} historical incidents."
        )
        return new_pattern

    def _link_incident(self, pattern: FailurePattern, incident: Incident, score: float, reasons: List[str]) -> None:
        """Helper to link an incident to an existing pattern."""
        existing = (
            self.db.query(PatternMatch)
            .filter(PatternMatch.pattern_id == pattern.id, PatternMatch.incident_id == incident.id)
            .first()
        )
        if not existing:
            pattern.incident_count += 1
            pattern.last_detected_at = to_utc_dt(incident.detected_at)
            pattern.last_evaluated_at = datetime.now(timezone.utc)
            self.db.add(
                PatternMatch(
                    pattern_id=pattern.id,
                    incident_id=incident.id,
                    matched_at=datetime.now(timezone.utc),
                    similarity_score=score,
                    match_reasons={"reasons": reasons, "similarity": score},
                )
            )
            self.db.commit()

    def _synthesize_pattern_metadata(self, features: Dict[str, Any], count: int) -> Tuple[str, str, str]:
        """Generates clear, human-readable name, description, and severity based on extracted features."""
        service = features.get("service_name", "Service")
        category = features.get("failure_category", "failure")
        step = features.get("failed_step", "Step")
        err = features.get("error_code")

        # Specific rule templates:
        if features.get("module") == "brand_impersonation" or "impersonation" in category:
            name = f"Recurring Impersonation Campaign targeting {service}"
            desc = f"Repeated suspicious domain registrations and spoofed assets targeting brand assets across {count} incidents."
            severity = "high"
        elif features.get("module") == "website_security" or category.startswith("threat_"):
            clean_cat = category.replace("threat_", "").replace("_", " ").title()
            name = f"Recurring {clean_cat} Attack on {service}"
            desc = f"Repeated {clean_cat.lower()} activity detected across {count} incidents on {service}."
            severity = "high"
        elif "payment_timeout" in category or "payment" in service:
            name = f"Recurring Gateway Timeout on {service}"
            desc = f"Repeated transaction timeouts observed on {service} in step '{step}'. Gateway fails to respond within SLA, placing transactions in indeterminate states."
            severity = "critical"
        elif "auth" in category or "auth" in service:
            name = f"Repeated Auth 5xx Crash on {service}"
            desc = f"Multiple authentication failures on {service} ({err}). Tokens or credentials could not be validated."
            severity = "high"
        elif "checkout" in category:
            name = f"Checkout Cascade Failure on {service}"
            desc = f"Frequent server-side calculation exceptions on {service} during order validation."
            severity = "high"
        elif "search_slow" in category:
            name = f"Persistent Latency Degradation on {service}"
            desc = f"Query response latency repeatedly breaching critical SLA on {service} in step '{step}'."
            severity = "medium"
        elif "confirmation_delayed" in category:
            name = f"Notification Queue Backlog on {service}"
            desc = f"Order confirmation dispatches experiencing high backlog delays on {service}."
            severity = "medium"
        else:
            name = f"Recurring {category.replace('_', ' ').title()} on {service}"
            desc = f"Historical recurrence of {category} failures observed across {count} incidents affecting {service}."
            severity = "high"

        return name, desc, severity

    def reevaluate_all_incidents(self) -> Dict[str, Any]:
        """Re-evaluates all historical incidents against detection rules and patterns."""
        all_incidents = self.db.query(Incident).order_by(Incident.detected_at.asc()).all()
        created_count = 0
        matched_count = 0

        for inc in all_incidents:
            pattern = self.evaluate_incident(inc)
            if pattern:
                matched_count += 1

        total_patterns = self.db.query(FailurePattern).count()
        return {
            "total_incidents_analyzed": len(all_incidents),
            "total_matches_found": matched_count,
            "total_patterns_active": total_patterns,
        }
