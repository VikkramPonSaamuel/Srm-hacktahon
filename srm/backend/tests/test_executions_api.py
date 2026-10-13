from datetime import datetime, timezone
from fastapi.testclient import TestClient


def test_record_and_get_execution(client: TestClient):
    # Setup journey
    j_res = client.post("/api/v1/journeys", json={"name": "Exec Test Journey", "journey_type": "checkout"})
    journey_id = j_res.json()["id"]

    exec_payload = {
        "journey_id": journey_id,
        "correlation_id": "corr-test-trace-001",
        "environment": "staging",
        "status": "in_progress",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "steps": [
            {
                "status": "success",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "duration_ms": 120.0,
                "latency_ms": 110.0,
                "http_status": 200,
                "diagnostic_data": {
                    "request_url": "/api/v1/charge",
                    "password": "leak_attempt_password",
                    "token": "secret_token_123",
                    "safe_key": "safe_val",
                },
            }
        ],
    }

    create_res = client.post("/api/v1/executions", json=exec_payload)
    assert create_res.status_code == 201
    created_data = create_res.json()
    exec_id = created_data["execution_id"]
    assert created_data["correlation_id"] == "corr-test-trace-001"
    assert len(created_data["step_executions"]) == 1

    # Verify diagnostic sanitization
    diag = created_data["step_executions"][0]["diagnostic_data"]
    assert diag["password"] == "[REDACTED]"
    assert diag["token"] == "[REDACTED]"
    assert diag["safe_key"] == "safe_val"

    # Get by execution_id string
    get_res = client.get(f"/api/v1/executions/{exec_id}")
    assert get_res.status_code == 200
    assert get_res.json()["execution_id"] == exec_id


def test_add_step_result_and_list_steps(client: TestClient):
    create_res = client.post(
        "/api/v1/executions",
        json={
            "correlation_id": "corr-step-test",
            "environment": "production",
            "status": "in_progress",
            "started_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    exec_id = create_res.json()["execution_id"]

    step_payload = {
        "status": "failed",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "duration_ms": 5005.0,
        "latency_ms": 5000.0,
        "http_status": 504,
        "error_code": "GATEWAY_TIMEOUT",
        "failure_category": "network_timeout",
        "retry_count": 3,
        "diagnostic_data": {"card_number": "4111222233334444", "cvv": "999"},
    }

    add_step_res = client.post(f"/api/v1/executions/{exec_id}/steps", json=step_payload)
    assert add_step_res.status_code == 201
    step_data = add_step_res.json()
    assert step_data["status"] == "failed"
    assert step_data["failure_category"] == "network_timeout"
    assert step_data["diagnostic_data"]["card_number"] == "[REDACTED]"
    assert step_data["diagnostic_data"]["cvv"] == "[REDACTED]"

    # List steps
    list_steps_res = client.get(f"/api/v1/executions/{exec_id}/steps")
    assert list_steps_res.status_code == 200
    assert len(list_steps_res.json()) == 1


def test_list_executions_with_filters(client: TestClient):
    client.post(
        "/api/v1/executions",
        json={
            "correlation_id": "corr-filter-success",
            "environment": "production",
            "status": "success",
            "started_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    client.post(
        "/api/v1/executions",
        json={
            "correlation_id": "corr-filter-failed",
            "environment": "development",
            "status": "failed",
            "started_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    res = client.get("/api/v1/executions?status=success&environment=production")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert all(e["status"] == "success" and e["environment"] == "production" for e in data["items"])


def test_get_nonexistent_execution(client: TestClient):
    res = client.get("/api/v1/executions/exec_nonexistent_999")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
