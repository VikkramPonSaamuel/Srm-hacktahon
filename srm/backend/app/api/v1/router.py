from fastapi import APIRouter

from app.api.v1.endpoints import (
    brand_protection,
    complaints,
    dashboard,
    executions,
    health,
    incidents,
    investigations,
    journeys,
    patterns,
    playbooks,
    service_health,
    synthetic,
    threat_detection,
)

api_v1_router = APIRouter()

api_v1_router.include_router(health.router, tags=["Health & Diagnostics"])
api_v1_router.include_router(threat_detection.router, prefix="/threat-detection", tags=["Website Threat Detection & Telemetry"])
api_v1_router.include_router(threat_detection.router, prefix="/security-events", tags=["Website Threat Detection & Telemetry"])
api_v1_router.include_router(brand_protection.router, prefix="/brands", tags=["Brand Protection & Official Assets"])
api_v1_router.include_router(brand_protection.router, prefix="/brand-protection", tags=["Brand Impersonation Detection Engine"])
api_v1_router.include_router(complaints.router, prefix="/complaints", tags=["Cyber Complaints & Takedown Management"])
api_v1_router.include_router(complaints.router, prefix="/brands/complaints", tags=["Cyber Complaints & Takedown Management"])
api_v1_router.include_router(journeys.router, prefix="/journeys", tags=["Business Journeys"])
api_v1_router.include_router(executions.router, prefix="/executions", tags=["Journey Executions"])
api_v1_router.include_router(incidents.router, prefix="/incidents", tags=["Incidents & Investigations"])
api_v1_router.include_router(patterns.router, prefix="/patterns", tags=["Failure Patterns & Detection"])
api_v1_router.include_router(playbooks.router, prefix="/playbooks", tags=["Recovery Playbooks & Engine"])
api_v1_router.include_router(service_health.router, prefix="/service-health", tags=["Service Health History"])
api_v1_router.include_router(synthetic.router, prefix="/synthetic", tags=["Synthetic Journey Monitoring & Engine"])
api_v1_router.include_router(dashboard.router, prefix="/dashboard", tags=["Reliability Dashboard & Historical Audits"])
api_v1_router.include_router(investigations.router, tags=["Incident Root-Cause Investigation & AI Diagnostics"])

# Frontend compatibility aliases
api_v1_router.include_router(service_health.router, prefix="/services/health", tags=["Service Health History"])
api_v1_router.include_router(service_health.router, prefix="/services", tags=["Service Health History"])
api_v1_router.include_router(playbooks.router, prefix="/recovery/playbooks", tags=["Recovery Playbooks & Engine"])
api_v1_router.include_router(playbooks.router, prefix="/recovery/executions", tags=["Recovery Playbooks & Engine"])
api_v1_router.include_router(playbooks.router, prefix="/recovery/approvals", tags=["Recovery Playbooks & Engine"])
api_v1_router.include_router(patterns.router, prefix="/intelligence/failure-patterns", tags=["Failure Patterns & Detection"])
api_v1_router.include_router(investigations.router, prefix="/intelligence", tags=["Incident Root-Cause Investigation & AI Diagnostics"])
api_v1_router.include_router(dashboard.router, prefix="/analytics/reliability", tags=["Reliability Dashboard & Historical Audits"])
api_v1_router.include_router(brand_protection.router, prefix="/intelligence/brand-protection", tags=["Brand Impersonation Detection Engine"])
api_v1_router.include_router(complaints.router, prefix="/intelligence/complaints", tags=["Cyber Complaints & Takedown Management"])
api_v1_router.include_router(threat_detection.router, prefix="/intelligence/threat-monitoring", tags=["Website Threat Detection & Telemetry"])

