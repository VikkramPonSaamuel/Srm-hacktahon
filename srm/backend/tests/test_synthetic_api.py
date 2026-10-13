from fastapi.testclient import TestClient


def test_api_start_synthetic_journey_success(client: TestClient):
    payload = {
        "template_id": "auth_and_search",
        "scenario": "none",
        "environment": "development",
    }
    res = client.post("/api/v1/synthetic/start", json=payload)
    assert res.status_code == 200
    data = res.json()
    exec_id = data["execution_id"]
    assert data["status"] == "success"
    assert len(data["step_results"]) == 2

    # Status check endpoint
    status_res = client.get(f"/api/v1/synthetic/executions/{exec_id}/status")
    assert status_res.status_code == 200
    assert status_res.json()["execution_id"] == exec_id
    assert status_res.json()["status"] == "success"

    # Step details endpoint
    steps_res = client.get(f"/api/v1/synthetic/executions/{exec_id}/steps")
    assert steps_res.status_code == 200
    assert len(steps_res.json()) == 2


def test_api_simulate_failure_endpoint(client: TestClient):
    payload = {
        "scenario": "auth_5xx",
        "template_id": "retail_checkout",
    }
    res = client.post("/api/v1/synthetic/simulate-failure", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "failed"
    assert data["incident"] is not None
    assert data["incident"]["failure_category"] == "auth_5xx"


def test_api_journey_templates(client: TestClient):
    res = client.get("/api/v1/synthetic/templates")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 3
    template_ids = [t["template_id"] for t in data]
    assert "retail_checkout" in template_ids
    assert "payment_failover" in template_ids
    assert "auth_and_search" in template_ids


def test_api_thresholds_get_and_put(client: TestClient):
    # GET thresholds
    get_res = client.get("/api/v1/synthetic/thresholds")
    assert get_res.status_code == 200
    current = get_res.json()
    assert "default_timeout_ms" in current
    assert "services" in current

    # PUT thresholds
    current["default_timeout_ms"] = 6500.0
    put_res = client.put("/api/v1/synthetic/thresholds", json=current)
    assert put_res.status_code == 200
    assert put_res.json()["default_timeout_ms"] == 6500.0


def test_api_recent_health_checks(client: TestClient):
    # Run a quick synthetic journey to generate snapshots
    client.post("/api/v1/synthetic/start", json={"template_id": "auth_and_search"})

    res = client.get("/api/v1/synthetic/health-checks?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    assert "service_name" in data[0]
    assert "response_latency_ms" in data[0]


def test_api_nonexistent_execution_status(client: TestClient):
    res = client.get("/api/v1/synthetic/executions/exec_nonexistent_888/status")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
