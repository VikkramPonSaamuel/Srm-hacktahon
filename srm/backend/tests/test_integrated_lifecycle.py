import pytest
from datetime import datetime, timezone
from typing import Any, Dict
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError
from app.core.security import AuthenticatedUser, UserRole
from app.models.brand_protection import BrandProfile, DetectedImpersonation
from app.models.incident import Incident, IncidentEvent
from app.models.pattern import FailurePattern, PatternMatch
from app.models.playbook import RecoveryAction, RecoveryPlaybook
from app.patterns.detector import RuleBasedPatternDetector
from app.patterns.features import FeatureExtractor
from app.playbooks.adapters import MockBrandProtectionActionAdapter, MockWafActionAdapter
from app.playbooks.engine import RecoveryEngine
from app.playbooks.registry import ActionRegistry
from app.schemas.complaint import ComplaintCreateRequest
from app.schemas.incident import IncidentCreate, IncidentEventCreate, IncidentResponse
from app.services.complaint_service import ComplaintService
from app.services.dashboard_service import DashboardService
from app.services.incident_service import IncidentService


@pytest.fixture(autouse=True)
def clean_adapters():
    MockBrandProtectionActionAdapter.reset()
    MockWafActionAdapter.reset()
    yield
    MockBrandProtectionActionAdapter.reset()
    MockWafActionAdapter.reset()


# =====================================================================
# 1. Common Incident Classification Across Modules
# =====================================================================
def test_common_incident_classification_all_modules(db_session: Session) -> None:
    """Verifies that incidents from all 3 modules are classified with proper module

    identifiers while preserving all module-specific evidence and API compatibility.
    """
    now = datetime.now(timezone.utc)

    # Module 1: Transaction Reliability
    tx_inc = Incident(
        incident_id="inc_tx_class_01",
        title="Payment Gateway Timeout",
        description="Downstream timeout during checkout order completion",
        incident_type="transaction_failure",
        severity="high",
        service_name="payment_gateway",
        failure_category="payment_timeout",
        detected_at=now,
    )
    db_session.add(tx_inc)

    # Module 2: Website Security Threat
    sec_inc = Incident(
        incident_id="inc_sec_class_01",
        title="SQL Injection Probe Detected",
        description="Repeated SQL injection payload in query params",
        incident_type="security_threat",
        severity="critical",
        service_name="api_gateway",
        failure_category="threat_sqli_probe",
        detected_at=now,
    )
    db_session.add(sec_inc)

    # Module 3: Brand Impersonation
    brand_inc = Incident(
        incident_id="inc_brand_class_01",
        title="Phishing Domain Spoofing Brand",
        description="Spoofed login landing page targeting customer accounts",
        incident_type="brand_impersonation",
        severity="high",
        service_name="brand_protection",
        failure_category="impersonation_threat",
        detected_at=now,
    )
    db_session.add(brand_inc)
    db_session.commit()

    # Dynamic classification property check
    assert tx_inc.module == "transaction_reliability"
    assert sec_inc.module == "website_security"
    assert brand_inc.module == "brand_impersonation"

    # Schema serialization verification (backward-compatible API contract)
    tx_resp = IncidentResponse.model_validate(tx_inc)
    sec_resp = IncidentResponse.model_validate(sec_inc)
    brand_resp = IncidentResponse.model_validate(brand_inc)

    assert tx_resp.module == "transaction_reliability"
    assert tx_resp.incident_type == "transaction_failure"
    assert sec_resp.module == "website_security"
    assert sec_resp.failure_category == "threat_sqli_probe"
    assert brand_resp.module == "brand_impersonation"
    assert brand_resp.failure_category == "impersonation_threat"


# =====================================================================
# 2. Historical Pattern Correlation & Non-Merging Invariants
# =====================================================================
def test_historical_pattern_correlation_repeated_failures_per_module(db_session: Session) -> None:
    """Tests that the pattern engine correlates repeated incidents within each module."""
    detector = RuleBasedPatternDetector(db_session)
    now = datetime.now(timezone.utc)

    # 1. Two repeated website attacks on storefront
    sec_inc1 = Incident(
        incident_id="inc_sec_sqli_01",
        title="SQLi Attack 1",
        description="SQLi probe on catalog",
        incident_type="security_threat",
        severity="high",
        service_name="storefront",
        failure_category="threat_sqli_probe",
        detected_at=now,
    )
    db_session.add(sec_inc1)
    db_session.commit()
    p1 = detector.evaluate_incident(sec_inc1)
    assert p1 is None  # Isolated failure (count 1 < threshold 2)

    sec_inc2 = Incident(
        incident_id="inc_sec_sqli_02",
        title="SQLi Attack 2",
        description="Second SQLi probe on catalog",
        incident_type="security_threat",
        severity="high",
        service_name="storefront",
        failure_category="threat_sqli_probe",
        detected_at=now,
    )
    db_session.add(sec_inc2)
    db_session.commit()
    p2 = detector.evaluate_incident(sec_inc2)

    assert p2 is not None
    assert p2.module == "website_security"
    assert p2.incident_count >= 2
    assert "Sqli Probe Attack" in p2.name or "Threat Sqli Probe" in p2.name


def test_non_merging_of_incidents_sharing_only_brand_or_ip_or_timewindow(db_session: Session) -> None:
    """Historical similarity alone must NOT merge incidents merely because they

    share a brand name, IP address, or time window without matching threat indicators.
    """
    f_brand_a = {
        "module": "brand_impersonation",
        "service_name": "brand_protection",
        "failure_category": "domain_typosquatting",
        "suspicious_domain": "brand-security-alert.xyz",
        "brand_id": "brand_100",
    }
    # Second incident targets same brand_100, but is completely different category and domain
    f_brand_b = {
        "module": "brand_impersonation",
        "service_name": "brand_protection",
        "failure_category": "social_media_impersonation",
        "suspicious_domain": "totally-unrelated-domain.com",
        "brand_id": "brand_100",  # Same brand only!
    }

    score, reasons = FeatureExtractor.compute_similarity(f_brand_a, f_brand_b)
    # Merely sharing brand_id contributes 0.15 + service 0.05 = 0.20 (< 0.70 threshold)
    assert score < 0.70
    assert any("Targeting same brand reference" in r for r in reasons)

    # Two security incidents sharing only the same time window but different service and attack
    f_sec_a = {
        "module": "website_security",
        "service_name": "auth_service",
        "failure_category": "threat_brute_force",
        "threat_rule_id": "rule_brute_force",
    }
    f_sec_b = {
        "module": "website_security",
        "service_name": "catalog_api",
        "failure_category": "threat_sqli_probe",
        "threat_rule_id": "rule_sqli",
    }
    score_sec, _ = FeatureExtractor.compute_similarity(f_sec_a, f_sec_b)
    assert score_sec < 0.70


def test_cross_incident_correlation_shared_service_with_sufficient_evidence(db_session: Session) -> None:
    """Correlates related incidents affecting a shared service across security and transaction

    modules when sufficient cascading evidence exists, storing reasoning.
    """
    # Incident 1: High volumetric attack on storefront
    f_threat = {
        "module": "website_security",
        "service_name": "storefront",
        "failure_category": "threat_dos_surge",
        "dependency_health": "degraded",
        "journey_type": "checkout",
    }

    # Incident 2: Latency spike / transaction failures on storefront
    f_transaction = {
        "module": "transaction_reliability",
        "service_name": "storefront",
        "failure_category": "latency_spike",
        "dependency_health": "degraded",
        "journey_type": "checkout",
    }

    score, reasons = FeatureExtractor.compute_similarity(f_threat, f_transaction)
    # Shared service (0.40) + Shared journey (0.20) + Cascading impact (0.25) + Health (0.15) = 1.0
    assert score >= 0.70
    assert any("Correlated impact on shared service" in r for r in reasons)
    assert any("Security threat activity correlates with operational transaction degradation" in r for r in reasons)


# =====================================================================
# 3. Response Selection & Category Isolation
# =====================================================================
def test_response_selection_category_isolation(db_session: Session) -> None:
    """Verifies that actions are valid only for their applicable incident categories:

    - Payment actions cannot run against security incidents.
    - WAF security actions cannot run against transaction incidents.
    - Brand complaint creation cannot be triggered by unrelated incidents.
    """
    engine = RecoveryEngine(db_session)

    # 1. Transaction incident
    tx_incident = Incident(
        incident_id="inc_tx_test_01",
        title="Database Latency",
        description="Checkout database slowdown",
        incident_type="transaction_failure",
        severity="medium",
        service_name="storefront",
        failure_category="latency_spike",
    )
    db_session.add(tx_incident)

    # 2. Security incident
    sec_incident = Incident(
        incident_id="inc_sec_test_01",
        title="WAF Blocking Attack",
        description="Active attack on API gateway",
        incident_type="security_threat",
        severity="high",
        service_name="api_gateway",
        failure_category="threat_waf_block",
    )
    db_session.add(sec_incident)
    db_session.commit()

    # Create playbook with WAF security action
    sec_playbook = RecoveryPlaybook(
        playbook_id="pb_waf_block_rule",
        name="Block IP at WAF",
        description="WAF action",
        recovery_strategy="waf_rule",
        approval_status="approved",
        is_enabled=True,
    )
    db_session.add(sec_playbook)
    db_session.flush()

    db_session.add(
        RecoveryAction(
            playbook_id=sec_playbook.id,
            action_order=1,
            action_type="request_waf_rule_action",
            parameters={"waf_action": "block", "target": "198.51.100.14/32", "reason": "Attack mitigation"},
            risk_level="high",
            requires_approval=False,
            expected_outcome="WAF blocked attacker IP",
        )
    )
    db_session.commit()

    # Try running security playbook on transaction incident -> MUST BE PREVENTED
    res_tx = engine.execute_playbook(playbook=sec_playbook, incident=tx_incident)
    assert res_tx.status == "escalated"
    assert "Defensive action 'request_waf_rule_action'" in res_tx.failure_details
    assert "cannot run against transaction reliability incidents" in res_tx.failure_details

    # Create payment recovery playbook
    pay_playbook = RecoveryPlaybook(
        playbook_id="pb_switch_payment_gw",
        name="Switch Payment Gateway",
        description="Payment failover",
        recovery_strategy="payment_routing",
        approval_status="approved",
        is_enabled=True,
    )
    db_session.add(pay_playbook)
    db_session.flush()

    db_session.add(
        RecoveryAction(
            playbook_id=pay_playbook.id,
            action_order=1,
            action_type="switch_payment_gateway",
            parameters={"source_gateway": "primary", "target_gateway": "secondary", "reason": "Gateway outage"},
            risk_level="high",
            requires_approval=False,
            expected_outcome="Payment routed to secondary",
        )
    )
    db_session.commit()

    # Try running payment recovery on security threat -> MUST BE PREVENTED
    res_sec = engine.execute_playbook(playbook=pay_playbook, incident=sec_incident)
    assert res_sec.status == "escalated"
    assert "Operational action 'switch_payment_gateway'" in res_sec.failure_details
    assert "cannot be applied to website security incidents" in res_sec.failure_details

    # Try triggering brand complaint workflow on transaction incident -> MUST BE PREVENTED
    complaint_service = ComplaintService(db_session)
    user = AuthenticatedUser(user_id=1, username="brand_rep", role=UserRole.OPERATOR)
    with pytest.raises(BadRequestError) as exc_info:
        complaint_service.create_complaint_from_incident(
            req=ComplaintCreateRequest(incident_id=tx_incident.id, reporting_channel="icann_whois"),
            user=user,
        )
    assert "Brand complaints cannot be triggered by unrelated incidents" in str(exc_info.value)


# =====================================================================
# 4. Common Incident Timeline & Normalized Stages
# =====================================================================
def test_common_incident_timeline_lifecycle_milestones(db_session: Session) -> None:
    """Verifies that the unified incident lifecycle provides structured timeline milestones."""
    inc_service = IncidentService(db_session)
    now = datetime.now(timezone.utc)

    incident = Incident(
        incident_id="inc_unified_timeline_01",
        title="Automated Defense Lifecycle Demo",
        description="Demonstrating standard lifecycle stages",
        incident_type="security_threat",
        severity="high",
        service_name="api_gateway",
        failure_category="threat_brute_force",
        status="investigating",
        recovery_status="in_progress",
    )
    db_session.add(incident)
    db_session.commit()

    # Append events covering different lifecycle stages
    inc_service.add_event(
        identifier=incident.incident_id,
        data=IncidentEventCreate(event_type="threat_detected", timestamp=now, details={"rule": "brute_force"}),
    )
    inc_service.add_event(
        identifier=incident.incident_id,
        data=IncidentEventCreate(event_type="evidence_collected", timestamp=now, details={"failed_attempts": 25}),
    )
    inc_service.add_event(
        identifier=incident.incident_id,
        data=IncidentEventCreate(event_type="pattern_matched", timestamp=now, details={"pattern": "pat_brute_force"}),
    )
    inc_service.add_event(
        identifier=incident.incident_id,
        data=IncidentEventCreate(event_type="approval_granted", timestamp=now, details={"operator": "sec_ops"}),
    )
    inc_service.add_event(
        identifier=incident.incident_id,
        data=IncidentEventCreate(event_type="policy_applied", timestamp=now, details={"rate_limit_rpm": 10}),
    )
    inc_service.add_event(
        identifier=incident.incident_id,
        data=IncidentEventCreate(event_type="verification_completed", timestamp=now, details={"improved": True}),
    )
    inc_service.add_event(
        identifier=incident.incident_id,
        data=IncidentEventCreate(event_type="resolved", timestamp=now, details={"notes": "Threat neutralized"}),
    )

    lifecycle = inc_service.get_unified_lifecycle(incident.incident_id)

    assert lifecycle["incident_id"] == incident.incident_id
    assert lifecycle["module"] == "website_security"
    # Verify stages present in timeline
    assert "detection" in lifecycle["stages_reached"]
    assert "evidence_collection" in lifecycle["stages_reached"]
    assert "pattern_matching" in lifecycle["stages_reached"]
    assert "approval" in lifecycle["stages_reached"]
    assert "response_execution" in lifecycle["stages_reached"]
    assert "verification" in lifecycle["stages_reached"]
    assert "resolution" in lifecycle["stages_reached"]


# =====================================================================
# 5. Shared Analytics Across All 3 Modules
# =====================================================================
def test_shared_analytics_reporting(db_session: Session) -> None:
    """Verifies that shared analytics accurately aggregates counts by module,

    severity, patterns by module, countermeasures, and false positives.
    """
    dash_service = DashboardService(db_session)
    now = datetime.now(timezone.utc)

    # Seed an incident in each module
    db_session.add(
        Incident(
            incident_id="inc_sh_tx_01",
            title="TX Failure",
            description="Timeout",
            incident_type="transaction_failure",
            severity="medium",
            service_name="payment",
            failure_category="payment_timeout",
            detected_at=now,
        )
    )
    db_session.add(
        Incident(
            incident_id="inc_sh_sec_01",
            title="Sec Threat",
            description="Probe",
            incident_type="security_threat",
            severity="high",
            service_name="gateway",
            failure_category="threat_probing",
            detected_at=now,
        )
    )
    db_session.add(
        Incident(
            incident_id="inc_sh_brand_01",
            title="Brand Threat",
            description="Phishing",
            incident_type="brand_impersonation",
            severity="critical",
            service_name="brand_protection",
            failure_category="impersonation_threat",
            detected_at=now,
        )
    )

    # Seed a pattern in each module
    db_session.add(
        FailurePattern(
            pattern_id="pat_sh_tx",
            name="Tx Pattern",
            description="Tx",
            failure_category="payment_timeout",
            service_name="payment",
            severity="medium",
        )
    )
    db_session.add(
        FailurePattern(
            pattern_id="pat_sh_sec",
            name="Recurring WAF Attack on Gateway",
            description="Sec",
            failure_category="threat_probing",
            service_name="gateway",
            severity="high",
        )
    )
    db_session.add(
        FailurePattern(
            pattern_id="pat_sh_brand",
            name="Brand Impersonation Campaign",
            description="Brand",
            failure_category="impersonation_threat",
            service_name="brand_protection",
            severity="critical",
        )
    )
    db_session.commit()

    shared_analytics = dash_service.get_shared_analytics()

    # 1. Incident counts by module
    assert shared_analytics.incident_counts_by_module.get("transaction_reliability", 0) >= 1
    assert shared_analytics.incident_counts_by_module.get("website_security", 0) >= 1
    assert shared_analytics.incident_counts_by_module.get("brand_impersonation", 0) >= 1

    # 2. Known patterns by module
    assert shared_analytics.known_patterns_by_module.get("transaction_reliability", 0) >= 1
    assert shared_analytics.known_patterns_by_module.get("website_security", 0) >= 1
    assert shared_analytics.known_patterns_by_module.get("brand_impersonation", 0) >= 1

    # 3. Incident counts by severity
    assert shared_analytics.incident_counts_by_severity.get("medium", 0) >= 1
    assert shared_analytics.incident_counts_by_severity.get("high", 0) >= 1
    assert shared_analytics.incident_counts_by_severity.get("critical", 0) >= 1

    # 4. Countermeasures and outcomes structure
    assert "total_playbooks_prepared" in shared_analytics.countermeasures
    assert isinstance(shared_analytics.manual_intervention_rate, float)
    assert isinstance(shared_analytics.false_positive_outcomes, dict)
