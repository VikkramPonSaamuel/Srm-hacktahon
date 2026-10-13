from enum import Enum
from typing import Dict, Optional
from pydantic import BaseModel, Field


class SimulationScenario(str, Enum):
    NONE = "none"
    AUTH_5XX = "auth_5xx"
    AUTH_TIMEOUT = "auth_timeout"
    SEARCH_SLOW = "search_slow"
    CHECKOUT_5XX = "checkout_5xx"
    PRIMARY_PAYMENT_TIMEOUT = "primary_payment_timeout"
    SECONDARY_GATEWAY_DOWN = "secondary_gateway_down"
    CONFIRMATION_DELAYED = "confirmation_delayed"
    DEPENDENCY_UNHEALTHY = "dependency_unhealthy"
    UNEXPECTED_RESPONSE = "unexpected_response"


class ServiceThreshold(BaseModel):
    warning_latency_ms: float = Field(default=1000.0, ge=50.0, description="Warning latency threshold in ms")
    critical_latency_ms: float = Field(default=3000.0, ge=100.0, description="Critical latency threshold in ms")
    timeout_ms: float = Field(default=5000.0, ge=100.0, description="Max timeout threshold in ms")
    max_consecutive_failures: int = Field(default=3, ge=1, description="Consecutive failure limit before critical alert")


class MonitoringThresholds(BaseModel):
    default_timeout_ms: float = Field(default=5000.0, ge=100.0)
    consecutive_failure_threshold: int = Field(default=3, ge=1)
    error_rate_threshold: float = Field(default=0.05, ge=0.0, le=1.0)
    services: Dict[str, ServiceThreshold] = Field(
        default_factory=lambda: {
            "auth-service": ServiceThreshold(warning_latency_ms=500.0, critical_latency_ms=1500.0, timeout_ms=3000.0),
            "search-service": ServiceThreshold(warning_latency_ms=800.0, critical_latency_ms=2000.0, timeout_ms=4000.0),
            "cart-service": ServiceThreshold(warning_latency_ms=400.0, critical_latency_ms=1200.0, timeout_ms=3000.0),
            "checkout-service": ServiceThreshold(warning_latency_ms=600.0, critical_latency_ms=1800.0, timeout_ms=4000.0),
            "primary-payment-gateway": ServiceThreshold(warning_latency_ms=1200.0, critical_latency_ms=3500.0, timeout_ms=6000.0),
            "secondary-payment-gateway": ServiceThreshold(warning_latency_ms=1500.0, critical_latency_ms=4000.0, timeout_ms=7000.0),
            "order-service": ServiceThreshold(warning_latency_ms=500.0, critical_latency_ms=1500.0, timeout_ms=3000.0),
            "order-confirmation-service": ServiceThreshold(warning_latency_ms=1000.0, critical_latency_ms=2500.0, timeout_ms=5000.0),
        }
    )


# In-memory singleton threshold registry (can be configured via API)
_ACTIVE_THRESHOLDS = MonitoringThresholds()


def get_monitoring_thresholds() -> MonitoringThresholds:
    return _ACTIVE_THRESHOLDS


def update_monitoring_thresholds(new_thresholds: MonitoringThresholds) -> MonitoringThresholds:
    global _ACTIVE_THRESHOLDS
    _ACTIVE_THRESHOLDS = new_thresholds
    return _ACTIVE_THRESHOLDS
