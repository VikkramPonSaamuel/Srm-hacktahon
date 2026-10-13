from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.brand_protection.content_analyzer import ContentAnalysisResult
from app.brand_protection.domain_analyzer import DomainAnalysisResult


@dataclass
class ThreatAssessment:
    """Holistic threat assessment explaining risk score, severity, and evidence quality."""
    risk_score: float
    severity: str  # low, medium, high, critical
    confidence_score: float
    evidence_quality: str  # high, moderate, low, insufficient
    review_recommendation: str  # dismiss, monitor, investigate, escalate_takedown
    detection_reasons: List[str] = field(default_factory=list)
    evidence_references: Dict[str, Any] = field(default_factory=dict)
    missing_evidence: List[str] = field(default_factory=list)

    @property
    def attack_vector(self) -> str:
        return self.evidence_references.get("attack_vector", "domain_typosquat")


class ThreatScorer:
    """Calculates explainable threat score from domain, content, and intelligence signals."""

    @classmethod
    def score_impersonation(
        cls,
        domain_signal: DomainAnalysisResult,
        content_signal: Optional[ContentAnalysisResult] = None,
        metadata: Optional[Dict[str, Any]] = None,
        missing_evidence: Optional[List[str]] = None,
        has_historical_associations: bool = False,
    ) -> ThreatAssessment:
        scorer = cls()
        assessment = scorer.evaluate(
            domain_result=domain_signal,
            content_result=content_signal,
            feed_intel=metadata,
            has_historical_associations=has_historical_associations,
        )
        if missing_evidence:
            for item in missing_evidence:
                if item not in assessment.missing_evidence:
                    assessment.missing_evidence.append(item)
        return assessment

    def evaluate(
        self,
        domain_result: DomainAnalysisResult,
        content_result: Optional[ContentAnalysisResult] = None,
        feed_intel: Optional[Dict[str, Any]] = None,
        has_historical_associations: bool = False,
    ) -> ThreatAssessment:
        # Rule 1: Verified Official Domains are allowlisted with zero risk
        if domain_result.is_official_domain:
            return ThreatAssessment(
                risk_score=0.0,
                severity="low",
                confidence_score=1.0,
                evidence_quality="high",
                review_recommendation="dismiss",
                detection_reasons=["Domain matches an authorized, verified official brand domain."],
                evidence_references={"domain_type": "official_verified"},
                missing_evidence=[],
            )

        score = 0.0
        reasons: List[str] = list(domain_result.reasons)
        missing: List[str] = []
        evidence: Dict[str, Any] = {
            "canonical_domain": domain_result.canonical_domain,
            "attack_vector": domain_result.attack_vector,
            "domain_similarity": domain_result.domain_similarity_score,
            "closest_official_domain": domain_result.closest_official_domain,
        }

        # 1. Domain Similarity Signal (up to 0.35)
        score += domain_result.domain_similarity_score * 0.35

        # 2. High-Risk Lexical Modifiers
        if domain_result.homoglyphs_detected:
            score += 0.25
            evidence["homoglyphs"] = domain_result.homoglyphs_detected

        if domain_result.subdomain_deception_detected:
            score += 0.30
            evidence["subdomain_deception"] = True

        if domain_result.suspicious_keywords_found:
            score += 0.15
            evidence["suspicious_keywords"] = domain_result.suspicious_keywords_found

        # 3. Content Analysis Signals
        if content_result is not None:
            evidence["content_analysis"] = {
                "page_title": content_result.page_title,
                "brand_mentions": content_result.brand_mentions_count,
                "content_similarity": content_result.content_similarity_score,
                "has_credential_form": content_result.has_credential_form,
                "logo_match": content_result.logo_match_detected,
            }
            reasons.extend(content_result.reasons)

            if content_result.brand_mentions_count > 0:
                score += min(0.25, content_result.brand_mentions_count * 0.05)

            if content_result.has_credential_form:
                score += 0.35

            if content_result.logo_match_detected:
                score += 0.25

            score += content_result.content_similarity_score * 0.20
            confidence = 0.90
            quality = "high"
        else:
            missing.append("Website content could not be retrieved or inspected (network unreachable, timeout, or SSRF prevented).")
            confidence = 0.65 if (domain_result.homoglyphs_detected or domain_result.subdomain_deception_detected) else 0.50
            quality = "moderate" if domain_result.domain_similarity_score >= 0.70 else "low"

        # 4. Threat Intel & Historical Evidence
        if feed_intel and feed_intel.get("is_flagged_malicious"):
            score += 0.30
            reasons.append(f"Threat intelligence feed match: {feed_intel.get('feed_name', 'External Feed')}.")
            evidence["threat_feed"] = feed_intel

        if has_historical_associations:
            score += 0.10
            reasons.append("Historical impersonation attacks previously observed from the same infrastructure/registrar.")
            evidence["historical_threat_association"] = True

        # Clamp score between 0.0 and 1.0
        final_score = min(1.0, max(0.0, round(score, 3)))

        # Severity classification
        if final_score >= 0.85:
            severity = "critical"
            recommendation = "escalate_takedown"
        elif final_score >= 0.65:
            severity = "high"
            recommendation = "investigate"
        elif final_score >= 0.35:
            severity = "medium"
            recommendation = "monitor"
        else:
            severity = "low"
            recommendation = "dismiss"

        return ThreatAssessment(
            risk_score=final_score,
            severity=severity,
            confidence_score=confidence,
            evidence_quality=quality,
            review_recommendation=recommendation,
            detection_reasons=reasons,
            evidence_references=evidence,
            missing_evidence=missing,
        )
