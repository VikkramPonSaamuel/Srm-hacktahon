from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ServiceHealthSnapshot(Base, TimestampMixin):
    """Historical telemetry snapshot for monitored services and components."""

    __tablename__ = "service_health_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    service_name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), index=True, nullable=False)  # healthy, degraded, down
    response_latency_ms: Mapped[float] = mapped_column(Float, nullable=False)
    error_rate: Mapped[float] = mapped_column(Float, nullable=False)  # 0.0 - 1.0
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    details: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
