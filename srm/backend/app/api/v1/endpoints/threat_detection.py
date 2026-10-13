from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimiter
from app.core.security import AuthenticatedUser, UserRole, get_current_user, require_role
from app.db.session import get_db
from app.schemas.pagination import PaginatedResponse
from app.schemas.threat_detection import (
    DetectedWebsiteThreatResponse,
    FalsePositiveReviewRequest,
    IngestResultResponse,
    SecurityEventBatchIngestRequest,
    SecurityEventIngestRequest,
    SecurityEventResponse,
    ThreatDetailResponse,
    ThreatRuleConfigResponse,
    ThreatRuleConfigUpdate,
)
from app.services.threat_detection_service import ThreatDetectionService

router = APIRouter()

# Rate limiters for security ingestion and sensitive configuration
_ingest_rate_limiter = RateLimiter(requests_limit=120, window_seconds=60)
_admin_rate_limiter = RateLimiter(requests_limit=30, window_seconds=60)


# ------------------------------------------------------------------
# Telemetry Ingestion Endpoints
# ------------------------------------------------------------------
@router.post(
    "/events/ingest",
    response_model=SecurityEventResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_ingest_rate_limiter)],
    summary="Ingest Authorized Security Event",
    description="Ingests a normalized security telemetry event, redacting sensitive parameters and evaluating baseline rules.",
)
def ingest_security_event(
    payload: SecurityEventIngestRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> SecurityEventResponse:
    service = ThreatDetectionService(db)
    event, _ = service.ingest_single_event(payload)
    return SecurityEventResponse.model_validate(event)


@router.post(
    "/events/batch",
    response_model=IngestResultResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_ingest_rate_limiter)],
    summary="Batch Ingest Security Events",
    description="Batch ingests multiple security events with spike deduplication and rate protection.",
)
def batch_ingest_security_events(
    payload: SecurityEventBatchIngestRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> IngestResultResponse:
    service = ThreatDetectionService(db)
    return service.ingest_batch(payload)


# ------------------------------------------------------------------
# Security Event Retrieval Endpoints
# ------------------------------------------------------------------
@router.get(
    "/events",
    response_model=PaginatedResponse[SecurityEventResponse],
    summary="List Security Telemetry Events",
    description="Retrieves filtered and paginated security telemetry records.",
)
def list_security_events(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service_name: Optional[str] = Query(None, description="Filter by service name"),
    endpoint: Optional[str] = Query(None, description="Filter by endpoint path"),
    source_integration: Optional[str] = Query(None, description="Filter by source integration"),
    event_category: Optional[str] = Query(None, description="Filter by category"),
    auth_outcome: Optional[str] = Query(None, description="Filter by auth outcome"),
    action_taken: Optional[str] = Query(None, description="Filter by action taken"),
    client_ip: Optional[str] = Query(None, description="Filter by client IP"),
    correlation_id: Optional[str] = Query(None, description="Filter by correlation ID"),
    start_date: Optional[datetime] = Query(None, description="Filter from timestamp"),
    end_date: Optional[datetime] = Query(None, description="Filter until timestamp"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> PaginatedResponse[SecurityEventResponse]:
    service = ThreatDetectionService(db)
    res = service.list_events(
        skip=skip,
        limit=limit,
        service_name=service_name,
        endpoint=endpoint,
        source_integration=source_integration,
        event_category=event_category,
        auth_outcome=auth_outcome,
        action_taken=action_taken,
        client_ip=client_ip,
        correlation_id=correlation_id,
        start_date=start_date,
        end_date=end_date,
    )
    return res


@router.get(
    "/events/{event_id}",
    response_model=SecurityEventResponse,
    summary="Get Security Event Details",
    description="Retrieves a specific normalized security event by identifier.",
)
def get_security_event(
    event_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> SecurityEventResponse:
    service = ThreatDetectionService(db)
    event = service.get_event(event_id)
    return SecurityEventResponse.model_validate(event)


# ------------------------------------------------------------------
# Detected Threats Endpoints
# ------------------------------------------------------------------
@router.get(
    "/threats",
    response_model=PaginatedResponse[DetectedWebsiteThreatResponse],
    summary="List Detected Website Threats",
    description="Retrieves detected threats with filtering by service, endpoint, category, severity, and status.",
)
def list_detected_threats(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    service_name: Optional[str] = Query(None, description="Filter by service name"),
    endpoint: Optional[str] = Query(None, description="Filter by endpoint path"),
    threat_category: Optional[str] = Query(None, description="Filter by threat category"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    status: Optional[str] = Query(None, description="Filter by status"),
    detection_rule_id: Optional[str] = Query(None, description="Filter by detection rule"),
    client_ip: Optional[str] = Query(None, description="Filter by client IP"),
    correlation_id: Optional[str] = Query(None, description="Filter by correlation ID"),
    start_date: Optional[datetime] = Query(None, description="Filter from timestamp"),
    end_date: Optional[datetime] = Query(None, description="Filter until timestamp"),
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> PaginatedResponse[DetectedWebsiteThreatResponse]:
    service = ThreatDetectionService(db)
    res = service.list_threats(
        skip=skip,
        limit=limit,
        service_name=service_name,
        endpoint=endpoint,
        threat_category=threat_category,
        severity=severity,
        status=status,
        detection_rule_id=detection_rule_id,
        client_ip=client_ip,
        correlation_id=correlation_id,
        start_date=start_date,
        end_date=end_date,
    )
    return res


@router.get(
    "/threats/{threat_id}",
    response_model=ThreatDetailResponse,
    summary="Get Detected Threat Details",
    description="Retrieves comprehensive threat details, supporting telemetry events, and historical correlations.",
)
def get_threat_details(
    threat_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> ThreatDetailResponse:
    service = ThreatDetectionService(db)
    threat, supporting_events = service.get_threat(threat_id)
    resp = ThreatDetailResponse.model_validate(threat)
    resp.supporting_events = [SecurityEventResponse.model_validate(e) for e in supporting_events]
    return resp


@router.post(
    "/threats/{threat_id}/false-positive",
    response_model=DetectedWebsiteThreatResponse,
    summary="Submit False-Positive Review",
    description="Adjudicates a detected threat as a false positive or dismissed anomaly with auditable reasoning.",
)
def review_false_positive(
    threat_id: str,
    payload: FalsePositiveReviewRequest,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.OPERATOR)),
) -> DetectedWebsiteThreatResponse:
    service = ThreatDetectionService(db)
    updated = service.review_false_positive(
        threat_id=threat_id,
        review_data=payload,
        reviewer_email=user.username,
    )
    return DetectedWebsiteThreatResponse.model_validate(updated)


# ------------------------------------------------------------------
# Detection Rules Administration Endpoints
# ------------------------------------------------------------------
@router.get(
    "/rules",
    response_model=List[ThreatRuleConfigResponse],
    summary="List Detection Rules",
    description="Retrieves all registered threat detection rules and their current configuration states.",
)
def list_detection_rules(
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> List[ThreatRuleConfigResponse]:
    service = ThreatDetectionService(db)
    rules = service.list_rules()
    return [ThreatRuleConfigResponse.model_validate(r) for r in rules]


@router.get(
    "/rules/{rule_id}",
    response_model=ThreatRuleConfigResponse,
    summary="Get Rule Configuration",
    description="Retrieves a specific detection rule configuration by identifier.",
)
def get_detection_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.VIEWER)),
) -> ThreatRuleConfigResponse:
    service = ThreatDetectionService(db)
    rule = service.get_rule(rule_id)
    return ThreatRuleConfigResponse.model_validate(rule)


@router.put(
    "/rules/{rule_id}",
    response_model=ThreatRuleConfigResponse,
    dependencies=[Depends(_admin_rate_limiter)],
    summary="Configure Detection Rule",
    description="Updates rule activation state, thresholds, time window, or parameters without requiring application downtime.",
)
def configure_detection_rule(
    rule_id: str,
    payload: ThreatRuleConfigUpdate,
    db: Session = Depends(get_db),
    user: AuthenticatedUser = Depends(require_role(UserRole.ADMIN)),
) -> ThreatRuleConfigResponse:
    service = ThreatDetectionService(db)
    updated = service.update_rule(rule_id, payload)
    return ThreatRuleConfigResponse.model_validate(updated)
