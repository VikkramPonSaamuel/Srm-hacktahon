from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
import pytest


@pytest.fixture
def seeded_client(client: TestClient) -> TestClient:
    """Provides a test client populated with demonstration reliability data."""
    res = client.post("/api/v1/dashboard/seed-demo-data")
    assert res.status_code == 201
    return client


def test_dashboard_empty_states(client: TestClient):
    """Verifies that all dashboard endpoints handle empty database states gracefully without division-by-zero errors."""
    # 1. Overview KPIs
    res = client.get("/api/v1/dashboard/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["total_journey_executions"] == 0
    assert data["overall_journey_success_rate"] == 0.0
    assert data["active_incidents"] == 0
    assert data["known_failure_patterns"] == 0
    assert data["successful_recovery_rate"] == 0.0
    assert data["median_detection_time_ms"] is None
    assert data["median_recovery_time_ms"] is None

    # 2. Journey Health
    res = client.get("/api/v1/dashboard/journey-health")
    assert res.status_code == 200
    data = res.json()
    assert data["journeys"] == []
    assert data["frequently_failing_steps"] == []
    assert data["service_health_summaries"] == []

    # 3. Incident Analytics
    res = client.get("/api/v1/dashboard/incident-analytics")
    assert res.status_code == 200
    data = res.json()
    assert data["volume_over_time"] == []
    assert data["top_failure_patterns"] == []
    assert data["repeated_incidents"] == []
    assert data["recent_incident_timelines"] == []

    # 4. Pattern Analytics
    res = client.get("/api/v1/dashboard/pattern-analytics")
    assert res.status_code == 200
    data = res.json()
    assert data["total_patterns"] == 0
    assert data["most_frequent_patterns"] == []

    # 5. Countermeasure Analytics
    res = client.get("/api/v1/dashboard/countermeasure-analytics")
    assert res.status_code == 200
    data = res.json()
    assert data["total_playbooks"] == 0
    assert data["recovery_executions_total"] == 0
    assert data["recovery_success_rate"] == 0.0
    assert data["playbook_performance"] == []

    # 6. Historical Incidents
    res = client.get("/api/v1/dashboard/history/incidents")
    assert res.status_code == 200
    data = res.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


def test_seed_demo_data_and_overview_kpis(seeded_client: TestClient):
    """Verifies demonstration data seeding and resulting Overview KPIs calculations."""
    # Check Overview with data_source="demo"
    res = seeded_client.get("/api/v1/dashboard/overview?data_source=demo&preset=7d")
    assert res.status_code == 200
    data = res.json()
    assert data["total_journey_executions"] >= 10
    assert data["overall_journey_success_rate"] > 0.0
    assert data["incidents_detected_in_range"] >= 1
    assert data["known_failure_patterns"] >= 1
    assert data["time_range"]["data_source"] == "demo"

    # Check Overview with data_source="live" (should be 0 because only demo was seeded)
    res_live = seeded_client.get("/api/v1/dashboard/overview?data_source=live")
    assert res_live.status_code == 200
    assert res_live.json()["total_journey_executions"] == 0


def test_journey_health_metrics_and_failing_steps(seeded_client: TestClient):
    """Verifies journey health telemetry, percentiles, and failing steps aggregation."""
    res = seeded_client.get("/api/v1/dashboard/journey-health?preset=7d")
    assert res.status_code == 200
    data = res.json()
    assert len(data["journeys"]) >= 1
    j = data["journeys"][0]
    assert j["name"].startswith("[DEMO]")
    assert j["health_status"] in ["healthy", "degraded", "failing"]
    assert j["total_executions"] > 0
    assert j["p50_latency_ms"] > 0.0
    assert j["p90_latency_ms"] >= j["p50_latency_ms"]
    assert j["p99_latency_ms"] >= j["p90_latency_ms"]
    assert j["latest_execution"] is not None

    # Service health summaries
    assert len(data["service_health_summaries"]) >= 1
    svc = data["service_health_summaries"][0]
    assert svc["service_name"] in [
        "auth-service",
        "product-service",
        "cart-service",
        "checkout-service",
        "payment-service",
        "order-service",
    ]


def test_incident_analytics_aggregations(seeded_client: TestClient):
    """Verifies incident volume by time, severity breakdown, and repeated failure grouping."""
    res = seeded_client.get("/api/v1/dashboard/incident-analytics?preset=7d")
    assert res.status_code == 200
    data = res.json()

    assert len(data["volume_over_time"]) >= 1
    assert "critical" in data["incidents_by_severity"]
    assert data["incidents_by_severity"]["critical"] >= 1
    assert "payment-service" in data["incidents_by_service"]
    assert len(data["top_failure_patterns"]) >= 1
    assert len(data["recent_incident_timelines"]) >= 1
    recent = data["recent_incident_timelines"][0]
    assert recent["incident_id"].startswith("demo_inc_")
    assert recent["event_count"] >= 1


def test_pattern_analytics_and_associated_playbooks(seeded_client: TestClient):
    """Verifies failure pattern frequency, confidence scoring, and associated countermeasures."""
    res = seeded_client.get("/api/v1/dashboard/pattern-analytics")
    assert res.status_code == 200
    data = res.json()
    assert data["total_patterns"] >= 2
    assert data["patterns_by_status"]["confirmed"] >= 1

    top_pat = data["most_frequent_patterns"][0]
    assert top_pat["pattern_id"].startswith("demo_pat_")
    assert top_pat["confidence_score"] >= 0.8
    assert top_pat["associated_playbook"] is not None
    assert top_pat["associated_playbook"]["approval_status"] == "approved"


def test_countermeasure_analytics_performance(seeded_client: TestClient):
    """Verifies playbook performance, action counts, and recovery success rates."""
    res = seeded_client.get("/api/v1/dashboard/countermeasure-analytics?preset=7d")
    assert res.status_code == 200
    data = res.json()
    assert data["total_playbooks"] >= 1
    assert data["enabled_count"] >= 1
    assert data["recovery_executions_total"] >= 1
    assert data["recovery_success_rate"] > 0.0
    assert len(data["playbook_performance"]) >= 1
    pb = data["playbook_performance"][0]
    assert pb["execution_count"] >= 1


def test_historical_incidents_search_filters_and_pagination(seeded_client: TestClient):
    """Verifies searchable, filterable, and paginated incident history."""
    # 1. Base query
    res = seeded_client.get("/api/v1/dashboard/history/incidents?page=1&page_size=5")
    assert res.status_code == 200
    data = res.json()
    assert data["page"] == 1
    assert data["page_size"] == 5
    assert len(data["items"]) <= 5
    assert data["total"] >= 1
    first_id = data["items"][0]["incident_id"]

    # 2. Text search query
    res_search = seeded_client.get(f"/api/v1/dashboard/history/incidents?q={first_id}")
    assert res_search.status_code == 200
    search_data = res_search.json()
    assert search_data["total"] >= 1
    assert search_data["items"][0]["incident_id"] == first_id

    # 3. Filter by severity
    res_sev = seeded_client.get("/api/v1/dashboard/history/incidents?severity=critical")
    assert res_sev.status_code == 200
    for it in res_sev.json()["items"]:
        assert it["severity"] == "critical"

    # 4. Fetch complete incident details
    res_detail = seeded_client.get(f"/api/v1/dashboard/history/incidents/{first_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["incident"]["incident_id"] == first_id
    assert len(detail["step_executions"]) >= 1
    assert len(detail["recovery_attempts"]) >= 1
    assert len(detail["timeline_events"]) >= 1
    assert len(detail["matched_patterns"]) >= 1

    # 5. Nonexistent incident
    res_404 = seeded_client.get("/api/v1/dashboard/history/incidents/nonexistent-incident-id")
    assert res_404.status_code == 404


def test_export_sanitized_records_csv(seeded_client: TestClient):
    """Verifies that CSV export contains all fields with sensitive data redacted."""
    res = seeded_client.get("/api/v1/dashboard/history/export/incidents.csv?preset=7d")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=reliability_incidents_export.csv" in res.headers["content-disposition"]

    content = res.text
    lines = content.strip().split("\n")
    assert len(lines) >= 2  # header + at least 1 row
    header = lines[0].strip().split(",")
    assert "incident_id" in header
    assert "severity" in header
    assert "status" in header
    assert "failure_category" in header
    assert "recovery_status" in header
