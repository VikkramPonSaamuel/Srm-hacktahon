from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.core.logging import get_logger
from app.synthetic.mocks import MockServiceRegistry

logger = get_logger("app.playbooks.adapters")


class MockCircuitBreakerAdapter:
    """Mock circuit breaker state manager for microservices."""

    _states: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def get_state(cls, service_name: str) -> str:
        record = cls._states.get(service_name)
        return record["state"] if record else "closed"

    @classmethod
    def set_state(cls, service_name: str, state: str, reason: str) -> Dict[str, Any]:
        if state not in ("open", "closed", "half_open"):
            raise ValueError(f"Invalid circuit breaker state '{state}'. Must be open, closed, or half_open.")
        record = {
            "service_name": service_name,
            "state": state,
            "reason": reason,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        cls._states[service_name] = record
        logger.info(f"Circuit breaker for {service_name} set to '{state}' (reason: {reason})")
        return record

    @classmethod
    def reset(cls) -> None:
        cls._states.clear()


class MockPaymentGatewayAdapter:
    """Mock gateway routing manager for customer payment attempts."""

    _active_routing: Dict[str, str] = {
        "checkout_flow": "primary-payment-gateway",
    }
    _switch_audit: List[Dict[str, Any]] = []

    @classmethod
    def get_active_gateway(cls, flow_name: str = "checkout_flow") -> str:
        return cls._active_routing.get(flow_name, "primary-payment-gateway")

    @classmethod
    def switch_gateway(
        cls,
        source_gateway: str,
        target_gateway: str,
        reason: str,
        allow_existing: bool = False,
    ) -> Dict[str, Any]:
        """Switches payment attempts to target gateway with payment safety guards."""
        valid_gateways = ("primary-payment-gateway", "secondary-payment-gateway")
        if target_gateway not in valid_gateways:
            raise ValueError(f"Target gateway '{target_gateway}' is not recognized in mock gateway fleet.")

        cls._active_routing["checkout_flow"] = target_gateway
        record = {
            "source_gateway": source_gateway,
            "target_gateway": target_gateway,
            "allow_existing": allow_existing,
            "reason": reason,
            "switched_at": datetime.now(timezone.utc).isoformat(),
        }
        cls._switch_audit.append(record)
        logger.warning(
            f"Payment gateway switched from {source_gateway} to {target_gateway} (allow_existing={allow_existing}, reason: {reason})"
        )
        return record

    @classmethod
    def reset(cls) -> None:
        cls._active_routing = {"checkout_flow": "primary-payment-gateway"}
        cls._switch_audit.clear()


class MockPaymentReconcilerAdapter:
    """Payment safety reconciler: verifies transaction state using idempotency keys."""

    @classmethod
    def reconcile_transaction(
        cls,
        idempotency_key: str,
        gateway: str = "primary-payment-gateway",
        order_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """PAYMENT SAFETY RULE:

        A payment timeout does not prove that a payment failed.
        Reconcile the payment using the mock provider's transaction status before retrying.
        Do not issue a second charge when the first transaction's status is unknown or captured.
        """
        cached = MockServiceRegistry._payment_idempotency_cache.get(idempotency_key)

        if not cached:
            # Not found on provider gateway: safe to initiate with original idempotency key
            return {
                "reconciliation_status": "NOT_FOUND",
                "is_captured": False,
                "can_safely_retry": True,
                "reason": f"No transaction found on {gateway} for idempotency key '{idempotency_key}'. Safe to retry.",
                "reconciled_at": datetime.now(timezone.utc).isoformat(),
            }

        # Check cached response
        if cached.get("success") is True or cached.get("status") == "success":
            resp_data = cached.get("response_data", {})
            return {
                "reconciliation_status": "CAPTURED",
                "is_captured": True,
                "can_safely_retry": False,  # MUST NOT DOUBLE CHARGE!
                "transaction_id": resp_data.get("transaction_id"),
                "amount": resp_data.get("amount"),
                "reason": "Transaction was already successfully captured on provider. Double charge prevented.",
                "reconciled_at": datetime.now(timezone.utc).isoformat(),
            }

        if cached.get("status") == "timed_out":
            # Indeterminate state on provider!
            return {
                "reconciliation_status": "INDETERMINATE_TIMEOUT",
                "is_captured": False,
                "can_safely_retry": False,  # Blind retry forbidden!
                "reason": "Payment state is indeterminate on provider gateway. Blind retry prohibited until manual verification or settlement confirmation.",
                "reconciled_at": datetime.now(timezone.utc).isoformat(),
            }

        return {
            "reconciliation_status": "FAILED",
            "is_captured": False,
            "can_safely_retry": True,
            "reason": "Previous payment attempt explicitly failed on provider gateway. Safe to re-attempt with new/reconciled payment attempt.",
            "reconciled_at": datetime.now(timezone.utc).isoformat(),
        }


class MockNotificationAdapter:
    """Mock notification dispatcher for development and audit trails."""

    _dispatches: List[Dict[str, Any]] = []

    @classmethod
    def send_notification(cls, channel: str, message: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        record = {
            "channel": channel,
            "message": message,
            "metadata": metadata or {},
            "sent_at": datetime.now(timezone.utc).isoformat(),
            "status": "delivered",
        }
        cls._dispatches.append(record)
        logger.info(f"Mock notification dispatched to channel '{channel}': {message}")
        return record

    @classmethod
    def get_dispatches(cls) -> List[Dict[str, Any]]:
        return list(cls._dispatches)

    @classmethod
    def reset(cls) -> None:
        cls._dispatches.clear()


class MockWafActionAdapter:
    """Mock WAF rule action adapter for defensive traffic controls."""

    _active_rules: Dict[str, Dict[str, Any]] = {}
    _rollback_history: List[Dict[str, Any]] = []
    _is_enabled: bool = True

    @classmethod
    def set_enabled(cls, enabled: bool) -> None:
        cls._is_enabled = enabled

    @classmethod
    def is_enabled(cls) -> bool:
        return cls._is_enabled

    @classmethod
    def apply_rule(
        cls,
        waf_action: str,
        target: str,
        reason: str,
        rule_id: Optional[str] = None,
        duration_seconds: int = 3600,
        allow_rollback: bool = True,
    ) -> Dict[str, Any]:
        if not cls._is_enabled:
            raise RuntimeError("WAF adapter integration is disabled by security configuration.")

        # Safety requirement: Prohibit arbitrary broad CIDR range blocking
        target_clean = target.strip()
        if target_clean in ("0.0.0.0/0", "::/0", "*") or any(target_clean.endswith(f"/{prefix}") for prefix in range(0, 17)):
            raise ValueError(
                f"Prohibited target '{target}': Broad CIDR range blocking is not permitted by automated defensive safety policy."
            )

        assigned_id = rule_id or f"waf_rule_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        record = {
            "rule_id": assigned_id,
            "waf_action": waf_action,
            "target": target_clean,
            "reason": reason,
            "duration_seconds": duration_seconds,
            "allow_rollback": allow_rollback,
            "applied_at": datetime.now(timezone.utc).isoformat(),
            "status": "active",
        }
        cls._active_rules[assigned_id] = record
        logger.info(f"WAF rule '{assigned_id}' ({waf_action}) applied on target '{target_clean}'")
        return record

    @classmethod
    def rollback_rule(cls, rule_id: str) -> Dict[str, Any]:
        if rule_id in cls._active_rules:
            removed = cls._active_rules.pop(rule_id)
            removed["status"] = "rolled_back"
            removed["rolled_back_at"] = datetime.now(timezone.utc).isoformat()
            cls._rollback_history.append(removed)
            logger.info(f"WAF rule '{rule_id}' rolled back successfully.")
            return removed
        return {"rule_id": rule_id, "status": "not_found", "rolled_back": False}

    @classmethod
    def get_active_rules(cls) -> List[Dict[str, Any]]:
        return list(cls._active_rules.values())

    @classmethod
    def reset(cls) -> None:
        cls._active_rules.clear()
        cls._rollback_history.clear()
        cls._is_enabled = True


class MockRateLimitPolicyAdapter:
    """Mock rate-limit policy adapter for dynamically throttling abnormal endpoints/IPs."""

    _active_policies: Dict[str, Dict[str, Any]] = {}
    _rollback_history: List[Dict[str, Any]] = []
    _is_enabled: bool = True

    @classmethod
    def set_enabled(cls, enabled: bool) -> None:
        cls._is_enabled = enabled

    @classmethod
    def is_enabled(cls) -> bool:
        return cls._is_enabled

    @classmethod
    def apply_policy(
        cls,
        endpoint: str,
        rate_limit_rpm: int,
        duration_seconds: int = 300,
        client_ip: Optional[str] = None,
        reason: str = "Automated threat response",
    ) -> Dict[str, Any]:
        if not cls._is_enabled:
            raise RuntimeError("Rate-limit adapter integration is disabled by security configuration.")

        policy_key = f"{endpoint}:{client_ip or '*'}"
        record = {
            "policy_key": policy_key,
            "endpoint": endpoint,
            "client_ip": client_ip,
            "rate_limit_rpm": rate_limit_rpm,
            "duration_seconds": duration_seconds,
            "reason": reason,
            "applied_at": datetime.now(timezone.utc).isoformat(),
            "status": "active",
        }
        cls._active_policies[policy_key] = record
        logger.info(f"Rate-limit policy applied on '{policy_key}': {rate_limit_rpm} RPM")
        return record

    @classmethod
    def rollback_policy(cls, endpoint: str, client_ip: Optional[str] = None) -> Dict[str, Any]:
        policy_key = f"{endpoint}:{client_ip or '*'}"
        if policy_key in cls._active_policies:
            removed = cls._active_policies.pop(policy_key)
            removed["status"] = "rolled_back"
            removed["rolled_back_at"] = datetime.now(timezone.utc).isoformat()
            cls._rollback_history.append(removed)
            logger.info(f"Rate-limit policy '{policy_key}' rolled back.")
            return removed
        return {"policy_key": policy_key, "status": "not_found", "rolled_back": False}

    @classmethod
    def get_active_policies(cls) -> List[Dict[str, Any]]:
        return list(cls._active_policies.values())

    @classmethod
    def reset(cls) -> None:
        cls._active_policies.clear()
        cls._rollback_history.clear()
        cls._is_enabled = True


class MockEndpointMonitoringAdapter:
    """Mock diagnostic monitoring adapter to increase telemetry sampling for probed endpoints."""

    _active_monitoring: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def increase_monitoring(
        cls,
        endpoint: str,
        sampling_rate: int,
        duration_seconds: int = 600,
        service_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        record = {
            "endpoint": endpoint,
            "service_name": service_name,
            "sampling_rate": sampling_rate,
            "duration_seconds": duration_seconds,
            "configured_at": datetime.now(timezone.utc).isoformat(),
            "status": "active",
        }
        cls._active_monitoring[endpoint] = record
        logger.info(f"Diagnostic monitoring for '{endpoint}' set to sampling rate {sampling_rate}%")
        return record

    @classmethod
    def reset(cls) -> None:
        cls._active_monitoring.clear()


class MockSecurityNotificationAdapter:
    """Mock security alerts dispatcher for security administrators and SOC teams."""

    _alerts: List[Dict[str, Any]] = []

    @classmethod
    def send_alert(
        cls,
        alert_level: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        record = {
            "alert_level": alert_level,
            "message": message,
            "metadata": metadata or {},
            "dispatched_at": datetime.now(timezone.utc).isoformat(),
            "status": "delivered",
        }
        cls._alerts.append(record)
        logger.info(f"Security Alert [{alert_level.upper()}]: {message}")
        return record

    @classmethod
    def notify_admin(
        cls,
        admin_channel: str,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        record = {
            "admin_channel": admin_channel,
            "message": message,
            "metadata": metadata or {},
            "dispatched_at": datetime.now(timezone.utc).isoformat(),
            "status": "delivered",
        }
        cls._alerts.append(record)
        logger.info(f"Security Admin notification to '{admin_channel}': {message}")
        return record

    @classmethod
    def get_alerts(cls) -> List[Dict[str, Any]]:
        return list(cls._alerts)

    @classmethod
    def reset(cls) -> None:
        cls._alerts.clear()


class MockUpstreamMitigationAdapter:
    """Mock upstream CDN and cloud provider mitigation adapter."""

    _workflows: List[Dict[str, Any]] = []
    _is_enabled: bool = True

    @classmethod
    def set_enabled(cls, enabled: bool) -> None:
        cls._is_enabled = enabled

    @classmethod
    def is_enabled(cls) -> bool:
        return cls._is_enabled

    @classmethod
    def initiate_workflow(
        cls,
        provider: str,
        workflow_name: str,
        reason: str,
        service_name: Optional[str] = None,
        mitigation_parameters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not cls._is_enabled:
            raise RuntimeError("Upstream mitigation adapter is disabled.")

        record = {
            "workflow_id": f"upm_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "provider": provider,
            "workflow_name": workflow_name,
            "service_name": service_name,
            "reason": reason,
            "parameters": mitigation_parameters or {},
            "initiated_at": datetime.now(timezone.utc).isoformat(),
            "status": "initiated",
        }
        cls._workflows.append(record)
        logger.info(f"Upstream mitigation '{workflow_name}' initiated on provider '{provider}'")
        return record

    @classmethod
    def get_workflows(cls) -> List[Dict[str, Any]]:
        return list(cls._workflows)

    @classmethod
    def reset(cls) -> None:
        cls._workflows.clear()
        cls._is_enabled = True


class MockBrandProtectionActionAdapter:
    """Mock defensive adapter for brand threat response, takedown escalation, and complaints."""

    _drafts: List[Dict[str, Any]] = []
    _takedowns: List[Dict[str, Any]] = []
    _notifications: List[Dict[str, Any]] = []
    _is_enabled: bool = True

    @classmethod
    def set_enabled(cls, enabled: bool) -> None:
        cls._is_enabled = enabled

    @classmethod
    def is_enabled(cls) -> bool:
        return cls._is_enabled

    @classmethod
    def draft_complaint(
        cls,
        reporting_channel: str,
        domain: Optional[str] = None,
        brand_id: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not cls._is_enabled:
            raise RuntimeError("Brand protection adapter is disabled.")
        record = {
            "draft_id": f"cpl_draft_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "reporting_channel": reporting_channel,
            "domain": domain,
            "brand_id": brand_id,
            "notes": notes,
            "status": "drafted",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        cls._drafts.append(record)
        logger.info(f"Cyber complaint draft created for domain '{domain}' via '{reporting_channel}'")
        return record

    @classmethod
    def escalate_takedown(
        cls,
        domain: str,
        reason: str,
        registrar: Optional[str] = None,
        brand_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not cls._is_enabled:
            raise RuntimeError("Brand protection adapter is disabled.")
        record = {
            "takedown_id": f"tkd_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "domain": domain,
            "reason": reason,
            "registrar": registrar,
            "brand_id": brand_id,
            "status": "escalated_to_registrar",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        cls._takedowns.append(record)
        logger.info(f"Brand takedown notice escalated for domain '{domain}' (Reason: {reason})")
        return record

    @classmethod
    def notify_brand_representative(
        cls,
        recipient: str,
        message: str,
        brand_name: Optional[str] = None,
        domain: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not cls._is_enabled:
            raise RuntimeError("Brand protection adapter is disabled.")
        record = {
            "notification_id": f"bnot_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            "recipient": recipient,
            "message": message,
            "brand_name": brand_name,
            "domain": domain,
            "status": "delivered",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        cls._notifications.append(record)
        logger.info(f"Brand representative notification dispatched to '{recipient}'")
        return record

    @classmethod
    def get_drafts(cls) -> List[Dict[str, Any]]:
        return list(cls._drafts)

    @classmethod
    def get_takedowns(cls) -> List[Dict[str, Any]]:
        return list(cls._takedowns)

    @classmethod
    def get_notifications(cls) -> List[Dict[str, Any]]:
        return list(cls._notifications)

    @classmethod
    def reset(cls) -> None:
        cls._drafts.clear()
        cls._takedowns.clear()
        cls._notifications.clear()
        cls._is_enabled = True


