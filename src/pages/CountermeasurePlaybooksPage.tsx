import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Layers,
  Lock,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import type { SemanticStatus } from '../styles/tokens';
import {
  type ApprovalRequirementLevel,
  type BlastRadiusTier,
  type CountermeasurePlaybookItem,
  type RecoveryExecutionLifecycle,
  useExecutePlaybookMutation,
  usePlaybookDetailQuery,
  usePlaybooksListQuery,
} from '../api/recovery';
import { useIncidentsListQuery } from '../api/incidentsAndRca';
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
  Input,
  LoadingState,
  MonoCode,
  Select,
  Textarea,
  UnavailableState,
} from '../components/ui';

export function approvalLevelToBadge(level: ApprovalRequirementLevel) {
  switch (level) {
    case 'dual_operator':
      return <Badge variant="critical">Dual Operator Required</Badge>;
    case 'lead_operator':
      return <Badge variant="warning">Lead Operator Approval</Badge>;
    case 'manual_quorum':
      return <Badge variant="info">Manual Quorum</Badge>;
    case 'automated_preapproved':
    default:
      return <Badge variant="healthy">Automated Pre-Approved</Badge>;
  }
}

export function blastRadiusToBadge(radius: BlastRadiusTier) {
  switch (radius) {
    case 'high':
      return <Badge variant="critical">High Blast Radius</Badge>;
    case 'medium':
      return <Badge variant="warning">Moderate Blast Radius</Badge>;
    case 'low':
    default:
      return <Badge variant="healthy">Low Blast Radius</Badge>;
  }
}

export function outcomeToBadgeVariant(outcome: RecoveryExecutionLifecycle | null): SemanticStatus {
  if (!outcome) return 'neutral';
  switch (outcome) {
    case 'verified':
      return 'healthy';
    case 'in_progress':
      return 'info';
    case 'rolled_back':
    case 'failed':
      return 'critical';
    case 'pending_approval':
      return 'warning';
    default:
      return 'neutral';
  }
}

export const CountermeasurePlaybooksPage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPlaybookId = searchParams.get('playbookId');

  const [searchQuery, setSearchQuery] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<string>('all');
  const [blastFilter, setBlastFilter] = useState<string>('all');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Execution Initiation Confirmation Modal state
  const [executionModalPlaybook, setExecutionModalPlaybook] =
    useState<CountermeasurePlaybookItem | null>(null);
  const [targetIncidentId, setTargetIncidentId] = useState('');
  const [executionReason, setExecutionReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const playbooksQuery = usePlaybooksListQuery(timeRange);
  const playbookDetailQuery = usePlaybookDetailQuery(selectedPlaybookId, timeRange);
  const incidentsQuery = useIncidentsListQuery(timeRange);
  const executeMutation = useExecutePlaybookMutation();

  const playbooks = playbooksQuery.data ?? [];

  const filteredPlaybooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = playbooks.filter((pb) => {
      const matchesSearch =
        !q ||
        pb.id.toLowerCase().includes(q) ||
        pb.name.toLowerCase().includes(q) ||
        pb.purpose.toLowerCase().includes(q) ||
        (pb.associatedPatternName?.toLowerCase().includes(q) ?? false);

      const matchesApproval =
        approvalFilter === 'all' || pb.approvalLevel === approvalFilter;
      const matchesBlast = blastFilter === 'all' || pb.blastRadius === blastFilter;

      return matchesSearch && matchesApproval && matchesBlast;
    });

    return [...filtered].sort((a, b) => {
      const cmp = a.name.localeCompare(b.name);
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [playbooks, searchQuery, approvalFilter, blastFilter, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredPlaybooks.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPlaybooks = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredPlaybooks.slice(start, start + pageSize);
  }, [filteredPlaybooks, safePage, pageSize]);

  const handleOpenDetail = (id: string) => {
    setSearchParams({ playbookId: id });
  };

  const handleCloseDetail = () => {
    setSearchParams({});
  };

  const fallbackPlaybook = useMemo(
    () => playbooks.find((pb) => pb.id === selectedPlaybookId) ?? null,
    [playbooks, selectedPlaybookId]
  );

  const displayPlaybook = playbookDetailQuery.data ?? fallbackPlaybook;

  const handleOpenExecutionModal = (pb: CountermeasurePlaybookItem) => {
    setExecutionModalPlaybook(pb);
    const activeInc = (incidentsQuery.data ?? []).find((i) => i.status !== 'resolved');
    setTargetIncidentId(activeInc?.id ?? '');
    setExecutionReason(`Remediation for incident using ${pb.name}`);
    setIdempotencyKey(`rec-${pb.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    executeMutation.reset();
  };

  const handleConfirmExecution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!executionModalPlaybook || executeMutation.isPending) return;

    executeMutation.mutate({
      playbookId: executionModalPlaybook.id,
      incidentId: targetIncidentId.trim() || 'INC-MANUAL-RECOVERY',
      idempotencyKey,
      reason: executionReason,
    });
  };

  // =========================================================================
  // PLAYBOOK DETAILS VIEW (?playbookId=...)
  // =========================================================================
  if (selectedPlaybookId) {
    return (
      <div className="space-y-5">
        {/* Header & Back Button */}
        <Card variant="ivory">
          <CardHeader
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseDetail}
                  leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                >
                  All Playbooks
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={playbookDetailQuery.isFetching}
                  onClick={() => void playbookDetailQuery.refetch()}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Refresh
                </Button>
                {displayPlaybook && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!displayPlaybook.enabled}
                    onClick={() => handleOpenExecutionModal(displayPlaybook)}
                    leftIcon={<Play className="w-3.5 h-3.5" />}
                  >
                    Initiate Recovery Workflow
                  </Button>
                )}
              </div>
            }
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
                <Layers className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle>
                    {displayPlaybook?.name ?? `Playbook ${selectedPlaybookId}`}
                  </CardTitle>
                  <MonoCode>{selectedPlaybookId}</MonoCode>
                  {displayPlaybook && approvalLevelToBadge(displayPlaybook.approvalLevel)}
                  {displayPlaybook && blastRadiusToBadge(displayPlaybook.blastRadius)}
                </div>
                <CardDescription>
                  {displayPlaybook?.purpose ??
                    'Pre-approved automated and semi-automated countermeasure workflow with bounded safeguards.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          {displayPlaybook && (
            <div className="px-4 py-3 bg-surface-cream/60 border-t border-border-warm grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-ink-secondary block">Domain Category</span>
                <span className="font-semibold text-ink-primary">
                  {displayPlaybook.category}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">
                  Associated Pattern / Trigger
                </span>
                <span className="font-mono text-ink-primary">
                  {displayPlaybook.associatedPatternName ??
                    displayPlaybook.associatedPatternId ??
                    displayPlaybook.triggerCondition ??
                    'Manual On-Call Trigger'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Last Execution</span>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <Badge variant={outcomeToBadgeVariant(displayPlaybook.lastOutcome ?? null)}>
                    {(displayPlaybook.lastOutcome ?? 'Never').toUpperCase()}
                  </Badge>
                  {displayPlaybook.lastExecutedAt && (
                    <span className="font-mono text-[11px] text-ink-secondary">
                      {displayPlaybook.lastExecutedAt}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Status</span>
                <div className="mt-0.5">
                  <Badge variant={displayPlaybook.enabled ? 'healthy' : 'neutral'}>
                    {displayPlaybook.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </Card>

        {playbookDetailQuery.isFetching && !displayPlaybook ? (
          <LoadingState
            title="Loading countermeasure playbook configuration"
            description={`Querying GET /api/v1/recovery/playbooks/${selectedPlaybookId}...`}
            rows={4}
          />
        ) : playbookDetailQuery.isError &&
          playbookDetailQuery.error?.isUnavailable &&
          !displayPlaybook ? (
          <UnavailableState
            title="Playbook Detail API Unavailable"
            description={`Endpoint GET /api/v1/recovery/playbooks/${selectedPlaybookId} did not respond.`}
            endpoint={`/api/v1/recovery/playbooks/${selectedPlaybookId}`}
            onRetry={() => void playbookDetailQuery.refetch()}
          />
        ) : playbookDetailQuery.isError && !displayPlaybook ? (
          <ErrorState
            title="Failed to load playbook details"
            message={playbookDetailQuery.error?.message ?? 'Error fetching playbook'}
            statusCode={playbookDetailQuery.error?.status}
            endpoint={`/api/v1/recovery/playbooks/${selectedPlaybookId}`}
            onRetry={() => void playbookDetailQuery.refetch()}
          />
        ) : (
          <>
            {/* Configured Steps in Execution Order */}
            <Card variant="ivory">
              <CardHeader
                actions={
                  <Badge variant="neutral" mono>
                    {displayPlaybook?.steps.length ?? 0} Bounded Step(s)
                  </Badge>
                }
              >
                <CardTitle>Configured Remediation Steps in Execution Order</CardTitle>
                <CardDescription>
                  Actions are restricted to pre-approved allowlisted codes. Continuum never executes
                  arbitrary user-supplied scripts or shell commands.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(displayPlaybook?.steps.length ?? 0) === 0 ? (
                  <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                    No individual step configurations were returned for this playbook.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayPlaybook!.steps.map((st) => (
                      <div
                        key={st.id}
                        className="p-3.5 rounded-md bg-surface-cream/60 border border-border-warm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded bg-burgundy text-surface-ivory font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                            {st.order}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink-primary">{st.name}</span>
                              <Badge variant="burgundy" mono>
                                {st.actionCode}
                              </Badge>
                            </div>
                            {st.description && (
                              <p className="text-ink-secondary mt-0.5">{st.description}</p>
                            )}
                            <div className="mt-1 flex items-center gap-3 text-[11px] font-mono text-ink-secondary">
                              <span>Scope: {st.targetScope}</span>
                              <span>Timeout: {st.timeoutSeconds}s</span>
                            </div>
                          </div>
                        </div>

                        {st.rollbackActionCode && (
                          <div className="shrink-0 text-right">
                            <span className="text-[10px] uppercase text-ink-secondary block">
                              Automated Rollback Hook
                            </span>
                            <Badge variant="neutral" mono>
                              {st.rollbackActionCode}
                            </Badge>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Preconditions & Post-Recovery Verification Procedure */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card variant="ivory">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-status-healthy" />
                    <CardTitle>Safety Preconditions &amp; Entry Gates</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {(displayPlaybook?.preconditions.length ?? 0) === 0 ? (
                    <p className="text-ink-secondary">
                      Standard platform safety checks enforced (active telemetry link required).
                    </p>
                  ) : (
                    displayPlaybook!.preconditions.map((p) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded bg-surface-cream/60 border border-border-warm flex items-start justify-between gap-2"
                      >
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-status-healthy shrink-0 mt-0.5" />
                          <span className="text-ink-primary">{p.criterion}</span>
                        </div>
                        {p.isRequired && (
                          <Badge variant="critical" mono>
                            Required
                          </Badge>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card variant="ivory">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-status-healthy" />
                    <CardTitle>Post-Recovery Synthetic Verification Plan</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="p-3 rounded-md bg-surface-cream/60 border border-border-warm space-y-1.5 leading-relaxed">
                    <span className="font-semibold text-ink-primary block">
                      Verification Procedure:
                    </span>
                    <p className="text-ink-secondary">
                      {displayPlaybook?.verificationProcedure}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Initiate Recovery Confirmation Dialog */}
        <Dialog
          open={Boolean(executionModalPlaybook)}
          onClose={() => setExecutionModalPlaybook(null)}
          title={`Initiate Countermeasure: ${executionModalPlaybook?.name ?? ''}`}
          description="Confirm execution of this bounded recovery workflow. Dual approval or lead approval will be enforced as configured."
          size="md"
          footer={
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={executeMutation.isPending}
                onClick={() => setExecutionModalPlaybook(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={executeMutation.isPending}
                onClick={handleConfirmExecution}
                leftIcon={<Play className="w-3.5 h-3.5" />}
              >
                Confirm &amp; Dispatch Recovery
              </Button>
            </>
          }
        >
          <form onSubmit={handleConfirmExecution} className="space-y-4">
            <div className="p-3 rounded-md bg-surface-cream border border-border-warm text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Selected Playbook:</span>
                <span className="font-semibold text-ink-primary">
                  {executionModalPlaybook?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Approval Gate:</span>
                {executionModalPlaybook && approvalLevelToBadge(executionModalPlaybook.approvalLevel)}
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Idempotency Guard:</span>
                <MonoCode>{idempotencyKey}</MonoCode>
              </div>
            </div>

            <FormField
              label="Associated Incident ID"
              htmlFor="target-incident-id"
              helperText="Link to an active reliability incident for auditing."
            >
              <Input
                id="target-incident-id"
                value={targetIncidentId}
                onChange={(e) => setTargetIncidentId(e.target.value)}
                placeholder="e.g. INC-1042"
              />
            </FormField>

            <FormField
              label="Remediation Justification &amp; Notes"
              htmlFor="execution-reason"
              required
              helperText="Audited justification recorded in the recovery timeline."
            >
              <Textarea
                id="execution-reason"
                rows={2}
                value={executionReason}
                onChange={(e) => setExecutionReason(e.target.value)}
                placeholder="Reason for triggering recovery countermeasure..."
              />
            </FormField>

            {executeMutation.isSuccess && (
              <div
                role="status"
                className="p-3 rounded-md bg-status-healthy/10 border border-status-healthy/30 text-xs space-y-1"
              >
                <div className="flex items-center gap-1.5 font-semibold text-status-healthy">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Recovery Workflow Initiated</span>
                </div>
                <p className="text-ink-secondary">
                  Action run ID: <MonoCode>{executeMutation.data?.executionId}</MonoCode>
                </p>
                <div className="pt-1">
                  <Link
                    to="/recovery/executions"
                    className="text-burgundy hover:underline font-semibold"
                  >
                    View in Recovery Executions Ledger &rarr;
                  </Link>
                </div>
              </div>
            )}

            {executeMutation.isError && (
              <div
                role="alert"
                className="p-3 rounded-md bg-status-critical/10 border border-status-critical/30 text-xs space-y-1"
              >
                <div className="flex items-center gap-1.5 font-semibold text-status-critical">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Recovery Request Failed or Rejected</span>
                </div>
                <p className="text-ink-secondary">{executeMutation.error?.message}</p>
              </div>
            )}
          </form>
        </Dialog>
      </div>
    );
  }

  // =========================================================================
  // PLAYBOOKS LIST VIEW
  // =========================================================================
  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/recovery/executions">
                <Button variant="outline" size="sm">
                  Recovery Executions
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
                isLoading={playbooksQuery.isFetching}
                onClick={() => void playbooksQuery.refetch()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Playbooks
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
                <CardTitle>Countermeasure Playbooks</CardTitle>
                <MonoCode>GET /api/v1/recovery/playbooks</MonoCode>
              </div>
              <CardDescription>
                Auditable, pre-validated automated and semi-automated remediation workflows with
                strict blast-radius guardrails, approval gates, and payment-safety constraints.
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
        searchPlaceholder="Filter playbooks by name, purpose, or pattern..."
        filters={[
          {
            id: 'playbook-approval-filter',
            label: 'Approval Gate',
            value: approvalFilter,
            options: [
              { value: 'all', label: 'All Approval Levels' },
              { value: 'automated_preapproved', label: 'Automated Pre-Approved' },
              { value: 'lead_operator', label: 'Lead Operator' },
              { value: 'dual_operator', label: 'Dual Operator' },
            ],
            onChange: (val) => {
              setApprovalFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'playbook-blast-filter',
            label: 'Blast Radius',
            value: blastFilter,
            options: [
              { value: 'all', label: 'All Blast Radii' },
              { value: 'low', label: 'Low Impact' },
              { value: 'medium', label: 'Moderate Impact' },
              { value: 'high', label: 'High Impact' },
            ],
            onChange: (val) => {
              setBlastFilter(val);
              setCurrentPage(1);
            },
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setApprovalFilter('all');
          setBlastFilter('all');
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
            {sortDirection === 'asc' ? 'A-Z' : 'Z-A'}
          </Button>
        }
      />

      {/* Playbooks Table / States */}
      {playbooksQuery.isFetching ? (
        <LoadingState
          title="Loading countermeasure playbooks"
          description="Querying GET /api/v1/recovery/playbooks..."
          rows={4}
        />
      ) : playbooksQuery.isError && playbooksQuery.error?.isUnavailable ? (
        <UnavailableState
          title="Countermeasure Playbooks API Unavailable"
          description="Endpoint GET /api/v1/recovery/playbooks is unreachable. No unverified playbooks are displayed."
          endpoint="/api/v1/recovery/playbooks"
          onRetry={() => void playbooksQuery.refetch()}
        />
      ) : playbooksQuery.isError ? (
        <ErrorState
          title="Failed to load playbooks"
          message={playbooksQuery.error?.message ?? 'Error fetching playbooks'}
          statusCode={playbooksQuery.error?.status}
          endpoint="/api/v1/recovery/playbooks"
          onRetry={() => void playbooksQuery.refetch()}
        />
      ) : paginatedPlaybooks.length === 0 ? (
        <EmptyState
          title="No countermeasure playbooks found"
          description="Zero playbooks matched the current filter criteria."
          endpoint="/api/v1/recovery/playbooks"
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setApprovalFilter('all');
            setBlastFilter('all');
          }}
        />
      ) : (
        <Card variant="ivory">
          <DataTable
            caption="Countermeasure playbooks table"
            columns={[
              {
                key: 'name',
                header: 'Playbook Name & Purpose',
                render: (row) => {
                  const pb = row as unknown as CountermeasurePlaybookItem;
                  return (
                    <div className="max-w-md whitespace-normal">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(pb.id)}
                        className="font-semibold text-burgundy hover:underline text-left block"
                      >
                        {pb.name}
                      </button>
                      <p className="text-[11px] text-ink-secondary mt-0.5 line-clamp-1">
                        {pb.purpose}
                      </p>
                    </div>
                  );
                },
              },
              {
                key: 'approvalLevel',
                header: 'Required Approval',
                render: (row) => {
                  const pb = row as unknown as CountermeasurePlaybookItem;
                  return approvalLevelToBadge(pb.approvalLevel);
                },
              },
              {
                key: 'blastRadius',
                header: 'Blast Radius',
                render: (row) => {
                  const pb = row as unknown as CountermeasurePlaybookItem;
                  return blastRadiusToBadge(pb.blastRadius);
                },
              },
              {
                key: 'allowedActions',
                header: 'Allowed Actions',
                render: (row) => {
                  const pb = row as unknown as CountermeasurePlaybookItem;
                  return (
                    <div className="flex items-center gap-1 flex-wrap">
                      {pb.allowedActions.slice(0, 2).map((act) => (
                        <MonoCode key={act} className="text-[10px]">
                          {act}
                        </MonoCode>
                      ))}
                      {pb.allowedActions.length > 2 && (
                        <span className="text-[10px] text-ink-secondary">
                          +{pb.allowedActions.length - 2}
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'lastOutcome',
                header: 'Last Outcome',
                render: (row) => {
                  const pb = row as unknown as CountermeasurePlaybookItem;
                  return (
                    <Badge variant={outcomeToBadgeVariant(pb.lastOutcome ?? null)}>
                      {(pb.lastOutcome ?? 'Never').toUpperCase()}
                    </Badge>
                  );
                },
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                sortable: false,
                render: (row) => {
                  const pb = row as unknown as CountermeasurePlaybookItem;
                  return (
                    <div
                      className="inline-flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleOpenDetail(pb.id)}
                      >
                        Inspect
                      </Button>
                      <Button
                        variant="primary"
                        size="xs"
                        disabled={!pb.enabled}
                        onClick={() => handleOpenExecutionModal(pb)}
                        leftIcon={<Play className="w-3 h-3" />}
                      >
                        Run
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            data={paginatedPlaybooks as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => handleOpenDetail(String(row.id))}
          />

          <CardFooter>
            <div className="flex items-center gap-2">
              <span>
                Showing {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredPlaybooks.length)} of{' '}
                {filteredPlaybooks.length} playbook(s)
              </span>
              <Select
                aria-label="Playbooks per page"
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

      {/* Payment Safety & Bounded Action Notice */}
      <Card variant="subtle" padding="sm">
        <div className="flex items-start gap-2.5 text-xs text-ink-secondary leading-relaxed">
          <Lock className="w-4 h-4 text-burgundy shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-ink-primary">
              Remediation Guardrail Policy:
            </span>{' '}
            Continuum restricts countermeasure execution to authorized backend endpoints and
            strictly bounded action allowlists. Arbitrary commands, scripts, or user-supplied shell
            commands are strictly prevented. In-flight payment authorizations are protected by
            idempotency tokens and zero-double-charge policies.
          </div>
        </div>
      </Card>
    </div>
  );
};
