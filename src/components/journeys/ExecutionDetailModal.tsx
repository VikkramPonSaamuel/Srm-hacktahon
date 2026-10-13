import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type {
  ExecutionOverallStatus,
  SyntheticExecutionItem,
} from '../../api/journeysAndExecutions';
import type { SemanticStatus } from '../../styles/tokens';
import {
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  LoadingState,
  MonoCode,
  UnavailableState,
} from '../ui';

export function executionStatusToVariant(status: ExecutionOverallStatus): SemanticStatus {
  switch (status) {
    case 'passed':
      return 'healthy';
    case 'degraded':
    case 'running':
      return 'warning';
    case 'failed':
    case 'timeout':
      return 'critical';
    default:
      return 'neutral';
  }
}

export interface ExecutionDetailModalProps {
  open: boolean;
  onClose: () => void;
  execution: SyntheticExecutionItem | null;
  isLoading?: boolean;
  isUnavailable?: boolean;
  error?: { message: string; status?: number | null } | null;
  endpoint?: string;
  onRetry?: () => void;
}

export const ExecutionDetailModal: React.FC<ExecutionDetailModalProps> = ({
  open,
  onClose,
  execution,
  isLoading = false,
  isUnavailable = false,
  error = null,
  endpoint,
  onRetry,
}) => {
  const maxStepDuration = React.useMemo(() => {
    if (!execution || execution.steps.length === 0) return 1;
    const durations = execution.steps
      .map((s) => s.durationMs ?? 0)
      .filter((d) => d > 0);
    return durations.length > 0 ? Math.max(...durations) : 1;
  }, [execution]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={execution ? `Execution Trace — ${execution.id}` : 'Execution Trace Inspector'}
      description="Step-by-step synthetic transaction timing, retry telemetry, and safe payment handling verification."
      size="xl"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close Inspector
        </Button>
      }
    >
      {isLoading ? (
        <LoadingState
          title="Fetching execution trace"
          description={`Querying ${endpoint ?? 'execution detail endpoint'}...`}
          rows={4}
        />
      ) : isUnavailable ? (
        <UnavailableState
          title="Execution Detail Endpoint Unavailable"
          description="The FastAPI backend did not respond with step-level trace data for this execution."
          endpoint={endpoint}
          onRetry={onRetry}
        />
      ) : error ? (
        <ErrorState
          title="Failed to load execution details"
          message={error.message}
          statusCode={error.status}
          endpoint={endpoint}
          onRetry={onRetry}
        />
      ) : !execution ? (
        <div className="py-8 text-center text-xs text-ink-secondary">
          Select an execution record to inspect its step-by-step trace.
        </div>
      ) : (
        <div className="space-y-5">
          {/* 1. Execution Summary Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-surface-cream border border-border-warm text-xs">
            <div>
              <div className="text-[11px] text-ink-secondary">Execution ID</div>
              <div className="mt-1">
                <MonoCode>{execution.id}</MonoCode>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-secondary">Overall Status</div>
              <div className="mt-1">
                <Badge variant={executionStatusToVariant(execution.status)} dot>
                  {execution.status.toUpperCase()}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-secondary">Start Time &amp; Duration</div>
              <div className="font-mono text-ink-primary mt-1">
                {execution.startedAt}
                {typeof execution.durationMs === 'number' && (
                  <span className="text-ink-secondary ml-1.5">
                    ({Math.round(execution.durationMs)} ms)
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-ink-secondary">Associated Incident</div>
              <div className="mt-1">
                {execution.incidentId ? (
                  <Link
                    to="/intelligence/incidents"
                    onClick={onClose}
                    className="inline-flex items-center gap-1"
                  >
                    <Badge variant="critical" mono>
                      {execution.incidentId}
                    </Badge>
                  </Link>
                ) : (
                  <span className="text-ink-secondary font-mono">None</span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Failed Step & Error Summary Callout (if applicable) */}
          {(execution.failedStepName || execution.errorSummary) && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-status-critical/10 border border-status-critical/30 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-status-critical">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Failed Step:{' '}
                    {execution.failedStepOrder !== null
                      ? `#${execution.failedStepOrder} `
                      : ''}
                    {execution.failedStepName ?? 'Unspecified Step'}
                  </span>
                </div>
                {execution.errorCode && (
                  <Badge variant="critical" mono>
                    {execution.errorCode}
                  </Badge>
                )}
              </div>
              {execution.errorSummary && (
                <p className="text-xs text-ink-primary font-mono pl-6">
                  {execution.errorSummary}
                </p>
              )}
            </div>
          )}

          {/* 3. Step-by-Step Results & Timing Waterfall */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Step-by-Step Execution Results &amp; Timing
              </h3>
              <span className="text-[11px] font-mono text-ink-secondary">
                {execution.steps.length} step(s) reported
              </span>
            </div>

            {execution.steps.length === 0 ? (
              <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                No granular step-by-step results were returned by the backend for this execution.
              </div>
            ) : (
              <div className="border border-border-warm rounded-lg overflow-hidden divide-y divide-border-warm bg-surface-ivory">
                {execution.steps.map((step) => {
                  const widthPct =
                    typeof step.durationMs === 'number' && step.durationMs > 0
                      ? Math.max(6, Math.min(100, (step.durationMs / maxStepDuration) * 100))
                      : 0;

                  return (
                    <div key={step.stepId} className="p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-ink-secondary w-6">
                            #{step.order}
                          </span>
                          <span className="font-semibold text-ink-primary">{step.name}</span>
                          <Badge
                            variant={
                              step.status === 'passed'
                                ? 'healthy'
                                : step.status === 'failed'
                                  ? 'critical'
                                  : step.status === 'running'
                                    ? 'warning'
                                    : 'neutral'
                            }
                            dot
                          >
                            {step.status.toUpperCase()}
                          </Badge>
                          {typeof step.httpStatusCode === 'number' && (
                            <MonoCode>HTTP {step.httpStatusCode}</MonoCode>
                          )}
                          {typeof step.retryCount === 'number' && step.retryCount > 0 && (
                            <Badge variant="warning" mono>
                              Retries: {step.retryCount}
                            </Badge>
                          )}
                        </div>

                        <div className="font-mono text-ink-secondary">
                          {typeof step.durationMs === 'number'
                            ? `${Math.round(step.durationMs)} ms`
                            : '—'}
                        </div>
                      </div>

                      {/* Relative Timing Bar */}
                      {widthPct > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-surface-secondary overflow-hidden">
                          <div
                            className={[
                              'h-full rounded-full',
                              step.status === 'failed'
                                ? 'bg-status-critical'
                                : 'bg-burgundy',
                            ].join(' ')}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      )}

                      {step.assertionSummary && (
                        <div className="text-[11px] text-ink-secondary">
                          Assertion: {step.assertionSummary}
                        </div>
                      )}

                      {step.errorMessage && (
                        <div className="p-2 rounded bg-status-critical/10 border border-status-critical/25 text-[11px] font-mono text-status-critical">
                          {step.errorCode ? `[${step.errorCode}] ` : ''}
                          {step.errorMessage}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Retry Information & Safe Payment Handling Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Retry Telemetry */}
            <Card variant="cream" padding="sm">
              <div className="flex items-center gap-2 mb-2.5">
                <RotateCcw className="w-3.5 h-3.5 text-burgundy" aria-hidden="true" />
                <h4 className="font-heading text-xs font-semibold text-ink-primary">
                  Retry &amp; Attempt Telemetry
                </h4>
              </div>

              {execution.retryInfo ? (
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink-secondary">Attempt Number:</dt>
                    <dd className="font-mono font-medium text-ink-primary">
                      {execution.retryInfo.attemptNumber}
                      {execution.retryInfo.maxAttempts !== null
                        ? ` / ${execution.retryInfo.maxAttempts}`
                        : ''}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-secondary">Backoff Policy:</dt>
                    <dd className="font-mono text-ink-primary">
                      {execution.retryInfo.backoffStrategy ?? 'Standard'}
                      {execution.retryInfo.backoffMs !== null
                        ? ` (${execution.retryInfo.backoffMs} ms)`
                        : ''}
                    </dd>
                  </div>
                  {execution.retryInfo.retriedStepsCount !== null && (
                    <div className="flex justify-between">
                      <dt className="text-ink-secondary">Retried Steps:</dt>
                      <dd className="font-mono text-ink-primary">
                        {execution.retryInfo.retriedStepsCount}
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-xs text-ink-secondary leading-relaxed">
                  No retry metadata was included in the backend response for this execution.
                </p>
              )}
            </Card>

            {/* Safe Payment Handling Details */}
            <Card variant="cream" padding="sm">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-3.5 h-3.5 text-burgundy" aria-hidden="true" />
                  <h4 className="font-heading text-xs font-semibold text-ink-primary">
                    Safe Payment Handling Details
                  </h4>
                </div>
                {execution.safePaymentDetails?.realChargePrevented && (
                  <Badge variant="healthy" dot>
                    Zero-Charge Verified
                  </Badge>
                )}
              </div>

              {execution.safePaymentDetails ? (
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink-secondary">Payment Mode:</dt>
                    <dd className="font-mono text-ink-primary">
                      {execution.safePaymentDetails.paymentMode ?? 'Sandbox / Synthetic'}
                    </dd>
                  </div>
                  {execution.safePaymentDetails.sandboxGateway && (
                    <div className="flex justify-between">
                      <dt className="text-ink-secondary">Gateway Target:</dt>
                      <dd className="font-mono text-ink-primary">
                        {execution.safePaymentDetails.sandboxGateway}
                      </dd>
                    </div>
                  )}
                  {execution.safePaymentDetails.idempotencyKey && (
                    <div className="flex justify-between">
                      <dt className="text-ink-secondary">Idempotency Key:</dt>
                      <dd>
                        <MonoCode>{execution.safePaymentDetails.idempotencyKey}</MonoCode>
                      </dd>
                    </div>
                  )}
                  {execution.safePaymentDetails.authorizationVoided !== null &&
                    execution.safePaymentDetails.authorizationVoided !== undefined && (
                      <div className="flex justify-between">
                        <dt className="text-ink-secondary">Auth Hold Voided:</dt>
                        <dd className="font-medium text-ink-primary flex items-center gap-1">
                          {execution.safePaymentDetails.authorizationVoided ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-status-healthy" />
                              <span>Confirmed</span>
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5 text-status-warning" />
                              <span>Not Voided</span>
                            </>
                          )}
                        </dd>
                      </div>
                    )}
                </dl>
              ) : (
                <div className="flex items-start gap-2 text-xs text-ink-secondary leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-ink-secondary shrink-0 mt-0.5" />
                  <span>
                    No payment-handling payload (<MonoCode>safe_payment_details</MonoCode>) was
                    returned by the backend for this execution.
                  </span>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </Dialog>
  );
};
