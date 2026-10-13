import { useQuery } from '@tanstack/react-query';
import { apiRequest, ContinuumApiError } from './client';
import type { TimeRangeValue } from '../styles/tokens';

export interface SloAttainmentMetric {
  sloId: string;
  objectiveName: string;
  targetPercent: number;
  currentPercent: number | null;
  budgetRemainingPercent: number | null;
  burnRateRatio: number | null;
  status: 'healthy' | 'at_risk' | 'breached';
  evaluationWindow: string;
}

export interface ReliabilityTimeSeriesPoint {
  timestamp: string;
  label: string;
  successRate?: number | null;
  avgLatencyMs?: number | null;
  p95LatencyMs?: number | null;
  incidentCount?: number | null;
  healthyServicesCount?: number | null;
}

export interface ReliabilityAnalyticsPayload {
  mttdMinutes: number | null;
  mttrMinutes: number | null;
  sloAttainment: SloAttainmentMetric[];
  timeSeries: ReliabilityTimeSeriesPoint[];
  summaryNotes?: string | null;
}

function asNumberOrNull(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asStringOrNull(val: unknown): string | null {
  return typeof val === 'string' && val.trim() !== '' ? val : null;
}

function normalizeSloList(raw: unknown): SloAttainmentMetric[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((obj, idx) => {
      const target = asNumberOrNull(obj.targetPercent ?? obj.target_percent ?? obj.target) ?? 99.9;
      const current = asNumberOrNull(obj.currentPercent ?? obj.current_percent ?? obj.current);
      const budget = asNumberOrNull(obj.budgetRemainingPercent ?? obj.budget_remaining_percent ?? obj.budget);
      const burn = asNumberOrNull(obj.burnRateRatio ?? obj.burn_rate_ratio ?? obj.burn_rate);
      
      let status: 'healthy' | 'at_risk' | 'breached' = 'healthy';
      if (current !== null) {
        if (current < target) status = 'breached';
        else if (budget !== null && budget < 20) status = 'at_risk';
      }

      return {
        sloId: String(obj.sloId ?? obj.slo_id ?? obj.id ?? `slo-${idx + 1}`),
        objectiveName: String(obj.objectiveName ?? obj.objective_name ?? obj.name ?? `SLO #${idx + 1}`),
        targetPercent: target,
        currentPercent: current,
        budgetRemainingPercent: budget,
        burnRateRatio: burn,
        status: (obj.status as 'healthy' | 'at_risk' | 'breached') || status,
        evaluationWindow: String(obj.evaluationWindow ?? obj.evaluation_window ?? obj.window ?? '30d'),
      };
    });
}

function normalizeTimeSeries(raw: unknown): ReliabilityTimeSeriesPoint[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((obj, idx) => {
      const ts = String(obj.timestamp ?? obj.time ?? obj.date ?? new Date().toISOString());
      const label = asStringOrNull(obj.label) ?? (ts.includes('T') ? ts.split('T')[1].slice(0, 5) : `T-${idx}`);
      return {
        timestamp: ts,
        label,
        successRate: asNumberOrNull(obj.successRate ?? obj.success_rate ?? obj.availability),
        avgLatencyMs: asNumberOrNull(obj.avgLatencyMs ?? obj.avg_latency_ms ?? obj.latency_ms),
        p95LatencyMs: asNumberOrNull(obj.p95LatencyMs ?? obj.p95_latency_ms),
        incidentCount: asNumberOrNull(obj.incidentCount ?? obj.incident_count ?? obj.incidents),
        healthyServicesCount: asNumberOrNull(obj.healthyServicesCount ?? obj.healthy_services_count),
      };
    });
}

export function normalizeReliabilityAnalyticsPayload(payload: unknown): ReliabilityAnalyticsPayload {
  if (typeof payload !== 'object' || payload === null) {
    return {
      mttdMinutes: null,
      mttrMinutes: null,
      sloAttainment: [],
      timeSeries: [],
      summaryNotes: null,
    };
  }

  const obj = payload as Record<string, unknown>;
  const slosRaw = obj.sloAttainment ?? obj.slo_attainment ?? obj.slos ?? [];
  const seriesRaw = obj.timeSeries ?? obj.time_series ?? obj.series ?? obj.points ?? [];

  return {
    mttdMinutes: asNumberOrNull(obj.mttdMinutes ?? obj.mttd_minutes ?? obj.mttd),
    mttrMinutes: asNumberOrNull(obj.mttrMinutes ?? obj.mttr_minutes ?? obj.mttr),
    sloAttainment: normalizeSloList(slosRaw),
    timeSeries: normalizeTimeSeries(seriesRaw),
    summaryNotes: asStringOrNull(obj.summaryNotes ?? obj.summary_notes ?? obj.notes),
  };
}

export function useReliabilityAnalyticsEndpointQuery(timeRange: TimeRangeValue) {
  return useQuery<ReliabilityAnalyticsPayload, ContinuumApiError>({
    queryKey: ['reliability-analytics-endpoint', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/analytics/reliability?window=${timeRange}`);
      return normalizeReliabilityAnalyticsPayload(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}
