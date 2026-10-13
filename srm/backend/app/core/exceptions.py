from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger, request_id_ctx

logger = get_logger("app.exceptions")


class AppException(Exception):
    """Base class for all application domain exceptions."""

    def __init__(
        self,
        message: str,
        error_code: str = "INTERNAL_SERVER_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details


class NotFoundError(AppException):
    """Raised when an entity or resource is not found."""

    def __init__(self, message: str = "Resource not found", details: Optional[Any] = None) -> None:
        super().__init__(
            message=message,
            error_code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
            details=details,
        )


class BadRequestError(AppException):
    """Raised when the request parameters or body are invalid."""

    def __init__(self, message: str = "Bad request", details: Optional[Any] = None) -> None:
        super().__init__(
            message=message,
            error_code="BAD_REQUEST",
            status_code=status.HTTP_400_BAD_REQUEST,
            details=details,
        )


class ConflictError(AppException):
    """Raised when a resource state conflict occurs."""

    def __init__(self, message: str = "Resource conflict", details: Optional[Any] = None) -> None:
        super().__init__(
            message=message,
            error_code="CONFLICT",
            status_code=status.HTTP_409_CONFLICT,
            details=details,
        )


class DatabaseConnectionError(AppException):
    """Raised when the database connection fails or times out."""

    def __init__(self, message: str = "Database connection unavailable", details: Optional[Any] = None) -> None:
        super().__init__(
            message=message,
            error_code="DATABASE_UNAVAILABLE",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details,
        )


class ServiceUnavailableError(AppException):
    """Raised when an internal or external dependency is unavailable."""

    def __init__(self, message: str = "Service unavailable", details: Optional[Any] = None) -> None:
        super().__init__(
            message=message,
            error_code="SERVICE_UNAVAILABLE",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            details=details,
        )


class UnauthorizedError(AppException):
    """Raised when authentication credentials are missing or invalid."""

    def __init__(self, message: str = "Authentication required", details: Optional[Any] = None) -> None:
        super().__init__(
            message=message,
            error_code="UNAUTHORIZED",
            status_code=status.HTTP_401_UNAUTHORIZED,
            details=details,
        )


class ForbiddenError(AppException):
    """Raised when the user does not have sufficient role permissions."""

    def __init__(self, message: str = "Access denied: insufficient permissions", details: Optional[Any] = None) -> None:
        super().__init__(
            message=message,
            error_code="FORBIDDEN",
            status_code=status.HTTP_403_FORBIDDEN,
            details=details,
        )


class TooManyRequestsError(AppException):
    """Raised when rate limit is exceeded on sensitive endpoints."""

    def __init__(self, message: str = "Rate limit exceeded. Please retry later.", details: Optional[Any] = None) -> None:
        super().__init__(
            message=message,
            error_code="RATE_LIMIT_EXCEEDED",
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            details=details,
        )


def build_error_response(
    status_code: int,
    error_code: str,
    message: str,
    details: Optional[Any] = None,
    request_id: Optional[str] = None,
) -> JSONResponse:
    """Build a standardized JSON error response."""
    resolved_req_id = request_id or request_id_ctx.get()
    content: Dict[str, Any] = {
        "error": {
            "code": error_code,
            "message": message,
            "details": details,
        },
        "request_id": resolved_req_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    return JSONResponse(status_code=status_code, content=content)


def register_exception_handlers(app: FastAPI) -> None:
    """Register centralized exception handlers on the FastAPI application."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        logger.warning(
            f"AppException: {exc.error_code} - {exc.message}",
            extra={"request_id": getattr(request.state, "request_id", None)},
        )
        return build_error_response(
            status_code=exc.status_code,
            error_code=exc.error_code,
            message=exc.message,
            details=exc.details,
            request_id=getattr(request.state, "request_id", None),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        # Clean up errors for serialization
        simplified_errors = []
        for err in errors:
            simplified_errors.append({
                "loc": [str(loc_item) for loc_item in err.get("loc", [])],
                "msg": err.get("msg", ""),
                "type": err.get("type", ""),
            })

        logger.info(
            f"Validation error on {request.method} {request.url.path}: {len(errors)} issues",
            extra={"request_id": getattr(request.state, "request_id", None)},
        )
        return build_error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            error_code="VALIDATION_ERROR",
            message="Request validation failed",
            details=simplified_errors,
            request_id=getattr(request.state, "request_id", None),
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        logger.info(
            f"HTTPException {exc.status_code} on {request.method} {request.url.path}: {exc.detail}",
            extra={"request_id": getattr(request.state, "request_id", None)},
        )
        return build_error_response(
            status_code=exc.status_code,
            error_code=f"HTTP_{exc.status_code}",
            message=str(exc.detail),
            details=None,
            request_id=getattr(request.state, "request_id", None),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            f"Unhandled server error on {request.method} {request.url.path}: {str(exc)}",
            exc_info=True,
            extra={"request_id": getattr(request.state, "request_id", None)},
        )
        return build_error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="INTERNAL_SERVER_ERROR",
            message="An unexpected server error occurred. Please contact support with the request ID.",
            details=None,
            request_id=getattr(request.state, "request_id", None),
        )
