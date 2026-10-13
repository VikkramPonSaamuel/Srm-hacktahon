from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import check_db_connectivity
from app.schemas.health import DatabaseHealth, HealthResponse


class HealthService:
    """Service responsible for aggregating system component statuses."""

    @staticmethod
    def get_system_health(db: Session, request_id: Optional[str] = None) -> HealthResponse:
        db_probe = check_db_connectivity(db)

        is_connected = db_probe["is_connected"]
        db_health = DatabaseHealth(
            status="connected" if is_connected else "disconnected",
            latency_ms=db_probe.get("latency_ms"),
            error=db_probe.get("error_message"),
        )

        overall_status = "healthy" if is_connected else "degraded"

        return HealthResponse(
            status=overall_status,
            app_name=settings.PROJECT_NAME,
            version=settings.VERSION,
            environment=settings.ENVIRONMENT,
            database=db_health,
            timestamp=datetime.now(timezone.utc),
            request_id=request_id,
        )
