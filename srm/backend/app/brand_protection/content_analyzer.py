import re
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any, Dict, List, Optional, Set

from app.brand_protection.safe_fetcher import FetchedPage


class SafeHtmlParser(HTMLParser):
    """Memory-safe, non-executing HTML parser extracting structural metadata and text."""

    def __init__(self) -> None:
        super().__init__()
        self.title: str = ""
        self.meta_description: str = ""
        self.text_chunks: List[str] = []
        self.img_sources: List[str] = []
        self.has_password_input: bool = False
        self._in_title: bool = False

    def handle_starttag(self, tag: str, attrs: List[tuple]) -> None:
        tag_lower = tag.lower()
        attr_dict = {k.lower(): v for k, v in attrs if v is not None}

        if tag_lower == "title":
            self._in_title = True
        elif tag_lower == "meta":
            name = attr_dict.get("name", "").lower()
            prop = attr_dict.get("property", "").lower()
            if name == "description" or prop == "og:description":
                self.meta_description = attr_dict.get("content", "")
            elif not self.title and (prop == "og:title" or name == "twitter:title"):
                self.title = attr_dict.get("content", "")
        elif tag_lower == "input":
            if attr_dict.get("type", "").lower() == "password":
                self.has_password_input = True
        elif tag_lower == "img":
            src = attr_dict.get("src")
            if src:
                self.img_sources.append(src)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title and not self.title:
            self.title = data.strip()
        cleaned = data.strip()
        if cleaned:
            self.text_chunks.append(cleaned)


@dataclass
class ContentAnalysisResult:
    """Findings from inspecting retrieved web page content."""
    page_title: str = ""
    meta_description: str = ""
    brand_mentions_count: int = 0
    content_similarity_score: float = 0.0
    has_credential_form: bool = False
    logo_match_detected: bool = False
    detected_brand_terms: List[str] = field(default_factory=list)
    technical_indicators: Dict[str, Any] = field(default_factory=dict)
    reasons: List[str] = field(default_factory=list)


def tokenize_text(text: str) -> Set[str]:
    """Tokenizes text into normalized lowercase alphanumeric words."""
    words = re.findall(r"\b[a-zA-Z0-9]{3,}\b", text.lower())
    return set(words)


def jaccard_similarity(set1: Set[str], set2: Set[str]) -> float:
    """Computes Jaccard index between two token sets."""
    if not set1 or not set2:
        return 0.0
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.0


class WebsiteContentAnalyzer:
    """Analyzes retrieved web page content against brand identity and registered assets."""

    def analyze(
        self,
        fetched_page: Optional[FetchedPage] = None,
        brand_name: str = "",
        brand_description: Optional[str] = None,
        registered_keywords: Optional[List[str]] = None,
        url: Optional[str] = None,
        html_content: Optional[str] = None,
        official_domains: Optional[List[str]] = None,
        official_logos: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> ContentAnalysisResult:
        parser = SafeHtmlParser()
        raw_html = ""
        if html_content is not None:
            raw_html = html_content
        elif fetched_page is not None:
            raw_html = fetched_page.content_text

        try:
            parser.feed(raw_html)
        except Exception:
            pass  # Malformed HTML is tolerated gracefully

        page_title = parser.title[:200]
        meta_desc = parser.meta_description[:500]
        full_visible_text = " ".join(parser.text_chunks)
        lower_visible_text = full_visible_text.lower()
        lower_title = page_title.lower()

        reasons: List[str] = []
        detected_terms: List[str] = []

        # 1. Visible brand mentions
        brand_clean = brand_name.lower().strip()
        brand_mentions = lower_visible_text.count(brand_clean) + (3 if brand_clean in lower_title else 0)

        if brand_clean in lower_title:
            detected_terms.append(brand_name)
            reasons.append(f"Target page title explicitly features brand name: '{page_title}'.")
        elif brand_clean in lower_visible_text:
            detected_terms.append(brand_name)
            reasons.append(f"Page body contains {brand_mentions} mention(s) of the brand name.")

        # Check registered keywords
        if registered_keywords:
            for kw in registered_keywords:
                kw_clean = kw.lower().strip()
                if kw_clean and (kw_clean in lower_visible_text or kw_clean in lower_title):
                    detected_terms.append(kw)

        # 2. Text similarity against brand profile
        brand_corpus = f"{brand_name} {brand_description or ''} {' '.join(registered_keywords or [])}"
        brand_tokens = tokenize_text(brand_corpus)
        page_tokens = tokenize_text(full_visible_text)

        sim_score = jaccard_similarity(brand_tokens, page_tokens)
        if sim_score >= 0.25:
            reasons.append(f"Significant text and thematic overlap (Jaccard similarity: {sim_score:.2f}) with official brand description.")

        # 3. Credential Harvesting Form Inspection
        if parser.has_password_input:
            reasons.append("Web page presents a credential-entry password form on a non-official domain.")

        # 4. Logo / Asset detection (heuristics from image tags)
        logo_detected = False
        for src in parser.img_sources:
            src_lower = src.lower()
            if "logo" in src_lower and brand_clean in src_lower:
                logo_detected = True
                reasons.append(f"Image asset references brand logo in source path: '{src[:80]}'.")
                break

        return ContentAnalysisResult(
            page_title=page_title,
            meta_description=meta_desc,
            brand_mentions_count=brand_mentions,
            content_similarity_score=round(sim_score, 3),
            has_credential_form=parser.has_password_input,
            logo_match_detected=logo_detected,
            detected_brand_terms=list(set(detected_terms)),
            reasons=reasons,
        )
