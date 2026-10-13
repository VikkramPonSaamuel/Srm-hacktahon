import base64
import pytest
from fastapi.testclient import TestClient

from app.brand_protection.domain_utils import normalize_domain
from app.core.exceptions import BadRequestError
from app.core.security import UserRole, settings


# ------------------------------------------------------------------------------
# 1. Unit Tests: Domain Normalization & Validation
# ------------------------------------------------------------------------------


def test_domain_normalization_valid():
    """Validates that various URL formats canonicalize to standardized lowercase domain."""
    assert normalize_domain("https://www.example.com/checkout") == "example.com"
    assert normalize_domain("http://brand-name.org:8080/api/v1?ref=123") == "brand-name.org"
    assert normalize_domain("WWW.SUBDOMAIN.BRAND.CO.UK/") == "subdomain.brand.co.uk"
    assert normalize_domain("portal.global-fintech.net#section") == "portal.global-fintech.net"


def test_domain_normalization_invalid():
    """Validates that malformed domains, IP addresses, and invalid syntax are rejected."""
    # Empty
    with pytest.raises(BadRequestError):
        normalize_domain("")

    # IP Address
    with pytest.raises(BadRequestError, match="IP addresses"):
        normalize_domain("192.168.1.1")

    # Missing TLD
    with pytest.raises(BadRequestError, match="Top-Level Domain"):
        normalize_domain("localhost")

    # Invalid characters
    with pytest.raises(BadRequestError, match="invalid characters"):
        normalize_domain("brand name with spaces.com")

    # Label starting with hyphen
    with pytest.raises(BadRequestError, match="invalid characters"):
        normalize_domain("-invalidbrand.com")

    # Purely numeric TLD
    with pytest.raises(BadRequestError, match="purely numeric"):
        normalize_domain("example.123")


# ------------------------------------------------------------------------------
# 2. Integration Tests: Brand Profile Registration & Ownership Restrictions
# ------------------------------------------------------------------------------


def test_brand_registration_and_ownership_isolation(client: TestClient):
    """Verifies brand registration and ensures one brand owner cannot view or modify another's records."""
    # Alice registers brand A
    alice_headers = {"X-User-Id": "alice_rep", "X-Role": "operator"}
    res = client.post(
        "/api/v1/brands",
        json={
            "name": "Acme Global Corp",
            "description": "Leading industrial supplies and technology",
            "contact_email": "security@acme.com",
        },
        headers=alice_headers,
    )
    assert res.status_code == 201
    brand_a = res.json()
    brand_a_id = brand_a["brand_id"]
    assert brand_a["name"] == "Acme Global Corp"
    assert brand_a["owner_id"] == "alice_rep"
    assert brand_a["verification_status"] == "unverified"

    # Bob registers brand B
    bob_headers = {"X-User-Id": "bob_rep", "X-Role": "operator"}
    res_b = client.post(
        "/api/v1/brands",
        json={"name": "Beta Logistics", "contact_email": "ops@beta.com"},
        headers=bob_headers,
    )
    assert res_b.status_code == 201
    brand_b = res_b.json()
    brand_b_id = brand_b["brand_id"]

    # 1. Alice listing brands only sees brand A
    res_list_alice = client.get("/api/v1/brands", headers=alice_headers)
    assert res_list_alice.status_code == 200
    alice_brand_ids = [b["brand_id"] for b in res_list_alice.json()]
    assert brand_a_id in alice_brand_ids
    assert brand_b_id not in alice_brand_ids

    # 2. Bob attempting to access Alice's brand A detail -> 403 Forbidden
    res_bob_access = client.get(f"/api/v1/brands/{brand_a_id}", headers=bob_headers)
    assert res_bob_access.status_code == 403
    assert res_bob_access.json()["error"]["code"] == "FORBIDDEN"

    # 3. Bob attempting to update Alice's brand A -> 403 Forbidden
    res_bob_update = client.put(
        f"/api/v1/brands/{brand_a_id}",
        json={"name": "Hijacked Brand Name"},
        headers=bob_headers,
    )
    assert res_bob_update.status_code == 403

    # 4. Bob attempting to add a domain to Alice's brand A -> 403 Forbidden
    res_bob_domain = client.post(
        f"/api/v1/brands/{brand_a_id}/domains",
        json={"domain_name": "malicious-takeover.com"},
        headers=bob_headers,
    )
    assert res_bob_domain.status_code == 403

    # 5. Alice can update her own brand
    res_alice_update = client.put(
        f"/api/v1/brands/{brand_a_id}",
        json={"name": "Acme Global Holdings"},
        headers=alice_headers,
    )
    assert res_alice_update.status_code == 200
    assert res_alice_update.json()["name"] == "Acme Global Holdings"

    # 6. Admin can view both brands
    admin_headers = {"X-User-Id": "superadmin", "X-Role": "admin"}
    res_admin_list = client.get("/api/v1/brands", headers=admin_headers)
    assert res_admin_list.status_code == 200
    admin_brand_ids = [b["brand_id"] for b in res_admin_list.json()]
    assert brand_a_id in admin_brand_ids
    assert brand_b_id in admin_brand_ids


# ------------------------------------------------------------------------------
# 3. Official Domain Management & Verification Tests
# ------------------------------------------------------------------------------


def test_official_domain_management_and_verification(client: TestClient):
    """Tests adding, canonicalizing, verifying, and toggling official domains."""
    headers = {"X-User-Id": "owner_zeta", "X-Role": "operator"}

    # 1. Register brand
    res_brand = client.post(
        "/api/v1/brands",
        json={"name": "Zeta Pay", "contact_email": "ops@zetapay.com"},
        headers=headers,
    )
    assert res_brand.status_code == 201
    brand_id = res_brand.json()["brand_id"]

    # 2. Add domain with messy URL -> canonicalized to lowercase without scheme
    res_dom = client.post(
        f"/api/v1/brands/{brand_id}/domains",
        json={"domain_name": "HTTPS://WWW.ZetaPay.COM/login?lang=en"},
        headers=headers,
    )
    assert res_dom.status_code == 201
    dom = res_dom.json()
    assert dom["domain_name"] == "zetapay.com"
    assert dom["verification_status"] == "unverified"
    assert dom["verification_token"].startswith("srm-verify-")
    domain_id = dom["domain_id"]

    # 3. Duplicate domain registration under same brand returns conflict
    res_dup = client.post(
        f"/api/v1/brands/{brand_id}/domains",
        json={"domain_name": "zetapay.com"},
        headers=headers,
    )
    assert res_dup.status_code == 409
    assert res_dup.json()["error"]["code"] == "CONFLICT"

    # 4. List domains
    res_list = client.get(f"/api/v1/brands/{brand_id}/domains", headers=headers)
    assert res_list.status_code == 200
    assert len(res_list.json()) == 1

    # 5. Verify domain
    res_verify = client.post(
        f"/api/v1/brands/{brand_id}/domains/{domain_id}/verify",
        json={"proof_token": dom["verification_token"]},
        headers=headers,
    )
    assert res_verify.status_code == 200
    assert res_verify.json()["verification_status"] == "verified"
    assert res_verify.json()["verified_at"] is not None

    # 6. Toggle active status
    res_status = client.patch(
        f"/api/v1/brands/{brand_id}/domains/{domain_id}/status",
        json={"is_active": False},
        headers=headers,
    )
    assert res_status.status_code == 200
    assert res_status.json()["is_active"] is False


# ------------------------------------------------------------------------------
# 4. Brand Asset Validation & Content Inspection Tests
# ------------------------------------------------------------------------------


def test_brand_asset_validation_and_safety(client: TestClient):
    """Verifies content inspection for images, color palettes, SVGs, and rejects malicious scripts."""
    headers = {"X-User-Id": "brand_media_rep", "X-Role": "operator"}
    res_brand = client.post(
        "/api/v1/brands",
        json={"name": "Pixel Design Studio"},
        headers=headers,
    )
    brand_id = res_brand.json()["brand_id"]

    # 1. Valid PNG upload (magic bytes \x89PNG\r\n\x1a\n)
    valid_png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    res_png = client.post(
        f"/api/v1/brands/{brand_id}/assets",
        json={
            "asset_type": "logo",
            "content_base64": base64.b64encode(valid_png_bytes).decode("utf-8"),
        },
        headers=headers,
    )
    assert res_png.status_code == 201
    asset_png = res_png.json()
    assert asset_png["content_type"] == "image/png"
    assert len(asset_png["file_hash"]) == 64

    # 2. Invalid image bytes claiming to be logo -> rejected
    fake_png = b"NOT_A_REAL_PNG_IMAGE_DATA_12345"
    res_fake = client.post(
        f"/api/v1/brands/{brand_id}/assets",
        json={
            "asset_type": "logo",
            "content_base64": base64.b64encode(fake_png).decode("utf-8"),
        },
        headers=headers,
    )
    assert res_fake.status_code == 400
    assert "format is not recognized" in res_fake.json()["error"]["message"]

    # 3. Malicious SVG with embedded <script> tag -> rejected
    malicious_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert('xss')</script></svg>"
    res_svg = client.post(
        f"/api/v1/brands/{brand_id}/assets",
        json={
            "asset_type": "logo",
            "content_base64": base64.b64encode(malicious_svg).decode("utf-8"),
        },
        headers=headers,
    )
    assert res_svg.status_code == 400
    assert "dangerous executable tags" in res_svg.json()["error"]["message"]

    # 4. Valid Color Palette JSON
    res_colors = client.post(
        f"/api/v1/brands/{brand_id}/assets",
        json={
            "asset_type": "color_palette",
            "text_or_json_payload": ["#1A73E8", "#EA4335", "#34A853"],
        },
        headers=headers,
    )
    assert res_colors.status_code == 201
    assert res_colors.json()["content_type"] == "application/json"
    assert res_colors.json()["asset_metadata"]["colors_count"] == 3

    # 5. Invalid Color Palette with bad hex
    res_bad_colors = client.post(
        f"/api/v1/brands/{brand_id}/assets",
        json={
            "asset_type": "color_palette",
            "text_or_json_payload": ["#INVALID_HEX_CODE"],
        },
        headers=headers,
    )
    assert res_bad_colors.status_code == 400
    assert "Invalid hex color" in res_bad_colors.json()["error"]["message"]

    # 6. List assets
    res_list_assets = client.get(f"/api/v1/brands/{brand_id}/assets", headers=headers)
    assert res_list_assets.status_code == 200
    assert len(res_list_assets.json()) == 2


# ------------------------------------------------------------------------------
# 5. Verification Workflow & Administrative Review Tests
# ------------------------------------------------------------------------------


def test_verification_workflow_approval_and_rejection(client: TestClient):
    """Verifies submit-for-review, admin-only review gating, and requirement for verified domain."""
    owner_headers = {"X-User-Id": "solaris_owner", "X-Role": "operator"}
    admin_headers = {"X-User-Id": "security_director", "X-Role": "admin"}

    # 1. Register brand
    res_brand = client.post(
        "/api/v1/brands",
        json={"name": "Solaris Banking Group"},
        headers=owner_headers,
    )
    brand_id = res_brand.json()["brand_id"]

    # 2. Attempt to submit brand without any domains -> rejected
    res_sub_empty = client.post(
        f"/api/v1/brands/{brand_id}/submit-verification",
        json={"notes": "Please verify"},
        headers=owner_headers,
    )
    assert res_sub_empty.status_code == 400
    assert "without registering at least one official domain" in res_sub_empty.json()["error"]["message"]

    # 3. Add domain (unverified)
    res_dom = client.post(
        f"/api/v1/brands/{brand_id}/domains",
        json={"domain_name": "solaris-bank.com"},
        headers=owner_headers,
    )
    domain_id = res_dom.json()["domain_id"]

    # 4. Submit for review now succeeds -> status becomes 'pending_review'
    res_sub = client.post(
        f"/api/v1/brands/{brand_id}/submit-verification",
        json={"notes": "Ready for security team evaluation"},
        headers=owner_headers,
    )
    assert res_sub.status_code == 200
    assert res_sub.json()["verification_status"] == "pending_review"
    assert res_sub.json()["registration_status"] == "submitted"

    # 5. Non-admin operator attempts to review -> 403 Forbidden
    res_nonadmin_review = client.post(
        f"/api/v1/brands/{brand_id}/review",
        json={"action": "approve", "review_notes": "Self approval attempt"},
        headers=owner_headers,
    )
    assert res_nonadmin_review.status_code == 403

    # 6. Admin attempts to approve without verified domain -> 400 Bad Request
    res_unverified_approve = client.post(
        f"/api/v1/brands/{brand_id}/review",
        json={"action": "approve", "review_notes": "Approval attempt with unverified domain"},
        headers=admin_headers,
    )
    assert res_unverified_approve.status_code == 400
    assert "no official domain has been verified" in res_unverified_approve.json()["error"]["message"]

    # 7. Verify the domain
    res_verify_dom = client.post(
        f"/api/v1/brands/{brand_id}/domains/{domain_id}/verify",
        json={"proof_token": res_dom.json()["verification_token"]},
        headers=owner_headers,
    )
    assert res_verify_dom.status_code == 200
    assert res_verify_dom.json()["verification_status"] == "verified"

    # 8. Admin approves verification request
    res_admin_approve = client.post(
        f"/api/v1/brands/{brand_id}/review",
        json={"action": "approve", "review_notes": "Official domain DNS TXT record validated."},
        headers=admin_headers,
    )
    assert res_admin_approve.status_code == 200
    approved_brand = res_admin_approve.json()
    assert approved_brand["verification_status"] == "verified"
    assert approved_brand["registration_status"] == "verified"
    assert approved_brand["reviewed_by"] is not None

    # 9. Verify audit events history
    res_history = client.get(
        f"/api/v1/brands/{brand_id}/verification-history",
        headers=owner_headers,
    )
    assert res_history.status_code == 200
    events = res_history.json()
    actions = [e["verification_action"] for e in events]
    assert "brand_registered" in actions
    assert "domain_added" in actions
    assert "submitted_for_review" in actions
    assert "domain_verified" in actions
    assert "admin_approved" in actions


def test_brand_verification_rejection_and_override(client: TestClient):
    """Tests rejection workflow and administrator override capability."""
    owner_headers = {"X-User-Id": "brand_reject_test", "X-Role": "operator"}
    admin_headers = {"X-User-Id": "chief_admin", "X-Role": "admin"}

    res_brand = client.post(
        "/api/v1/brands",
        json={"name": "Suspicious Claim Corp"},
        headers=owner_headers,
    )
    brand_id = res_brand.json()["brand_id"]

    # Add domain
    client.post(
        f"/api/v1/brands/{brand_id}/domains",
        json={"domain_name": "suspicious-claim.net"},
        headers=owner_headers,
    )

    # Submit for review
    client.post(
        f"/api/v1/brands/{brand_id}/submit-verification",
        headers=owner_headers,
    )

    # Admin rejects
    res_reject = client.post(
        f"/api/v1/brands/{brand_id}/review",
        json={"action": "reject", "review_notes": "Unverified corporate registration details."},
        headers=admin_headers,
    )
    assert res_reject.status_code == 200
    assert res_reject.json()["verification_status"] == "rejected"
    assert res_reject.json()["registration_status"] == "rejected"

    # Brand 2: Test override allows approval even if domain is not yet verified
    res_b2 = client.post(
        "/api/v1/brands",
        json={"name": "Trusted Government Entity"},
        headers=owner_headers,
    )
    b2_id = res_b2.json()["brand_id"]
    client.post(
        f"/api/v1/brands/{b2_id}/domains",
        json={"domain_name": "gov-trusted-portal.org"},
        headers=owner_headers,
    )
    client.post(
        f"/api/v1/brands/{b2_id}/submit-verification",
        headers=owner_headers,
    )

    res_override = client.post(
        f"/api/v1/brands/{b2_id}/review",
        json={
            "action": "approve",
            "review_notes": "Out-of-band verified via official certificate.",
            "override_verified_domain_requirement": True,
        },
        headers=admin_headers,
    )
    assert res_override.status_code == 200
    assert res_override.json()["verification_status"] == "verified"


def test_brand_asset_upload_multipart(client: TestClient):
    """Tests multipart/form-data file upload for brand assets."""
    headers = {"X-User-Id": "multimedia_owner", "X-Role": "operator"}
    res_brand = client.post(
        "/api/v1/brands",
        json={"name": "Multipart Studio"},
        headers=headers,
    )
    brand_id = res_brand.json()["brand_id"]

    # Upload valid JPEG via multipart/form-data
    valid_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb"
    files = {"file": ("company_logo.jpg", valid_jpeg, "image/jpeg")}
    data = {"asset_type": "logo"}

    res_upload = client.post(
        f"/api/v1/brands/{brand_id}/assets/upload",
        data=data,
        files=files,
        headers=headers,
    )
    assert res_upload.status_code == 201
    asset = res_upload.json()
    assert asset["asset_type"] == "logo"
    assert asset["content_type"] == "image/jpeg"
    assert asset["asset_metadata"]["original_filename"] == "company_logo.jpg"

