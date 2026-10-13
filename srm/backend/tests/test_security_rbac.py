from fastapi.testclient import TestClient
import pytest

from app.core.config import settings


def test_rbac_with_auth_disabled(client: TestClient):
    """When AUTH_ENABLED is False (default), endpoints can be accessed without credentials."""
    # Ensure disabled
    settings.AUTH_ENABLED = False

    res = client.get("/api/v1/dashboard/overview")
    assert res.status_code == 200

    res = client.get("/api/v1/dashboard/journey-health")
    assert res.status_code == 200


def test_rbac_with_auth_enabled(client: TestClient):
    """When AUTH_ENABLED is True, verifies 401 unauthorized, 403 forbidden, and role hierarchy."""
    settings.AUTH_ENABLED = True
    try:
        # 1. Unauthenticated request -> 401
        res = client.get("/api/v1/dashboard/overview")
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "UNAUTHORIZED"

        # 2. Invalid API key -> 401
        res = client.get("/api/v1/dashboard/overview", headers={"X-API-Key": "invalid-secret-key"})
        assert res.status_code == 401

        # 3. Viewer key on Viewer endpoint -> 200
        res = client.get("/api/v1/dashboard/overview", headers={"X-API-Key": settings.VIEWER_API_KEY})
        assert res.status_code == 200

        # 4. Bearer Token syntax on Viewer endpoint -> 200
        res = client.get(
            "/api/v1/dashboard/overview",
            headers={"Authorization": f"Bearer {settings.VIEWER_API_KEY}"},
        )
        assert res.status_code == 200

        # 5. Viewer key on Admin endpoint (seed-demo-data) -> 403 Forbidden
        res = client.post(
            "/api/v1/dashboard/seed-demo-data",
            headers={"X-API-Key": settings.VIEWER_API_KEY},
        )
        assert res.status_code == 403
        assert res.json()["error"]["code"] == "FORBIDDEN"

        # 6. Operator key on Admin endpoint (seed-demo-data) -> 403 Forbidden
        res = client.post(
            "/api/v1/dashboard/seed-demo-data",
            headers={"X-API-Key": settings.OPERATOR_API_KEY},
        )
        assert res.status_code == 403

        # 7. Admin key on Admin endpoint -> 201 Created
        res = client.post(
            "/api/v1/dashboard/seed-demo-data",
            headers={"X-API-Key": settings.ADMIN_API_KEY},
        )
        assert res.status_code == 201
        assert "seeded" in res.json()["message"]

    finally:
        # Revert back to False for standard test runs
        settings.AUTH_ENABLED = False


def test_rate_limiter_unit():
    """Validates that the sliding window rate limiter blocks requests exceeding the threshold."""
    from unittest.mock import MagicMock
    from app.core.rate_limit import RateLimiter
    from app.core.exceptions import TooManyRequestsError

    limiter = RateLimiter(requests_limit=2, window_seconds=10)
    mock_request = MagicMock()
    mock_request.headers = {}
    mock_request.client.host = "192.168.1.100"

    # 1st request -> allowed
    limiter(mock_request)
    # 2nd request -> allowed
    limiter(mock_request)

    # 3rd request -> exceeds limit
    with pytest.raises(TooManyRequestsError) as exc_info:
        limiter(mock_request)

    assert exc_info.value.status_code == 429
    assert exc_info.value.error_code == "RATE_LIMIT_EXCEEDED"
    assert "retry_after_seconds" in exc_info.value.details

    # Reset allows requests again
    limiter.reset()
    limiter(mock_request)


def test_rate_limiter_endpoint_integration(client: TestClient):
    """Tests that exceeding the rate limit on seed-demo-data returns HTTP 429."""
    from app.core.rate_limit import RateLimiter

    RateLimiter.reset_all()
    orig_limit = settings.RATE_LIMIT_REQUESTS
    settings.RATE_LIMIT_REQUESTS = 2
    try:
        responses = []
        for _ in range(3):
            res = client.post("/api/v1/dashboard/seed-demo-data")
            responses.append(res.status_code)

        assert 429 in responses
        last_res = client.post("/api/v1/dashboard/seed-demo-data")
        assert last_res.status_code == 429
        data = last_res.json()
        assert data["error"]["code"] == "RATE_LIMIT_EXCEEDED"
        assert "retry_after_seconds" in data["error"]["details"]
    finally:
        settings.RATE_LIMIT_REQUESTS = orig_limit
        RateLimiter.reset_all()
