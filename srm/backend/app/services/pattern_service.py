from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.incident import Incident
from app.models.pattern import FailurePattern, PatternMatch
from app.patterns.detector import RuleBasedPatternDetector
from app.repositories.pattern_repository import PatternRepository
from app.schemas.incident import IncidentResponse
from app.schemas.pagination import PaginatedResponse
from app.schemas.pattern import (
    FailurePatternDetailResponse,
    FailurePatternResponse,
    PatternEvidenceResponse,
    PatternFrequencyPoint,
    PatternFrequencyResponse,
    PatternMatchEvidence,
    ReevaluateResponse,
)


class PatternService:
    """Business logic for historical failure pattern analytics and lifecycle management."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PatternRepository(db)

    def _find_pattern(self, identifier: str) -> FailurePattern:
        pattern = self.repo.get_by_pattern_id(identifier)
        if not pattern and identifier.isdigit():
            pattern = self.repo.get_by_id_with_matches(int(identifier))
        if not pattern:
            raise NotFoundError(message=f"Failure pattern '{identifier}' not found.")
        return pattern

    def list_patterns(
        self,
        skip: int = 0,
        limit: int = 50,
        service_name: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        failure_category: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> PaginatedResponse[FailurePatternResponse]:
        limit = min(limit, 100)
        items, total = self.repo.list_patterns(
            skip=skip,
            limit=limit,
            service_name=service_name,
            severity=severity,
            status=status,
            failure_category=failure_category,
            start_date=start_date,
            end_date=end_date,
        )

        return PaginatedResponse(
            items=[FailurePatternResponse.model_validate(p) for p in items],
            total=total,
            skip=skip,
            limit=limit,
            has_more=(skip + len(items)) < total,
        )

    def get_pattern(self, identifier: str) -> FailurePatternDetailResponse:
        pattern = self._find_pattern(identifier)

        evidence_list = []
        for m in pattern.matches:
            inc_id = m.incident.incident_id if m.incident else f"inc_ref_{m.incident_id}"
            reasons = m.match_reasons.get("reasons", []) if isinstance(m.match_reasons, dict) else []
            evidence_list.append(
                PatternMatchEvidence(
                    incident_id=inc_id,
                    matched_at=m.matched_at,
                    similarity_score=m.similarity_score,
                    match_reasons=reasons,
                )
            )

        resp = FailurePatternDetailResponse.model_validate(pattern)
        resp.evidence_matches = evidence_list
        return resp

    def get_pattern_incidents(self, identifier: str) -> List[IncidentResponse]:
        pattern = self._find_pattern(identifier)
        incidents = [m.incident for m in pattern.matches if m.incident]
        return [IncidentResponse.model_validate(i) for i in incidents]

    def get_pattern_frequency(self, identifier: str) -> PatternFrequencyResponse:
        pattern = self._find_pattern(identifier)

        date_counts: Dict[str, int] = defaultdict(int)
        for m in pattern.matches:
            dt_key = m.matched_at.strftime("%Y-%m-%d") if m.matched_at else "unknown"
            date_counts[dt_key] += 1

        freq_points = [
            PatternFrequencyPoint(date=k, count=v)
            for k, v in sorted(date_counts.items(), key=lambda x: x[0])
        ]

        return PatternFrequencyResponse(
            pattern_id=pattern.pattern_id,
            pattern_name=pattern.name,
            total_incidents=len(pattern.matches),
            frequency=freq_points,
        )

    def get_pattern_evidence(self, identifier: str) -> PatternEvidenceResponse:
        pattern = self._find_pattern(identifier)

        evidence_list = []
        for m in pattern.matches:
            inc_id = m.incident.incident_id if m.incident else f"inc_ref_{m.incident_id}"
            reasons = m.match_reasons.get("reasons", []) if isinstance(m.match_reasons, dict) else []
            evidence_list.append(
                PatternMatchEvidence(
                    incident_id=inc_id,
                    matched_at=m.matched_at,
                    similarity_score=m.similarity_score,
                    match_reasons=reasons,
                )
            )

        return PatternEvidenceResponse(
            pattern_id=pattern.pattern_id,
            pattern_name=pattern.name,
            confidence_score=pattern.confidence_score,
            detection_rules=pattern.detection_rules,
            matches=evidence_list,
        )

    def update_status(self, identifier: str, new_status: str) -> FailurePatternResponse:
        pattern = self._find_pattern(identifier)
        updated = self.repo.update_status(pattern, new_status)
        return FailurePatternResponse.model_validate(updated)

    def reevaluate_patterns(self) -> ReevaluateResponse:
        detector = RuleBasedPatternDetector(self.db)
        stats = detector.reevaluate_all_incidents()
        return ReevaluateResponse(**stats)
