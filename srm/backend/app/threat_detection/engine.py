import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from app.models.website_threat import SecurityEvent, ThreatDetectionRuleConfig


@dataclass
class DetectionAssessment:
    """Findings generated when a threat detection rule triggers."""
    is_triggered: bool
    threat_category: str
    severity: str  # low, medium, high, critical
    risk_score: float  # 0.0 to 1.0
    rule_id: str
    rule_name: str
    detection_reasons: List[str] = field(default_factory=list)
    evidence_references: Dict[str, Any] = field(default_factory=dict)
    recommended_response: str = "investigate"  # block_ip, rate_limit_endpoint, challenge_turnstile, monitor, investigate
    requires_human_review: bool = True
    confidence_score: float = 0.8
    evidence_quality: str = "high"


# Regex patterns for deterministic SQLi and XSS inspection
SQLI_PATTERNS = [
    re.compile(r"(\bUNION\s+(ALL\s+)?SELECT\b)", re.IGNORECASE),
    re.compile(r"('|\%27)\s*OR\s*('|\%27)?\d+('|\%27)?\s*=\s*('|\%27)?\d+", re.IGNORECASE),
    re.compile(r"('|\%27)\s*OR\s*('|\%27)?[a-z0-9]+('|\%27)?\s*=\s*('|\%27)?[a-z0-9]+", re.IGNORECASE),
    re.compile(r"(;\s*DROP\s+TABLE\b)", re.IGNORECASE),
    re.compile(r"(\bSELECT\s+.*\s+FROM\s+INFORMATION_SCHEMA\b)", re.IGNORECASE),
    re.compile(r"(--\s*$|/\*.*?\*/|;\s*SHUTDOWN\b)", re.IGNORECASE),
]

XSS_PATTERNS = [
    re.compile(r"<\s*script[^>]*>.*?</\s*script\s*>", re.IGNORECASE | re.DOTALL),
    re.compile(r"<\s*script[^>]*>", re.IGNORECASE),
    re.compile(r"javascript\s*:\s*[^\s]+", re.IGNORECASE),
    re.compile(r"\bon(error|load|click|mouse\w+|focus|blur)\s*=", re.IGNORECASE),
    re.compile(r"<\s*(img|svg|iframe|body|object)[^>]+on\w+\s*=", re.IGNORECASE),
    re.compile(r"<\s*iframe[^>]*src\s*=", re.IGNORECASE),
]

PROBING_PATHS = {
    "/.env", "/.git", "/.git/head", "/wp-admin", "/wp-login.php",
    "/phpmyadmin", "/admin/config.php", "/etc/passwd", "/actuator/health",
    "/.aws/credentials", "/server-status", "/api/swagger-ui.html"
}


class BaseThreatRule(ABC):
    """Abstract interface for deterministic security detection rules."""

    @property
    @abstractmethod
    def rule_id(self) -> str:
        pass

    @property
    @abstractmethod
    def rule_name(self) -> str:
        pass

    @property
    @abstractmethod
    def threat_category(self) -> str:
        pass

    @property
    @abstractmethod
    def default_severity(self) -> str:
        pass

    @property
    def default_threshold(self) -> int:
        return 1

    @property
    def default_window_seconds(self) -> int:
        return 300

    @property
    def default_time_window(self) -> int:
        return self.default_window_seconds

    @property
    def description(self) -> str:
        return "Deterministic baseline security rule"

    @staticmethod
    def _collect_unique_window_events(
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
    ) -> List[SecurityEvent]:
        events_by_id = {e.event_id: e for e in window_events if e.event_id}
        if current_event.event_id:
            events_by_id[current_event.event_id] = current_event
        else:
            return window_events + [current_event]
        return list(events_by_id.values())

    @abstractmethod
    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        pass


class SqlInjectionRule(BaseThreatRule):
    """Detects SQL syntax patterns in URLs, query parameters, or sanitized payload indicators."""

    @property
    def rule_id(self) -> str:
        return "RULE-SQLI-001"

    @property
    def rule_name(self) -> str:
        return "SQL Injection Attack Pattern Detection"

    @property
    def threat_category(self) -> str:
        return "sqli"

    @property
    def default_severity(self) -> str:
        return "high"

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        text_samples = [current_event.endpoint]
        if current_event.request_indicators:
            text_samples.append(str(current_event.request_indicators))

        matched_patterns: List[str] = []
        for text in text_samples:
            for pat in SQLI_PATTERNS:
                m = pat.search(text)
                if m:
                    matched_patterns.append(m.group(0)[:60])

        if matched_patterns:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.85,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"SQL injection syntax matched in request indicators: '{', '.join(set(matched_patterns))}'."
                ],
                evidence_references={
                    "matched_patterns": list(set(matched_patterns)),
                    "client_ip": current_event.client_ip,
                    "endpoint": current_event.endpoint,
                },
                recommended_response="block_ip",
                requires_human_review=True,
                confidence_score=0.90,
                evidence_quality="high",
            )
        return None


class CrossSiteScriptingRule(BaseThreatRule):
    """Detects Cross-Site Scripting (XSS) payload signatures in request telemetry."""

    @property
    def rule_id(self) -> str:
        return "RULE-XSS-001"

    @property
    def rule_name(self) -> str:
        return "Cross-Site Scripting (XSS) Signature Detection"

    @property
    def threat_category(self) -> str:
        return "xss"

    @property
    def default_severity(self) -> str:
        return "high"

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        text_samples = [current_event.endpoint]
        if current_event.request_indicators:
            text_samples.append(str(current_event.request_indicators))

        matched_tags: List[str] = []
        for text in text_samples:
            for pat in XSS_PATTERNS:
                m = pat.search(text)
                if m:
                    matched_tags.append(m.group(0)[:60])

        if matched_tags:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.80,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"Cross-site scripting (XSS) payload tags detected: '{', '.join(set(matched_tags))}'."
                ],
                evidence_references={
                    "matched_tags": list(set(matched_tags)),
                    "client_ip": current_event.client_ip,
                    "endpoint": current_event.endpoint,
                },
                recommended_response="block_ip",
                requires_human_review=True,
                confidence_score=0.85,
                evidence_quality="high",
            )
        return None


class RepeatedAuthFailureRule(BaseThreatRule):
    """Detects repeated authentication failures from the same source IP within a sliding time window."""

    @property
    def rule_id(self) -> str:
        return "RULE-AUTH-FAIL-001"

    @property
    def rule_name(self) -> str:
        return "Repeated Authentication Failure Surge"

    @property
    def threat_category(self) -> str:
        return "auth_failure_surge"

    @property
    def default_severity(self) -> str:
        return "medium"

    @property
    def default_threshold(self) -> int:
        return 5

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        if current_event.auth_outcome != "failure" and current_event.status_code not in (401, 403):
            return None

        threshold = config.threshold_count if config else self.default_threshold

        # Count failures from same IP within the window
        all_events = self._collect_unique_window_events(current_event, window_events)
        matching_failures = [
            e for e in all_events
            if e.client_ip == current_event.client_ip and (e.auth_outcome == "failure" or e.status_code in (401, 403))
        ]
        total_failures = len(matching_failures)

        if total_failures >= threshold:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.65 + min(0.25, total_failures * 0.03),
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"Observed {total_failures} authentication failures from IP {current_event.client_ip} "
                    f"exceeding threshold of {threshold} failures within time window."
                ],
                evidence_references={
                    "client_ip": current_event.client_ip,
                    "failure_count": total_failures,
                    "endpoint": current_event.endpoint,
                },
                recommended_response="challenge_turnstile",
                requires_human_review=False,
                confidence_score=0.90,
                evidence_quality="high",
            )
        return None


class BruteForcePatternRule(BaseThreatRule):
    """Detects rapid, high-velocity brute force credential guessing bursts."""

    @property
    def rule_id(self) -> str:
        return "RULE-BRUTE-FORCE-001"

    @property
    def rule_name(self) -> str:
        return "Rapid Brute-Force Credential Attack Burst"

    @property
    def threat_category(self) -> str:
        return "brute_force"

    @property
    def default_severity(self) -> str:
        return "high"

    @property
    def default_threshold(self) -> int:
        return 10

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        if current_event.auth_outcome != "failure" and "login" not in current_event.endpoint and "auth" not in current_event.endpoint:
            return None

        threshold = config.threshold_count if config else self.default_threshold

        # Check rapid burst from same IP
        all_events = self._collect_unique_window_events(current_event, window_events)
        burst = [
            e for e in all_events
            if e.client_ip == current_event.client_ip and ("auth" in e.endpoint or "login" in e.endpoint or e.auth_outcome == "failure" or e.status_code in (401, 403))
        ]
        burst_count = len(burst)

        if burst_count >= threshold:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.88,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"High-frequency credential attack burst ({burst_count} attempts) detected targeting endpoint '{current_event.endpoint}'."
                ],
                evidence_references={
                    "client_ip": current_event.client_ip,
                    "burst_count": burst_count,
                    "target_endpoint": current_event.endpoint,
                },
                recommended_response="rate_limit_endpoint",
                requires_human_review=True,
                confidence_score=0.92,
                evidence_quality="high",
            )
        return None


class AbnormalApiRateRule(BaseThreatRule):
    """Detects abnormal API request rate exceeding normal threshold."""

    @property
    def rule_id(self) -> str:
        return "RULE-RATE-ABNORMAL-001"

    @property
    def rule_name(self) -> str:
        return "Abnormal API Request Frequency Surge"

    @property
    def threat_category(self) -> str:
        return "abnormal_rate"

    @property
    def default_severity(self) -> str:
        return "medium"

    @property
    def default_threshold(self) -> int:
        return 20

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        threshold = config.threshold_count if config else self.default_threshold

        all_events = self._collect_unique_window_events(current_event, window_events)
        ip_events = [e for e in all_events if e.client_ip == current_event.client_ip]
        total_requests = len(ip_events)

        if total_requests >= threshold:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.72,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"Abnormal request rate from IP {current_event.client_ip} ({total_requests} requests) "
                    f"exceeding baseline threshold of {threshold} requests within time window."
                ],
                evidence_references={
                    "client_ip": current_event.client_ip,
                    "request_count": total_requests,
                    "endpoint": current_event.endpoint,
                },
                recommended_response="rate_limit_endpoint",
                requires_human_review=False,
                confidence_score=0.85,
                evidence_quality="moderate",
            )
        return None


class SuspiciousEndpointProbingRule(BaseThreatRule):
    """Detects reconnaissance scanning of known sensitive administrative, config, or VCS endpoints."""

    @property
    def rule_id(self) -> str:
        return "RULE-PROBE-001"

    @property
    def rule_name(self) -> str:
        return "Suspicious Endpoint Reconnaissance & Probing"

    @property
    def threat_category(self) -> str:
        return "endpoint_probing"

    @property
    def default_severity(self) -> str:
        return "medium"

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        path_lower = current_event.endpoint.lower()
        is_probing_path = any(p in path_lower for p in PROBING_PATHS)

        if is_probing_path or current_event.event_category == "probe":
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.75,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"Reconnaissance probing detected targeting restricted path: '{current_event.endpoint}'."
                ],
                evidence_references={
                    "client_ip": current_event.client_ip,
                    "target_endpoint": current_event.endpoint,
                    "status_code": current_event.status_code,
                },
                recommended_response="block_ip",
                requires_human_review=False,
                confidence_score=0.95,
                evidence_quality="high",
            )
        return None


class AuthorizationSpikeRule(BaseThreatRule):
    """Detects clusters of 403 Forbidden authorization rejections suggesting privilege escalation attempts."""

    @property
    def rule_id(self) -> str:
        return "RULE-AUTHZ-SPIKE-001"

    @property
    def rule_name(self) -> str:
        return "Unexpected Authorization Rejection Spike"

    @property
    def threat_category(self) -> str:
        return "authorization_spike"

    @property
    def default_severity(self) -> str:
        return "medium"

    @property
    def default_threshold(self) -> int:
        return 4

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        if current_event.status_code != 403:
            return None

        threshold = config.threshold_count if config else self.default_threshold

        all_events = self._collect_unique_window_events(current_event, window_events)
        forbidden_events = [
            e for e in all_events
            if e.client_ip == current_event.client_ip and e.status_code == 403
        ]
        count = len(forbidden_events)

        if count >= threshold:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.70,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"Spike in 403 Forbidden responses ({count} events) from IP {current_event.client_ip} "
                    f"consistent with unauthorized resource enumeration or privilege testing."
                ],
                evidence_references={
                    "client_ip": current_event.client_ip,
                    "forbidden_count": count,
                    "endpoint": current_event.endpoint,
                },
                recommended_response="investigate",
                requires_human_review=True,
                confidence_score=0.80,
                evidence_quality="moderate",
            )
        return None


class PotentialDosSurgeRule(BaseThreatRule):
    """Detects traffic surges and 503 unavailability consistent with possible denial-of-service activity.

    Safety requirement: reports evidence consistent with possible DoS rather than claiming definitive DDoS.
    """

    @property
    def rule_id(self) -> str:
        return "RULE-DOS-SURGE-001"

    @property
    def rule_name(self) -> str:
        return "Traffic Surge Consistent with Possible Denial of Service"

    @property
    def threat_category(self) -> str:
        return "potential_dos_surge"

    @property
    def default_severity(self) -> str:
        return "high"

    @property
    def default_threshold(self) -> int:
        return 25

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        threshold = config.threshold_count if config else self.default_threshold

        # Look at total events across this service in the window
        all_events = self._collect_unique_window_events(current_event, window_events)
        service_events = [
            e for e in all_events
            if e.service_name == current_event.service_name
        ]
        count = len(service_events)
        service_unavail_count = sum(1 for e in service_events if e.status_code in (503, 429))

        if count >= threshold or service_unavail_count >= 5:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.82,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"Telemetry exhibits evidence consistent with a possible denial-of-service event: "
                    f"{count} aggregate requests and {service_unavail_count} HTTP 503 degradation responses "
                    f"observed targeting service '{current_event.service_name}'."
                ],
                evidence_references={
                    "service_name": current_event.service_name,
                    "request_surge_count": count,
                    "http_503_degradations": service_unavail_count,
                    "caveat": "Telemetry exhibits characteristics consistent with possible DoS; requires upstream infrastructure confirmation.",
                },
                recommended_response="rate_limit_endpoint",
                requires_human_review=True,
                confidence_score=0.75,
                evidence_quality="moderate",
            )
        return None


class RepeatedWafBlocksRule(BaseThreatRule):
    """Detects repeated WAF blocking actions against the same client or endpoint."""

    @property
    def rule_id(self) -> str:
        return "RULE-WAF-BLOCKS-001"

    @property
    def rule_name(self) -> str:
        return "Repeated WAF Security Rule Trigger Cluster"

    @property
    def threat_category(self) -> str:
        return "repeated_waf_blocks"

    @property
    def default_severity(self) -> str:
        return "high"

    @property
    def default_threshold(self) -> int:
        return 3

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        if current_event.action_taken not in ("blocked", "challenged") and current_event.event_category != "waf_block":
            return None

        threshold = config.threshold_count if config else self.default_threshold

        all_events = self._collect_unique_window_events(current_event, window_events)
        waf_blocks = [
            e for e in all_events
            if e.client_ip == current_event.client_ip and (e.action_taken in ("blocked", "challenged") or e.event_category == "waf_block")
        ]
        count = len(waf_blocks)

        if count >= threshold:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.86,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"Persistent WAF rule violations: {count} blocked/challenged requests recorded from IP {current_event.client_ip}."
                ],
                evidence_references={
                    "client_ip": current_event.client_ip,
                    "waf_block_count": count,
                    "rule_id": current_event.rule_id,
                },
                recommended_response="block_ip",
                requires_human_review=True,
                confidence_score=0.92,
                evidence_quality="high",
            )
        return None


class MultiEndpointCorrelationRule(BaseThreatRule):
    """Detects coordinated scanning or multi-vector attacks probing distinct endpoints from the same source."""

    @property
    def rule_id(self) -> str:
        return "RULE-CORRELATION-MULTI-001"

    @property
    def rule_name(self) -> str:
        return "Correlated Cross-Endpoint Security Probing"

    @property
    def threat_category(self) -> str:
        return "multi_endpoint_correlation"

    @property
    def default_severity(self) -> str:
        return "high"

    @property
    def default_threshold(self) -> int:
        return 3

    def evaluate(
        self,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        config: Optional[ThreatDetectionRuleConfig] = None,
    ) -> Optional[DetectionAssessment]:
        threshold = config.threshold_count if config else self.default_threshold

        all_events = self._collect_unique_window_events(current_event, window_events)
        ip_events = [e for e in all_events if e.client_ip == current_event.client_ip]
        distinct_endpoints: Set[str] = {e.endpoint for e in ip_events}

        # Trigger if hitting >= threshold distinct endpoints with errors or suspicious activity
        has_suspicious_activity = any(e.status_code in (401, 403, 404, 500) for e in ip_events)

        if len(distinct_endpoints) >= threshold and has_suspicious_activity:
            return DetectionAssessment(
                is_triggered=True,
                threat_category=self.threat_category,
                severity=config.severity if config else self.default_severity,
                risk_score=0.78,
                rule_id=self.rule_id,
                rule_name=self.rule_name,
                detection_reasons=[
                    f"Cross-endpoint attack pattern: IP {current_event.client_ip} probed {len(distinct_endpoints)} "
                    f"distinct application endpoints with elevated error responses within the time window."
                ],
                evidence_references={
                    "client_ip": current_event.client_ip,
                    "endpoints_probed": list(distinct_endpoints),
                    "total_events": len(ip_events) + 1,
                },
                recommended_response="investigate",
                requires_human_review=True,
                confidence_score=0.85,
                evidence_quality="high",
            )
        return None


class ThreatDetectionEngine:
    """Orchestrates deterministic baseline rules against incoming security telemetry streams."""

    _rules: Dict[str, BaseThreatRule] = {}

    @classmethod
    def register_rule(cls, rule: BaseThreatRule) -> None:
        cls._rules[rule.rule_id] = rule

    @classmethod
    def get_all_rules(cls) -> List[BaseThreatRule]:
        cls._ensure_defaults()
        return list(cls._rules.values())

    @classmethod
    def evaluate_event(
        cls,
        current_event: SecurityEvent,
        window_events: List[SecurityEvent],
        rule_configs: Optional[Dict[str, ThreatDetectionRuleConfig]] = None,
    ) -> List[DetectionAssessment]:
        cls._ensure_defaults()
        assessments: List[DetectionAssessment] = []
        rule_configs = rule_configs or {}

        for rule in cls._rules.values():
            cfg = rule_configs.get(rule.rule_id)
            # Skip rule if explicitly disabled in configuration
            if cfg and not cfg.is_enabled:
                continue

            assessment = rule.evaluate(
                current_event=current_event,
                window_events=window_events,
                config=cfg,
            )
            if assessment and assessment.is_triggered:
                assessments.append(assessment)

        return assessments

    @classmethod
    def _ensure_defaults(cls) -> None:
        if not cls._rules:
            cls.register_rule(SqlInjectionRule())
            cls.register_rule(CrossSiteScriptingRule())
            cls.register_rule(RepeatedAuthFailureRule())
            cls.register_rule(BruteForcePatternRule())
            cls.register_rule(AbnormalApiRateRule())
            cls.register_rule(SuspiciousEndpointProbingRule())
            cls.register_rule(AuthorizationSpikeRule())
            cls.register_rule(PotentialDosSurgeRule())
            cls.register_rule(RepeatedWafBlocksRule())
            cls.register_rule(MultiEndpointCorrelationRule())
