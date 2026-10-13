from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class DatabaseHealth(BaseModel):
    status: str = Field(..., description="Database connectivity state ('connected' or 'disconnected')")
    latency_ms: Optional[float] = Field(default=None, description="Round-trip ping query latency in milliseconds")
    error: Optional[str] = Field(default=None, description="Error message if probe failed")


class HealthResponse(BaseModel):
    status: str = Field(..., description="Overall service operational status ('healthy' or 'degraded')")
    app_name: str = Field(..., description="Application display name")
    version: str = Field(..., description="Semantic version of the running service")
    environment: str = Field(..., description="Active runtime environment (e.g. development, production)")
    database: DatabaseHealth = Field(..., description="Database connectivity check results")
    timestamp: datetime = Field(..., description="UTC ISO timestamp of the health check evaluation")
    request_id: Optional[str] = Field(default=None, description="Correlation request ID")
