import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ContinuumApiError } from './client';
import type {
  FailurePatternRecord,
  IncidentLifecycleStatus,
  IncidentSeverity,
  RecoveryAttemptRecord,
} from './contracts';
import { normalizeFailurePatterns, normalizeRecoveryAttempts } from './commandCenter';
import type { TimeRangeValue } from '../styles/tokens';

export interface IncidentTimelineEvent {
  id: string;
  timestamp: string;
  eventType: 'detected' | 'step_failed' | 'acknowledged' | 'status_changed' | 'recovery_initiated' | 'mitigated' | 'resolved';
  title: string;
  description?: string | null;
  actor?: string | null;
}

export interface SanitizedDiagnosticEvidence {
  id: string;
  evidenceType: 'assertion_mismatch' | 'upstream_http_fault' | 'latency_spike' | 'trace_payload';
  target: string;
  sanitizedPayload: string;
  capturedAt: string;
  redactionsApplied: string[];
}

export interface IncidentRecordItem {
  id: string;
  title: string;
  summary: string | null;
  severity: IncidentSeverity;
  status: IncidentLifecycleStatus;
  affectedJourneyId: string | null;
  affectedJourneyName: string | null;
  affectedServiceId: string | null;
  affectedServiceName: string | null;
  firstSeenAt: string;
  latestUpdateAt: string;
  associatedExecutionId: string | null;
  assignedOwner: string | null;
  failedStepName: string | null;
  failedStepOrder: number | null;
  errorMessage: string | null;
  errorCode: string | null;
}

export interface IncidentDetailRecord extends IncidentRecordItem {
  timeline: IncidentTimelineEvent[];
  diagnosticEvidence: SanitizedDiagnosticEvidence[];
  relatedFailurePatterns: FailurePatternRecord[];
  recoveryAttempts: RecoveryAttemptRecord[];
  rcaSummary?: RcaReportItem | null;
}

export interface RcaEvidenceItem {
  category: 'trace' | 'metric' | 'deploy' | 'dependency' | 'log';
  summary: string;
  metricDelta?: string | null;
  timestamp?: string | null;
}

export interface RcaReportItem {
  id: string;
  incidentId: string;
  incidentTitle?: string | null;
  identifiedCause: string;
  analysisType: 'deterministic' | 'ai_assisted';
  confidenceScore: number | null; // 0-100
  confidenceLevel: 'confirmed' | 'high' | 'candidate' | 'tentative';
  isHypothesisOnly: boolean;
  culpritServiceOrDependency: string;
  supportingEvidence: RcaEvidenceItem[];
  recommendedRemediation: string;
  recommendedPlaybookId?: string | null;
  recommendedPlaybookName?: string | null;
  analyzedAt: string;
}

// ---------------------------------------------------------------------------
// Sanitization Helper (ensures secrets, card data, tokens are never rendered)
// ---------------------------------------------------------------------------

export function sanitizeDiagnosticTrace(rawText: string): {
  sanitized: string;
  redactions: string[];
} {
  const redactions: string[] = [];
  let sanitized = rawText;

  // Redact potential credit card numbers (13-19 digits)
  if (/\b(?:\d[ -]*?){13,19}\b/.test(sanitized)) {
    sanitized = sanitized.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_PAYMENT_CARD]');
    redactions.push('Payment Card PAN');
  }

  // Redact CVV / CVC (3-4 digits after cvv/cvc label)
  if (/(?:cvv|cvc|security_code)\s*[:=]\s*["']?\d{3,4}["']?/i.test(sanitized)) {
    sanitized = sanitized.replace(
      /(cvv|cvc|security_code)\s*[:=]\s*["']?\d{3,4}["']?/gi,
      '$1: [REDACTED_CVV]'
    );
    redactions.push('Card Security Code');
  }

  // Redact Bearer tokens, API keys, passwords
  if (/(bearer\s+[a-zA-Z0-9_\-\.]{15,})/i.test(sanitized)) {
    sanitized = sanitized.replace(/(bearer\s+)[a-zA-Z0-9_\-\.]{15,}/gi, '$1[REDACTED_TOKEN]');
    redactions.push('Authorization Token');
  }

  if (/(password|secret|api_key|apikey|private_key)\s*[:=]\s*["'][^"']+["']/i.test(sanitized)) {
    sanitized = sanitized.replace(
      /(password|secret|api_key|apikey|private_key)\s*[:=]\s*["'][^"']+["']/gi,
      '$1: "[REDACTED_CREDENTIAL]"'
    );
    redactions.push('Credential');
  }

  return { sanitized, redactions };
}

// ---------------------------------------------------------------------------
// Normalizers (supporting both snake_case and camelCase from FastAPI)
// ---------------------------------------------------------------------------

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
    const obj = payload as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(obj[key])) {
        return (obj[key] as unknown[]).filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null
        );
      }
    }
  }
  return [];
}

export function normalizeIncidentSeverity(raw: unknown): IncidentSeverity {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'sev1' || s === 'sev-1' || s === 'critical') return 'critical';
  if (s === 'sev2' || s === 'sev-2' || s === 'high' || s === 'major') return 'sev2';
  if (s === 'sev3' || s === 'sev-3' || s === 'medium' || s === 'moderate') return 'sev3';
  return 'low';
}

export function normalizeIncidentStatus(raw: unknown): IncidentLifecycleStatus {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'investigating') return 'investigating';
  if (s === 'mitigating' || s === 'recovering') return 'mitigating';
  if (s === 'resolved' || s === 'closed') return 'resolved';
  return 'open';
}

export function normalizeIncidentItem(
  row: Record<string, unknown>,
  idx = 0
): IncidentRecordItem {
  const id = String(row.id ?? row.incident_id ?? row.incidentId ?? `INC-${idx + 1}`);
  const title = String(
    row.title ?? row.summary ?? row.name ?? row.headline ?? `Incident ${id}`
  );
  const summary = asStringOrNull(row.summary ?? row.description ?? row.details);

  return {
    id,
    title,
    summary,
    severity: normalizeIncidentSeverity(row.severity ?? row.priority ?? row.level),
    status: normalizeIncidentStatus(row.status ?? row.lifecycle ?? row.state),
    affectedJourneyId: asStringOrNull(
      row.affectedJourneyId ?? row.affected_journey_id ?? row.journey_id ?? row.journeyId
    ),
    affectedJourneyName: asStringOrNull(
      row.affectedJourneyName ??
        row.affected_journey_name ??
        row.journey_name ??
        row.journey
    ),
    affectedServiceId: asStringOrNull(
      row.affectedServiceId ?? row.affected_service_id ?? row.service_id ?? row.serviceId
    ),
    affectedServiceName: asStringOrNull(
      row.affectedServiceName ??
        row.affected_service_name ??
        row.service_name ??
        row.service
    ),
    firstSeenAt: String(
      row.firstSeenAt ?? row.first_seen_at ?? row.opened_at ?? row.created_at ?? '—'
    ),
    latestUpdateAt: String(
      row.latestUpdateAt ?? row.latest_update_at ?? row.updated_at ?? row.first_seen_at ?? '—'
    ),
    associatedExecutionId: asStringOrNull(
      row.associatedExecutionId ??
        row.associated_execution_id ??
        row.execution_id ??
        row.executionId
    ),
    assignedOwner: asStringOrNull(
      row.assignedOwner ?? row.assigned_owner ?? row.owner ?? row.assignee
    ),
    failedStepName: asStringOrNull(
      row.failedStepName ?? row.failed_step_name ?? row.failed_step
    ),
    failedStepOrder: asNumberOrNull(row.failedStepOrder ?? row.failed_step_order),
    errorMessage: asStringOrNull(
      row.errorMessage ?? row.error_message ?? row.error ?? row.failure_reason
    ),
    errorCode: asStringOrNull(row.errorCode ?? row.error_code),
  };
}

export function normalizeIncidentsList(payload: unknown): IncidentRecordItem[] {
  const rows = extractArray(payload, ['incidents', 'items', 'data', 'results']);
  return rows.map((r, i) => normalizeIncidentItem(r, i));
}

function normalizeTimelineEvent(
  raw: Record<string, unknown>,
  idx: number
): IncidentTimelineEvent {
  const rawType = String(raw.eventType ?? raw.event_type ?? raw.type ?? 'detected').toLowerCase();
  let eventType: IncidentTimelineEvent['eventType'] = 'detected';
  if (['step_failed', 'failure', 'assertion_failed'].includes(rawType)) {
    eventType = 'step_failed';
  } else if (['acknowledged', 'ack'].includes(rawType)) {
    eventType = 'acknowledged';
  } else if (['status_changed', 'state_changed'].includes(rawType)) {
    eventType = 'status_changed';
  } else if (['recovery_initiated', 'recovery', 'action'].includes(rawType)) {
    eventType = 'recovery_initiated';
  } else if (['mitigated', 'mitigating'].includes(rawType)) {
    eventType = 'mitigated';
  } else if (['resolved', 'closed'].includes(rawType)) {
    eventType = 'resolved';
  }

  return {
    id: String(raw.id ?? raw.event_id ?? `evt-${idx + 1}`),
    timestamp: String(raw.timestamp ?? raw.created_at ?? raw.time ?? '—'),
    eventType,
    title: String(raw.title ?? raw.summary ?? raw.message ?? 'Timeline Event'),
    description: asStringOrNull(raw.description ?? raw.detail),
    actor: asStringOrNull(raw.actor ?? raw.user ?? raw.operator),
  };
}

function normalizeDiagnosticEvidence(
  raw: Record<string, unknown>,
  idx: number
): SanitizedDiagnosticEvidence {
  const rawText = String(
    raw.payload ?? raw.sanitizedPayload ?? raw.trace ?? raw.message ?? raw.evidence ?? ''
  );
  const { sanitized, redactions } = sanitizeDiagnosticTrace(rawText);

  return {
    id: String(raw.id ?? raw.evidence_id ?? `ev-${idx + 1}`),
    evidenceType: 'assertion_mismatch',
    target: String(raw.target ?? raw.endpoint ?? raw.step ?? 'Telemetry Probe Target'),
    sanitizedPayload: sanitized,
    capturedAt: String(raw.capturedAt ?? raw.captured_at ?? raw.timestamp ?? '—'),
    redactionsApplied: redactions,
  };
}

export function normalizeRcaItem(raw: Record<string, unknown>, idx = 0): RcaReportItem {
  const rawType = String(
    raw.analysisType ?? raw.analysis_type ?? raw.source ?? 'deterministic'
  ).toLowerCase();
  const isAi = rawType.includes('ai') || rawType.includes('llm') || rawType.includes('assistant');
  const analysisType: RcaReportItem['analysisType'] = isAi ? 'ai_assisted' : 'deterministic';

  const rawLevel = String(raw.confidenceLevel ?? raw.confidence_level ?? raw.level ?? '').toLowerCase();
  let confidenceLevel: RcaReportItem['confidenceLevel'] = isAi ? 'candidate' : 'confirmed';
  if (rawLevel === 'confirmed') confidenceLevel = 'confirmed';
  else if (rawLevel === 'high') confidenceLevel = 'high';
  else if (rawLevel === 'candidate') confidenceLevel = 'candidate';
  else if (rawLevel === 'tentative') confidenceLevel = 'tentative';

  const isHypothesisOnly =
    raw.isHypothesisOnly === true ||
    raw.is_hypothesis_only === true ||
    isAi ||
    confidenceLevel === 'candidate' ||
    confidenceLevel === 'tentative';

  const rawEvidence = extractArray(
    raw.supportingEvidence ?? raw.supporting_evidence ?? raw.evidence,
    ['evidence', 'items']
  );
  const supportingEvidence: RcaEvidenceItem[] = rawEvidence.map((ev) => ({
    category: 'dependency',
    summary: String(ev.summary ?? ev.description ?? ev.message ?? 'Correlated Telemetry Evidence'),
    metricDelta: asStringOrNull(ev.metricDelta ?? ev.metric_delta ?? ev.delta),
    timestamp: asStringOrNull(ev.timestamp ?? ev.time),
  }));

  return {
    id: String(raw.id ?? raw.rca_id ?? raw.analysis_id ?? `rca-${idx + 1}`),
    incidentId: String(raw.incidentId ?? raw.incident_id ?? raw.incident_ref ?? '—'),
    incidentTitle: asStringOrNull(raw.incidentTitle ?? raw.incident_title),
    identifiedCause: String(
      raw.identifiedCause ??
        raw.identified_cause ??
        raw.root_cause ??
        raw.culprit ??
        'Root cause under investigation'
    ),
    analysisType,
    confidenceScore: asNumberOrNull(raw.confidenceScore ?? raw.confidence_score ?? raw.score),
    confidenceLevel,
    isHypothesisOnly,
    culpritServiceOrDependency: String(
      raw.culpritServiceOrDependency ??
        raw.culprit_service ??
        raw.culprit ??
        raw.service ??
        '—'
    ),
    supportingEvidence,
    recommendedRemediation: String(
      raw.recommendedRemediation ??
        raw.recommended_remediation ??
        raw.remediation ??
        raw.recommended_action ??
        'Inspect upstream logs and review countermeasure playbooks.'
    ),
    recommendedPlaybookId: asStringOrNull(
      raw.recommendedPlaybookId ?? raw.recommended_playbook_id ?? raw.playbook_id
    ),
    recommendedPlaybookName: asStringOrNull(
      raw.recommendedPlaybookName ?? raw.recommended_playbook_name ?? raw.playbook_name
    ),
    analyzedAt: String(raw.analyzedAt ?? raw.analyzed_at ?? raw.created_at ?? '—'),
  };
}

export function normalizeIncidentDetail(payload: unknown): IncidentDetailRecord {
  const obj =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const base = normalizeIncidentItem(obj, 0);

  const rawEvents = extractArray(obj.timeline ?? obj.events ?? obj.history, [
    'timeline',
    'events',
  ]);
  const timeline = rawEvents.map((e, i) => normalizeTimelineEvent(e, i));

  const rawEvidence = extractArray(
    obj.diagnosticEvidence ?? obj.diagnostic_evidence ?? obj.evidence ?? obj.traces,
    ['evidence', 'traces']
  );
  const diagnosticEvidence = rawEvidence.map((ev, i) =>
    normalizeDiagnosticEvidence(ev, i)
  );

  const relatedFailurePatterns = normalizeFailurePatterns(
    obj.relatedFailurePatterns ?? obj.related_failure_patterns ?? obj.failure_patterns ?? []
  );
  const recoveryAttempts = normalizeRecoveryAttempts(
    obj.recoveryAttempts ?? obj.recovery_attempts ?? obj.recoveries ?? []
  );

  const rawRca = (obj.rcaSummary ?? obj.rca_summary ?? obj.rca) as
    | Record<string, unknown>
    | undefined;
  const rcaSummary = rawRca && typeof rawRca === 'object' ? normalizeRcaItem(rawRca, 0) : null;

  return {
    ...base,
    timeline,
    diagnosticEvidence,
    relatedFailurePatterns,
    recoveryAttempts,
    rcaSummary,
  };
}

export function normalizeRcaList(payload: unknown): RcaReportItem[] {
  const rows = extractArray(payload, ['rca_reports', 'reports', 'items', 'data', 'analyses']);
  return rows.map((r, i) => normalizeRcaItem(r, i));
}

// ---------------------------------------------------------------------------
// TanStack Query & Mutation Hooks
// ---------------------------------------------------------------------------

export function useIncidentsListQuery(timeRange: TimeRangeValue) {
  return useQuery<IncidentRecordItem[], ContinuumApiError>({
    queryKey: ['incidents-list', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/incidents?window=${timeRange}`);
      return normalizeIncidentsList(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useIncidentDetailQuery(incidentId: string | null, timeRange: TimeRangeValue) {
  return useQuery<IncidentDetailRecord, ContinuumApiError>({
    queryKey: ['incident-detail', incidentId, timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/incidents/${encodeURIComponent(incidentId!)}?window=${timeRange}`
      );
      return normalizeIncidentDetail(raw);
    },
    enabled: Boolean(incidentId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useRcaListQuery(timeRange: TimeRangeValue) {
  return useQuery<RcaReportItem[], ContinuumApiError>({
    queryKey: ['rca-reports-list', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/intelligence/rca?window=${timeRange}`);
      return normalizeRcaList(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export interface UpdateIncidentStatusRequest {
  incidentId: string;
  status: IncidentLifecycleStatus;
  note?: string;
}

export function useUpdateIncidentStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { incidentId: string; status: IncidentLifecycleStatus; message?: string },
    ContinuumApiError,
    UpdateIncidentStatusRequest
  >({
    mutationFn: async ({ incidentId, status, note }) => {
      const endpoint = `/api/v1/incidents/${encodeURIComponent(incidentId)}/status`;
      const raw = await apiRequest<Record<string, unknown>>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          incident_id: incidentId,
          status,
          note: note?.trim() || undefined,
        }),
      });

      return {
        incidentId: String(raw.incidentId ?? raw.incident_id ?? incidentId),
        status: normalizeIncidentStatus(raw.status ?? status),
        message: asStringOrNull(raw.message ?? raw.detail) ?? undefined,
      };
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['incidents-list'] });
      void queryClient.invalidateQueries({
        queryKey: ['incident-detail', variables.incidentId],
      });
      void queryClient.invalidateQueries({ queryKey: ['cc-incidents'] });
    },
  });
}

export interface AcknowledgeIncidentRequest {
  incidentId: string;
  operatorNotes?: string;
}

export function useAcknowledgeIncidentMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { incidentId: string; acknowledgedAt: string; message?: string },
    ContinuumApiError,
    AcknowledgeIncidentRequest
  >({
    mutationFn: async ({ incidentId, operatorNotes }) => {
      const endpoint = `/api/v1/incidents/${encodeURIComponent(incidentId)}/acknowledge`;
      const raw = await apiRequest<Record<string, unknown>>(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          incident_id: incidentId,
          notes: operatorNotes?.trim() || undefined,
        }),
      });

      return {
        incidentId: String(raw.incidentId ?? raw.incident_id ?? incidentId),
        acknowledgedAt: String(raw.acknowledgedAt ?? raw.acknowledged_at ?? new Date().toISOString()),
        message: asStringOrNull(raw.message ?? raw.detail) ?? undefined,
      };
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['incidents-list'] });
      void queryClient.invalidateQueries({
        queryKey: ['incident-detail', variables.incidentId],
      });
    },
  });
}
