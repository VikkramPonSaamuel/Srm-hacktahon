import time
from typing import Any, Dict, Optional

from app.core.config import settings
from app.core.exceptions import BadRequestError
from app.synthetic.thresholds import SimulationScenario, get_monitoring_thresholds


class MockServiceRegistry:
    """Configurable synthetic mock business services with controlled failure injection."""

    # In-memory store for idempotency keys to ensure payment safety
    _payment_idempotency_cache: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def _validate_simulation_safety(cls, scenario: SimulationScenario) -> None:
        """Safety requirement: Prevent failure injection in non-dev/non-test environments."""
        if scenario != SimulationScenario.NONE and settings.ENVIRONMENT not in ("development", "testing"):
            raise BadRequestError(
                message=f"Simulated failure injection '{scenario.value}' is strictly forbidden in {settings.ENVIRONMENT} environment."
            )

    @classmethod
    def execute_mock_call(
        cls,
        service_name: str,
        step_name: str,
        scenario: SimulationScenario = SimulationScenario.NONE,
        payload: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Dispatch call to specific mock business component."""
        cls._validate_simulation_safety(scenario)
        payload = payload or {}

        dispatcher = {
            "auth-service": cls._mock_auth,
            "search-service": cls._mock_search,
            "cart-service": cls._mock_cart,
            "checkout-service": cls._mock_checkout,
            "primary-payment-gateway": cls._mock_primary_payment,
            "secondary-payment-gateway": cls._mock_secondary_payment,
            "order-service": cls._mock_order,
            "order-confirmation-service": cls._mock_confirmation,
        }

        handler = dispatcher.get(service_name)
        if not handler:
            return {
                "success": False,
                "status": "failed",
                "http_status": 404,
                "latency_ms": 10.0,
                "error_code": "UNKNOWN_SERVICE",
                "failure_category": "dependency_unhealthy",
                "error_details": {"message": f"Service '{service_name}' is not registered in mock fleet."},
                "response_data": None,
            }

        return handler(step_name=step_name, scenario=scenario, payload=payload, idempotency_key=idempotency_key)

    # 1. Authentication & Login
    @classmethod
    def _mock_auth(cls, step_name: str, scenario: SimulationScenario, payload: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        if scenario == SimulationScenario.AUTH_5XX:
            return {
                "success": False,
                "status": "failed",
                "http_status": 500,
                "latency_ms": 120.0,
                "error_code": "INTERNAL_AUTH_CRASH",
                "failure_category": "auth_5xx",
                "error_details": {"error": "Authentication microservice raised unhandled NullPointerException in identity provider connector"},
                "response_data": None,
            }
        if scenario == SimulationScenario.AUTH_TIMEOUT:
            return {
                "success": False,
                "status": "timed_out",
                "http_status": 504,
                "latency_ms": 3200.0,
                "error_code": "AUTH_UPSTREAM_TIMEOUT",
                "failure_category": "auth_timeout",
                "error_details": {"error": "OAuth2 / LDAP token verification handshake timed out after 3000ms"},
                "response_data": None,
            }

        return {
            "success": True,
            "status": "success",
            "http_status": 200,
            "latency_ms": 85.0,
            "error_code": None,
            "failure_category": None,
            "error_details": None,
            "response_data": {"user_id": payload.get("user_id", "usr_synth_8841"), "session_valid": True},
        }

    # 2. Product Search
    @classmethod
    def _mock_search(cls, step_name: str, scenario: SimulationScenario, payload: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        if scenario == SimulationScenario.SEARCH_SLOW:
            # Latency spike simulating unindexed search query or elasticsearch cluster degradation
            return {
                "success": True,  # completes, but breaches latency threshold
                "status": "degraded_latency",
                "http_status": 200,
                "latency_ms": 2850.0,  # exceeds warning threshold (800ms) and critical (2000ms)
                "error_code": "SEARCH_INDEX_DEGRADED",
                "failure_category": "search_slow",
                "error_details": {"warning": "Elasticsearch cluster high query latency: 2850ms", "threshold_ms": 800.0},
                "response_data": {"results_count": 42, "query": payload.get("query", "enterprise laptop")},
            }

        return {
            "success": True,
            "status": "success",
            "http_status": 200,
            "latency_ms": 110.0,
            "error_code": None,
            "failure_category": None,
            "error_details": None,
            "response_data": {"results_count": 18, "query": payload.get("query", "wireless headset")},
        }

    # 3. Shopping Cart
    @classmethod
    def _mock_cart(cls, step_name: str, scenario: SimulationScenario, payload: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        if scenario == SimulationScenario.DEPENDENCY_UNHEALTHY:
            return {
                "success": False,
                "status": "failed",
                "http_status": 503,
                "latency_ms": 420.0,
                "error_code": "REDIS_SESSION_UNAVAILABLE",
                "failure_category": "dependency_unhealthy",
                "error_details": {"error": "Cart cache Redis cluster node unreachable: Connection refused"},
                "response_data": None,
            }

        return {
            "success": True,
            "status": "success",
            "http_status": 200,
            "latency_ms": 65.0,
            "error_code": None,
            "failure_category": None,
            "error_details": None,
            "response_data": {"cart_id": payload.get("cart_id", "cart_7719"), "item_count": 3, "total_amount": 299.99},
        }

    # 4. Checkout
    @classmethod
    def _mock_checkout(cls, step_name: str, scenario: SimulationScenario, payload: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        if scenario == SimulationScenario.CHECKOUT_5XX:
            return {
                "success": False,
                "status": "failed",
                "http_status": 500,
                "latency_ms": 310.0,
                "error_code": "CHECKOUT_ORCHESTRATION_ERROR",
                "failure_category": "checkout_5xx",
                "error_details": {"error": "Checkout calculation engine encountered division by zero in tax jurisdiction resolver"},
                "response_data": None,
            }

        return {
            "success": True,
            "status": "success",
            "http_status": 200,
            "latency_ms": 140.0,
            "error_code": None,
            "failure_category": None,
            "error_details": None,
            "response_data": {"checkout_session_id": "cs_live_9942", "currency": "USD", "subtotal": 299.99, "tax": 24.00, "total": 323.99},
        }

    # 5. Primary Payment Gateway
    @classmethod
    def _mock_primary_payment(
        cls,
        step_name: str,
        scenario: SimulationScenario,
        payload: Dict[str, Any],
        idempotency_key: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        # Enforce payment safety with idempotency verification
        if idempotency_key and idempotency_key in cls._payment_idempotency_cache:
            cached = cls._payment_idempotency_cache[idempotency_key]
            return {
                **cached,
                "latency_ms": 35.0,
                "idempotency_replayed": True,
            }

        if scenario == SimulationScenario.PRIMARY_PAYMENT_TIMEOUT:
            # SAFETY RULE: Payment timeout does NOT mean payment failed.
            # State is indeterminate, blind retries must NOT be performed.
            result = {
                "success": False,
                "status": "timed_out",
                "http_status": 504,
                "latency_ms": 6150.0,
                "error_code": "PRIMARY_GATEWAY_TIMEOUT",
                "failure_category": "payment_timeout",
                "error_details": {
                    "error": "Primary Payment Gateway did not acknowledge transaction within timeout SLA",
                    "safety_directive": "INDETERMINATE_PAYMENT_STATE: Blind retry prohibited. Query payment status inquiry endpoint before re-initiating.",
                },
                "response_data": {"payment_reference": "ref_unknown_timeout", "idempotency_key": idempotency_key},
            }
            if idempotency_key:
                cls._payment_idempotency_cache[idempotency_key] = result
            return result

        result = {
            "success": True,
            "status": "success",
            "http_status": 200,
            "latency_ms": 420.0,
            "error_code": None,
            "failure_category": None,
            "error_details": None,
            "response_data": {
                "transaction_id": "txn_primary_88192",
                "status": "CAPTURED",
                "amount": payload.get("amount", 323.99),
                "gateway": "PrimaryStripeLikeGateway",
                "idempotency_key": idempotency_key,
            },
        }
        if idempotency_key:
            cls._payment_idempotency_cache[idempotency_key] = result
        return result

    # 6. Secondary Payment Gateway
    @classmethod
    def _mock_secondary_payment(
        cls,
        step_name: str,
        scenario: SimulationScenario,
        payload: Dict[str, Any],
        idempotency_key: Optional[str] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        if idempotency_key and idempotency_key in cls._payment_idempotency_cache:
            return {
                **cls._payment_idempotency_cache[idempotency_key],
                "latency_ms": 40.0,
                "idempotency_replayed": True,
            }

        if scenario == SimulationScenario.SECONDARY_GATEWAY_DOWN:
            result = {
                "success": False,
                "status": "failed",
                "http_status": 503,
                "latency_ms": 280.0,
                "error_code": "SECONDARY_GATEWAY_UNAVAILABLE",
                "failure_category": "payment_unavailable",
                "error_details": {"error": "Secondary payment processor returned 503 Service Unavailable: Maintenance mode"},
                "response_data": None,
            }
            return result

        result = {
            "success": True,
            "status": "success",
            "http_status": 200,
            "latency_ms": 510.0,
            "error_code": None,
            "failure_category": None,
            "error_details": None,
            "response_data": {
                "transaction_id": "txn_secondary_55102",
                "status": "CAPTURED",
                "amount": payload.get("amount", 323.99),
                "gateway": "SecondaryPayPalLikeGateway",
                "idempotency_key": idempotency_key,
            },
        }
        if idempotency_key:
            cls._payment_idempotency_cache[idempotency_key] = result
        return result

    # 7. Order Creation
    @classmethod
    def _mock_order(cls, step_name: str, scenario: SimulationScenario, payload: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        if scenario == SimulationScenario.UNEXPECTED_RESPONSE:
            # Malformed response missing order_id
            return {
                "success": False,
                "status": "failed",
                "http_status": 200,  # 200 OK but invalid payload structure!
                "latency_ms": 115.0,
                "error_code": "UNEXPECTED_SCHEMA_RESPONSE",
                "failure_category": "unexpected_response",
                "error_details": {"error": "Response payload missing required field 'order_id' or malformed JSON payload"},
                "response_data": {"status": "SUCCESS_BUT_NO_ORDER_DATA"},
            }

        return {
            "success": True,
            "status": "success",
            "http_status": 201,
            "latency_ms": 160.0,
            "error_code": None,
            "failure_category": None,
            "error_details": None,
            "response_data": {
                "order_id": "ord_synth_99218",
                "order_status": "CONFIRMED",
                "tracking_number": "TRK-9810283",
            },
        }

    # 8. Order Confirmation / Notification
    @classmethod
    def _mock_confirmation(cls, step_name: str, scenario: SimulationScenario, payload: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        if scenario == SimulationScenario.CONFIRMATION_DELAYED:
            return {
                "success": True,
                "status": "degraded_latency",
                "http_status": 202,
                "latency_ms": 3400.0,  # exceeds warning (1000ms) & critical (2500ms)
                "error_code": "CONFIRMATION_QUEUE_BACKLOG",
                "failure_category": "confirmation_delayed",
                "error_details": {"warning": "Notification queue backlog delayed confirmation SMS/Email dispatch: 3400ms"},
                "response_data": {"notification_status": "QUEUED_DELAYED", "order_id": payload.get("order_id")},
            }

        return {
            "success": True,
            "status": "success",
            "http_status": 200,
            "latency_ms": 130.0,
            "error_code": None,
            "failure_category": None,
            "error_details": None,
            "response_data": {"notification_status": "DELIVERED", "channel": "EMAIL_SMS"},
        }
