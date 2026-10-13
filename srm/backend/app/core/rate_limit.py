import threading
import time
from typing import Dict, List, Optional
from fastapi import Request

from app.core.config import settings
from app.core.exceptions import TooManyRequestsError


class RateLimiter:
    """Thread-safe in-memory sliding-window rate limiter dependency for sensitive endpoints."""

    _instances: List["RateLimiter"] = []

    def __init__(
        self,
        requests_limit: Optional[int] = None,
        window_seconds: Optional[int] = None,
    ) -> None:
        self._requests_limit = requests_limit
        self._window_seconds = window_seconds
        self._lock = threading.Lock()
        self._history: Dict[str, List[float]] = {}
        RateLimiter._instances.append(self)

    @property
    def requests_limit(self) -> int:
        return self._requests_limit if self._requests_limit is not None else settings.RATE_LIMIT_REQUESTS

    @property
    def window_seconds(self) -> int:
        return self._window_seconds if self._window_seconds is not None else settings.RATE_LIMIT_WINDOW_SECONDS

    def __call__(self, request: Request) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return

        client_ip = (
            request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or (request.client.host if request.client else "unknown-client")
        )
        now = time.time()
        window = self.window_seconds
        limit = self.requests_limit
        cutoff = now - window

        with self._lock:
            # Filter expired timestamps
            timestamps = [t for t in self._history.get(client_ip, []) if t > cutoff]

            if len(timestamps) >= limit:
                retry_after = int(window - (now - timestamps[0])) + 1
                raise TooManyRequestsError(
                    message=(
                        f"Rate limit exceeded on sensitive endpoint. "
                        f"Maximum {limit} requests allowed per {window}s. "
                        f"Please retry after {retry_after} seconds."
                    ),
                    details={"retry_after_seconds": retry_after, "limit": limit},
                )

            timestamps.append(now)
            self._history[client_ip] = timestamps

    def reset(self) -> None:
        """Reset internal rate tracking history."""
        with self._lock:
            self._history.clear()

    @classmethod
    def reset_all(cls) -> None:
        """Reset rate tracking history across all registered rate limiters."""
        for instance in cls._instances:
            instance.reset()
