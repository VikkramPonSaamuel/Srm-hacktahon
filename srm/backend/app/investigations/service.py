from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import NotFoundError
from app.core.logging import get_logger
from app.core.time import to_utc
from app.investigations.collector import IncidentEvidenceCollector
from app.investigations.deterministic import DeterministicRootCauseAnalyzer
from app.investigations.providers import (
    BaseLLMProvider,
    DeterministicFallbackProvider,
    MockLLMProvider,
    get_llm_provider,
)
from app.investigations.safety import format_sandboxed_prompt
from app.models.incident import Incident
from app.models.investigation import IncidentInvestigation
from app.models.playbook import RecoveryPlaybook
from app.playbooks.registry import ActionRegistry
from app.schemas.investigation import (
    IncidentComparisonItem,
    IncidentComparisonResponse,
    IncidentEvidence,
    InvestigationResponse,
    LLMInvestigationOutput,
    PlaybookPolicyValidation,
    PlaybookRecommendationItem,
    PlaybookRecommendationsResponse,
)

logger = get_logger("app.investigations.service")


class InvestigationService:
    """Service orchestrating evidence gathering, deterministic & LLM root-cause analysis, and safety policy enforcement."""

    def __init__(self, db: Session, llm_provider: Optional[BaseLLMProvider] = None) -> None:
        self.db = db
        self.collector = IncidentEvidenceCollector(db)
        self.deterministic_analyzer = DeterministicRootCauseAnalyzer()
        self.llm_provider = llm_provider or get_llm_provider()

    def analyze_incident(
        self,
        incident_id: str,
        force_mode: Optional[str] = None,
        notes: Optional[str] = None,
    ) -> InvestigationResponse:
        """
        Conducts an investigation on an incident.
        Combines multi-source evidence collection with deterministic rules and optional LLM assistance.
        """
        inc = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not inc:
            raise NotFoundError(f"Incident with ID '{incident_id}' not found.")

        # 1. Collect structured & sanitized evidence
        evidence = self.collector.collect(incident_id)

        # 2. Determine execution mode
        requested_mode = (force_mode or "").lower()
        use_llm = False
        if requested_mode == "deterministic":
            use_llm = False
        elif requested_mode in ["llm", "llm_assisted"]:
            use_llm = True
        elif settings.LLM_PROVIDER and settings.LLM_PROVIDER.lower() not in ["none", ""]:
            use_llm = True

        raw_model_response: Optional[Dict[str, Any]] = None
        analysis_mode = "deterministic"
        provider_name = "deterministic_engine"
        model_name = "rule_based_analyzer_v1"

        analysis_output: Optional[LLMInvestigationOutput] = None

        # 3. LLM-Assisted Analysis (Optional)
        if use_llm:
            try:
                system_goal = (
                    "Analyze this microservice incident evidence. Determine the root-cause hypothesis, "
                    "customer impact, failed component, supporting evidence, and recommended playbook."
                )
                prompt = format_sandboxed_prompt(system_goal, evidence.model_dump())
                logger.info(f"Dispatching sandboxed prompt to LLM provider for incident {incident_id}...")
                raw_response = self.llm_provider.generate_investigation(prompt)

                if raw_response:
                    analysis_output = LLMInvestigationOutput.model_validate(raw_response)
                    analysis_mode = "llm_assisted"
                    provider_name = getattr(self.llm_provider, "__class__", type(self.llm_provider)).__name__
                    model_name = getattr(self.llm_provider, "model_name", "configured_llm")
                    raw_model_response = raw_response
            except Exception as e:
                logger.warning(
                    f"LLM investigation failed or generated invalid schema ({e}). "
                    f"Falling back safely to deterministic root-cause analysis.",
                    exc_info=True,
                )
                analysis_mode = "fallback_deterministic"
                provider_name = "deterministic_fallback"

        # 4. Deterministic Analysis (Default & Fallback)
        if not analysis_output:
            analysis_output = self.deterministic_analyzer.analyze(evidence)
            if analysis_mode != "fallback_deterministic":
                analysis_mode = "deterministic"

        # 5. Deterministic Backend Policy Enforcement on Recommendations
        policy_eval = self._validate_playbook_policy(analysis_output.recommended_playbook_id, inc)

        # If policy blocks automatic execution, ensure human investigation flag is set appropriately
        human_req = analysis_output.human_investigation_required
        if policy_eval.requires_human_approval or not policy_eval.can_execute_automatically:
            if policy_eval.blocked_reason:
                human_req = True

        # 6. Persist Investigation Record
        analysis_id = f"inv_{uuid.uuid4().hex[:16]}"
        inv_record = IncidentInvestigation(
            analysis_id=analysis_id,
            incident_id=inc.id,
            incident_ref=inc.incident_id,
            analysis_mode=analysis_mode,
            provider=provider_name,
            model_name=model_name,
            summary=analysis_output.summary,
            customer_impact=analysis_output.customer_impact,
            failed_component=analysis_output.failed_component,
            failed_step=analysis_output.failed_step,
            root_cause_hypothesis=analysis_output.root_cause_hypothesis,
            alternative_explanations=analysis_output.alternative_explanations,
            confidence_score=analysis_output.confidence_score,
            evidence_assessment=analysis_output.evidence_assessment,
            human_investigation_required=human_req,
            recommended_playbook_id=analysis_output.recommended_playbook_id,
            recommended_action=analysis_output.recommended_countermeasure,
            playbook_eligibility=policy_eval.model_dump(),
            evidence_references={
                "step_count": len(evidence.all_step_executions),
                "snapshot_count": len(evidence.service_health_snapshots),
                "pattern_matches": [p["pattern_id"] for p in evidence.pattern_matches],
                "recovery_executions": [r["execution_id"] for r in evidence.recovery_executions],
            },
            related_incident_ids=analysis_output.related_historical_incidents,
            matching_pattern_ids=analysis_output.matching_known_patterns,
            raw_model_response=raw_model_response,
            is_demo=inc.is_demo,
        )

        self.db.add(inv_record)
        self.db.commit()
        self.db.refresh(inv_record)

        return InvestigationResponse(
            analysis_id=inv_record.analysis_id,
            incident_id=inv_record.incident_ref,
            analysis_mode=inv_record.analysis_mode,
            provider=inv_record.provider,
            model_name=inv_record.model_name,
            summary=inv_record.summary,
            customer_impact=inv_record.customer_impact,
            failed_component=inv_record.failed_component,
            failed_step=inv_record.failed_step,
            root_cause_hypothesis=inv_record.root_cause_hypothesis,
            alternative_explanations=inv_record.alternative_explanations,
            confidence_score=inv_record.confidence_score,
            evidence_assessment=inv_record.evidence_assessment,
            human_investigation_required=inv_record.human_investigation_required,
            recommended_playbook_id=inv_record.recommended_playbook_id,
            recommended_action=inv_record.recommended_action,
            playbook_eligibility=inv_record.playbook_eligibility,
            evidence_references=inv_record.evidence_references,
            related_incident_ids=inv_record.related_incident_ids,
            matching_pattern_ids=inv_record.matching_pattern_ids,
            created_at=inv_record.created_at,
        )

    def _validate_playbook_policy(
        self,
        recommended_playbook_id: Optional[str],
        incident: Incident,
    ) -> PlaybookPolicyValidation:
        """
        Validates recommended countermeasure against backend safety rules.
        Never allows unapproved, disabled, or unallowlisted actions to claim automated eligibility.
        """
        if not recommended_playbook_id:
            return PlaybookPolicyValidation(
                playbook_id=None,
                can_execute_automatically=False,
                requires_human_approval=True,
                blocked_reason="No automated playbook recommended for this failure profile.",
            )

        pb = self.db.query(RecoveryPlaybook).filter(
            RecoveryPlaybook.playbook_id == recommended_playbook_id
        ).first()

        if not pb:
            return PlaybookPolicyValidation(
                playbook_id=recommended_playbook_id,
                can_execute_automatically=False,
                requires_human_approval=True,
                blocked_reason=f"Recommended playbook '{recommended_playbook_id}' does not exist in registry.",
            )

        # 1. Approval check
        if pb.approval_status != "approved":
            return PlaybookPolicyValidation(
                playbook_id=pb.playbook_id,
                playbook_name=pb.name,
                is_approved=False,
                is_enabled=pb.is_enabled,
                can_execute_automatically=False,
                requires_human_approval=True,
                blocked_reason=f"Playbook is in '{pb.approval_status}' status. Draft or unapproved playbooks are forbidden from executing.",
            )

        # 2. Enabled check
        if not pb.is_enabled:
            return PlaybookPolicyValidation(
                playbook_id=pb.playbook_id,
                playbook_name=pb.name,
                is_approved=True,
                is_enabled=False,
                can_execute_automatically=False,
                requires_human_approval=True,
                blocked_reason="Playbook is currently disabled by operator policy.",
            )

        # 3. Action allowlist and high-risk approval check
        allowlisted: List[str] = []
        requires_approval = False
        approval_reasons: List[str] = []

        for action in pb.actions:
            if not ActionRegistry.is_action_allowlisted(action.action_type):
                return PlaybookPolicyValidation(
                    playbook_id=pb.playbook_id,
                    playbook_name=pb.name,
                    is_approved=True,
                    is_enabled=True,
                    can_execute_automatically=False,
                    requires_human_approval=True,
                    blocked_reason=f"Playbook contains unallowlisted action '{action.action_type}'.",
                )
            allowlisted.append(action.action_type)
            if action.requires_approval or action.risk_level in ["high", "critical"]:
                requires_approval = True
                approval_reasons.append(f"Action '{action.action_type}' has {action.risk_level} risk")

        # 4. Payment safety check: never blindly retry indeterminate payment
        if incident.failure_category == "primary_payment_timeout":
            has_reconciliation = any(a.action_type == "reconcile_payment_status" for a in pb.actions)
            if not has_reconciliation:
                return PlaybookPolicyValidation(
                    playbook_id=pb.playbook_id,
                    playbook_name=pb.name,
                    is_approved=True,
                    is_enabled=True,
                    can_execute_automatically=False,
                    requires_human_approval=True,
                    blocked_reason="Payment timeout outcome is indeterminate; missing mandatory status reconciliation action.",
                )

        return PlaybookPolicyValidation(
            playbook_id=pb.playbook_id,
            playbook_name=pb.name,
            is_approved=True,
            is_enabled=True,
            can_execute_automatically=not requires_approval,
            requires_human_approval=requires_approval,
            blocked_reason="; ".join(approval_reasons) if approval_reasons else None,
            allowlisted_actions=allowlisted,
        )

    def get_analysis_history(self, incident_id: str) -> List[InvestigationResponse]:
        """Retrieves chronological investigation records for an incident."""
        inc = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not inc:
            raise NotFoundError(f"Incident with ID '{incident_id}' not found.")

        investigations = self.db.query(IncidentInvestigation).filter(
            IncidentInvestigation.incident_id == inc.id
        ).order_by(IncidentInvestigation.created_at.desc()).all()

        return [
            InvestigationResponse(
                analysis_id=inv.analysis_id,
                incident_id=inv.incident_ref,
                analysis_mode=inv.analysis_mode,
                provider=inv.provider,
                model_name=inv.model_name,
                summary=inv.summary,
                customer_impact=inv.customer_impact,
                failed_component=inv.failed_component,
                failed_step=inv.failed_step,
                root_cause_hypothesis=inv.root_cause_hypothesis,
                alternative_explanations=inv.alternative_explanations,
                confidence_score=inv.confidence_score,
                evidence_assessment=inv.evidence_assessment,
                human_investigation_required=inv.human_investigation_required,
                recommended_playbook_id=inv.recommended_playbook_id,
                recommended_action=inv.recommended_action,
                playbook_eligibility=inv.playbook_eligibility,
                evidence_references=inv.evidence_references,
                related_incident_ids=inv.related_incident_ids,
                matching_pattern_ids=inv.matching_pattern_ids,
                created_at=inv.created_at,
            )
            for inv in investigations
        ]

    def get_analysis_by_id(self, analysis_id: str) -> InvestigationResponse:
        """Retrieves a single investigation record by ID."""
        inv = self.db.query(IncidentInvestigation).filter(
            IncidentInvestigation.analysis_id == analysis_id
        ).first()
        if not inv:
            raise NotFoundError(f"Investigation record with ID '{analysis_id}' not found.")

        return InvestigationResponse(
            analysis_id=inv.analysis_id,
            incident_id=inv.incident_ref,
            analysis_mode=inv.analysis_mode,
            provider=inv.provider,
            model_name=inv.model_name,
            summary=inv.summary,
            customer_impact=inv.customer_impact,
            failed_component=inv.failed_component,
            failed_step=inv.failed_step,
            root_cause_hypothesis=inv.root_cause_hypothesis,
            alternative_explanations=inv.alternative_explanations,
            confidence_score=inv.confidence_score,
            evidence_assessment=inv.evidence_assessment,
            human_investigation_required=inv.human_investigation_required,
            recommended_playbook_id=inv.recommended_playbook_id,
            recommended_action=inv.recommended_action,
            playbook_eligibility=inv.playbook_eligibility,
            evidence_references=inv.evidence_references,
            related_incident_ids=inv.related_incident_ids,
            matching_pattern_ids=inv.matching_pattern_ids,
            created_at=inv.created_at,
        )

    def get_evidence_by_analysis_id(self, analysis_id: str) -> Dict[str, Any]:
        """Retrieves raw evidence package and references associated with an investigation."""
        inv = self.db.query(IncidentInvestigation).filter(
            IncidentInvestigation.analysis_id == analysis_id
        ).first()
        if not inv:
            raise NotFoundError(f"Investigation record with ID '{analysis_id}' not found.")

        evidence = self.collector.collect(inv.incident_ref)
        return {
            "analysis_id": inv.analysis_id,
            "incident_id": inv.incident_ref,
            "evidence_references": inv.evidence_references,
            "collected_evidence": evidence.model_dump(),
        }

    def compare_incident(self, incident_id: str) -> IncidentComparisonResponse:
        """Compares incident against past historical incidents to determine failure similarity."""
        inc = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not inc:
            raise NotFoundError(f"Incident with ID '{incident_id}' not found.")

        candidates = self.db.query(Incident).filter(
            Incident.id != inc.id
        ).order_by(Incident.detected_at.desc()).limit(15).all()

        comparisons: List[IncidentComparisonItem] = []
        for cand in candidates:
            score = 0.0
            same_svc = (cand.service_name == inc.service_name)
            same_cat = (cand.failure_category == inc.failure_category)

            if same_svc:
                score += 0.45
            if same_cat:
                score += 0.45
            if cand.severity == inc.severity:
                score += 0.10

            if score >= 0.40:
                comparisons.append(
                    IncidentComparisonItem(
                        incident_id=cand.incident_id,
                        similarity_score=round(score, 2),
                        shared_service=same_svc,
                        shared_failure_category=same_cat,
                        title=cand.title,
                        detected_at=cand.detected_at,
                        status=cand.status,
                        resolution_summary=cand.resolution_summary,
                    )
                )

        comparisons.sort(key=lambda x: x.similarity_score, reverse=True)
        summary = (
            f"Found {len(comparisons)} similar historical incidents sharing service or failure classification."
            if comparisons
            else "No significantly similar historical incidents found."
        )

        return IncidentComparisonResponse(
            target_incident_id=inc.incident_id,
            comparisons=comparisons,
            comparison_summary=summary,
        )

    def get_playbook_recommendations(self, incident_id: str) -> PlaybookRecommendationsResponse:
        """Retrieves and evaluates candidate playbooks against safety policy for an incident."""
        inc = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not inc:
            raise NotFoundError(f"Incident with ID '{incident_id}' not found.")

        playbooks = self.db.query(RecoveryPlaybook).all()
        recommendations: List[PlaybookRecommendationItem] = []

        for pb in playbooks:
            # Check applicability
            app_svc = pb.applicable_services or []
            app_j = pb.applicable_journeys or []
            trig_conds = pb.trigger_conditions or {}

            match = False
            conf = 0.5
            if inc.service_name in app_svc:
                match = True
                conf += 0.2
            if inc.journey and inc.journey.journey_type in app_j:
                match = True
                conf += 0.1
            if trig_conds.get("failure_category") == inc.failure_category:
                match = True
                conf += 0.2

            if match:
                policy = self._validate_playbook_policy(pb.playbook_id, inc)
                recommendations.append(
                    PlaybookRecommendationItem(
                        playbook_id=pb.playbook_id,
                        name=pb.name,
                        recovery_strategy=pb.recovery_strategy,
                        approval_status=pb.approval_status,
                        is_enabled=pb.is_enabled,
                        can_run=policy.can_execute_automatically,
                        requires_approval=policy.requires_human_approval,
                        policy_notes=policy.blocked_reason or "Complies with execution policy.",
                        confidence=min(1.0, round(conf, 2)),
                    )
                )

        recommendations.sort(key=lambda x: x.confidence, reverse=True)
        return PlaybookRecommendationsResponse(
            incident_id=inc.incident_id,
            recommendations=recommendations,
        )
