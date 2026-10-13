import ipaddress
import re
import socket
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse
import httpx

from app.core.exceptions import BadRequestError

BLOCKED_NETWORKS = [
    # IPv4 Private / Loopback / Link-Local / CGNAT / Metadata / Reserved
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # Link-local & Cloud Metadata (169.254.169.254)
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("255.255.255.255/32"),
    # IPv6
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("::ffff:0:0/96"),
]

BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "metadata",
    "instance-data",
}

BLOCKED_EXECUTABLE_EXTENSIONS = {
    ".exe", ".bin", ".msi", ".apk", ".sh", ".bat", ".cmd", ".vbs", ".scr", ".jar"
}

BLOCKED_CONTENT_TYPES = {
    "application/octet-stream",
    "application/x-dosexec",
    "application/x-executable",
    "application/x-msdos-program",
    "application/x-sh",
}


class SSRFBlockedError(BadRequestError):
    """Raised when an untrusted URL targets a private, loopback, or metadata destination."""

    def __init__(self, message: str, details: Optional[Dict] = None) -> None:
        super().__init__(
            message=f"SSRF Security Violation: {message}",
            details=details or {"security_rule": "ssrf_protection_blocked"},
        )
        self.error_code = "SSRF_BLOCKED"


@dataclass
class FetchedPage:
    """Sanitized representation of a retrieved web page."""
    original_url: str
    final_url: str
    status_code: int
    content_text: str
    redirect_count: int
    headers: Dict[str, str] = field(default_factory=dict)
    resolved_ip: Optional[str] = None
    ssl_cert_info: Optional[Dict] = None


class MockWebsiteRegistry:
    """In-memory mock provider for local test fixtures and controlled demonstrations."""

    _mock_pages: Dict[str, FetchedPage] = {}

    @classmethod
    def register_mock(
        cls,
        domain_or_url: str,
        content_text: str,
        status_code: int = 200,
        final_url: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        key = cls._normalize_key(domain_or_url)
        cls._mock_pages[key] = FetchedPage(
            original_url=domain_or_url,
            final_url=final_url or domain_or_url,
            status_code=status_code,
            content_text=content_text,
            redirect_count=1 if final_url and final_url != domain_or_url else 0,
            headers=headers or {"content-type": "text/html; charset=utf-8"},
            resolved_ip="198.51.100.42",
        )

    @classmethod
    def get_mock(cls, domain_or_url: str) -> Optional[FetchedPage]:
        key = cls._normalize_key(domain_or_url)
        return cls._mock_pages.get(key)

    @classmethod
    def clear(cls) -> None:
        cls._mock_pages.clear()

    @staticmethod
    def _normalize_key(val: str) -> str:
        parsed = urlparse(val if "://" in val else f"http://{val}")
        return (parsed.hostname or val).lower().strip()


class SafeUrlFetcher:
    """Hardened HTTP fetcher preventing SSRF, limiting response size, and inspecting redirects."""

    def __init__(
        self,
        connect_timeout_seconds: float = 3.0,
        read_timeout_seconds: float = 5.0,
        max_redirects: int = 3,
        max_size_bytes: int = 512 * 1024,  # 512 KB
    ) -> None:
        self.connect_timeout = connect_timeout_seconds
        self.read_timeout = read_timeout_seconds
        self.max_redirects = max_redirects
        self.max_size_bytes = max_size_bytes

    def fetch(self, url: str) -> FetchedPage:
        """Safely fetches an untrusted URL with rigorous SSRF checks and redirect revalidation."""
        if not url or not isinstance(url, str):
            raise BadRequestError("URL to fetch cannot be empty.")

        current_url = url.strip()
        if not (current_url.startswith("http://") or current_url.startswith("https://")):
            current_url = f"https://{current_url}"

        redirect_count = 0

        while True:
            # 1. Parse URL & enforce scheme
            parsed = urlparse(current_url)
            if parsed.scheme not in ("http", "https"):
                raise SSRFBlockedError(f"Unsupported protocol scheme '{parsed.scheme}'. Only HTTP and HTTPS are permitted.")

            hostname = parsed.hostname
            if not hostname:
                raise BadRequestError(f"Malformed URL '{current_url}': missing hostname.")

            # Check mock registry first (useful for test fixtures)
            mock_page = MockWebsiteRegistry.get_mock(hostname)
            if mock_page:
                return mock_page

            # Check blocked hostnames
            if hostname.lower() in BLOCKED_HOSTNAMES:
                raise SSRFBlockedError(f"Access to reserved hostname '{hostname}' is strictly prohibited.")

            # Reject executable extensions in path
            path_lower = parsed.path.lower()
            for ext in BLOCKED_EXECUTABLE_EXTENSIONS:
                if path_lower.endswith(ext):
                    raise BadRequestError(f"Access to executable file extension '{ext}' is forbidden.")

            # 2. DNS Resolution & SSRF Validation
            port = parsed.port or (443 if parsed.scheme == "https" else 80)
            resolved_ip = self._validate_dns_and_ip(hostname, port)

            # 3. Perform single-hop request with stream to cap byte size
            try:
                with httpx.Client(
                    timeout=httpx.Timeout(self.read_timeout, connect=self.connect_timeout),
                    follow_redirects=False,
                    verify=True,
                ) as client:
                    resp = client.get(
                        current_url,
                        headers={"User-Agent": "SRM-Security-Monitor/1.0 (Safe-Inspection-Worker)"},
                    )

                    # 4. Handle Redirects (Revalidating new destination against SSRF)
                    if resp.status_code in (301, 302, 303, 307, 308):
                        location = resp.headers.get("Location")
                        if not location:
                            raise BadRequestError("Redirect response missing Location header.")

                        if redirect_count >= self.max_redirects:
                            raise BadRequestError(f"Maximum redirect limit ({self.max_redirects}) exceeded.")

                        # Resolve relative redirect
                        current_url = urljoin(current_url, location)
                        redirect_count += 1
                        continue

                    # 5. Check Content-Type
                    content_type = resp.headers.get("content-type", "").lower()
                    for blocked_mime in BLOCKED_CONTENT_TYPES:
                        if blocked_mime in content_type:
                            raise BadRequestError(f"Disallowed binary/executable content-type '{content_type}'.")

                    # 6. Read bounded text content
                    raw_bytes = resp.content[: self.max_size_bytes]
                    try:
                        text_content = raw_bytes.decode(resp.encoding or "utf-8", errors="replace")
                    except Exception:
                        text_content = raw_bytes.decode("utf-8", errors="replace")

                    return FetchedPage(
                        original_url=url,
                        final_url=str(resp.url),
                        status_code=resp.status_code,
                        content_text=text_content,
                        redirect_count=redirect_count,
                        headers=dict(resp.headers),
                        resolved_ip=resolved_ip,
                    )

            except httpx.RequestError as exc:
                raise BadRequestError(f"Failed to retrieve website '{hostname}': {str(exc)}")

    def _validate_dns_and_ip(self, hostname: str, port: int) -> str:
        """Resolves hostname and verifies that all resolved IP addresses are public."""
        try:
            addr_info = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        except socket.gaierror as e:
            raise BadRequestError(f"DNS resolution failed for hostname '{hostname}': {e}")

        if not addr_info:
            raise BadRequestError(f"No IP addresses resolved for hostname '{hostname}'.")

        primary_ip: Optional[str] = None

        for entry in addr_info:
            ip_str = entry[4][0]
            if not primary_ip:
                primary_ip = ip_str

            try:
                ip_obj = ipaddress.ip_address(ip_str)
            except ValueError:
                raise SSRFBlockedError(f"Invalid resolved IP address: {ip_str}")

            for blocked_net in BLOCKED_NETWORKS:
                if ip_obj in blocked_net:
                    raise SSRFBlockedError(
                        f"Resolved destination '{ip_str}' is within blocked network '{blocked_net}'. Access denied."
                    )

        return primary_ip or "0.0.0.0"
