import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ContinuumApiError } from './client';
import type { TimeRangeValue } from '../styles/tokens';

export type ApprovalRequirementLevel =
  | 'dual_operator'
  | 'lead_operator'
  | 'automated_preapproved'
  | 'manual_quorum';

export type BlastRadiusTier = 'low' | 'medium' | 'high';

export type RecoveryExecutionLifecycle =
  | 'in_progress'
  | 'verified'
  | 'failed'
  | 'rolled_back'
  | 'pending_approval'
  | 'cancelled';

export interface PlaybookStepConfig {
  id: string;
  order: number;
  name: string;
  actionCode: string;
  targetScope: string;
  timeoutSeconds: number;
  rollbackActionCode?: string | null;
  description?: string | null;
}

export interface PlaybookPrecondition {
  id: string;
  criterion: string;
  evaluationMethod: 'telemetry_assertion' | 'incident_severity_gate' | 'service_heartbeat_check';
  isRequired: boolean;
}

export interface CountermeasurePlaybookItem {
  id: string;
  name: string;
  purpose: string;
  category: string;
  associatedPatternId?: string | null;
  associatedPatternName?: string | null;
  triggerCondition?: string | null;
  allowedActions: string[];
  approvalLevel: ApprovalRequirementLevel;
  blastRadius: BlastRadiusTier;
  enabled: boolean;
  lastExecutionId?: string | null;
  lastOutcome?: RecoveryExecutionLifecycle | null;
  lastExecutedAt?: string | null;
  steps: PlaybookStepConfig[];
  preconditions: PlaybookPrecondition[];
  verificationProcedure: string;
}

export interface AuditedRecoveryActionItem {
  stepId: string;
  order: number;
  actionCode: string;
  name: string;
  targetScope: string;
  status: 'succeeded' | 'failed' | 'in_progress' | 'rolled_back' | 'skipped';
  startedAt: string;
  durationMs: number | null;
  outputSummary?: string | null;
}

export interface RecoveryExecutionRecord {
  id: string;
  incidentId: string;
  incidentTitle?: string | null;
  playbookId: string;
  playbookName: string;
  status: RecoveryExecutionLifecycle;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  actionsPerformed: AuditedRecoveryActionItem[];
  verificationResults: {
    status: 'passed' | 'failed' | 'pending';
    probeJourneyId?: string | null;
    measuredSloMetric?: string | null;
    verificationNotes?: string | null;
  };
  failureOrEscalationDetails?: string | null;
  initiatedBy: string;
  idempotencyKey?: string | null;
  paymentSafetyReconciliation?: {
    uncertainPaymentEncountered: boolean;
    reconciliationGuidance: string;
    secondChargePrevented: boolean;
  } | null;
}

export interface ApprovalRequestItem {
  id: string;
  incidentId: string;
  incidentTitle?: string | null;
  failurePattern?: string | null;
  playbookId: string;
  playbookName: string;
  proposedActions: string[];
  reason: string;
  blastRadius: BlastRadiusTier;
  expectedImpact?: string | null;
  risksSummary?: string | null;
  preconditions: string[];
  verificationPlan: string;
  requestedBy: string;
  requestedAt: string;
  expiresAt?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
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

export function normalizeApprovalLevel(raw: unknown): ApprovalRequirementLevel {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('dual')) return 'dual_operator';
  if (s.includes('automated') || s.includes('preapproved')) return 'automated_preapproved';
  if (s.includes('quorum')) return 'manual_quorum';
  return 'lead_operator';
}

export function normalizeBlastRadius(raw: unknown): BlastRadiusTier {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('high')) return 'high';
  if (s.includes('low')) return 'low';
  return 'medium';
}

export function normalizeRecoveryLifecycle(raw: unknown): RecoveryExecutionLifecycle {
  const s = String(raw ?? '').toLowerCase();
  if (['verified', 'succeeded', 'completed', 'success'].includes(s)) return 'verified';
  if (['in_progress', 'running', 'executing'].includes(s)) return 'in_progress';
  if (['rolled_back', 'reverted'].includes(s)) return 'rolled_back';
  if (['pending_approval', 'pending'].includes(s)) return 'pending_approval';
  if (['cancelled', 'aborted'].includes(s)) return 'cancelled';
  return 'failed';
}

export function normalizePlaybookItem(
  raw: Record<string, unknown>,
  idx = 0
): CountermeasurePlaybookItem {
  const id = String(raw.id ?? raw.playbook_id ?? raw.playbookId ?? `pb-${idx + 1}`);
  const name = String(raw.name ?? raw.playbook_name ?? raw.title ?? `Playbook ${id}`);
  const purpose = String(
    raw.purpose ?? raw.description ?? raw.summary ?? 'Remediation workflow'
  );

  const rawSteps = extractArray(raw.steps ?? raw.configured_steps, ['steps']);
  const steps: PlaybookStepConfig[] = rawSteps.map((st, i) => ({
    id: String(st.id ?? `step-${i + 1}`),
    order: asNumberOrNull(st.order ?? st.step_order) ?? i + 1,
    name: String(st.name ?? st.title ?? `Step ${i + 1}`),
    actionCode: String(st.actionCode ?? st.action_code ?? st.action ?? 'DRAIN_TRAFFIC'),
    targetScope: String(st.targetScope ?? st.target_scope ?? st.target ?? '—'),
    timeoutSeconds: asNumberOrNull(st.timeoutSeconds ?? st.timeout_seconds) ?? 60,
    rollbackActionCode: asStringOrNull(st.rollbackActionCode ?? st.rollback_action_code),
    description: asStringOrNull(st.description),
  }));

  const rawPreconditions = extractArray(raw.preconditions, ['preconditions']);
  const preconditions: PlaybookPrecondition[] = rawPreconditions.map((p, i) => ({
    id: String(p.id ?? `pre-${i + 1}`),
    criterion: String(p.criterion ?? p.rule ?? p.description ?? 'Telemetry gate check'),
    evaluationMethod: 'telemetry_assertion',
    isRequired: asBooleanOrNull(p.isRequired ?? p.is_required) ?? true,
  }));

  const allowedActions = Array.isArray(raw.allowedActions ?? raw.allowed_actions)
    ? ((raw.allowedActions ?? raw.allowed_actions) as string[])
    : ['FAILOVER_GATEWAY_RAIL', 'CIRCUIT_BREAK_UPSTREAM', 'FLUSH_STALE_CART_CACHE'];

  return {
    id,
    name,
    purpose,
    category: String(raw.category ?? 'Payment Gateway Rail Resilience'),
    associatedPatternId: asStringOrNull(raw.associatedPatternId ?? raw.associated_pattern_id),
    associatedPatternName: asStringOrNull(
      raw.associatedPatternName ?? raw.associated_pattern_name
    ),
    triggerCondition: asStringOrNull(raw.triggerCondition ?? raw.trigger_condition),
    allowedActions,
    approvalLevel: normalizeApprovalLevel(raw.approvalLevel ?? raw.approval_level),
    blastRadius: normalizeBlastRadius(raw.blastRadius ?? raw.blast_radius),
    enabled: asBooleanOrNull(raw.enabled ?? raw.is_enabled) ?? true,
    lastExecutionId: asStringOrNull(raw.lastExecutionId ?? raw.last_execution_id),
    lastOutcome: raw.lastOutcome ? normalizeRecoveryLifecycle(raw.lastOutcome) : null,
    lastExecutedAt: asStringOrNull(raw.lastExecutedAt ?? raw.last_executed_at),
    steps,
    preconditions,
    verificationProcedure: String(
      raw.verificationProcedure ??
        raw.verification_procedure ??
        'Run synthetic e-commerce probe to verify payment success and latency SLO recovery.'
    ),
  };
}

export function normalizePlaybooksList(payload: unknown): CountermeasurePlaybookItem[] {
  const rows = extractArray(payload, ['playbooks', 'items', 'data', 'recipes']);
  return rows.map((r, i) => normalizePlaybookItem(r, i));
}

export function normalizeRecoveryExecutionItem(
  raw: Record<string, unknown>,
  idx = 0
): RecoveryExecutionRecord {
  const id = String(raw.id ?? raw.execution_id ?? raw.action_run_id ?? `rec-${idx + 1}`);
  const incidentId = String(raw.incidentId ?? raw.incident_id ?? raw.incident_ref ?? '—');
  const playbookId = String(raw.playbookId ?? raw.playbook_id ?? 'pb-default');
  const playbookName = String(
    raw.playbookName ?? raw.playbook_name ?? raw.playbook ?? 'Countermeasure Playbook'
  );

  const rawActions = extractArray(raw.actionsPerformed ?? raw.actions_performed ?? raw.actions, [
    'actions',
  ]);
  const actionsPerformed: AuditedRecoveryActionItem[] = rawActions.map((act, i) => ({
    stepId: String(act.stepId ?? act.step_id ?? `act-${i + 1}`),
    order: asNumberOrNull(act.order ?? act.step_order) ?? i + 1,
    actionCode: String(act.actionCode ?? act.action_code ?? act.action ?? 'DRAIN'),
    name: String(act.name ?? act.action_name ?? `Action ${i + 1}`),
    targetScope: String(act.targetScope ?? act.target_scope ?? act.target ?? '—'),
    status: (act.status as AuditedRecoveryActionItem['status']) || 'succeeded',
    startedAt: String(act.startedAt ?? act.started_at ?? '—'),
    durationMs: asNumberOrNull(act.durationMs ?? act.duration_ms),
    outputSummary: asStringOrNull(act.outputSummary ?? act.output_summary),
  }));

  const rawVerification = (raw.verificationResults ??
    raw.verification_results ??
    raw.verification) as Record<string, unknown> | undefined;

  const rawPaymentSafety = (raw.paymentSafetyReconciliation ??
    raw.payment_safety_reconciliation ??
    raw.payment_safety) as Record<string, unknown> | undefined;

  let paymentSafetyReconciliation: RecoveryExecutionRecord['paymentSafetyReconciliation'] = null;
  if (rawPaymentSafety && typeof rawPaymentSafety === 'object') {
    paymentSafetyReconciliation = {
      uncertainPaymentEncountered:
        asBooleanOrNull(rawPaymentSafety.uncertainPaymentEncountered ?? rawPaymentSafety.uncertain_payment_encountered) ?? false,
      reconciliationGuidance: String(
        rawPaymentSafety.reconciliationGuidance ??
          rawPaymentSafety.reconciliation_guidance ??
          'Await gateway settlement webhook; do not submit duplicate capture.'
      ),
      secondChargePrevented:
        asBooleanOrNull(rawPaymentSafety.secondChargePrevented ?? rawPaymentSafety.second_charge_prevented) ?? true,
    };
  }

  return {
    id,
    incidentId,
    incidentTitle: asStringOrNull(raw.incidentTitle ?? raw.incident_title),
    playbookId,
    playbookName,
    status: normalizeRecoveryLifecycle(raw.status ?? raw.state),
    startedAt: String(raw.startedAt ?? raw.started_at ?? raw.created_at ?? '—'),
    completedAt: asStringOrNull(raw.completedAt ?? raw.completed_at),
    durationMs: asNumberOrNull(raw.durationMs ?? raw.duration_ms),
    actionsPerformed,
    verificationResults: {
      status: (rawVerification?.status as 'passed' | 'failed' | 'pending') || 'passed',
      probeJourneyId: asStringOrNull(rawVerification?.probeJourneyId ?? rawVerification?.probe_journey_id),
      measuredSloMetric: asStringOrNull(rawVerification?.measuredSloMetric ?? rawVerification?.measured_slo_metric),
      verificationNotes: asStringOrNull(rawVerification?.verificationNotes ?? rawVerification?.verification_notes),
    },
    failureOrEscalationDetails: asStringOrNull(
      raw.failureOrEscalationDetails ?? raw.failure_details ?? raw.escalation_reason
    ),
    initiatedBy: String(raw.initiatedBy ?? raw.initiated_by ?? raw.operator ?? 'On-Call Operator'),
    idempotencyKey: asStringOrNull(raw.idempotencyKey ?? raw.idempotency_key),
    paymentSafetyReconciliation,
  };
}

export function normalizeRecoveryExecutionsList(payload: unknown): RecoveryExecutionRecord[] {
  const rows = extractArray(payload, ['executions', 'items', 'data', 'recoveries']);
  return rows.map((r, i) => normalizeRecoveryExecutionItem(r, i));
}

export function normalizeApprovalRequestItem(
  raw: Record<string, unknown>,
  idx = 0
): ApprovalRequestItem {
  const id = String(raw.id ?? raw.approval_id ?? raw.request_id ?? `appr-${idx + 1}`);

  const rawActions = Array.isArray(raw.proposedActions ?? raw.proposed_actions)
    ? ((raw.proposedActions ?? raw.proposed_actions) as string[])
    : ['GATEWAY_FAILOVER', 'PROBE_VERIFICATION'];

  const rawPreconditions = Array.isArray(raw.preconditions)
    ? (raw.preconditions as string[])
    : ['Secondary payment gateway health is CONFIRMED', 'No inflight capture timeouts in queue'];

  return {
    id,
    incidentId: String(raw.incidentId ?? raw.incident_id ?? '—'),
    incidentTitle: asStringOrNull(raw.incidentTitle ?? raw.incident_title),
    failurePattern: asStringOrNull(raw.failurePattern ?? raw.failure_pattern),
    playbookId: String(raw.playbookId ?? raw.playbook_id ?? 'pb-default'),
    playbookName: String(raw.playbookName ?? raw.playbook_name ?? 'Remediation Playbook'),
    proposedActions: rawActions,
    reason: String(
      raw.reason ?? raw.justification ?? 'Primary payment gateway degraded while secondary is healthy'
    ),
    blastRadius: normalizeBlastRadius(raw.blastRadius ?? raw.blast_radius),
    expectedImpact: asStringOrNull(raw.expectedImpact ?? raw.expected_impact),
    risksSummary: asStringOrNull(raw.risksSummary ?? raw.risks_summary ?? raw.risks),
    preconditions: rawPreconditions,
    verificationPlan: String(
      raw.verificationPlan ??
        raw.verification_plan ??
        'Probe checkout journey to verify payment authorization recovery'
    ),
    requestedBy: String(raw.requestedBy ?? raw.requested_by ?? 'Operator Lead'),
    requestedAt: String(raw.requestedAt ?? raw.requested_at ?? raw.created_at ?? '—'),
    expiresAt: asStringOrNull(raw.expiresAt ?? raw.expires_at),
    status: (raw.status as ApprovalRequestItem['status']) || 'pending',
  };
}

export function normalizeApprovalQueueList(payload: unknown): ApprovalRequestItem[] {
  const rows = extractArray(payload, ['approvals', 'items', 'data', 'queue', 'requests']);
  return rows.map((r, i) => normalizeApprovalRequestItem(r, i));
}

// ---------------------------------------------------------------------------
// TanStack Query & Mutation Hooks
// ---------------------------------------------------------------------------

export function usePlaybooksListQuery(timeRange: TimeRangeValue) {
  return useQuery<CountermeasurePlaybookItem[], ContinuumApiError>({
    queryKey: ['recovery-playbooks-list', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/recovery/playbooks?window=${timeRange}`);
      return normalizePlaybooksList(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function usePlaybookDetailQuery(playbookId: string | null, timeRange: TimeRangeValue) {
  return useQuery<CountermeasurePlaybookItem, ContinuumApiError>({
    queryKey: ['recovery-playbook-detail', playbookId, timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/recovery/playbooks/${encodeURIComponent(playbookId!)}?window=${timeRange}`
      );
      const obj =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      return normalizePlaybookItem(obj, 0);
    },
    enabled: Boolean(playbookId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useRecoveryExecutionsQuery(timeRange: TimeRangeValue) {
  return useQuery<RecoveryExecutionRecord[], ContinuumApiError>({
    queryKey: ['recovery-executions-ledger', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/recovery/executions?window=${timeRange}`);
      return normalizeRecoveryExecutionsList(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useRecoveryExecutionDetailQuery(executionId: string | null) {
  return useQuery<RecoveryExecutionRecord, ContinuumApiError>({
    queryKey: ['recovery-execution-detail', executionId],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(
        `/api/v1/recovery/executions/${encodeURIComponent(executionId!)}`
      );
      const obj =
        typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      return normalizeRecoveryExecutionItem(obj, 0);
    },
    enabled: Boolean(executionId),
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useApprovalQueueQuery(timeRange: TimeRangeValue) {
  return useQuery<ApprovalRequestItem[], ContinuumApiError>({
    queryKey: ['recovery-approvals-queue', timeRange],
    queryFn: async () => {
      const raw = await apiRequest<unknown>(`/api/v1/recovery/approvals?window=${timeRange}`);
      return normalizeApprovalQueueList(raw);
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export interface ExecutePlaybookRequest {
  playbookId: string;
  incidentId: string;
  idempotencyKey: string;
  reason: string;
}

export function useExecutePlaybookMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { executionId: string; status: string; message?: string },
    ContinuumApiError,
    ExecutePlaybookRequest
  >({
    mutationFn: async ({ playbookId, incidentId, idempotencyKey, reason }) => {
      const endpoint = `/api/v1/recovery/playbooks/${encodeURIComponent(playbookId)}/execute`;
      const raw = await apiRequest<Record<string, unknown>>(endpoint, {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          playbook_id: playbookId,
          incident_id: incidentId,
          idempotency_key: idempotencyKey,
          reason,
        }),
      });

      return {
        executionId: String(raw.executionId ?? raw.execution_id ?? raw.id ?? `rec-${Date.now()}`),
        status: String(raw.status ?? raw.state ?? 'in_progress'),
        message: asStringOrNull(raw.message ?? raw.detail) ?? undefined,
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recovery-executions-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['recovery-playbooks-list'] });
      void queryClient.invalidateQueries({ queryKey: ['recovery-approvals-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['cc-recovery-executions'] });
    },
  });
}

export interface ReviewApprovalRequest {
  approvalId: string;
  decision: 'approve' | 'reject';
  operatorNotes: string;
  idempotencyKey: string;
}

export function useReviewApprovalMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    { approvalId: string; decision: string; message?: string },
    ContinuumApiError,
    ReviewApprovalRequest
  >({
    mutationFn: async ({ approvalId, decision, operatorNotes, idempotencyKey }) => {
      const actionEndpoint = decision === 'approve' ? 'approve' : 'reject';
      const endpoint = `/api/v1/recovery/approvals/${encodeURIComponent(approvalId)}/${actionEndpoint}`;
      const raw = await apiRequest<Record<string, unknown>>(endpoint, {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          approval_id: approvalId,
          decision,
          notes: operatorNotes,
          idempotency_key: idempotencyKey,
        }),
      });

      return {
        approvalId,
        decision,
        message: asStringOrNull(raw.message ?? raw.detail) ?? undefined,
      };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recovery-approvals-queue'] });
      void queryClient.invalidateQueries({ queryKey: ['recovery-executions-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['cc-recovery-approvals'] });
    },
  });
}
