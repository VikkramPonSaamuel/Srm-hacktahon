import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.threat_detection.sanitizer import sanitize_security_telemetry


@dataclass
class NormalizedSecurityEventInput:
    """Normalized security telemetry event ready for validation, analysis, and persistence."""
    event_id: str
    timestamp: datetime
    source_integration: str
    service_name: str
    http_method: str
    endpoint: str
    status_code: int
    event_category: str
    client_ip: str
    rule_id: Optional[str] = None
    user_agent: Optional[str] = None
    request_indicators: Dict[str, Any] = field(default_factory=dict)
    auth_outcome: str = "none"
    action_taken: str = "allowed"
    correlation_id: Optional[str] = None
    environment: str = "production"
    provenance: Dict[str, Any] = field(default_factory=dict)

    def __getitem__(self, item: str) -> Any:
        return getattr(self, item)

    def get(self, item: str, default: Any = None) -> Any:
        return getattr(self, item, default)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "timestamp": self.timestamp,
            "source_integration": self.source_integration,
            "service_name": self.service_name,
            "http_method": self.http_method,
            "endpoint": self.endpoint,
            "status_code": self.status_code,
            "event_category": self.event_category,
            "client_ip": self.client_ip,
            "rule_id": self.rule_id,
            "user_agent": self.user_agent,
            "request_indicators": self.request_indicators,
            "auth_outcome": self.auth_outcome,
            "action_taken": self.action_taken,
            "correlation_id": self.correlation_id,
            "environment": self.environment,
            "provenance": self.provenance,
        }


class BaseSecurityTelemetryAdapter(ABC):
    """Abstract adapter mapping raw platform-specific telemetry into normalized security events."""

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    def is_verified_live(self) -> bool:
        """Never claim live monitoring unless adapter connection has been verified."""
        return False

    @abstractmethod
    def normalize(self, raw_data: Dict[str, Any]) -> NormalizedSecurityEventInput:
        pass


class WebServerLogAdapter(BaseSecurityTelemetryAdapter):
    """Normalizes Nginx, Apache, or Caddy web server access logs."""

    @property
    def name(self) -> str:
        return "web_server"

    def normalize(self, raw: Dict[str, Any]) -> NormalizedSecurityEventInput:
        sanitized = sanitize_security_telemetry(raw)
        path = sanitized.get("uri") or sanitized.get("path") or sanitized.get("endpoint") or "/"
        method = (sanitized.get("method") or sanitized.get("http_method") or "GET").upper()
        status_code = int(sanitized.get("status") or sanitized.get("status_code") or 200)

        return NormalizedSecurityEventInput(
            event_id=sanitized.get("event_id") or f"sec_{uuid.uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc),
            source_integration=self.name,
            service_name=sanitized.get("service_name") or "web_gateway",
            http_method=method,
            endpoint=path.split("?")[0],
            status_code=status_code,
            event_category="api_request" if status_code < 400 else "error",
            client_ip=sanitized.get("client_ip") or sanitized.get("remote_addr") or "127.0.0.1",
            user_agent=sanitized.get("user_agent") or sanitized.get("http_user_agent"),
            request_indicators=sanitized.get("request_indicators") or {
                "query": sanitized.get("query_string") or sanitized.get("query_params") or {},
                "headers": sanitized.get("headers") or {},
                "body_preview": sanitized.get("body_preview"),
            },
            auth_outcome="failure" if status_code in (401, 403) else "none",
            action_taken=sanitized.get("action_taken") or "allowed",
            correlation_id=sanitized.get("correlation_id"),
            environment=sanitized.get("environment") or "production",
            provenance={"adapter": self.name, "simulated": not self.is_verified_live},
        )


class ApiGatewayEventAdapter(BaseSecurityTelemetryAdapter):
    """Normalizes Kong, AWS API Gateway, or Envoy telemetry events."""

    @property
    def name(self) -> str:
        return "api_gateway"

    def normalize(self, raw: Dict[str, Any]) -> NormalizedSecurityEventInput:
        sanitized = sanitize_security_telemetry(raw)
        path = sanitized.get("route") or sanitized.get("endpoint") or sanitized.get("path") or "/"
        method = (sanitized.get("http_method") or sanitized.get("method") or "GET").upper()
        status_code = int(sanitized.get("status_code") or sanitized.get("response_status") or 200)

        action = "allowed"
        if status_code == 429:
            action = "rate_limited"
        elif status_code == 403:
            action = "blocked"

        return NormalizedSecurityEventInput(
            event_id=sanitized.get("event_id") or f"sec_{uuid.uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc),
            source_integration=self.name,
            service_name=sanitized.get("service_name") or sanitized.get("api_name") or "api_gateway",
            http_method=method,
            endpoint=path.split("?")[0],
            status_code=status_code,
            event_category="rate_limit" if status_code == 429 else "api_request",
            rule_id=sanitized.get("rule_id"),
            client_ip=sanitized.get("client_ip") or "127.0.0.1",
            user_agent=sanitized.get("user_agent"),
            request_indicators=sanitized.get("request_indicators") or {
                "params": sanitized.get("params") or {},
                "latency_ms": sanitized.get("latency_ms"),
            },
            auth_outcome="failure" if status_code in (401, 403) else "none",
            action_taken=sanitized.get("action_taken") or action,
            correlation_id=sanitized.get("correlation_id"),
            environment=sanitized.get("environment") or "production",
            provenance={"adapter": self.name, "simulated": not self.is_verified_live},
        )


class WafEventAdapter(BaseSecurityTelemetryAdapter):
    """Normalizes Cloudflare, AWS WAF, or ModSecurity blocked/challenged events."""

    @property
    def name(self) -> str:
        return "waf"

    def normalize(self, raw: Dict[str, Any]) -> NormalizedSecurityEventInput:
        sanitized = sanitize_security_telemetry(raw)
        raw_action = str(sanitized.get("action") or sanitized.get("action_taken") or "blocked").lower()
        if "block" in raw_action:
            action = "blocked"
        elif "challenge" in raw_action:
            action = "challenged"
        else:
            action = raw_action

        rule_id = (
            sanitized.get("rule_id")
            or sanitized.get("matched_rule")
            or sanitized.get("matched_rule_id")
            or "WAF-DEFAULT"
        )
        client_ip = (
            sanitized.get("client_ip")
            or sanitized.get("source_ip")
            or "127.0.0.1"
        )

        return NormalizedSecurityEventInput(
            event_id=sanitized.get("event_id") or f"sec_{uuid.uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc),
            source_integration=self.name,
            service_name=sanitized.get("service_name") or "waf_proxy",
            http_method=(sanitized.get("http_method") or "POST").upper(),
            endpoint=sanitized.get("endpoint") or sanitized.get("uri") or "/",
            status_code=int(sanitized.get("status_code") or 403),
            event_category="waf_block",
            rule_id=rule_id,
            client_ip=client_ip,
            user_agent=sanitized.get("user_agent"),
            request_indicators=sanitized.get("request_indicators") or {
                "matched_pattern": sanitized.get("matched_pattern"),
                "rule_name": sanitized.get("rule_name"),
            },
            auth_outcome="none",
            action_taken=action,
            correlation_id=sanitized.get("correlation_id"),
            environment=sanitized.get("environment") or "production",
            provenance={"adapter": self.name, "simulated": not self.is_verified_live},
        )


class AuthLogAdapter(BaseSecurityTelemetryAdapter):
    """Normalizes OAuth, OIDC, or identity provider authentication audit events."""

    @property
    def name(self) -> str:
        return "auth_service"

    def normalize(self, raw: Dict[str, Any]) -> NormalizedSecurityEventInput:
        sanitized = sanitize_security_telemetry(raw)
        outcome = sanitized.get("auth_outcome") or ("failure" if int(sanitized.get("status_code", 401)) >= 400 else "success")

        return NormalizedSecurityEventInput(
            event_id=sanitized.get("event_id") or f"sec_{uuid.uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc),
            source_integration=self.name,
            service_name=sanitized.get("service_name") or "auth_service",
            http_method=(sanitized.get("http_method") or "POST").upper(),
            endpoint=sanitized.get("endpoint") or "/api/v1/auth/login",
            status_code=int(sanitized.get("status_code") or (401 if outcome == "failure" else 200)),
            event_category="auth",
            client_ip=sanitized.get("client_ip") or "127.0.0.1",
            user_agent=sanitized.get("user_agent"),
            request_indicators={
                "username_attempt": sanitized.get("username_attempt") or sanitized.get("username"),
                "reason": sanitized.get("reason"),
            },
            auth_outcome=outcome,
            action_taken="allowed" if outcome == "success" else "blocked",
            correlation_id=sanitized.get("correlation_id"),
            environment=sanitized.get("environment") or "production",
            provenance={"adapter": self.name, "simulated": not self.is_verified_live},
        )


class SyntheticDevAdapter(BaseSecurityTelemetryAdapter):
    """Development and test fixture adapter for deterministic unit and integration tests."""

    @property
    def name(self) -> str:
        return "synthetic_dev"

    def normalize(self, raw: Dict[str, Any]) -> NormalizedSecurityEventInput:
        sanitized = sanitize_security_telemetry(raw)
        return NormalizedSecurityEventInput(
            event_id=sanitized.get("event_id") or f"sec_{uuid.uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc),
            source_integration=self.name,
            service_name=sanitized.get("service_name") or "core_api",
            http_method=(sanitized.get("http_method") or "GET").upper(),
            endpoint=sanitized.get("endpoint") or "/api/v1/resource",
            status_code=int(sanitized.get("status_code") or 200),
            event_category=sanitized.get("event_category") or "api_request",
            rule_id=sanitized.get("rule_id"),
            client_ip=sanitized.get("client_ip") or "198.51.100.1",
            user_agent=sanitized.get("user_agent"),
            request_indicators=sanitized.get("request_indicators") or {},
            auth_outcome=sanitized.get("auth_outcome") or "none",
            action_taken=sanitized.get("action_taken") or "allowed",
            correlation_id=sanitized.get("correlation_id"),
            environment="development",
            provenance={"adapter": self.name, "simulated": True},
        )


class TelemetryAdapterRegistry:
    """Registry maintaining active security telemetry adapters."""

    _adapters: Dict[str, BaseSecurityTelemetryAdapter] = {}

    @classmethod
    def register(cls, adapter: BaseSecurityTelemetryAdapter) -> None:
        cls._adapters[adapter.name] = adapter

    @classmethod
    def get_adapter(cls, name: str) -> BaseSecurityTelemetryAdapter:
        cls._ensure_defaults()
        return cls._adapters.get(name, cls._adapters["synthetic_dev"])

    @classmethod
    def list_adapters(cls) -> List[Dict[str, Any]]:
        cls._ensure_defaults()
        return [
            {
                "name": a.name,
                "key": a.name,
                "is_verified_live": a.is_verified_live,
                "is_simulated": not a.is_verified_live,
            }
            for a in cls._adapters.values()
        ]

    @classmethod
    def _ensure_defaults(cls) -> None:
        if not cls._adapters:
            cls.register(WebServerLogAdapter())
            cls.register(ApiGatewayEventAdapter())
            cls.register(WafEventAdapter())
            cls.register(AuthLogAdapter())
            cls.register(SyntheticDevAdapter())
