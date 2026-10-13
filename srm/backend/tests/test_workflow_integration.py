from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.incident import Incident
from app.models.pattern import FailurePattern
from app.models.playbook import RecoveryAction, RecoveryPlaybook
from app.orchestrator.notifications import MockEmailAdapter, MockSlackAdapter
from app.orchestrator.service import OrchestrationState, RecoveryOrchestrator
from app.playbooks.adapters import MockCircuitBreakerAdapter, MockPaymentGatewayAdapter
from app.synthetic.mocks import MockServiceRegistry


@pytest.fixture(autouse=True)
def reset_all_mock_state():
    MockCircuitBreakerAdapter.reset()
    MockPaymentGatewayAdapter.reset()
    MockSlackAdapter.reset()
    MockEmailAdapter.reset()
    MockServiceRegistry._payment_idempotency_cache.clear()
    yield
    MockCircuitBreakerAdapter.reset()
    MockPaymentGatewayAdapter.reset()
    MockSlackAdapter.reset()
    MockEmailAdapter.reset()
    MockServiceRegistry._payment_idempotency_cache.clear()


def test_complete_successful_workflow_known_pattern_recovery(db_session: Session):
    """Workflow: DETECTED -> INVESTIGATING -> PATTERN_MATCHED -> RECOVERY_ELIGIBLE -> RECOVERING -> VERIFYING -> RESOLVED."""
    # 1. Create a confirmed failure pattern
    pattern = FailurePattern(
        pattern_id="pat_auth_recurring",
        name="Recurring Auth 5xx Crash",
        description="Repeated token server failures",
        failure_category="auth_5xx",
        service_name="auth-service",
        severity="high",
        affected_services=["auth-service"],
        affected_steps=["authenticate_user"],
        detection_rules={
            "canonical_features": {
                "service_name": "auth-service",
                "failure_category": "auth_5xx",
                "failed_step": "authenticate_user",
                "http_status_class": "5xx_server_error",
            }
        },
        incident_count=5,
        confidence_score=0.88,
        example_incident_ids=["inc_seed_1", "inc_seed_2"],
        status="confirmed",
    )
    db_session.add(pattern)
    db_session.flush()

    # 2. Create an approved and enabled recovery playbook associated with the pattern
    playbook = RecoveryPlaybook(
        playbook_id="pb_auth_auto_isolate",
        name="Automated Auth Isolation Playbook",
        description="Opens circuit breaker and sends notification",
        pattern_id=pattern.id,
        pattern_ref=pattern.pattern_id,
        applicable_services=["auth-service"],
        applicable_journeys=[],
        trigger_conditions={"service_name": "auth-service", "failure_category": "auth_5xx"},
        recovery_strategy="circuit_break",
        approval_status="approved",  # APPROVED
        is_enabled=True,  # ENABLED
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={"health_status": "healthy"},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.flush()

    # Add allowlisted actions
    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=1,
            action_type="circuit_breaker_toggle",
            parameters={"service_name": "auth-service", "target_state": "open", "reason": "Isolate auth failure"},
            risk_level="medium",
            preconditions={},
            expected_outcome="Circuit open",
            timeout_seconds=15,
            requires_approval=False,
        )
    )
    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=2,
            action_type="send_notification",
            parameters={"channel": "slack_webhook_dev", "message": "Circuit breaker opened"},
            risk_level="low",
            preconditions={},
            expected_outcome="Alert sent",
            timeout_seconds=10,
            requires_approval=False,
        )
    )

    # 3. Create incident
    incident = Incident(
        incident_id="inc_auth_workflow_01",
        title="Auth 500 Server Error",
        description="Auth service 500 error in checkout",
        incident_type="transaction_failure",
        severity="high",
        service_name="auth-service",
        failure_category="auth_5xx",
        status="open",
        recovery_status="not_started",
        is_demo=True,
    )
    db_session.add(incident)
    db_session.commit()

    # 4. Run Orchestrator
    orchestrator = RecoveryOrchestrator(db_session)
    result = orchestrator.orchestrate_incident(incident, auto_recover=True)

    # 5. Verify states & resolutions
    assert result["current_state"] == OrchestrationState.RESOLVED
    assert incident.recovery_status == OrchestrationState.RESOLVED
    assert incident.status == "resolved"
    assert incident.resolved_at is not None

    # Check notification dispatches
    slack_msgs = MockSlackAdapter.get_messages()
    assert len(slack_msgs) >= 1
    assert any("ops-recovery" in m["channel"] for m in slack_msgs)

    emails = MockEmailAdapter.get_emails()
    assert len(emails) >= 1
    assert any("RESOLVED" in e["subject"] for e in emails)

    # Verify audit timeline
    events = [e.event_type for e in incident.events]
    assert "incident_detected" in events
    assert "investigation_started" in events
    assert "pattern_matched" in events
    assert "playbook_associated" in events
    assert "recovery_started" in events
    assert "recovery_resolved" in events


def test_unknown_pattern_escalates_to_human(db_session: Session):
    """Workflow: Isolated / unknown failure directly escalates to human operator."""
    incident = Incident(
        incident_id="inc_isolated_9918",
        title="One-off database glitch",
        description="Unrelated transient hiccup",
        incident_type="transaction_failure",
        severity="medium",
        service_name="unknown-custom-service",
        failure_category="custom_unseen_anomaly",
        status="open",
        recovery_status="not_started",
        is_demo=True,
    )
    db_session.add(incident)
    db_session.commit()

    orchestrator = RecoveryOrchestrator(db_session)
    result = orchestrator.orchestrate_incident(incident, auto_recover=True)

    assert result["current_state"] == OrchestrationState.ESCALATED
    assert incident.recovery_status == OrchestrationState.ESCALATED
    assert incident.status == "investigating"

    slack_msgs = MockSlackAdapter.get_messages()
    assert len(slack_msgs) >= 1
    assert any("ops-alerts" in m["channel"] for m in slack_msgs)

    events = [e.event_type for e in incident.events]
    assert "unknown_pattern_escalated" in events


def test_known_pattern_without_approved_playbook_escalates(db_session: Session):
    """Workflow: Pattern matched, but no approved playbook exists -> ESCALATED."""
    pattern = FailurePattern(
        pattern_id="pat_search_slow_unhandled",
        name="Search Latency Spike",
        description="Search slow",
        failure_category="search_slow",
        service_name="search-service",
        severity="medium",
        affected_services=["search-service"],
        affected_steps=["search_catalog"],
        detection_rules={"canonical_features": {"service_name": "search-service", "failure_category": "search_slow"}},
        incident_count=4,
        confidence_score=0.85,
        example_incident_ids=["inc_1", "inc_2"],
        status="confirmed",
    )
    db_session.add(pattern)
    db_session.flush()

    incident = Incident(
        incident_id="inc_search_workflow_02",
        title="Search query slow",
        description="Slow catalog search",
        incident_type="latency_spike",
        severity="medium",
        service_name="search-service",
        failure_category="search_slow",
        status="open",
        recovery_status="not_started",
        is_demo=True,
    )
    db_session.add(incident)
    db_session.commit()

    orchestrator = RecoveryOrchestrator(db_session)
    result = orchestrator.orchestrate_incident(incident, auto_recover=True)

    assert result["current_state"] == OrchestrationState.ESCALATED
    assert incident.recovery_status == OrchestrationState.ESCALATED
    events = [e.event_type for e in incident.events]
    assert "no_approved_playbook_escalated" in events


def test_payment_safety_indeterminate_outcome_awaits_reconciliation(db_session: Session):
    """PAYMENT SAFETY RULE:

    If payment status is uncertain/indeterminate, stop automated charge retries,
    set AWAITING_RECONCILIATION, and alert finance/ops.
    """
    idem_key = "idem_order_recon_9942"

    # Simulate timeout state on mock provider
    MockServiceRegistry._payment_idempotency_cache[idem_key] = {
        "success": False,
        "status": "timed_out",
        "error_code": "PRIMARY_GATEWAY_TIMEOUT",
    }

    # Pattern for payment timeout
    pattern = FailurePattern(
        pattern_id="pat_payment_timeout_rec",
        name="Primary Gateway Timeout Pattern",
        description="Repeated payment timeout",
        failure_category="payment_timeout",
        service_name="primary-payment-gateway",
        severity="critical",
        affected_services=["primary-payment-gateway"],
        affected_steps=["process_payment"],
        detection_rules={"canonical_features": {"service_name": "primary-payment-gateway", "failure_category": "payment_timeout"}},
        incident_count=5,
        confidence_score=0.90,
        example_incident_ids=["inc_pay_1", "inc_pay_2"],
        status="confirmed",
    )
    db_session.add(pattern)
    db_session.flush()

    # Playbook
    playbook = RecoveryPlaybook(
        playbook_id="pb_pay_reconcile",
        name="Payment Timeout Handler",
        description="Reconciles payment",
        pattern_id=pattern.id,
        pattern_ref=pattern.pattern_id,
        applicable_services=["primary-payment-gateway"],
        applicable_journeys=[],
        trigger_conditions={"service_name": "primary-payment-gateway", "failure_category": "payment_timeout"},
        recovery_strategy="reconcile_and_retry",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.flush()

    incident = Incident(
        incident_id="inc_pay_indeterminate_01",
        title="Payment Gateway Timeout",
        description="Timeout during credit card capture",
        incident_type="transaction_failure",
        severity="critical",
        service_name="primary-payment-gateway",
        failure_category="payment_timeout",
        status="open",
        recovery_status="not_started",
        is_demo=True,
    )
    db_session.add(incident)
    db_session.commit()

    orchestrator = RecoveryOrchestrator(db_session)
    result = orchestrator.orchestrate_incident(
        incident=incident,
        auto_recover=True,
        idempotency_key=idem_key,
    )

    assert result["current_state"] == OrchestrationState.AWAITING_RECONCILIATION
    assert incident.recovery_status == OrchestrationState.AWAITING_RECONCILIATION

    # Verify finance-ops was alerted
    slack_msgs = MockSlackAdapter.get_messages()
    assert any("finance-ops" in m["channel"] for m in slack_msgs)

    # Verify audit event
    events = [e.event_type for e in incident.events]
    assert "awaiting_reconciliation" in events


def test_repeated_incident_deduplication(db_session: Session):
    """Deduplication: Do not re-run automated recovery if it already succeeded."""
    pattern = FailurePattern(
        pattern_id="pat_auth_dedup",
        name="Auth Pattern Dedup",
        description="Auth",
        failure_category="auth_5xx",
        service_name="auth-service",
        severity="high",
        affected_services=["auth-service"],
        affected_steps=["authenticate_user"],
        detection_rules={"canonical_features": {"service_name": "auth-service", "failure_category": "auth_5xx"}},
        incident_count=3,
        confidence_score=0.80,
        example_incident_ids=["inc_1"],
        status="confirmed",
    )
    db_session.add(pattern)
    db_session.flush()

    playbook = RecoveryPlaybook(
        playbook_id="pb_auth_dedup",
        name="Auth Dedup Playbook",
        description="Dedup",
        pattern_id=pattern.id,
        pattern_ref=pattern.pattern_id,
        applicable_services=["auth-service"],
        applicable_journeys=[],
        trigger_conditions={"service_name": "auth-service"},
        recovery_strategy="circuit_break",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={"health_status": "healthy"},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.flush()

    db_session.add(
        RecoveryAction(
            playbook_id=playbook.id,
            action_order=1,
            action_type="idempotent_health_check",
            parameters={"service_name": "auth-service"},
            risk_level="low",
            preconditions={},
            expected_outcome="Ping",
            timeout_seconds=10,
            requires_approval=False,
        )
    )

    incident = Incident(
        incident_id="inc_dedup_01",
        title="Auth fail",
        description="Auth error",
        incident_type="transaction_failure",
        severity="high",
        service_name="auth-service",
        failure_category="auth_5xx",
        status="open",
        recovery_status="not_started",
        is_demo=True,
    )
    db_session.add(incident)
    db_session.commit()

    orchestrator = RecoveryOrchestrator(db_session)

    # First orchestration run -> RESOLVED
    res1 = orchestrator.orchestrate_incident(incident, auto_recover=True)
    assert res1["current_state"] == OrchestrationState.RESOLVED

    # Second orchestration run -> Deduplicated, doesn't duplicate execution records!
    res2 = orchestrator.orchestrate_incident(incident, auto_recover=True)
    events = [e.event_type for e in incident.events]
    assert "recovery_deduplicated" in events


def test_api_manual_retry_escalation_and_traceability(client: TestClient):
    """Test manual retry, manual escalation, and traceability REST endpoints."""
    # 1. Create an incident via synthetic simulation
    res = client.post("/api/v1/synthetic/simulate-failure", json={"scenario": "auth_5xx"})
    assert res.status_code == 200
    data = res.json()
    incident_id = data["incident"]["incident_id"]

    # 2. Get Traceability
    trace_res = client.get(f"/api/v1/incidents/{incident_id}/traceability")
    assert trace_res.status_code == 200
    trace_data = trace_res.json()
    assert trace_data["incident"]["incident_id"] == incident_id
    assert "timeline_events" in trace_data
    assert len(trace_data["timeline_events"]) >= 1

    # 3. Manual retry
    retry_res = client.post(
        f"/api/v1/incidents/{incident_id}/retry-recovery",
        json={"operator_override": True, "notes": "Operator retrying with override"},
    )
    assert retry_res.status_code == 200
    assert retry_res.json()["incident_id"] == incident_id

    # 4. Manual escalation
    esc_res = client.post(
        f"/api/v1/incidents/{incident_id}/escalate",
        json={"reason": "Customer SLA risk; escalate to Level 2 SRE", "notes": "Handover to team"},
    )
    assert esc_res.status_code == 200
    assert esc_res.json()["current_state"] == OrchestrationState.ESCALATED


def test_api_demonstrate_workflow_endpoint(client: TestClient):
    """Test the development mode demonstration workflow endpoint."""
    res = client.post(
        "/api/v1/synthetic/demonstrate-workflow",
        json={"scenario": "auth_5xx", "template_id": "retail_checkout", "auto_recover": True},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "failed"  # The synthetic journey step failed as planned
    assert data["incident"] is not None
    assert "recovery_orchestration" in data
