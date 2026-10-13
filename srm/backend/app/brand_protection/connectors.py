from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class IntakeCandidate:
    """Standardized representation of an ingested suspicious domain candidate."""
    url_or_domain: str
    source_name: str
    metadata: Dict[str, Any]

    @property
    def url(self) -> str:
        return self.url_or_domain

    @property
    def raw_metadata(self) -> Dict[str, Any]:
        return self.metadata


class BaseIntakeConnector(ABC):
    """Abstract interface for suspicious domain discovery and threat feed connectors."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique identifier for this connector."""
        pass

    @property
    @abstractmethod
    def connector_type(self) -> str:
        """Type of connector: 'manual', 'threat_feed', 'scheduled_scanner'."""
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """Indicates whether necessary API keys or external configurations are active."""
        pass

    @abstractmethod
    def discover_candidates(
        self,
        brand_name: str,
        official_domains: List[str],
        limit: int = 20,
    ) -> List[IntakeCandidate]:
        """Discovers candidate suspicious domains targeting the specified brand."""
        pass

    def fetch_candidates(
        self,
        brand_name: str,
        official_domains: List[str],
        limit: int = 20,
    ) -> List[IntakeCandidate]:
        """Alias for discover_candidates."""
        return self.discover_candidates(brand_name, official_domains, limit=limit)


class ManualSubmissionConnector(BaseIntakeConnector):
    """Handles operator and user manual submissions."""

    @property
    def name(self) -> str:
        return "manual_submission"

    @property
    def connector_type(self) -> str:
        return "manual"

    @property
    def is_configured(self) -> bool:
        return True

    def discover_candidates(
        self,
        brand_name: str,
        official_domains: List[str],
        limit: int = 20,
    ) -> List[IntakeCandidate]:
        return []


class MockThreatFeedConnector(BaseIntakeConnector):
    """Simulated threat-intelligence feed providing verified test fixtures for impersonation campaigns."""

    def __init__(self, is_enabled: bool = True) -> None:
        self._enabled = is_enabled

    @property
    def name(self) -> str:
        return "mock_threat_intel_feed"

    @property
    def connector_type(self) -> str:
        return "threat_feed"

    @property
    def is_configured(self) -> bool:
        return self._enabled

    def discover_candidates(
        self,
        brand_name: str,
        official_domains: List[str],
        limit: int = 20,
    ) -> List[IntakeCandidate]:
        if not self._enabled:
            return []

        brand_slug = brand_name.lower().replace(" ", "")
        candidates = [
            IntakeCandidate(
                url_or_domain=f"https://{brand_slug}-security-login.net/auth",
                source_name=self.name,
                metadata={"confidence": "high", "asn": "AS45102", "registrar": "BadHost Inc"},
            ),
            IntakeCandidate(
                url_or_domain=f"http://{brand_slug}.com.phishing-portal.org/login",
                source_name=self.name,
                metadata={"confidence": "critical", "asn": "AS9921", "registrar": "AbuseRegistrar"},
            ),
            IntakeCandidate(
                url_or_domain=f"https://www.{brand_slug}support.com/update-account",
                source_name=self.name,
                metadata={"confidence": "medium", "asn": "AS13335", "registrar": "BulletproofDomains"},
            ),
        ]
        return candidates[:limit]


class ScheduledPermutationConnector(BaseIntakeConnector):
    """Generates standard typosquatting and combosquatting permutations for continuous brand surveillance."""

    @property
    def name(self) -> str:
        return "scheduled_permutation_scanner"

    @property
    def connector_type(self) -> str:
        return "scheduled_scanner"

    @property
    def is_configured(self) -> bool:
        return True

    def discover_candidates(
        self,
        brand_name: str,
        official_domains: List[str],
        limit: int = 20,
    ) -> List[IntakeCandidate]:
        brand_slug = brand_name.lower().replace(" ", "")
        results: List[IntakeCandidate] = []

        # Common combosquat prefixes/suffixes
        combos = ["login-", "secure-", "-verify", "-portal", "-auth"]
        for combo in combos:
            domain_cand = f"{combo}{brand_slug}.com" if combo.endswith("-") else f"{brand_slug}{combo}.com"
            results.append(
                IntakeCandidate(
                    url_or_domain=f"https://{domain_cand}",
                    source_name=self.name,
                    metadata={"permutation_type": "combosquat"},
                )
            )

        return results[:limit]


class ConnectorRegistry:
    """Registry managing available and active intake discovery connectors."""

    _connectors: Dict[str, BaseIntakeConnector] = {
        "manual_submission": ManualSubmissionConnector(),
        "mock_threat_intel_feed": MockThreatFeedConnector(),
        "scheduled_permutation_scanner": ScheduledPermutationConnector(),
    }

    @classmethod
    def get_connector(cls, name: str) -> Optional[BaseIntakeConnector]:
        return cls._connectors.get(name)

    @classmethod
    def list_connectors(cls) -> List[Dict[str, Any]]:
        return [
            {
                "name": conn.name,
                "connector_type": conn.connector_type,
                "is_configured": conn.is_configured,
            }
            for conn in cls._connectors.values()
        ]

    @classmethod
    def register(cls, connector: BaseIntakeConnector) -> None:
        cls._connectors[connector.name] = connector
