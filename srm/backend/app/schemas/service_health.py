from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.sanitizer import sanitize_data


class ServiceHealthSnapshotBase(BaseModel):
    service_name: str = Field(..., max_length=100, description="Service name")
    status: str = Field(..., max_length=30, description="Status: healthy, degraded, down")
    response_latency_ms: float = Field(..., ge=0, description="Average response latency in milliseconds")
    error_rate: float = Field(..., ge=0, le=1.0, description="Fractional error rate (0.0 to 1.0)")
    timestamp: datetime = Field(..., description="UTC timestamp of the telemetry observation")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Optional diagnostic details")
    is_demo: bool = Field(default=False, description="Flag indicating synthetic demonstration record")

    @field_validator("details", mode="before")
    @classmethod
    def sanitize_health_details(cls, v: Any) -> Any:
        return sanitize_data(v) if v is not None else None


class ServiceHealthSnapshotCreate(ServiceHealthSnapshotBase):
    pass


class ServiceHealthSnapshotResponse(ServiceHealthSnapshotBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
