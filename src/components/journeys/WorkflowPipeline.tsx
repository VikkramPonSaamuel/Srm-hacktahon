import React from 'react';
import { ArrowRight, AlertCircle, CheckCircle2, Clock, HelpCircle, MinusCircle } from 'lucide-react';
import type { JourneyStepConfig, StepStatus } from '../../api/journeysAndExecutions';
import type { SemanticStatus } from '../../styles/tokens';
import { Badge, MonoCode } from '../ui/Badge';

export function stepStatusToVariant(status: StepStatus): SemanticStatus {
  switch (status) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'warning';
    case 'failing':
      return 'critical';
    case 'skipped':
      return 'info';
    default:
      return 'neutral';
  }
}

function StepStatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="w-3.5 h-3.5 text-status-healthy shrink-0" aria-hidden="true" />;
    case 'degraded':
      return <Clock className="w-3.5 h-3.5 text-status-warning shrink-0" aria-hidden="true" />;
    case 'failing':
      return <AlertCircle className="w-3.5 h-3.5 text-status-critical shrink-0" aria-hidden="true" />;
    case 'skipped':
      return <MinusCircle className="w-3.5 h-3.5 text-status-info shrink-0" aria-hidden="true" />;
    default:
      return <HelpCircle className="w-3.5 h-3.5 text-status-neutral shrink-0" aria-hidden="true" />;
  }
}

export interface WorkflowPipelineProps {
  steps: JourneyStepConfig[];
  selectedStepId?: string | null;
  onSelectStep?: (step: JourneyStepConfig) => void;
}

/**
 * Visually represents a journey's actual configured steps as an ordered workflow pipeline.
 * Does not assume fixed steps; renders the exact ordered configuration from the backend.
 */
export const WorkflowPipeline: React.FC<WorkflowPipelineProps> = ({
  steps,
  selectedStepId,
  onSelectStep,
}) => {
  const orderedSteps = React.useMemo(
    () => [...steps].sort((a, b) => a.order - b.order),
    [steps]
  );

  if (orderedSteps.length === 0) {
    return (
      <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
        No step-level workflow configuration was returned by the backend for this journey.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Flow Summary Ribbon (e.g. Step 1 -> Step 2 -> Step 3) */}
      <div
        aria-label="Ordered workflow summary"
        className="px-3.5 py-2 rounded-md bg-surface-cream border border-border-warm flex items-center gap-1.5 flex-wrap text-xs"
      >
        {orderedSteps.map((step, index) => (
          <React.Fragment key={step.id}>
            <span
              className={[
                'inline-flex items-center gap-1.5 font-medium px-2 py-0.5 rounded border',
                step.status === 'failing'
                  ? 'bg-status-critical/10 text-status-critical border-status-critical/30'
                  : step.status === 'degraded'
                    ? 'bg-status-warning/10 text-status-warning border-status-warning/30'
                    : 'bg-surface-ivory text-ink-primary border-border-warm',
              ].join(' ')}
            >
              <span className="font-mono text-[10px] text-ink-secondary">{step.order}.</span>
              <span>{step.name}</span>
            </span>
            {index < orderedSteps.length - 1 && (
              <ArrowRight className="w-3.5 h-3.5 text-ink-secondary shrink-0" aria-hidden="true" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Detailed Ordered Step Cards */}
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {orderedSteps.map((step) => {
          const isSelected = selectedStepId === step.id;
          const isFailing = step.status === 'failing';

          return (
            <li key={step.id} className="flex">
              <div
                onClick={onSelectStep ? () => onSelectStep(step) : undefined}
                role={onSelectStep ? 'button' : undefined}
                tabIndex={onSelectStep ? 0 : undefined}
                onKeyDown={
                  onSelectStep
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectStep(step);
                        }
                      }
                    : undefined
                }
                className={[
                  'w-full p-3.5 flex flex-col justify-between transition-all rounded-xl',
                  isFailing
                    ? 'surface-card bg-rose-50/20 border-status-critical/40 shadow-depth-sm'
                    : isSelected
                      ? 'surface-card bg-surface-secondary/70 border-burgundy ring-2 ring-burgundy/20 shadow-depth-md'
                      : 'surface-card-interactive border-border-warm',
                ].join(' ')}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase text-ink-secondary">
                      Step {String(step.order).padStart(2, '0')}
                    </span>
                    <Badge variant={stepStatusToVariant(step.status)} dot>
                      {step.status}
                    </Badge>
                  </div>

                  <div className="mt-2 flex items-start gap-1.5">
                    <StepStatusIcon status={step.status} />
                    <h4 className="font-heading text-xs font-semibold text-ink-primary leading-snug">
                      {step.name}
                    </h4>
                  </div>

                  {(step.actionType || step.targetEndpoint) && (
                    <div className="mt-1.5 truncate">
                      <MonoCode className="text-[10px]">
                        {[step.actionType, step.targetEndpoint].filter(Boolean).join(' ')}
                      </MonoCode>
                    </div>
                  )}

                  {step.lastErrorMessage && (
                    <div className="mt-2 p-1.5 rounded bg-status-critical/10 border border-status-critical/25 text-[11px] text-status-critical leading-snug">
                      {step.lastErrorCode && (
                        <span className="font-mono font-semibold mr-1">
                          [{step.lastErrorCode}]
                        </span>
                      )}
                      {step.lastErrorMessage}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-border-warm/70 flex items-center justify-between text-[11px] font-mono text-ink-secondary">
                  <span>
                    Latency:{' '}
                    {typeof step.averageLatencyMs === 'number'
                      ? `${Math.round(step.averageLatencyMs)} ms`
                      : '—'}
                  </span>
                  {typeof step.successRate === 'number' && (
                    <span>{step.successRate.toFixed(1)}%</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
