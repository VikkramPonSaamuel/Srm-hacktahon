import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Clock,
  ExternalLink,
  Layers,
  Lock,
  Play,
  Radar,
  RefreshCw,
  ShieldAlert,
  User,
  Workflow,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import type { SemanticStatus } from '../styles/tokens';
import type { IncidentLifecycleStatus, IncidentSeverity } from '../api/contracts';
import {
  type IncidentRecordItem,
  useAcknowledgeIncidentMutation,
  useIncidentDetailQuery,
  useIncidentsListQuery,
  useUpdateIncidentStatusMutation,
} from '../api/incidentsAndRca';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FilterBar,
  FormField,
  LoadingState,
  MonoCode,
  Select,
  Textarea,
  UnavailableState,
} from '../components/ui';

export function severityToBadgeVariant(sev: IncidentSeverity): SemanticStatus {
  switch (sev) {
    case 'critical':
    case 'sev1':
      return 'critical';
    case 'sev2':
      return 'warning';
    case 'sev3':
      return 'info';
    case 'low':
    default:
      return 'neutral';
  }
}

export function statusToBadgeVariant(st: IncidentLifecycleStatus): SemanticStatus {
  switch (st) {
    case 'resolved':
      return 'healthy';
    case 'mitigating':
      return 'info';
    case 'investigating':
      return 'warning';
    case 'open':
    default:
      return 'critical';
  }
}

type IncidentSortKey = 'firstSeenAt' | 'latestUpdateAt' | 'severity' | 'status' | 'title';

export const IncidentManagementPage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedIncidentId = searchParams.get('incidentId');

  // List filters, sorting, and pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<IncidentSortKey>('latestUpdateAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Consequential action confirmation dialogs
  const [actionModal, setActionModal] = useState<{
    type: 'acknowledge' | 'status';
    incidentId: string;
    targetStatus?: IncidentLifecycleStatus;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState('');

  const incidentsQuery = useIncidentsListQuery(timeRange);
  const incidentDetailQuery = useIncidentDetailQuery(selectedIncidentId, timeRange);

  const acknowledgeMutation = useAcknowledgeIncidentMutation();
  const updateStatusMutation = useUpdateIncidentStatusMutation();

  const filteredAndSortedIncidents = useMemo(() => {
    const list = incidentsQuery.data ?? [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = list.filter((inc) => {
      const matchesSearch =
        !q ||
        inc.id.toLowerCase().includes(q) ||
        inc.title.toLowerCase().includes(q) ||
        (inc.summary?.toLowerCase().includes(q) ?? false) ||
        (inc.affectedJourneyName?.toLowerCase().includes(q) ?? false) ||
        (inc.affectedServiceName?.toLowerCase().includes(q) ?? false) ||
        (inc.assignedOwner?.toLowerCase().includes(q) ?? false);

      const matchesSeverity =
        severityFilter === 'all' || inc.severity === severityFilter;

      const matchesStatus =
        statusFilter === 'all' || inc.status === statusFilter;

      return matchesSearch && matchesSeverity && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'firstSeenAt') {
        cmp = a.firstSeenAt.localeCompare(b.firstSeenAt);
      } else if (sortKey === 'latestUpdateAt') {
        cmp = a.latestUpdateAt.localeCompare(b.latestUpdateAt);
      } else if (sortKey === 'severity') {
        cmp = a.severity.localeCompare(b.severity);
      } else if (sortKey === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortKey === 'title') {
        cmp = a.title.localeCompare(b.title);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [incidentsQuery.data, searchQuery, severityFilter, statusFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedIncidents.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedIncidents = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedIncidents.slice(start, start + pageSize);
  }, [filteredAndSortedIncidents, safePage, pageSize]);

  const handleOpenIncidentDetail = (id: string) => {
    setSearchParams({ incidentId: id });
  };

  const handleCloseIncidentDetail = () => {
    setSearchParams({});
  };

  const fallbackFromList: IncidentRecordItem | undefined = useMemo(
    () => (incidentsQuery.data ?? []).find((i) => i.id === selectedIncidentId),
    [incidentsQuery.data, selectedIncidentId]
  );

  const activeDetail = incidentDetailQuery.data;

  // Handle consequential action submission
  const handleExecuteAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;

    if (actionModal.type === 'acknowledge') {
      acknowledgeMutation.mutate(
        {
          incidentId: actionModal.incidentId,
          operatorNotes: actionNotes,
        },
        {
          onSuccess: () => {
            setActionNotes('');
          },
        }
      );
    } else if (actionModal.type === 'status' && actionModal.targetStatus) {
      updateStatusMutation.mutate(
        {
          incidentId: actionModal.incidentId,
          status: actionModal.targetStatus,
          note: actionNotes,
        },
        {
          onSuccess: () => {
            setActionNotes('');
          },
        }
      );
    }
  };

  // =========================================================================
  // INCIDENT DETAILS VIEW (?incidentId=...)
  // =========================================================================
  if (selectedIncidentId) {
    const displayIncident = activeDetail ?? fallbackFromList;

    return (
      <div className="space-y-5">
        {/* Top Header Card */}
        <Card variant="ivory">
          <CardHeader
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseIncidentDetail}
                  leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                >
                  All Incidents
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={incidentDetailQuery.isFetching}
                  onClick={() => void incidentDetailQuery.refetch()}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Refresh Incident
                </Button>

                {displayIncident?.status !== 'resolved' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setActionModal({
                        type: 'acknowledge',
                        incidentId: selectedIncidentId,
                      })
                    }
                  >
                    Acknowledge
                  </Button>
                )}

                {displayIncident?.status !== 'resolved' ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      setActionModal({
                        type: 'status',
                        incidentId: selectedIncidentId,
                        targetStatus: 'mitigating',
                      })
                    }
                  >
                    Transition to Mitigating
                  </Button>
                ) : (
                  <Badge variant="healthy" dot>
                    Resolved
                  </Badge>
                )}
              </div>
            }
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-status-critical/10 text-status-critical shrink-0 mt-0.5">
                <ShieldAlert className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle>
                    {displayIncident?.title ?? `Incident ${selectedIncidentId}`}
                  </CardTitle>
                  <MonoCode>{selectedIncidentId}</MonoCode>
                  {displayIncident && (
                    <Badge variant={severityToBadgeVariant(displayIncident.severity)} dot>
                      {displayIncident.severity.toUpperCase()}
                    </Badge>
                  )}
                  {displayIncident && (
                    <Badge variant={statusToBadgeVariant(displayIncident.status)}>
                      {displayIncident.status.toUpperCase()}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {displayIncident?.summary ??
                    'Root-cause diagnostic evidence, failure signature clustering, and mitigation coordination.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          {/* Incident Scope Strip: Affected Journey, Service, Owner, Times */}
          {displayIncident && (
            <div className="px-4 py-3 bg-surface-cream/60 border-t border-border-warm grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-ink-secondary block">
                  Affected Business Journey
                </span>
                <div className="mt-0.5">
                  {displayIncident.affectedJourneyId ? (
                    <Link
                      to={`/monitoring/journeys?journeyId=${encodeURIComponent(
                        displayIncident.affectedJourneyId
                      )}`}
                      className="font-semibold text-burgundy hover:underline flex items-center gap-1"
                    >
                      <span>
                        {displayIncident.affectedJourneyName ??
                          displayIncident.affectedJourneyId}
                      </span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  ) : (
                    <span className="text-ink-secondary">—</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-ink-secondary block">
                  Affected Service Dependency
                </span>
                <div className="mt-0.5">
                  {displayIncident.affectedServiceId ? (
                    <Link
                      to={`/monitoring/service-health?serviceId=${encodeURIComponent(
                        displayIncident.affectedServiceId
                      )}`}
                      className="font-semibold text-burgundy hover:underline flex items-center gap-1"
                    >
                      <span>
                        {displayIncident.affectedServiceName ??
                          displayIncident.affectedServiceId}
                      </span>
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  ) : (
                    <span className="text-ink-secondary">—</span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[11px] text-ink-secondary block">
                  First Detected &amp; Updated
                </span>
                <div className="font-mono text-ink-primary mt-0.5">
                  {displayIncident.firstSeenAt}
                  <span className="text-ink-secondary text-[10px] block">
                    Updated: {displayIncident.latestUpdateAt}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-ink-secondary block">Assigned Owner</span>
                <div className="mt-0.5 font-medium text-ink-primary flex items-center gap-1">
                  <User className="w-3 h-3 text-ink-secondary" />
                  <span>{displayIncident.assignedOwner ?? 'Unassigned / On-Call Queue'}</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {incidentDetailQuery.isFetching && !displayIncident ? (
          <LoadingState
            title="Loading incident investigation details"
            description={`Querying GET /api/v1/incidents/${selectedIncidentId}...`}
            rows={4}
          />
        ) : incidentDetailQuery.isError &&
          incidentDetailQuery.error?.isUnavailable &&
          !displayIncident ? (
          <UnavailableState
            title="Incident Detail Telemetry API Unavailable"
            description={`Endpoint GET /api/v1/incidents/${selectedIncidentId} did not respond. No fabricated incident evidence is shown.`}
            endpoint={`/api/v1/incidents/${selectedIncidentId}`}
            onRetry={() => void incidentDetailQuery.refetch()}
          />
        ) : incidentDetailQuery.isError && !displayIncident ? (
          <ErrorState
            title="Failed to load incident detail"
            message={incidentDetailQuery.error?.message ?? 'Error fetching incident'}
            statusCode={incidentDetailQuery.error?.status}
            endpoint={`/api/v1/incidents/${selectedIncidentId}`}
            onRetry={() => void incidentDetailQuery.refetch()}
          />
        ) : (
          <>
            {/* 1. Relevant Execution & Failed-Step Details */}
            {displayIncident?.associatedExecutionId && (
              <Card variant="ivory">
                <CardHeader
                  actions={
                    <Link
                      to={`/monitoring/executions?executionId=${encodeURIComponent(
                        displayIncident.associatedExecutionId
                      )}`}
                    >
                      <Button
                        variant="outline"
                        size="xs"
                        rightIcon={<ExternalLink className="w-3 h-3" />}
                      >
                        Inspect Execution Trace
                      </Button>
                    </Link>
                  }
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-status-critical" />
                    <CardTitle>Relevant Synthetic Execution &amp; Failed Step</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="p-3 rounded-md bg-status-critical/10 border border-status-critical/30 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 font-semibold text-ink-primary">
                        <span>Associated Run:</span>
                        <MonoCode>{displayIncident.associatedExecutionId}</MonoCode>
                        {displayIncident.failedStepName && (
                          <span>
                            (Failed Step:{' '}
                            {displayIncident.failedStepOrder !== null
                              ? `#${displayIncident.failedStepOrder} `
                              : ''}
                            {displayIncident.failedStepName})
                          </span>
                        )}
                      </div>
                      {displayIncident.errorCode && (
                        <Badge variant="critical" mono>
                          {displayIncident.errorCode}
                        </Badge>
                      )}
                    </div>
                    {displayIncident.errorMessage && (
                      <p className="font-mono text-status-critical leading-relaxed">
                        {displayIncident.errorMessage}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 2. Event Timeline & 3. Root Cause Analysis Summary */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              {/* Event Timeline (7 Cols on XL) */}
              <div className="xl:col-span-7">
                <Card variant="ivory" className="h-full">
                  <CardHeader
                    actions={
                      <Badge variant="neutral" mono>
                        {activeDetail?.timeline.length ?? 0} Event(s)
                      </Badge>
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-burgundy" />
                      <CardTitle>Incident Event Timeline</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(activeDetail?.timeline.length ?? 0) === 0 ? (
                      <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                        No event timeline entries were returned by the backend for this incident.
                      </div>
                    ) : (
                      <ol className="relative border-l border-border-warm ml-3 space-y-4 py-1">
                        {activeDetail!.timeline.map((event) => (
                          <li key={event.id} className="ml-4">
                            <span
                              className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-burgundy border-2 border-surface-ivory"
                              aria-hidden="true"
                            />
                            <div className="p-3 rounded-md bg-surface-cream/60 border border-border-warm text-xs">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-semibold text-ink-primary">
                                  {event.title}
                                </span>
                                <span className="font-mono text-[11px] text-ink-secondary">
                                  {event.timestamp}
                                </span>
                              </div>
                              {event.description && (
                                <p className="text-ink-secondary mt-1 leading-relaxed">
                                  {event.description}
                                </p>
                              )}
                              {event.actor && (
                                <div className="mt-1.5 text-[11px] font-mono text-ink-secondary">
                                  Actor: {event.actor}
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* RCA & Recommended Next Steps (5 Cols on XL) */}
              <div className="xl:col-span-5">
                <Card variant="ivory" className="h-full">
                  <CardHeader
                    actions={
                      activeDetail?.rcaSummary && (
                        <Link
                          to={`/intelligence/root-cause?incidentId=${encodeURIComponent(
                            selectedIncidentId
                          )}`}
                        >
                          <Button variant="outline" size="xs">
                            Full RCA View
                          </Button>
                        </Link>
                      )
                    }
                  >
                    <div className="flex items-center gap-2">
                      <Workflow className="w-4 h-4 text-burgundy" />
                      <CardTitle>Root Cause &amp; Remediation</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!activeDetail?.rcaSummary ? (
                      <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                        Root cause analysis is currently pending or awaiting telemetry
                        clustering. Check the{' '}
                        <Link
                          to="/intelligence/root-cause"
                          className="text-burgundy hover:underline font-semibold"
                        >
                          Root Cause Analysis module
                        </Link>
                        .
                      </div>
                    ) : (
                      <div className="space-y-3 text-xs">
                        <div className="p-3 rounded-md bg-surface-cream border border-border-warm space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink-primary">
                              Identified Cause
                            </span>
                            <Badge
                              variant={
                                activeDetail.rcaSummary.analysisType === 'ai_assisted'
                                  ? 'info'
                                  : 'healthy'
                              }
                            >
                              {activeDetail.rcaSummary.analysisType === 'ai_assisted'
                                ? 'AI-Assisted Hypothesis'
                                : 'Deterministic Root Cause'}
                            </Badge>
                          </div>
                          <p className="font-medium text-ink-primary leading-relaxed">
                            {activeDetail.rcaSummary.identifiedCause}
                          </p>
                          <div className="text-[11px] text-ink-secondary pt-1 flex items-center justify-between">
                            <span>
                              Culprit: {activeDetail.rcaSummary.culpritServiceOrDependency}
                            </span>
                            {activeDetail.rcaSummary.confidenceScore !== null && (
                              <span className="font-mono">
                                Confidence: {activeDetail.rcaSummary.confidenceScore}%
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-3 rounded-md bg-surface-cream border border-border-warm space-y-1.5">
                          <span className="font-semibold text-ink-primary block">
                            Recommended Next Steps &amp; Countermeasure
                          </span>
                          <p className="text-ink-secondary leading-relaxed">
                            {activeDetail.rcaSummary.recommendedRemediation}
                          </p>
                          {activeDetail.rcaSummary.recommendedPlaybookId && (
                            <div className="pt-2">
                              <Link to="/recovery/playbooks">
                                <Button
                                  variant="primary"
                                  size="xs"
                                  rightIcon={<Play className="w-3 h-3" />}
                                >
                                  Open Playbook (
                                  {activeDetail.rcaSummary.recommendedPlaybookName ??
                                    activeDetail.rcaSummary.recommendedPlaybookId}
                                  )
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 4. Sanitized Diagnostic Evidence */}
            <Card variant="ivory">
              <CardHeader
                actions={
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-status-healthy" />
                    <span className="text-[11px] text-ink-secondary font-medium">
                      Automatic PCI &amp; Credential Redaction Active
                    </span>
                  </div>
                }
              >
                <CardTitle>Sanitized Diagnostic Evidence &amp; Payload Traces</CardTitle>
                <CardDescription>
                  Probe assertion mismatches and HTTP error bodies. Cardholder data, CVVs, and
                  tokens are scrubbed before rendering.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(activeDetail?.diagnosticEvidence.length ?? 0) === 0 ? (
                  <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                    No diagnostic evidence payloads were returned by the backend for this
                    incident.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeDetail!.diagnosticEvidence.map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-md border border-border-warm bg-surface-cream/50 p-3 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <MonoCode>{ev.target}</MonoCode>
                            <span className="text-[11px] text-ink-secondary font-mono">
                              Captured: {ev.capturedAt}
                            </span>
                          </div>
                          {ev.redactionsApplied.length > 0 && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-ink-secondary">Redacted:</span>
                              {ev.redactionsApplied.map((redaction) => (
                                <Badge key={redaction} variant="neutral">
                                  {redaction}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <pre className="p-2.5 rounded bg-surface-ivory border border-border-warm font-mono text-[11px] text-ink-primary overflow-x-auto whitespace-pre-wrap leading-relaxed">
                          {ev.sanitizedPayload}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 5. Related Failure Patterns & 6. Recovery Attempts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card variant="ivory">
                <CardHeader
                  actions={
                    <Link to="/intelligence/failure-patterns">
                      <Button variant="outline" size="xs">
                        Patterns Matrix
                      </Button>
                    </Link>
                  }
                >
                  <div className="flex items-center gap-2">
                    <Radar className="w-4 h-4 text-burgundy" />
                    <CardTitle>Related Recurring Failure Patterns</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <DataTable
                    caption="Related failure patterns"
                    columns={[
                      { key: 'signature', header: 'Signature' },
                      {
                        key: 'occurrencesCount',
                        header: 'Occurrences',
                        mono: true,
                        align: 'right',
                      },
                      {
                        key: 'status',
                        header: 'Status',
                        render: (row) => <Badge variant="warning">{String(row.status)}</Badge>,
                      },
                    ]}
                    data={
                      (activeDetail?.relatedFailurePatterns ?? []) as unknown as Record<
                        string,
                        unknown
                      >[]
                    }
                    rowKey={(row) => String(row.id)}
                    emptyTitle="No correlated recurring patterns"
                    emptyDescription="Zero recurring error signatures are correlated with this incident."
                  />
                </CardContent>
              </Card>

              <Card variant="ivory">
                <CardHeader
                  actions={
                    <Link to="/recovery/executions">
                      <Button variant="outline" size="xs">
                        Recovery History
                      </Button>
                    </Link>
                  }
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-burgundy" />
                    <CardTitle>Recovery Attempts &amp; Verification</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <DataTable
                    caption="Correlated recovery attempts"
                    columns={[
                      { key: 'playbookName', header: 'Playbook' },
                      {
                        key: 'status',
                        header: 'Outcome',
                        render: (row) => (
                          <Badge
                            variant={row.status === 'verified' ? 'healthy' : 'warning'}
                            dot
                          >
                            {String(row.status).toUpperCase()}
                          </Badge>
                        ),
                      },
                      { key: 'executedAt', header: 'Executed At', mono: true, align: 'right' },
                    ]}
                    data={
                      (activeDetail?.recoveryAttempts ?? []) as unknown as Record<
                        string,
                        unknown
                      >[]
                    }
                    rowKey={(row) => String(row.id)}
                    emptyTitle="No recovery attempts recorded"
                    emptyDescription="No automated or manual countermeasures have been executed for this incident."
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Consequential Action Confirmation Dialog */}
        <Dialog
          open={Boolean(actionModal)}
          onClose={() => setActionModal(null)}
          title={
            actionModal?.type === 'acknowledge'
              ? 'Acknowledge Reliability Incident'
              : `Update Incident Status to ${(actionModal?.targetStatus ?? '').toUpperCase()}`
          }
          description="Confirm action execution. The platform will record the actual backend response or report errors."
          size="md"
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={acknowledgeMutation.isPending || updateStatusMutation.isPending}
                onClick={() => setActionModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={acknowledgeMutation.isPending || updateStatusMutation.isPending}
                onClick={handleExecuteAction}
              >
                Confirm &amp; Dispatch to Backend
              </Button>
            </>
          }
        >
          <form onSubmit={handleExecuteAction} className="space-y-4">
            <div className="p-3 rounded-md bg-surface-cream border border-border-warm text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Incident Target:</span>
                <MonoCode>{actionModal?.incidentId}</MonoCode>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Target Action:</span>
                <span className="font-semibold text-ink-primary">
                  {actionModal?.type === 'acknowledge'
                    ? 'Acknowledge Incident'
                    : `Status Transition -> ${actionModal?.targetStatus}`}
                </span>
              </div>
            </div>

            <FormField
              label="Operator Note / Action Rationale"
              htmlFor="action-notes-input"
              helperText="Recorded in the incident timeline if accepted by the backend."
            >
              <Textarea
                id="action-notes-input"
                rows={2}
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                placeholder="Enter investigation context or mitigation note..."
              />
            </FormField>

            {/* Error state if mutation failed */}
            {(acknowledgeMutation.isError || updateStatusMutation.isError) && (
              <div
                role="alert"
                className="p-3 rounded-md bg-status-critical/10 border border-status-critical/30 text-xs space-y-1"
              >
                <div className="flex items-center gap-1.5 font-semibold text-status-critical">
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>Backend Action Rejected or Unavailable</span>
                </div>
                <p className="text-ink-secondary">
                  {acknowledgeMutation.error?.message ?? updateStatusMutation.error?.message}
                </p>
              </div>
            )}
          </form>
        </Dialog>
      </div>
    );
  }

  // =========================================================================
  // INCIDENTS LIST VIEW
  // =========================================================================
  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/intelligence/root-cause">
                <Button variant="outline" size="sm">
                  Root Cause Analysis
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                isLoading={incidentsQuery.isFetching}
                onClick={() => void incidentsQuery.refetch()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Incidents
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-status-critical/10 text-status-critical shrink-0 mt-0.5">
              <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Incident Management</CardTitle>
                <MonoCode>GET /api/v1/incidents</MonoCode>
              </div>
              <CardDescription>
                Triage reliability incidents, inspect correlated execution failures, review
                sanitized diagnostic traces, and coordinate safe countermeasures.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filter & Sort Controls */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setCurrentPage(1);
        }}
        searchPlaceholder="Filter incidents by ID, title, journey, service, or owner..."
        filters={[
          {
            id: 'incident-sev-filter',
            label: 'Severity',
            value: severityFilter,
            options: [
              { value: 'all', label: 'All Severities' },
              { value: 'critical', label: 'Critical / SEV-1' },
              { value: 'sev2', label: 'Major / SEV-2' },
              { value: 'sev3', label: 'Minor / SEV-3' },
              { value: 'low', label: 'Low' },
            ],
            onChange: (val) => {
              setSeverityFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'incident-status-filter',
            label: 'Status',
            value: statusFilter,
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'open', label: 'Open' },
              { value: 'investigating', label: 'Investigating' },
              { value: 'mitigating', label: 'Mitigating' },
              { value: 'resolved', label: 'Resolved' },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'incident-sort-filter',
            label: 'Sort By',
            value: sortKey,
            options: [
              { value: 'latestUpdateAt', label: 'Latest Update' },
              { value: 'firstSeenAt', label: 'First Detected' },
              { value: 'severity', label: 'Severity' },
              { value: 'status', label: 'Status' },
              { value: 'title', label: 'Title' },
            ],
            onChange: (val) => setSortKey(val as IncidentSortKey),
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setSeverityFilter('all');
          setStatusFilter('all');
          setCurrentPage(1);
        }}
        actions={
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
            }
            leftIcon={
              sortDirection === 'asc' ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )
            }
          >
            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          </Button>
        }
      />

      {/* Incidents Table / States */}
      {incidentsQuery.isFetching ? (
        <LoadingState
          title="Loading incident records"
          description="Querying GET /api/v1/incidents..."
          rows={4}
        />
      ) : incidentsQuery.isError && incidentsQuery.error?.isUnavailable ? (
        <UnavailableState
          title="Incident Management API Unavailable"
          description="Endpoint GET /api/v1/incidents did not respond. No mock or fabricated incidents are generated."
          endpoint="/api/v1/incidents"
          onRetry={() => void incidentsQuery.refetch()}
        />
      ) : incidentsQuery.isError ? (
        <ErrorState
          title="Failed to load incidents"
          message={incidentsQuery.error?.message ?? 'Error fetching incidents'}
          statusCode={incidentsQuery.error?.status}
          endpoint="/api/v1/incidents"
          onRetry={() => void incidentsQuery.refetch()}
        />
      ) : paginatedIncidents.length === 0 ? (
        <EmptyState
          title="No incidents found"
          description="Zero incidents matched the current filter criteria and evaluation window."
          endpoint="/api/v1/incidents"
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setSeverityFilter('all');
            setStatusFilter('all');
            setCurrentPage(1);
          }}
        />
      ) : (
        <Card variant="ivory">
          <DataTable
            caption="Incident management table"
            columns={[
              {
                key: 'id',
                header: 'Incident ID',
                mono: true,
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  return (
                    <button
                      type="button"
                      onClick={() => handleOpenIncidentDetail(inc.id)}
                      className="font-mono text-xs font-semibold text-burgundy hover:underline"
                    >
                      {inc.id}
                    </button>
                  );
                },
              },
              {
                key: 'title',
                header: 'Title / Failure Summary',
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  return (
                    <div className="max-w-md whitespace-normal">
                      <div className="font-semibold text-ink-primary">{inc.title}</div>
                      {inc.summary && (
                        <p className="text-[11px] text-ink-secondary line-clamp-1">
                          {inc.summary}
                        </p>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'severity',
                header: 'Severity',
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  return (
                    <Badge variant={severityToBadgeVariant(inc.severity)} dot>
                      {inc.severity.toUpperCase()}
                    </Badge>
                  );
                },
              },
              {
                key: 'status',
                header: 'Status',
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  return (
                    <Badge variant={statusToBadgeVariant(inc.status)}>
                      {inc.status.toUpperCase()}
                    </Badge>
                  );
                },
              },
              {
                key: 'affectedJourneyName',
                header: 'Affected Journey & Service',
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  return (
                    <div className="text-xs">
                      <div className="font-medium text-ink-primary">
                        {inc.affectedJourneyName ?? inc.affectedJourneyId ?? '—'}
                      </div>
                      <div className="text-[11px] text-ink-secondary">
                        {inc.affectedServiceName ?? inc.affectedServiceId ?? ''}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'firstSeenAt',
                header: 'First Detected',
                mono: true,
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  return (
                    <div className="text-xs">
                      <div>{inc.firstSeenAt}</div>
                      <div className="text-[10px] text-ink-secondary">
                        Upd: {inc.latestUpdateAt}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'associatedExecutionId',
                header: 'Execution',
                mono: true,
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  if (!inc.associatedExecutionId) {
                    return <span className="text-ink-secondary">—</span>;
                  }
                  return (
                    <Link
                      to={`/monitoring/executions?executionId=${encodeURIComponent(
                        inc.associatedExecutionId
                      )}`}
                      className="text-burgundy hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MonoCode>{inc.associatedExecutionId}</MonoCode>
                    </Link>
                  );
                },
              },
              {
                key: 'assignedOwner',
                header: 'Owner',
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  return (
                    <span className="text-xs text-ink-secondary">
                      {inc.assignedOwner ?? 'Unassigned'}
                    </span>
                  );
                },
              },
              {
                key: 'actions',
                header: 'Inspect',
                align: 'right',
                sortable: false,
                render: (row) => {
                  const inc = row as unknown as IncidentRecordItem;
                  return (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenIncidentDetail(inc.id);
                      }}
                      rightIcon={<ArrowRight className="w-3 h-3" />}
                    >
                      Triage
                    </Button>
                  );
                },
              },
            ]}
            data={paginatedIncidents as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => handleOpenIncidentDetail(String(row.id))}
          />

          {/* Pagination Footer */}
          <CardFooter>
            <div className="flex items-center gap-2">
              <span>
                Showing {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredAndSortedIncidents.length)} of{' '}
                {filteredAndSortedIncidents.length} incident(s)
              </span>
              <Select
                aria-label="Incidents per page"
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                options={[
                  { value: '10', label: '10 / page' },
                  { value: '25', label: '25 / page' },
                  { value: '50', label: '50 / page' },
                ]}
              />
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};
