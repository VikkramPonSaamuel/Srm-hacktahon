from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.incident import Incident
from app.models.pattern import FailurePattern, PatternMatch
from app.patterns.detector import PatternDetectionConfig, RuleBasedPatternDetector


def _create_mock_incident(
    db: Session,
    service_name: str,
    failure_category: str,
    error_code: str,
    severity: str = "high",
    title: str = "Failure Incident",
) -> Incident:
    inc = Incident(
        incident_id=f"inc_test_{failure_category}_{datetime.now(timezone.utc).timestamp()}",
        service_name=service_name,
        failure_category=failure_category,
        incident_type="transaction_failure",
        severity=severity,
        title=title,
        description=f"Simulated failure on {service_name}: {error_code}",
        status="open",
        detected_at=datetime.now(timezone.utc),
        is_demo=True,
    )
    db.add(inc)
    db.commit()
    db.refresh(inc)
    return inc


def test_isolated_incident_insufficient_evidence(db_session: Session):
    """Verify that an isolated failure does NOT create a pattern when insufficient evidence exists."""
    detector = RuleBasedPatternDetector(db_session)
    inc1 = _create_mock_incident(db_session, "auth-service", "auth_5xx", "INTERNAL_AUTH_CRASH")

    pattern = detector.evaluate_incident(inc1)
    # Must be None because min_incidents_threshold is 2
    assert pattern is None

    total_patterns = db_session.query(FailurePattern).count()
    assert total_patterns == 0


def test_repeated_identical_failures_creates_candidate_pattern(db_session: Session):
    """Verify that repeated failures meet evidence threshold and synthesize a candidate pattern."""
    detector = RuleBasedPatternDetector(db_session)

    # First incident
    inc1 = _create_mock_incident(db_session, "auth-service", "auth_5xx", "INTERNAL_AUTH_CRASH", title="Auth crash 1")
    detector.evaluate_incident(inc1)

    # Second incident with identical failure category and service
    inc2 = _create_mock_incident(db_session, "auth-service", "auth_5xx", "INTERNAL_AUTH_CRASH", title="Auth crash 2")
    pattern = detector.evaluate_incident(inc2)

    assert pattern is not None
    assert pattern.status == "candidate"
    assert pattern.failure_category == "auth_5xx"
    assert pattern.service_name == "auth-service"
    assert pattern.incident_count >= 2
    assert pattern.confidence_score >= 0.65

    # Check that both incidents are linked in PatternMatch
    matches = db_session.query(PatternMatch).filter(PatternMatch.pattern_id == pattern.id).all()
    assert len(matches) == 2
    matched_inc_ids = {m.incident_id for m in matches}
    assert inc1.id in matched_inc_ids
    assert inc2.id in matched_inc_ids


def test_third_similar_failure_updates_existing_pattern_without_duplicates(db_session: Session):
    """Verify that subsequent matching incidents update the existing pattern rather than creating duplicates."""
    detector = RuleBasedPatternDetector(db_session)

    inc1 = _create_mock_incident(db_session, "auth-service", "auth_5xx", "INTERNAL_AUTH_CRASH")
    detector.evaluate_incident(inc1)
    inc2 = _create_mock_incident(db_session, "auth-service", "auth_5xx", "INTERNAL_AUTH_CRASH")
    pat_initial = detector.evaluate_incident(inc2)
    assert pat_initial is not None
    initial_pat_id = pat_initial.pattern_id

    # Third similar failure
    inc3 = _create_mock_incident(db_session, "auth-service", "auth_5xx", "INTERNAL_AUTH_CRASH")
    pat_updated = detector.evaluate_incident(inc3)

    assert pat_updated is not None
    assert pat_updated.pattern_id == initial_pat_id
    assert pat_updated.incident_count == 3
    assert len(pat_updated.matches) == 3

    # Ensure no duplicate pattern was created
    patterns_count = db_session.query(FailurePattern).filter(FailurePattern.failure_category == "auth_5xx").count()
    assert patterns_count == 1


def test_unrelated_incident_does_not_match(db_session: Session):
    """Verify that unrelated failures do not falsely match an existing pattern."""
    detector = RuleBasedPatternDetector(db_session)

    # Create auth pattern
    inc1 = _create_mock_incident(db_session, "auth-service", "auth_5xx", "INTERNAL_AUTH_CRASH")
    detector.evaluate_incident(inc1)
    inc2 = _create_mock_incident(db_session, "auth-service", "auth_5xx", "INTERNAL_AUTH_CRASH")
    auth_pat = detector.evaluate_incident(inc2)
    assert auth_pat is not None

    # Unrelated payment failure
    inc_payment = _create_mock_incident(db_session, "primary-payment-gateway", "payment_timeout", "GATEWAY_TIMEOUT")
    pay_pat = detector.evaluate_incident(inc_payment)

    # Isolated payment incident does not create pattern yet, and does not attach to auth
    assert pay_pat is None
    assert auth_pat.incident_count == 2
    assert inc_payment.id not in [m.incident_id for m in auth_pat.matches]


def test_second_payment_failure_creates_separate_pattern(db_session: Session):
    """Verify that a second payment failure creates a distinct new pattern."""
    detector = RuleBasedPatternDetector(db_session)

    # Create auth pattern
    detector.evaluate_incident(_create_mock_incident(db_session, "auth-service", "auth_5xx", "AUTH_ERR"))
    auth_pat = detector.evaluate_incident(_create_mock_incident(db_session, "auth-service", "auth_5xx", "AUTH_ERR"))
    assert auth_pat is not None

    # First payment failure
    detector.evaluate_incident(_create_mock_incident(db_session, "primary-payment-gateway", "payment_timeout", "PAY_TIMEOUT"))

    # Second payment failure
    inc_pay2 = _create_mock_incident(db_session, "primary-payment-gateway", "payment_timeout", "PAY_TIMEOUT")
    pay_pat = detector.evaluate_incident(inc_pay2)

    assert pay_pat is not None
    assert pay_pat.id != auth_pat.id
    assert pay_pat.failure_category == "payment_timeout"
    assert pay_pat.service_name == "primary-payment-gateway"

    # Exactly 2 distinct patterns exist
    total_patterns = db_session.query(FailurePattern).count()
    assert total_patterns == 2


def test_historical_reevaluation(db_session: Session):
    """Verify batch historical re-evaluation over existing incidents."""
    # Seed 3 checkout incidents and 2 search incidents directly into DB without pattern evaluation
    for _ in range(3):
        _create_mock_incident(db_session, "checkout-service", "checkout_5xx", "CHECKOUT_ERR")
    for _ in range(2):
        _create_mock_incident(db_session, "search-service", "search_slow", "SLOW_QUERY")

    detector = RuleBasedPatternDetector(db_session)
    result = detector.reevaluate_all_incidents()

    assert result["total_incidents_analyzed"] >= 5
    assert result["total_patterns_active"] >= 2
