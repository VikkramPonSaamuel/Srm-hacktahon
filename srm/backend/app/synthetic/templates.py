from typing import Any, Dict, List
from pydantic import BaseModel, Field


class StepTemplate(BaseModel):
    step_name: str
    step_order: int
    service_name: str
    step_type: str = "api_call"
    timeout_ms: int = 5000
    is_required: bool = True


class JourneyTemplate(BaseModel):
    template_id: str
    name: str
    description: str
    journey_type: str
    steps: List[StepTemplate]


SYNTHETIC_TEMPLATES: Dict[str, JourneyTemplate] = {
    "retail_checkout": JourneyTemplate(
        template_id="retail_checkout",
        name="End-to-End E-Commerce Retail Checkout Journey",
        description="Full customer retail purchase flow spanning authentication, search, cart, checkout, payment, order creation, and confirmation dispatch.",
        journey_type="checkout",
        steps=[
            StepTemplate(step_name="Customer Login & Session Validation", step_order=1, service_name="auth-service", step_type="auth", timeout_ms=3000),
            StepTemplate(step_name="Product Catalog Search", step_order=2, service_name="search-service", step_type="api_call", timeout_ms=4000),
            StepTemplate(step_name="Shopping Cart Verification", step_order=3, service_name="cart-service", step_type="api_call", timeout_ms=3000),
            StepTemplate(step_name="Checkout Order Calculation", step_order=4, service_name="checkout-service", step_type="api_call", timeout_ms=4000),
            StepTemplate(step_name="Primary Payment Gateway Charge", step_order=5, service_name="primary-payment-gateway", step_type="api_call", timeout_ms=6000),
            StepTemplate(step_name="Order Entity Creation", step_order=6, service_name="order-service", step_type="api_call", timeout_ms=3000),
            StepTemplate(step_name="Order Confirmation & Receipt Dispatch", step_order=7, service_name="order-confirmation-service", step_type="queue_event", timeout_ms=5000, is_required=False),
        ],
    ),
    "payment_failover": JourneyTemplate(
        template_id="payment_failover",
        name="Resilient Multi-Gateway Payment Flow",
        description="Checkout flow configured with secondary gateway failover path.",
        journey_type="payment",
        steps=[
            StepTemplate(step_name="Customer Authentication", step_order=1, service_name="auth-service", step_type="auth", timeout_ms=3000),
            StepTemplate(step_name="Checkout Session Initialization", step_order=2, service_name="checkout-service", step_type="api_call", timeout_ms=4000),
            StepTemplate(step_name="Primary Payment Charge", step_order=3, service_name="primary-payment-gateway", step_type="api_call", timeout_ms=6000),
            StepTemplate(step_name="Order Provisioning", step_order=4, service_name="order-service", step_type="api_call", timeout_ms=3000),
        ],
    ),
    "auth_and_search": JourneyTemplate(
        template_id="auth_and_search",
        name="User Authentication and Search Journey",
        description="Lightweight journey verifying identity provider and catalog search latency.",
        journey_type="search",
        steps=[
            StepTemplate(step_name="User Login", step_order=1, service_name="auth-service", step_type="auth", timeout_ms=3000),
            StepTemplate(step_name="Catalog Search", step_order=2, service_name="search-service", step_type="api_call", timeout_ms=4000),
        ],
    ),
}


def list_templates() -> List[JourneyTemplate]:
    return list(SYNTHETIC_TEMPLATES.values())


def get_template(template_id: str) -> JourneyTemplate:
    return SYNTHETIC_TEMPLATES.get(template_id)
