from datetime import datetime, timezone
from fastapi.testclient import TestClient


def test_record_and_query_service_health(client: TestClient):
    payload = {
        "service_name": "payment-gateway",
        "status": "healthy",
        "response_latency_ms": 142.5,
        "error_rate": 0.02,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": {"card_number": "1234567812345678", "p99": 250.0},
    }

    create_res = client.post("/api/v1/service-health", json=payload)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["service_name"] == "payment-gateway"
    assert created_data["status"] == "healthy"
    assert created_data["details"]["card_number"] == "[REDACTED]"

    # Query history
    query_res = client.get("/api/v1/service-health?service_name=payment-gateway")
    assert query_res.status_code == 200
    data = query_res.json()
    assert data["total"] >= 1
    assert data["items"][0]["service_name"] == "payment-gateway"


def test_service_health_validation(client: TestClient):
    # Error rate cannot exceed 1.0
    bad_payload = {
        "service_name": "invalid-service",
        "status": "healthy",
        "response_latency_ms": 100.0,
        "error_rate": 1.5,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    res = client.post("/api/v1/service-health", json=bad_payload)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"
