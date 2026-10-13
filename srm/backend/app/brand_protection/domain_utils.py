import re
import idna
from typing import Optional
from app.core.exceptions import BadRequestError

# Standard domain regex for ascii labels
LABEL_REGEX = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
# Regex to detect IP addresses
IPV4_REGEX = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


def normalize_domain(domain_str: str) -> str:
    """Canonicalizes, validates, and normalizes a domain string.

    Rules:
    - Strips protocols (http://, https://), paths, queries, ports.
    - Strips leading 'www.' prefix.
    - Converts to lowercase ASCII Punycode.
    - Enforces RFC 1035 label and length limits.
    - Rejects IP addresses, malformed characters, and empty TLDs.
    """
    if not domain_str or not isinstance(domain_str, str):
        raise BadRequestError("Domain cannot be empty.")

    cleaned = domain_str.strip().lower()

    # Strip scheme if provided
    if "://" in cleaned:
        cleaned = cleaned.split("://", 1)[1]
    elif cleaned.startswith("//"):
        cleaned = cleaned[2:]

    # Strip port, path, query, fragment
    cleaned = cleaned.split("/", 1)[0]
    cleaned = cleaned.split("?", 1)[0]
    cleaned = cleaned.split("#", 1)[0]
    cleaned = cleaned.split(":", 1)[0]

    # Strip trailing dot
    cleaned = cleaned.rstrip(".")

    # Canonicalize www prefix
    if cleaned.startswith("www."):
        cleaned = cleaned[4:]

    if not cleaned:
        raise BadRequestError("Extracted domain name is empty.")

    # Reject direct IP addresses
    if IPV4_REGEX.match(cleaned):
        raise BadRequestError(f"IP addresses ('{cleaned}') are not allowed as official brand domains.")

    # Punycode / IDN normalization
    try:
        ascii_domain = idna.encode(cleaned).decode("ascii")
    except Exception as e:
        raise BadRequestError(f"Domain '{cleaned}' contains invalid characters: {e}")

    # Total length check
    if len(ascii_domain) > 253:
        raise BadRequestError("Domain exceeds maximum allowed length of 253 characters.")

    labels = ascii_domain.split(".")
    if len(labels) < 2:
        raise BadRequestError(f"Domain '{ascii_domain}' must include a valid Top-Level Domain (TLD).")

    # Validate each label
    for label in labels:
        if not label:
            raise BadRequestError("Domain cannot contain empty labels (e.g. consecutive dots).")
        if len(label) > 63:
            raise BadRequestError(f"Domain label '{label}' exceeds maximum allowed length of 63 characters.")
        if not LABEL_REGEX.match(label):
            raise BadRequestError(
                f"Domain label '{label}' contains invalid characters. "
                f"Labels must contain only alphanumeric characters and hyphens, and cannot start or end with a hyphen."
            )

    # Validate TLD is not numeric-only
    tld = labels[-1]
    if tld.isdigit():
        raise BadRequestError(f"Top-level domain '{tld}' cannot be purely numeric.")

    if len(tld) < 2:
        raise BadRequestError(f"Top-level domain '{tld}' must be at least 2 characters.")

    return ascii_domain


def generate_verification_token() -> str:
    """Generates a cryptographically secure domain verification token."""
    import secrets
    return f"srm-verify-{secrets.token_hex(16)}"
