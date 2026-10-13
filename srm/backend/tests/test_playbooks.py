from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError
from app.models.incident import Incident
from app.models.playbook import RecoveryAction, RecoveryExecution, RecoveryPlaybook
from app.playbooks.adapters import (
    MockCircuitBreakerAdapter,
    MockPaymentGatewayAdapter,
    MockPaymentReconcilerAdapter,
)
from app.playbooks.engine import RecoveryEngine
from app.playbooks.registry import ActionRegistry
from app.synthetic.mocks import MockServiceRegistry


@pytest.fixture(autouse=True)
def reset_adapters():
    MockCircuitBreakerAdapter.reset()
    MockPaymentGatewayAdapter.reset()
    MockServiceRegistry._payment_idempotency_cache.clear()
    yield
    MockCircuitBreakerAdapter.reset()
    MockPaymentGatewayAdapter.reset()
    MockServiceRegistry._payment_idempotency_cache.clear()


def test_unsafe_action_rejection():
    """Safety Guard: Unallowlisted action types must be strictly rejected."""
    # Arbitrary shell execution attempt
    with pytest.raises(BadRequestError) as exc_info:
        ActionRegistry.validate_action("execute_shell_command", {"command": "rm -rf /"})
    assert "not recognized in the allowlisted action registry" in str(exc_info.value)

    # Arbitrary SQL execution attempt
    with pytest.raises(BadRequestError) as exc_info:
        ActionRegistry.validate_action("run_raw_sql", {"sql": "DROP TABLE incidents;"})
    assert "not recognized in the allowlisted action registry" in str(exc_info.value)

    # Disallowed extra parameters on legitimate action
    with pytest.raises(BadRequestError) as exc_info:
        ActionRegistry.validate_action(
            "check_dependency_health",
            {"service_name": "auth-service", "malicious_injected_param": True},
        )
    assert "disallowed parameter" in str(exc_info.value)


def test_draft_playbook_cannot_execute(db_session: Session):
    """Enforce: Draft playbooks cannot execute in live mode."""
    playbook = RecoveryPlaybook(
        playbook_id="pb_draft_01",
        name="Draft Playbook",
        description="Unapproved draft",
        applicable_services=["auth-service"],
        applicable_journeys=[],
        trigger_conditions={},
        recovery_strategy="circuit_break",
        approval_status="draft",  # NOT APPROVED
        is_enabled=False,
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.commit()

    engine = RecoveryEngine(db_session)
    execution = engine.execute_playbook(playbook, is_simulation=False)

    assert execution.status == "rejected_unapproved"
    assert execution.manual_intervention_required is True
    assert "has not been approved" in execution.failure_details


def test_disabled_playbook_cannot_execute(db_session: Session):
    """Enforce: Approved but disabled playbooks cannot execute."""
    playbook = RecoveryPlaybook(
        playbook_id="pb_disabled_01",
        name="Disabled Playbook",
        description="Approved but disabled",
        applicable_services=["auth-service"],
        applicable_journeys=[],
        trigger_conditions={},
        recovery_strategy="circuit_break",
        approval_status="approved",
        is_enabled=False,  # DISABLED
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.commit()

    engine = RecoveryEngine(db_session)
    execution = engine.execute_playbook(playbook, is_simulation=False)

    assert execution.status == "rejected_unapproved"
    assert "is disabled" in execution.failure_details


def test_high_risk_action_requires_approval(db_session: Session):
    """Enforce: High-risk actions require human approval before execution."""
    playbook = RecoveryPlaybook(
        playbook_id="pb_high_risk_01",
        name="High Risk Payment Switch",
        description="Switches gateway on failure",
        applicable_services=["primary-payment-gateway"],
        applicable_journeys=[],
        trigger_conditions={},
        recovery_strategy="failover",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.flush()

    action = RecoveryAction(
        playbook_id=playbook.id,
        action_order=1,
        action_type="switch_payment_gateway",
        parameters={
            "source_gateway": "primary-payment-gateway",
            "target_gateway": "secondary-payment-gateway",
            "reason": "Primary timeout spike",
        },
        risk_level="high",
        preconditions={},
        expected_outcome="Switches traffic",
        timeout_seconds=30,
        requires_approval=True,  # Requires operator sign-off!
    )
    db_session.add(action)
    db_session.commit()

    engine = RecoveryEngine(db_session)
    # Execute without operator override
    execution = engine.execute_playbook(playbook, is_simulation=False, operator_override=False)

    assert execution.status == "escalated"
    assert execution.manual_intervention_required is True
    assert "requires explicit human approval" in execution.failure_details
    assert MockPaymentGatewayAdapter.get_active_gateway() == "primary-payment-gateway"


def test_cooldown_period_skips_rapid_execution(db_session: Session):
    """Enforce: Cooldown periods prevent rapid execution loops."""
    playbook = RecoveryPlaybook(
        playbook_id="pb_cooldown_01",
        name="Safe Cooldown Playbook",
        description="Has 300s cooldown",
        applicable_services=["auth-service"],
        applicable_journeys=[],
        trigger_conditions={},
        recovery_strategy="circuit_break",
        approval_status="approved",
        is_enabled=True,
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.flush()

    action = RecoveryAction(
        playbook_id=playbook.id,
        action_order=1,
        action_type="idempotent_health_check",
        parameters={"service_name": "auth-service"},
        risk_level="low",
        preconditions={},
        expected_outcome="Ping health",
        timeout_seconds=30,
        requires_approval=False,
    )
    db_session.add(action)

    incident = Incident(
        incident_id="inc_cd_001",
        title="Auth Latency",
        description="Auth delay",
        incident_type="latency_spike",
        severity="medium",
        service_name="auth-service",
        failure_category="auth_5xx",
        status="open",
        is_demo=True,
    )
    db_session.add(incident)
    db_session.commit()

    engine = RecoveryEngine(db_session)

    # First run succeeds
    first_exec = engine.execute_playbook(playbook, incident=incident, is_simulation=False)
    assert first_exec.status == "succeeded"

    # Second immediate run is blocked by cooldown
    second_exec = engine.execute_playbook(playbook, incident=incident, is_simulation=False)
    assert second_exec.status == "cooldown_skipped"
    assert "cooldown period active" in second_exec.failure_details


def test_retry_limits_escalates_to_manual(db_session: Session):
    """Enforce: Maximum attempts bound automated retries and escalate to manual intervention."""
    playbook = RecoveryPlaybook(
        playbook_id="pb_retries_01",
        name="Bounded Retry Playbook",
        description="Max 2 attempts",
        applicable_services=["cart-service"],
        applicable_journeys=[],
        trigger_conditions={},
        recovery_strategy="circuit_break",
        approval_status="approved",
        is_enabled=True,
        max_attempts=2,  # Limit is 2
        cooldown_seconds=0,  # 0s cooldown to test attempts limit directly
        verification_conditions={},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.flush()

    action = RecoveryAction(
        playbook_id=playbook.id,
        action_order=1,
        action_type="idempotent_health_check",
        parameters={"service_name": "cart-service"},
        risk_level="low",
        preconditions={},
        expected_outcome="Ping cart",
        timeout_seconds=30,
        requires_approval=False,
    )
    db_session.add(action)

    incident = Incident(
        incident_id="inc_limit_001",
        title="Cart issue",
        description="Cart unresponsive",
        incident_type="service_degradation",
        severity="high",
        service_name="cart-service",
        failure_category="dependency_unhealthy",
        status="open",
        is_demo=True,
    )
    db_session.add(incident)
    db_session.commit()

    engine = RecoveryEngine(db_session)

    # Attempt 1
    exec1 = engine.execute_playbook(playbook, incident=incident)
    assert exec1.status == "succeeded"

    # Attempt 2
    exec2 = engine.execute_playbook(playbook, incident=incident)
    assert exec2.status == "succeeded"

    # Attempt 3: Exceeds max_attempts=2!
    exec3 = engine.execute_playbook(playbook, incident=incident)
    assert exec3.status == "escalated"
    assert exec3.manual_intervention_required is True
    assert "Maximum recovery attempts exceeded" in exec3.failure_details


def test_payment_safety_reconciliation_prevents_double_charge(db_session: Session):
    """PAYMENT SAFETY RULE:

    Reconcile the payment before retrying.
    Do not issue a second charge when the transaction was already captured!
    """
    idem_key = "idem_safe_99812"

    # Simulate captured payment on mock provider
    MockServiceRegistry._payment_idempotency_cache[idem_key] = {
        "success": True,
        "status": "success",
        "response_data": {"transaction_id": "txn_prev_999", "amount": 199.99},
    }

    # Reconcile
    rec = MockPaymentReconcilerAdapter.reconcile_transaction(idem_key)
    assert rec["reconciliation_status"] == "CAPTURED"
    assert rec["is_captured"] is True
    assert rec["can_safely_retry"] is False  # Second charge prevented!
    assert "Double charge prevented" in rec["reason"]


def test_payment_safety_indeterminate_timeout_halts_automated_retries(db_session: Session):
    """PAYMENT SAFETY RULE:

    A payment timeout does not prove payment failed.
    If state is indeterminate, automated retry is prohibited.
    """
    idem_key = "idem_timeout_3311"

    # Simulate timeout on provider
    MockServiceRegistry._payment_idempotency_cache[idem_key] = {
        "success": False,
        "status": "timed_out",
        "error_code": "PRIMARY_GATEWAY_TIMEOUT",
    }

    rec = MockPaymentReconcilerAdapter.reconcile_transaction(idem_key)
    assert rec["reconciliation_status"] == "INDETERMINATE_TIMEOUT"
    assert rec["can_safely_retry"] is False  # Blind retry forbidden!

    # Now verify playbook with reconciliation stops and escalates
    playbook = RecoveryPlaybook(
        playbook_id="pb_pay_timeout_01",
        name="Payment Timeout Recovery",
        description="Reconciles payment",
        applicable_services=["primary-payment-gateway"],
        applicable_journeys=[],
        trigger_conditions={},
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

    action = RecoveryAction(
        playbook_id=playbook.id,
        action_order=1,
        action_type="reconcile_payment_status",
        parameters={"idempotency_key": idem_key},
        risk_level="medium",
        preconditions={},
        expected_outcome="Check status",
        timeout_seconds=30,
        requires_approval=False,
    )
    db_session.add(action)
    db_session.commit()

    engine = RecoveryEngine(db_session)
    execution = engine.execute_playbook(playbook, is_simulation=False, idempotency_key=idem_key)

    assert execution.status == "escalated"
    assert execution.manual_intervention_required is True
    assert "INDETERMINATE_TIMEOUT" in execution.failure_details


def test_simulation_mode_does_not_mutate_state(db_session: Session):
    """Test: Simulation mode runs dry-run without mutating circuit breakers or live routing."""
    playbook = RecoveryPlaybook(
        playbook_id="pb_sim_01",
        name="Simulation Test Playbook",
        description="Toggles circuit breaker in dry-run",
        applicable_services=["search-service"],
        applicable_journeys=[],
        trigger_conditions={},
        recovery_strategy="circuit_break",
        approval_status="draft",  # Can test simulation even in draft!
        is_enabled=False,
        max_attempts=3,
        cooldown_seconds=300,
        verification_conditions={},
        rollback_instructions={},
    )
    db_session.add(playbook)
    db_session.flush()

    action = RecoveryAction(
        playbook_id=playbook.id,
        action_order=1,
        action_type="circuit_breaker_toggle",
        parameters={
            "service_name": "search-service",
            "target_state": "open",
            "reason": "Slow query isolation",
        },
        risk_level="medium",
        preconditions={},
        expected_outcome="Open circuit",
        timeout_seconds=30,
        requires_approval=False,
    )
    db_session.add(action)
    db_session.commit()

    engine = RecoveryEngine(db_session)
    execution = engine.execute_playbook(playbook, is_simulation=True)

    assert execution.status == "simulated"
    assert execution.is_simulation is True
    # Verify circuit breaker was NOT actually mutated
    assert MockCircuitBreakerAdapter.get_state("search-service") == "closed"
