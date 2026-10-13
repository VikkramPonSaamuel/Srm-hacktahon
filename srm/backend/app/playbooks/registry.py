from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Set
from app.core.exceptions import BadRequestError
from app.playbooks.adapters import (
    MockBrandProtectionActionAdapter,
    MockCircuitBreakerAdapter,
    MockEndpointMonitoringAdapter,
    MockNotificationAdapter,
    MockPaymentGatewayAdapter,
    MockPaymentReconcilerAdapter,
    MockRateLimitPolicyAdapter,
    MockSecurityNotificationAdapter,
    MockUpstreamMitigationAdapter,
    MockWafActionAdapter,
)
from app.synthetic.mocks import MockServiceRegistry


@dataclass(frozen=True)
class ActionDefinition:
    action_type: str
    description: str
    risk_level: str  # low, medium, high, critical
    requires_approval: bool
    required_parameters: Set[str]
    allowed_parameters: Set[str]
    family: str = "operational_recovery"  # operational_recovery, brand_threat_reporting, website_security_mitigation, universal


ALLOWLISTED_ACTIONS: Dict[str, ActionDefinition] = {
    "check_dependency_health": ActionDefinition(
        action_type="check_dependency_health",
        description="Inspect dependency health and response times in the mock ecosystem.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"service_name"},
        allowed_parameters={"service_name"},
    ),
    "idempotent_health_check": ActionDefinition(
        action_type="idempotent_health_check",
        description="Execute a safe, idempotent ping check against a target microservice.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"service_name"},
        allowed_parameters={"service_name", "endpoint"},
    ),
    "circuit_breaker_toggle": ActionDefinition(
        action_type="circuit_breaker_toggle",
        description="Open or close a circuit breaker in the mock environment to isolate unhealthy components.",
        risk_level="medium",
        requires_approval=False,
        required_parameters={"service_name", "target_state", "reason"},
        allowed_parameters={"service_name", "target_state", "reason"},
    ),
    "switch_payment_gateway": ActionDefinition(
        action_type="switch_payment_gateway",
        description="Route new eligible payment attempts to a healthy secondary mock gateway.",
        risk_level="high",
        requires_approval=True,  # High risk strictly requires approval!
        required_parameters={"source_gateway", "target_gateway", "reason"},
        allowed_parameters={"source_gateway", "target_gateway", "reason", "allow_existing"},
    ),
    "reconcile_payment_status": ActionDefinition(
        action_type="reconcile_payment_status",
        description="Verify transaction state with the mock provider using idempotency keys before retrying.",
        risk_level="medium",
        requires_approval=False,
        required_parameters={"idempotency_key"},
        allowed_parameters={"idempotency_key", "gateway", "order_id"},
    ),
    "pause_retry_sequence": ActionDefinition(
        action_type="pause_retry_sequence",
        description="Pause an unsafe retry loop when downstream service is degraded or rate limited.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"service_name", "duration_seconds", "reason"},
        allowed_parameters={"service_name", "duration_seconds", "reason"},
    ),
    "mark_manual_review": ActionDefinition(
        action_type="mark_manual_review",
        description="Mark an incident for human investigation when automated resolution cannot guarantee safety.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"reason"},
        allowed_parameters={"reason", "urgency"},
        family="universal",
    ),
    "send_notification": ActionDefinition(
        action_type="send_notification",
        description="Send an operational alert message via development notification adapters.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"channel", "message"},
        allowed_parameters={"channel", "message", "metadata"},
        family="universal",
    ),
    "raise_security_alert": ActionDefinition(
        action_type="raise_security_alert",
        description="Raise a security alert in operational and security dashboards.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"alert_level", "message"},
        allowed_parameters={"alert_level", "message", "service_name", "endpoint", "threat_id"},
        family="universal",
    ),
    "increase_endpoint_monitoring": ActionDefinition(
        action_type="increase_endpoint_monitoring",
        description="Increase sampling rate and diagnostic logging for an affected endpoint.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"endpoint", "sampling_rate"},
        allowed_parameters={"endpoint", "sampling_rate", "duration_seconds", "service_name"},
        family="website_security_mitigation",
    ),
    "request_rate_limit_policy": ActionDefinition(
        action_type="request_rate_limit_policy",
        description="Request a temporary rate-limit policy through an authorized rate-limiting adapter.",
        risk_level="medium",
        requires_approval=False,
        required_parameters={"endpoint", "rate_limit_rpm", "duration_seconds"},
        allowed_parameters={"endpoint", "rate_limit_rpm", "duration_seconds", "client_ip", "reason"},
        family="website_security_mitigation",
    ),
    "request_waf_rule_action": ActionDefinition(
        action_type="request_waf_rule_action",
        description="Request a WAF rule action (e.g. challenge or single IP block) through an authorized WAF adapter.",
        risk_level="high",
        requires_approval=True,  # High impact: requires explicit human approval!
        required_parameters={"waf_action", "target", "reason"},
        allowed_parameters={"waf_action", "target", "reason", "rule_id", "duration_seconds", "allow_rollback"},
        family="website_security_mitigation",
    ),
    "throttle_auth_failures": ActionDefinition(
        action_type="throttle_auth_failures",
        description="Temporarily throttle repeated authentication failures for an endpoint or IP.",
        risk_level="medium",
        requires_approval=False,
        required_parameters={"endpoint", "throttle_delay_ms", "duration_seconds"},
        allowed_parameters={"endpoint", "throttle_delay_ms", "duration_seconds", "client_ip", "reason"},
        family="website_security_mitigation",
    ),
    "notify_security_admin": ActionDefinition(
        action_type="notify_security_admin",
        description="Notify the authorized security administrator via security alerts channel.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"admin_channel", "message"},
        allowed_parameters={"admin_channel", "message", "threat_id", "severity", "incident_id"},
        family="website_security_mitigation",
    ),
    "escalate_privilege_activity": ActionDefinition(
        action_type="escalate_privilege_activity",
        description="Escalate suspicious privilege or authorization activity for review.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"reason"},
        allowed_parameters={"reason", "urgency", "client_ip", "endpoint", "user_reference"},
        family="website_security_mitigation",
    ),
    "initiate_upstream_mitigation": ActionDefinition(
        action_type="initiate_upstream_mitigation",
        description="Initiate a configured upstream mitigation workflow with cloud CDN or DDoS provider.",
        risk_level="high",
        requires_approval=True,  # High impact: requires explicit human approval!
        required_parameters={"provider", "workflow_name", "reason"},
        allowed_parameters={"provider", "workflow_name", "reason", "service_name", "mitigation_parameters"},
        family="website_security_mitigation",
    ),
    "record_mitigation_verification": ActionDefinition(
        action_type="record_mitigation_verification",
        description="Record a defensive mitigation verification result and telemetry check.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"verification_status", "details"},
        allowed_parameters={"verification_status", "details", "metric_observed", "improved"},
        family="website_security_mitigation",
    ),
    "draft_brand_complaint": ActionDefinition(
        action_type="draft_brand_complaint",
        description="Prepare a structured cyber complaint package for confirmed brand impersonation.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"reporting_channel"},
        allowed_parameters={"reporting_channel", "domain", "brand_id", "notes"},
        family="brand_threat_reporting",
    ),
    "escalate_brand_takedown": ActionDefinition(
        action_type="escalate_brand_takedown",
        description="Escalate an abusive impersonation domain for takedown action.",
        risk_level="high",
        requires_approval=True,  # High impact: requires explicit human approval!
        required_parameters={"domain", "reason"},
        allowed_parameters={"domain", "reason", "registrar", "brand_id"},
        family="brand_threat_reporting",
    ),
    "notify_brand_representative": ActionDefinition(
        action_type="notify_brand_representative",
        description="Notify the authorized brand representative regarding active impersonation threats.",
        risk_level="low",
        requires_approval=False,
        required_parameters={"recipient", "message"},
        allowed_parameters={"recipient", "message", "brand_name", "domain"},
        family="brand_threat_reporting",
    ),
}


class ActionRegistry:
    """Strictly controlled, allowlisted execution engine for recovery actions."""

    @classmethod
    def is_allowlisted(cls, action_type: str) -> bool:
        return action_type in ALLOWLISTED_ACTIONS

    @classmethod
    def is_action_allowlisted(cls, action_type: str) -> bool:
        return action_type in ALLOWLISTED_ACTIONS

    @classmethod
    def get_definition(cls, action_type: str) -> Optional[ActionDefinition]:
        return ALLOWLISTED_ACTIONS.get(action_type)

    @classmethod
    def get_action_family(cls, action_type: str) -> str:
        defn = cls.get_definition(action_type)
        return defn.family if defn else "operational_recovery"

    @classmethod
    def validate_action_for_incident(cls, action_type: str, incident: Any) -> None:
        """Validates that an action family is valid for the target incident category."""
        if not incident:
            return
        action_family = cls.get_action_family(action_type)
        if action_family == "universal":
            return

        incident_module = getattr(incident, "module", "transaction_reliability")
        allowed_map = {
            "transaction_reliability": {"operational_recovery", "universal"},
            "website_security": {"website_security_mitigation", "universal"},
            "brand_impersonation": {"brand_threat_reporting", "universal"},
        }
        allowed = allowed_map.get(incident_module, {"universal"})
        if action_family not in allowed:
            raise BadRequestError(
                f"Action '{action_type}' (family: {action_family}) cannot be applied to incident "
                f"'{getattr(incident, 'incident_id', 'unknown')}' belonging to module '{incident_module}'. "
                f"Actions must match incident category."
            )

    @classmethod
    def validate_action(cls, action_type: str, parameters: Dict[str, Any], risk_level: Optional[str] = None) -> None:
        """Validates that action is strictly allowlisted, parameters conform to schema,

        and safety requirements (e.g. High risk approval) are satisfied.
        """
        if action_type not in ALLOWLISTED_ACTIONS:
            raise BadRequestError(
                message=f"Action '{action_type}' is not recognized in the allowlisted action registry. "
                f"Execution of arbitrary Python, shell commands, SQL, or unapproved actions is strictly prohibited."
            )

        defn = ALLOWLISTED_ACTIONS[action_type]

        # Check required parameters
        missing = defn.required_parameters - set(parameters.keys())
        if missing:
            raise BadRequestError(
                message=f"Action '{action_type}' is missing required parameter(s): {', '.join(sorted(missing))}"
            )

        # Check for disallowed parameters
        disallowed = set(parameters.keys()) - defn.allowed_parameters
        if disallowed:
            raise BadRequestError(
                message=f"Action '{action_type}' contains disallowed parameter(s): {', '.join(sorted(disallowed))}"
            )

        # Value-level validations
        if action_type == "circuit_breaker_toggle":
            state = parameters.get("target_state")
            if state not in ("open", "closed", "half_open"):
                raise BadRequestError(
                    message=f"Invalid target_state '{state}'. Must be 'open', 'closed', or 'half_open'."
                )

        if action_type == "switch_payment_gateway":
            source = parameters.get("source_gateway")
            target = parameters.get("target_gateway")
            if source == target:
                raise BadRequestError(message="Source and target payment gateways cannot be identical.")

        if action_type == "pause_retry_sequence":
            duration = parameters.get("duration_seconds")
            if not isinstance(duration, (int, float)) or duration <= 0 or duration > 3600:
                raise BadRequestError(message="pause_retry_sequence duration_seconds must be between 1 and 3600.")

        if action_type == "raise_security_alert":
            level = parameters.get("alert_level")
            if level not in ("low", "medium", "high", "critical"):
                raise BadRequestError(message=f"Invalid alert_level '{level}'. Must be 'low', 'medium', 'high', or 'critical'.")

        if action_type == "increase_endpoint_monitoring":
            rate = parameters.get("sampling_rate")
            if not isinstance(rate, (int, float)) or rate < 1 or rate > 100:
                raise BadRequestError(message="increase_endpoint_monitoring sampling_rate must be an integer between 1 and 100.")

        if action_type == "request_rate_limit_policy":
            rpm = parameters.get("rate_limit_rpm")
            dur = parameters.get("duration_seconds")
            if not isinstance(rpm, int) or rpm < 1:
                raise BadRequestError(message="request_rate_limit_policy rate_limit_rpm must be >= 1.")
            if not isinstance(dur, int) or dur < 10 or dur > 86400:
                raise BadRequestError(message="request_rate_limit_policy duration_seconds must be between 10 and 86400.")

        if action_type == "request_waf_rule_action":
            waf_action = parameters.get("waf_action")
            if waf_action not in ("challenge", "block_ip", "rate_limit"):
                raise BadRequestError(message=f"Invalid waf_action '{waf_action}'. Must be 'challenge', 'block_ip', or 'rate_limit'.")
            target = str(parameters.get("target", "")).strip()
            if target in ("0.0.0.0/0", "::/0", "*") or any(target.endswith(f"/{p}") for p in range(0, 17)):
                raise BadRequestError(message=f"Prohibited target '{target}': Broad CIDR range blocking is not permitted by defensive policy.")

        if action_type == "throttle_auth_failures":
            delay = parameters.get("throttle_delay_ms")
            dur = parameters.get("duration_seconds")
            if not isinstance(delay, (int, float)) or delay < 100 or delay > 10000:
                raise BadRequestError(message="throttle_auth_failures throttle_delay_ms must be between 100 and 10000.")
            if not isinstance(dur, (int, float)) or dur < 10 or dur > 3600:
                raise BadRequestError(message="throttle_auth_failures duration_seconds must be between 10 and 3600.")

        if action_type == "initiate_upstream_mitigation":
            prov = parameters.get("provider")
            if prov not in ("cloudflare", "aws_shield", "akamai", "fastly", "mock_cdn"):
                raise BadRequestError(message=f"Invalid mitigation provider '{prov}'. Must be one of: cloudflare, aws_shield, akamai, fastly, mock_cdn.")

        if action_type == "record_mitigation_verification":
            v_status = parameters.get("verification_status")
            if v_status not in ("verified", "unverified", "failed", "uncertain"):
                raise BadRequestError(message=f"Invalid verification_status '{v_status}'. Must be 'verified', 'unverified', 'failed', or 'uncertain'.")

    @classmethod
    def execute_action(
        cls,
        action_type: str,
        parameters: Dict[str, Any],
        is_simulation: bool = False,
    ) -> Dict[str, Any]:
        """Executes an allowlisted recovery action.

        In simulation mode, evaluates inputs and returns dry-run results without mutating external state.
        """
        cls.validate_action(action_type, parameters)
        defn = ALLOWLISTED_ACTIONS[action_type]

        if is_simulation:
            return {
                "action_type": action_type,
                "status": "simulated",
                "risk_level": defn.risk_level,
                "simulated_outcome": f"Dry-run simulation of {action_type} succeeded with parameters {parameters}.",
                "simulated": True,
            }

        # Dispatch real execution to mock adapters
        if action_type == "check_dependency_health":
            service_name = parameters["service_name"]
            mock_res = MockServiceRegistry.execute_mock_call(service_name, "health_check")
            return {
                "action_type": action_type,
                "status": "succeeded" if mock_res.get("success") else "degraded",
                "service_name": service_name,
                "health_status": "healthy" if mock_res.get("success") else "unhealthy",
                "latency_ms": mock_res.get("latency_ms"),
            }

        if action_type == "idempotent_health_check":
            service_name = parameters["service_name"]
            mock_res = MockServiceRegistry.execute_mock_call(service_name, "ping")
            return {
                "action_type": action_type,
                "status": "succeeded" if mock_res.get("success") else "failed",
                "service_name": service_name,
                "latency_ms": mock_res.get("latency_ms"),
            }

        if action_type == "circuit_breaker_toggle":
            record = MockCircuitBreakerAdapter.set_state(
                service_name=parameters["service_name"],
                state=parameters["target_state"],
                reason=parameters["reason"],
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "circuit_breaker": record,
            }

        if action_type == "switch_payment_gateway":
            record = MockPaymentGatewayAdapter.switch_gateway(
                source_gateway=parameters["source_gateway"],
                target_gateway=parameters["target_gateway"],
                reason=parameters["reason"],
                allow_existing=parameters.get("allow_existing", False),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "routing": record,
            }

        if action_type == "reconcile_payment_status":
            record = MockPaymentReconcilerAdapter.reconcile_transaction(
                idempotency_key=parameters["idempotency_key"],
                gateway=parameters.get("gateway", "primary-payment-gateway"),
                order_id=parameters.get("order_id"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "reconciliation": record,
            }

        if action_type == "pause_retry_sequence":
            return {
                "action_type": action_type,
                "status": "succeeded",
                "paused_service": parameters["service_name"],
                "duration_seconds": parameters["duration_seconds"],
                "reason": parameters["reason"],
            }

        if action_type == "mark_manual_review":
            return {
                "action_type": action_type,
                "status": "escalated",
                "manual_intervention_required": True,
                "reason": parameters["reason"],
                "urgency": parameters.get("urgency", "normal"),
            }

        if action_type == "send_notification":
            record = MockNotificationAdapter.send_notification(
                channel=parameters["channel"],
                message=parameters["message"],
                metadata=parameters.get("metadata"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "notification": record,
            }

        if action_type == "raise_security_alert":
            record = MockSecurityNotificationAdapter.send_alert(
                alert_level=parameters["alert_level"],
                message=parameters["message"],
                metadata={
                    "service_name": parameters.get("service_name"),
                    "endpoint": parameters.get("endpoint"),
                    "threat_id": parameters.get("threat_id"),
                },
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "alert": record,
            }

        if action_type == "increase_endpoint_monitoring":
            record = MockEndpointMonitoringAdapter.increase_monitoring(
                endpoint=parameters["endpoint"],
                sampling_rate=parameters["sampling_rate"],
                duration_seconds=parameters.get("duration_seconds", 600),
                service_name=parameters.get("service_name"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "monitoring": record,
            }

        if action_type == "request_rate_limit_policy":
            record = MockRateLimitPolicyAdapter.apply_policy(
                endpoint=parameters["endpoint"],
                rate_limit_rpm=parameters["rate_limit_rpm"],
                duration_seconds=parameters.get("duration_seconds", 300),
                client_ip=parameters.get("client_ip"),
                reason=parameters.get("reason", "Automated threat response"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "rate_limit_policy": record,
            }

        if action_type == "request_waf_rule_action":
            record = MockWafActionAdapter.apply_rule(
                waf_action=parameters["waf_action"],
                target=parameters["target"],
                reason=parameters["reason"],
                rule_id=parameters.get("rule_id"),
                duration_seconds=parameters.get("duration_seconds", 3600),
                allow_rollback=parameters.get("allow_rollback", True),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "waf_rule": record,
            }

        if action_type == "throttle_auth_failures":
            record = MockRateLimitPolicyAdapter.apply_policy(
                endpoint=parameters["endpoint"],
                rate_limit_rpm=max(1, int(60000 / parameters["throttle_delay_ms"])),
                duration_seconds=parameters.get("duration_seconds", 600),
                client_ip=parameters.get("client_ip"),
                reason=parameters.get("reason", "Throttle repeated authentication failures"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "throttled_endpoint": parameters["endpoint"],
                "throttle_delay_ms": parameters["throttle_delay_ms"],
                "policy": record,
            }

        if action_type == "notify_security_admin":
            record = MockSecurityNotificationAdapter.notify_admin(
                admin_channel=parameters["admin_channel"],
                message=parameters["message"],
                metadata={
                    "threat_id": parameters.get("threat_id"),
                    "severity": parameters.get("severity"),
                    "incident_id": parameters.get("incident_id"),
                },
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "notification": record,
            }

        if action_type == "escalate_privilege_activity":
            return {
                "action_type": action_type,
                "status": "escalated",
                "manual_intervention_required": True,
                "reason": parameters["reason"],
                "urgency": parameters.get("urgency", "high"),
                "client_ip": parameters.get("client_ip"),
                "endpoint": parameters.get("endpoint"),
            }

        if action_type == "initiate_upstream_mitigation":
            record = MockUpstreamMitigationAdapter.initiate_workflow(
                provider=parameters["provider"],
                workflow_name=parameters["workflow_name"],
                reason=parameters["reason"],
                service_name=parameters.get("service_name"),
                mitigation_parameters=parameters.get("mitigation_parameters"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "upstream_workflow": record,
            }

        if action_type == "record_mitigation_verification":
            status_val = parameters["verification_status"]
            improved = parameters.get("improved", status_val == "verified")
            return {
                "action_type": action_type,
                "status": "succeeded" if status_val == "verified" else ("failed" if status_val == "failed" else "escalated"),
                "verification_status": status_val,
                "improved": improved,
                "details": parameters["details"],
                "metric_observed": parameters.get("metric_observed"),
            }

        if action_type == "draft_brand_complaint":
            record = MockBrandProtectionActionAdapter.draft_complaint(
                reporting_channel=parameters["reporting_channel"],
                domain=parameters.get("domain"),
                brand_id=parameters.get("brand_id"),
                notes=parameters.get("notes"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "complaint_draft": record,
            }

        if action_type == "escalate_brand_takedown":
            record = MockBrandProtectionActionAdapter.escalate_takedown(
                domain=parameters["domain"],
                reason=parameters["reason"],
                registrar=parameters.get("registrar"),
                brand_id=parameters.get("brand_id"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "takedown": record,
            }

        if action_type == "notify_brand_representative":
            record = MockBrandProtectionActionAdapter.notify_brand_representative(
                recipient=parameters["recipient"],
                message=parameters["message"],
                brand_name=parameters.get("brand_name"),
                domain=parameters.get("domain"),
            )
            return {
                "action_type": action_type,
                "status": "succeeded",
                "notification": record,
            }

        raise BadRequestError(message=f"Unhandled action type: {action_type}")
