from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field


class ErrorPayload(BaseModel):
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error description")
    details: Optional[Any] = Field(default=None, description="Detailed validation or error metadata")


class StandardErrorResponse(BaseModel):
    error: ErrorPayload
    request_id: Optional[str] = Field(default=None, description="Unique correlation request ID")
    timestamp: datetime = Field(..., description="UTC ISO timestamp of the error occurrence")
