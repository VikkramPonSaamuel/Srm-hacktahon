from fastapi.testclient import TestClient


def _seed_test_pattern(client: TestClient):
    # Simulate two identical failures to generate a candidate pattern
    client.post("/api/v1/synthetic/simulate-failure", json={"scenario": "auth_5xx"})
    res2 = client.post("/api/v1/synthetic/simulate-failure", json={"scenario": "auth_5xx"})
    data = res2.json()
    assert data["matched_pattern"] is not None
    return data["matched_pattern"]["pattern_id"]


def test_api_list_patterns_and_filtering(client: TestClient):
    pattern_id = _seed_test_pattern(client)

    # List patterns
    res = client.get("/api/v1/patterns")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    pattern_ids = [p["pattern_id"] for p in data["items"]]
    assert pattern_id in pattern_ids

    # Filter by service_name
    filtered_res = client.get("/api/v1/patterns?service_name=auth-service")
    assert filtered_res.status_code == 200
    assert filtered_res.json()["total"] >= 1


def test_api_get_pattern_details_and_evidence(client: TestClient):
    pattern_id = _seed_test_pattern(client)

    # 1. Get pattern details
    detail_res = client.get(f"/api/v1/patterns/{pattern_id}")
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["pattern_id"] == pattern_id
    assert "detection_rules" in detail_data
    assert len(detail_data["evidence_matches"]) >= 2

    # 2. Get pattern evidence endpoint
    evidence_res = client.get(f"/api/v1/patterns/{pattern_id}/evidence")
    assert evidence_res.status_code == 200
    ev_data = evidence_res.json()
    assert ev_data["pattern_id"] == pattern_id
    assert ev_data["confidence_score"] > 0
    assert len(ev_data["matches"]) >= 2
    assert len(ev_data["matches"][0]["match_reasons"]) > 0


def test_api_pattern_incidents_and_frequency(client: TestClient):
    pattern_id = _seed_test_pattern(client)

    # Get linked incidents
    incidents_res = client.get(f"/api/v1/patterns/{pattern_id}/incidents")
    assert incidents_res.status_code == 200
    inc_data = incidents_res.json()
    assert len(inc_data) >= 2

    # Get frequency over time
    freq_res = client.get(f"/api/v1/patterns/{pattern_id}/frequency")
    assert freq_res.status_code == 200
    freq_data = freq_res.json()
    assert freq_data["pattern_id"] == pattern_id
    assert freq_data["total_incidents"] >= 2
    assert len(freq_data["frequency"]) >= 1


def test_api_pattern_status_lifecycle(client: TestClient):
    pattern_id = _seed_test_pattern(client)

    # 1. Confirm candidate pattern
    confirm_res = client.patch(
        f"/api/v1/patterns/{pattern_id}/status",
        json={"status": "confirmed", "notes": "Verified by engineering lead"},
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "confirmed"

    # 2. Retire pattern
    retire_res = client.patch(
        f"/api/v1/patterns/{pattern_id}/status",
        json={"status": "retired", "notes": "Service migrated to v2 architecture"},
    )
    assert retire_res.status_code == 200
    assert retire_res.json()["status"] == "retired"


def test_api_reevaluate_patterns(client: TestClient):
    # Trigger synchronous evaluation
    eval_res = client.post("/api/v1/patterns/evaluate?async_mode=false")
    assert eval_res.status_code == 200
    data = eval_res.json()
    assert "total_incidents_analyzed" in data
    assert "total_patterns_active" in data

    # Trigger background evaluation
    bg_res = client.post("/api/v1/patterns/evaluate?async_mode=true")
    assert bg_res.status_code == 200
    assert "background task" in bg_res.json()["message"]


def test_api_get_nonexistent_pattern(client: TestClient):
    res = client.get("/api/v1/patterns/pat_nonexistent_999")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
