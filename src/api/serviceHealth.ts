import { useQuery } from '@tanstack/react-query';
import { apiRequest, ContinuumApiError } from './client';
import type { IncidentActivityRecord } from './contracts';
import { normalizeIncidents } from './commandCenter';
import type { TimeRangeValue } from '../styles/tokens';

/**
 * Operational states for monitored services.
 * Missing or unverified data is NEVER interpreted as 'healthy'.
 */
export type OperationalServiceState =
  | 'healthy'
  | 'degraded'
  | 'unhealthy'
  | 'stale'
  | 'unknown';

/**
 * Payment & synthetic transaction outcomes.
 * A request timeout is explicitly classified as 'unknown_timeout' or 'pending',
 * NEVER conflated with a confirmed 'failed' payment.
 */
export type TransactionOutcomeState =
  | 'success'
  | 'failed'
  | 'pending'
  | 'unknown_timeout'
  | 'unknown';

export interface ServiceStatusSnapshot {
  timestamp: string;
  state: OperationalServiceState;
  latencyMs: number | null;
  errorRatePercent: number | null;
  note?: string | null;
}

export interface ServiceErrorSummaryItem {
  id: string;
  errorCode: string;
  message: string;
  outcomeClassification: TransactionOutcomeState;
  occurrencesCount: number;
  lastObservedAt: string;
}

export interface ServiceExecutionReference {
  executionId: string;
  journeyId: string;
  journeyName: string;
  outcome: TransactionOutcomeState;
  latencyMs: number | null;
  timestamp: string;
}

export interface MonitoredServiceNode {
  id: string;
  name: string;
  serviceRole:
    | 'primary_payment_gateway'
    | 'secondary_payment_gateway'
    | 'authentication'
    | 'product_catalog'
    | 'cart'
    | 'checkout'
    | 'order_confirmation'
    | 'other';
  category: string | null;
  state: OperationalServiceState;
  isStale: boolean;
  staleReason: string | null;
  availabilityPercent: number | null;
  errorRatePercent: number | null;
  recentErrorsCount: number | null;
  latestErrorSummary: string | null;
  latencyMs: number | null;
  p95LatencyMs: number | null;
  lastCheckedAt: string | null;
  lastSuccessfulTransactionAt: string | null;
  lastTransactionOutcome: TransactionOutcomeState | null;
  failoverActivitySummary: string | null;
  verificationStatus: 'verified' | 'pending' | 'unverified' | 'failed' | null;
  trafficSharePercent: number | null;
  statusHistory: ServiceStatusSnapshot[];
}

export interface ServiceDetailRecord extends MonitoredServiceNode {
  historicalSnapshots: ServiceStatusSnapshot[];
  relevantIncidents: IncidentActivityRecord[];
  errorSummaries: ServiceErrorSummaryItem[];
  recentExecutions: ServiceExecutionReference[];
}

export interface ServiceHealthOverviewPayload {
  services: MonitoredServiceNode[];
  primaryGateway: MonitoredServiceNode | null;
  secondaryGateway: MonitoredServiceNode | null;
  evaluatedAt: string | null;
}

export const EXPECTED_SERVICE_ROLES: readonly {
  role: MonitoredServiceNode['serviceRole'];
  label: string;
  category: string;
}[] = [
  {
    role: 'primary_payment_gateway',
    label: 'Primary Payment Gateway',
    category: 'Payment Rail',
  },
  {
    role: 'secondary_payment_gateway',
    label: 'Secondary Payment Gateway',
    category: 'Payment Rail (Failover)',
  },
  {
    role: 'authentication',
    label: 'Authentication Service',
    category: 'Identity & Session',
  },
  {
    role: 'product_catalog',
    label: 'Product Catalog',
    category: 'Core Storefront',
  },
  {
    role: 'cart',
    label: 'Cart Service',
    category: 'Core Storefront',
  },
  {
    role: 'checkout',
    label: 'Checkout Service',
    category: 'Transaction Funnel',
  },
  {
    role: 'order_confirmation',
    label: 'Order Confirmation Service',
    category: 'Post-Purchase Fulfillment',
  },
] as const;

// ---------------------------------------------------------------------------
// Safe Normalizers (Never interpreting missing data as healthy or timeout as failed)
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

function asBooleanOrNull(val: unknown): boolean | null {
  if (typeof val === 'boolean') return val;
  if (val === 'true' || val === 1) return true;
  if (val === 'false' || val === 0) return false;
  return null;
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

/**
 * Explicitly maps backend health strings to OperationalServiceState.
 * Missing, null, undefined, or unrecognized states always map to 'unknown' or 'stale'—never 'healthy'.
 */
export function normalizeOperationalState(
  rawState: unknown,
  isStaleFlag?: boolean | null
): OperationalServiceState {
  if (isStaleFlag === true) return 'stale';
  const s = String(rawState ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (['stale', 'expired', 'outdated'].includes(s)) return 'stale';
  if (['healthy', 'operational', 'up', 'ok'].includes(s)) return 'healthy';
  if (['degraded', 'warning', 'elevated_latency', 'partial', 'slow'].includes(s)) {
    return 'degraded';
  }
  if (['unhealthy', 'critical', 'down', 'failing', 'offline', 'outage'].includes(s)) {
    return 'unhealthy';
  }
  return 'unknown';
}

/**
 * Distinguishes confirmed failure, confirmed success, pending, and timeout/unknown outcomes.
 * Never classifies a request timeout as a confirmed payment failure.
 */
export function normalizeTransactionOutcome(raw: unknown): TransactionOutcomeState {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'unknown';
  if (['timeout', 'timed_out', 'timed-out', 'deadline_exceeded', 'unknown_timeout'].includes(s)) {
    return 'unknown_timeout';
  }
  if (['pending', 'in_progress', 'in-progress', 'processing', 'awaiting'].includes(s)) {
    return 'pending';
  }
  if (['success', 'succeeded', 'passed', 'authorized', 'captured', 'ok'].includes(s)) {
    return 'success';
  }
  if (['failed', 'declined', 'rejected', 'error'].includes(s)) {
    return 'failed';
  }
  return 'unknown';
}

function inferServiceRole(
  row: Record<string, unknown>
): MonitoredServiceNode['serviceRole'] {
  const explicit = String(
    row.serviceRole ?? row.service_role ?? row.role ?? row.id ?? row.name ?? ''
  ).toLowerCase();

  if (
    explicit.includes('primary_payment') ||
    explicit.includes('primary-payment') ||
    explicit.includes('primary payment') ||
    explicit === 'gateway-primary'
  ) {
    return 'primary_payment_gateway';
  }
  if (
    explicit.includes('secondary_payment') ||
    explicit.includes('secondary-payment') ||
    explicit.includes('secondary payment') ||
    explicit.includes('backup payment') ||
    explicit === 'gateway-secondary'
  ) {
    return 'secondary_payment_gateway';
  }
  if (explicit.includes('auth') || explicit.includes('identity') || explicit.includes('login')) {
    return 'authentication';
  }
  if (explicit.includes('catalog') || explicit.includes('product')) {
    return 'product_catalog';
  }
  if (explicit.includes('cart') || explicit.includes('basket')) {
    return 'cart';
  }
  if (explicit.includes('checkout')) {
    return 'checkout';
  }
  if (explicit.includes('confirmation') || explicit.includes('order')) {
    return 'order_confirmation';
  }
  return 'other';
}

function normalizeSnapshot(raw: Record<string, unknown>, idx: number): ServiceStatusSnapshot {
  const isStale = asBooleanOrNull(raw.isStale ?? raw.is_stale);
  return {
    timestamp: String(raw.timestamp ?? raw.checked_at ?? raw.time ?? `T-${idx}`),
    state: normalizeOperationalState(raw.state ?? raw.status ?? raw.health, isStale),
    latencyMs: asNumberOrNull(raw.latencyMs ?? raw.latency_ms ?? raw.response_time_ms),
    errorRatePercent: asNumberOrNull(
      raw.errorRatePercent ?? raw.error_rate_percent ?? raw.error_rate
    ),
    note: asStringOrNull(raw.note ?? raw.summary),
  };
}

export function normalizeMonitoredServiceNode(
  row: Record<string, unknown>,
  idx = 0
): MonitoredServiceNode {
  const explicitStale = asBooleanOrNull(row.isStale ?? row.is_stale ?? row.stale);
  const lastCheckedAt = asStringOrNull(
    row.lastCheckedAt ?? row.last_checked_at ?? row.heartbeat_at ?? row.updated_at
  );

  const state = normalizeOperationalState(
    row.state ?? row.status ?? row.health,
    explicitStale
  );
  const isStale = state === 'stale' || explicitStale === true;

  const rawHistory = extractArray(
    row.statusHistory ?? row.status_history ?? row.recent_history ?? row.snapshots,
    ['history', 'snapshots']
  );
  const statusHistory = rawHistory.map((s, i) => normalizeSnapshot(s, i));

  const rawVerification = String(
    row.verificationStatus ?? row.verification_status ?? ''
  ).toLowerCase();
  const verificationStatus: MonitoredServiceNode['verificationStatus'] =
    rawVerification === 'verified'
      ? 'verified'
      : rawVerification === 'pending'
        ? 'pending'
        : rawVerification === 'failed'
          ? 'failed'
          : rawVerification === 'unverified'
            ? 'unverified'
            : null;

  const rawLastOutcome =
    row.lastTransactionOutcome ?? row.last_transaction_outcome ?? row.latest_outcome;

  return {
    id: String(row.id ?? row.service_id ?? row.serviceId ?? `service-${idx + 1}`),
    name: String(row.name ?? row.service_name ?? row.serviceName ?? 'Unnamed Service'),
    serviceRole: inferServiceRole(row),
    category: asStringOrNull(row.category ?? row.tier ?? row.group),
    state,
    isStale,
    staleReason: asStringOrNull(row.staleReason ?? row.stale_reason),
    availabilityPercent: asNumberOrNull(
      row.availabilityPercent ??
        row.availability_percent ??
        row.availability ??
        row.uptime_percent
    ),
    errorRatePercent: asNumberOrNull(
      row.errorRatePercent ?? row.error_rate_percent ?? row.error_rate
    ),
    recentErrorsCount: asNumberOrNull(
      row.recentErrorsCount ?? row.recent_errors_count ?? row.error_count ?? row.recent_failures
    ),
    latestErrorSummary: asStringOrNull(
      row.latestErrorSummary ??
        row.latest_error_summary ??
        row.last_error ??
        row.error_summary
    ),
    latencyMs: asNumberOrNull(
      row.latencyMs ?? row.latency_ms ?? row.avg_latency_ms ?? row.response_time_ms
    ),
    p95LatencyMs: asNumberOrNull(row.p95LatencyMs ?? row.p95_latency_ms),
    lastCheckedAt,
    lastSuccessfulTransactionAt: asStringOrNull(
      row.lastSuccessfulTransactionAt ??
        row.last_successful_transaction_at ??
        row.last_success_at
    ),
    lastTransactionOutcome: rawLastOutcome
      ? normalizeTransactionOutcome(rawLastOutcome)
      : null,
    failoverActivitySummary: asStringOrNull(
      row.failoverActivitySummary ??
        row.failover_activity ??
        row.recovery_activity ??
        row.failover_state
    ),
    verificationStatus,
    trafficSharePercent: asNumberOrNull(
      row.trafficSharePercent ?? row.traffic_share_percent ?? row.traffic_weight
    ),
    statusHistory,
  };
}

export function normalizeServiceHealthOverview(payload: unknown): ServiceHealthOverviewPayload {
  const rows = extractArray(payload, ['services', 'items', 'data', 'nodes']);
  const services = rows.map((r, i) => normalizeMonitoredServiceNode(r, i));

  let primaryGateway =
    services.find((s) => s.serviceRole === 'primary_payment_gateway') ?? null;
  let secondaryGateway =
    services.find((s) => s.serviceRole === 'secondary_payment_gateway') ?? null;

  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>;
    const rawComparison = (obj.gatewayComparison ?? obj.gateway_comparison) as
      | Record<string, unknown>
      | undefined;

    if (rawComparison && typeof rawComparison === 'object') {
      if (
        !primaryGateway &&
        rawComparison.primary &&
        typeof rawComparison.primary === 'object'
      ) {
        primaryGateway = normalizeMonitoredServiceNode(
          {
            ...(rawComparison.primary as Record<string, unknown>),
            serviceRole: 'primary_payment_gateway',
          },
          100
        );
      }
      if (
        !secondaryGateway &&
        rawComparison.secondary &&
        typeof rawComparison.secondary === 'object'
      ) {
        secondaryGateway = normalizeMonitoredServiceNode(
          {
            ...(rawComparison.secondary as Record<string, unknown>),
            serviceRole: 'secondary_payment_gateway',
          },
          101
        );
      }
    }
  }

  const evaluatedAt =
    typeof payload === 'object' && payload !== null
      ? asStringOrNull(
          (payload as Record<string, unknown>).evaluatedAt ??
            (payload as Record<string, unknown>).evaluated_at ??
            (payload as Record<string, unknown>).timestamp
        )
      : null;

  return {
    services,
    primaryGateway,
    secondaryGateway,
    evaluatedAt,
  };
}

export function normalizeServiceDetail(payload: unknown): ServiceDetailRecord {
  const obj =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const base = normalizeMonitoredServiceNode(obj, 0);

  const rawSnapshots = extractArray(
    obj.historicalSnapshots ??
      obj.historical_snapshots ??
      obj.statusHistory ??
      obj.status_history ??
      obj.history,
    ['snapshots', 'history']
  );
  const historicalSnapshots = rawSnapshots.map((s, i) => normalizeSnapshot(s, i));

  const relevantIncidents = normalizeIncidents(
    obj.relevantIncidents ?? obj.relevant_incidents ?? obj.incidents ?? []
  );

  const rawErrors = extractArray(
    obj.errorSummaries ?? obj.error_summaries ?? obj.recent_errors ?? obj.errors,
    ['errors', 'items']
  );
  const errorSummaries: ServiceErrorSummaryItem[] = rawErrors.map((err, i) => ({
    id: String(err.id ?? err.error_id ?? `err-${i + 1}`),
    errorCode: String(err.errorCode ?? err.error_code ?? err.code ?? 'UNSPECIFIED'),
    message: String(err.message ?? err.summary ?? err.detail ?? 'No error message provided'),
    outcomeClassification: normalizeTransactionOutcome(
      err.outcomeClassification ?? err.outcome_classification ?? err.outcome ?? err.status
    ),
    occurrencesCount: asNumberOrNull(err.occurrencesCount ?? err.occurrences_count ?? err.count) ?? 1,
    lastObservedAt: String(err.lastObservedAt ?? err.last_observed_at ?? err.timestamp ?? '—'),
  }));

  const rawExecs = extractArray(
    obj.recentExecutions ?? obj.recent_executions ?? obj.execution_references ?? obj.executions,
    ['executions', 'items']
  );
  const recentExecutions: ServiceExecutionReference[] = rawExecs.map((ex, i) => ({
    executionId: String(ex.executionId ?? ex.execution_id ?? ex.id ?? `exec-${i + 1}`),
    journeyId: String(ex.journeyId ?? ex.journey_id ?? '—'),
    journeyName: String(ex.journeyName ?? ex.journey_name ?? ex.journey ?? 'Synthetic Journey'),
    outcome: normalizeTransactionOutcome(ex.outcome ?? ex.status ?? ex.state),
    latencyMs: asNumberOrNull(ex.latencyMs ?? ex.latency_ms ?? ex.duration_ms),
    timestamp: String(ex.timestamp ?? ex.started_at ?? ex.startedAt ?? '—'),
  }));

  return {
    ...base,
    historicalSnapshots:
      historicalSnapshots.length > 0 ? historicalSnapshots : base.statusHistory,
    relevantIncidents,
    errorSummaries,
    recentExecutions,
  };
}

// ---------------------------------------------------------------------------
// TanStack Query Hooks
// ---------------------------------------------------------------------------

export function useServiceHealthOverviewQuery(timeRange: TimeRangeValue) {
  return useQuery<ServiceHealthOverviewPayload, ContinuumApiError>({
    queryKey: ['service-health-overview', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/services/health?window=${timeRange}`);
      return normalizeServiceHealthOverview(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useServiceDetailQuery(serviceId: string | null, timeRange: TimeRangeValue) {
  return useQuery<ServiceDetailRecord, ContinuumApiError>({
    queryKey: ['service-health-detail', serviceId, timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/services/${encodeURIComponent(serviceId!)}/health?window=${timeRange}`
      );
      return normalizeServiceDetail(raw);
    },
    enabled: Boolean(serviceId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}
