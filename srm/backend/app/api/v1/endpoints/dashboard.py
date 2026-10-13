from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimiter
from app.core.security import UserRole, require_role
from app.db.session import get_db
from app.schemas.dashboard import (
    CountermeasureAnalyticsResponse,
    HistoricalIncidentDetailResponse,
    IncidentAnalyticsResponse,
    JourneyHealthDashboardResponse,
    OverviewKpisResponse,
    PaginatedHistoricalIncidentsResponse,
    PatternAnalyticsResponse,
    SeedDemoDataResponse,
    SharedAnalyticsResponse,
)
from app.services.dashboard_service import DashboardService

router = APIRouter()


@router.get("", response_model=OverviewKpisResponse, include_in_schema=False)
@router.get("/", response_model=OverviewKpisResponse, include_in_schema=False)
@router.get(
    "/overview",
    response_model=OverviewKpisResponse,
    summary="Overview KPIs",
    description=(
        "Retrieves high-level reliability metrics: total journey executions, success rate, "
        "active incidents, recognized failure patterns, recovery rate, median detection and recovery times."
    ),
)
def get_overview_kpis(
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    preset: Optional[str] = Query(None, description="Time range preset: '1h', '6h', '24h', '7d', '30d', 'all'"),
    window: Optional[str] = Query(None, description="Time range window alias: '1h', '6h', '24h', '7d', '30d'"),
    data_source: str = Query("all", pattern="^(all|live|demo)$", description="Data scope: 'all', 'live', or 'demo'"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> OverviewKpisResponse:
    service = DashboardService(db)
    return service.get_overview_kpis(
        start_time=start_time,
        end_time=end_time,
        preset=window or preset,
        data_source=data_source,
    )


@router.get(
    "/journey-health",
    response_model=JourneyHealthDashboardResponse,
    summary="Journey Health & Telemetry",
    description=(
        "Retrieves per-journey health status (healthy, degraded, failing), success rates, "
        "percentile latencies (p50, p90, p99), frequently failing steps, and service-health summaries."
    ),
)
def get_journey_health(
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    preset: Optional[str] = Query(None, description="Time range preset: '1h', '6h', '24h', '7d', '30d', 'all'"),
    data_source: str = Query("all", pattern="^(all|live|demo)$", description="Data scope: 'all', 'live', or 'demo'"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> JourneyHealthDashboardResponse:
    service = DashboardService(db)
    return service.get_journey_health(
        start_time=start_time,
        end_time=end_time,
        preset=preset,
        data_source=data_source,
    )


@router.get(
    "/incident-analytics",
    response_model=IncidentAnalyticsResponse,
    summary="Incident Analytics",
    description=(
        "Retrieves incident volume over time, breakdown by severity, failure category, affected service, "
        "and business journey, repeated failure clusters, top recognized patterns, and recovery outcomes."
    ),
)
def get_incident_analytics(
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    preset: Optional[str] = Query(None, description="Time range preset: '1h', '6h', '24h', '7d', '30d', 'all'"),
    data_source: str = Query("all", pattern="^(all|live|demo)$", description="Data scope: 'all', 'live', or 'demo'"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> IncidentAnalyticsResponse:
    service = DashboardService(db)
    return service.get_incident_analytics(
        start_time=start_time,
        end_time=end_time,
        preset=preset,
        data_source=data_source,
    )


@router.get(
    "/shared-analytics",
    response_model=SharedAnalyticsResponse,
    summary="Unified Cross-Module Shared Analytics",
    description=(
        "Aggregates shared analytics across Transaction Monitoring, Brand Impersonation, and Website Threat Detection: "
        "incident counts by module, severity, patterns by module, countermeasures, mitigation outcomes, and false positives."
    ),
)
def get_shared_analytics(
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    preset: Optional[str] = Query(None, description="Time range preset: '1h', '6h', '24h', '7d', '30d', 'all'"),
    data_source: str = Query("all", pattern="^(all|live|demo)$", description="Data scope: 'all', 'live', or 'demo'"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> SharedAnalyticsResponse:
    service = DashboardService(db)
    return service.get_shared_analytics(
        start_time=start_time,
        end_time=end_time,
        preset=preset,
        data_source=data_source,
    )


@router.get(
    "/pattern-analytics",
    response_model=PatternAnalyticsResponse,
    summary="Pattern Analytics",
    description=(
        "Analyzes recognized recurring failure patterns, frequency over time, confidence distribution, "
        "and associated recovery countermeasures."
    ),
)
def get_pattern_analytics(
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    preset: Optional[str] = Query(None, description="Time range preset: '1h', '6h', '24h', '7d', '30d', 'all'"),
    data_source: str = Query("all", pattern="^(all|live|demo)$", description="Data scope: 'all', 'live', or 'demo'"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> PatternAnalyticsResponse:
    service = DashboardService(db)
    return service.get_pattern_analytics(
        start_time=start_time,
        end_time=end_time,
        preset=preset,
        data_source=data_source,
    )


@router.get(
    "/countermeasure-analytics",
    response_model=CountermeasureAnalyticsResponse,
    summary="Countermeasure Analytics",
    description=(
        "Aggregates recovery playbook preparedness (draft, pending, approved, disabled), recovery executions, "
        "success rates, blocked actions, manual intervention frequency, and average recovery duration."
    ),
)
def get_countermeasure_analytics(
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    preset: Optional[str] = Query(None, description="Time range preset: '1h', '6h', '24h', '7d', '30d', 'all'"),
    data_source: str = Query("all", pattern="^(all|live|demo)$", description="Data scope: 'all', 'live', or 'demo'"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> CountermeasureAnalyticsResponse:
    service = DashboardService(db)
    return service.get_countermeasure_analytics(
        start_time=start_time,
        end_time=end_time,
        preset=preset,
        data_source=data_source,
    )


@router.get(
    "/history/incidents",
    response_model=PaginatedHistoricalIncidentsResponse,
    summary="Searchable & Paginated Incident History",
    description=(
        "Queries historical incidents with filtering by time range, journey, service, severity, status, "
        "failure pattern, and recovery outcome. Supports free-text search."
    ),
)
def get_incident_history(
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    preset: Optional[str] = Query(None, description="Time range preset: '1h', '6h', '24h', '7d', '30d', 'all'"),
    journey_id: Optional[int] = Query(None, description="Filter by business journey ID"),
    service_name: Optional[str] = Query(None, description="Filter by service name"),
    severity: Optional[str] = Query(None, description="Filter by severity (critical, high, medium, low)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (open, investigating, resolved, etc.)"),
    pattern_id: Optional[str] = Query(None, description="Filter by recognized failure pattern ID or name"),
    recovery_outcome: Optional[str] = Query(None, description="Filter by recovery status outcome"),
    q: Optional[str] = Query(None, description="Free text search term"),
    data_source: str = Query("all", pattern="^(all|live|demo)$", description="Data scope: 'all', 'live', or 'demo'"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("detected_at", description="Sort field ('detected_at', 'severity', 'status')"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort order"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> PaginatedHistoricalIncidentsResponse:
    service = DashboardService(db)
    return service.get_incident_history(
        start_time=start_time,
        end_time=end_time,
        preset=preset,
        journey_id=journey_id,
        service_name=service_name,
        severity=severity,
        status_filter=status_filter,
        pattern_id=pattern_id,
        recovery_outcome=recovery_outcome,
        query_str=q,
        data_source=data_source,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get(
    "/history/incidents/{incident_id}",
    response_model=HistoricalIncidentDetailResponse,
    summary="Incident Details & Step Execution History",
    description=(
        "Retrieves a complete historical incident record with step-by-step synthetic execution telemetry, "
        "pattern matches, recovery executions with verification evidence, and audit events."
    ),
)
def get_historical_incident_detail(
    incident_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
) -> HistoricalIncidentDetailResponse:
    service = DashboardService(db)
    return service.get_historical_incident_detail(incident_id)


@router.get(
    "/history/export/incidents.csv",
    summary="Export Sanitized Records to CSV",
    description=(
        "Exports historical incident records matching active filters to a sanitized CSV file. "
        "Credentials, tokens, and payment card details are strictly redacted."
    ),
)
def export_incidents_csv(
    start_time: Optional[datetime] = Query(None, description="Start timestamp in UTC"),
    end_time: Optional[datetime] = Query(None, description="End timestamp in UTC"),
    preset: Optional[str] = Query(None, description="Time range preset: '1h', '6h', '24h', '7d', '30d', 'all'"),
    journey_id: Optional[int] = Query(None, description="Filter by business journey ID"),
    service_name: Optional[str] = Query(None, description="Filter by service name"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    pattern_id: Optional[str] = Query(None, description="Filter by pattern"),
    recovery_outcome: Optional[str] = Query(None, description="Filter by recovery outcome"),
    q: Optional[str] = Query(None, description="Free text search term"),
    data_source: str = Query("all", pattern="^(all|live|demo)$", description="Data scope"),
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.VIEWER)),
):
    service = DashboardService(db)
    csv_content = service.export_incidents_csv(
        start_time=start_time,
        end_time=end_time,
        preset=preset,
        journey_id=journey_id,
        service_name=service_name,
        severity=severity,
        status_filter=status_filter,
        pattern_id=pattern_id,
        recovery_outcome=recovery_outcome,
        query_str=q,
        data_source=data_source,
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=reliability_incidents_export.csv",
        },
    )


@router.post(
    "/seed-demo-data",
    response_model=SeedDemoDataResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Seed Demonstration Data",
    description=(
        "Populates clearly identifiable synthetic records for local demonstration and testing. "
        "Strictly prohibited in production environments. Requires ADMIN role."
    ),
)
def seed_demo_data(
    db: Session = Depends(get_db),
    _user=Depends(require_role(UserRole.ADMIN)),
    _rate_limit: None = Depends(RateLimiter()),
) -> SeedDemoDataResponse:
    service = DashboardService(db)
    return service.seed_demo_dashboard_data()
