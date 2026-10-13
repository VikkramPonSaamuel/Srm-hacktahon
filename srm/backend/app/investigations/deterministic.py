from typing import Any, Dict, List, Optional
from app.schemas.investigation import IncidentEvidence, LLMInvestigationOutput


class DeterministicRootCauseAnalyzer:
    """Deterministic, rule-based root cause analysis layer for known failure scenarios."""

    def analyze(self, evidence: IncidentEvidence) -> LLMInvestigationOutput:
        cat = (evidence.failure_category or "").lower()
        svc = (evidence.service_name or "").lower()
        failed_step = evidence.failed_step
        err_code = (failed_step.get("error_code") if failed_step else "") or ""
        http_stat = (failed_step.get("http_status") if failed_step else None)

        sim_incidents = [i["incident_id"] for i in evidence.similar_historical_incidents]
        matched_patterns = [p["pattern_name"] for p in evidence.pattern_matches]

        # 1. Primary Payment Gateway Timeout
        if "primary_payment_timeout" in cat or "gateway_timeout" in err_code.lower() or (http_stat == 504 and "payment" in svc):
            return LLMInvestigationOutput(
                summary="Primary payment gateway latency exceeded SLA timeout during transaction authorization.",
                customer_impact="Customer checkout is halted with indeterminate payment status; high financial risk of duplicate charging if blindly retried.",
                failed_component=evidence.service_name or "payment-service",
                failed_step=failed_step.get("step_name") if failed_step else "Payment Gateway Authorization",
                evidence_supporting_diagnosis=[
                    f"Step '{failed_step.get('step_name') if failed_step else 'Payment'}' exceeded timeout SLA",
                    f"HTTP Status: {http_stat or 504}, Error code: {err_code or 'GATEWAY_TIMEOUT'}",
                    "Downstream processor failed to acknowledge charge before client threshold expired",
                ],
                root_cause_hypothesis="Upstream payment gateway connection timeout during authorization handshake. Transaction state is indeterminate.",
                alternative_explanations=[
                    "Acquiring bank network latency spike",
                    "Transient TCP socket timeout during TLS handshake with external processor",
                ],
                related_historical_incidents=sim_incidents,
                matching_known_patterns=matched_patterns or ["Primary Payment Gateway Timeout"],
                recommended_countermeasure="Initiate payment status inquiry to reconcile charge before triggering secondary gateway failover.",
                recommended_playbook_id="demo_pb_payment_failover",
                confidence_score=0.95,
                evidence_assessment="conclusive",
                human_investigation_required=False,
            )

        # 2. Authentication 5xx Crash
        if "auth_5xx" in cat or (http_stat and http_stat >= 500 and "auth" in svc) or "auth_crash" in err_code.lower():
            return LLMInvestigationOutput(
                summary="Authentication microservice raised unhandled 5xx exception during identity verification.",
                customer_impact="End users cannot authenticate, renew credentials, or proceed with protected business journeys.",
                failed_component=evidence.service_name or "auth-service",
                failed_step=failed_step.get("step_name") if failed_step else "Customer Login",
                evidence_supporting_diagnosis=[
                    f"HTTP {http_stat or 500} server error returned by auth-service",
                    f"Error code: {err_code or 'INTERNAL_AUTH_CRASH'}",
                    "Repeated authentication failures observed in step execution telemetry",
                ],
                root_cause_hypothesis="Unhandled runtime exception in authentication microservice identity provider connector.",
                alternative_explanations=[
                    "Directory service (LDAP/ActiveDirectory) connection pool exhaustion",
                    "Malformed JWT or corrupted cryptographic key configuration",
                ],
                related_historical_incidents=sim_incidents,
                matching_known_patterns=matched_patterns or ["Auth Service 5xx Token Crash"],
                recommended_countermeasure="Open auth circuit breaker to isolate failing endpoint and alert identity engineering team.",
                recommended_playbook_id="pb_demo_auth_isolation",
                confidence_score=0.92,
                evidence_assessment="conclusive",
                human_investigation_required=False,
            )

        # 3. Authentication Timeout
        if "auth_timeout" in cat or ("auth" in svc and "timeout" in err_code.lower()):
            return LLMInvestigationOutput(
                summary="Authentication handshake timed out against upstream identity provider.",
                customer_impact="Customer login requests experience severe latency before failing.",
                failed_component=evidence.service_name or "auth-service",
                failed_step=failed_step.get("step_name") if failed_step else "Session Validation",
                evidence_supporting_diagnosis=[
                    "Handshake latency exceeded 3000ms timeout threshold",
                    f"Error code: {err_code or 'AUTH_UPSTREAM_TIMEOUT'}",
                ],
                root_cause_hypothesis="Upstream identity directory response latency degradation.",
                alternative_explanations=[
                    "DNS resolution delay for identity cluster",
                    "Ingress gateway queue saturation",
                ],
                related_historical_incidents=sim_incidents,
                matching_known_patterns=matched_patterns,
                recommended_countermeasure="Pause retry sequence and check directory health.",
                recommended_playbook_id="pb_demo_auth_isolation",
                confidence_score=0.88,
                evidence_assessment="conclusive",
                human_investigation_required=False,
            )

        # 4. Slow Product Search Query
        if "search_slow" in cat or "product" in svc:
            return LLMInvestigationOutput(
                summary="Product catalog search query latency exceeded SLA threshold.",
                customer_impact="Users experience slow browsing and catalog page load degradation.",
                failed_component=evidence.service_name or "product-service",
                failed_step=failed_step.get("step_name") if failed_step else "Product Search",
                evidence_supporting_diagnosis=[
                    f"Step duration {failed_step.get('duration_ms') if failed_step else 2500}ms exceeded warning SLA",
                    "Service health snapshot shows elevated response latency",
                ],
                root_cause_hypothesis="Unindexed search query or cache invalidation storm impacting product catalog database.",
                alternative_explanations=[
                    "Search index re-indexing spike",
                    "Full-text search engine garbage collection pause",
                ],
                related_historical_incidents=sim_incidents,
                matching_known_patterns=matched_patterns,
                recommended_countermeasure="Trigger cache pre-warming and rate-limit complex wildcard search queries.",
                recommended_playbook_id=None,
                confidence_score=0.85,
                evidence_assessment="moderate",
                human_investigation_required=True,
            )

        # 5. Cart / Checkout 5xx
        if "cart" in svc or "checkout" in svc or "5xx" in cat:
            return LLMInvestigationOutput(
                summary="Stateful order preparation failure in cart or checkout service.",
                customer_impact="Customer orders cannot be finalized.",
                failed_component=evidence.service_name or "checkout-service",
                failed_step=failed_step.get("step_name") if failed_step else "Checkout",
                evidence_supporting_diagnosis=[
                    f"HTTP error status: {http_stat or 500}",
                    "Step execution failed during state transition",
                ],
                root_cause_hypothesis="Downstream dependency unavailable or database deadlock during cart checkout transition.",
                alternative_explanations=[
                    "Inventory reservation lock contention",
                    "Redis cart session persistence eviction",
                ],
                related_historical_incidents=sim_incidents,
                matching_known_patterns=matched_patterns,
                recommended_countermeasure="Verify dependent service health and pause retry storms.",
                recommended_playbook_id=None,
                confidence_score=0.80,
                evidence_assessment="moderate",
                human_investigation_required=True,
            )

        # 6. Insufficient / Inconclusive Evidence (Safe Default)
        return LLMInvestigationOutput(
            summary="Incident detected with insufficient diagnostic evidence for definitive classification.",
            customer_impact="Potential business transaction disruption of undetermined scope.",
            failed_component=evidence.service_name or "unknown-component",
            failed_step=failed_step.get("step_name") if failed_step else None,
            evidence_supporting_diagnosis=[
                "No step execution stack trace or diagnostic payload captured",
                "Service health snapshots show normal ranges or missing telemetry",
            ],
            root_cause_hypothesis="Inconclusive: insufficient telemetry and error evidence to definitively establish root cause.",
            alternative_explanations=[
                "Transient network partition between client and edge ingress",
                "Client-side request cancellation before backend receipt",
                "Uninstrumented downstream dependency outage",
            ],
            related_historical_incidents=sim_incidents,
            matching_known_patterns=matched_patterns,
            recommended_countermeasure="Escalate to human SRE on-call for manual log investigation.",
            recommended_playbook_id=None,
            confidence_score=0.20,
            evidence_assessment="insufficient",
            human_investigation_required=True,
        )
