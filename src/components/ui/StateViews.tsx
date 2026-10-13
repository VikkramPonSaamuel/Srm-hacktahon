import React from 'react';
import {
  AlertOctagon,
  Inbox,
  Loader2,
  RefreshCw,
  ServerOff,
} from 'lucide-react';
import { Button } from './Button';
import { Badge, MonoCode } from './Badge';

export interface LoadingStateProps {
  title?: string;
  description?: string;
  rows?: number;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  title = 'Synchronizing telemetry stream',
  description = 'Awaiting structured response from Continuum backend service...',
  rows = 3,
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="p-6 bg-surface-ivory border border-border-warm rounded-lg text-ink-primary"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <Loader2 className="w-4 h-4 text-burgundy animate-spin shrink-0" aria-hidden="true" />
        <div>
          <div className="text-xs font-semibold text-ink-primary">{title}</div>
          <div className="text-[11px] text-ink-secondary">{description}</div>
        </div>
      </div>

      <div className="space-y-2.5" aria-hidden="true">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="h-9 rounded bg-surface-secondary/75 border border-border-warm/60 animate-pulse flex items-center px-3 justify-between"
          >
            <div className="h-2.5 w-1/4 rounded bg-border-warm" />
            <div className="h-2.5 w-1/3 rounded bg-border-warm/80" />
            <div className="h-2.5 w-16 rounded bg-border-warm" />
          </div>
        ))}
      </div>
    </div>
  );
};

export interface EmptyStateProps {
  title: string;
  description: string;
  endpoint?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  endpoint,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="py-10 px-6 bg-surface-ivory border border-border-warm rounded-lg text-center">
      <div className="w-9 h-9 rounded-full bg-surface-secondary border border-border-warm mx-auto flex items-center justify-center text-ink-secondary mb-3">
        <Inbox className="w-4 h-4" aria-hidden="true" />
      </div>
      <h3 className="font-heading text-sm font-semibold text-ink-primary">{title}</h3>
      <p className="text-xs text-ink-secondary max-w-md mx-auto mt-1 leading-relaxed">
        {description}
      </p>
      {endpoint && (
        <div className="mt-3">
          <span className="text-[11px] text-ink-secondary mr-1.5">Source contract:</span>
          <MonoCode>{endpoint}</MonoCode>
        </div>
      )}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

export interface ErrorStateProps {
  title?: string;
  message: string;
  endpoint?: string;
  statusCode?: number | null;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Telemetry request failed',
  message,
  endpoint,
  statusCode,
  onRetry,
}) => {
  return (
    <div
      role="alert"
      className="p-5 bg-surface-ivory border border-status-critical/35 rounded-lg text-ink-primary"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-status-critical/10 text-status-critical border border-status-critical/25 shrink-0 mt-0.5">
            <AlertOctagon className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-sm font-semibold text-ink-primary">{title}</h3>
              {statusCode && (
                <Badge variant="critical" mono>
                  HTTP {statusCode}
                </Badge>
              )}
            </div>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">{message}</p>
            {endpoint && (
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-secondary">
                <span>Endpoint:</span>
                <MonoCode>{endpoint}</MonoCode>
              </div>
            )}
          </div>
        </div>

        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Retry request
          </Button>
        )}
      </div>
    </div>
  );
};

export interface UnavailableStateProps {
  title?: string;
  description?: string;
  endpoint?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export const UnavailableState: React.FC<UnavailableStateProps> = ({
  title = 'Backend telemetry service unavailable',
  description = 'No active FastAPI service responded on the configured API gateway. Operational metrics and mutations are withheld until a verified backend connection is established.',
  endpoint,
  onRetry,
  isRetrying = false,
}) => {
  return (
    <div
      role="status"
      className="p-5 bg-surface-ivory border border-border-warm rounded-lg text-ink-primary"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-status-warning/12 text-status-warning border border-status-warning/30 shrink-0 mt-0.5">
            <ServerOff className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading text-sm font-semibold text-ink-primary">{title}</h3>
              <Badge variant="warning" dot>
                Telemetry Unconnected
              </Badge>
            </div>
            <p className="text-xs text-ink-secondary mt-1 max-w-2xl leading-relaxed">
              {description}
            </p>
            {endpoint && (
              <div className="mt-2.5 flex items-center gap-2 flex-wrap text-[11px] text-ink-secondary">
                <span>Awaiting contract:</span>
                <MonoCode>{endpoint}</MonoCode>
              </div>
            )}
          </div>
        </div>

        {onRetry && (
          <div className="shrink-0">
            <Button
              variant="secondary"
              size="sm"
              isLoading={isRetrying}
              onClick={onRetry}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Probe endpoint
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
