import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon,
  ArrowUpRight,
  CheckCircle2,
  Play,
  ServerOff,
  ShieldCheck,
} from 'lucide-react';
import { useTriggerJourneyExecutionMutation } from '../../api/journeysAndExecutions';
import {
  Badge,
  Button,
  Dialog,
  FormField,
  Input,
  MonoCode,
  Textarea,
} from '../ui';

export interface TriggerExecutionDialogProps {
  open: boolean;
  onClose: () => void;
  journeyId: string;
  journeyName?: string;
}

function generateIdempotencyKey(journeyId: string): string {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `run-${journeyId || 'journey'}-${Date.now()}-${randomSuffix}`;
}

/**
 * Confirmation dialog for triggering a synthetic journey execution.
 * Prevents duplicate submissions, shows live request progress, and strictly reports
 * the actual backend response or error—never claiming fake execution success.
 */
export const TriggerExecutionDialog: React.FC<TriggerExecutionDialogProps> = ({
  open,
  onClose,
  journeyId,
  journeyName,
}) => {
  const [targetJourneyId, setTargetJourneyId] = useState(journeyId);
  const [reason, setReason] = useState('Operator on-demand verification run');
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    generateIdempotencyKey(journeyId)
  );

  const triggerMutation = useTriggerJourneyExecutionMutation();

  useEffect(() => {
    if (open) {
      setTargetJourneyId(journeyId);
      setIdempotencyKey(generateIdempotencyKey(journeyId));
      triggerMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, journeyId]);

  const effectiveJourneyId = targetJourneyId.trim();
  const endpointPath = effectiveJourneyId
    ? `/api/v1/journeys/${effectiveJourneyId}/execute`
    : '/api/v1/journeys/{journey_id}/execute';

  const handleConfirmTrigger = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveJourneyId || triggerMutation.isPending || triggerMutation.isSuccess) {
      return;
    }
    triggerMutation.mutate({
      journeyId: effectiveJourneyId,
      idempotencyKey,
      reason,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!triggerMutation.isPending) {
          onClose();
        }
      }}
      title="Trigger Synthetic Journey Execution"
      description="Confirm an on-demand synthetic transaction run against the configured backend endpoint."
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            disabled={triggerMutation.isPending}
            onClick={onClose}
          >
            {triggerMutation.isSuccess ? 'Close' : 'Cancel'}
          </Button>

          {!triggerMutation.isSuccess && (
            <Button
              variant="primary"
              size="sm"
              isLoading={triggerMutation.isPending}
              disabled={!effectiveJourneyId || triggerMutation.isPending}
              onClick={handleConfirmTrigger}
              leftIcon={<Play className="w-3.5 h-3.5" />}
            >
              {triggerMutation.isPending
                ? 'Awaiting Backend Confirmation...'
                : 'Confirm & Trigger Run'}
            </Button>
          )}
        </>
      }
    >
      <form onSubmit={handleConfirmTrigger} className="space-y-4">
        {/* Target Journey & Endpoint Summary */}
        <div className="p-3 rounded-md bg-surface-cream border border-border-warm space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-secondary font-medium">Target Journey:</span>
            <span className="font-semibold text-ink-primary">
              {journeyName ? `${journeyName} (${effectiveJourneyId})` : effectiveJourneyId || '—'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-secondary font-medium">Backend Contract:</span>
            <MonoCode>POST {endpointPath}</MonoCode>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-secondary font-medium">Idempotency Guard:</span>
            <MonoCode>{idempotencyKey}</MonoCode>
          </div>
        </div>

        {!journeyId && (
          <FormField
            label="Journey Identifier"
            htmlFor="trigger-journey-id"
            required
            helperText="Enter the configured backend journey ID to execute."
          >
            <Input
              id="trigger-journey-id"
              value={targetJourneyId}
              onChange={(e) => setTargetJourneyId(e.target.value)}
              disabled={triggerMutation.isPending || triggerMutation.isSuccess}
              placeholder="e.g. checkout-guest-flow"
            />
          </FormField>
        )}

        <FormField
          label="Execution Audit Reason"
          htmlFor="trigger-reason"
          helperText="Recorded in the execution audit trail if the backend accepts the run."
        >
          <Textarea
            id="trigger-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={triggerMutation.isPending || triggerMutation.isSuccess}
            placeholder="Reason for triggering manual synthetic verification..."
          />
        </FormField>

        <div className="p-2.5 rounded bg-surface-secondary/60 border border-border-warm flex items-start gap-2 text-[11px] text-ink-secondary">
          <ShieldCheck className="w-4 h-4 text-status-healthy shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Duplicate submissions are locked using header{' '}
            <MonoCode>X-Idempotency-Key</MonoCode>. Continuum reports execution success strictly
            when the FastAPI backend confirms the run with a valid <MonoCode>execution_id</MonoCode>.
          </span>
        </div>

        {/* Confirmed Backend Success Response */}
        {triggerMutation.isSuccess && triggerMutation.data && (
          <div
            role="status"
            className="p-3.5 rounded-md bg-status-healthy/10 border border-status-healthy/30 text-ink-primary space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-heading text-xs font-semibold text-status-healthy">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Backend Confirmed Execution Start</span>
              </div>
              <Badge variant="healthy" mono>
                {triggerMutation.data.status.toUpperCase()}
              </Badge>
            </div>
            <div className="text-xs text-ink-secondary space-y-1">
              <div>
                Execution ID: <MonoCode>{triggerMutation.data.executionId}</MonoCode>
              </div>
              {triggerMutation.data.message && <p>{triggerMutation.data.message}</p>}
            </div>
            <div className="pt-1">
              <Link
                to={`/monitoring/executions?executionId=${encodeURIComponent(
                  triggerMutation.data.executionId
                )}`}
                onClick={onClose}
                className="inline-flex items-center gap-1 text-xs font-semibold text-burgundy hover:underline"
              >
                <span>Inspect Execution {triggerMutation.data.executionId}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Actual Backend Error or Unavailability */}
        {triggerMutation.isError && triggerMutation.error && (
          <div
            role="alert"
            className="p-3.5 rounded-md bg-status-critical/10 border border-status-critical/30 text-ink-primary space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-heading text-xs font-semibold text-status-critical">
                {triggerMutation.error.isUnavailable ? (
                  <ServerOff className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {triggerMutation.error.isUnavailable
                    ? 'Execution Trigger Endpoint Unavailable'
                    : 'Synthetic Run Rejected by Backend'}
                </span>
              </div>
              {triggerMutation.error.status && (
                <Badge variant="critical" mono>
                  HTTP {triggerMutation.error.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              {triggerMutation.error.message}
            </p>
            <div className="text-[11px] font-mono text-ink-secondary pt-1">
              No synthetic journey was executed. Verify <MonoCode>POST {endpointPath}</MonoCode> on
              the FastAPI backend.
            </div>
          </div>
        )}
      </form>
    </Dialog>
  );
};
