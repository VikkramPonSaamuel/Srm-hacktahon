from datetime import datetime, timedelta, timezone
from typing import Any, Dict
import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError
from app.models.incident import Incident
from app.models.pattern import FailurePattern
from app.models.playbook import RecoveryAction, RecoveryExecution, RecoveryPlaybook
from app.orchestrator.service import OrchestrationState, RecoveryOrchestrator
from app.playbooks.adapters import (
    MockEndpointMonitoringAdapter,
    MockRateLimitPolicyAdapter,
    MockSecurityNotificationAdapter,
    MockUpstreamMitigationAdapter,
    MockWafActionAdapter,
)
from app.playbooks.engine import RecoveryEngine
from app.playbooks.registry import ActionRegistry


@pytest.fixture(autouse=True)
def reset_security_adapters():
    MockWafActionAdapter.reset()
    MockRateLimitPolicyAdapter.reset()
    MockEndpointMonitoringAdapter.reset()
    MockSecurityNotificationAdapter.reset()
    MockUpstreamMitigationAdapter.reset()
    yield
    MockWafActionAdapter.reset()
    MockRateLimitPolicyAdapter.reset()
    MockEndpointMonitoringAdapter.reset()
    MockSecurityNotificationAdapter.reset()
    MockUpstreamMitigationAdapter.reset()


# =====================================================================
# 1. Action Validation and Safe Execution
# =====================================================================
def test_safe_security_action_execution() -> None:
    """Validate alert, monitoring, rate-limit, and auth-throttling actions execute safely."""
    # 1. raise_security_alert
    alert_res = ActionRegistry.execute_action(
        "raise_security_alert",
        {"alert_level": "high", "message": "SQL Injection attempt detected on /api/v1/checkout", "service_name": "checkout_api"},
    )
    assert alert_res["status"] == "succeeded"
    assert len(MockSecurityNotificationAdapter.get_alerts()) == 1

    # 2. increase_endpoint_monitoring
    mon_res = ActionRegistry.execute_action(
        "increase_endpoint_monitoring",
        {"endpoint": "/api/v1/login", "sampling_rate": 80, "duration_seconds": 600},
    )
    assert mon_res["status"] == "succeeded"
    assert "/api/v1/login" in MockEndpointMonitoringAdapter._active_monitoring

    # 3. request_rate_limit_policy
    rl_res = ActionRegistry.execute_action(
        "request_rate_limit_policy",
        {"endpoint": "/api/v1/search", "rate_limit_rpm": 60, "duration_seconds": 300, "client_ip": "198.51.100.5"},
    )
    assert rl_res["status"] == "succeeded"
    policies = MockRateLimitPolicyAdapter.get_active_policies()
    assert len(policies) == 1
    assert policies[0]["rate_limit_rpm"] == 60

    # 4. throttle_auth_failures
    throt_res = ActionRegistry.execute_action(
        "throttle_auth_failures",
        {"endpoint": "/auth/token", "throttle_delay_ms": 2000, "duration_seconds": 600},
    )
    assert throt_res["status"] == "succeeded"


def test_broad_cidr_block_rejection_safety() -> None:
    """Ensure safety guard strictly prevents blocking broad CIDR ranges to avoid disrupting legitimate users."""
    # /0 and /8 and broad wildcards must be rejected
    for bad_target in ["0.0.0.0/0", "::/0", "10.0.0.0/8", "192.168.0.0/16", "*"]:
        with pytest.raises(BadRequestError) as exc_info:
            ActionRegistry.validate_action(
                "request_waf_rule_action",
                {"waf_action": "block_ip", "target": bad_target, "reason": "Test broad block"},
            )
        assert "Broad CIDR range blocking is not permitted" in str(exc_info.value)

    # Valid single IP is permitted
    ActionRegistry.validate_action(
        "request_waf_rule_action",
        {"waf_action": "block_ip", "target": "198.51.100.45", "reason": "Targeted attack block"},
    )


# =====================================================================
# 2. High-Impact Action Approval Guard & Operator Override
# =====================================================================
def test_high_impact_action_blocked_without_human_approval(db_session: Session) -> None:
    """High-risk action (e.g. request_waf_rule_action) requires explicit human approval."""
    engine = RecoveryEngine(db_session)

    incident = Incident(
        incident_id="inc_sec_test_waf_01",
        title="Active SQL Injection Burst",
        description="High confidence SQL injection detected",
        incident_type="security_threat",
        severity="critical",
        service_name="payment_service",
        failure_category="threat_sqli",
        status="open",
        recovery_status="not_started",
    )
    db_session.add(incident)
    db_session.flush()

    playbook = RecoveryPlaybook(
        playbook_id="pb_sec_block_waf",
        name="Emergency WAF IP Block Playbook",
        description="Blocks malicious client IP at WAF level",
        recovery_strategy="waf_block",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
        trigger_conditions={"failure_category": "threat_sqli"},
    )
    db_session.add(playbook)
    db_session.flush()

    # High-risk action requiring approval
    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=1,
            action_type="request_waf_rule_action",
            parameters={"waf_action": "block_ip", "target": "203.0.113.88", "reason": "SQLi attack pattern"},
            risk_level="high",
            requires_approval=True,
            expected_outcome="IP blocked at WAF",
        )
    )
    db_session.commit()

    # Live execution without operator override must be blocked and escalate
    execution = engine.execute_playbook(
        playbook=playbook,
        incident=incident,
        is_simulation=False,
        operator_override=False,
    )
    assert execution.status == "escalated"
    assert execution.manual_intervention_required is True
    assert "requires explicit human approval" in execution.failure_details
    # WAF adapter must NOT have applied the rule without approval
    assert len(MockWafActionAdapter.get_active_rules()) == 0


def test_high_impact_action_executes_with_approval_override(db_session: Session) -> None:
    """When human approval / operator override is provided, high-risk action executes."""
    engine = RecoveryEngine(db_session)

    incident = Incident(
        incident_id="inc_sec_test_waf_02",
        title="Active SQL Injection Burst",
        description="High confidence SQL injection detected",
        incident_type="security_threat",
        severity="critical",
        service_name="payment_service",
        failure_category="threat_sqli",
        status="open",
        recovery_status="not_started",
    )
    db_session.add(incident)
    db_session.flush()

    playbook = RecoveryPlaybook(
        playbook_id="pb_sec_block_waf_approved",
        name="Approved Emergency WAF IP Block Playbook",
        description="Blocks malicious client IP at WAF level",
        recovery_strategy="waf_block",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
        trigger_conditions={"failure_category": "threat_sqli"},
    )
    db_session.add(playbook)
    db_session.flush()

    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=1,
            action_type="request_waf_rule_action",
            parameters={"waf_action": "block_ip", "target": "203.0.113.99", "reason": "SQLi confirmed"},
            risk_level="high",
            requires_approval=True,
            expected_outcome="IP blocked at WAF",
        )
    )
    db_session.commit()

    # Operator override simulates verified human approval
    execution = engine.execute_playbook(
        playbook=playbook,
        incident=incident,
        is_simulation=False,
        operator_override=True,
    )
    assert execution.status == "succeeded"
    assert len(MockWafActionAdapter.get_active_rules()) == 1
    assert MockWafActionAdapter.get_active_rules()[0]["target"] == "203.0.113.99"


# =====================================================================
# 3. Verification & Rollback Handling
# =====================================================================
def test_failed_mitigation_verification_triggers_rollback(db_session: Session) -> None:
    """When mitigation verification confirms failure/lack of improvement, rollback executes and escalates."""
    engine = RecoveryEngine(db_session)

    incident = Incident(
        incident_id="inc_sec_verif_fail_01",
        title="Persistent Credential Stuffing",
        description="Brute force login surge",
        incident_type="security_threat",
        severity="high",
        service_name="auth_service",
        failure_category="threat_brute_force",
        status="open",
        recovery_status="not_started",
    )
    db_session.add(incident)
    db_session.flush()

    playbook = RecoveryPlaybook(
        playbook_id="pb_sec_rollback_test",
        name="Rate Limit with Rollback on Ineffective Mitigation",
        description="Applies rate limit and verifies whether attack stops",
        recovery_strategy="rate_limit",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
        trigger_conditions={"failure_category": "threat_brute_force"},
        rollback_instructions={"actions": ["request_rate_limit_policy"]},
    )
    db_session.add(playbook)
    db_session.flush()

    # Action 1: apply rate limit
    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=1,
            action_type="request_rate_limit_policy",
            parameters={"endpoint": "/api/v1/login", "rate_limit_rpm": 30, "duration_seconds": 600},
            risk_level="medium",
            requires_approval=False,
            expected_outcome="Rate limit active",
        )
    )
    # Action 2: record verification failure (attack bypassed rate limit)
    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=2,
            action_type="record_mitigation_verification",
            parameters={
                "verification_status": "failed",
                "improved": False,
                "details": "Attacker rotated proxies; 401 surge continues unabated",
            },
            risk_level="low",
            requires_approval=False,
            expected_outcome="Verification recorded",
        )
    )
    db_session.commit()

    execution = engine.execute_playbook(playbook=playbook, incident=incident, is_simulation=False)

    # Status must fail because verification failed
    assert execution.status == "failed"
    assert execution.manual_intervention_required is True

    # Check rollback execution: rate-limit policy should have been rolled back
    assert len(MockRateLimitPolicyAdapter.get_active_policies()) == 0
    assert len(MockRateLimitPolicyAdapter._rollback_history) == 1

    # Check incident timeline records failure and rollback audit events
    events = [e.event_type for e in incident.events]
    assert "recovery_rollback_executed" in events
    assert "unsuccessful_mitigation_recorded" in events


def test_disabled_adapter_safely_stops_action(db_session: Session) -> None:
    """When an external adapter is disabled, automated actions halt safely and escalate."""
    engine = RecoveryEngine(db_session)

    # Disable WAF integration
    MockWafActionAdapter.set_enabled(False)

    incident = Incident(
        incident_id="inc_sec_adapter_off_01",
        title="DDoS surge",
        description="High volume probe",
        incident_type="security_threat",
        severity="high",
        service_name="web_api",
        failure_category="threat_dos",
        status="open",
        recovery_status="not_started",
    )
    db_session.add(incident)
    db_session.flush()

    playbook = RecoveryPlaybook(
        playbook_id="pb_sec_disabled_adapter",
        name="WAF Rule Test",
        description="Test disabled WAF",
        recovery_strategy="waf_block",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
    )
    db_session.add(playbook)
    db_session.flush()

    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=1,
            action_type="request_waf_rule_action",
            parameters={"waf_action": "challenge", "target": "198.51.100.77", "reason": "Challenge bot"},
            risk_level="high",
            requires_approval=True,
            expected_outcome="Challenged",
        )
    )
    db_session.commit()

    execution = engine.execute_playbook(
        playbook=playbook,
        incident=incident,
        operator_override=True,  # Approval granted, but adapter is disabled
    )
    assert execution.status == "failed"
    assert "disabled by security configuration" in execution.failure_details


# =====================================================================
# 4. Historical Pattern Integration with Security Preconditions
# =====================================================================
def test_historical_similarity_alone_does_not_authorize_defensive_action(db_session: Session) -> None:
    """If pattern match confidence is below 0.70, automated action is denied and escalates."""
    orchestrator = RecoveryOrchestrator(db_session)

    # Pattern with low confidence score (0.5 + 2*0.08 = 0.66 < 0.70 threshold after match)
    low_conf_pattern = FailurePattern(
        pattern_id="pat_low_conf_threat",
        name="Weak Threat Correlation",
        description="Suspected recurring scanning",
        failure_category="threat_probing",
        service_name="api_gateway",
        severity="medium",
        affected_services=["api_gateway"],
        detection_rules={"canonical_features": {"service_name": "api_gateway", "failure_category": "threat_probing"}},
        incident_count=1,
        confidence_score=0.55,  # Below 0.70 threshold!
        status="candidate",
    )
    db_session.add(low_conf_pattern)
    db_session.flush()

    incident = Incident(
        incident_id="inc_sec_weak_pattern_01",
        title="Probing anomaly",
        description="Probing path anomaly",
        incident_type="security_threat",
        severity="medium",
        service_name="api_gateway",
        failure_category="threat_probing",
        status="open",
        recovery_status="not_started",
    )
    db_session.add(incident)
    db_session.commit()

    res = orchestrator.orchestrate_incident(incident=incident)
    assert res["current_state"] == OrchestrationState.ESCALATED
    assert "Historical similarity alone cannot authorize" in incident.events[-1].details["message"]


def test_end_to_end_security_playbook_orchestration_success(db_session: Session) -> None:
    """Full workflow: Pattern Match (>= 0.70) -> Approved Playbook -> Rate-limit applied -> Verified -> Recovered."""
    orchestrator = RecoveryOrchestrator(db_session)

    # 1. Pattern with high confidence
    pattern = FailurePattern(
        pattern_id="pat_sec_rate_surge_confirmed",
        name="Confirmed Rate Abuse Pattern",
        description="High frequency scraping on product catalog",
        failure_category="threat_abnormal_rate",
        service_name="storefront",
        severity="medium",
        affected_services=["storefront"],
        detection_rules={"canonical_features": {"service_name": "storefront", "failure_category": "threat_abnormal_rate"}},
        incident_count=6,
        confidence_score=0.88,
        status="confirmed",
    )
    db_session.add(pattern)
    db_session.flush()

    # 2. Approved playbook associated with pattern
    playbook = RecoveryPlaybook(
        playbook_id="pb_sec_rate_throttle",
        name="Catalog Rate-Limiting Countermeasure",
        description="Applies temporary rate-limit and sends notification",
        pattern_id=pattern.id,
        pattern_ref=pattern.pattern_id,
        applicable_services=["storefront"],
        trigger_conditions={"failure_category": "threat_abnormal_rate"},
        recovery_strategy="rate_limit",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={"require_metric_improvement": False},
    )
    db_session.add(playbook)
    db_session.flush()

    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=1,
            action_type="request_rate_limit_policy",
            parameters={"endpoint": "/catalog/items", "rate_limit_rpm": 45, "duration_seconds": 300},
            risk_level="medium",
            requires_approval=False,
            expected_outcome="Rate limit active",
        )
    )
    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=2,
            action_type="raise_security_alert",
            parameters={"alert_level": "medium", "message": "Scraping surge contained on /catalog/items"},
            risk_level="low",
            requires_approval=False,
            expected_outcome="Alert posted",
        )
    )

    # 3. Security Incident
    incident = Incident(
        incident_id="inc_sec_rate_01",
        title="Catalog Abnormal Request Surge",
        description="Abnormal frequency on /catalog/items",
        incident_type="security_threat",
        severity="medium",
        service_name="storefront",
        failure_category="threat_abnormal_rate",
        status="open",
        recovery_status="not_started",
    )
    db_session.add(incident)
    db_session.commit()

    result = orchestrator.orchestrate_incident(incident=incident)
    assert result["current_state"] == OrchestrationState.RESOLVED
    assert incident.recovery_status == OrchestrationState.RESOLVED
    assert incident.status == "resolved"
    assert len(MockRateLimitPolicyAdapter.get_active_policies()) == 1
    assert len(MockSecurityNotificationAdapter.get_alerts()) == 1


def test_cooldown_skips_rapid_repeated_security_execution(db_session: Session) -> None:
    """Repeated execution attempts on same incident within cooldown window are skipped."""
    engine = RecoveryEngine(db_session)

    incident = Incident(
        incident_id="inc_sec_cooldown_01",
        title="Repeated probe",
        description="Probe surge",
        incident_type="security_threat",
        severity="low",
        service_name="web_api",
        failure_category="threat_probing",
        status="open",
        recovery_status="not_started",
    )
    db_session.add(incident)
    db_session.flush()

    playbook = RecoveryPlaybook(
        playbook_id="pb_sec_cooldown_test",
        name="Cooldown Test Playbook",
        description="Cooldown enforcement",
        recovery_strategy="rate_limit",
        approval_status="approved",
        is_enabled=True,
        max_attempts=5,
        cooldown_seconds=600,
    )
    db_session.add(playbook)
    db_session.flush()

    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=1,
            action_type="raise_security_alert",
            parameters={"alert_level": "low", "message": "Probe alert"},
            risk_level="low",
            requires_approval=False,
            expected_outcome="Alert logged",
        )
    )
    db_session.commit()

    # First execution succeeds
    exec1 = engine.execute_playbook(playbook=playbook, incident=incident)
    assert exec1.status == "succeeded"

    # Immediate second execution must be skipped by cooldown guard
    exec2 = engine.execute_playbook(playbook=playbook, incident=incident)
    assert exec2.status == "cooldown_skipped"
