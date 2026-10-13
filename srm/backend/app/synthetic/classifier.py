from typing import Any, Dict, Optional, Tuple
from app.synthetic.thresholds import ServiceThreshold, get_monitoring_thresholds


class FailureClassifier:
    """Classifies synthetic execution step outcomes and determines incident metadata."""

    @classmethod
    def evaluate_step(
        cls,
        service_name: str,
        step_response: Dict[str, Any],
        is_required: bool,
    ) -> Tuple[bool, Optional[str], Optional[str], Optional[str]]:
        """Evaluates a step call result against thresholds and error signals.

        Returns: (is_failed, failure_category, severity, root_cause_hypothesis)
        """
        thresholds = get_monitoring_thresholds()
        service_threshold = thresholds.services.get(
            service_name,
            ServiceThreshold(
                warning_latency_ms=1000.0,
                critical_latency_ms=3000.0,
                timeout_ms=thresholds.default_timeout_ms,
            ),
        )

        latency_ms = step_response.get("latency_ms", 0.0)
        status = step_response.get("status", "success")
        success = step_response.get("success", True)
        http_status = step_response.get("http_status", 200)
        explicit_category = step_response.get("failure_category")

        # 1. Timeout detection
        if status == "timed_out" or latency_ms >= service_threshold.timeout_ms:
            category = explicit_category or f"{service_name.replace('-service', '')}_timeout"
            severity = "critical" if "payment" in service_name else ("high" if is_required else "medium")
            hypothesis = f"Request to {service_name} timed out ({latency_ms}ms >= SLA {service_threshold.timeout_ms}ms)."
            return True, category, severity, hypothesis

        # 2. HTTP Server Error (5xx)
        if http_status >= 500 or not success:
            category = explicit_category or f"{service_name.replace('-service', '')}_error"
            severity = "critical" if "payment" in service_name or "checkout" in service_name else "high"
            hypothesis = f"{service_name} returned HTTP {http_status} with error code '{step_response.get('error_code')}': {step_response.get('error_details')}"
            return True, category, severity, hypothesis

        # 3. Latency SLA breach (e.g. search_slow, confirmation_delayed)
        if latency_ms >= service_threshold.critical_latency_ms or status == "degraded_latency":
            category = explicit_category or "latency_sla_breach"
            severity = "medium" if not is_required else "high"
            hypothesis = f"{service_name} latency ({latency_ms}ms) exceeded critical threshold ({service_threshold.critical_latency_ms}ms)."
            # Note: Degraded latency can be treated as a performance incident while allowing journey to proceed
            return True, category, severity, hypothesis

        # 4. Successful step within limits
        return False, None, None, None
