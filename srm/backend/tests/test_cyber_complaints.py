import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.brand_protection.complaint_narrative import ComplaintNarrativeGenerator
from app.models.brand_protection import (
    BrandProfile,
    CyberComplaint,
    DetectedImpersonation,
    OfficialDomain,
)
from app.models.incident import Incident, IncidentEvent


@pytest.fixture
def seeded_brand_and_incident(db_session: Session) -> dict:
    """Creates a verified brand with an active official domain and an eligible impersonation incident."""
    brand = BrandProfile(
        brand_id="brd_complaint_test",
        name="Apex Financial",
        description="Global banking and digital asset custody",
        owner_id="apex_rep",
        contact_email="legal-abuse@apexfinancial.com",
        registration_status="verified",
        verification_status="verified",
        is_demo=False,
    )
    db_session.add(brand)
    db_session.flush()

    domain = OfficialDomain(
        domain_id="dom_apex01",
        brand_id=brand.id,
        domain_name="apexfinancial.com",
        verification_status="verified",
        verification_method="dns_txt",
        is_active=True,
    )
    db_session.add(domain)
    db_session.flush()

    # Eligible brand impersonation incident
    incident = Incident(
        incident_id="inc_impersonation_apex",
        incident_type="brand_impersonation",
        severity="high",
        title="Brand Impersonation: apexfinancial-verify-portal.net targeting Apex Financial",
        description="High-confidence lookalike portal detected attempting to deceive customers.",
        service_name="brand_protection",
        failure_category="impersonation_threat",
        detected_at=datetime.now(timezone.utc),
        is_demo=False,
    )
    db_session.add(incident)
    db_session.flush()

    # Associated detected impersonation
    detection = DetectedImpersonation(
        detection_id="det_apex01",
        brand_id=brand.id,
        incident_id=incident.id,
        incident_ref=incident.incident_id,
        suspicious_url="https://apexfinancial-verify-portal.net/login",
        suspicious_domain="apexfinancial-verify-portal.net",
        intake_source="manual_submission",
        attack_vector="domain_typosquat",
        risk_score=0.88,
        severity="high",
        confidence_score=0.92,
        evidence_quality="high",
        status="candidate",
        detection_reasons=[
            "High lexical similarity to official domain 'apexfinancial.com'",
            "Web page presents an active password / credential input form",
        ],
        evidence_references={
            "resolved_ip": "198.51.100.77",
            "page_title": "Apex Financial - Sign In",
            "has_credential_form": True,
            "logo_match": False,
        },
        missing_evidence=[],
        review_recommendation="escalate_takedown",
        first_detected_at=datetime.now(timezone.utc),
        last_analyzed_at=datetime.now(timezone.utc),
        is_demo=False,
    )
    db_session.add(detection)
    db_session.commit()
    db_session.refresh(brand)
    db_session.refresh(incident)
    db_session.refresh(detection)

    return {
        "brand": brand,
        "domain": domain,
        "incident": incident,
        "detection": detection,
    }


# ------------------------------------------------------------------------------
# 1. Unit Tests: Narrative Generation & Validation
# ------------------------------------------------------------------------------


def test_narrative_generation_separates_facts_and_assessments():
    """Validates that observed empirical facts and security assessments are strictly segregated."""
    narrative = ComplaintNarrativeGenerator.generate_narrative(
        brand_name="Apex Financial",
        official_domains=["apexfinancial.com"],
        suspected_domain="apexfinancial-verify-portal.net",
        suspected_url="https://apexfinancial-verify-portal.net/login",
        detection_timestamp=datetime.now(timezone.utc),
        evidence_references={"resolved_ip": "198.51.100.77", "page_title": "Apex Login"},
        threat_assessment={"risk_score": 0.85, "severity": "high", "attack_vector": "domain_typosquat", "detection_reasons": ["Typosquatting"]},
        reporting_party_name="Agent Smith",
        channel="registrar_abuse",
    )

    assert "1. Target Domain: apexfinancial-verify-portal.net" in narrative["observed_facts"]
    assert "Resolved IP Address: 198.51.100.77" in narrative["observed_facts"]
    assert "Threat Score: 0.85" in narrative["threat_assessment"]
    assert "ClientHold / ServerHold" in narrative["requested_action"]
    assert "declare under penalty of perjury" in narrative["legal_declaration"]


def test_validation_flags_unsupported_allegations():
    """Validates that claims unsupported by evidence (e.g. alleging logo theft when none was detected) are flagged."""
    narrative = {
        "executive_summary": "Phishing site.",
        "observed_facts": "Domain active.",
        "requested_action": "Take down.",
        "legal_declaration": "I declare this is accurate.",
        "threat_assessment": "The attackers have copied trademark logo stolen from our portal.",
    }
    # No logo match in evidence
    evidence = {"has_credential_form": True, "logo_match": False}
    report = ComplaintNarrativeGenerator.validate_complaint(
        narrative_sections=narrative,
        evidence_references=evidence,
        official_domains=["apexfinancial.com"],
        reporting_party_email="legal@apexfinancial.com",
    )
    assert report.is_valid_for_submission is False
    assert any("logo" in u.lower() for u in report.unsupported_allegations)


def test_validation_flags_missing_evidence():
    """Validates that missing official domain or reporting email blocks valid submission state."""
    narrative = {
        "executive_summary": "Summary.",
        "observed_facts": "Facts.",
        "requested_action": "Action.",
        "legal_declaration": "Legal.",
    }
    report = ComplaintNarrativeGenerator.validate_complaint(
        narrative_sections=narrative,
        evidence_references={},
        official_domains=[],  # Empty official domains
        reporting_party_email=None,  # Missing email
    )
    assert report.is_valid_for_submission is False
    assert len(report.missing_evidence) >= 2


# ------------------------------------------------------------------------------
# 2. Workflow: Create Draft, Duplicate Prevention, and Evidence Collection
# ------------------------------------------------------------------------------


def test_create_complaint_draft_success(client: TestClient, seeded_brand_and_incident: dict):
    """Creates a complaint draft from an eligible incident, collecting evidence and audit log."""
    incident = seeded_brand_and_incident["incident"]
    headers = {"X-User-Id": "apex_rep", "X-Role": "operator"}

    payload = {
        "incident_id": incident.id,
        "reporting_channel": "registrar_abuse",
        "force_new": False,
    }

    res = client.post("/api/v1/complaints", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()

    assert data["complaint_id"].startswith("cmp_")
    assert data["complaint_status"] == "draft"
    assert data["submission_status"] == "not_submitted"
    assert data["suspected_domain"] == "apexfinancial-verify-portal.net"
    assert data["reporting_channel"] == "registrar_abuse"
    assert len(data["narrative_sections"]) >= 5
    assert len(data["events"]) >= 1
    assert data["events"][0]["event_type"] == "created"


def test_duplicate_complaint_prevention(client: TestClient, seeded_brand_and_incident: dict):
    """Prevents creating duplicate complaint drafts for the same incident unless force_new=True."""
    incident = seeded_brand_and_incident["incident"]
    headers = {"X-User-Id": "apex_rep", "X-Role": "operator"}

    payload = {"incident_id": incident.id, "reporting_channel": "registrar_abuse"}

    # First creation succeeds
    res1 = client.post("/api/v1/complaints", json=payload, headers=headers)
    assert res1.status_code == 201

    # Second creation without force_new returns 409 Conflict
    res2 = client.post("/api/v1/complaints", json=payload, headers=headers)
    assert res2.status_code == 409
    assert "already exists" in res2.json()["error"]["message"]

    # Explicit force_new=True creates another draft
    res3 = client.post("/api/v1/complaints", json={**payload, "force_new": True}, headers=headers)
    assert res3.status_code == 201
    assert res3.json()["complaint_id"] != res1.json()["complaint_id"]


# ------------------------------------------------------------------------------
# 3. Permissions & Role Isolation
# ------------------------------------------------------------------------------


def test_complaint_permissions_brand_isolation(client: TestClient, seeded_brand_and_incident: dict):
    """Ensures another unauthorized user cannot view or mutate another brand's complaints."""
    incident = seeded_brand_and_incident["incident"]
    owner_headers = {"X-User-Id": "apex_rep", "X-Role": "operator"}
    attacker_headers = {"X-User-Id": "mallory_hacker", "X-Role": "operator"}

    # Owner creates complaint
    create_res = client.post(
        "/api/v1/complaints",
        json={"incident_id": incident.id, "reporting_channel": "registrar_abuse"},
        headers=owner_headers,
    )
    assert create_res.status_code == 201
    complaint_id = create_res.json()["complaint_id"]

    # Unauthorized user attempts retrieval -> 403 Forbidden
    get_res = client.get(f"/api/v1/complaints/{complaint_id}", headers=attacker_headers)
    assert get_res.status_code == 403


# ------------------------------------------------------------------------------
# 4. Review Workflow: Submit, Changes Requested, and Approval
# ------------------------------------------------------------------------------


def test_review_and_approval_lifecycle(client: TestClient, seeded_brand_and_incident: dict):
    """Tests the full review cycle: submit draft -> request changes -> update -> approve."""
    incident = seeded_brand_and_incident["incident"]
    rep_headers = {"X-User-Id": "apex_rep", "X-Role": "operator"}
    reviewer_headers = {"X-User-Id": "security_officer", "X-Role": "admin"}

    # 1. Create draft
    draft = client.post(
        "/api/v1/complaints",
        json={"incident_id": incident.id, "reporting_channel": "manual_portal"},
        headers=rep_headers,
    ).json()
    cid = draft["complaint_id"]

    # 2. Submit for review
    sub_res = client.post(f"/api/v1/complaints/{cid}/submit-review", headers=rep_headers)
    assert sub_res.status_code == 200
    assert sub_res.json()["complaint_status"] == "pending_review"

    # 3. Reviewer requests changes
    rev_res = client.post(
        f"/api/v1/complaints/{cid}/review",
        json={"action": "request_changes", "review_notes": "Please specify the customer impact metric."},
        headers=reviewer_headers,
    )
    assert rev_res.status_code == 200
    assert rev_res.json()["complaint_status"] == "changes_requested"

    # 4. Update narrative sections
    sections = draft["narrative_sections"]
    sections["victim_impact"] = "High impact: 1,500 enterprise customers targeted in phishing campaign."
    update_res = client.put(
        f"/api/v1/complaints/{cid}",
        json={"narrative_sections": sections},
        headers=rep_headers,
    )
    assert update_res.status_code == 200

    # 5. Re-submit for review
    client.post(f"/api/v1/complaints/{cid}/submit-review", headers=rep_headers)

    # 6. Reviewer approves
    app_res = client.post(
        f"/api/v1/complaints/{cid}/review",
        json={"action": "approve", "review_notes": "Verified. Ready for manual portal submission."},
        headers=reviewer_headers,
    )
    assert app_res.status_code == 200
    assert app_res.json()["complaint_status"] == "approved"
    assert app_res.json()["reviewed_by"] == "security_officer"


# ------------------------------------------------------------------------------
# 5. Export Package & Submission Recording
# ------------------------------------------------------------------------------


def test_export_package_and_record_external_submission(client: TestClient, seeded_brand_and_incident: dict):
    """Exports structured package, enforces approval before submission, and records external reference."""
    incident = seeded_brand_and_incident["incident"]
    rep_headers = {"X-User-Id": "apex_rep", "X-Role": "operator"}

    # 1. Create draft
    draft = client.post(
        "/api/v1/complaints",
        json={"incident_id": incident.id, "reporting_channel": "manual_portal"},
        headers=rep_headers,
    ).json()
    cid = draft["complaint_id"]

    # Attempting to record submission while in 'draft' status must fail (approval required!)
    unapproved_sub = client.post(
        f"/api/v1/complaints/{cid}/record-submission",
        json={"official_reference_number": "CASE-12345"},
        headers=rep_headers,
    )
    assert unapproved_sub.status_code == 400
    assert "formally approved" in unapproved_sub.json()["error"]["message"]

    # Export package (accessible for inspection)
    export_res = client.get(f"/api/v1/complaints/{cid}/export", headers=rep_headers)
    assert export_res.status_code == 200
    exp_data = export_res.json()
    assert exp_data["channel"] == "manual_portal"
    assert "formatted_text" in exp_data
    assert "structured_data" in exp_data

    # Approve complaint
    client.post(f"/api/v1/complaints/{cid}/submit-review", headers=rep_headers)
    client.post(f"/api/v1/complaints/{cid}/review", json={"action": "approve"}, headers=rep_headers)

    # Record external submission with official confirmation reference number
    sub_res = client.post(
        f"/api/v1/complaints/{cid}/record-submission",
        json={
            "official_reference_number": "ICANN-ABUSE-99412",
            "submission_notes": "Submitted via ICANN compliance portal.",
            "submission_details": {"portal": "icann.org", "receipt_id": "REC-99412"},
        },
        headers=rep_headers,
    )
    assert sub_res.status_code == 200
    sub_data = sub_res.json()
    assert sub_data["submission_status"] == "submitted"
    assert sub_data["official_reference_number"] == "ICANN-ABUSE-99412"
    assert sub_data["submitted_by"] == "apex_rep"
    assert sub_data["submitted_at"] is not None


# ------------------------------------------------------------------------------
# 6. Follow-up Tracking & Incident Outcome Association
# ------------------------------------------------------------------------------


def test_follow_up_history_and_incident_resolution(client: TestClient, seeded_brand_and_incident: dict):
    """Appends follow-up updates and updates the associated incident status upon takedown completion."""
    incident = seeded_brand_and_incident["incident"]
    rep_headers = {"X-User-Id": "apex_rep", "X-Role": "operator"}

    # Setup approved and submitted complaint
    draft = client.post(
        "/api/v1/complaints",
        json={"incident_id": incident.id, "reporting_channel": "registrar_abuse"},
        headers=rep_headers,
    ).json()
    cid = draft["complaint_id"]
    client.post(f"/api/v1/complaints/{cid}/submit-review", headers=rep_headers)
    client.post(f"/api/v1/complaints/{cid}/review", json={"action": "approve"}, headers=rep_headers)
    client.post(
        f"/api/v1/complaints/{cid}/record-submission",
        json={"official_reference_number": "REG-TICKET-7712"},
        headers=rep_headers,
    )

    # 1. Add follow-up: Registrar acknowledged
    f1_res = client.post(
        f"/api/v1/complaints/{cid}/follow-ups",
        json={
            "notes": "Registrar acknowledged receipt; forwarded to domain registrant for comment.",
            "submission_status": "acknowledged",
        },
        headers=rep_headers,
    )
    assert f1_res.status_code == 200
    assert f1_res.json()["submission_status"] == "acknowledged"

    # 2. Add follow-up: Domain suspended / Takedown completed
    f2_res = client.post(
        f"/api/v1/complaints/{cid}/follow-ups",
        json={
            "notes": "Registrar verified malicious phishing portal and applied ClientHold suspension.",
            "submission_status": "action_taken",
            "resolution_status": "domain_suspended",
        },
        headers=rep_headers,
    )
    assert f2_res.status_code == 200
    f2_data = f2_res.json()
    assert f2_data["resolution_status"] == "domain_suspended"
    assert f2_data["resolved_at"] is not None

    # 3. Verify audit timeline history
    timeline_res = client.get(f"/api/v1/complaints/{cid}/timeline", headers=rep_headers)
    assert timeline_res.status_code == 200
    events = timeline_res.json()
    assert len(events) >= 5
    types = [e["event_type"] for e in events]
    assert "created" in types
    assert "submitted_for_review" in types
    assert "approved" in types
    assert "submitted_externally" in types
    assert "follow_up_added" in types


def test_list_reporting_channels_endpoint(client: TestClient):
    """Verifies retrieval of registered reporting channels and disabled-by-default status of automated APIs."""
    headers = {"X-User-Id": "apex_rep", "X-Role": "viewer"}
    res = client.get("/api/v1/complaints/channels", headers=headers)
    assert res.status_code == 200
    channels = res.json()
    names = [c["channel_name"] for c in channels]
    assert "download_package" in names
    assert "manual_portal" in names
    assert "registrar_abuse" in names

    # Automated API must be disabled by default until verified per integration requirements
    auto_channel = next(c for c in channels if c["channel_name"] == "mock_automated_api")
    assert auto_channel["is_enabled"] is False
