"""Seed script for development environments.

Run via:
    python -m app.scripts.seed
    python -m app.scripts.seed --clean
"""

import argparse
from datetime import datetime, timedelta, timezone
import sys
from pathlib import Path

# Add backend directory to path
backend_path = Path(__file__).resolve().parent.parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from sqlalchemy import delete, select
import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.execution import JourneyExecution, StepExecution
from app.models.health import ServiceHealthSnapshot
from app.models.incident import Incident, IncidentEvent
from app.models.journey import BusinessJourney, JourneyStep
from app.models.playbook import RecoveryAction, RecoveryExecution, RecoveryPlaybook


def clean_demo_data(db) -> None:
    print("[INFO] Cleaning existing demo data...")
    # Clean in child-to-parent order to respect relationships
    demo_pb_ids = select(RecoveryPlaybook.id).where(RecoveryPlaybook.is_demo.is_(True))
    db.execute(delete(RecoveryExecution).where(RecoveryExecution.playbook_id.in_(demo_pb_ids)))
    db.execute(delete(RecoveryAction).where(RecoveryAction.playbook_id.in_(demo_pb_ids)))
    db.execute(delete(RecoveryPlaybook).where(RecoveryPlaybook.is_demo.is_(True)))

    demo_inc_ids = select(Incident.id).where(Incident.is_demo.is_(True))
    db.execute(delete(IncidentEvent).where(IncidentEvent.incident_id.in_(demo_inc_ids)))
    db.execute(delete(Incident).where(Incident.is_demo.is_(True)))

    demo_exec_ids = select(JourneyExecution.id).where(JourneyExecution.is_demo.is_(True))
    db.execute(delete(StepExecution).where(StepExecution.journey_execution_id.in_(demo_exec_ids)))
    db.execute(delete(JourneyExecution).where(JourneyExecution.is_demo.is_(True)))

    demo_journey_ids = select(BusinessJourney.id).where(BusinessJourney.is_demo.is_(True))
    db.execute(delete(JourneyStep).where(JourneyStep.journey_id.in_(demo_journey_ids)))
    db.execute(delete(BusinessJourney).where(BusinessJourney.is_demo.is_(True)))
    db.execute(delete(ServiceHealthSnapshot).where(ServiceHealthSnapshot.is_demo.is_(True)))
    db.commit()
    print("[INFO] Cleaned existing demo data.")


def seed_demo_data(clean: bool = False, create_tables: bool = True) -> None:
    if create_tables:
        Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if clean:
            clean_demo_data(db)

        # Check if demo data already seeded to ensure idempotency
        existing = db.query(BusinessJourney).filter(BusinessJourney.is_demo.is_(True)).first()
        if existing:
            print("[INFO] Demo data is already present in the database. Use --clean to reset.")
            return

        print("[INFO] Seeding demo business journeys...")

        # 1. Wire Transfer Journey
        journey_wire = BusinessJourney(
            name="[DEMO] High-Value B2B Wire Transfer",
            description="Mission-critical corporate wire transfer orchestration through settlement rail.",
            journey_type="fund_transfer",
            is_enabled=True,
            is_demo=True,
        )
        db.add(journey_wire)
        db.flush()

        steps_wire = [
            JourneyStep(
                journey_id=journey_wire.id,
                step_name="Caller Authentication & Entitlement",
                step_order=1,
                service_name="auth-service",
                step_type="auth",
                timeout_ms=3000,
                is_required=True,
            ),
            JourneyStep(
                journey_id=journey_wire.id,
                step_name="Balance & Liquidity Check",
                step_order=2,
                service_name="account-service",
                step_type="api_call",
                timeout_ms=5000,
                is_required=True,
            ),
            JourneyStep(
                journey_id=journey_wire.id,
                step_name="Anti-Money Laundering & Fraud Scoring",
                step_order=3,
                service_name="fraud-detection-service",
                step_type="api_call",
                timeout_ms=8000,
                is_required=True,
            ),
            JourneyStep(
                journey_id=journey_wire.id,
                step_name="Core Banking Ledger Settlement",
                step_order=4,
                service_name="ledger-service",
                step_type="api_call",
                timeout_ms=10000,
                is_required=True,
            ),
            JourneyStep(
                journey_id=journey_wire.id,
                step_name="Counterparty Notification Dispatch",
                step_order=5,
                service_name="notification-service",
                step_type="queue_event",
                timeout_ms=4000,
                is_required=False,
            ),
        ]
        db.add_all(steps_wire)

        # 2. Checkout Journey
        journey_checkout = BusinessJourney(
            name="[DEMO] Consumer Instant Card Checkout",
            description="Consumer retail digital payment and instant fulfillment order journey.",
            journey_type="checkout",
            is_enabled=True,
            is_demo=True,
        )
        db.add(journey_checkout)
        db.flush()

        steps_checkout = [
            JourneyStep(
                journey_id=journey_checkout.id,
                step_name="Inventory Reservation",
                step_order=1,
                service_name="inventory-service",
                step_type="api_call",
                timeout_ms=4000,
                is_required=True,
            ),
            JourneyStep(
                journey_id=journey_checkout.id,
                step_name="Payment Gateway Authorization",
                step_order=2,
                service_name="payment-service",
                step_type="api_call",
                timeout_ms=6000,
                is_required=True,
            ),
            JourneyStep(
                journey_id=journey_checkout.id,
                step_name="Order Creation & Receipt",
                step_order=3,
                service_name="order-service",
                step_type="api_call",
                timeout_ms=4000,
                is_required=True,
            ),
        ]
        db.add_all(steps_checkout)
        db.commit()

        print("[INFO] Seeding demo journey executions & incidents...")

        now = datetime.now(timezone.utc)

        # Seed Execution 1 (Success)
        exec_success = JourneyExecution(
            execution_id="exec_demo_success_001",
            journey_id=journey_wire.id,
            correlation_id="corr-demo-wire-ok",
            environment="production",
            status="success",
            started_at=now - timedelta(minutes=45),
            completed_at=now - timedelta(minutes=44, seconds=45),
            duration_ms=15200.0,
            is_demo=True,
        )
        db.add(exec_success)
        db.flush()

        for step in steps_wire:
            db.add(StepExecution(
                journey_execution_id=exec_success.id,
                journey_step_id=step.id,
                status="success",
                started_at=now - timedelta(minutes=45),
                completed_at=now - timedelta(minutes=44, seconds=45),
                duration_ms=210.0,
                latency_ms=185.0,
                http_status=200,
                error_code=None,
                failure_category=None,
                retry_count=0,
                diagnostic_data={"endpoint": f"/api/v1/{step.service_name}/verify"},
            ))

        # Seed Execution 2 (Failed on Step 4 - Ledger Timeout)
        exec_failed = JourneyExecution(
            execution_id="exec_demo_failed_002",
            journey_id=journey_wire.id,
            correlation_id="corr-demo-wire-fail",
            environment="production",
            status="failed",
            started_at=now - timedelta(minutes=20),
            completed_at=now - timedelta(minutes=19, seconds=48),
            duration_ms=12140.0,
            is_demo=True,
        )
        db.add(exec_failed)
        db.flush()

        # Step 1, 2, 3 success
        for s in steps_wire[:3]:
            db.add(StepExecution(
                journey_execution_id=exec_failed.id,
                journey_step_id=s.id,
                status="success",
                started_at=now - timedelta(minutes=20),
                completed_at=now - timedelta(minutes=19, seconds=55),
                duration_ms=250.0,
                latency_ms=210.0,
                http_status=200,
                error_code=None,
                failure_category=None,
                retry_count=0,
            ))

        # Step 4 failure
        step_fail = StepExecution(
            journey_execution_id=exec_failed.id,
            journey_step_id=steps_wire[3].id,
            status="failed",
            started_at=now - timedelta(minutes=19, seconds=55),
            completed_at=now - timedelta(minutes=19, seconds=45),
            duration_ms=10012.0,
            latency_ms=10010.0,
            http_status=504,
            error_code="GATEWAY_TIMEOUT",
            failure_category="network_timeout",
            retry_count=2,
            diagnostic_data={
                "target_host": "ledger-primary.internal",
                "attempt_timeouts": [3000, 5000, 10000],
                "sanitized_note": "Connection closed before HTTP response headers received.",
            },
        )
        db.add(step_fail)
        db.flush()

        # Create Incident for this failure
        incident_wire = Incident(
            incident_id="inc_demo_ledger_timeout_01",
            journey_execution_id=exec_failed.id,
            step_execution_id=step_fail.id,
            journey_id=journey_wire.id,
            service_name="ledger-service",
            incident_type="transaction_failure",
            severity="high",
            title="[DEMO] Core Banking Ledger Settlement Timeout",
            description="Wire transfer execution halted due to 10s upstream gateway timeout on ledger settlement node.",
            status="investigating",
            failure_category="network_timeout",
            root_cause_hypothesis="Connection pool saturation or lock contention on settlement table.",
            recovery_status="not_started",
            detected_at=now - timedelta(minutes=19, seconds=40),
            is_demo=True,
        )
        db.add(incident_wire)
        db.flush()

        # Incident Events
        db.add_all([
            IncidentEvent(
                incident_id=incident_wire.id,
                event_type="detected",
                timestamp=now - timedelta(minutes=19, seconds=40),
                details={"metric": "step_timeout", "threshold_ms": 10000, "actual_ms": 10012},
                correlation_id="corr-demo-wire-fail",
            ),
            IncidentEvent(
                incident_id=incident_wire.id,
                event_type="analyzed",
                timestamp=now - timedelta(minutes=15),
                details={"findings": "Upstream replica lag detected in ledger partition 4"},
                correlation_id="corr-demo-wire-fail",
            ),
        ])

        # Seed Service Health Snapshots
        services = ["auth-service", "account-service", "fraud-detection-service", "ledger-service", "payment-service"]
        for svc in services:
            is_degraded = svc == "ledger-service"
            db.add(ServiceHealthSnapshot(
                service_name=svc,
                status="degraded" if is_degraded else "healthy",
                response_latency_ms=1420.5 if is_degraded else 45.2,
                error_rate=0.18 if is_degraded else 0.001,
                timestamp=now - timedelta(minutes=5),
                is_demo=True,
            ))

        # 5. Recovery Playbooks
        pb_auth = RecoveryPlaybook(
            playbook_id="pb_demo_auth_isolation",
            name="[DEMO] Auth Crash Circuit Isolation",
            description="Isolates broken auth endpoints and alerts oncall ops team.",
            applicable_services=["auth-service"],
            applicable_journeys=["fund_transfer", "e_commerce_checkout"],
            trigger_conditions={"service_name": "auth-service", "failure_category": "auth_5xx"},
            recovery_strategy="circuit_break",
            approval_status="approved",
            is_enabled=True,
            max_attempts=3,
            cooldown_seconds=300,
            verification_conditions={"health_status": "healthy"},
            rollback_instructions={"action": "close_circuit_breaker"},
            is_demo=True,
        )
        db.add(pb_auth)
        db.flush()

        db.add(RecoveryAction(
            playbook_id=pb_auth.id,
            action_order=1,
            action_type="circuit_breaker_toggle",
            parameters={"service_name": "auth-service", "target_state": "open", "reason": "Repeated 5xx failures"},
            risk_level="medium",
            preconditions={},
            expected_outcome="Circuit breaker opened to isolate failure cascade",
            timeout_seconds=15,
            requires_approval=False,
        ))
        db.add(RecoveryAction(
            playbook_id=pb_auth.id,
            action_order=2,
            action_type="send_notification",
            parameters={"channel": "pager_dev", "message": "Auth circuit breaker opened due to repeated 5xx crash."},
            risk_level="low",
            preconditions={},
            expected_outcome="Alert dispatched",
            timeout_seconds=10,
            requires_approval=False,
        ))

        db.commit()
        print("[SUCCESS] Successfully seeded demo journeys, executions, incidents, service health snapshots, and recovery playbooks.")

    except Exception as e:
        db.rollback()
        print(f"[ERROR] Seeding failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed demo synthetic business transaction data.")
    parser.add_argument("--clean", action="store_true", help="Remove existing demo data before seeding")
    args = parser.parse_args()
    seed_demo_data(clean=args.clean)
