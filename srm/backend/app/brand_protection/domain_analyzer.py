import idna
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Set, Tuple

from app.brand_protection.domain_utils import normalize_domain

# Common visual confusable homoglyph map (non-Latin to Latin equivalents)
HOMOGLYPH_MAP: Dict[str, str] = {
    # Cyrillic
    "\u0430": "a", "\u0441": "c", "\u0435": "e", "\u043e": "o", "\u0440": "p",
    "\u0455": "s", "\u0445": "x", "\u0443": "y", "\u0456": "i", "\u0458": "j",
    # Greek
    "\u03bf": "o", "\u03bd": "v", "\u03c1": "p", "\u03c9": "w",
    # Common character substitutions (leet speak)
    "0": "o", "1": "l", "3": "e", "5": "s", "@": "a", "$": "s",
}

# High-risk brand impersonation keywords used in combosquatting
SUSPICIOUS_BRAND_KEYWORDS: Set[str] = {
    "login", "signin", "auth", "verify", "verification", "secure", "security",
    "account", "portal", "update", "checkout", "billing", "support", "helpdesk",
    "recover", "wallet", "banking", "connect", "token", "password", "service",
}


@dataclass
class DomainAnalysisResult:
    """Detailed structural and lexical analysis of a suspicious domain."""
    canonical_domain: str
    is_official_domain: bool = False
    attack_vector: str = "domain_typosquat"
    domain_similarity_score: float = 0.0
    homoglyphs_detected: List[Dict[str, str]] = field(default_factory=list)
    suspicious_keywords_found: List[str] = field(default_factory=list)
    subdomain_deception_detected: bool = False
    closest_official_domain: Optional[str] = None
    reasons: List[str] = field(default_factory=list)

    @property
    def is_lookalike(self) -> bool:
        return (
            not self.is_official_domain
            and (
                self.domain_similarity_score >= 0.70
                or bool(self.homoglyphs_detected)
                or self.subdomain_deception_detected
                or bool(self.suspicious_keywords_found)
            )
        )

    @property
    def similarity_score(self) -> float:
        return self.domain_similarity_score


def analyze_lookalike(
    candidate_domain: str,
    brand_name: str,
    official_domains: List[str],
) -> DomainAnalysisResult:
    """Convenience helper executing DomainAnalyzer().analyze(...)."""
    return DomainAnalyzer().analyze(
        suspicious_domain_input=candidate_domain,
        brand_name=brand_name,
        official_domains=official_domains,
    )


def levenshtein_similarity(s1: str, s2: str) -> float:
    """Computes normalized edit similarity between 0.0 and 1.0."""
    if s1 == s2:
        return 1.0
    if not s1 or not s2:
        return 0.0

    # Dynamic programming Levenshtein distance
    len1, len2 = len(s1), len(s2)
    dp = [[0] * (len2 + 1) for _ in range(len1 + 1)]

    for i in range(len1 + 1):
        dp[i][0] = i
    for j in range(len2 + 1):
        dp[0][j] = j

    for i in range(1, len1 + 1):
        for j in range(1, len2 + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,      # deletion
                dp[i][j - 1] + 1,      # insertion
                dp[i - 1][j - 1] + cost  # substitution
            )

    max_len = max(len1, len2)
    distance = dp[len1][len2]
    return max(0.0, 1.0 - (distance / max_len))


def jaro_winkler_similarity(s1: str, s2: str) -> float:
    """Standard sequence matcher ratio approximating Jaro-Winkler prefix weighting."""
    return SequenceMatcher(None, s1, s2).ratio()


class DomainAnalyzer:
    """Analyzes a suspicious candidate domain against a registered brand profile and official domains."""

    def analyze(
        self,
        suspicious_domain_input: str,
        brand_name: str,
        official_domains: List[str],
    ) -> DomainAnalysisResult:
        canonical = normalize_domain(suspicious_domain_input)
        brand_clean = brand_name.lower().strip()
        brand_slug = brand_clean.replace(" ", "")

        # 1. Exact match check against verified official domains
        for off_dom in official_domains:
            off_norm = normalize_domain(off_dom)
            if canonical == off_norm:
                return DomainAnalysisResult(
                    canonical_domain=canonical,
                    is_official_domain=True,
                    attack_vector="authorized_domain",
                    domain_similarity_score=1.0,
                    closest_official_domain=off_norm,
                    reasons=["Exact match with verified official brand domain."],
                )

        reasons: List[str] = []
        homoglyphs: List[Dict[str, str]] = []

        # 2. Extract domain core name without TLD
        parts = canonical.split(".")
        core_domain = parts[0]
        full_subdomains = ".".join(parts[:-1])

        # 3. Unicode and Homoglyph Analysis
        decoded_punycode = ""
        try:
            decoded_punycode = idna.decode(canonical)
        except Exception:
            decoded_punycode = canonical

        is_punycode = canonical.startswith("xn--") or "xn--" in canonical
        if is_punycode or decoded_punycode != canonical:
            for char in decoded_punycode:
                if char in HOMOGLYPH_MAP:
                    homoglyphs.append({
                        "character": char,
                        "resembles": HOMOGLYPH_MAP[char],
                        "unicode": f"U+{ord(char):04X}",
                    })
            if homoglyphs:
                reasons.append(
                    f"Internationalized homoglyph spoofing detected ({len(homoglyphs)} lookalike character substitutions)."
                )

        # 4. Subdomain Deception Analysis (e.g. acme.com.attacker-site.org)
        subdomain_deception = False
        for off_dom in official_domains:
            off_norm = normalize_domain(off_dom)
            if off_norm in canonical and canonical != off_norm:
                subdomain_deception = True
                reasons.append(
                    f"Subdomain deception detected: official domain '{off_norm}' embedded in '{canonical}'."
                )

        # Also check if brand name is in a subdomain while root is different
        if len(parts) > 2 and brand_slug in parts[0] and parts[1] not in brand_slug:
            subdomain_deception = True
            reasons.append(f"Brand name '{brand_name}' appears in subdomain prefix of third-party domain.")

        # 5. Combosquatting / Keyword Analysis
        keywords_found: List[str] = []
        for kw in SUSPICIOUS_BRAND_KEYWORDS:
            if kw in core_domain:
                keywords_found.append(kw)

        if keywords_found and (brand_slug in core_domain or any(s in core_domain for s in [brand_slug[:4]])):
            reasons.append(
                f"Combosquatting identified: brand name combined with sensitive security keywords: {', '.join(keywords_found)}."
            )

        # 6. Lexical Similarity to Official Domains
        max_similarity = 0.0
        closest_dom: Optional[str] = None

        for off_dom in official_domains:
            off_core = normalize_domain(off_dom).split(".")[0]
            sim_core = max(
                levenshtein_similarity(core_domain, off_core),
                jaro_winkler_similarity(core_domain, off_core),
            )
            sim_full = max(
                levenshtein_similarity(canonical, normalize_domain(off_dom)),
                jaro_winkler_similarity(canonical, normalize_domain(off_dom)),
            )
            sim = max(sim_core, sim_full)
            if sim > max_similarity:
                max_similarity = sim
                closest_dom = normalize_domain(off_dom)

        # Also compare core domain with brand slug
        brand_sim = max(
            levenshtein_similarity(core_domain, brand_slug),
            jaro_winkler_similarity(core_domain, brand_slug),
        )
        overall_similarity = max(max_similarity, brand_sim)

        # Direct containment of brand slug with sensitive keywords or subdomains represents intentional targeting
        if brand_slug in core_domain and keywords_found:
            combosquat_score = 0.75 + min(0.15, len(keywords_found) * 0.05)
            overall_similarity = max(overall_similarity, combosquat_score)
        elif subdomain_deception:
            overall_similarity = max(overall_similarity, 0.85)

        # Determine attack vector classification
        attack_vector = "domain_typosquat"
        if homoglyphs:
            attack_vector = "homoglyph_idn"
        elif subdomain_deception:
            attack_vector = "subdomain_deception"
        elif keywords_found:
            attack_vector = "combosquat"
        elif overall_similarity >= 0.70:
            attack_vector = "domain_typosquat"
        else:
            attack_vector = "brand_impersonation"

        if overall_similarity >= 0.85 and not homoglyphs and not subdomain_deception:
            reasons.append(
                f"High lexical similarity ({overall_similarity:.2f}) to official domain '{closest_dom or brand_slug}'."
            )
        elif overall_similarity >= 0.65:
            reasons.append(f"Moderate look-alike similarity ({overall_similarity:.2f}) detected.")

        return DomainAnalysisResult(
            canonical_domain=canonical,
            is_official_domain=False,
            attack_vector=attack_vector,
            domain_similarity_score=round(overall_similarity, 3),
            homoglyphs_detected=homoglyphs,
            suspicious_keywords_found=keywords_found,
            subdomain_deception_detected=subdomain_deception,
            closest_official_domain=closest_dom,
            reasons=reasons,
        )
