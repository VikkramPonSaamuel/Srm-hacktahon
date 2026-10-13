import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import {
  type RecoveryExecutionLifecycle,
  type RecoveryExecutionRecord,
  useRecoveryExecutionDetailQuery,
  useRecoveryExecutionsQuery,
} from '../api/recovery';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  MonoCode,
  Select,
  UnavailableState,
} from '../components/ui';

export function recoveryStatusToBadge(status: RecoveryExecutionLifecycle) {
  switch (status) {
    case 'verified':
      return <Badge variant="healthy" dot>Verified &amp; Restored</Badge>;
    case 'in_progress':
      return <Badge variant="info" dot>Executing Steps</Badge>;
    case 'rolled_back':
      return <Badge variant="critical" dot>Rolled Back</Badge>;
    case 'failed':
      return <Badge variant="critical" dot>Countermeasure Failed</Badge>;
    case 'pending_approval':
      return <Badge variant="warning" dot>Awaiting Authorization</Badge>;
    case 'cancelled':
    default:
      return <Badge variant="neutral">Cancelled</Badge>;
  }
}

type RecoverySortKey = 'startedAt' | 'durationMs' | 'status' | 'playbookName';

export const RecoveryExecutionsPage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeExecutionIdParam = searchParams.get('actionRunId');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<RecoverySortKey>('startedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedExecutionRow, setSelectedExecutionRow] =
    useState<RecoveryExecutionRecord | null>(null);

  const executionsQuery = useRecoveryExecutionsQuery(timeRange);
  const executionDetailQuery = useRecoveryExecutionDetailQuery(activeExecutionIdParam);

  const executions = executionsQuery.data ?? [];

  const filteredAndSortedExecutions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = executions.filter((e) => {
      const matchesSearch =
        !q ||
        e.id.toLowerCase().includes(q) ||
        e.incidentId.toLowerCase().includes(q) ||
        e.playbookName.toLowerCase().includes(q) ||
        (e.initiatedBy?.toLowerCase().includes(q) ?? false);

      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'startedAt') {
        cmp = a.startedAt.localeCompare(b.startedAt);
      } else if (sortKey === 'durationMs') {
        cmp = (a.durationMs ?? -1) - (b.durationMs ?? -1);
      } else if (sortKey === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortKey === 'playbookName') {
        cmp = a.playbookName.localeCompare(b.playbookName);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [executions, searchQuery, statusFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedExecutions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedExecutions = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedExecutions.slice(start, start + pageSize);
  }, [filteredAndSortedExecutions, safePage, pageSize]);

  const handleInspect = (record: RecoveryExecutionRecord) => {
    setSelectedExecutionRow(record);
    const next = new URLSearchParams(searchParams);
    next.set('actionRunId', record.id);
    setSearchParams(next);
  };

  const handleCloseModal = () => {
    setSelectedExecutionRow(null);
    const next = new URLSearchParams(searchParams);
    next.delete('actionRunId');
    setSearchParams(next);
  };

  const activeRecord =
    executionDetailQuery.data ??
    selectedExecutionRow ??
    executions.find((e) => e.id === activeExecutionIdParam) ??
    null;

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/recovery/playbooks">
                <Button variant="outline" size="sm">
                  Configured Playbooks
                </Button>
              </Link>
              <Link to="/recovery/approvals">
                <Button variant="outline" size="sm">
                  Approval Queue
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                isLoading={executionsQuery.isFetching}
                onClick={() => void executionsQuery.refetch()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Executions
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
              <Layers className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Recovery Executions Ledger</CardTitle>
                <MonoCode>GET /api/v1/recovery/executions</MonoCode>
              </div>
              <CardDescription>
                Auditable execution records of triggered countermeasures, step-by-step audit
                traces, post-action synthetic probe verifications, and payment-safety reconciliations.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setCurrentPage(1);
        }}
        searchPlaceholder="Filter recovery runs by ID, incident, playbook, or initiator..."
        filters={[
          {
            id: 'recovery-status-filter',
            label: 'Lifecycle State',
            value: statusFilter,
            options: [
              { value: 'all', label: 'All States' },
              { value: 'verified', label: 'Verified & Restored' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'rolled_back', label: 'Rolled Back' },
              { value: 'failed', label: 'Failed' },
              { value: 'pending_approval', label: 'Awaiting Authorization' },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'recovery-sort-filter',
            label: 'Sort By',
            value: sortKey,
            options: [
              { value: 'startedAt', label: 'Started Time' },
              { value: 'durationMs', label: 'Duration' },
              { value: 'status', label: 'Status' },
              { value: 'playbookName', label: 'Playbook' },
            ],
            onChange: (val) => setSortKey(val as RecoverySortKey),
          },
        ]}
        onReset={() => {
          setSearchQuery('');
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
            {sortDirection === 'asc' ? 'Oldest' : 'Newest'}
          </Button>
        }
      />

      {/* Executions Table & States */}
      {executionsQuery.isFetching ? (
        <LoadingState
          title="Loading recovery execution records"
          description="Querying GET /api/v1/recovery/executions..."
          rows={4}
        />
      ) : executionsQuery.isError && executionsQuery.error?.isUnavailable ? (
        <UnavailableState
          title="Recovery Executions API Unavailable"
          description="Endpoint GET /api/v1/recovery/executions is not responding. No unverified recovery actions are fabricated."
          endpoint="/api/v1/recovery/executions"
          onRetry={() => void executionsQuery.refetch()}
        />
      ) : executionsQuery.isError ? (
        <ErrorState
          title="Failed to load recovery executions"
          message={executionsQuery.error?.message ?? 'Error fetching executions'}
          statusCode={executionsQuery.error?.status}
          endpoint="/api/v1/recovery/executions"
          onRetry={() => void executionsQuery.refetch()}
        />
      ) : paginatedExecutions.length === 0 ? (
        <EmptyState
          title="No recovery execution records found"
          description="Zero countermeasure executions matched the current filter scope."
          endpoint="/api/v1/recovery/executions"
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setStatusFilter('all');
            setCurrentPage(1);
          }}
        />
      ) : (
        <Card variant="ivory">
          <DataTable
            caption="Recovery executions table"
            columns={[
              {
                key: 'id',
                header: 'Action Run ID',
                mono: true,
                render: (row) => <MonoCode>{String(row.id)}</MonoCode>,
              },
              {
                key: 'playbookName',
                header: 'Playbook Executed',
                render: (row) => {
                  const r = row as unknown as RecoveryExecutionRecord;
                  return (
                    <div className="font-semibold text-ink-primary">
                      {r.playbookName}
                    </div>
                  );
                },
              },
              {
                key: 'incidentId',
                header: 'Related Incident',
                render: (row) => {
                  const r = row as unknown as RecoveryExecutionRecord;
                  if (!r.incidentId || r.incidentId === '—') {
                    return <span className="text-ink-secondary">—</span>;
                  }
                  return (
                    <Link
                      to={`/intelligence/incidents?incidentId=${encodeURIComponent(r.incidentId)}`}
                      className="text-burgundy hover:underline font-mono text-xs font-semibold"
                    >
                      {r.incidentId}
                    </Link>
                  );
                },
              },
              {
                key: 'status',
                header: 'Current State',
                render: (row) => {
                  const r = row as unknown as RecoveryExecutionRecord;
                  return recoveryStatusToBadge(r.status);
                },
              },
              {
                key: 'startedAt',
                header: 'Started & Duration',
                mono: true,
                render: (row) => {
                  const r = row as unknown as RecoveryExecutionRecord;
                  return (
                    <div>
                      <div>{r.startedAt}</div>
                      <div className="text-[10px] text-ink-secondary">
                        {typeof r.durationMs === 'number'
                          ? `Elapsed: ${Math.round(r.durationMs)} ms`
                          : ''}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'verificationResults',
                header: 'Verification Result',
                render: (row) => {
                  const r = row as unknown as RecoveryExecutionRecord;
                  return (
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          r.verificationResults.status === 'passed'
                            ? 'healthy'
                            : r.verificationResults.status === 'pending'
                              ? 'info'
                              : 'critical'
                        }
                        dot
                      >
                        {r.verificationResults.status.toUpperCase()}
                      </Badge>
                      {r.verificationResults.measuredSloMetric && (
                        <span className="font-mono text-[11px] text-ink-secondary">
                          {r.verificationResults.measuredSloMetric}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'actions',
                header: 'Audit Trace',
                align: 'right',
                sortable: false,
                render: (row) => {
                  const r = row as unknown as RecoveryExecutionRecord;
                  return (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInspect(r);
                      }}
                      leftIcon={<Eye className="w-3 h-3" />}
                    >
                      Inspect Timeline
                    </Button>
                  );
                },
              },
            ]}
            data={paginatedExecutions as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => handleInspect(row as unknown as RecoveryExecutionRecord)}
          />

          <CardFooter>
            <div className="flex items-center gap-2">
              <span>
                Showing {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredAndSortedExecutions.length)} of{' '}
                {filteredAndSortedExecutions.length} run(s)
              </span>
              <Select
                aria-label="Runs per page"
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

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="font-mono text-xs px-2">
                Page {safePage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* Auditable Recovery Timeline Inspector Modal */}
      <Dialog
        open={Boolean(activeExecutionIdParam || selectedExecutionRow)}
        onClose={handleCloseModal}
        title={
          activeRecord
            ? `Recovery Audit Timeline — ${activeRecord.id}`
            : 'Recovery Execution Trace'
        }
        description="Audited sequence of executed actions, step-level outputs, post-recovery SLO probe verification, and payment-safety reconciliations."
        size="xl"
        footer={
          <Button variant="secondary" size="sm" onClick={handleCloseModal}>
            Close Timeline
          </Button>
        }
      >
        {activeRecord && (
          <div className="space-y-4">
            {/* Metadata Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-lg bg-surface-cream border border-border-warm text-xs">
              <div>
                <span className="text-[11px] text-ink-secondary block">Run ID</span>
                <MonoCode>{activeRecord.id}</MonoCode>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Playbook</span>
                <span className="font-semibold text-ink-primary">
                  {activeRecord.playbookName}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Current State</span>
                <div className="mt-0.5">{recoveryStatusToBadge(activeRecord.status)}</div>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Initiated By</span>
                <span className="text-ink-primary font-medium">
                  {activeRecord.initiatedBy}
                </span>
              </div>
            </div>

            {/* Payment Safety Reconciliation Callout */}
            {activeRecord.paymentSafetyReconciliation && (
              <div className="p-3.5 rounded-md bg-surface-secondary/70 border border-border-warm space-y-1.5 text-xs text-ink-primary">
                <div className="flex items-center gap-2 font-semibold">
                  <Lock className="w-3.5 h-3.5 text-burgundy" />
                  <span>Payment Safety &amp; Reconciliation Guidance</span>
                  {activeRecord.paymentSafetyReconciliation.secondChargePrevented && (
                    <Badge variant="healthy" dot>
                      Zero Double-Charge Enforced
                    </Badge>
                  )}
                </div>
                <p className="text-ink-secondary leading-relaxed">
                  {activeRecord.paymentSafetyReconciliation.reconciliationGuidance}
                </p>
              </div>
            )}

            {/* Auditable Chronological Actions Performed */}
            <div className="space-y-2">
              <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                Actions Performed ({activeRecord.actionsPerformed.length})
              </h4>
              {activeRecord.actionsPerformed.length === 0 ? (
                <div className="p-3 rounded bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                  No individual action steps have finished yet.
                </div>
              ) : (
                <div className="border border-border-warm rounded-lg divide-y divide-border-warm bg-surface-ivory">
                  {activeRecord.actionsPerformed.map((step) => (
                    <div key={step.stepId} className="p-3 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-ink-secondary">#{step.order}</span>
                          <span className="font-semibold text-ink-primary">{step.name}</span>
                          <Badge variant="burgundy" mono>
                            {step.actionCode}
                          </Badge>
                          <Badge
                            variant={
                              step.status === 'succeeded'
                                ? 'healthy'
                                : step.status === 'rolled_back'
                                  ? 'warning'
                                  : 'critical'
                            }
                            dot
                          >
                            {step.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="font-mono text-[11px] text-ink-secondary">
                          {step.startedAt}
                          {typeof step.durationMs === 'number' && ` (${step.durationMs} ms)`}
                        </div>
                      </div>
                      {step.outputSummary && (
                        <div className="font-mono text-[11px] text-ink-secondary pl-6">
                          Output: {step.outputSummary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verification Results Panel */}
            <div className="p-3.5 rounded-lg bg-surface-cream border border-border-warm space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-ink-primary">
                  <ShieldCheck className="w-4 h-4 text-status-healthy" />
                  <span>Synthetic Probe SLO Verification</span>
                </div>
                <Badge
                  variant={
                    activeRecord.verificationResults.status === 'passed'
                      ? 'healthy'
                      : 'warning'
                  }
                  dot
                >
                  {activeRecord.verificationResults.status.toUpperCase()}
                </Badge>
              </div>

              {activeRecord.verificationResults.verificationNotes && (
                <p className="text-ink-secondary leading-relaxed">
                  {activeRecord.verificationResults.verificationNotes}
                </p>
              )}

              {activeRecord.failureOrEscalationDetails && (
                <div className="p-2.5 rounded bg-status-critical/10 border border-status-critical/25 font-mono text-[11px] text-status-critical">
                  Escalation Detail: {activeRecord.failureOrEscalationDetails}
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
