from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.journey import (
    BusinessJourneyCreate,
    BusinessJourneyDetailResponse,
    BusinessJourneyResponse,
    BusinessJourneyToggle,
    BusinessJourneyUpdate,
    JourneyStepCreate,
    JourneyStepResponse,
    JourneyStepUpdate,
)
from app.schemas.pagination import PaginatedResponse
from app.services.journey_service import JourneyService

router = APIRouter()


@router.post(
    "",
    response_model=BusinessJourneyDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Business Journey",
    description="Registers a new business journey flow along with optional initial sequence steps.",
)
def create_journey(
    payload: BusinessJourneyCreate,
    db: Session = Depends(get_db),
) -> BusinessJourneyDetailResponse:
    service = JourneyService(db)
    return service.create_journey(payload)


@router.get(
    "",
    response_model=PaginatedResponse[BusinessJourneyResponse],
    summary="List Business Journeys",
    description="Retrieves a paginated list of business journeys with optional filtering by type, active state, and text search.",
)
def list_journeys(
    skip: int = Query(0, ge=0, description="Offset record index"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    journey_type: Optional[str] = Query(None, description="Filter by journey type"),
    is_enabled: Optional[bool] = Query(None, description="Filter by active status"),
    search: Optional[str] = Query(None, description="Search journey by name substring"),
    db: Session = Depends(get_db),
) -> PaginatedResponse[BusinessJourneyResponse]:
    service = JourneyService(db)
    return service.list_journeys(
        skip=skip,
        limit=limit,
        journey_type=journey_type,
        is_enabled=is_enabled,
        search=search,
    )


@router.get(
    "/{journey_id}",
    response_model=BusinessJourneyDetailResponse,
    summary="Get Business Journey by ID",
    description="Retrieves full configuration details and sequence steps for a business journey.",
)
def get_journey(
    journey_id: int,
    db: Session = Depends(get_db),
) -> BusinessJourneyDetailResponse:
    service = JourneyService(db)
    return service.get_journey(journey_id)


@router.put(
    "/{journey_id}",
    response_model=BusinessJourneyDetailResponse,
    summary="Update Business Journey",
    description="Modifies the configuration metadata of an existing business journey.",
)
def update_journey(
    journey_id: int,
    payload: BusinessJourneyUpdate,
    db: Session = Depends(get_db),
) -> BusinessJourneyDetailResponse:
    service = JourneyService(db)
    return service.update_journey(journey_id, payload)


@router.patch(
    "/{journey_id}/toggle",
    response_model=BusinessJourneyResponse,
    summary="Enable or Disable a Business Journey",
    description="Toggles the active monitoring state of a business journey without deleting its historical records.",
)
def toggle_journey(
    journey_id: int,
    payload: BusinessJourneyToggle,
    db: Session = Depends(get_db),
) -> BusinessJourneyResponse:
    service = JourneyService(db)
    return service.toggle_journey(journey_id, payload.is_enabled)


# ------------------------------------------------------------------------------
# Journey Steps Sub-resources
# ------------------------------------------------------------------------------


@router.post(
    "/{journey_id}/steps",
    response_model=JourneyStepResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add Step to Business Journey",
    description="Configures and appends a new execution step to an existing journey.",
)
def add_step(
    journey_id: int,
    payload: JourneyStepCreate,
    db: Session = Depends(get_db),
) -> JourneyStepResponse:
    service = JourneyService(db)
    return service.add_step(journey_id, payload)


@router.get(
    "/{journey_id}/steps",
    response_model=List[JourneyStepResponse],
    summary="List Steps in Business Journey",
    description="Retrieves all ordered sequence steps for a business journey.",
)
def list_steps(
    journey_id: int,
    db: Session = Depends(get_db),
) -> List[JourneyStepResponse]:
    service = JourneyService(db)
    return service.list_steps(journey_id)


@router.put(
    "/{journey_id}/steps/{step_id}",
    response_model=JourneyStepResponse,
    summary="Update Journey Step",
    description="Modifies order, timeout, service target, or requirement status of a journey step.",
)
def update_step(
    journey_id: int,
    step_id: int,
    payload: JourneyStepUpdate,
    db: Session = Depends(get_db),
) -> JourneyStepResponse:
    service = JourneyService(db)
    return service.update_step(journey_id, step_id, payload)


@router.delete(
    "/{journey_id}/steps/{step_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Journey Step",
    description="Removes a configured step from a journey.",
)
def delete_step(
    journey_id: int,
    step_id: int,
    db: Session = Depends(get_db),
) -> None:
    service = JourneyService(db)
    service.delete_step(journey_id, step_id)
