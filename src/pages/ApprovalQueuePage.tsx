import React, { useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import {
  type ApprovalRequestItem,
  type BlastRadiusTier,
  useApprovalQueueQuery,
  useReviewApprovalMutation,
} from '../api/recovery';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
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

export function approvalStatusToBadge(status: ApprovalRequestItem['status']) {
  switch (status) {
    case 'approved':
      return <Badge variant="healthy" dot>Approved</Badge>;
    case 'rejected':
      return <Badge variant="critical" dot>Rejected</Badge>;
    case 'expired':
      return <Badge variant="neutral">Expired TTL</Badge>;
    case 'pending':
    default:
      return <Badge variant="warning" dot>Pending Authorization</Badge>;
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

type ApprovalSortKey = 'requestedAt' | 'blastRadius' | 'status' | 'playbookName';

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `appr-${crypto.randomUUID()}`;
  }
  return `appr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const ApprovalQueuePage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeApprovalIdParam = searchParams.get('approvalId');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [blastFilter, setBlastFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<ApprovalSortKey>('requestedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Review Dialog state
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequestItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approve' | 'reject'>('approve');
  const [operatorNotes, setOperatorNotes] = useState('');
  const [confirmedSafetyGate, setConfirmedSafetyGate] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [reviewSubmissionError, setReviewSubmissionError] = useState<string | null>(null);

  const notesInputId = useId();
  const safetyCheckboxId = useId();
  const idempotencyInputId = useId();

  const approvalsQuery = useApprovalQueueQuery(timeRange);
  const reviewMutation = useReviewApprovalMutation();

  const approvals = approvalsQuery.data ?? [];

  // Synchronize URL param with modal
  React.useEffect(() => {
    if (activeApprovalIdParam && approvals.length > 0) {
      const found = approvals.find((a) => a.id === activeApprovalIdParam);
      if (found) {
        setSelectedRequest(found);
      }
    }
  }, [activeApprovalIdParam, approvals]);

  const handleOpenReview = (request: ApprovalRequestItem) => {
    setSelectedRequest(request);
    setReviewDecision('approve');
    setOperatorNotes('');
    setConfirmedSafetyGate(false);
    setIdempotencyKey(generateIdempotencyKey());
    setReviewSubmissionError(null);
    setSearchParams({ approvalId: request.id });
  };

  const handleCloseReview = () => {
    setSelectedRequest(null);
    setReviewSubmissionError(null);
    setSearchParams({});
  };

  const filteredAndSortedApprovals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = approvals.filter((item) => {
      const matchesSearch =
        !q ||
        item.id.toLowerCase().includes(q) ||
        item.incidentId.toLowerCase().includes(q) ||
        (item.incidentTitle?.toLowerCase().includes(q) ?? false) ||
        item.playbookName.toLowerCase().includes(q) ||
        (item.failurePattern?.toLowerCase().includes(q) ?? false) ||
        item.requestedBy.toLowerCase().includes(q) ||
        item.reason.toLowerCase().includes(q);

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesBlast = blastFilter === 'all' || item.blastRadius === blastFilter;

      return matchesSearch && matchesStatus && matchesBlast;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'requestedAt') {
        const tA = new Date(a.requestedAt).getTime();
        const tB = new Date(b.requestedAt).getTime();
        cmp = (Number.isNaN(tA) ? 0 : tA) - (Number.isNaN(tB) ? 0 : tB);
      } else if (sortKey === 'blastRadius') {
        const order: Record<BlastRadiusTier, number> = { high: 3, medium: 2, low: 1 };
        cmp = (order[a.blastRadius] ?? 0) - (order[b.blastRadius] ?? 0);
      } else if (sortKey === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortKey === 'playbookName') {
        cmp = a.playbookName.localeCompare(b.playbookName);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [approvals, searchQuery, statusFilter, blastFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedApprovals.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedApprovals = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedApprovals.slice(start, start + pageSize);
  }, [filteredAndSortedApprovals, safePage, pageSize]);

  // Key KPI metrics
  const pendingCount = useMemo(
    () => approvals.filter((a) => a.status === 'pending').length,
    [approvals]
  );
  const highBlastCount = useMemo(
    () => approvals.filter((a) => a.status === 'pending' && a.blastRadius === 'high').length,
    [approvals]
  );
  const approvedCount = useMemo(
    () => approvals.filter((a) => a.status === 'approved').length,
    [approvals]
  );
  const rejectedOrExpiredCount = useMemo(
    () => approvals.filter((a) => a.status === 'rejected' || a.status === 'expired').length,
    [approvals]
  );

  const handleSubmitDecision = async () => {
    if (!selectedRequest) return;
    if (reviewDecision === 'approve' && !confirmedSafetyGate) {
      setReviewSubmissionError('Operator confirmation checkbox is required to authorize execution.');
      return;
    }
    if (!operatorNotes.trim()) {
      setReviewSubmissionError('Operator notes and justification are mandatory for audit compliance.');
      return;
    }

    setReviewSubmissionError(null);

    try {
      await reviewMutation.mutateAsync({
        approvalId: selectedRequest.id,
        decision: reviewDecision,
        operatorNotes: operatorNotes.trim(),
        idempotencyKey: idempotencyKey.trim() || generateIdempotencyKey(),
      });
      handleCloseReview();
    } catch (err: unknown) {
      const errorMsg =
        (err as { detail?: string; message?: string })?.detail ||
        (err as { detail?: string; message?: string })?.message ||
        'The backend rejected the approval review submission.';
      setReviewSubmissionError(errorMsg);
    }
  };

  if (approvalsQuery.isLoading && !approvalsQuery.data) {
    return (
      <div className="space-y-6">
        <LoadingState
          title="Loading pending recovery approvals"
          description="Querying GET /api/v1/recovery/approvals..."
          rows={3}
        />
      </div>
    );
  }

  if (approvalsQuery.isError && !approvalsQuery.data) {
    const error = approvalsQuery.error;
    if (error?.isUnavailable || error?.status === 404) {
      return (
        <UnavailableState
          endpoint="/api/v1/recovery/approvals"
          title="Approval Queue Unavailable"
          description="The Continuum recovery approval service endpoint (/api/v1/recovery/approvals) is currently unreachable or unconfigured in this environment. Recovery actions remain guarded."
          onRetry={() => approvalsQuery.refetch()}
        />
      );
    }
    return (
      <ErrorState
        title="Failed to Load Approval Queue"
        message={error?.message || 'An unexpected error occurred while querying approval queue.'}
        onRetry={() => approvalsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-warm pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink-primary font-heading">
              Approval Queue
            </h1>
            <Badge variant={pendingCount > 0 ? 'warning' : 'healthy'} dot>
              {pendingCount} Pending Authorization
            </Badge>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Human-in-the-loop authorization gate for high-impact recovery actions, gateway failovers, and traffic routing.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/recovery/playbooks">
            <Button variant="secondary" size="sm">
              <Layers className="w-3.5 h-3.5 mr-1 text-ink-secondary" />
              Playbooks
            </Button>
          </Link>
          <Link to="/recovery/executions">
            <Button variant="secondary" size="sm">
              <RotateCcw className="w-3.5 h-3.5 mr-1 text-ink-secondary" />
              Execution Ledger
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => approvalsQuery.refetch()}
            disabled={approvalsQuery.isFetching}
          >
            <RefreshCw
              className={['w-3.5 h-3.5 mr-1 text-ink-secondary', approvalsQuery.isFetching ? 'animate-spin' : '']
                .filter(Boolean)
                .join(' ')}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Payment Safety & Operator Guardrails Banner */}
      <div className="rounded-lg border border-burgundy-accent/30 bg-surface-ivory p-4 shadow-sm flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-burgundy-primary shrink-0 mt-0.5" />
        <div className="text-xs text-ink-primary space-y-1">
          <div className="font-semibold text-burgundy-primary flex items-center gap-1.5">
            Strict Payment-Safety &amp; Dual-Operator Protection Guardrail
          </div>
          <p className="text-ink-secondary leading-relaxed">
            High blast-radius countermeasures (such as payment gateway traffic switching or automated circuit breaker trips)
            require explicit human-in-the-loop sign-off. Request timeouts must never be treated as failed payments. All authorization decisions
            generate signed, immutable audit records before dispatching backend remediation.
          </p>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Pending Authorization</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-ink-primary">
              {pendingCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-secondary">
            {pendingCount > 0 ? (
              <span className="text-status-warning font-medium">Requires immediate operator review</span>
            ) : (
              <span className="text-status-healthy font-medium">Queue clear — no actions blocked</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>High Blast Radius</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-ink-primary">
              {highBlastCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-secondary">
            {highBlastCount > 0 ? (
              <span className="text-status-critical font-medium">Dual-operator sign-off mandatory</span>
            ) : (
              <span>No critical blast-radius requests pending</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Approved in Window</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-ink-primary">
              {approvedCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-secondary">
            Countermeasures authorized and dispatched
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Rejected / Expired TTL</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-ink-primary">
              {rejectedOrExpiredCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-secondary">
            Blocked by safety gate or timed out
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setCurrentPage(1);
        }}
        searchPlaceholder="Search by request ID, incident, playbook, requester, or reason..."
        filters={[
          {
            id: 'status',
            label: 'Decision Status',
            value: statusFilter,
            onChange: (val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            },
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'pending', label: 'Pending Authorization' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'expired', label: 'Expired TTL' },
            ],
          },
          {
            id: 'blast',
            label: 'Blast Radius',
            value: blastFilter,
            onChange: (val) => {
              setBlastFilter(val);
              setCurrentPage(1);
            },
            options: [
              { value: 'all', label: 'All Blast Tiers' },
              { value: 'high', label: 'High Blast Radius' },
              { value: 'medium', label: 'Moderate Impact' },
              { value: 'low', label: 'Low Blast Radius' },
            ],
          },
        ]}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
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
        onReset={() => {
          setSearchQuery('');
          setStatusFilter('pending');
          setBlastFilter('all');
          setSortKey('requestedAt');
          setSortDirection('desc');
          setCurrentPage(1);
        }}
      />

      {/* Approvals Table */}
      {filteredAndSortedApprovals.length === 0 ? (
        <EmptyState
          title={
            statusFilter === 'pending'
              ? 'No Pending Approvals'
              : 'No Approval Requests Matching Criteria'
          }
          description={
            statusFilter === 'pending'
              ? 'All countermeasure requests have been reviewed or none are currently queued in this time window.'
              : 'Try clearing your search query or switching filters to view approved or historical requests.'
          }
          actionLabel={statusFilter !== 'all' ? 'View All Statuses' : undefined}
          onAction={statusFilter !== 'all' ? () => setStatusFilter('all') : undefined}
        />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            caption="Pending and Historical Recovery Approvals"
            columns={[
              {
                key: 'playbookName',
                header: 'Request & Playbook',
                sortable: true,
                render: (row) => {
                  const req = row as unknown as ApprovalRequestItem;
                  return (
                    <div className="space-y-0.5">
                      <div
                        className="font-medium text-ink-primary hover:text-burgundy-primary cursor-pointer flex items-center gap-1.5"
                        onClick={() => handleOpenReview(req)}
                      >
                        {req.playbookName}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
                        <MonoCode>{req.id}</MonoCode>
                        <span>•</span>
                        <span>{req.proposedActions.length} actions</span>
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'incidentId',
                header: 'Incident & Pattern',
                render: (row) => {
                  const req = row as unknown as ApprovalRequestItem;
                  return (
                    <div className="space-y-0.5">
                      <Link
                        to={`/intelligence/incidents?incidentId=${encodeURIComponent(req.incidentId)}`}
                        className="font-mono text-xs text-burgundy-primary hover:underline flex items-center gap-1"
                      >
                        {req.incidentId}
                        <ExternalLink className="w-3 h-3 text-burgundy-accent" />
                      </Link>
                      {req.failurePattern && (
                        <div className="text-[11px] text-ink-secondary truncate max-w-xs">
                          {req.failurePattern}
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'blastRadius',
                header: 'Blast Radius',
                sortable: true,
                render: (row) => {
                  const req = row as unknown as ApprovalRequestItem;
                  return blastRadiusToBadge(req.blastRadius);
                },
              },
              {
                key: 'status',
                header: 'Status',
                sortable: true,
                render: (row) => {
                  const req = row as unknown as ApprovalRequestItem;
                  return approvalStatusToBadge(req.status);
                },
              },
              {
                key: 'requestedBy',
                header: 'Requested By / At',
                render: (row) => {
                  const req = row as unknown as ApprovalRequestItem;
                  return (
                    <div className="space-y-0.5 text-xs">
                      <div className="font-medium text-ink-primary">{req.requestedBy}</div>
                      <div className="text-[11px] text-ink-secondary font-mono">
                        {req.requestedAt ? new Date(req.requestedAt).toLocaleString() : '—'}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'expiresAt',
                header: 'TTL Expiry',
                render: (row) => {
                  const req = row as unknown as ApprovalRequestItem;
                  return (
                    <div className="text-xs">
                      {req.expiresAt ? (
                        <span className="font-mono text-[11px] text-ink-secondary">
                          {new Date(req.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span className="text-ink-secondary text-[11px]">No TTL</span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'actions',
                header: 'Action',
                align: 'right',
                render: (row) => {
                  const req = row as unknown as ApprovalRequestItem;
                  return (
                    <div className="text-right">
                      <Button
                        size="sm"
                        variant={req.status === 'pending' ? 'primary' : 'secondary'}
                        onClick={() => handleOpenReview(req)}
                      >
                        {req.status === 'pending' ? (
                          <>
                            <UserCheck className="w-3 h-3 mr-1" />
                            Review &amp; Decide
                          </>
                        ) : (
                          <>Inspect Decision</>
                        )}
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            data={paginatedApprovals as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
          />

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border-warm bg-surface-ivory text-xs text-ink-secondary">
              <div>
                Showing page <span className="font-medium text-ink-primary">{safePage}</span> of{' '}
                <span className="font-medium text-ink-primary">{totalPages}</span> (
                {filteredAndSortedApprovals.length} total)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Review & Authorize Dialog */}
      {selectedRequest && (
        <Dialog
          open={Boolean(selectedRequest)}
          onClose={handleCloseReview}
          title={`Authorization Review: ${selectedRequest.id}`}
          description={`Pre-execution review gate for ${selectedRequest.playbookName} against incident ${selectedRequest.incidentId}.`}
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-xs text-ink-secondary">
                <Lock className="w-3.5 h-3.5 text-ink-secondary" />
                <span>All decisions are immutable and cryptographically audited</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleCloseReview}>
                  Cancel
                </Button>
                {selectedRequest.status === 'pending' && (
                  <Button
                    variant={reviewDecision === 'approve' ? 'primary' : 'critical'}
                    size="sm"
                    onClick={handleSubmitDecision}
                    disabled={reviewMutation.isPending}
                  >
                    {reviewMutation.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : reviewDecision === 'approve' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                    )}
                    {reviewDecision === 'approve' ? 'Authorize Execution' : 'Reject Request'}
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-6">
            {/* Top Badges & Context */}
            <div className="flex items-center justify-between flex-wrap gap-2 p-3 bg-surface-cream rounded-md border border-border-warm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-primary">Request Status:</span>
                {approvalStatusToBadge(selectedRequest.status)}
                {blastRadiusToBadge(selectedRequest.blastRadius)}
              </div>
              <div className="text-xs text-ink-secondary flex items-center gap-2">
                <span>Requested by <strong className="text-ink-primary">{selectedRequest.requestedBy}</strong></span>
                <span>•</span>
                <span className="font-mono">{new Date(selectedRequest.requestedAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Read-Only State Notice if Already Decided */}
            {selectedRequest.status !== 'pending' && (
              <div className="p-3 bg-surface-secondary/40 border border-border-warm rounded-md text-xs text-ink-secondary flex items-center gap-2">
                <Lock className="w-4 h-4 text-ink-secondary shrink-0" />
                <span>
                  This recovery action has already been <strong>{selectedRequest.status}</strong>. Its authorization
                  record is locked and can no longer be modified.
                </span>
              </div>
            )}

            {/* Error banner if mutation failed */}
            {reviewSubmissionError && (
              <div className="p-3 bg-red-50 border border-status-critical/30 rounded-md text-xs text-status-critical flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-status-critical shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Review Submission Rejected by Backend</div>
                  <div>{reviewSubmissionError}</div>
                </div>
              </div>
            )}

            {/* Incident & Playbook Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3 p-3.5 rounded-lg border border-border-warm bg-surface-ivory">
                <div className="text-xs font-semibold text-ink-primary uppercase tracking-wider text-burgundy-primary flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Target Incident Context
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Incident ID:</span>
                    <Link
                      to={`/intelligence/incidents?incidentId=${encodeURIComponent(selectedRequest.incidentId)}`}
                      className="font-mono text-burgundy-primary hover:underline flex items-center gap-1"
                    >
                      {selectedRequest.incidentId}
                      <ExternalLink className="w-3 h-3 text-burgundy-accent" />
                    </Link>
                  </div>
                  {selectedRequest.incidentTitle && (
                    <div className="flex items-center justify-between">
                      <span className="text-ink-secondary">Title:</span>
                      <span className="font-medium text-ink-primary text-right">{selectedRequest.incidentTitle}</span>
                    </div>
                  )}
                  {selectedRequest.failurePattern && (
                    <div className="flex items-center justify-between">
                      <span className="text-ink-secondary">Failure Pattern:</span>
                      <span className="text-ink-primary text-right font-medium">{selectedRequest.failurePattern}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 p-3.5 rounded-lg border border-border-warm bg-surface-ivory">
                <div className="text-xs font-semibold text-ink-primary uppercase tracking-wider text-burgundy-primary flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  Proposed Countermeasure
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Playbook:</span>
                    <Link
                      to={`/recovery/playbooks?playbookId=${encodeURIComponent(selectedRequest.playbookId)}`}
                      className="font-medium text-burgundy-primary hover:underline flex items-center gap-1"
                    >
                      {selectedRequest.playbookName}
                      <ExternalLink className="w-3 h-3 text-burgundy-accent" />
                    </Link>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">Actions to Execute:</span>
                    <span className="font-mono font-medium text-ink-primary">
                      {selectedRequest.proposedActions.length} discrete steps
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-secondary">TTL Expiration:</span>
                    <span className="font-mono text-ink-primary">
                      {selectedRequest.expiresAt ? new Date(selectedRequest.expiresAt).toLocaleString() : 'No TTL'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Justification & Proposed Actions */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-ink-primary">Operator Justification &amp; Recovery Rationale</div>
              <div className="p-3 bg-surface-cream rounded-md border border-border-warm text-xs text-ink-primary leading-relaxed">
                {selectedRequest.reason || 'No written reason supplied in request payload.'}
              </div>
            </div>

            {/* Proposed Bounded Actions */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-ink-primary">Proposed Actions Scope</div>
              <div className="flex flex-wrap gap-2">
                {selectedRequest.proposedActions.map((action, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-secondary border border-border-warm text-xs font-mono text-ink-primary"
                  >
                    <span className="text-burgundy-primary font-bold">#{idx + 1}</span>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Impact & Risk Assessment */}
            {(selectedRequest.expectedImpact || selectedRequest.risksSummary) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedRequest.expectedImpact && (
                  <div className="p-3 rounded-lg border border-border-warm bg-surface-ivory space-y-1.5">
                    <div className="text-xs font-semibold text-ink-primary flex items-center gap-1.5 text-status-healthy">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Expected Recovery Impact
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed">
                      {selectedRequest.expectedImpact}
                    </p>
                  </div>
                )}
                {selectedRequest.risksSummary && (
                  <div className="p-3 rounded-lg border border-border-warm bg-surface-ivory space-y-1.5">
                    <div className="text-xs font-semibold text-ink-primary flex items-center gap-1.5 text-status-warning">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Identified Operational Risks
                    </div>
                    <p className="text-xs text-ink-secondary leading-relaxed">
                      {selectedRequest.risksSummary}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Preconditions & Verification Plan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-ink-primary">Precondition Checkpoints</div>
                <div className="space-y-1.5">
                  {selectedRequest.preconditions && selectedRequest.preconditions.length > 0 ? (
                    selectedRequest.preconditions.map((prec, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-2 rounded bg-surface-cream border border-border-warm text-xs text-ink-primary"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-status-healthy shrink-0 mt-0.5" />
                        <span>{prec}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-ink-secondary p-2 bg-surface-cream rounded border border-border-warm">
                      Standard automated assertions apply.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-ink-primary">Post-Recovery Verification Plan</div>
                <div className="p-3 bg-surface-cream rounded-md border border-border-warm text-xs text-ink-primary leading-relaxed space-y-2">
                  <div className="flex items-center gap-1.5 font-medium text-burgundy-primary">
                    <Clock className="w-3.5 h-3.5" />
                    Automated Probe Verification
                  </div>
                  <p className="text-ink-secondary">
                    {selectedRequest.verificationPlan || 'Synthetic canary transactions will be executed immediately to verify resolution.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Operator Authorization Input Form (Only for pending requests) */}
            {selectedRequest.status === 'pending' && (
              <div className="space-y-4 pt-4 border-t border-border-warm">
                <div className="text-xs font-semibold text-ink-primary flex items-center gap-2 uppercase tracking-wider text-burgundy-primary">
                  <UserCheck className="w-4 h-4" />
                  Operator Decision &amp; Audit Attestation
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Decision Action" required>
                    <Select
                      options={[
                        { value: 'approve', label: 'Authorize & Execute Countermeasure' },
                        { value: 'reject', label: 'Reject Request & Halt Recovery' },
                      ]}
                      value={reviewDecision}
                      onChange={(e) => setReviewDecision(e.target.value as 'approve' | 'reject')}
                    />
                  </FormField>

                  <FormField
                    label="Idempotency Key"
                    htmlFor={idempotencyInputId}
                    helperText="Prevents duplicate approval execution during network retries."
                    required
                  >
                    <Input
                      id={idempotencyInputId}
                      value={idempotencyKey}
                      onChange={(e) => setIdempotencyKey(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </FormField>
                </div>

                <FormField
                  label={reviewDecision === 'approve' ? 'Approval Justification Notes' : 'Rejection Rationale'}
                  htmlFor={notesInputId}
                  helperText="Required for compliance ledger audit. Detail verification steps or why action is unsafe."
                  required
                >
                  <Textarea
                    id={notesInputId}
                    rows={3}
                    placeholder={
                      reviewDecision === 'approve'
                        ? 'e.g., Verified secondary gateway health. No in-flight payments pending reconciliation on primary gateway.'
                        : 'e.g., Investigation indicates failure is upstream DNS resolution; gateway failover would not remediate and introduces split-brain risk.'
                    }
                    value={operatorNotes}
                    onChange={(e) => setOperatorNotes(e.target.value)}
                  />
                </FormField>

                {reviewDecision === 'approve' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-md border border-border-warm bg-surface-cream">
                    <input
                      id={safetyCheckboxId}
                      type="checkbox"
                      checked={confirmedSafetyGate}
                      onChange={(e) => setConfirmedSafetyGate(e.target.checked)}
                      className="mt-0.5 rounded border-border-warm text-burgundy-primary focus:ring-burgundy-accent"
                    />
                    <label
                      htmlFor={safetyCheckboxId}
                      className="text-xs text-ink-primary cursor-pointer select-none leading-relaxed"
                    >
                      <strong className="text-ink-primary">I attest as authorized operator:</strong> I have evaluated the preconditions,
                      confirmed no double-charge risks exist for ambiguous timeouts, and approve the dispatch of this recovery action.
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default ApprovalQueuePage;
