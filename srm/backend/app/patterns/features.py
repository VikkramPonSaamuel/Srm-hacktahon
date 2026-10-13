from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.execution import StepExecution
from app.models.health import ServiceHealthSnapshot
from app.models.incident import Incident


class FeatureExtractor:
    """Extracts analytical feature vectors from failure incidents and historical telemetry across all platform modules."""

    @classmethod
    def extract_features(cls, db: Session, incident: Incident) -> Dict[str, Any]:
        """Extracts normalized feature attributes from an incident record and its context."""
        module = incident.module
        service_name = incident.service_name or "unknown-service"
        failure_category = incident.failure_category or "unclassified"
        journey_type = incident.journey.journey_type if incident.journey else "generic"

        failed_step_name = "unknown_step"
        error_code = "UNKNOWN_ERROR"
        http_status_code = None
        latency_ms = 0.0

        if incident.step_execution:
            step_exec = incident.step_execution
            error_code = step_exec.error_code or "UNKNOWN_ERROR"
            http_status_code = step_exec.http_status
            latency_ms = step_exec.latency_ms or 0.0
            if step_exec.journey_step:
                failed_step_name = step_exec.journey_step.step_name

        # HTTP Status Class categorization
        if http_status_code:
            if http_status_code == 504:
                http_class = "timeout_504"
            elif http_status_code >= 500:
                http_class = "5xx"
            elif http_status_code >= 400:
                http_class = "4xx"
            else:
                http_class = "2xx"
        else:
            http_class = "none"

        # Latency Range Bucket
        if latency_ms >= 5000.0:
            latency_range = "severe"
        elif latency_ms >= 2000.0:
            latency_range = "high"
        elif latency_ms >= 500.0:
            latency_range = "elevated"
        else:
            latency_range = "normal"

        # Extract telemetry details from events if available
        threat_rule_id = None
        threat_endpoint = None
        suspicious_domain = None
        brand_id = None

        if incident.events:
            for ev in incident.events:
                dtls = ev.details or {}
                if "rule_id" in dtls:
                    threat_rule_id = dtls["rule_id"]
                if "endpoint" in dtls:
                    threat_endpoint = dtls["endpoint"]
                if "suspicious_domain" in dtls:
                    suspicious_domain = dtls["suspicious_domain"]
                if "brand_id" in dtls:
                    brand_id = dtls["brand_id"]

        # Recent dependency health snapshot query
        recent_snapshot = (
            db.query(ServiceHealthSnapshot)
            .filter(ServiceHealthSnapshot.service_name == service_name)
            .order_by(ServiceHealthSnapshot.timestamp.desc())
            .first()
        )
        dependency_health = recent_snapshot.status if recent_snapshot else "unknown"

        timing_hour = incident.detected_at.hour if incident.detected_at else 0

        return {
            "module": module,
            "incident_type": incident.incident_type,
            "service_name": service_name,
            "journey_type": journey_type,
            "failed_step": failed_step_name,
            "failure_category": failure_category,
            "error_code": error_code,
            "http_status_class": http_class,
            "latency_range": latency_range,
            "dependency_health": dependency_health,
            "timing_hour": timing_hour,
            "threat_rule_id": threat_rule_id,
            "endpoint": threat_endpoint,
            "suspicious_domain": suspicious_domain,
            "brand_id": brand_id,
        }

    @classmethod
    def compute_similarity(cls, f1: Dict[str, Any], f2: Dict[str, Any]) -> Tuple[float, List[str]]:
        """Calculates deterministic weighted feature similarity between two incident feature sets.

        Supports:
        - Transaction reliability incidents.
        - Repeated website attack events.
        - Repeated suspicious domains & threat indicators.
        - Cross-module correlations affecting shared services or business journeys with traceable evidence.
        Enforces: Does NOT merge incidents merely because they share a brand name, IP address, or time window.
        """
        mod1 = f1.get("module")
        if not mod1:
            cat1_str = str(f1.get("failure_category") or "")
            if cat1_str.startswith("threat_"):
                mod1 = "website_security"
            elif f1.get("service_name") == "brand_protection" or "impersonation" in cat1_str:
                mod1 = "brand_impersonation"
            else:
                mod1 = "transaction_reliability"

        mod2 = f2.get("module")
        if not mod2:
            cat2_str = str(f2.get("failure_category") or "")
            if cat2_str.startswith("threat_"):
                mod2 = "website_security"
            elif f2.get("service_name") == "brand_protection" or "impersonation" in cat2_str:
                mod2 = "brand_impersonation"
            else:
                mod2 = "transaction_reliability"

        score = 0.0
        reasons: List[str] = []

        # =====================================================================
        # Case 1: Cross-Module Correlation (Shared Service or Journey)
        # =====================================================================
        if mod1 != mod2:
            # Check for sufficient evidence linking distinct module incidents affecting a shared service
            same_service = f1.get("service_name") == f2.get("service_name") and f1.get("service_name") not in (None, "unknown-service")
            same_journey = f1.get("journey_type") == f2.get("journey_type") and f1.get("journey_type") not in (None, "generic")

            if same_service:
                score += 0.40
                reasons.append(f"Correlated impact on shared service: '{f1.get('service_name')}'")

            if same_journey:
                score += 0.20
                reasons.append(f"Cross-incident disruption on business journey: '{f1.get('journey_type')}'")

            # Check cascading disruption evidence (e.g. security attack surge causing transaction failure/latency)
            cat1 = f1.get("failure_category", "")
            cat2 = f2.get("failure_category", "")
            is_sec_and_tx = (
                (cat1.startswith("threat_") and not cat2.startswith("threat_"))
                or (cat2.startswith("threat_") and not cat1.startswith("threat_"))
            )
            if same_service and is_sec_and_tx:
                score += 0.25
                reasons.append("Sufficient evidence: Security threat activity correlates with operational transaction degradation")

            # Dependency health degradation linkage
            if same_service and (f1.get("dependency_health") in ("degraded", "unhealthy") or f2.get("dependency_health") in ("degraded", "unhealthy")):
                score += 0.15
                reasons.append("Shared dependency telemetry confirms health degradation under active threat")

            return round(score, 3), reasons

        # =====================================================================
        # Case 2: Website Security Incidents
        # =====================================================================
        if mod1 == "website_security":
            # Service / Target match (0.35)
            if f1.get("service_name") == f2.get("service_name"):
                score += 0.35
                reasons.append(f"Identical target service: '{f1.get('service_name')}'")

            # Attack / Failure Category Match (0.35)
            if f1.get("failure_category") == f2.get("failure_category"):
                score += 0.35
                reasons.append(f"Matching attack pattern / threat category: '{f1.get('failure_category')}'")

            # Threat Rule ID Match (0.15)
            if f1.get("threat_rule_id") and f1.get("threat_rule_id") == f2.get("threat_rule_id"):
                score += 0.15
                reasons.append(f"Identical security detection rule: '{f1.get('threat_rule_id')}'")

            # Endpoint Match (0.15)
            if f1.get("endpoint") and f1.get("endpoint") == f2.get("endpoint"):
                score += 0.15
                reasons.append(f"Matching targeted endpoint: '{f1.get('endpoint')}'")

            return round(score, 3), reasons

        # =====================================================================
        # Case 3: Brand Impersonation Incidents
        # =====================================================================
        if mod1 == "brand_impersonation":
            # Failure Category Match (0.35)
            if f1.get("failure_category") == f2.get("failure_category"):
                score += 0.35
                reasons.append(f"Matching impersonation threat category: '{f1.get('failure_category')}'")

            # Suspicious Domain Pattern Match (0.45)
            # Crucial: Identical suspicious domain or variant indicator constitutes pattern
            if f1.get("suspicious_domain") and f1.get("suspicious_domain") == f2.get("suspicious_domain"):
                score += 0.45
                reasons.append(f"Repeated suspicious domain threat indicator: '{f1.get('suspicious_domain')}'")

            # Target Brand Reference Match (0.15)
            # Note: Brand alone (0.15) or time window alone never meets the 0.70 threshold
            if f1.get("brand_id") and f1.get("brand_id") == f2.get("brand_id"):
                score += 0.15
                reasons.append(f"Targeting same brand reference: '{f1.get('brand_id')}'")

            # Service Component match (0.05)
            if f1.get("service_name") == f2.get("service_name"):
                score += 0.05
                reasons.append("Matching brand protection service context")

            return round(score, 3), reasons

        # =====================================================================
        # Case 4: Transaction Reliability Incidents (Preserve exact existing weights)
        # =====================================================================
        # Service / Component Match (Weight: 0.35)
        if f1.get("service_name") == f2.get("service_name"):
            score += 0.35
            reasons.append(f"Identical target service: '{f1.get('service_name')}'")

        # Failure Category Match (Weight: 0.35)
        if f1.get("failure_category") == f2.get("failure_category"):
            score += 0.35
            reasons.append(f"Matching failure category: '{f1.get('failure_category')}'")

        # Error Code Match (Weight: 0.10)
        if f1.get("error_code") == f2.get("error_code") and f1.get("error_code") not in (None, "UNKNOWN_ERROR"):
            score += 0.10
            reasons.append(f"Exact error code match: '{f1.get('error_code')}'")

        # HTTP Status Class Match (Weight: 0.10)
        if f1.get("http_status_class") == f2.get("http_status_class") and f1.get("http_status_class") not in (None, "none"):
            score += 0.10
            reasons.append(f"Matching HTTP status class: '{f1.get('http_status_class')}'")

        # Failed Step Match (Weight: 0.05)
        if f1.get("failed_step") == f2.get("failed_step") and f1.get("failed_step") not in (None, "unknown_step"):
            score += 0.05
            reasons.append(f"Same journey step: '{f1.get('failed_step')}'")

        # Journey Type Match (Weight: 0.05)
        if f1.get("journey_type") == f2.get("journey_type") and f1.get("journey_type") not in (None, "generic"):
            score += 0.05
            reasons.append(f"Same business journey type: '{f1.get('journey_type')}'")

        return round(score, 3), reasons
