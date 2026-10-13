from fastapi.testclient import TestClient


def test_create_and_get_journey(client: TestClient):
    payload = {
        "name": "B2B Wire Transfer Flow",
        "description": "Cross-border settlement flow",
        "journey_type": "fund_transfer",
        "is_enabled": True,
        "steps": [
            {
                "step_name": "Auth Check",
                "step_order": 1,
                "service_name": "auth-service",
                "step_type": "auth",
                "timeout_ms": 3000,
                "is_required": True,
            },
            {
                "step_name": "Ledger Settlement",
                "step_order": 2,
                "service_name": "ledger-service",
                "step_type": "api_call",
                "timeout_ms": 5000,
                "is_required": True,
            },
        ],
    }

    create_res = client.post("/api/v1/journeys", json=payload)
    assert create_res.status_code == 201
    created_data = create_res.json()
    journey_id = created_data["id"]
    assert created_data["name"] == "B2B Wire Transfer Flow"
    assert len(created_data["steps"]) == 2
    assert created_data["steps"][0]["step_name"] == "Auth Check"

    # Get by ID
    get_res = client.get(f"/api/v1/journeys/{journey_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "B2B Wire Transfer Flow"


def test_duplicate_journey_name_conflict(client: TestClient):
    payload = {
        "name": "Unique Name Journey",
        "journey_type": "checkout",
    }
    res1 = client.post("/api/v1/journeys", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/journeys", json=payload)
    assert res2.status_code == 409
    assert "already exists" in res2.json()["error"]["message"]


def test_list_journeys_and_pagination(client: TestClient):
    client.post("/api/v1/journeys", json={"name": "Journey One", "journey_type": "checkout"})
    client.post("/api/v1/journeys", json={"name": "Journey Two", "journey_type": "checkout"})
    client.post("/api/v1/journeys", json={"name": "Journey Three", "journey_type": "auth"})

    # Filter by journey_type
    res = client.get("/api/v1/journeys?journey_type=checkout&limit=10")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 2
    assert all(item["journey_type"] == "checkout" for item in data["items"])


def test_toggle_journey_enabled(client: TestClient):
    res = client.post("/api/v1/journeys", json={"name": "Toggleable Journey", "journey_type": "auth"})
    journey_id = res.json()["id"]

    toggle_res = client.patch(f"/api/v1/journeys/{journey_id}/toggle", json={"is_enabled": False})
    assert toggle_res.status_code == 200
    assert toggle_res.json()["is_enabled"] is False

    # Check that detail reflects disabled state
    get_res = client.get(f"/api/v1/journeys/{journey_id}")
    assert get_res.json()["is_enabled"] is False


def test_step_management_and_order_conflict(client: TestClient):
    res = client.post("/api/v1/journeys", json={"name": "Step Journey", "journey_type": "test"})
    journey_id = res.json()["id"]

    # Add Step 1
    step1_res = client.post(
        f"/api/v1/journeys/{journey_id}/steps",
        json={
            "step_name": "Step 1",
            "step_order": 1,
            "service_name": "service-a",
            "step_type": "api_call",
        },
    )
    assert step1_res.status_code == 201
    step1_id = step1_res.json()["id"]

    # Try duplicate step order 1 -> 409 Conflict
    dup_res = client.post(
        f"/api/v1/journeys/{journey_id}/steps",
        json={
            "step_name": "Step 1 Duplicate",
            "step_order": 1,
            "service_name": "service-b",
            "step_type": "api_call",
        },
    )
    assert dup_res.status_code == 409

    # Add Step 2
    step2_res = client.post(
        f"/api/v1/journeys/{journey_id}/steps",
        json={
            "step_name": "Step 2",
            "step_order": 2,
            "service_name": "service-b",
            "step_type": "api_call",
        },
    )
    assert step2_res.status_code == 201

    # List steps
    list_res = client.get(f"/api/v1/journeys/{journey_id}/steps")
    assert list_res.status_code == 200
    assert len(list_res.json()) == 2

    # Update Step 1
    update_res = client.put(
        f"/api/v1/journeys/{journey_id}/steps/{step1_id}",
        json={"step_name": "Updated Step 1", "timeout_ms": 7500},
    )
    assert update_res.status_code == 200
    assert update_res.json()["step_name"] == "Updated Step 1"
    assert update_res.json()["timeout_ms"] == 7500

    # Delete Step 1
    del_res = client.delete(f"/api/v1/journeys/{journey_id}/steps/{step1_id}")
    assert del_res.status_code == 204

    # List again -> 1 step remaining
    list_after = client.get(f"/api/v1/journeys/{journey_id}/steps")
    assert len(list_after.json()) == 1


def test_get_nonexistent_journey(client: TestClient):
    res = client.get("/api/v1/journeys/999999")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
