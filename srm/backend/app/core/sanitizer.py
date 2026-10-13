import re
from typing import Any, Dict, List, Union

# Sensitive field keys to redact (case-insensitive substring or exact match)
SENSITIVE_KEYS = {
    "password",
    "passwd",
    "pwd",
    "token",
    "access_token",
    "refresh_token",
    "auth",
    "authorization",
    "api_key",
    "apikey",
    "secret",
    "client_secret",
    "card_number",
    "cardnumber",
    "pan",
    "cvv",
    "cvv2",
    "cvc",
    "pin",
    "ssn",
    "private_key",
}

# Regex patterns for sensitive data embedded within strings
CARD_PATTERN = re.compile(r"\b(?:\d[ -]*?){13,19}\b")
BEARER_PATTERN = re.compile(r"(Bearer\s+)[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)


def sanitize_string(val: str) -> str:
    """Sanitize strings for embedded tokens, secrets, or card numbers."""
    if not isinstance(val, str):
        return val

    # Mask Bearer tokens
    sanitized = BEARER_PATTERN.sub(r"\1[REDACTED_TOKEN]", val)

    # Mask potential payment card patterns (13 to 19 digits)
    def mask_card_match(match: re.Match) -> str:
        raw_digits = re.sub(r"\D", "", match.group(0))
        if 13 <= len(raw_digits) <= 19:
            return f"[REDACTED_CARD_{raw_digits[-4:]}]"
        return match.group(0)

    sanitized = CARD_PATTERN.sub(mask_card_match, sanitized)
    return sanitized


def sanitize_data(data: Any) -> Any:
    """Recursively sanitize dictionaries, lists, or primitives to prevent

    sensitive payment or authentication data leaks.
    """
    if isinstance(data, dict):
        cleaned: Dict[str, Any] = {}
        for k, v in data.items():
            key_lower = str(k).lower().replace("-", "_").replace(" ", "_")
            if any(s in key_lower for s in SENSITIVE_KEYS):
                cleaned[k] = "[REDACTED]"
            else:
                cleaned[k] = sanitize_data(v)
        return cleaned

    elif isinstance(data, (list, tuple, set)):
        return [sanitize_data(item) for item in data]

    elif isinstance(data, str):
        return sanitize_string(data)

    return data
