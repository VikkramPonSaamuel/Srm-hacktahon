import re
from typing import Any, Dict, List, Union

from app.core.sanitizer import sanitize_data

SENSITIVE_KEY_PATTERNS = [
    re.compile(r"pass(word)?", re.IGNORECASE),
    re.compile(r"auth(orization)?", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"cookie", re.IGNORECASE),
    re.compile(r"session", re.IGNORECASE),
    re.compile(r"api[_-]?key", re.IGNORECASE),
    re.compile(r"card", re.IGNORECASE),
    re.compile(r"cvv", re.IGNORECASE),
    re.compile(r"ssn", re.IGNORECASE),
]

BEARER_REGEX = re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE)
CREDIT_CARD_REGEX = re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b")


def sanitize_security_telemetry(data: Any, max_string_len: int = 1024) -> Any:
    """Recursively redacts authentication tokens, credentials, and payment data

    from incoming security telemetry dictionaries and strings prior to storage.
    """
    if data is None:
        return None

    if isinstance(data, str):
        # Redact bearer tokens and credit card numbers in arbitrary strings
        redacted = BEARER_REGEX.sub("Bearer [REDACTED_TOKEN]", data)
        redacted = CREDIT_CARD_REGEX.sub("[REDACTED_CARD]", redacted)
        if len(redacted) > max_string_len:
            return redacted[:max_string_len] + "...[TRUNCATED]"
        return redacted

    if isinstance(data, dict):
        sanitized_dict: Dict[str, Any] = {}
        for k, v in data.items():
            k_str = str(k)
            # Check if key represents a sensitive field
            is_sensitive_key = any(p.search(k_str) for p in SENSITIVE_KEY_PATTERNS)
            if is_sensitive_key:
                sanitized_dict[k_str] = "[REDACTED]"
            else:
                sanitized_dict[k_str] = sanitize_security_telemetry(v, max_string_len=max_string_len)
        return sanitized_dict

    if isinstance(data, (list, tuple, set)):
        return [sanitize_security_telemetry(item, max_string_len=max_string_len) for item in data]

    return data
