from app.core.sanitizer import sanitize_data, sanitize_string


def test_sanitize_string_bearer_token():
    raw = "Request failed with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz"
    sanitized = sanitize_string(raw)
    assert "[REDACTED_TOKEN]" in sanitized
    assert "eyJhbGciOiJIUzI1Ni" not in sanitized


def test_sanitize_string_credit_card():
    raw = "Customer card 4111 2222 3333 4444 failed 3DS verification"
    sanitized = sanitize_string(raw)
    assert "[REDACTED_CARD_4444]" in sanitized
    assert "4111 2222 3333" not in sanitized


def test_sanitize_data_dictionary_keys():
    payload = {
        "user_id": 101,
        "password": "SuperSecretPassword!",
        "access_token": "secret_abc123",
        "nested": {
            "card_number": "5500000000000004",
            "cvv": "123",
            "pin": "9999",
            "safe_field": "ok_value",
        },
        "list_items": [
            {"api_key": "live_key_999", "status": "active"},
            "Bearer token_in_string_12345",
        ],
    }

    cleaned = sanitize_data(payload)

    assert cleaned["user_id"] == 101
    assert cleaned["password"] == "[REDACTED]"
    assert cleaned["access_token"] == "[REDACTED]"
    assert cleaned["nested"]["card_number"] == "[REDACTED]"
    assert cleaned["nested"]["cvv"] == "[REDACTED]"
    assert cleaned["nested"]["pin"] == "[REDACTED]"
    assert cleaned["nested"]["safe_field"] == "ok_value"
    assert cleaned["list_items"][0]["api_key"] == "[REDACTED]"
    assert cleaned["list_items"][0]["status"] == "active"
    assert "[REDACTED_TOKEN]" in cleaned["list_items"][1]
