from datetime import datetime, timedelta, timezone
from typing import Any, Dict
import pytest
from fastapi.testclient import TestClient

from app.threat_detection.adapters import (
    ApiGatewayEventAdapter,
    AuthLogAdapter,
    SyntheticDevAdapter,
    TelemetryAdapterRegistry,
    WafEventAdapter,
    WebServerLogAdapter,
)
from app.threat_detection.engine import (
    AbnormalApiRateRule,
    AuthorizationSpikeRule,
    BruteForcePatternRule,
    CrossSiteScriptingRule,
    MultiEndpointCorrelationRule,
    PotentialDosSurgeRule,
    RepeatedAuthFailureRule,
    RepeatedWafBlocksRule,
    SqlInjectionRule,
    SuspiciousEndpointProbingRule,
    ThreatDetectionEngine,
)
from app.threat_detection.sanitizer import sanitize_security_telemetry
from app.models.website_threat import SecurityEvent, ThreatDetectionRuleConfig


# =====================================================================
# 1. Telemetry Sanitization Tests (Part 1 & Part 6)
# =====================================================================
def test_sanitization_redacts_credentials_passwords_tokens_and_cards() -> None:
    """Ensure raw credentials, tokens, cookies, and payment cards are completely redacted."""
    raw_payload = {
        "headers": {
            "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.supersecret",
            "Cookie": "session_id=sess_abc123xyz; token=sec_999",
            "User-Agent": "Mozilla/5.0",
        },
        "query_params": {
            "api_key": "live_sk_abcdef123456",
            "search": "leather jacket",
        },
        "body": {
            "username": "alice",
            "password": "SuperSecretPassword123!",
            "card_number": "4111222233334444",
            "cvv": "123",
            "nested": {
                "access_token": "secret_oauth_token",
                "safe_field": "order_confirmed",
            },
        },
    }

    sanitized = sanitize_security_telemetry(raw_payload)

    # Sensitive fields must be redacted
    assert sanitized["headers"]["Authorization"] == "[REDACTED]"
    assert sanitized["headers"]["Cookie"] == "[REDACTED]"
    assert sanitized["query_params"]["api_key"] == "[REDACTED]"
    assert sanitized["body"]["password"] == "[REDACTED]"
    assert sanitized["body"]["card_number"] == "[REDACTED]"
    assert sanitized["body"]["cvv"] == "[REDACTED]"
    assert sanitized["body"]["nested"]["access_token"] == "[REDACTED]"

    # Safe fields must be preserved
    assert sanitized["headers"]["User-Agent"] == "Mozilla/5.0"
    assert sanitized["query_params"]["search"] == "leather jacket"
    assert sanitized["body"]["username"] == "alice"
    assert sanitized["body"]["nested"]["safe_field"] == "order_confirmed"


# =====================================================================
# 2. Telemetry Adapter & Verification Tests (Part 1)
# =====================================================================
def test_adapters_normalize_telemetry_sources() -> None:
    """Validate normalization across web server, API gateway, WAF, auth, and synthetic dev adapters."""
    web_adapter = WebServerLogAdapter()
    web_res = web_adapter.normalize({
        "client_ip": "198.51.100.1",
        "method": "GET",
        "path": "/products",
        "status": 200,
        "service": "storefront",
    })
    assert web_res["endpoint"] == "/products"
    assert web_res["status_code"] == 200
    assert web_res["source_integration"] == "web_server"

    api_adapter = ApiGatewayEventAdapter()
    api_res = api_adapter.normalize({
        "ip": "203.0.113.5",
        "http_method": "POST",
        "route": "/api/v1/orders",
        "status_code": 201,
        "api_name": "checkout_service",
    })
    assert api_res["endpoint"] == "/api/v1/orders"
    assert api_res["service_name"] == "checkout_service"

    waf_adapter = WafEventAdapter()
    waf_res = waf_adapter.normalize({
        "source_ip": "192.0.2.45",
        "method": "POST",
        "uri": "/login",
        "action": "BLOCK",
        "matched_rule_id": "WAF-942100",
    })
    assert waf_res["action_taken"] == "blocked"
    assert waf_res["rule_id"] == "WAF-942100"

    auth_adapter = AuthLogAdapter()
    auth_res = auth_adapter.normalize({
        "ip_address": "192.0.2.88",
        "endpoint": "/auth/token",
        "status": "failure",
    })
    assert auth_res["auth_outcome"] == "failure"

    synthetic_adapter = SyntheticDevAdapter()
    synth_res = synthetic_adapter.normalize({
        "client_ip": "127.0.0.1",
        "endpoint": "/test/journey",
    })
    assert synth_res["source_integration"] == "synthetic_dev"
    assert synth_res["environment"] == "development"


def test_adapter_registry_identifies_simulated_vs_integrated_sources() -> None:
    """Verify registry distinguishes simulated/mock telemetry from verified integrations."""
    all_adapters = TelemetryAdapterRegistry.list_adapters()
    assert len(all_adapters) == 5

    # Check synthetic development is flagged as simulated
    synth = next(a for a in all_adapters if a["key"] == "synthetic_dev")
    assert synth["is_simulated"] is True

    # Check default web/waf/gateway mock adapters are flagged as simulated initially
    web = next(a for a in all_adapters if a["key"] == "web_server")
    assert web["is_simulated"] is True


# =====================================================================
# 3. Baseline Threat Detection Rules (All 10 Rules, Part 2 & Part 3)
# =====================================================================
def _create_event(
    client_ip: str = "192.0.2.100",
    endpoint: str = "/api/v1/items",
    http_method: str = "GET",
    status_code: int = 200,
    request_indicators: Dict[str, Any] = None,
    auth_outcome: str = "none",
    action_taken: str = "allowed",
    seconds_ago: int = 0,
) -> SecurityEvent:
    now = datetime.now(timezone.utc)
    ts = now - timedelta(seconds=seconds_ago)
    return SecurityEvent(
        event_id=f"evt-{seconds_ago}",
        timestamp=ts,
        source_integration="api_gateway",
        service_name="web-frontend",
        http_method=http_method,
        endpoint=endpoint,
        status_code=status_code,
        event_category="api_request",
        rule_id=None,
        client_ip=client_ip,
        user_agent="TestAgent/1.0",
        request_indicators=request_indicators or {},
        auth_outcome=auth_outcome,
        action_taken=action_taken,
        correlation_id=None,
        environment="production",
        provenance={},
    )


def test_sqli_detection_rule_triggers_and_ignores_benign() -> None:
    """Rule 1: SQL Injection indicators."""
    rule = SqlInjectionRule()

    # Malicious SQLi payload
    sqli_event = _create_event(
        request_indicators={"query": "id=1 UNION SELECT username, password FROM users--"}
    )
    assessment = rule.evaluate(sqli_event, [sqli_event])
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category == "sqli"
    assert assessment.risk_score >= 0.85
    assert assessment.recommended_response == "block_ip"

    # Benign request
    benign_event = _create_event(
        request_indicators={"query": "category=running-shoes&sort=price"}
    )
    assessment_benign = rule.evaluate(benign_event, [benign_event])
    assert assessment_benign is None or assessment_benign.is_triggered is False


def test_xss_detection_rule_triggers_and_ignores_benign() -> None:
    """Rule 2: Cross-site scripting indicators."""
    rule = CrossSiteScriptingRule()

    # Malicious XSS payload
    xss_event = _create_event(
        request_indicators={"comment": "<script>alert(document.cookie)</script>"}
    )
    assessment = rule.evaluate(xss_event, [xss_event])
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category == "xss"
    assert assessment.severity == "high"

    # Benign request
    benign_event = _create_event(
        request_indicators={"comment": "Hello world, great article!"}
    )
    assessment_benign = rule.evaluate(benign_event, [benign_event])
    assert assessment_benign is None or assessment_benign.is_triggered is False


def test_repeated_auth_failures_rule_triggers_on_threshold() -> None:
    """Rule 3: Repeated authentication failures."""
    rule = RepeatedAuthFailureRule()
    client_ip = "192.0.2.101"

    # 4 failures (below default threshold of 5)
    events = [_create_event(client_ip=client_ip, auth_outcome="failure", seconds_ago=i * 10) for i in range(4)]
    curr = events[0]
    assessment = rule.evaluate(curr, events)
    assert assessment is None or assessment.is_triggered is False

    # 5th failure reaches threshold
    events.append(_create_event(client_ip=client_ip, auth_outcome="failure", seconds_ago=50))
    assessment_triggered = rule.evaluate(curr, events)
    assert assessment_triggered is not None
    assert assessment_triggered.is_triggered is True
    assert assessment_triggered.threat_category in ("repeated_auth_failures", "auth_failure_surge")


def test_brute_force_pattern_rule_triggers_on_threshold() -> None:
    """Rule 4: Brute-force-like request patterns."""
    rule = BruteForcePatternRule()
    client_ip = "192.0.2.102"

    # 10 unauthorized requests within short burst
    events = [
        _create_event(client_ip=client_ip, endpoint="/api/v1/login", status_code=401, seconds_ago=i * 5)
        for i in range(10)
    ]
    curr = events[0]
    assessment = rule.evaluate(curr, events)
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category == "brute_force"
    assert assessment.recommended_response == "rate_limit_endpoint"


def test_abnormal_api_rate_rule_triggers_on_burst() -> None:
    """Rule 5: Abnormal API request frequency."""
    rule = AbnormalApiRateRule()
    client_ip = "192.0.2.103"

    # 35 requests within 60s (threshold is 30)
    events = [
        _create_event(client_ip=client_ip, endpoint="/api/v1/search", seconds_ago=i)
        for i in range(35)
    ]
    curr = events[0]
    assessment = rule.evaluate(curr, events)
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category in ("abnormal_api_rate", "abnormal_rate")


def test_suspicious_endpoint_probing_rule() -> None:
    """Rule 6: Suspicious endpoint probing."""
    rule = SuspiciousEndpointProbingRule()

    # Target known probe path /.env
    probe_event = _create_event(endpoint="/.env", status_code=404)
    assessment = rule.evaluate(probe_event, [probe_event])
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category == "endpoint_probing"

    # Normal endpoint 404 does not trigger probe rule
    normal_404 = _create_event(endpoint="/products/item-not-found", status_code=404)
    assessment_normal = rule.evaluate(normal_404, [normal_404])
    assert assessment_normal is None or assessment_normal.is_triggered is False


def test_authorization_spike_rule() -> None:
    """Rule 7: Unexpected authorization failures (403s)."""
    rule = AuthorizationSpikeRule()
    client_ip = "192.0.2.104"

    # 8 forbidden requests from single client
    events = [
        _create_event(client_ip=client_ip, endpoint="/admin/settings", status_code=403, seconds_ago=i * 10)
        for i in range(8)
    ]
    curr = events[0]
    assessment = rule.evaluate(curr, events)
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category == "authorization_spike"


def test_potential_dos_surge_rule_wording_restraint() -> None:
    """Rule 8: Traffic surges consistent with possible DoS.

    CRITICAL SAFETY REQUIREMENT:
    Report evidence consistent with a possible denial-of-service event rather than
    claiming definitive DDoS detection from application logs alone.
    """
    rule = PotentialDosSurgeRule()

    # 55 events with 503 Service Unavailable / 429 errors
    events = [
        _create_event(
            client_ip=f"192.0.2.{i % 20}",
            endpoint="/checkout",
            status_code=503,
            seconds_ago=i * 2,
        )
        for i in range(55)
    ]
    curr = events[0]
    assessment = rule.evaluate(curr, events)
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category == "potential_dos_surge"

    # Verify restrained language
    combined_reasons = " ".join(assessment.detection_reasons)
    assert "consistent with a possible denial-of-service" in combined_reasons.lower()
    # Must NOT claim definitive DDoS
    assert "definitive ddos" not in combined_reasons.lower()


def test_repeated_waf_blocks_rule() -> None:
    """Rule 9: Repeated WAF rule triggers."""
    rule = RepeatedWafBlocksRule()
    client_ip = "192.0.2.105"

    events = [
        _create_event(client_ip=client_ip, action_taken="blocked", seconds_ago=i * 15)
        for i in range(5)
    ]
    curr = events[0]
    assessment = rule.evaluate(curr, events)
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category == "repeated_waf_blocks"


def test_multi_endpoint_correlation_rule() -> None:
    """Rule 10: Correlated suspicious events across endpoints."""
    rule = MultiEndpointCorrelationRule()
    client_ip = "192.0.2.106"

    # Single client hitting 5 distinct endpoints with errors in short window
    endpoints = ["/login", "/api/v1/users", "/admin", "/config", "/actuator"]
    events = [
        _create_event(client_ip=client_ip, endpoint=ep, status_code=404, seconds_ago=i * 10)
        for i, ep in enumerate(endpoints)
    ]
    curr = events[0]
    assessment = rule.evaluate(curr, events)
    assert assessment is not None
    assert assessment.is_triggered is True
    assert assessment.threat_category == "multi_endpoint_correlation"


# =====================================================================
# 4. End-to-End API Workflows & Incident Integration (Parts 4 & 5)
# =====================================================================
def test_ingest_security_event_and_create_incident(client: TestClient) -> None:
    """Ingest a high-risk security event, verify threat detection and incident creation."""
    payload = {
        "source_integration": "api_gateway",
        "service_name": "checkout_api",
        "http_method": "POST",
        "endpoint": "/checkout/pay",
        "status_code": 200,
        "event_category": "api_request",
        "client_ip": "203.0.113.88",
        "request_indicators": {
            "query": "SELECT * FROM users WHERE id = 1 UNION SELECT password FROM admin",
            "Authorization": "Bearer supersecret123",  # Must be redacted
        },
        "auth_outcome": "none",
        "action_taken": "allowed",
        "environment": "production",
    }

    # Viewer role rejected for ingestion
    resp_viewer = client.post(
        "/api/v1/threat-detection/events/ingest",
        json=payload,
        headers={"X-Role": "viewer"},
    )
    assert resp_viewer.status_code == 403

    # Operator role accepted
    resp = client.post(
        "/api/v1/threat-detection/events/ingest",
        json=payload,
        headers={"X-Role": "operator"},
    )
    assert resp.status_code == 201
    evt_data = resp.json()
    assert evt_data["event_id"].startswith("evt-sec-")
    assert evt_data["service_name"] == "checkout_api"
    # Ensure sensitive token was redacted before persistence
    assert evt_data["request_indicators"].get("Authorization") == "[REDACTED]"

    # Query detected threats
    threats_resp = client.get(
        "/api/v1/threat-detection/threats",
        params={"service_name": "checkout_api"},
        headers={"X-Role": "viewer"},
    )
    assert threats_resp.status_code == 200
    threats_data = threats_resp.json()
    assert threats_data["total"] >= 1
    threat = threats_data["items"][0]
    assert threat["threat_category"] == "sqli"
    assert threat["severity"] in ("high", "critical")
    # Verify incident was created and linked
    assert threat["incident_id"] is not None
    assert threat["status"] == "confirmed_incident"


def test_spike_deduplication_prevents_duplicate_incidents(client: TestClient) -> None:
    """During a burst of matching malicious events, ensure deduplication updates existing threat rather than duplicating incidents."""
    ip = "203.0.113.99"
    sqli_payload = {
        "source_integration": "web_server",
        "service_name": "auth_service",
        "http_method": "GET",
        "endpoint": "/users/profile",
        "status_code": 200,
        "client_ip": ip,
        "request_indicators": {"query": "id=1' OR 1=1 --"},
    }

    # First event creates the threat and incident
    resp1 = client.post(
        "/api/v1/threat-detection/events/ingest",
        json=sqli_payload,
        headers={"X-Role": "operator"},
    )
    assert resp1.status_code == 201

    # Second event in spike
    resp2 = client.post(
        "/api/v1/threat-detection/events/ingest",
        json=sqli_payload,
        headers={"X-Role": "operator"},
    )
    assert resp2.status_code == 201

    # Query threats
    threats_resp = client.get(
        "/api/v1/threat-detection/threats",
        params={"client_ip": ip},
        headers={"X-Role": "viewer"},
    )
    assert threats_resp.status_code == 200
    items = threats_resp.json()["items"]
    # Only 1 unique threat record created for this ongoing spike
    assert len(items) == 1
    threat = items[0]
    assert threat["correlated_event_count"] >= 2


def test_false_positive_review_workflow(client: TestClient) -> None:
    """Submit a false-positive review on a detected threat and verify audit trail."""
    # Create probe event
    probe_payload = {
        "source_integration": "web_server",
        "service_name": "legacy_app",
        "http_method": "GET",
        "endpoint": "/actuator/health",
        "status_code": 404,
        "client_ip": "10.0.0.50",
    }
    resp = client.post(
        "/api/v1/threat-detection/events/ingest",
        json=probe_payload,
        headers={"X-Role": "operator"},
    )
    assert resp.status_code == 201

    threats_resp = client.get(
        "/api/v1/threat-detection/threats",
        params={"service_name": "legacy_app"},
        headers={"X-Role": "viewer"},
    )
    threat = threats_resp.json()["items"][0]
    threat_id = threat["threat_id"]

    # Submit false positive review
    review_resp = client.post(
        f"/api/v1/threat-detection/threats/{threat_id}/false-positive",
        json={
            "status": "false_positive",
            "review_notes": "Internal health monitoring agent pinging legacy endpoint; confirmed benign.",
        },
        headers={"X-Role": "operator"},
    )
    assert review_resp.status_code == 200
    rev_data = review_resp.json()
    assert rev_data["status"] == "false_positive"
    assert rev_data["review_notes"] is not None
    assert rev_data["reviewed_at"] is not None


def test_detection_rule_configuration_management(client: TestClient) -> None:
    """List and update detection rule configuration thresholds via Admin role."""
    # List rules
    rules_resp = client.get(
        "/api/v1/threat-detection/rules",
        headers={"X-Role": "viewer"},
    )
    assert rules_resp.status_code == 200
    rules = rules_resp.json()
    assert len(rules) >= 10

    # Non-admin cannot configure rules
    rule_id = "RULE-SQLI-001"
    update_resp_forbidden = client.put(
        f"/api/v1/threat-detection/rules/{rule_id}",
        json={"threshold_count": 10},
        headers={"X-Role": "operator"},
    )
    assert update_resp_forbidden.status_code == 403

    # Admin updates rule configuration
    update_resp = client.put(
        f"/api/v1/threat-detection/rules/{rule_id}",
        json={"is_enabled": False, "threshold_count": 2},
        headers={"X-Role": "admin"},
    )
    assert update_resp.status_code == 200
    updated_rule = update_resp.json()
    assert updated_rule["is_enabled"] is False
    assert updated_rule["threshold_count"] == 2

    # Re-enable rule
    client.put(
        f"/api/v1/threat-detection/rules/{rule_id}",
        json={"is_enabled": True},
        headers={"X-Role": "admin"},
    )


def test_batch_ingestion_api(client: TestClient) -> None:
    """Batch ingestion endpoint with multiple events."""
    batch_payload = {
        "events": [
            {
                "source_integration": "synthetic_dev",
                "service_name": "dev_service",
                "http_method": "GET",
                "endpoint": "/api/v1/test1",
                "status_code": 200,
                "client_ip": "127.0.0.1",
            },
            {
                "source_integration": "synthetic_dev",
                "service_name": "dev_service",
                "http_method": "GET",
                "endpoint": "/api/v1/test2",
                "status_code": 200,
                "client_ip": "127.0.0.1",
            },
        ]
    }
    resp = client.post(
        "/api/v1/threat-detection/events/batch",
        json=batch_payload,
        headers={"X-Role": "operator"},
    )
    assert resp.status_code == 201
    res_data = resp.json()
    assert res_data["ingested_count"] == 2
    assert res_data["simulated_telemetry"] is True
