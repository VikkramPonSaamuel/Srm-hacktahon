import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class ChannelSubmissionResult:
    """Result of invoking a complaint reporting channel."""
    is_submitted: bool
    confirmation_reference: Optional[str] = None
    portal_url: Optional[str] = None
    instructions: Optional[str] = None
    message: str = ""
    submission_payload: Optional[Dict[str, Any]] = None


class BaseReportingChannelAdapter(ABC):
    """Abstract adapter defining standard complaint generation, export, and submission protocol."""

    @property
    @abstractmethod
    def channel_name(self) -> str:
        """Machine identifier (e.g. 'registrar_abuse', 'download_package')."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable channel title."""
        pass

    @property
    @abstractmethod
    def channel_category(self) -> str:
        """Category: 'manual_portal', 'download', 'email_template', 'automated_api'."""
        pass

    @property
    def is_automated(self) -> bool:
        return False

    @property
    def is_enabled(self) -> bool:
        return True

    @property
    def portal_url(self) -> Optional[str]:
        return None

    @abstractmethod
    def format_complaint_text(self, complaint: Any) -> str:
        """Renders plain text or Markdown complaint representation."""
        pass

    def export_package(self, complaint: Any) -> Dict[str, Any]:
        """Produces structured, downloadable complaint bundle."""
        text_body = self.format_complaint_text(complaint)
        return {
            "complaint_id": complaint.complaint_id,
            "channel": self.channel_name,
            "portal_url": self.portal_url,
            "export_timestamp": datetime.now(timezone.utc).isoformat(),
            "formatted_text": text_body,
            "structured_data": {
                "brand_id": complaint.brand.brand_id if complaint.brand else str(complaint.brand_id),
                "suspected_domain": complaint.suspected_domain,
                "suspected_url": complaint.suspected_url,
                "reporting_party": {
                    "id": complaint.reporting_party_id,
                    "name": complaint.reporting_party_name,
                    "email": complaint.reporting_party_email,
                },
                "detection_timestamp": complaint.detection_timestamp.isoformat() if hasattr(complaint.detection_timestamp, "isoformat") else str(complaint.detection_timestamp),
                "threat_assessment": complaint.threat_assessment_summary,
                "narrative_sections": complaint.narrative_sections,
                "evidence_references": complaint.evidence_references,
            },
        }

    @abstractmethod
    def submit(self, complaint: Any, actor_username: str) -> ChannelSubmissionResult:
        """Executes or guides complaint submission."""
        pass


class DownloadPackageAdapter(BaseReportingChannelAdapter):
    """Generates an offline downloadable package for manual or legal distribution."""

    @property
    def channel_name(self) -> str:
        return "download_package"

    @property
    def display_name(self) -> str:
        return "Download Structured Package"

    @property
    def channel_category(self) -> str:
        return "download"

    def format_complaint_text(self, complaint: Any) -> str:
        sections = complaint.narrative_sections or {}
        return (
            f"================================================================================\n"
            f"BRAND IMPERSONATION CYBER COMPLAINT PACKAGE\n"
            f"Complaint ID: {complaint.complaint_id}\n"
            f"Target Domain: {complaint.suspected_domain}\n"
            f"Date Prepared: {complaint.created_at.strftime('%Y-%m-%d %H:%M:%S UTC') if hasattr(complaint, 'created_at') and complaint.created_at else 'Recent'}\n"
            f"================================================================================\n\n"
            f"1. EXECUTIVE SUMMARY\n--------------------\n{sections.get('executive_summary', '')}\n\n"
            f"2. OBSERVED EMPIRICAL FACTS\n---------------------------\n{sections.get('observed_facts', '')}\n\n"
            f"3. EVIDENCE PROVENANCE\n----------------------\n{sections.get('evidence_summary', '')}\n\n"
            f"4. THREAT & TECHNICAL ASSESSMENT\n--------------------------------\n{sections.get('threat_assessment', '')}\n\n"
            f"5. VICTIM & CONSUMER IMPACT\n---------------------------\n{sections.get('victim_impact', '')}\n\n"
            f"6. REQUESTED ACTIONS\n--------------------\n{sections.get('requested_action', '')}\n\n"
            f"7. LEGAL DECLARATION\n--------------------\n{sections.get('legal_declaration', '')}\n"
        )

    def submit(self, complaint: Any, actor_username: str) -> ChannelSubmissionResult:
        # Download package cannot automatically transmit externally
        return ChannelSubmissionResult(
            is_submitted=False,
            message="Structured complaint package generated. Download via export endpoint and dispatch through chosen offline channel.",
            instructions="Download the JSON or text export and deliver to legal counsel or external authority.",
        )


class ManualPortalAdapter(BaseReportingChannelAdapter):
    """Guides representative through an official reporting web form without claiming auto-submission."""

    def __init__(self, portal_url: str = "https://www.icann.org/compliance/complaints", portal_name: str = "Official Reporting Portal") -> None:
        self._url = portal_url
        self._name = portal_name

    @property
    def channel_name(self) -> str:
        return "manual_portal"

    @property
    def display_name(self) -> str:
        return f"Web Portal ({self._name})"

    @property
    def channel_category(self) -> str:
        return "manual_portal"

    @property
    def portal_url(self) -> Optional[str]:
        return self._url

    def format_complaint_text(self, complaint: Any) -> str:
        sections = complaint.narrative_sections or {}
        return (
            f"Subject: Brand Impersonation Abuse Notification - {complaint.suspected_domain}\n\n"
            f"{sections.get('executive_summary', '')}\n\n"
            f"Observed Details:\n{sections.get('observed_facts', '')}\n\n"
            f"Requested Relief:\n{sections.get('requested_action', '')}\n\n"
            f"Declaration:\n{sections.get('legal_declaration', '')}"
        )

    def submit(self, complaint: Any, actor_username: str) -> ChannelSubmissionResult:
        return ChannelSubmissionResult(
            is_submitted=False,
            portal_url=self.portal_url,
            message="Manual portal submission required. External portal does not permit automated API ingestion.",
            instructions=(
                f"1. Navigate to {self.portal_url}.\n"
                f"2. Copy the formatted complaint text from the export tab.\n"
                f"3. Submit the form and obtain an official case or ticket number.\n"
                f"4. Record the official reference number via 'Record External Submission'."
            ),
        )


class RegistrarAbuseAdapter(BaseReportingChannelAdapter):
    """Formats standardized registrar abuse desk notification."""

    @property
    def channel_name(self) -> str:
        return "registrar_abuse"

    @property
    def display_name(self) -> str:
        return "Registrar Abuse Desk"

    @property
    def channel_category(self) -> str:
        return "email_template"

    @property
    def portal_url(self) -> Optional[str]:
        return "https://lookup.icann.org/"

    def format_complaint_text(self, complaint: Any) -> str:
        sections = complaint.narrative_sections or {}
        return (
            f"To: abuse@{complaint.suspected_domain} / Registrar Abuse Contact\n"
            f"From: {complaint.reporting_party_email or 'security@brand-owner.com'}\n"
            f"Subject: URGENT: Phishing and Trademark Impersonation Abuse - {complaint.suspected_domain}\n\n"
            f"Dear Registrar Abuse Team,\n\n"
            f"{sections.get('executive_summary', '')}\n\n"
            f"EVIDENCE & OBSERVED FACTS:\n{sections.get('observed_facts', '')}\n\n"
            f"ASSESSMENT:\n{sections.get('threat_assessment', '')}\n\n"
            f"ACTION REQUIRED:\n{sections.get('requested_action', '')}\n\n"
            f"LEGAL ATTESTATION:\n{sections.get('legal_declaration', '')}\n"
        )

    def submit(self, complaint: Any, actor_username: str) -> ChannelSubmissionResult:
        return ChannelSubmissionResult(
            is_submitted=False,
            portal_url=self.portal_url,
            message="Registrar abuse notices must be dispatched to the verified registrar abuse email.",
            instructions=(
                f"1. Check WHOIS for the sponsoring registrar of '{complaint.suspected_domain}' via {self.portal_url}.\n"
                f"2. Send the prepared abuse notification to the registrar's abuse contact address.\n"
                f"3. When the registrar replies with a ticket reference, record it using 'Record External Submission'."
            ),
        )


class HostingProviderAdapter(BaseReportingChannelAdapter):
    """Formats hosting provider / Cloudflare / infrastructure takedown notification."""

    @property
    def channel_name(self) -> str:
        return "hosting_provider"

    @property
    def display_name(self) -> str:
        return "Hosting Infrastructure Provider"

    @property
    def channel_category(self) -> str:
        return "email_template"

    def format_complaint_text(self, complaint: Any) -> str:
        sections = complaint.narrative_sections or {}
        return (
            f"Subject: Host Infrastructure Takedown Notice: Deceptive Phishing Content on {complaint.suspected_url}\n\n"
            f"{sections.get('executive_summary', '')}\n\n"
            f"OBSERVED HOSTING FACTS:\n{sections.get('observed_facts', '')}\n\n"
            f"REQUESTED RELIEF:\n{sections.get('requested_action', '')}\n\n"
            f"LEGAL STATEMENT:\n{sections.get('legal_declaration', '')}\n"
        )

    def submit(self, complaint: Any, actor_username: str) -> ChannelSubmissionResult:
        return ChannelSubmissionResult(
            is_submitted=False,
            message="Hosting provider notice prepared. Transmit to hosting abuse contact or webform.",
            instructions="Submit through the provider's DMCA/Fraud webform and record the resulting reference number.",
        )


class MockReportingChannelAdapter(BaseReportingChannelAdapter):
    """Configurable automated integration for testing and controlled demonstrations.

    Explicitly disabled by default until verified per integration requirements.
    """

    def __init__(self, enabled: bool = False, channel_id: str = "mock_automated_api") -> None:
        self._enabled = enabled
        self._channel_id = channel_id

    @property
    def channel_name(self) -> str:
        return self._channel_id

    @property
    def display_name(self) -> str:
        return "Automated Takedown API (Mock Provider)"

    @property
    def channel_category(self) -> str:
        return "automated_api"

    @property
    def is_automated(self) -> bool:
        return True

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    def format_complaint_text(self, complaint: Any) -> str:
        return json.dumps(
            {
                "complaint_id": complaint.complaint_id,
                "target": complaint.suspected_domain,
                "narrative": complaint.narrative_sections,
            },
            indent=2,
        )

    def submit(self, complaint: Any, actor_username: str) -> ChannelSubmissionResult:
        if not self.is_enabled:
            return ChannelSubmissionResult(
                is_submitted=False,
                message="Automated reporting channel is disabled by default until verified and configured.",
                instructions="Enable the integration explicitly in configuration or use manual submission recording.",
            )

        # Simulated transmission
        import uuid
        mock_ref = f"REF-{uuid.uuid4().hex[:8].upper()}"
        return ChannelSubmissionResult(
            is_submitted=True,
            confirmation_reference=mock_ref,
            message=f"Complaint successfully submitted to automated API endpoint. Official reference: {mock_ref}",
            instructions="Automated API accepted the package and returned a confirmed reference number.",
            submission_payload={"ref": mock_ref, "submitted_at": datetime.now(timezone.utc).isoformat()},
        )


class ComplaintChannelRegistry:
    """Registry maintaining active and approved complaint reporting channel adapters."""

    _adapters: Dict[str, BaseReportingChannelAdapter] = {}

    @classmethod
    def register(cls, adapter: BaseReportingChannelAdapter) -> None:
        cls._adapters[adapter.channel_name] = adapter

    @classmethod
    def get_adapter(cls, name: str) -> Optional[BaseReportingChannelAdapter]:
        cls._ensure_defaults()
        return cls._adapters.get(name)

    @classmethod
    def list_channels(cls) -> List[Dict[str, Any]]:
        cls._ensure_defaults()
        results = []
        for a in cls._adapters.values():
            results.append({
                "channel_name": a.channel_name,
                "display_name": a.display_name,
                "category": a.channel_category,
                "is_automated": a.is_automated,
                "is_enabled": a.is_enabled,
                "portal_url": a.portal_url,
            })
        return results

    @classmethod
    def _ensure_defaults(cls) -> None:
        if not cls._adapters:
            cls.register(DownloadPackageAdapter())
            cls.register(ManualPortalAdapter())
            cls.register(RegistrarAbuseAdapter())
            cls.register(HostingProviderAdapter())
            cls.register(MockReportingChannelAdapter(enabled=False))
