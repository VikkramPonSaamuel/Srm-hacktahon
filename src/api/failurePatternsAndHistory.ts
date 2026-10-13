import { useQuery } from '@tanstack/react-query';
import { apiRequest, ContinuumApiError } from './client';
import type { TimeRangeValue } from '../styles/tokens';
import { sanitizeDiagnosticTrace } from './incidentsAndRca';

export type PatternRecurrenceStatus = 'new' | 'recurring' | 'resolved' | 'suppressed';

export interface PatternOccurrenceEvent {
  id: string;
  timestamp: string;
  executionId?: string | null;
  journeyId?: string | null;
  journeyName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  stepName?: string | null;
  latencyMs?: number | null;
  httpStatus?: number | null;
}

export interface PatternErrorSignature {
  signatureHash: string;
  errorCode: string;
  rawSample: string;
  sanitizedSample: string;
  redactions: string[];
  frequencyCount: number;
}

export interface PatternEvidencePoint {
  id: string;
  category: 'assertion' | 'latency' | 'frequency' | 'correlation';
  description: string;
  metricValue?: string | null;
  timestamp?: string | null;
}

export interface FailurePatternItem {
  id: string;
  signatureHash: string;
  name: string;
  summary: string | null;
  description: string | null;
  category: string;
  affectedJourneyId: string | null;
  affectedJourneyName: string | null;
  affectedServiceId: string | null;
  affectedServiceName: string | null;
  occurrencesCount: number;
  firstSeenAt: string;
  lastObservedAt: string;
  status: PatternRecurrenceStatus;
  confidenceScore: number | null; // 0-100
  detectionRule: string | null;
  classificationRule: string | null;
  relatedIncidentIds: string[];
  suggestedPlaybookId?: string | null;
  suggestedPlaybookName?: string | null;
  suggestedCountermeasure?: string | null;
  errorSignatures: PatternErrorSignature[];
  occurrencesTimeline: PatternOccurrenceEvent[];
  evidencePoints: PatternEvidencePoint[];
}

export type HistoricalLedgerCategory =
  | 'executions'
  | 'incidents'
  | 'service_snapshots'
  | 'recovery_events';

export interface HistoricalRecordEntry {
  id: string;
  category: HistoricalLedgerCategory;
  title: string;
  targetEntity: string;
  status: string;
  timestamp: string;
  durationOrMetric?: string | null;
  details?: string | null;
  referencePath: string;
}

// ---------------------------------------------------------------------------
// CSV Export Utility for Already-Retrieved Authorized Records
// ---------------------------------------------------------------------------

export function exportRecordsToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const sanitizeCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) return '""';
    const str = String(cell).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvContent = [
    headers.map(sanitizeCell).join(','),
    ...rows.map((row) => row.map(sanitizeCell).join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename.replace(/\.csv$/, '')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Normalizers
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

export function normalizePatternStatus(raw: unknown): PatternRecurrenceStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['resolved', 'fixed', 'closed'].includes(s)) return 'resolved';
  if (['suppressed', 'muted', 'ignored'].includes(s)) return 'suppressed';
  if (['new', 'emerging', 'initial'].includes(s)) return 'new';
  return 'recurring';
}

export function normalizeFailurePatternItem(
  raw: Record<string, unknown>,
  idx = 0
): FailurePatternItem {
  const id = String(
    raw.id ?? raw.pattern_id ?? raw.signature_hash ?? raw.hash ?? `pat-${idx + 1}`
  );
  const signatureHash = String(
    raw.signature_hash ?? raw.signatureHash ?? raw.hash ?? raw.signature ?? id
  );
  const name = String(
    raw.name ??
      raw.pattern_title ??
      raw.patternTitle ??
      raw.title ??
      raw.signature ??
      `Failure Signature ${id}`
  );

  const rawOccurrences = extractArray(
    raw.occurrencesTimeline ?? raw.occurrences_timeline ?? raw.occurrences ?? raw.timeline,
    ['occurrences', 'timeline']
  );
  const occurrencesTimeline: PatternOccurrenceEvent[] = rawOccurrences.map((ev, i) => ({
    id: String(ev.id ?? ev.occurrence_id ?? `occ-${i + 1}`),
    timestamp: String(ev.timestamp ?? ev.created_at ?? ev.time ?? '—'),
    executionId: asStringOrNull(ev.executionId ?? ev.execution_id),
    journeyId: asStringOrNull(ev.journeyId ?? ev.journey_id),
    journeyName: asStringOrNull(ev.journeyName ?? ev.journey_name),
    serviceId: asStringOrNull(ev.serviceId ?? ev.service_id),
    serviceName: asStringOrNull(ev.serviceName ?? ev.service_name),
    stepName: asStringOrNull(ev.stepName ?? ev.step_name ?? ev.step),
    latencyMs: asNumberOrNull(ev.latencyMs ?? ev.latency_ms),
    httpStatus: asNumberOrNull(ev.httpStatus ?? ev.http_status ?? ev.status_code),
  }));

  const rawSignatures = extractArray(
    raw.errorSignatures ?? raw.error_signatures ?? raw.signatures ?? raw.samples,
    ['signatures', 'samples']
  );
  const errorSignatures: PatternErrorSignature[] = rawSignatures.map((sig, i) => {
    const rawSample = String(
      sig.rawSample ?? sig.raw_sample ?? sig.message ?? sig.sample ?? ''
    );
    const { sanitized, redactions } = sanitizeDiagnosticTrace(rawSample);
    return {
      signatureHash: String(
        sig.signatureHash ?? sig.signature_hash ?? sig.hash ?? `sig-${i + 1}`
      ),
      errorCode: String(sig.errorCode ?? sig.error_code ?? sig.code ?? 'ERR_ASSERTION'),
      rawSample,
      sanitizedSample: sanitized,
      redactions,
      frequencyCount: asNumberOrNull(sig.frequencyCount ?? sig.frequency_count ?? sig.count) ?? 1,
    };
  });

  const rawEvidence = extractArray(
    raw.evidencePoints ?? raw.evidence_points ?? raw.evidence,
    ['evidence', 'points']
  );
  const evidencePoints: PatternEvidencePoint[] = rawEvidence.map((ev, i) => ({
    id: String(ev.id ?? `ev-${i + 1}`),
    category: 'assertion',
    description: String(ev.description ?? ev.summary ?? ev.message ?? 'Clustered Failure Evidence'),
    metricValue: asStringOrNull(ev.metricValue ?? ev.metric_value ?? ev.value),
    timestamp: asStringOrNull(ev.timestamp ?? ev.time),
  }));

  const relatedIncidentIds: string[] = Array.isArray(raw.relatedIncidentIds ?? raw.related_incident_ids)
    ? (raw.relatedIncidentIds ?? raw.related_incident_ids) as string[]
    : Array.isArray(raw.incidents)
      ? (raw.incidents as Array<Record<string, unknown>>).map((inc) => String(inc.id ?? inc.incident_id ?? inc))
      : [];

  return {
    id,
    signatureHash,
    name,
    summary: asStringOrNull(raw.summary ?? raw.description),
    description: asStringOrNull(raw.description ?? raw.details),
    category: String(
      raw.category ??
        raw.pattern_class ??
        raw.patternClass ??
        raw.type ??
        'Upstream Assertion Mismatch'
    ),
    affectedJourneyId: asStringOrNull(
      raw.affectedJourneyId ?? raw.affected_journey_id ?? raw.journey_id
    ),
    affectedJourneyName: asStringOrNull(
      raw.affectedJourneyName ?? raw.affected_journey_name ?? raw.journey
    ),
    affectedServiceId: asStringOrNull(
      raw.affectedServiceId ?? raw.affected_service_id ?? raw.service_id
    ),
    affectedServiceName: asStringOrNull(
      raw.affectedServiceName ?? raw.affected_service_name ?? raw.service
    ),
    occurrencesCount:
      asNumberOrNull(raw.occurrencesCount ?? raw.occurrences_count ?? raw.count) ??
      occurrencesTimeline.length,
    firstSeenAt: String(
      raw.firstSeenAt ?? raw.first_seen_at ?? raw.created_at ?? '—'
    ),
    lastObservedAt: String(
      raw.lastObservedAt ?? raw.last_observed_at ?? raw.updated_at ?? '—'
    ),
    status: normalizePatternStatus(raw.status ?? raw.state),
    confidenceScore: asNumberOrNull(raw.confidenceScore ?? raw.confidence_score ?? raw.confidence),
    detectionRule: asStringOrNull(raw.detectionRule ?? raw.detection_rule ?? raw.rule),
    classificationRule: asStringOrNull(
      raw.classificationRule ?? raw.classification_rule ?? raw.classifier
    ),
    relatedIncidentIds,
    suggestedPlaybookId: asStringOrNull(
      raw.suggestedPlaybookId ?? raw.suggested_playbook_id ?? raw.playbook_id
    ),
    suggestedPlaybookName: asStringOrNull(
      raw.suggestedPlaybookName ?? raw.suggested_playbook_name ?? raw.playbook_name
    ),
    suggestedCountermeasure: asStringOrNull(
      raw.suggestedCountermeasure ?? raw.suggested_countermeasure ?? raw.remediation
    ),
    errorSignatures,
    occurrencesTimeline,
    evidencePoints,
  };
}

export function normalizeFailurePatternsList(payload: unknown): FailurePatternItem[] {
  const rows = extractArray(payload, [
    'patterns',
    'failure_patterns',
    'items',
    'data',
    'signatures',
  ]);
  return rows.map((r, i) => normalizeFailurePatternItem(r, i));
}

// ---------------------------------------------------------------------------
// TanStack Query Hooks
// ---------------------------------------------------------------------------

export function useFailurePatternsQuery(timeRange: TimeRangeValue) {
  return useQuery<FailurePatternItem[], ContinuumApiError>({
    queryKey: ['failure-patterns-list', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/intelligence/failure-patterns?window=${timeRange}`
      );
      return normalizeFailurePatternsList(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useFailurePatternDetailQuery(patternId: string | null, timeRange: TimeRangeValue) {
  return useQuery<FailurePatternItem, ContinuumApiError>({
    queryKey: ['failure-pattern-detail', patternId, timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/intelligence/failure-patterns/${encodeURIComponent(patternId!)}?window=${timeRange}`
      );
      const obj =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      return normalizeFailurePatternItem(obj, 0);
    },
    enabled: Boolean(patternId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}
