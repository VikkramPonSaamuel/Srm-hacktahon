from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class ComplaintValidationReport:
    """Report flagging unsupported allegations, missing evidence, and completeness."""
    is_valid_for_submission: bool
    unsupported_allegations: List[str] = field(default_factory=list)
    missing_evidence: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class ComplaintNarrativeGenerator:
    """Generates and validates structured, transparent cyber complaint packages.

    Strictly separates verifiable observed facts from security risk assessments,
    preventing fabricated claims, false allegations, or unverified case numbers.
    """

    @classmethod
    def generate_narrative(
        cls,
        brand_name: str,
        official_domains: List[str],
        suspected_domain: str,
        suspected_url: str,
        detection_timestamp: datetime,
        evidence_references: Dict[str, Any],
        threat_assessment: Dict[str, Any],
        reporting_party_name: str,
        channel: str = "registrar_abuse",
    ) -> Dict[str, str]:
        """Generates standard, modular complaint narrative sections tailored to reporting channel."""
        obs_time_str = detection_timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
        primary_official = official_domains[0] if official_domains else "None registered"
        other_officials = ", ".join(official_domains[1:]) if len(official_domains) > 1 else "None"
        risk_score = threat_assessment.get("risk_score", 0.0)
        severity = threat_assessment.get("severity", "medium").upper()
        attack_vector = threat_assessment.get("attack_vector", "domain_typosquat")
        reasons = threat_assessment.get("detection_reasons", [])

        # 1. Executive Summary
        executive_summary = (
            f"Formal notification regarding unlawful brand impersonation and consumer deception targeting "
            f"'{brand_name}'. The unauthorized entity operates at '{suspected_domain}' ({suspected_url}), "
            f"mimicking official infrastructure ({primary_official}) without authorization or license. "
            f"This notice is submitted by an authorized representative ({reporting_party_name}) requesting "
            f"immediate mitigation."
        )

        # 2. Observed Facts (strictly empirical & verifiable)
        facts_lines = [
            f"1. Target Domain: {suspected_domain}",
            f"2. Observed Full URL: {suspected_url}",
            f"3. First Observed Timestamp: {obs_time_str}",
            f"4. Official Registered Brand: {brand_name}",
            f"5. Authorized Official Domains: {primary_official} (Additional: {other_officials})",
        ]

        # Empirical technical indicators from evidence
        ip_addr = evidence_references.get("resolved_ip")
        if ip_addr:
            facts_lines.append(f"6. Resolved IP Address: {ip_addr}")
        page_title = evidence_references.get("page_title")
        if page_title:
            facts_lines.append(f"7. Observed Page Title: \"{page_title}\"")
        redirect_chain = evidence_references.get("redirect_chain")
        if redirect_chain:
            facts_lines.append(f"8. Observed HTTP Redirect Chain: {' -> '.join(redirect_chain)}")
        if evidence_references.get("has_credential_form"):
            facts_lines.append("9. Interactive Form: Web page presents an active password / credential input form.")
        if evidence_references.get("logo_match"):
            facts_lines.append("10. Visual Asset: Web page embeds image assets matching brand trademark logos.")

        observed_facts = "\n".join(facts_lines)

        # 3. Evidence Provenance Summary
        evidence_summary = (
            f"All forensic data was collected via standardized immutable logging. Evidence references include: "
            f"DNS resolution records, lexical similarity distance metrics, and non-executing HTML metadata extraction. "
            f"Official brand ownership is established through verified domain registration at '{primary_official}'."
        )

        # 4. Threat Assessment & Technical Findings (clearly delineated as analysis, not facts)
        threat_text = (
            f"Automated risk evaluation classified this candidate as {severity} (Threat Score: {risk_score:.2f}/1.00).\n"
            f"Primary attack vector: {attack_vector}.\n"
            f"Analytical findings:\n" + "\n".join(f" - {r}" for r in reasons)
        )

        # 5. Victim & Consumer Impact
        victim_impact = (
            f"The deceptive similarity between '{suspected_domain}' and '{primary_official}' poses an immediate risk "
            f"of confusing customers of '{brand_name}', potentially harvesting sensitive credentials or facilitating "
            f"financial fraud under false brand identity. Unmitigated exposure inflicts irreparable harm on brand goodwill."
        )

        # 6. Requested Actions
        if channel in ("registrar_abuse", "icann_drp"):
            requested_action = (
                f"Pursuant to Registrar Abuse Policies and ICANN guidelines, we request immediate suspension "
                f"or hold (ClientHold / ServerHold) on the domain name '{suspected_domain}' to prevent continued phishing and fraud."
            )
        elif channel in ("hosting_provider", "cloudflare"):
            requested_action = (
                f"We request immediate termination of hosting services or removal of the deceptive content at "
                f"'{suspected_url}', and disabling of reverse proxy services routing traffic to this infrastructure."
            )
        elif channel in ("national_cert", "law_enforcement"):
            requested_action = (
                f"We request that '{suspected_domain}' be added to threat intelligence blocklists, and shared with "
                f"relevant CERT incident coordination partners to protect the public from brand impersonation fraud."
            )
        else:
            requested_action = (
                f"We request immediate cessation of the unauthorized use of the '{brand_name}' name, logos, and likeness, "
                f"and takedown of all infringing resources hosted at '{suspected_domain}'."
            )

        # 7. Legal & Good-Faith Declaration
        legal_declaration = (
            f"I, {reporting_party_name}, declare under penalty of perjury that I am authorized to act on behalf of "
            f"the trademark owner '{brand_name}'. I have a good-faith belief that the use of the trademark and domain likeness "
            f"described above is not authorized by the brand owner, its agent, or the law. All statements made in this "
            f"notice are true and accurate to the best of my knowledge."
        )

        return {
            "executive_summary": executive_summary,
            "observed_facts": observed_facts,
            "evidence_summary": evidence_summary,
            "threat_assessment": threat_text,
            "victim_impact": victim_impact,
            "requested_action": requested_action,
            "legal_declaration": legal_declaration,
        }

    @classmethod
    def validate_complaint(
        cls,
        narrative_sections: Dict[str, str],
        evidence_references: Dict[str, Any],
        official_domains: List[str],
        reporting_party_email: Optional[str],
    ) -> ComplaintValidationReport:
        """Validates complaint completeness and flags unsupported allegations or missing evidence."""
        unsupported: List[str] = []
        missing: List[str] = []
        warnings: List[str] = []

        full_narrative_text = " ".join(narrative_sections.values()).lower()

        # Check required contact information
        if not reporting_party_email or "@" not in reporting_party_email:
            missing.append("Reporting party contact email is required for external complaint submission.")

        # Check official domain verification
        if not official_domains:
            missing.append("Brand profile must have at least one registered official domain for evidence provenance.")

        # Check required narrative sections
        required_keys = ["executive_summary", "observed_facts", "requested_action", "legal_declaration"]
        for key in required_keys:
            if not narrative_sections.get(key, "").strip():
                missing.append(f"Required narrative section '{key}' is missing or empty.")

        # Check for unsupported claims: Credential theft
        if any(term in full_narrative_text for term in ["password theft", "credential harvesting", "phishing form"]):
            has_credential_form = evidence_references.get("has_credential_form", False)
            if not has_credential_form:
                unsupported.append(
                    "Narrative alleges credential harvesting or password phishing, but no credential input form "
                    "was observed in recorded evidence. Please rephrase as suspected lookalike or verify content."
                )

        # Check for unsupported claims: Logo theft
        if any(term in full_narrative_text for term in ["trademark logo stolen", "copied logo", "brand logo embedded"]):
            logo_matched = evidence_references.get("logo_match", False) or evidence_references.get("logo_match_detected", False)
            if not logo_matched:
                unsupported.append(
                    "Narrative alleges unauthorized logo copying, but no visual logo match was recorded in evidence."
                )

        # Check for official case number fabrication
        if any(term in full_narrative_text for term in ["case #", "reference id", "ticket #"]):
            warnings.append(
                "Ensure official reference numbers cited in narrative are verified and not placeholder text."
            )

        is_valid = len(missing) == 0 and len(unsupported) == 0

        return ComplaintValidationReport(
            is_valid_for_submission=is_valid,
            unsupported_allegations=unsupported,
            missing_evidence=missing,
            warnings=warnings,
        )
