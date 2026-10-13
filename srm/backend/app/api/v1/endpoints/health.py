from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.health import HealthResponse
from app.services.health import HealthService

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System and Database Health Check",
    description="Reports the operational status of the backend API service and the PostgreSQL database connectivity.",
    responses={
        200: {"description": "All systems operational and database reachable"},
        503: {"description": "Database connectivity degraded or unreachable"},
    },
)
def get_health(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> HealthResponse:
    """Retrieve operational status for the API and backing datastore."""
    request_id = getattr(request.state, "request_id", None)
    health = HealthService.get_system_health(db=db, request_id=request_id)

    if health.status != "healthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return health
