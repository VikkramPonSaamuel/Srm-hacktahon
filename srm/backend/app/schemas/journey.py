from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class JourneyStepBase(BaseModel):
    step_name: str = Field(..., max_length=100, description="Name or identifier of the step")
    step_order: int = Field(..., ge=1, description="Sequential sequence order (1-indexed)")
    service_name: str = Field(..., max_length=100, description="Target service or microservice component")
    step_type: str = Field(default="api_call", max_length=50, description="Step type: api_call, db_query, auth, queue_event")
    timeout_ms: int = Field(default=5000, ge=100, le=120000, description="Timeout threshold in milliseconds")
    is_required: bool = Field(default=True, description="Whether failure of this step halts the journey")


class JourneyStepCreate(JourneyStepBase):
    pass


class JourneyStepUpdate(BaseModel):
    step_name: Optional[str] = Field(default=None, max_length=100)
    step_order: Optional[int] = Field(default=None, ge=1)
    service_name: Optional[str] = Field(default=None, max_length=100)
    step_type: Optional[str] = Field(default=None, max_length=50)
    timeout_ms: Optional[int] = Field(default=None, ge=100, le=120000)
    is_required: Optional[bool] = None


class JourneyStepResponse(JourneyStepBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    journey_id: int
    created_at: datetime
    updated_at: datetime


class BusinessJourneyBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100, description="Unique journey flow name")
    description: Optional[str] = Field(default=None, description="Detailed flow purpose and SLA notes")
    journey_type: str = Field(..., max_length=50, description="Categorization: checkout, transfer, payment, auth")
    is_enabled: bool = Field(default=True, description="Active status for synthetic monitoring")
    is_demo: bool = Field(default=False, description="Flag indicating sample demonstration data")


class BusinessJourneyCreate(BusinessJourneyBase):
    steps: Optional[List[JourneyStepCreate]] = Field(default=None, description="Optional initial steps to configure")


class BusinessJourneyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    description: Optional[str] = None
    journey_type: Optional[str] = Field(default=None, max_length=50)
    is_enabled: Optional[bool] = None


class BusinessJourneyToggle(BaseModel):
    is_enabled: bool = Field(..., description="Target active monitoring state")


class BusinessJourneyResponse(BusinessJourneyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    step_count: Optional[int] = Field(default=None, description="Number of steps configured in journey")


class BusinessJourneyDetailResponse(BusinessJourneyResponse):
    steps: List[JourneyStepResponse] = Field(default_factory=list, description="Ordered journey steps")
