from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import BaseModel
import pytest

from app.core.exceptions import (
    AppException,
    BadRequestError,
    ConflictError,
    DatabaseConnectionError,
    NotFoundError,
    ServiceUnavailableError,
)
from app.main import app


# Register temporary debug routes to verify exception handlers
debug_router = APIRouter(prefix="/test-debug", tags=["Testing"])


class SamplePayload(BaseModel):
    account_id: int
    amount: float


@debug_router.post("/validation-probe")
def trigger_validation(payload: SamplePayload):
    return {"status": "ok", "payload": payload}


@debug_router.get("/custom-error")
def trigger_custom_error():
    raise AppException(message="Custom business failure", error_code="CUSTOM_FAILURE", status_code=400)


@debug_router.get("/not-found-error")
def trigger_not_found():
    raise NotFoundError(message="Transaction entity not found")


@debug_router.get("/bad-request-error")
def trigger_bad_request():
    raise BadRequestError(message="Invalid parameters supplied")


@debug_router.get("/conflict-error")
def trigger_conflict():
    raise ConflictError(message="Transaction version conflict")


@debug_router.get("/db-unavailable-error")
def trigger_db_unavailable():
    raise DatabaseConnectionError(message="Database connection dropped")


@debug_router.get("/service-unavailable-error")
def trigger_service_unavailable():
    raise ServiceUnavailableError(message="Upstream engine unavailable")


@debug_router.get("/unhandled-error")
def trigger_unhandled():
    raise RuntimeError("Unexpected runtime crash")


@pytest.fixture(scope="module", autouse=True)
def include_debug_router():
    app.include_router(debug_router)


def test_root_endpoint(client: TestClient):
    """Verify discovery root endpoint returns application metadata."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data
    assert data["docs"] == "/docs"
    assert data["health"] == "/api/v1/health"


def test_process_time_and_request_id_headers(client: TestClient):
    """Verify response contains X-Process-Time-MS and X-Request-ID headers."""
    response = client.get("/")
    assert "X-Request-ID" in response.headers
    assert "X-Process-Time-MS" in response.headers
    assert float(response.headers["X-Process-Time-MS"]) >= 0


def test_not_found_endpoint(client: TestClient):
    """Verify standard 404 response follows the centralized error format."""
    response = client.get("/api/v1/nonexistent-route-for-testing")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"
    assert "request_id" in data
    assert "timestamp" in data


def test_app_exception_custom_error(client: TestClient):
    """Verify AppException returns custom status code and structured JSON."""
    response = client.get("/test-debug/custom-error")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "CUSTOM_FAILURE"
    assert data["error"]["message"] == "Custom business failure"
    assert "request_id" in data
    assert "timestamp" in data


def test_app_exception_not_found(client: TestClient):
    """Verify NotFoundError returns 404 and structured JSON."""
    response = client.get("/test-debug/not-found-error")
    assert response.status_code == 404
    data = response.json()
    assert data["error"]["code"] == "NOT_FOUND"
    assert data["error"]["message"] == "Transaction entity not found"
    assert "request_id" in data
    assert "timestamp" in data


def test_app_exception_bad_request(client: TestClient):
    """Verify BadRequestError returns 400 and structured JSON."""
    response = client.get("/test-debug/bad-request-error")
    assert response.status_code == 400
    data = response.json()
    assert data["error"]["code"] == "BAD_REQUEST"


def test_app_exception_conflict(client: TestClient):
    """Verify ConflictError returns 409 and structured JSON."""
    response = client.get("/test-debug/conflict-error")
    assert response.status_code == 409
    data = response.json()
    assert data["error"]["code"] == "CONFLICT"


def test_app_exception_database_unavailable(client: TestClient):
    """Verify DatabaseConnectionError returns 503 and structured JSON."""
    response = client.get("/test-debug/db-unavailable-error")
    assert response.status_code == 503
    data = response.json()
    assert data["error"]["code"] == "DATABASE_UNAVAILABLE"


def test_app_exception_service_unavailable(client: TestClient):
    """Verify ServiceUnavailableError returns 503 and structured JSON."""
    response = client.get("/test-debug/service-unavailable-error")
    assert response.status_code == 503
    data = response.json()
    assert data["error"]["code"] == "SERVICE_UNAVAILABLE"


def test_validation_error_handler(client: TestClient):
    """Verify 422 RequestValidationError is mapped to standard JSON response."""
    response = client.post("/test-debug/validation-probe", json={"account_id": "not-an-int"})
    assert response.status_code == 422
    data = response.json()
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert data["error"]["message"] == "Request validation failed"
    assert isinstance(data["error"]["details"], list)
    assert len(data["error"]["details"]) > 0


def test_unhandled_exception_handler():
    """Verify unhandled Exception returns 500 without leaking stack traces."""
    with TestClient(app, raise_server_exceptions=False) as c:
        response = c.get("/test-debug/unhandled-error")
        assert response.status_code == 500
        data = response.json()
        assert data["error"]["code"] == "INTERNAL_SERVER_ERROR"
        assert "unexpected server error" in data["error"]["message"].lower()
        assert "request_id" in data

