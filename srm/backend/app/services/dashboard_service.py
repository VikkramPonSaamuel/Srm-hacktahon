import csv
from datetime import datetime, timedelta, timezone
import io
import math
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import distinct, func, or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.core.logging import get_logger
from app.core.sanitizer import sanitize_string
from app.core.time import (
    calculate_median,
    calculate_percentile,
    parse_time_range,
    to_utc,
)
from app.models.brand_protection import DetectedImpersonation
from app.models.execution import JourneyExecution, StepExecution
from app.models.health import ServiceHealthSnapshot
from app.models.incident import Incident, IncidentEvent
from app.models.journey import BusinessJourney, JourneyStep
from app.models.pattern import FailurePattern, PatternMatch
from app.models.playbook import RecoveryAction, RecoveryExecution, RecoveryPlaybook
from app.models.website_threat import DetectedWebsiteThreat
from app.schemas.dashboard import (
    AssociatedPlaybookSummary,
    CountermeasureAnalyticsResponse,
    FailingStepSummary,
    HistoricalExecutionStepItem,
    HistoricalIncidentDetailResponse,
    HistoricalIncidentSummaryItem,
    HistoricalRecoveryAttemptItem,
    IncidentAnalyticsResponse,
    IncidentTimeBucket,
    JourneyHealthDashboardResponse,
    JourneyHealthItem,
    LatestExecutionSummary,
    OverviewKpisResponse,
    PaginatedHistoricalIncidentsResponse,
    PatternAnalyticsItem,
    PatternAnalyticsResponse,
    PatternFrequencyTimePoint,
    PlaybookPerformanceItem,
    RecentIncidentTimelineItem,
    RepeatedIncidentItem,
    SeedDemoDataResponse,
    ServiceHealthSummaryItem,
    SharedAnalyticsResponse,
    SuccessRateTimePoint,
    TimeRangeMeta,
    TopPatternItem,
)

logger = get_logger("app.services.dashboard")


class DashboardService:
    """Service providing aggregated business reliability metrics, analytics, and historical audits."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def _apply_data_source_filter(self, query: Any, model_class: Any, data_source: str) -> Any:
        """Applies data scope filtering (all, live, demo)."""
        if hasattr(model_class, "is_demo"):
            if data_source == "live":
                return query.filter(model_class.is_demo.is_(False))
            elif data_source == "demo":
                return query.filter(model_class.is_demo.is_(True))
        return query

    # =========================================================================
    # 1. Overview KPIs
    # =========================================================================
    def get_overview_kpis(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        data_source: str = "all",
    ) -> OverviewKpisResponse:
        utc_start, utc_end = parse_time_range(start_time, end_time, preset)

        # 1. Total executions & success rate in time range
        exec_query = self.db.query(JourneyExecution).filter(
            JourneyExecution.started_at >= utc_start,
            JourneyExecution.started_at <= utc_end,
        )
        exec_query = self._apply_data_source_filter(exec_query, JourneyExecution, data_source)
        total_executions = exec_query.count()

        success_query = exec_query.filter(JourneyExecution.status == "success")
        successful_executions = success_query.count()
        overall_success_rate = (
            round((successful_executions / total_executions) * 100.0, 2)
            if total_executions > 0
            else 0.0
        )

        # 2. Active incidents (currently open / investigating)
        active_query = self.db.query(Incident).filter(
            Incident.status.in_(["open", "investigating", "mitigated", "recovering", "verifying"])
        )
        active_query = self._apply_data_source_filter(active_query, Incident, data_source)
        active_incidents = active_query.count()

        # 3. Incidents detected within range
        range_incidents_query = self.db.query(Incident).filter(
            Incident.detected_at >= utc_start,
            Incident.detected_at <= utc_end,
        )
        range_incidents_query = self._apply_data_source_filter(range_incidents_query, Incident, data_source)
        incidents_detected_in_range = range_incidents_query.count()

        # 4. Patterns
        pattern_query = self.db.query(FailurePattern)
        pattern_query = self._apply_data_source_filter(pattern_query, FailurePattern, data_source)
        known_patterns = pattern_query.filter(FailurePattern.status == "confirmed").count()
        patterns_awaiting_review = pattern_query.filter(FailurePattern.status == "candidate").count()

        # 5. Recovery rate
        rec_query = self.db.query(RecoveryExecution).filter(
            RecoveryExecution.started_at >= utc_start,
            RecoveryExecution.started_at <= utc_end,
            RecoveryExecution.is_simulation.is_(False),
        )
        total_recoveries = rec_query.count()
        succeeded_recoveries = rec_query.filter(RecoveryExecution.status == "succeeded").count()
        successful_recovery_rate = (
            round((succeeded_recoveries / total_recoveries) * 100.0, 2)
            if total_recoveries > 0
            else 0.0
        )

        # 6. Detection time & recovery time
        incidents_in_range = range_incidents_query.all()
        detection_durations: List[float] = []
        recovery_durations: List[float] = []
        manual_intervention_count = 0

        for inc in incidents_in_range:
            # Detection latency/duration
            if inc.step_execution and inc.step_execution.duration_ms:
                detection_durations.append(inc.step_execution.duration_ms)
            elif inc.step_execution and inc.step_execution.started_at:
                det_dt = to_utc(inc.detected_at)
                step_dt = to_utc(inc.step_execution.started_at)
                if det_dt and step_dt and det_dt >= step_dt:
                    detection_durations.append((det_dt - step_dt).total_seconds() * 1000.0)

            # Recovery duration
            if inc.recovery_duration_ms and inc.recovery_duration_ms > 0:
                recovery_durations.append(inc.recovery_duration_ms)

            # Manual intervention check
            if inc.recovery_status in ["failed", "escalated", "awaiting_reconciliation"] or inc.status == "escalated":
                manual_intervention_count += 1

        median_detection = calculate_median(detection_durations)
        median_recovery = calculate_median(recovery_durations)

        return OverviewKpisResponse(
            total_journey_executions=total_executions,
            overall_journey_success_rate=overall_success_rate,
            active_incidents=active_incidents,
            incidents_detected_in_range=incidents_detected_in_range,
            known_failure_patterns=known_patterns,
            patterns_awaiting_review=patterns_awaiting_review,
            successful_recovery_rate=successful_recovery_rate,
            median_detection_time_ms=median_detection,
            median_recovery_time_ms=median_recovery,
            incidents_requiring_manual_intervention=manual_intervention_count,
            time_range=TimeRangeMeta(
                start_time=utc_start,
                end_time=utc_end,
                preset=preset,
                data_source=data_source,
            ),
        )

    # =========================================================================
    # 2. Journey Health
    # =========================================================================
    def get_journey_health(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        data_source: str = "all",
    ) -> JourneyHealthDashboardResponse:
        utc_start, utc_end = parse_time_range(start_time, end_time, preset)

        # 1. Journeys analysis
        journeys_query = self.db.query(BusinessJourney)
        journeys_query = self._apply_data_source_filter(journeys_query, BusinessJourney, data_source)
        journeys = journeys_query.all()

        journey_health_items: List[JourneyHealthItem] = []
        all_executions_in_range: List[JourneyExecution] = []

        for j in journeys:
            execs_query = self.db.query(JourneyExecution).filter(
                JourneyExecution.journey_id == j.id,
                JourneyExecution.started_at >= utc_start,
                JourneyExecution.started_at <= utc_end,
            )
            execs_query = self._apply_data_source_filter(execs_query, JourneyExecution, data_source)
            j_execs = execs_query.order_by(JourneyExecution.started_at.desc()).all()
            all_executions_in_range.extend(j_execs)

            total_runs = len(j_execs)
            succ_runs = sum(1 for e in j_execs if e.status == "success")
            failed_runs = sum(1 for e in j_execs if e.status in ["failed", "partially_recovered"])
            rate = round((succ_runs / total_runs) * 100.0, 2) if total_runs > 0 else 0.0

            durations = [e.duration_ms for e in j_execs if e.duration_ms is not None]
            avg_lat = round(sum(durations) / len(durations), 2) if durations else 0.0
            p50 = calculate_percentile(durations, 50.0)
            p90 = calculate_percentile(durations, 90.0)
            p99 = calculate_percentile(durations, 99.0)

            # Health classification
            if total_runs == 0:
                health_status = "unknown"
            elif rate >= 95.0:
                health_status = "healthy"
            elif rate >= 80.0:
                health_status = "degraded"
            else:
                health_status = "failing"

            latest_exec_summary: Optional[LatestExecutionSummary] = None
            if j_execs:
                latest = j_execs[0]
                latest_exec_summary = LatestExecutionSummary(
                    execution_id=latest.execution_id,
                    status=latest.status,
                    started_at=latest.started_at,
                    completed_at=latest.completed_at,
                    duration_ms=latest.duration_ms,
                )

            journey_health_items.append(
                JourneyHealthItem(
                    journey_id=j.id,
                    name=j.name,
                    journey_type=j.journey_type,
                    is_enabled=j.is_enabled,
                    is_demo=j.is_demo,
                    health_status=health_status,
                    total_executions=total_runs,
                    successful_executions=succ_runs,
                    failed_executions=failed_runs,
                    success_rate=rate,
                    avg_latency_ms=avg_lat,
                    p50_latency_ms=p50,
                    p90_latency_ms=p90,
                    p99_latency_ms=p99,
                    latest_execution=latest_exec_summary,
                )
            )

        # 2. Success rate over time (hourly or daily buckets)
        time_points = self._bucket_executions_over_time(all_executions_in_range, utc_start, utc_end)

        # 3. Frequently failing steps
        step_execs_query = self.db.query(StepExecution).join(
            JourneyExecution, StepExecution.journey_execution_id == JourneyExecution.id
        ).filter(
            StepExecution.started_at >= utc_start,
            StepExecution.started_at <= utc_end,
        )
        step_execs_query = self._apply_data_source_filter(step_execs_query, JourneyExecution, data_source)
        all_step_execs = step_execs_query.all()

        step_stats: Dict[Tuple[str, str], Dict[str, Any]] = {}
        for se in all_step_execs:
            step_name = se.journey_step.step_name if se.journey_step else "Unknown Step"
            service_name = se.journey_step.service_name if se.journey_step else "unknown-service"
            journey_id = se.journey_step.journey_id if se.journey_step else None
            journey_name = se.journey_step.journey.name if se.journey_step and se.journey_step.journey else None

            key = (step_name, service_name)
            if key not in step_stats:
                step_stats[key] = {
                    "step_name": step_name,
                    "service_name": service_name,
                    "journey_id": journey_id,
                    "journey_name": journey_name,
                    "failure_count": 0,
                    "total_attempts": 0,
                    "categories": {},
                }
            step_stats[key]["total_attempts"] += 1
            if se.status in ["failed", "timed_out"]:
                step_stats[key]["failure_count"] += 1
                cat = se.failure_category or "unknown_error"
                step_stats[key]["categories"][cat] = step_stats[key]["categories"].get(cat, 0) + 1

        failing_steps_list: List[FailingStepSummary] = []
        for s in step_stats.values():
            if s["failure_count"] > 0:
                top_cat = max(s["categories"].items(), key=lambda x: x[1])[0] if s["categories"] else None
                rate = round((s["failure_count"] / s["total_attempts"]) * 100.0, 2) if s["total_attempts"] > 0 else 0.0
                failing_steps_list.append(
                    FailingStepSummary(
                        step_name=s["step_name"],
                        service_name=s["service_name"],
                        journey_id=s["journey_id"],
                        journey_name=s["journey_name"],
                        failure_count=s["failure_count"],
                        total_attempts=s["total_attempts"],
                        failure_rate=rate,
                        common_failure_category=top_cat,
                    )
                )
        failing_steps_list.sort(key=lambda x: x.failure_count, reverse=True)
        top_failing_steps = failing_steps_list[:10]

        # 4. Service health summaries
        svc_query = self.db.query(ServiceHealthSnapshot)
        svc_query = self._apply_data_source_filter(svc_query, ServiceHealthSnapshot, data_source)
        all_snapshots = svc_query.order_by(ServiceHealthSnapshot.timestamp.desc()).all()

        latest_by_svc: Dict[str, ServiceHealthSnapshot] = {}
        for snap in all_snapshots:
            if snap.service_name not in latest_by_svc:
                latest_by_svc[snap.service_name] = snap

        service_summaries: List[ServiceHealthSummaryItem] = [
            ServiceHealthSummaryItem(
                service_name=snap.service_name,
                status=snap.status,
                response_latency_ms=round(snap.response_latency_ms, 2),
                error_rate=round(snap.error_rate, 4),
                last_updated=snap.timestamp,
                is_demo=snap.is_demo,
            )
            for snap in latest_by_svc.values()
        ]
        service_summaries.sort(key=lambda x: x.service_name)

        return JourneyHealthDashboardResponse(
            journeys=journey_health_items,
            success_rate_over_time=time_points,
            frequently_failing_steps=top_failing_steps,
            service_health_summaries=service_summaries,
            time_range=TimeRangeMeta(
                start_time=utc_start,
                end_time=utc_end,
                preset=preset,
                data_source=data_source,
            ),
        )

    def _bucket_executions_over_time(
        self,
        executions: List[JourneyExecution],
        utc_start: datetime,
        utc_end: datetime,
    ) -> List[SuccessRateTimePoint]:
        """Buckets executions into ISO timestamp intervals."""
        total_hours = max(1.0, (utc_end - utc_start).total_seconds() / 3600.0)
        use_daily = total_hours > 48.0

        buckets: Dict[str, Dict[str, int]] = {}

        for e in executions:
            dt = to_utc(e.started_at)
            if not dt:
                continue
            if use_daily:
                key = dt.strftime("%Y-%m-%d")
            else:
                key = dt.strftime("%Y-%m-%dT%H:00:00Z")

            if key not in buckets:
                buckets[key] = {"total": 0, "successful": 0, "failed": 0}
            buckets[key]["total"] += 1
            if e.status == "success":
                buckets[key]["successful"] += 1
            else:
                buckets[key]["failed"] += 1

        points: List[SuccessRateTimePoint] = []
        for k in sorted(buckets.keys()):
            b = buckets[k]
            rate = round((b["successful"] / b["total"]) * 100.0, 2) if b["total"] > 0 else 0.0
            points.append(
                SuccessRateTimePoint(
                    timestamp_bucket=k,
                    total_executions=b["total"],
                    successful_executions=b["successful"],
                    failed_executions=b["failed"],
                    success_rate=rate,
                )
            )
        return points

    # =========================================================================
    # 3. Incident Analytics
    # =========================================================================
    def get_incident_analytics(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        data_source: str = "all",
    ) -> IncidentAnalyticsResponse:
        utc_start, utc_end = parse_time_range(start_time, end_time, preset)

        inc_query = self.db.query(Incident).filter(
            Incident.detected_at >= utc_start,
            Incident.detected_at <= utc_end,
        )
        inc_query = self._apply_data_source_filter(inc_query, Incident, data_source)
        incidents = inc_query.order_by(Incident.detected_at.desc()).all()

        # 1. Volume by time
        total_hours = max(1.0, (utc_end - utc_start).total_seconds() / 3600.0)
        use_daily = total_hours > 48.0
        time_buckets_map: Dict[str, Dict[str, int]] = {}

        # 2. Aggregations
        by_severity: Dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        by_category: Dict[str, int] = {}
        by_service: Dict[str, int] = {}
        by_journey: Dict[str, int] = {}
        recovery_outcomes: Dict[str, int] = {}
        repeated_groups: Dict[Tuple[str, str], List[Incident]] = {}

        for inc in incidents:
            dt = to_utc(inc.detected_at)
            bkey = dt.strftime("%Y-%m-%d") if use_daily else dt.strftime("%Y-%m-%dT%H:00:00Z")
            if bkey not in time_buckets_map:
                time_buckets_map[bkey] = {
                    "count": 0,
                    "critical": 0,
                    "high": 0,
                    "medium": 0,
                    "low": 0,
                }
            time_buckets_map[bkey]["count"] += 1
            sev = (inc.severity or "medium").lower()
            if sev in time_buckets_map[bkey]:
                time_buckets_map[bkey][sev] += 1

            # Severity
            by_severity[sev] = by_severity.get(sev, 0) + 1

            # Category
            cat = inc.failure_category or "unknown"
            by_category[cat] = by_category.get(cat, 0) + 1

            # Service
            svc = inc.service_name or "unknown-service"
            by_service[svc] = by_service.get(svc, 0) + 1

            # Journey
            j_name = inc.journey.name if inc.journey else "Ad-hoc / Unknown"
            by_journey[j_name] = by_journey.get(j_name, 0) + 1

            # Outcomes
            outcome = inc.recovery_status or "not_started"
            recovery_outcomes[outcome] = recovery_outcomes.get(outcome, 0) + 1

            # Repeated grouping
            rkey = (svc, cat)
            repeated_groups.setdefault(rkey, []).append(inc)

        volume_list = [
            IncidentTimeBucket(
                time_bucket=k,
                count=v["count"],
                critical_count=v["critical"],
                high_count=v["high"],
                medium_count=v["medium"],
                low_count=v["low"],
            )
            for k, v in sorted(time_buckets_map.items())
        ]

        # Repeated incidents (count >= 2)
        repeated_list: List[RepeatedIncidentItem] = []
        for (svc, cat), grp in repeated_groups.items():
            if len(grp) >= 2:
                dts = [to_utc(i.detected_at) for i in grp if i.detected_at]
                sevs = list(set(i.severity for i in grp if i.severity))
                repeated_list.append(
                    RepeatedIncidentItem(
                        service_name=svc,
                        failure_category=cat,
                        incident_count=len(grp),
                        first_detected_at=min(dts) if dts else utc_start,
                        last_detected_at=max(dts) if dts else utc_end,
                        severities=sevs,
                    )
                )
        repeated_list.sort(key=lambda x: x.incident_count, reverse=True)

        # Top failure patterns
        pat_query = self.db.query(FailurePattern)
        pat_query = self._apply_data_source_filter(pat_query, FailurePattern, data_source)
        top_patterns = pat_query.order_by(FailurePattern.incident_count.desc()).limit(10).all()
        top_patterns_list = [
            TopPatternItem(
                pattern_id=p.pattern_id,
                name=p.name,
                incident_count=p.incident_count,
                confidence_score=round(p.confidence_score, 2),
                status=p.status,
                severity=p.severity,
            )
            for p in top_patterns
        ]

        # Recent incident timelines (last 10)
        recent_timelines: List[RecentIncidentTimelineItem] = []
        for inc in incidents[:10]:
            events_count = len(inc.events) if inc.events else 0
            latest_ev = inc.events[-1].event_type if inc.events else None
            recent_timelines.append(
                RecentIncidentTimelineItem(
                    incident_id=inc.incident_id,
                    title=inc.title,
                    severity=inc.severity,
                    status=inc.status,
                    detected_at=inc.detected_at,
                    resolved_at=inc.resolved_at,
                    event_count=events_count,
                    latest_event_type=latest_ev,
                )
            )

        # Module Breakdown
        by_module: Dict[str, int] = {}
        for inc in incidents:
            mod = getattr(inc, "module", "transaction_reliability")
            by_module[mod] = by_module.get(mod, 0) + 1

        # Patterns by Module
        patterns_by_module: Dict[str, int] = {}
        all_pats = pat_query.all()
        for p in all_pats:
            pmod = getattr(p, "module", "transaction_reliability")
            patterns_by_module[pmod] = patterns_by_module.get(pmod, 0) + 1

        # Countermeasures Summary & Execution Outcomes
        total_playbooks = self.db.query(RecoveryPlaybook).count()
        enabled_playbooks = self.db.query(RecoveryPlaybook).filter(RecoveryPlaybook.is_enabled.is_(True)).count()
        rec_query = self.db.query(RecoveryExecution).filter(
            RecoveryExecution.started_at >= utc_start,
            RecoveryExecution.started_at <= utc_end,
            RecoveryExecution.is_simulation.is_(False),
        )
        total_executions = rec_query.count()
        succeeded_executions = rec_query.filter(RecoveryExecution.status == "succeeded").count()
        countermeasures_summary = {
            "total_playbooks_prepared": total_playbooks,
            "enabled_playbooks": enabled_playbooks,
            "total_executions": total_executions,
            "succeeded_executions": succeeded_executions,
        }

        mitigation_outcomes: Dict[str, int] = {}
        for rex in rec_query.all():
            st = rex.status or "unknown"
            mitigation_outcomes[st] = mitigation_outcomes.get(st, 0) + 1

        # Manual Intervention Rate
        manual_interventions = rec_query.filter(
            or_(
                RecoveryExecution.manual_intervention_required.is_(True),
                RecoveryExecution.status.in_(["escalated", "failed", "rejected_unapproved"]),
            )
        ).count()
        manual_intervention_rate = (
            round((manual_interventions / total_executions) * 100.0, 2)
            if total_executions > 0
            else 0.0
        )

        # False-Positive Review Outcomes across Modules
        try:
            brand_fp = self.db.query(DetectedImpersonation).filter(DetectedImpersonation.detection_status.in_(["false_positive", "dismissed"])).count()
        except Exception:
            brand_fp = 0
        try:
            sec_fp = self.db.query(DetectedWebsiteThreat).filter(DetectedWebsiteThreat.status.in_(["false_positive", "dismissed"])).count()
        except Exception:
            sec_fp = 0
        false_positive_outcomes = {
            "brand_false_positives": brand_fp,
            "website_security_false_positives": sec_fp,
            "total_false_positives": brand_fp + sec_fp,
        }

        return IncidentAnalyticsResponse(
            volume_over_time=volume_list,
            incidents_by_severity=by_severity,
            incidents_by_category=by_category,
            incidents_by_service=by_service,
            incidents_by_journey=by_journey,
            repeated_incidents=repeated_list,
            top_failure_patterns=top_patterns_list,
            recent_incident_timelines=recent_timelines,
            recovery_outcomes=recovery_outcomes,
            time_range=TimeRangeMeta(
                start_time=utc_start,
                end_time=utc_end,
                preset=preset,
                data_source=data_source,
            ),
            incidents_by_module=by_module,
            patterns_by_module=patterns_by_module,
            countermeasures_summary=countermeasures_summary,
            mitigation_outcomes=mitigation_outcomes,
            manual_intervention_rate=manual_intervention_rate,
            false_positive_outcomes=false_positive_outcomes,
        )

    def get_shared_analytics(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        data_source: str = "all",
    ) -> SharedAnalyticsResponse:
        """Aggregates unified platform analytics across Transaction Monitoring, Brand Impersonation, and Website Security."""
        utc_start, utc_end = parse_time_range(start_time, end_time, preset or "all")
        inc_analytics = self.get_incident_analytics(
            start_time=start_time,
            end_time=end_time,
            preset=preset,
            data_source=data_source,
        )
        return SharedAnalyticsResponse(
            incident_counts_by_module=inc_analytics.incidents_by_module,
            incident_counts_by_severity=inc_analytics.incidents_by_severity,
            known_patterns_by_module=inc_analytics.patterns_by_module,
            countermeasures=inc_analytics.countermeasures_summary,
            recovery_and_mitigation_outcomes=inc_analytics.mitigation_outcomes,
            manual_intervention_rate=inc_analytics.manual_intervention_rate,
            false_positive_outcomes=inc_analytics.false_positive_outcomes,
            time_range=inc_analytics.time_range,
        )

    # =========================================================================
    # 4. Pattern Analytics
    # =========================================================================
    def get_pattern_analytics(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        data_source: str = "all",
    ) -> PatternAnalyticsResponse:
        utc_start, utc_end = parse_time_range(start_time, end_time, preset or "all")

        query = self.db.query(FailurePattern)
        query = self._apply_data_source_filter(query, FailurePattern, data_source)
        patterns = query.order_by(FailurePattern.incident_count.desc()).all()

        total_patterns = len(patterns)
        by_status = {"candidate": 0, "confirmed": 0, "rejected": 0, "retired": 0}
        confidence_dist = {"high (>0.8)": 0, "medium (0.5-0.8)": 0, "low (<0.5)": 0}

        pattern_items: List[PatternAnalyticsItem] = []
        for p in patterns:
            st = p.status or "candidate"
            by_status[st] = by_status.get(st, 0) + 1

            conf = p.confidence_score
            if conf >= 0.8:
                confidence_dist["high (>0.8)"] += 1
            elif conf >= 0.5:
                confidence_dist["medium (0.5-0.8)"] += 1
            else:
                confidence_dist["low (<0.5)"] += 1

            # Associated playbook
            pb = self.db.query(RecoveryPlaybook).filter(
                or_(RecoveryPlaybook.pattern_id == p.id, RecoveryPlaybook.pattern_ref == p.pattern_id)
            ).first()

            pb_summary: Optional[AssociatedPlaybookSummary] = None
            if pb:
                pb_summary = AssociatedPlaybookSummary(
                    playbook_id=pb.playbook_id,
                    name=pb.name,
                    recovery_strategy=pb.recovery_strategy,
                    approval_status=pb.approval_status,
                    is_enabled=pb.is_enabled,
                )

            pattern_items.append(
                PatternAnalyticsItem(
                    pattern_id=p.pattern_id,
                    name=p.name,
                    description=p.description,
                    failure_category=p.failure_category,
                    service_name=p.service_name,
                    severity=p.severity,
                    incident_count=p.incident_count,
                    confidence_score=round(p.confidence_score, 2),
                    status=p.status,
                    first_detected_at=p.first_detected_at,
                    last_detected_at=p.last_detected_at,
                    is_demo=p.is_demo,
                    associated_playbook=pb_summary,
                )
            )

        # Pattern match frequency over time
        matches_query = self.db.query(PatternMatch).join(FailurePattern, PatternMatch.pattern_id == FailurePattern.id)
        matches_query = self._apply_data_source_filter(matches_query, FailurePattern, data_source)
        matches = matches_query.all()

        freq_buckets: Dict[Tuple[str, str, str], int] = {}
        for m in matches:
            dt = to_utc(m.matched_at)
            if not dt:
                continue
            bkey = dt.strftime("%Y-%m-%d")
            pid = m.pattern.pattern_id if m.pattern else "unknown"
            pname = m.pattern.name if m.pattern else "Unknown"
            key = (bkey, pid, pname)
            freq_buckets[key] = freq_buckets.get(key, 0) + 1

        pattern_freq_points = [
            PatternFrequencyTimePoint(
                time_bucket=k[0],
                pattern_id=k[1],
                pattern_name=k[2],
                match_count=cnt,
            )
            for k, cnt in sorted(freq_buckets.items())
        ]

        return PatternAnalyticsResponse(
            total_patterns=total_patterns,
            patterns_by_status=by_status,
            confidence_distribution=confidence_dist,
            most_frequent_patterns=pattern_items,
            pattern_frequency_over_time=pattern_freq_points,
            time_range=TimeRangeMeta(
                start_time=utc_start,
                end_time=utc_end,
                preset=preset,
                data_source=data_source,
            ),
        )

    # =========================================================================
    # 5. Countermeasure Analytics
    # =========================================================================
    def get_countermeasure_analytics(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        data_source: str = "all",
    ) -> CountermeasureAnalyticsResponse:
        utc_start, utc_end = parse_time_range(start_time, end_time, preset or "all")

        # 1. Playbooks breakdown
        pb_query = self.db.query(RecoveryPlaybook)
        pb_query = self._apply_data_source_filter(pb_query, RecoveryPlaybook, data_source)
        playbooks = pb_query.all()

        total_playbooks = len(playbooks)
        status_breakdown = {"draft": 0, "pending_approval": 0, "approved": 0, "rejected": 0}
        enabled_count = 0
        disabled_count = 0

        for pb in playbooks:
            status_breakdown[pb.approval_status] = status_breakdown.get(pb.approval_status, 0) + 1
            if pb.is_enabled:
                enabled_count += 1
            else:
                disabled_count += 1

        # 2. Executions breakdown
        rec_query = self.db.query(RecoveryExecution).join(
            RecoveryPlaybook, RecoveryExecution.playbook_id == RecoveryPlaybook.id
        ).filter(
            RecoveryExecution.started_at >= utc_start,
            RecoveryExecution.started_at <= utc_end,
        )
        rec_query = self._apply_data_source_filter(rec_query, RecoveryPlaybook, data_source)
        executions = rec_query.order_by(RecoveryExecution.started_at.desc()).all()

        total_executions = len(executions)
        executions_by_status: Dict[str, int] = {}
        total_actions_attempted = 0
        failed_actions = 0
        blocked_actions = 0
        manual_intervention_count = 0
        duration_sums = 0.0
        duration_count = 0

        # Per-playbook stats
        pb_exec_stats: Dict[int, Dict[str, Any]] = {}
        for pb in playbooks:
            pb_exec_stats[pb.id] = {
                "playbook": pb,
                "execution_count": 0,
                "success_count": 0,
                "durations": [],
                "last_executed_at": None,
            }

        for ex in executions:
            st = ex.status
            executions_by_status[st] = executions_by_status.get(st, 0) + 1

            if ex.manual_intervention_required:
                manual_intervention_count += 1

            # Actions attempted & outcomes
            actions = ex.actions_attempted or []
            total_actions_attempted += len(actions)
            for act in actions:
                if act.get("status") == "failed":
                    failed_actions += 1
                elif act.get("status") in ["blocked", "cooldown_skipped", "rejected_unapproved"]:
                    blocked_actions += 1

            if st in ["cooldown_skipped", "rejected_unapproved"]:
                blocked_actions += 1

            # Duration
            if ex.completed_at and ex.started_at:
                s_dt = to_utc(ex.started_at)
                c_dt = to_utc(ex.completed_at)
                if s_dt and c_dt and c_dt >= s_dt:
                    d_ms = (c_dt - s_dt).total_seconds() * 1000.0
                    duration_sums += d_ms
                    duration_count += 1
                    if ex.playbook_id in pb_exec_stats:
                        pb_exec_stats[ex.playbook_id]["durations"].append(d_ms)

            # Per-playbook aggregation
            if ex.playbook_id in pb_exec_stats:
                pstats = pb_exec_stats[ex.playbook_id]
                pstats["execution_count"] += 1
                if ex.status == "succeeded":
                    pstats["success_count"] += 1
                if not pstats["last_executed_at"] or (ex.started_at and ex.started_at > pstats["last_executed_at"]):
                    pstats["last_executed_at"] = ex.started_at

        # Rates
        non_simulated = [e for e in executions if not e.is_simulation]
        non_sim_total = len(non_simulated)
        succ_non_sim = sum(1 for e in non_simulated if e.status == "succeeded")
        success_rate = round((succ_non_sim / non_sim_total) * 100.0, 2) if non_sim_total > 0 else 0.0

        manual_rate = (
            round((manual_intervention_count / total_executions) * 100.0, 2)
            if total_executions > 0
            else 0.0
        )
        avg_dur_ms = round(duration_sums / duration_count, 2) if duration_count > 0 else 0.0

        performance_items: List[PlaybookPerformanceItem] = []
        for pstats in pb_exec_stats.values():
            pb = pstats["playbook"]
            ecnt = pstats["execution_count"]
            scnt = pstats["success_count"]
            srate = round((scnt / ecnt) * 100.0, 2) if ecnt > 0 else 0.0
            p_durs = pstats["durations"]
            p_avg_dur = round(sum(p_durs) / len(p_durs), 2) if p_durs else 0.0

            performance_items.append(
                PlaybookPerformanceItem(
                    playbook_id=pb.playbook_id,
                    name=pb.name,
                    recovery_strategy=pb.recovery_strategy,
                    approval_status=pb.approval_status,
                    is_enabled=pb.is_enabled,
                    execution_count=ecnt,
                    success_count=scnt,
                    success_rate=srate,
                    avg_duration_ms=p_avg_dur,
                    last_executed_at=pstats["last_executed_at"],
                )
            )

        performance_items.sort(key=lambda x: x.execution_count, reverse=True)

        return CountermeasureAnalyticsResponse(
            total_playbooks=total_playbooks,
            playbooks_by_approval_status=status_breakdown,
            enabled_count=enabled_count,
            disabled_count=disabled_count,
            recovery_executions_total=total_executions,
            recovery_executions_by_status=executions_by_status,
            recovery_success_rate=success_rate,
            total_actions_attempted=total_actions_attempted,
            failed_actions_count=failed_actions,
            blocked_actions_count=blocked_actions,
            manual_intervention_rate=manual_rate,
            avg_recovery_duration_ms=avg_dur_ms,
            playbook_performance=performance_items,
            time_range=TimeRangeMeta(
                start_time=utc_start,
                end_time=utc_end,
                preset=preset,
                data_source=data_source,
            ),
        )

    # =========================================================================
    # 6. Historical Records & Incident Details
    # =========================================================================
    def _build_history_filter_query(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        journey_id: Optional[int] = None,
        service_name: Optional[str] = None,
        severity: Optional[str] = None,
        status_filter: Optional[str] = None,
        pattern_id: Optional[str] = None,
        recovery_outcome: Optional[str] = None,
        query_str: Optional[str] = None,
        data_source: str = "all",
    ) -> Tuple[Any, datetime, datetime]:
        utc_start, utc_end = parse_time_range(start_time, end_time, preset or "all")

        q = self.db.query(Incident).filter(
            Incident.detected_at >= utc_start,
            Incident.detected_at <= utc_end,
        )
        q = self._apply_data_source_filter(q, Incident, data_source)

        if journey_id is not None:
            q = q.filter(Incident.journey_id == journey_id)
        if service_name:
            q = q.filter(Incident.service_name.ilike(f"%{service_name}%"))
        if severity:
            q = q.filter(Incident.severity == severity.lower())
        if status_filter:
            q = q.filter(Incident.status == status_filter.lower())
        if recovery_outcome:
            q = q.filter(Incident.recovery_status == recovery_outcome.lower())
        if query_str:
            term = f"%{query_str}%"
            q = q.filter(
                or_(
                    Incident.incident_id.ilike(term),
                    Incident.title.ilike(term),
                    Incident.description.ilike(term),
                    Incident.failure_category.ilike(term),
                    Incident.service_name.ilike(term),
                )
            )

        if pattern_id:
            # Match via pattern matches
            q = q.join(PatternMatch, PatternMatch.incident_id == Incident.id).join(
                FailurePattern, PatternMatch.pattern_id == FailurePattern.id
            ).filter(
                or_(FailurePattern.pattern_id == pattern_id, FailurePattern.name.ilike(f"%{pattern_id}%"))
            )

        return q, utc_start, utc_end

    def get_incident_history(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        journey_id: Optional[int] = None,
        service_name: Optional[str] = None,
        severity: Optional[str] = None,
        status_filter: Optional[str] = None,
        pattern_id: Optional[str] = None,
        recovery_outcome: Optional[str] = None,
        query_str: Optional[str] = None,
        data_source: str = "all",
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "detected_at",
        sort_order: str = "desc",
    ) -> PaginatedHistoricalIncidentsResponse:
        page = max(1, page)
        page_size = min(100, max(1, page_size))

        q, utc_start, utc_end = self._build_history_filter_query(
            start_time=start_time,
            end_time=end_time,
            preset=preset,
            journey_id=journey_id,
            service_name=service_name,
            severity=severity,
            status_filter=status_filter,
            pattern_id=pattern_id,
            recovery_outcome=recovery_outcome,
            query_str=query_str,
            data_source=data_source,
        )

        total = q.count()
        total_pages = math.ceil(total / page_size) if total > 0 else 1

        # Sorting
        sort_col = getattr(Incident, sort_by, Incident.detected_at)
        if sort_order.lower() == "asc":
            q = q.order_by(sort_col.asc())
        else:
            q = q.order_by(sort_col.desc())

        offset = (page - 1) * page_size
        incidents = q.offset(offset).limit(page_size).all()

        items: List[HistoricalIncidentSummaryItem] = []
        for inc in incidents:
            # Check associated pattern
            match = self.db.query(PatternMatch).filter(PatternMatch.incident_id == inc.id).first()
            p_ref = match.pattern.pattern_id if match and match.pattern else None
            manual_req = (
                inc.recovery_status in ["failed", "escalated", "awaiting_reconciliation"]
                or inc.status == "escalated"
            )

            items.append(
                HistoricalIncidentSummaryItem(
                    incident_id=inc.incident_id,
                    title=sanitize_string(inc.title),
                    description=sanitize_string(inc.description),
                    severity=inc.severity,
                    status=inc.status,
                    journey_id=inc.journey_id,
                    journey_name=inc.journey.name if inc.journey else None,
                    service_name=inc.service_name,
                    failure_category=inc.failure_category,
                    recovery_status=inc.recovery_status,
                    recovery_duration_ms=inc.recovery_duration_ms,
                    detected_at=inc.detected_at,
                    resolved_at=inc.resolved_at,
                    pattern_id=p_ref,
                    manual_intervention_required=manual_req,
                    is_demo=inc.is_demo,
                )
            )

        return PaginatedHistoricalIncidentsResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            time_range=TimeRangeMeta(
                start_time=utc_start,
                end_time=utc_end,
                preset=preset,
                data_source=data_source,
            ),
        )

    def get_historical_incident_detail(self, incident_id: str) -> HistoricalIncidentDetailResponse:
        inc = self.db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not inc:
            raise NotFoundError(f"Incident with ID '{incident_id}' not found.")

        # Pattern matches
        matches = self.db.query(PatternMatch).filter(PatternMatch.incident_id == inc.id).all()
        matched_patterns_data = [
            {
                "pattern_id": m.pattern.pattern_id if m.pattern else None,
                "name": m.pattern.name if m.pattern else "Unknown",
                "similarity_score": round(m.similarity_score, 2),
                "matched_at": m.matched_at.isoformat() if m.matched_at else None,
                "reasons": m.match_reasons,
            }
            for m in matches
        ]
        p_ref = matched_patterns_data[0]["pattern_id"] if matched_patterns_data else None

        manual_req = (
            inc.recovery_status in ["failed", "escalated", "awaiting_reconciliation"]
            or inc.status == "escalated"
        )

        inc_summary = HistoricalIncidentSummaryItem(
            incident_id=inc.incident_id,
            title=sanitize_string(inc.title),
            description=sanitize_string(inc.description),
            severity=inc.severity,
            status=inc.status,
            journey_id=inc.journey_id,
            journey_name=inc.journey.name if inc.journey else None,
            service_name=inc.service_name,
            failure_category=inc.failure_category,
            recovery_status=inc.recovery_status,
            recovery_duration_ms=inc.recovery_duration_ms,
            detected_at=inc.detected_at,
            resolved_at=inc.resolved_at,
            pattern_id=p_ref,
            manual_intervention_required=manual_req,
            is_demo=inc.is_demo,
        )

        # Execution steps
        step_items: List[HistoricalExecutionStepItem] = []
        journey_exec_data = None
        if inc.journey_execution:
            je = inc.journey_execution
            journey_exec_data = {
                "execution_id": je.execution_id,
                "status": je.status,
                "correlation_id": je.correlation_id,
                "environment": je.environment,
                "started_at": je.started_at.isoformat(),
                "completed_at": je.completed_at.isoformat() if je.completed_at else None,
                "duration_ms": je.duration_ms,
            }
            for se in je.step_executions:
                step_items.append(
                    HistoricalExecutionStepItem(
                        step_id=se.id,
                        step_name=se.journey_step.step_name if se.journey_step else "Step",
                        step_order=se.journey_step.step_order if se.journey_step else 1,
                        service_name=se.journey_step.service_name if se.journey_step else "service",
                        step_type=se.journey_step.step_type if se.journey_step else "api_call",
                        status=se.status,
                        latency_ms=se.latency_ms,
                        duration_ms=se.duration_ms,
                        http_status=se.http_status,
                        error_code=se.error_code,
                        failure_category=se.failure_category,
                        diagnostic_data=se.diagnostic_data,
                    )
                )

        # Recovery executions
        rec_execs = self.db.query(RecoveryExecution).filter(
            or_(
                RecoveryExecution.incident_id == inc.id,
                RecoveryExecution.incident_ref == inc.incident_id,
            )
        ).order_by(RecoveryExecution.started_at.desc()).all()

        rec_items = [
            HistoricalRecoveryAttemptItem(
                execution_id=re.execution_id,
                playbook_id=re.playbook.playbook_id if re.playbook else "unknown",
                playbook_name=re.playbook.name if re.playbook else "Unknown Playbook",
                recovery_strategy=re.playbook.recovery_strategy if re.playbook else "unknown",
                status=re.status,
                started_at=re.started_at,
                completed_at=re.completed_at,
                is_simulation=re.is_simulation,
                actions_attempted=re.actions_attempted or [],
                result=re.result or {},
                verification_result=re.verification_result or {},
                failure_details=sanitize_string(re.failure_details) if re.failure_details else None,
                manual_intervention_required=re.manual_intervention_required,
            )
            for re in rec_execs
        ]

        # Audit timeline events
        timeline_events_data = [
            {
                "event_id": ev.id,
                "event_type": ev.event_type,
                "timestamp": ev.timestamp.isoformat(),
                "details": ev.details,
                "correlation_id": ev.correlation_id,
            }
            for ev in inc.events
        ]

        return HistoricalIncidentDetailResponse(
            incident=inc_summary,
            journey_execution=journey_exec_data,
            step_executions=step_items,
            recovery_attempts=rec_items,
            timeline_events=timeline_events_data,
            matched_patterns=matched_patterns_data,
        )

    def export_incidents_csv(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        preset: Optional[str] = None,
        journey_id: Optional[int] = None,
        service_name: Optional[str] = None,
        severity: Optional[str] = None,
        status_filter: Optional[str] = None,
        pattern_id: Optional[str] = None,
        recovery_outcome: Optional[str] = None,
        query_str: Optional[str] = None,
        data_source: str = "all",
    ) -> str:
        q, _, _ = self._build_history_filter_query(
            start_time=start_time,
            end_time=end_time,
            preset=preset,
            journey_id=journey_id,
            service_name=service_name,
            severity=severity,
            status_filter=status_filter,
            pattern_id=pattern_id,
            recovery_outcome=recovery_outcome,
            query_str=query_str,
            data_source=data_source,
        )
        incidents = q.order_by(Incident.detected_at.desc()).limit(5000).all()

        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "incident_id",
            "detected_at",
            "resolved_at",
            "severity",
            "status",
            "journey_name",
            "service_name",
            "failure_category",
            "recovery_status",
            "recovery_duration_ms",
            "pattern_id",
            "manual_intervention_required",
            "is_demo",
            "title",
            "description",
        ])

        for inc in incidents:
            match = self.db.query(PatternMatch).filter(PatternMatch.incident_id == inc.id).first()
            p_ref = match.pattern.pattern_id if match and match.pattern else ""
            manual_req = (
                inc.recovery_status in ["failed", "escalated", "awaiting_reconciliation"]
                or inc.status == "escalated"
            )

            writer.writerow([
                inc.incident_id,
                inc.detected_at.isoformat() if inc.detected_at else "",
                inc.resolved_at.isoformat() if inc.resolved_at else "",
                inc.severity,
                inc.status,
                sanitize_string(inc.journey.name if inc.journey else ""),
                sanitize_string(inc.service_name or ""),
                sanitize_string(inc.failure_category or ""),
                inc.recovery_status,
                inc.recovery_duration_ms or "",
                p_ref,
                "true" if manual_req else "false",
                "true" if inc.is_demo else "false",
                sanitize_string(inc.title),
                sanitize_string(inc.description),
            ])

        return output.getvalue()

    # =========================================================================
    # 7. Dashboard Data Seeding for Local Demonstration
    # =========================================================================
    def seed_demo_dashboard_data(self) -> SeedDemoDataResponse:
        """
        Seeds identifiable demonstration records with is_demo=True across past 7 days.
        Strictly blocked in production environments.
        """
        if settings.ENVIRONMENT.lower() == "production":
            raise BadRequestError("Demo data seeding is strictly prohibited in production environment.")

        logger.info("Seeding comprehensive demonstration data for reliability dashboard...")

        now = datetime.now(timezone.utc)

        # 1. Monitored services health snapshots
        services = [
            ("auth-service", "healthy", 45.0, 0.001),
            ("product-service", "degraded", 320.0, 0.045),
            ("cart-service", "healthy", 60.0, 0.002),
            ("checkout-service", "healthy", 95.0, 0.005),
            ("payment-service", "degraded", 850.0, 0.082),
            ("order-service", "healthy", 70.0, 0.001),
        ]
        created_snapshots = 0
        for s_name, s_status, s_lat, s_err in services:
            snap = ServiceHealthSnapshot(
                service_name=s_name,
                status=s_status,
                response_latency_ms=s_lat,
                error_rate=s_err,
                timestamp=now - timedelta(minutes=5),
                details={"host": f"{s_name}-node-1", "cpu_percent": 35.0},
                is_demo=True,
            )
            self.db.add(snap)
            created_snapshots += 1

        # 2. Demo Journeys
        created_journeys = 0
        j1 = self.db.query(BusinessJourney).filter(BusinessJourney.name == "[DEMO] Retail E-Commerce Checkout").first()
        if not j1:
            j1 = BusinessJourney(
                name="[DEMO] Retail E-Commerce Checkout",
                description="Simulated multi-step customer e-commerce purchase journey.",
                journey_type="checkout",
                is_enabled=True,
                is_demo=True,
            )
            self.db.add(j1)
            self.db.flush()
            created_journeys += 1

            s1 = JourneyStep(journey_id=j1.id, step_name="Customer Login", step_order=1, service_name="auth-service", step_type="auth", timeout_ms=3000)
            s2 = JourneyStep(journey_id=j1.id, step_name="Product Search", step_order=2, service_name="product-service", step_type="api_call", timeout_ms=2000)
            s3 = JourneyStep(journey_id=j1.id, step_name="Add to Cart", step_order=3, service_name="cart-service", step_type="api_call", timeout_ms=2000)
            s4 = JourneyStep(journey_id=j1.id, step_name="Payment Authorization", step_order=4, service_name="payment-service", step_type="api_call", timeout_ms=5000)
            s5 = JourneyStep(journey_id=j1.id, step_name="Order Placement", step_order=5, service_name="order-service", step_type="api_call", timeout_ms=3000)
            self.db.add_all([s1, s2, s3, s4, s5])
            self.db.flush()

        j2 = self.db.query(BusinessJourney).filter(BusinessJourney.name == "[DEMO] Cross-Border Wire Transfer").first()
        if not j2:
            j2 = BusinessJourney(
                name="[DEMO] Cross-Border Wire Transfer",
                description="High-value international ledger settlement flow.",
                journey_type="payment",
                is_enabled=True,
                is_demo=True,
            )
            self.db.add(j2)
            self.db.flush()
            created_journeys += 1

            s1 = JourneyStep(journey_id=j2.id, step_name="User Auth & KYC", step_order=1, service_name="auth-service", step_type="auth", timeout_ms=3000)
            s2 = JourneyStep(journey_id=j2.id, step_name="Ledger Reservation", step_order=2, service_name="payment-service", step_type="api_call", timeout_ms=4000)
            s3 = JourneyStep(journey_id=j2.id, step_name="Interbank Settlement", step_order=3, service_name="payment-service", step_type="api_call", timeout_ms=6000)
            self.db.add_all([s1, s2, s3])
            self.db.flush()

        # 3. Demo Failure Patterns
        created_patterns = 0
        pat1 = self.db.query(FailurePattern).filter(FailurePattern.pattern_id == "demo_pat_payment_timeout").first()
        if not pat1:
            pat1 = FailurePattern(
                pattern_id="demo_pat_payment_timeout",
                name="[DEMO] Primary Payment Gateway Timeout",
                description="Gateway times out while pending charge confirmation.",
                failure_category="primary_payment_timeout",
                service_name="payment-service",
                severity="critical",
                affected_services=["payment-service", "checkout-service"],
                affected_steps=["Payment Authorization", "Interbank Settlement"],
                detection_rules={"category": "primary_payment_timeout", "min_occurrences": 2},
                incident_count=6,
                confidence_score=0.92,
                status="confirmed",
                first_detected_at=now - timedelta(days=5),
                last_detected_at=now - timedelta(hours=2),
                last_evaluated_at=now,
                is_demo=True,
            )
            self.db.add(pat1)
            self.db.flush()
            created_patterns += 1

        pat2 = self.db.query(FailurePattern).filter(FailurePattern.pattern_id == "demo_pat_auth_5xx").first()
        if not pat2:
            pat2 = FailurePattern(
                pattern_id="demo_pat_auth_5xx",
                name="[DEMO] Auth Service 5xx Token Crash",
                description="Repeated HTTP 500 crashes during identity token validation.",
                failure_category="auth_5xx",
                service_name="auth-service",
                severity="high",
                affected_services=["auth-service"],
                affected_steps=["Customer Login", "User Auth & KYC"],
                detection_rules={"category": "auth_5xx", "min_occurrences": 2},
                incident_count=4,
                confidence_score=0.88,
                status="confirmed",
                first_detected_at=now - timedelta(days=6),
                last_detected_at=now - timedelta(hours=8),
                last_evaluated_at=now,
                is_demo=True,
            )
            self.db.add(pat2)
            self.db.flush()
            created_patterns += 1

        # 4. Demo Playbooks
        created_playbooks = 0
        pb1 = self.db.query(RecoveryPlaybook).filter(RecoveryPlaybook.playbook_id == "demo_pb_payment_failover").first()
        if not pb1:
            pb1 = RecoveryPlaybook(
                playbook_id="demo_pb_payment_failover",
                name="[DEMO] Payment Gateway Failover Playbook",
                description="Reconciles pending transaction and switches traffic to secondary processor.",
                pattern_id=pat1.id,
                pattern_ref=pat1.pattern_id,
                applicable_services=["payment-service"],
                applicable_journeys=["checkout", "payment"],
                trigger_conditions={"failure_category": "primary_payment_timeout"},
                recovery_strategy="failover",
                approval_status="approved",
                is_enabled=True,
                max_attempts=2,
                cooldown_seconds=120,
                verification_conditions={"service": "payment-service", "expected_status": "healthy"},
                rollback_instructions={"action": "revert_primary_gateway"},
                is_demo=True,
            )
            self.db.add(pb1)
            self.db.flush()
            created_playbooks += 1

            act1 = RecoveryAction(
                playbook_id=pb1.id,
                action_order=1,
                action_type="reconcile_payment_status",
                parameters={"service_name": "payment-service"},
                risk_level="medium",
                expected_outcome="Confirm transaction status without double debit",
                timeout_seconds=15,
                requires_approval=False,
            )
            act2 = RecoveryAction(
                playbook_id=pb1.id,
                action_order=2,
                action_type="switch_payment_gateway",
                parameters={"from_gateway": "primary", "to_gateway": "secondary"},
                risk_level="high",
                expected_outcome="Route all new payments to secondary provider",
                timeout_seconds=30,
                requires_approval=True,
            )
            self.db.add_all([act1, act2])
            self.db.flush()

        # 5. Demo Executions & Incidents across 7 days
        created_executions = 0
        created_incidents = 0

        # Create historical series of 25 executions with realistic timestamps
        for day_offset in range(6, -1, -1):
            day_time = now - timedelta(days=day_offset, hours=4)
            for i in range(4):
                run_time = day_time + timedelta(hours=i * 2, minutes=15)
                exec_id = f"demo_exec_d{day_offset}_r{i}"
                existing_exec = self.db.query(JourneyExecution).filter(JourneyExecution.execution_id == exec_id).first()
                if existing_exec:
                    continue

                # 1 out of 5 runs fails on payment or auth
                is_failure = (day_offset in [1, 3, 5] and i == 2)
                st = "failed" if is_failure else "success"
                dur = 1250.0 if is_failure else (350.0 + (i * 45))

                je = JourneyExecution(
                    execution_id=exec_id,
                    journey_id=j1.id,
                    correlation_id=f"demo-corr-d{day_offset}-{i}",
                    environment="development",
                    status=st,
                    started_at=run_time,
                    completed_at=run_time + timedelta(milliseconds=dur),
                    duration_ms=dur,
                    is_demo=True,
                )
                self.db.add(je)
                self.db.flush()
                created_executions += 1

                # Steps
                steps = j1.steps
                for step in steps:
                    step_failed = is_failure and step.step_order == 4
                    se_stat = "failed" if step_failed else "success"
                    se = StepExecution(
                        journey_execution_id=je.id,
                        journey_step_id=step.id,
                        status=se_stat,
                        started_at=run_time + timedelta(milliseconds=(step.step_order - 1) * 100),
                        completed_at=run_time + timedelta(milliseconds=step.step_order * 100),
                        duration_ms=100.0 if not step_failed else 850.0,
                        latency_ms=90.0 if not step_failed else 800.0,
                        http_status=504 if step_failed else 200,
                        error_code="GATEWAY_TIMEOUT" if step_failed else None,
                        failure_category="primary_payment_timeout" if step_failed else None,
                    )
                    self.db.add(se)
                    self.db.flush()

                    if step_failed:
                        # Create Incident
                        inc_id = f"demo_inc_d{day_offset}_{i}"
                        inc = Incident(
                            incident_id=inc_id,
                            journey_execution_id=je.id,
                            step_execution_id=se.id,
                            journey_id=j1.id,
                            service_name="payment-service",
                            incident_type="transaction_failure",
                            severity="critical",
                            title=f"[DEMO] Payment Gateway Timeout on day {day_offset}",
                            description="Payment authorization exceeded 5000ms threshold during checkout.",
                            status="resolved" if day_offset > 1 else "open",
                            failure_category="primary_payment_timeout",
                            recovery_status="recovered" if day_offset > 1 else "in_progress",
                            recovery_duration_ms=450.0 if day_offset > 1 else None,
                            detected_at=run_time + timedelta(seconds=2),
                            resolved_at=run_time + timedelta(minutes=3) if day_offset > 1 else None,
                            is_demo=True,
                        )
                        self.db.add(inc)
                        self.db.flush()
                        created_incidents += 1

                        # Events
                        ev1 = IncidentEvent(
                            incident_id=inc.id,
                            event_type="detected",
                            timestamp=inc.detected_at,
                            details={"message": "Synthetic step latency exceeded threshold"},
                        )
                        ev2 = IncidentEvent(
                            incident_id=inc.id,
                            event_type="pattern_matched",
                            timestamp=inc.detected_at + timedelta(seconds=5),
                            details={"pattern_id": pat1.pattern_id, "confidence": 0.92},
                        )
                        self.db.add_all([ev1, ev2])

                        # Pattern Match
                        pm = PatternMatch(
                            pattern_id=pat1.id,
                            incident_id=inc.id,
                            matched_at=inc.detected_at + timedelta(seconds=5),
                            similarity_score=0.92,
                            match_reasons=["Matching failure category", "Consistent affected service"],
                        )
                        self.db.add(pm)

                        # Recovery Execution
                        rec_ex = RecoveryExecution(
                            execution_id=f"demo_rec_{inc_id}",
                            playbook_id=pb1.id,
                            incident_id=inc.id,
                            incident_ref=inc.incident_id,
                            started_at=inc.detected_at + timedelta(seconds=10),
                            completed_at=inc.detected_at + timedelta(seconds=25) if day_offset > 1 else None,
                            status="succeeded" if day_offset > 1 else "in_progress",
                            is_simulation=False,
                            preconditions_evaluation={"circuit_closed": True, "cooldown_clear": True},
                            actions_attempted=[
                                {"action_type": "reconcile_payment_status", "status": "success"},
                                {"action_type": "switch_payment_gateway", "status": "success" if day_offset > 1 else "pending"},
                            ],
                            result={"status": "recovered" if day_offset > 1 else "running"},
                            verification_result={"healthy": True if day_offset > 1 else False},
                            manual_intervention_required=False,
                        )
                        self.db.add(rec_ex)

        self.db.commit()
        logger.info(
            f"Successfully seeded demo dashboard data: {created_journeys} journeys, "
            f"{created_executions} executions, {created_incidents} incidents, {created_patterns} patterns."
        )

        return SeedDemoDataResponse(
            message="Demonstration dashboard data successfully seeded.",
            journeys_created=created_journeys,
            executions_created=created_executions,
            incidents_created=created_incidents,
            patterns_created=created_patterns,
            playbooks_created=created_playbooks,
            health_snapshots_created=created_snapshots,
        )
