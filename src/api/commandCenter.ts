import { useQuery } from '@tanstack/react-query';
import { apiRequest, ContinuumApiError } from './client';
import type {
  CommandCenterKpiMetrics,
  FailurePatternRecord,
  IncidentActivityRecord,
  IncidentLifecycleStatus,
  IncidentSeverity,
  JourneyExecutionStatus,
  MonitoredJourneyRecord,
  PendingApprovalRecord,
  RecoveryAttemptRecord,
  RecoveryVerificationStatus,
  ServiceHealthRecord,
  ServiceHealthState,
} from './contracts';
import type { TimeRangeValue } from '../styles/tokens';

function asNumberOrNull(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asStringOrNull(val: unknown): string | null {
  return typeof val === 'string' && val.trim() !== '' ? val : null;
}

function extractArray(payload: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null
    );
  }
  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) {
        return (record[key] as unknown[]).filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null
        );
      }
    }
  }
  return [];
}

function normalizeJourneyStatus(raw: unknown): JourneyExecutionStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['healthy', 'passed', 'ok', 'success', 'up'].includes(s)) return 'healthy';
  if (['degraded', 'warning', 'slow', 'warn'].includes(s)) return 'degraded';
  if (['failing', 'failed', 'critical', 'error', 'down'].includes(s)) return 'failing';
  return 'unknown';
}

export function normalizeJourneys(payload: unknown): MonitoredJourneyRecord[] {
  const rows = extractArray(payload, ['journeys', 'items', 'data', 'results']);
  return rows.map((row, idx) => ({
    id: String(row.id ?? row.journey_id ?? row.journeyId ?? `journey-${idx}`),
    name: String(row.name ?? row.journey_name ?? row.title ?? 'Unnamed Journey'),
    slug: asStringOrNull(row.slug ?? row.key) ?? undefined,
    category: asStringOrNull(row.category ?? row.tier) ?? undefined,
    successRate: asNumberOrNull(
      row.successRate ?? row.success_rate ?? row.pass_rate ?? row.passRate
    ),
    averageLatencyMs: asNumberOrNull(
      row.averageLatencyMs ?? row.avg_latency_ms ?? row.latency_ms ?? row.latencyMs
    ),
    p95LatencyMs: asNumberOrNull(row.p95LatencyMs ?? row.p95_latency_ms),
    latestExecutionStatus: normalizeJourneyStatus(
      row.latestExecutionStatus ?? row.latest_status ?? row.status ?? row.state
    ),
    lastRunAt: asStringOrNull(
      row.lastRunAt ?? row.last_run_at ?? row.last_execution_at ?? row.updated_at
    ),
    stepCount: asNumberOrNull(row.stepCount ?? row.step_count),
  }));
}

function normalizeIncidentSeverity(raw: unknown): IncidentSeverity {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'sev1' || s === 'sev-1') return 'sev1';
  if (s === 'sev2' || s === 'sev-2') return 'sev2';
  if (s === 'sev3' || s === 'sev-3') return 'sev3';
  if (s === 'critical') return 'critical';
  if (s === 'high' || s === 'major') return 'high';
  if (s === 'medium' || s === 'warning' || s === 'moderate') return 'medium';
  return 'low';
}

function normalizeIncidentStatus(raw: unknown): IncidentLifecycleStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'investigating') return 'investigating';
  if (s === 'mitigating' || s === 'recovering') return 'mitigating';
  if (s === 'resolved' || s === 'closed') return 'resolved';
  return 'open';
}

export function normalizeIncidents(payload: unknown): IncidentActivityRecord[] {
  const rows = extractArray(payload, ['incidents', 'items', 'data', 'results']);
  return rows.map((row, idx) => ({
    id: String(row.id ?? row.incident_id ?? row.incidentId ?? `INC-${idx + 1}`),
    title: asStringOrNull(row.title ?? row.summary ?? row.name) ?? undefined,
    affectedTarget: String(
      row.affectedTarget ??
        row.affected_target ??
        row.journey_name ??
        row.service_name ??
        row.service ??
        row.journey ??
        'Unspecified Target'
    ),
    targetType:
      row.target_type === 'service' || row.targetType === 'service' ? 'service' : 'journey',
    severity: normalizeIncidentSeverity(row.severity ?? row.priority),
    status: normalizeIncidentStatus(row.status ?? row.state ?? row.lifecycle),
    firstSeenAt: String(
      row.firstSeenAt ?? row.first_seen_at ?? row.opened_at ?? row.created_at ?? '—'
    ),
    latestUpdateAt: String(
      row.latestUpdateAt ?? row.latest_update_at ?? row.updated_at ?? row.first_seen_at ?? '—'
    ),
    summary: asStringOrNull(row.summary ?? row.description) ?? undefined,
  }));
}

function normalizeServiceState(raw: unknown): ServiceHealthState {
  const s = String(raw ?? '').toLowerCase();
  if (['healthy', 'up', 'ok', 'operational'].includes(s)) return 'healthy';
  if (['degraded', 'warning', 'elevated', 'slow'].includes(s)) return 'degraded';
  if (['unhealthy', 'critical', 'down', 'unreachable', 'failing'].includes(s)) {
    return 'unhealthy';
  }
  return 'unknown';
}

export function normalizeServices(payload: unknown): ServiceHealthRecord[] {
  const rows = extractArray(payload, ['services', 'items', 'data', 'nodes']);
  return rows.map((row, idx) => ({
    id: String(row.id ?? row.service_id ?? row.serviceId ?? `svc-${idx}`),
    name: String(row.name ?? row.service_name ?? row.serviceName ?? 'Unnamed Service'),
    role: asStringOrNull(row.role ?? row.tier) ?? undefined,
    category: asStringOrNull(row.category ?? row.group ?? row.type) ?? undefined,
    state: normalizeServiceState(row.state ?? row.status ?? row.health),
    latencyMs: asNumberOrNull(row.latencyMs ?? row.latency_ms ?? row.response_time_ms),
    errorRatePercent: asNumberOrNull(
      row.errorRatePercent ?? row.error_rate_percent ?? row.error_rate
    ),
    lastCheckedAt: asStringOrNull(
      row.lastCheckedAt ?? row.last_checked_at ?? row.heartbeat_at ?? row.updated_at
    ),
    providerType: asStringOrNull(row.providerType ?? row.provider_type) ?? undefined,
  }));
}

export function normalizeFailurePatterns(payload: unknown): FailurePatternRecord[] {
  const rows = extractArray(payload, ['patterns', 'failure_patterns', 'items', 'data']);
  return rows.map((row, idx) => {
    const rawSev = String(row.severity ?? 'warning').toLowerCase();
    const severity: FailurePatternRecord['severity'] =
      rawSev === 'critical' || rawSev === 'high'
        ? 'critical'
        : rawSev === 'info' || rawSev === 'low'
          ? 'info'
          : 'warning';

    const rawStatus = String(row.status ?? 'active').toLowerCase();
    const status: FailurePatternRecord['status'] =
      rawStatus === 'regressing'
        ? 'regressing'
        : rawStatus === 'suppressed' || rawStatus === 'muted'
          ? 'suppressed'
          : 'active';

    return {
      id: String(row.id ?? row.pattern_id ?? row.signature_hash ?? `pat-${idx}`),
      signature: String(
        row.signature ?? row.pattern_title ?? row.title ?? row.error_code ?? 'Unnamed Pattern'
      ),
      affectedJourneyOrService: String(
        row.affectedJourneyOrService ??
          row.affected_target ??
          row.affected_step ??
          row.journey ??
          row.service ??
          '—'
      ),
      occurrencesCount: asNumberOrNull(row.occurrencesCount ?? row.occurrences_count ?? row.count) ?? 0,
      severity,
      lastObservedAt: String(
        row.lastObservedAt ?? row.last_observed_at ?? row.updated_at ?? '—'
      ),
      status,
    };
  });
}

function normalizeRecoveryStatus(raw: unknown): RecoveryVerificationStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['verified', 'completed', 'succeeded', 'success'].includes(s)) return 'verified';
  if (['in_progress', 'in-progress', 'running', 'executing'].includes(s)) return 'in_progress';
  if (['pending_approval', 'pending', 'awaiting_approval'].includes(s)) {
    return 'pending_approval';
  }
  if (['rolled_back', 'rolled-back', 'reverted'].includes(s)) return 'rolled_back';
  return 'failed';
}

export function normalizeRecoveryAttempts(payload: unknown): RecoveryAttemptRecord[] {
  const rows = extractArray(payload, ['executions', 'recoveries', 'items', 'data']);
  return rows.map((row, idx) => ({
    id: String(row.id ?? row.action_run_id ?? row.execution_id ?? `rec-${idx}`),
    playbookName: String(
      row.playbookName ?? row.playbook_name ?? row.playbook ?? row.action ?? 'Recovery Action'
    ),
    targetServiceOrJourney: String(
      row.targetServiceOrJourney ?? row.target ?? row.service ?? row.journey ?? '—'
    ),
    incidentId: asStringOrNull(row.incidentId ?? row.incident_id ?? row.incident_ref),
    status: normalizeRecoveryStatus(row.status ?? row.state),
    verificationResult: asStringOrNull(
      row.verificationResult ?? row.verification_result ?? row.verification
    ),
    initiatedBy: asStringOrNull(row.initiatedBy ?? row.initiated_by ?? row.initiator) ?? undefined,
    executedAt: String(row.executedAt ?? row.executed_at ?? row.started_at ?? '—'),
  }));
}

export function normalizePendingApprovals(payload: unknown): PendingApprovalRecord[] {
  const rows = extractArray(payload, ['approvals', 'items', 'data', 'queue']);
  return rows.map((row, idx) => {
    const rawBlast = String(row.blastRadius ?? row.blast_radius ?? 'medium').toLowerCase();
    const blastRadius: PendingApprovalRecord['blastRadius'] =
      rawBlast === 'high' ? 'high' : rawBlast === 'low' ? 'low' : 'medium';

    const rawStatus = String(row.status ?? 'pending').toLowerCase();
    const status: PendingApprovalRecord['status'] =
      rawStatus === 'approved'
        ? 'approved'
        : rawStatus === 'rejected'
          ? 'rejected'
          : rawStatus === 'expired'
            ? 'expired'
            : 'pending';

    return {
      id: String(row.id ?? row.approval_id ?? row.request_id ?? `apr-${idx}`),
      proposedCountermeasure: String(
        row.proposedCountermeasure ??
          row.proposed_countermeasure ??
          row.proposed_action ??
          row.playbook_name ??
          'Countermeasure Proposal'
      ),
      targetScope: String(row.targetScope ?? row.target_scope ?? row.target ?? '—'),
      blastRadius,
      requestedAt: String(row.requestedAt ?? row.requested_at ?? row.created_at ?? '—'),
      expiresAt: asStringOrNull(row.expiresAt ?? row.expires_at),
      status,
    };
  });
}

export function useCommandCenterData(timeRange: TimeRangeValue) {
  const journeysQuery = useQuery<MonitoredJourneyRecord[], ContinuumApiError>({
    queryKey: ['cc-journeys', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/journeys?window=${timeRange}`);
      return normalizeJourneys(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const incidentsQuery = useQuery<IncidentActivityRecord[], ContinuumApiError>({
    queryKey: ['cc-incidents', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/incidents?window=${timeRange}`);
      return normalizeIncidents(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const servicesQuery = useQuery<ServiceHealthRecord[], ContinuumApiError>({
    queryKey: ['cc-services', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/services/health?window=${timeRange}`);
      return normalizeServices(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const failurePatternsQuery = useQuery<FailurePatternRecord[], ContinuumApiError>({
    queryKey: ['cc-failure-patterns', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/intelligence/failure-patterns?window=${timeRange}`
      );
      return normalizeFailurePatterns(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const recoveryExecutionsQuery = useQuery<RecoveryAttemptRecord[], ContinuumApiError>({
    queryKey: ['cc-recovery-executions', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/recovery/executions?window=${timeRange}`
      );
      return normalizeRecoveryAttempts(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const recoveryApprovalsQuery = useQuery<PendingApprovalRecord[], ContinuumApiError>({
    queryKey: ['cc-recovery-approvals', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/recovery/approvals?window=${timeRange}`
      );
      return normalizePendingApprovals(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Compute KPI metrics strictly from actual backend data when available (never fabricated)
  const kpiMetrics: CommandCenterKpiMetrics = {};

  if (journeysQuery.isSuccess && journeysQuery.data) {
    const validRates = journeysQuery.data
      .map((j) => j.successRate)
      .filter((r): r is number => r !== null);
    if (validRates.length > 0) {
      kpiMetrics.overallJourneySuccessRate =
        validRates.reduce((acc, r) => acc + r, 0) / validRates.length;
    }

    const validLatencies = journeysQuery.data
      .map((j) => j.averageLatencyMs)
      .filter((l): l is number => l !== null);
    if (validLatencies.length > 0) {
      kpiMetrics.averageJourneyLatencyMs = Math.round(
        validLatencies.reduce((acc, l) => acc + l, 0) / validLatencies.length
      );
    }
  }

  if (incidentsQuery.isSuccess && incidentsQuery.data) {
    const active = incidentsQuery.data.filter((inc) => inc.status !== 'resolved');
    kpiMetrics.activeIncidentsCount = active.length;
    kpiMetrics.criticalIncidentsCount = active.filter(
      (inc) => inc.severity === 'critical' || inc.severity === 'sev1'
    ).length;
  }

  if (servicesQuery.isSuccess && servicesQuery.data) {
    kpiMetrics.totalServicesCount = servicesQuery.data.length;
    kpiMetrics.unhealthyServicesCount = servicesQuery.data.filter(
      (svc) => svc.state === 'unhealthy' || svc.state === 'degraded'
    ).length;
  }

  if (recoveryExecutionsQuery.isSuccess && recoveryExecutionsQuery.data) {
    const total = recoveryExecutionsQuery.data.length;
    kpiMetrics.totalRecoveryAttempts = total;
    if (total > 0) {
      const verified = recoveryExecutionsQuery.data.filter(
        (r) => r.status === 'verified'
      ).length;
      kpiMetrics.recoverySuccessRate = (verified / total) * 100;
    }
  }

  if (failurePatternsQuery.isSuccess && failurePatternsQuery.data) {
    kpiMetrics.detectedFailurePatternsCount = failurePatternsQuery.data.length;
    kpiMetrics.recurringPatternsCount = failurePatternsQuery.data.filter(
      (p) => p.status === 'active' || p.status === 'regressing'
    ).length;
  }

  const isAnyFetching =
    journeysQuery.isFetching ||
    incidentsQuery.isFetching ||
    servicesQuery.isFetching ||
    failurePatternsQuery.isFetching ||
    recoveryExecutionsQuery.isFetching ||
    recoveryApprovalsQuery.isFetching;

  const refetchAll = () => {
    void journeysQuery.refetch();
    void incidentsQuery.refetch();
    void servicesQuery.refetch();
    void failurePatternsQuery.refetch();
    void recoveryExecutionsQuery.refetch();
    void recoveryApprovalsQuery.refetch();
  };

  return {
    journeysQuery,
    incidentsQuery,
    servicesQuery,
    failurePatternsQuery,
    recoveryExecutionsQuery,
    recoveryApprovalsQuery,
    kpiMetrics,
    isAnyFetching,
    refetchAll,
  };
}
