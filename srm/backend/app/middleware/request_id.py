import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import get_logger, request_id_ctx

logger = get_logger("app.middleware.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Middleware that assigns a unique request ID, traces execution time,

    and populates context variables for structured logging.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        incoming_request_id = request.headers.get("X-Request-ID")
        request_id = incoming_request_id if incoming_request_id else f"req_{uuid.uuid4().hex[:16]}"

        # Store in request state for downstream handlers
        request.state.request_id = request_id

        # Set contextvar for structured logging
        token = request_id_ctx.set(request_id)

        start_time = time.perf_counter()
        client_ip = request.client.host if request.client else "unknown"

        try:
            response = await call_next(request)
            process_time_ms = round((time.perf_counter() - start_time) * 1000, 2)

            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time-MS"] = str(process_time_ms)

            # Avoid logging excessive noise for static or internal polling if any, but log all standard requests
            logger.info(
                f"{request.method} {request.url.path} - {response.status_code} ({process_time_ms}ms) [{client_ip}]"
            )
            return response
        except Exception:
            process_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                f"{request.method} {request.url.path} failed after {process_time_ms}ms [{client_ip}]",
                exc_info=True,
            )
            raise
        finally:
            request_id_ctx.reset(token)
