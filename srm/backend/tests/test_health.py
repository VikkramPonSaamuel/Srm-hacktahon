from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.main import app


def test_health_endpoint_healthy(client: TestClient):
    """Verify that /api/v1/health returns 200 and healthy status when database is operational."""
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "healthy"
    assert data["app_name"] == settings.PROJECT_NAME
    assert data["version"] == settings.VERSION
    assert data["environment"] == settings.ENVIRONMENT
    assert data["database"]["status"] == "connected"
    assert data["database"]["latency_ms"] is not None
    assert data["database"]["error"] is None
    assert "timestamp" in data
    assert "request_id" in data
    assert response.headers.get("X-Request-ID") is not None


def test_health_endpoint_degraded_when_db_down(client: TestClient):
    """Verify that /api/v1/health returns 503 and degraded status when database fails."""
    simulated_failure = {
        "is_connected": False,
        "latency_ms": 12.34,
        "error_message": "Connection to PostgreSQL host 'localhost:5432' timed out",
    }

    with patch("app.services.health.check_db_connectivity", return_value=simulated_failure):
        response = client.get("/api/v1/health")

        assert response.status_code == 503
        data = response.json()

        assert data["status"] == "degraded"
        assert data["database"]["status"] == "disconnected"
        assert data["database"]["latency_ms"] == 12.34
        assert "timed out" in data["database"]["error"]
        assert response.headers.get("X-Request-ID") is not None


def test_health_preserves_custom_request_id(client: TestClient):
    """Verify that an incoming X-Request-ID is retained in the response and payload."""
    custom_id = "test-custom-trace-999"
    response = client.get("/api/v1/health", headers={"X-Request-ID": custom_id})

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID") == custom_id
    data = response.json()
    assert data["request_id"] == custom_id
