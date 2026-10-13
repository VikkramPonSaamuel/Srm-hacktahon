from typing import Any, Dict, List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimiter
from app.core.security import UserRole, require_role
from app.db.session import get_db
from app.investigations.service import InvestigationService
from app.schemas.investigation import (
    AnalyzeIncidentRequest,
    IncidentComparisonResponse,
    InvestigationResponse,
    PlaybookRecommendationsResponse,
)

router = APIRouter()


@router.post(
    "/incidents/{incident_id}/analyze",
    response_model=InvestigationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Request Incident Investigation",
    description=(
        "Collects multi-source telemetry evidence and performs root-cause analysis. "
        "Applies deterministic analysis for known error profiles and optional LLM assistance. "
        "All recommended playbooks are validated against backend approval and safety policies."
    ),
)
def analyze_incident(
    incident_id: str,
    payload: AnalyzeIncidentRequest = AnalyzeIncidentRequest(),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.OPERATOR)),
    _rate_limit: None = Depends(RateLimiter()),
) -> InvestigationResponse:
    service = InvestigationService(db)
    return service.analyze_incident(
        incident_id=incident_id,
        force_mode=payload.force_mode,
        notes=payload.notes,
    )


@router.get(
    "/incidents/{incident_id}/analyses",
    response_model=List[InvestigationResponse],
    summary="Retrieve Incident Analysis History",
    description="Retrieves all past root-cause analysis investigations conducted for this incident.",
)
def get_incident_analyses(
    incident_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> List[InvestigationResponse]:
    service = InvestigationService(db)
    return service.get_analysis_history(incident_id)


@router.get(
    "/investigations/{analysis_id}",
    response_model=InvestigationResponse,
    summary="Retrieve Investigation Details",
    description="Retrieves a specific investigation record by its unique analysis ID.",
)
def get_investigation_by_id(
    analysis_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> InvestigationResponse:
    service = InvestigationService(db)
    return service.get_analysis_by_id(analysis_id)


@router.get(
    "/investigations/{analysis_id}/evidence",
    summary="View Evidence References",
    description="Retrieves the structured evidence references, step telemetry, and health snapshots utilized in the diagnosis.",
)
def get_investigation_evidence(
    analysis_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> Dict[str, Any]:
    service = InvestigationService(db)
    return service.get_evidence_by_analysis_id(analysis_id)


@router.post(
    "/incidents/{incident_id}/compare",
    response_model=IncidentComparisonResponse,
    summary="Compare Incident with Historical Records",
    description="Compares the failure symptoms of this incident against past historical incidents to identify recurring patterns.",
)
def compare_incident(
    incident_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> IncidentComparisonResponse:
    service = InvestigationService(db)
    return service.compare_incident(incident_id)


@router.get(
    "/incidents/{incident_id}/recommendations",
    response_model=PlaybookRecommendationsResponse,
    summary="Retrieve Playbook Recommendations",
    description="Retrieves recommended recovery playbooks and verifies their execution eligibility against safety policies.",
)
def get_playbook_recommendations(
    incident_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> PlaybookRecommendationsResponse:
    service = InvestigationService(db)
    return service.get_playbook_recommendations(incident_id)
