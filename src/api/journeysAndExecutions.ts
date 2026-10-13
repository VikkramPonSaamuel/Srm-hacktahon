import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ContinuumApiError } from './client';
import type { IncidentActivityRecord, JourneyExecutionStatus } from './contracts';
import { normalizeIncidents } from './commandCenter';
import type { TimeRangeValue } from '../styles/tokens';

export type StepStatus = 'healthy' | 'degraded' | 'failing' | 'skipped' | 'unknown';
export type ExecutionOverallStatus =
  | 'passed'
  | 'failed'
  | 'running'
  | 'degraded'
  | 'timeout'
  | 'unknown';

export interface JourneyStepConfig {
  id: string;
  order: number;
  name: string;
  actionType?: string | null;
  targetEndpoint?: string | null;
  status: StepStatus;
  averageLatencyMs: number | null;
  lastErrorMessage?: string | null;
  lastErrorCode?: string | null;
  successRate?: number | null;
}

export interface JourneyHistoricalPoint {
  timestamp: string;
  successRate?: number | null;
  latencyMs?: number | null;
}

export interface BusinessJourneyItem {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean | null;
  overallHealth: JourneyExecutionStatus;
  latestExecutionId: string | null;
  latestExecutionStatus: ExecutionOverallStatus | null;
  successRate: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  lastRunAt: string | null;
  scheduleCadence: string | null;
  environment: string | null;
  steps: JourneyStepConfig[];
}

export interface BusinessJourneyDetail extends BusinessJourneyItem {
  recentExecutions: SyntheticExecutionItem[];
  associatedIncidents: IncidentActivityRecord[];
  historicalPerformance: JourneyHistoricalPoint[];
}

export interface ExecutionStepResult {
  stepId: string;
  order: number;
  name: string;
  status: 'passed' | 'failed' | 'running' | 'skipped' | 'unknown';
  startedAt?: string | null;
  durationMs: number | null;
  httpStatusCode?: number | null;
  assertionSummary?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  retryCount?: number | null;
}

export interface SafePaymentHandlingDetails {
  paymentMode?: string | null;
  sandboxGateway?: string | null;
  idempotencyKey?: string | null;
  syntheticCardMasked?: string | null;
  authorizationVoided?: boolean | null;
  realChargePrevented?: boolean | null;
  gatewayReferenceId?: string | null;
}

export interface ExecutionRetryInfo {
  attemptNumber: number;
  maxAttempts: number | null;
  backoffStrategy?: string | null;
  backoffMs?: number | null;
  retriedStepsCount?: number | null;
}

export interface SyntheticExecutionItem {
  id: string;
  journeyId: string;
  journeyName: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: ExecutionOverallStatus;
  failedStepName: string | null;
  failedStepOrder: number | null;
  errorSummary: string | null;
  errorCode: string | null;
  incidentId: string | null;
  triggerSource: string | null;
  region: string | null;
  steps: ExecutionStepResult[];
  retryInfo: ExecutionRetryInfo | null;
  safePaymentDetails: SafePaymentHandlingDetails | null;
}

export interface TriggerExecutionRequest {
  journeyId: string;
  idempotencyKey: string;
  reason?: string;
}

export interface TriggerExecutionResponse {
  executionId: string;
  journeyId: string;
  status: string;
  message?: string;
  startedAt?: string;
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

function normalizeHealthStatus(raw: unknown): JourneyExecutionStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['healthy', 'passed', 'ok', 'success', 'up'].includes(s)) return 'healthy';
  if (['degraded', 'warning', 'slow', 'warn'].includes(s)) return 'degraded';
  if (['failing', 'failed', 'critical', 'error', 'down', 'unhealthy'].includes(s)) {
    return 'failing';
  }
  return 'unknown';
}

function normalizeStepStatus(raw: unknown): StepStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['healthy', 'passed', 'ok', 'success'].includes(s)) return 'healthy';
  if (['degraded', 'warning', 'slow'].includes(s)) return 'degraded';
  if (['failing', 'failed', 'critical', 'error'].includes(s)) return 'failing';
  if (['skipped', 'bypassed'].includes(s)) return 'skipped';
  return 'unknown';
}

export function normalizeExecutionStatus(raw: unknown): ExecutionOverallStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['passed', 'healthy', 'success', 'succeeded', 'ok', 'completed'].includes(s)) {
    return 'passed';
  }
  if (['failed', 'failing', 'error', 'critical'].includes(s)) return 'failed';
  if (['running', 'in_progress', 'in-progress', 'pending', 'executing'].includes(s)) {
    return 'running';
  }
  if (['degraded', 'warning', 'partial'].includes(s)) return 'degraded';
  if (['timeout', 'timed_out', 'timed-out'].includes(s)) return 'timeout';
  return 'unknown';
}

function normalizeJourneyStep(
  raw: Record<string, unknown>,
  idx: number
): JourneyStepConfig {
  return {
    id: String(raw.id ?? raw.step_id ?? raw.stepId ?? `step-${idx + 1}`),
    order: asNumberOrNull(raw.order ?? raw.step_order ?? raw.index ?? raw.sequence) ?? idx + 1,
    name: String(raw.name ?? raw.step_name ?? raw.title ?? `Step ${idx + 1}`),
    actionType: asStringOrNull(raw.actionType ?? raw.action_type ?? raw.method ?? raw.type),
    targetEndpoint: asStringOrNull(
      raw.targetEndpoint ?? raw.target_endpoint ?? raw.endpoint ?? raw.url
    ),
    status: normalizeStepStatus(raw.status ?? raw.health ?? raw.state),
    averageLatencyMs: asNumberOrNull(
      raw.averageLatencyMs ?? raw.avg_latency_ms ?? raw.latency_ms ?? raw.duration_ms
    ),
    lastErrorMessage: asStringOrNull(
      raw.lastErrorMessage ?? raw.last_error_message ?? raw.error_message ?? raw.error
    ),
    lastErrorCode: asStringOrNull(raw.lastErrorCode ?? raw.last_error_code ?? raw.error_code),
    successRate: asNumberOrNull(raw.successRate ?? raw.success_rate ?? raw.pass_rate),
  };
}

export function normalizeBusinessJourneyItem(
  row: Record<string, unknown>,
  idx = 0
): BusinessJourneyItem {
  const rawSteps = extractArray(row.steps ?? row.configured_steps ?? row.workflow, ['steps']);
  const steps = rawSteps
    .map((s, i) => normalizeJourneyStep(s, i))
    .sort((a, b) => a.order - b.order);

  const rawLatestExecStatus =
    row.latestExecutionStatus ?? row.latest_execution_status ?? row.latest_status;

  return {
    id: String(row.id ?? row.journey_id ?? row.journeyId ?? `journey-${idx + 1}`),
    name: String(row.name ?? row.journey_name ?? row.title ?? 'Unnamed Journey'),
    description: asStringOrNull(row.description ?? row.summary ?? row.purpose),
    enabled: asBooleanOrNull(
      row.enabled ?? row.is_enabled ?? row.isEnabled ?? row.active
    ),
    overallHealth: normalizeHealthStatus(
      row.overallHealth ?? row.overall_health ?? row.health ?? row.status ?? row.latest_status
    ),
    latestExecutionId: asStringOrNull(
      row.latestExecutionId ?? row.latest_execution_id ?? row.last_execution_id
    ),
    latestExecutionStatus: rawLatestExecStatus
      ? normalizeExecutionStatus(rawLatestExecStatus)
      : null,
    successRate: asNumberOrNull(
      row.successRate ?? row.success_rate ?? row.pass_rate ?? row.passRate
    ),
    averageLatencyMs: asNumberOrNull(
      row.averageLatencyMs ?? row.avg_latency_ms ?? row.latency_ms ?? row.latencyMs
    ),
    p95LatencyMs: asNumberOrNull(row.p95LatencyMs ?? row.p95_latency_ms),
    lastRunAt: asStringOrNull(
      row.lastRunAt ?? row.last_run_at ?? row.last_execution_at ?? row.updated_at
    ),
    scheduleCadence: asStringOrNull(
      row.scheduleCadence ?? row.schedule_cadence ?? row.cadence ?? row.interval
    ),
    environment: asStringOrNull(row.environment ?? row.env ?? row.region),
    steps,
  };
}

export function normalizeBusinessJourneysList(payload: unknown): BusinessJourneyItem[] {
  const rows = extractArray(payload, ['journeys', 'items', 'data', 'results']);
  return rows.map((r, i) => normalizeBusinessJourneyItem(r, i));
}

function normalizeExecutionStepResult(
  raw: Record<string, unknown>,
  idx: number
): ExecutionStepResult {
  const s = String(raw.status ?? raw.outcome ?? raw.state ?? '').toLowerCase();
  const status: ExecutionStepResult['status'] = ['passed', 'ok', 'success', 'healthy'].includes(s)
    ? 'passed'
    : ['failed', 'error', 'failing'].includes(s)
      ? 'failed'
      : ['running', 'in_progress'].includes(s)
        ? 'running'
        : ['skipped'].includes(s)
          ? 'skipped'
          : 'unknown';

  return {
    stepId: String(raw.stepId ?? raw.step_id ?? raw.id ?? `step-${idx + 1}`),
    order: asNumberOrNull(raw.order ?? raw.step_order ?? raw.sequence ?? raw.index) ?? idx + 1,
    name: String(raw.name ?? raw.step_name ?? raw.title ?? `Step ${idx + 1}`),
    status,
    startedAt: asStringOrNull(raw.startedAt ?? raw.started_at),
    durationMs: asNumberOrNull(
      raw.durationMs ?? raw.duration_ms ?? raw.latency_ms ?? raw.elapsed_ms
    ),
    httpStatusCode: asNumberOrNull(raw.httpStatusCode ?? raw.http_status_code ?? raw.status_code),
    assertionSummary: asStringOrNull(
      raw.assertionSummary ?? raw.assertion_summary ?? raw.assertion
    ),
    errorMessage: asStringOrNull(
      raw.errorMessage ?? raw.error_message ?? raw.error ?? raw.failure_reason
    ),
    errorCode: asStringOrNull(raw.errorCode ?? raw.error_code),
    retryCount: asNumberOrNull(raw.retryCount ?? raw.retry_count ?? raw.retries),
  };
}

export function normalizeSyntheticExecutionItem(
  row: Record<string, unknown>,
  idx = 0
): SyntheticExecutionItem {
  const rawSteps = extractArray(
    row.steps ?? row.step_results ?? row.stepResults ?? row.trace_steps,
    ['steps', 'results']
  );
  const steps = rawSteps
    .map((s, i) => normalizeExecutionStepResult(s, i))
    .sort((a, b) => a.order - b.order);

  const firstFailedStep = steps.find((s) => s.status === 'failed');

  // Extract retry metadata if present
  let retryInfo: ExecutionRetryInfo | null = null;
  const rawRetry = (row.retryInfo ?? row.retry_info ?? row.retry) as
    | Record<string, unknown>
    | undefined;
  if (rawRetry && typeof rawRetry === 'object') {
    retryInfo = {
      attemptNumber:
        asNumberOrNull(rawRetry.attemptNumber ?? rawRetry.attempt_number ?? rawRetry.attempt) ?? 1,
      maxAttempts: asNumberOrNull(
        rawRetry.maxAttempts ?? rawRetry.max_attempts ?? rawRetry.max_retries
      ),
      backoffStrategy: asStringOrNull(rawRetry.backoffStrategy ?? rawRetry.backoff_strategy),
      backoffMs: asNumberOrNull(rawRetry.backoffMs ?? rawRetry.backoff_ms),
      retriedStepsCount: asNumberOrNull(
        rawRetry.retriedStepsCount ?? rawRetry.retried_steps_count
      ),
    };
  } else if (row.attempt_number !== undefined || row.retry_count !== undefined) {
    retryInfo = {
      attemptNumber: asNumberOrNull(row.attempt_number ?? row.retry_count) ?? 1,
      maxAttempts: asNumberOrNull(row.max_attempts ?? row.max_retries),
      backoffStrategy: asStringOrNull(row.backoff_strategy),
      backoffMs: asNumberOrNull(row.backoff_ms),
      retriedStepsCount: null,
    };
  }

  // Extract safe payment handling metadata if returned by backend
  let safePaymentDetails: SafePaymentHandlingDetails | null = null;
  const rawPayment = (row.safePaymentDetails ??
    row.safe_payment_details ??
    row.payment_safety ??
    row.payment_handling) as Record<string, unknown> | undefined;
  if (rawPayment && typeof rawPayment === 'object') {
    safePaymentDetails = {
      paymentMode: asStringOrNull(rawPayment.paymentMode ?? rawPayment.payment_mode ?? rawPayment.mode),
      sandboxGateway: asStringOrNull(
        rawPayment.sandboxGateway ?? rawPayment.sandbox_gateway ?? rawPayment.gateway
      ),
      idempotencyKey: asStringOrNull(
        rawPayment.idempotencyKey ?? rawPayment.idempotency_key
      ),
      syntheticCardMasked: asStringOrNull(
        rawPayment.syntheticCardMasked ?? rawPayment.synthetic_card_masked
      ),
      authorizationVoided: asBooleanOrNull(
        rawPayment.authorizationVoided ?? rawPayment.authorization_voided
      ),
      realChargePrevented: asBooleanOrNull(
        rawPayment.realChargePrevented ?? rawPayment.real_charge_prevented
      ),
      gatewayReferenceId: asStringOrNull(
        rawPayment.gatewayReferenceId ?? rawPayment.gateway_reference_id
      ),
    };
  }

  return {
    id: String(row.id ?? row.execution_id ?? row.executionId ?? `exec-${idx + 1}`),
    journeyId: String(row.journeyId ?? row.journey_id ?? row.journey ?? '—'),
    journeyName: String(
      row.journeyName ?? row.journey_name ?? row.journey_title ?? row.journeyId ?? row.journey_id ?? '—'
    ),
    startedAt: String(
      row.startedAt ?? row.started_at ?? row.start_time ?? row.created_at ?? '—'
    ),
    completedAt: asStringOrNull(
      row.completedAt ?? row.completed_at ?? row.finished_at ?? row.end_time
    ),
    durationMs: asNumberOrNull(
      row.durationMs ?? row.duration_ms ?? row.latency_ms ?? row.elapsed_ms
    ),
    status: normalizeExecutionStatus(row.status ?? row.overall_status ?? row.outcome ?? row.state),
    failedStepName:
      asStringOrNull(row.failedStepName ?? row.failed_step_name ?? row.failed_step) ??
      firstFailedStep?.name ??
      null,
    failedStepOrder:
      asNumberOrNull(row.failedStepOrder ?? row.failed_step_order) ??
      firstFailedStep?.order ??
      null,
    errorSummary:
      asStringOrNull(
        row.errorSummary ?? row.error_summary ?? row.error_message ?? row.failure_reason
      ) ??
      firstFailedStep?.errorMessage ??
      null,
    errorCode:
      asStringOrNull(row.errorCode ?? row.error_code) ?? firstFailedStep?.errorCode ?? null,
    incidentId: asStringOrNull(
      row.incidentId ?? row.incident_id ?? row.associated_incident_id
    ),
    triggerSource: asStringOrNull(
      row.triggerSource ?? row.trigger_source ?? row.initiated_by ?? row.trigger
    ),
    region: asStringOrNull(row.region ?? row.probe_region ?? row.environment),
    steps,
    retryInfo,
    safePaymentDetails,
  };
}

export function normalizeSyntheticExecutionsList(payload: unknown): SyntheticExecutionItem[] {
  const rows = extractArray(payload, ['executions', 'items', 'data', 'results', 'runs']);
  return rows.map((r, i) => normalizeSyntheticExecutionItem(r, i));
}

export function normalizeBusinessJourneyDetail(payload: unknown): BusinessJourneyDetail {
  const obj =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : {};
  const base = normalizeBusinessJourneyItem(obj, 0);

  const recentExecutions = normalizeSyntheticExecutionsList(
    obj.recentExecutions ?? obj.recent_executions ?? obj.executions ?? []
  );
  const associatedIncidents = normalizeIncidents(
    obj.associatedIncidents ?? obj.associated_incidents ?? obj.incidents ?? []
  );

  const rawHistory = extractArray(
    obj.historicalPerformance ?? obj.historical_performance ?? obj.history ?? obj.metrics_history,
    ['history', 'points', 'series']
  );
  const historicalPerformance: JourneyHistoricalPoint[] = rawHistory.map((pt, i) => ({
    timestamp: String(pt.timestamp ?? pt.time ?? pt.bucket ?? `T-${i}`),
    successRate: asNumberOrNull(pt.successRate ?? pt.success_rate ?? pt.pass_rate),
    latencyMs: asNumberOrNull(pt.latencyMs ?? pt.latency_ms ?? pt.avg_latency_ms),
  }));

  return {
    ...base,
    recentExecutions,
    associatedIncidents,
    historicalPerformance,
  };
}

// ---------------------------------------------------------------------------
// TanStack Query & Mutation Hooks
// ---------------------------------------------------------------------------

export function useJourneysListQuery(timeRange: TimeRangeValue) {
  return useQuery<BusinessJourneyItem[], ContinuumApiError>({
    queryKey: ['journeys-list', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/journeys?window=${timeRange}`);
      return normalizeBusinessJourneysList(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useJourneyDetailQuery(journeyId: string | null, timeRange: TimeRangeValue) {
  return useQuery<BusinessJourneyDetail, ContinuumApiError>({
    queryKey: ['journey-detail', journeyId, timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/journeys/${encodeURIComponent(journeyId!)}?window=${timeRange}`
      );
      return normalizeBusinessJourneyDetail(raw);
    },
    enabled: Boolean(journeyId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useExecutionsListQuery(timeRange: TimeRangeValue, journeyIdFilter?: string) {
  const params = new URLSearchParams({ window: timeRange });
  if (journeyIdFilter && journeyIdFilter !== 'all') {
    params.set('journey_id', journeyIdFilter);
  }

  return useQuery<SyntheticExecutionItem[], ContinuumApiError>({
    queryKey: ['executions-list', timeRange, journeyIdFilter ?? 'all'],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/executions?${params.toString()}`);
      return normalizeSyntheticExecutionsList(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useExecutionDetailQuery(executionId: string | null) {
  return useQuery<SyntheticExecutionItem, ContinuumApiError>({
    queryKey: ['execution-detail', executionId],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/executions/${encodeURIComponent(executionId!)}`
      );
      const obj =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      return normalizeSyntheticExecutionItem(obj, 0);
    },
    enabled: Boolean(executionId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useTriggerJourneyExecutionMutation() {
  const queryClient = useQueryClient();

  return useMutation<TriggerExecutionResponse, ContinuumApiError, TriggerExecutionRequest>({
    mutationFn: async ({ journeyId, idempotencyKey, reason }) => {
      const endpoint = `/api/v1/journeys/${encodeURIComponent(journeyId)}/execute`;
      const raw = await apiRequest<Record<string, unknown>>(endpoint, {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          journey_id: journeyId,
          idempotency_key: idempotencyKey,
          reason: reason?.trim() || 'Operator manual synthetic run',
        }),
      });

      const executionId = asStringOrNull(
        raw.executionId ?? raw.execution_id ?? raw.id ?? raw.run_id
      );
      if (!executionId) {
        throw new ContinuumApiError({
          message:
            'Backend responded without a confirmed execution_id. Execution confirmation cannot be verified.',
          status: 500,
          endpoint,
          isUnavailable: false,
        });
      }

      return {
        executionId,
        journeyId: String(raw.journeyId ?? raw.journey_id ?? journeyId),
        status: String(raw.status ?? raw.state ?? 'running'),
        message: asStringOrNull(raw.message ?? raw.detail) ?? undefined,
        startedAt: asStringOrNull(raw.startedAt ?? raw.started_at) ?? undefined,
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['journeys-list'] });
      void queryClient.invalidateQueries({ queryKey: ['journey-detail'] });
      void queryClient.invalidateQueries({ queryKey: ['executions-list'] });
      void queryClient.invalidateQueries({ queryKey: ['cc-journeys'] });
    },
  });
}
