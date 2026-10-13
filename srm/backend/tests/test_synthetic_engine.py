from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BadRequestError
from app.models.incident import Incident
from app.synthetic.engine import SyntheticJourneyEngine
from app.synthetic.mocks import MockServiceRegistry
from app.synthetic.scenarios import SimulationScenario


def test_synthetic_journey_success(db_session: Session):
    """Verify that a standard journey execution runs all 7 steps to success."""
    engine = SyntheticJourneyEngine(db_session)
    result = engine.execute_journey(template_id="retail_checkout")

    assert result["status"] == "success"
    assert result["total_steps"] == 7
    assert result["executed_steps_count"] == 7
    assert result["duration_ms"] > 0
    assert result["incident"] is None

    # Verify all step results
    for step in result["step_results"]:
        assert step["status"] == "success"
        assert step["latency_ms"] > 0
        assert step["correlation_id"] == result["correlation_id"]


def test_synthetic_journey_auth_5xx_failure_and_incident(db_session: Session):
    """Verify auth 5xx causes immediate journey halt, failure recording, and incident creation."""
    engine = SyntheticJourneyEngine(db_session)
    result = engine.execute_journey(
        template_id="retail_checkout",
        scenario=SimulationScenario.AUTH_5XX,
    )

    assert result["status"] == "failed"
    # Halts on Step 1 (Auth is required)
    assert result["executed_steps_count"] == 1
    assert result["step_results"][0]["status"] == "failed"
    assert result["step_results"][0]["failure_category"] == "auth_5xx"
    assert result["incident"] is not None
    assert result["incident"]["severity"] == "high"

    # Verify incident in DB
    inc = db_session.query(Incident).filter(Incident.incident_id == result["incident"]["incident_id"]).first()
    assert inc is not None
    assert inc.failure_category == "auth_5xx"
    assert len(inc.events) >= 1
    assert inc.events[0].event_type == "detected"


def test_synthetic_journey_primary_payment_timeout_safety(db_session: Session):
    """Verify financial safety rule: Payment timeout is NEVER retried blindly."""
    engine = SyntheticJourneyEngine(db_session)
    result = engine.execute_journey(
        template_id="retail_checkout",
        scenario=SimulationScenario.PRIMARY_PAYMENT_TIMEOUT,
        max_retries_per_step=3,  # Engine allows 3 retries, but payment timeout MUST NOT be retried
    )

    assert result["status"] == "failed"
    # Reaches payment step (Step 5)
    payment_step = next(s for s in result["step_results"] if s["service_name"] == "primary-payment-gateway")
    assert payment_step["status"] == "timed_out"
    assert payment_step["failure_category"] == "payment_timeout"
    # Crucial: attempt MUST be exactly 1 despite max_retries_per_step=3!
    assert payment_step["attempts"] == 1
    assert result["incident"]["severity"] == "critical"


def test_synthetic_journey_search_slow_delayed_response(db_session: Session):
    """Verify search latency degradation is flagged with search_slow."""
    engine = SyntheticJourneyEngine(db_session)
    result = engine.execute_journey(
        template_id="retail_checkout",
        scenario=SimulationScenario.SEARCH_SLOW,
    )

    search_step = next(s for s in result["step_results"] if s["service_name"] == "search-service")
    assert search_step["latency_ms"] >= 2000.0
    assert search_step["failure_category"] == "search_slow"


def test_synthetic_journey_checkout_5xx(db_session: Session):
    """Verify checkout server error halts on step 4."""
    engine = SyntheticJourneyEngine(db_session)
    result = engine.execute_journey(
        template_id="retail_checkout",
        scenario=SimulationScenario.CHECKOUT_5XX,
    )
    assert result["status"] == "failed"
    checkout_step = next(s for s in result["step_results"] if s["service_name"] == "checkout-service")
    assert checkout_step["status"] == "failed"
    assert checkout_step["failure_category"] == "checkout_5xx"


def test_synthetic_journey_secondary_gateway_down(db_session: Session):
    """Verify secondary gateway failure simulation."""
    res = MockServiceRegistry.execute_mock_call(
        service_name="secondary-payment-gateway",
        step_name="Secondary Payment",
        scenario=SimulationScenario.SECONDARY_GATEWAY_DOWN,
    )
    assert res["success"] is False
    assert res["http_status"] == 503
    assert res["failure_category"] == "payment_unavailable"


def test_synthetic_journey_order_unexpected_response(db_session: Session):
    """Verify unexpected/malformed response handling."""
    res = MockServiceRegistry.execute_mock_call(
        service_name="order-service",
        step_name="Order Creation",
        scenario=SimulationScenario.UNEXPECTED_RESPONSE,
    )
    assert res["success"] is False
    assert res["failure_category"] == "unexpected_response"


def test_synthetic_journey_cart_dependency_unhealthy(db_session: Session):
    """Verify unhealthy dependency (e.g. Redis crash) in cart service."""
    res = MockServiceRegistry.execute_mock_call(
        service_name="cart-service",
        step_name="Cart Verification",
        scenario=SimulationScenario.DEPENDENCY_UNHEALTHY,
    )
    assert res["success"] is False
    assert res["failure_category"] == "dependency_unhealthy"


def test_correlation_id_consistency(db_session: Session):
    """Verify unique correlation ID is propagated across all steps."""
    custom_corr = "trace-custom-correlation-98102"
    engine = SyntheticJourneyEngine(db_session)
    result = engine.execute_journey(
        template_id="auth_and_search",
        correlation_id=custom_corr,
    )
    assert result["correlation_id"] == custom_corr
    for s in result["step_results"]:
        assert s["correlation_id"] == custom_corr


def test_production_environment_safety_guard():
    """Verify that failure injection cannot be executed in production environment."""
    original_env = settings.ENVIRONMENT
    try:
        settings.ENVIRONMENT = "production"
        try:
            MockServiceRegistry._validate_simulation_safety(SimulationScenario.AUTH_5XX)
            assert False, "Should have raised BadRequestError in production!"
        except BadRequestError as e:
            assert "strictly forbidden" in str(e)
    finally:
        settings.ENVIRONMENT = original_env
