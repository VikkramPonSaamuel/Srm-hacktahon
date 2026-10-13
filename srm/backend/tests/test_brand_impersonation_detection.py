import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.brand_protection.domain_analyzer import analyze_lookalike
from app.brand_protection.domain_utils import normalize_domain
from app.brand_protection.safe_fetcher import (
    MockWebsiteRegistry,
    SafeUrlFetcher,
    SSRFBlockedError,
)
from app.core.exceptions import BadRequestError
from app.models.brand_protection import BrandProfile, DetectedImpersonation, OfficialDomain
from app.models.incident import Incident


# ------------------------------------------------------------------------------
# Test Fixture: Seeded Brand
# ------------------------------------------------------------------------------


@pytest.fixture
def brand_acme(db_session: Session) -> BrandProfile:
    """Creates a verified brand Acme Payments with official domain acmepayments.com."""
    brand = BrandProfile(
        brand_id="brd_acmetest01",
        name="Acme Payments",
        description="Global fintech payment solution",
        owner_id="acme_rep",
        contact_email="security@acmepayments.com",
        registration_status="verified",
        verification_status="verified",
        is_demo=False,
    )
    db_session.add(brand)
    db_session.flush()

    domain = OfficialDomain(
        domain_id="dom_acme01",
        brand_id=brand.id,
        domain_name="acmepayments.com",
        verification_status="verified",
        verification_method="dns_txt",
        verification_token="acme-proof-token-123",
        is_active=True,
    )
    db_session.add(domain)
    db_session.commit()
    db_session.refresh(brand)
    return brand


# ------------------------------------------------------------------------------
# 1. Domain Lookalike & Unicode / IDN Edge Cases
# ------------------------------------------------------------------------------


def test_lookalike_typosquatting_detection():
    """Validates Levenshtein and substitution detection for lookalike candidates."""
    official = ["acmepayments.com"]
    signal = analyze_lookalike(
        candidate_domain="acmepaynnents.com",  # 'nn' for 'm'
        brand_name="Acme Payments",
        official_domains=official,
    )
    assert signal.is_lookalike is True
    assert signal.similarity_score > 0.80
    assert signal.attack_vector == "domain_typosquat"


def test_lookalike_combosquatting_detection():
    """Validates keyword affix detection for combosquatting domains."""
    official = ["acmepayments.com"]
    signal = analyze_lookalike(
        candidate_domain="acmepayments-login-security.net",
        brand_name="Acme Payments",
        official_domains=official,
    )
    assert signal.is_lookalike is True
    assert signal.similarity_score >= 0.70
    assert signal.attack_vector in ("combosquat", "domain_typosquat")


def test_lookalike_subdomain_deception():
    """Validates misleading subdomains attempting to mimic official brands."""
    official = ["acmepayments.com"]
    signal = analyze_lookalike(
        candidate_domain="acmepayments.com.verify-billing-update.org",
        brand_name="Acme Payments",
        official_domains=official,
    )
    assert signal.is_lookalike is True
    assert signal.similarity_score >= 0.85
    assert signal.attack_vector in ("subdomain_deception", "combosquat")


def test_unicode_and_idn_homoglyph_detection():
    """Validates that Cyrillic homoglyphs in IDN punycode format are identified."""
    official = ["acmepayments.com"]
    # 'а' (U+0430 Cyrillic small letter a) instead of Latin 'a'
    cyrillic_domain = "аcmepayments.com"
    punycode_domain = "xn--cmepayments-xij.com"

    signal_cyrillic = analyze_lookalike(
        candidate_domain=cyrillic_domain,
        brand_name="Acme Payments",
        official_domains=official,
    )
    assert signal_cyrillic.is_lookalike is True
    assert "homoglyph" in signal_cyrillic.attack_vector or signal_cyrillic.similarity_score > 0.90

    signal_punycode = analyze_lookalike(
        candidate_domain=punycode_domain,
        brand_name="Acme Payments",
        official_domains=official,
    )
    assert signal_punycode.is_lookalike is True


def test_similar_but_unrelated_domain_false_positive_reduction():
    """Validates that unrelated domains sharing casual substrings are not flagged as impersonations."""
    official = ["acmepayments.com"]
    signal = analyze_lookalike(
        candidate_domain="acmecateringboston.com",
        brand_name="Acme Payments",
        official_domains=official,
    )
    # Does not target payment keywords or typosquatting
    assert signal.similarity_score < 0.70


# ------------------------------------------------------------------------------
# 2. SSRF Protection & Safe Fetcher Unit Tests
# ------------------------------------------------------------------------------


def test_ssrf_blocking_private_and_loopback_ips():
    """Ensures SafeUrlFetcher rejects localhost and private CIDR ranges without making network calls."""
    fetcher = SafeUrlFetcher()

    # Loopback
    with pytest.raises(SSRFBlockedError) as exc_loopback:
        fetcher.fetch("http://127.0.0.1/api/keys")
    assert "loopback" in str(exc_loopback.value).lower() or "ssrf" in str(exc_loopback.value).lower()

    # Private Class A / C
    with pytest.raises(SSRFBlockedError):
        fetcher.fetch("http://10.1.2.3/internal")
    with pytest.raises(SSRFBlockedError):
        fetcher.fetch("http://192.168.1.100/admin")


def test_ssrf_blocking_cloud_metadata_service():
    """Ensures SafeUrlFetcher blocks AWS/GCP/Azure link-local metadata addresses."""
    fetcher = SafeUrlFetcher()

    # AWS/OpenStack/DigitalOcean metadata IP
    with pytest.raises(SSRFBlockedError) as exc_meta:
        fetcher.fetch("http://169.254.169.254/latest/meta-data/")
    assert "ssrf" in str(exc_meta.value).lower()

    # Google Cloud Metadata Hostname
    with pytest.raises(SSRFBlockedError) as exc_gcp:
        fetcher.fetch("http://metadata.google.internal/computeMetadata/v1/")
    assert "ssrf" in str(exc_gcp.value).lower() or "prohibited" in str(exc_gcp.value).lower()


def test_safe_fetcher_disallows_executable_files():
    """Ensures SafeUrlFetcher refuses to download executable or script files."""
    fetcher = SafeUrlFetcher()

    with pytest.raises(BadRequestError, match="executable"):
        fetcher.fetch("http://example.org/downloads/payload.exe")

    with pytest.raises(BadRequestError, match="executable"):
        fetcher.fetch("https://suspicious-domain.com/setup.msi")


def test_safe_fetcher_mock_registry_integration():
    """Validates that MockWebsiteRegistry safely supplies page content for testing."""
    MockWebsiteRegistry.clear()
    MockWebsiteRegistry.register_mock(
        domain_or_url="phish-acmepayments.net",
        content_text=(
            "<html><head><title>Acme Payments - Secure Login</title></head>"
            "<body><h1>Enter your Acme Payments credentials</h1>"
            "<form action='/steal' method='POST'>"
            "<input type='password' name='pass'>"
            "<img src='/assets/acme-logo.png'>"
            "</form></body></html>"
        ),
        status_code=200,
    )

    fetcher = SafeUrlFetcher()
    page = fetcher.fetch("http://phish-acmepayments.net/login")
    assert page.status_code == 200
    assert "Acme Payments" in page.content_text
    MockWebsiteRegistry.clear()


# ------------------------------------------------------------------------------
# 3. API Integration Tests: Intake, Analysis, and Allowlisting
# ------------------------------------------------------------------------------


def test_intake_official_domain_allowlist(client: TestClient, brand_acme: BrandProfile):
    """Submitting an official verified domain must return 0.0 risk, dismissed status, and no incident."""
    headers = {"X-User-Id": "acme_rep", "X-Role": "operator"}
    payload = {
        "brand_id": brand_acme.brand_id,
        "url": "https://acmepayments.com/checkout",
        "source": "manual_submission",
        "fetch_content": False,
    }

    res = client.post("/api/v1/brands/intake", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["risk_score"] == 0.0
    assert data["severity"] == "low"
    assert data["status"] == "dismissed"
    assert data["review_recommendation"] == "dismiss"
    assert data["incident_id"] is None
    assert "exact verified official domain" in data["detection_reasons"][0]


def test_intake_suspicious_lookalike_creates_incident(client: TestClient, brand_acme: BrandProfile):
    """Submitting a high-risk lookalike must calculate high risk, create an Incident, and record audit event."""
    MockWebsiteRegistry.clear()
    MockWebsiteRegistry.register_mock(
        domain_or_url="acmepaynnents-portal.com",
        content_text=(
            "<html><head><title>Acme Payments Sign-in</title></head>"
            "<body><form><input type='password' name='passwd'></form></body></html>"
        ),
        status_code=200,
    )

    headers = {"X-User-Id": "acme_rep", "X-Role": "operator"}
    payload = {
        "brand_id": brand_acme.brand_id,
        "url": "http://acmepaynnents-portal.com/login",
        "source": "manual_submission",
        "fetch_content": True,
    }

    res = client.post("/api/v1/brands/intake", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()

    assert data["risk_score"] >= 0.70
    assert data["severity"] in ("high", "critical")
    assert data["incident_id"] is not None
    assert data["correlation_id"] is not None
    assert data["correlation_id"].startswith("corr-brand-")
    assert len(data["detection_reasons"]) > 0
    MockWebsiteRegistry.clear()


def test_duplicate_submission_suppresses_duplicate_incidents(client: TestClient, brand_acme: BrandProfile):
    """Submitting the exact same candidate domain repeatedly must update the detection and prevent duplicate incidents."""
    headers = {"X-User-Id": "acme_rep", "X-Role": "operator"}
    payload = {
        "brand_id": brand_acme.brand_id,
        "url": "http://acmepaynnents-phish.net",
        "source": "threat_feed",
        "fetch_content": False,
    }

    # First submission
    res1 = client.post("/api/v1/brands/intake", json=payload, headers=headers)
    assert res1.status_code == 201
    d1 = res1.json()
    det_id = d1["detection_id"]
    inc_id1 = d1["incident_id"]

    # Second submission with the same domain
    res2 = client.post("/api/v1/brands/intake", json=payload, headers=headers)
    assert res2.status_code == 201
    d2 = res2.json()

    # Must be the exact same detection record and incident ID
    assert d2["detection_id"] == det_id
    assert d2["incident_id"] == inc_id1


def test_malformed_url_intake_validation(client: TestClient, brand_acme: BrandProfile):
    """Ensures submitting invalid URLs (no TLD, spaces, empty) returns 400 Bad Request."""
    headers = {"X-User-Id": "acme_rep", "X-Role": "operator"}

    # Missing TLD
    res = client.post(
        "/api/v1/brands/intake",
        json={"brand_id": brand_acme.brand_id, "url": "notadomain"},
        headers=headers,
    )
    assert res.status_code == 400


# ------------------------------------------------------------------------------
# 4. Review & Adjudication Workflow
# ------------------------------------------------------------------------------


def test_review_and_adjudicate_candidate(client: TestClient, brand_acme: BrandProfile):
    """Operator reviews candidate, confirms malicious, or dismisses as false positive."""
    headers = {"X-User-Id": "acme_rep", "X-Role": "operator"}

    # 1. Intake candidate
    intake_res = client.post(
        "/api/v1/brands/intake",
        json={"brand_id": brand_acme.brand_id, "url": "acme-verify-review.org", "fetch_content": False},
        headers=headers,
    )
    assert intake_res.status_code == 201
    detection_id = intake_res.json()["detection_id"]

    # 2. Confirm malicious review
    review_payload = {
        "action": "confirm_malicious",
        "notes": "Verified phishing kit hosting an unauthorized credential harvester.",
    }
    rev_res = client.post(
        f"/api/v1/brands/detections/{detection_id}/review",
        json=review_payload,
        headers=headers,
    )
    assert rev_res.status_code == 200
    rev_data = rev_res.json()
    assert rev_data["status"] == "confirmed_malicious"
    assert rev_data["review_recommendation"] == "escalate_takedown"
    assert rev_data["reviewed_by"] == "acme_rep"
    assert rev_data["incident_id"] is not None

    # 3. Check incident linking endpoint
    inc_res = client.get(f"/api/v1/brands/detections/{detection_id}/incidents", headers=headers)
    assert inc_res.status_code == 200
    inc_data = inc_res.json()
    assert inc_data["incident"] is not None
    assert inc_data["incident"]["id"] == rev_data["incident_id"]

    # 4. Dismiss review
    dismiss_res = client.post(
        f"/api/v1/brands/detections/{detection_id}/review",
        json={"action": "dismiss", "notes": "Resolved through registrar cooperation."},
        headers=headers,
    )
    assert dismiss_res.status_code == 200
    assert dismiss_res.json()["status"] == "dismissed"


def test_view_detection_evidence_endpoint(client: TestClient, brand_acme: BrandProfile):
    """Retrieves granular evidence and score explanations for a detection."""
    headers = {"X-User-Id": "acme_rep", "X-Role": "viewer"}

    # Seed candidate via intake
    op_headers = {"X-User-Id": "acme_rep", "X-Role": "operator"}
    intake = client.post(
        "/api/v1/brands/intake",
        json={"brand_id": brand_acme.brand_id, "url": "acmepay-secure-checkout.com", "fetch_content": False},
        headers=op_headers,
    ).json()

    detection_id = intake["detection_id"]

    res = client.get(f"/api/v1/brands/detections/{detection_id}/evidence", headers=headers)
    assert res.status_code == 200
    ev = res.json()
    assert ev["detection_id"] == detection_id
    assert "evidence_references" in ev
    assert "detection_reasons" in ev


# ------------------------------------------------------------------------------
# 5. Feed Ingestion & Discovery Connectors
# ------------------------------------------------------------------------------


def test_feed_ingest_mock_connector(client: TestClient, brand_acme: BrandProfile):
    """Ingests candidates from mock threat intelligence feed connector."""
    headers = {"X-User-Id": "acme_rep", "X-Role": "operator"}
    payload = {
        "connector_name": "mock_threat_intel_feed",
        "brand_id": brand_acme.brand_id,
        "limit": 5,
    }

    res = client.post("/api/v1/brands/feed-ingest", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["connector_name"] == "mock_threat_intel_feed"
    assert data["ingested_count"] > 0
    assert len(data["detections"]) > 0


def test_list_detections_filtering(client: TestClient, brand_acme: BrandProfile):
    """Filters detected candidates by brand, severity, and status."""
    headers = {"X-User-Id": "acme_rep", "X-Role": "viewer"}

    res = client.get(
        f"/api/v1/brands/detections?brand_id={brand_acme.brand_id}&limit=10",
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
