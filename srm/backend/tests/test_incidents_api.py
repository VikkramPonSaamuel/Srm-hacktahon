from datetime import datetime, timezone
from fastapi.testclient import TestClient


def test_record_and_get_incident(client: TestClient):
    payload = {
        "title": "Payment Gateway 504 Timeout",
        "description": "Customer authorization failed with Authorization: Bearer secret_live_token_12345",
        "severity": "high",
        "incident_type": "transaction_failure",
        "service_name": "payment-service",
        "failure_category": "network_timeout",
        "detected_at": datetime.now(timezone.utc).isoformat(),
        "initial_event": {
            "event_type": "detected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": {"password": "super_secret_pwd", "target_url": "https://api.gateway.com/charge"},
        },
    }

    create_res = client.post("/api/v1/incidents", json=payload)
    assert create_res.status_code == 201
    created_data = create_res.json()
    inc_id = created_data["incident_id"]

    # Verify description sanitization
    assert "[REDACTED_TOKEN]" in created_data["description"]
    assert "secret_live_token_12345" not in created_data["description"]

    # Verify initial event details sanitization
    assert len(created_data["events"]) == 1
    assert created_data["events"][0]["details"]["password"] == "[REDACTED]"

    # Retrieve by incident_id string
    get_res = client.get(f"/api/v1/incidents/{inc_id}")
    assert get_res.status_code == 200
    assert get_res.json()["incident_id"] == inc_id


def test_incident_lifecycle_and_timeline_events(client: TestClient):
    # 1. Create incident
    create_res = client.post(
        "/api/v1/incidents",
        json={
            "title": "Auth Service Latency Spike",
            "description": "Auth service p99 exceeded 2500ms",
            "severity": "medium",
            "service_name": "auth-service",
            "detected_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    inc_id = create_res.json()["incident_id"]

    # 2. Add manual investigation event
    add_event_res = client.post(
        f"/api/v1/incidents/{inc_id}/events",
        json={
            "event_type": "analyzed",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": {"finding": "Garbage collection pause observed on auth container 2"},
        },
    )
    assert add_event_res.status_code == 201
    assert add_event_res.json()["event_type"] == "analyzed"

    # 3. Update status to resolved -> auto appends status_changed event
    update_res = client.patch(
        f"/api/v1/incidents/{inc_id}",
        json={
            "status": "resolved",
            "resolution_summary": "Restarted auth container pod and increased heap size",
            "recovery_status": "recovered",
            "recovery_duration_ms": 1420.0,
        },
    )
    assert update_res.status_code == 200
    assert update_res.json()["status"] == "resolved"
    assert update_res.json()["resolved_at"] is not None

    # 4. Retrieve complete timeline
    timeline_res = client.get(f"/api/v1/incidents/{inc_id}/events")
    assert timeline_res.status_code == 200
    events = timeline_res.json()
    assert len(events) >= 3  # initial detected, analyzed, status_changed
    event_types = [e["event_type"] for e in events]
    assert "detected" in event_types
    assert "analyzed" in event_types
    assert "status_changed" in event_types


def test_list_incidents_filtering(client: TestClient):
    client.post(
        "/api/v1/incidents",
        json={
            "title": "Critical Ledger Deadlock",
            "description": "Deadlock on account row",
            "severity": "critical",
            "service_name": "ledger-service",
            "failure_category": "database_deadlock",
            "status": "open",
            "detected_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    client.post(
        "/api/v1/incidents",
        json={
            "title": "Low Notification Lag",
            "description": "Delayed email delivery",
            "severity": "low",
            "service_name": "notification-service",
            "failure_category": "rate_limited",
            "status": "closed",
            "detected_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    # Filter by severity and service
    res = client.get("/api/v1/incidents?severity=critical&service_name=ledger-service")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert all(i["severity"] == "critical" and i["service_name"] == "ledger-service" for i in data["items"])


def test_get_nonexistent_incident(client: TestClient):
    res = client.get("/api/v1/incidents/inc_nonexistent_999")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "NOT_FOUND"
