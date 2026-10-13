import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Play,
  PlayCircle,
  RefreshCw,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import {
  type SyntheticExecutionItem,
  useExecutionDetailQuery,
  useExecutionsListQuery,
} from '../api/journeysAndExecutions';
import {
  ExecutionDetailModal,
  executionStatusToVariant,
} from '../components/journeys/ExecutionDetailModal';
import { TriggerExecutionDialog } from '../components/journeys/TriggerExecutionDialog';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  MonoCode,
  Select,
  UnavailableState,
} from '../components/ui';

type ExecutionSortKey = 'startedAt' | 'durationMs' | 'status' | 'journeyName';

export const ExecutionsPage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialJourneyFilter = searchParams.get('journeyId') ?? 'all';
  const activeExecutionIdParam = searchParams.get('executionId');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [journeyFilter, setJourneyFilter] = useState<string>(initialJourneyFilter);
  const [sortKey, setSortKey] = useState<ExecutionSortKey>('startedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedExecutionRow, setSelectedExecutionRow] =
    useState<SyntheticExecutionItem | null>(null);
  const [isTriggerDialogOpen, setIsTriggerDialogOpen] = useState(false);

  const executionsQuery = useExecutionsListQuery(timeRange, journeyFilter);
  const executionDetailQuery = useExecutionDetailQuery(activeExecutionIdParam);

  // Extract distinct journey options from loaded executions if available
  const journeyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const exec of executionsQuery.data ?? []) {
      if (exec.journeyId && exec.journeyId !== '—') {
        map.set(exec.journeyId, exec.journeyName || exec.journeyId);
      }
    }
    if (journeyFilter !== 'all' && !map.has(journeyFilter)) {
      map.set(journeyFilter, journeyFilter);
    }
    return [
      { value: 'all', label: 'All Journeys' },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [executionsQuery.data, journeyFilter]);

  const filteredAndSortedExecutions = useMemo(() => {
    const list = executionsQuery.data ?? [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = list.filter((exec) => {
      const matchesSearch =
        !q ||
        exec.id.toLowerCase().includes(q) ||
        exec.journeyName.toLowerCase().includes(q) ||
        exec.journeyId.toLowerCase().includes(q) ||
        (exec.failedStepName?.toLowerCase().includes(q) ?? false) ||
        (exec.errorSummary?.toLowerCase().includes(q) ?? false) ||
        (exec.incidentId?.toLowerCase().includes(q) ?? false);

      const matchesStatus = statusFilter === 'all' || exec.status === statusFilter;
      const matchesJourney =
        journeyFilter === 'all' || exec.journeyId === journeyFilter;

      return matchesSearch && matchesStatus && matchesJourney;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'startedAt') {
        cmp = a.startedAt.localeCompare(b.startedAt);
      } else if (sortKey === 'durationMs') {
        cmp = (a.durationMs ?? -1) - (b.durationMs ?? -1);
      } else if (sortKey === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortKey === 'journeyName') {
        cmp = a.journeyName.localeCompare(b.journeyName);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [executionsQuery.data, searchQuery, statusFilter, journeyFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedExecutions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedExecutions = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedExecutions.slice(start, start + pageSize);
  }, [filteredAndSortedExecutions, safePage, pageSize]);

  const handleInspectExecution = (exec: SyntheticExecutionItem) => {
    setSelectedExecutionRow(exec);
    const next = new URLSearchParams(searchParams);
    next.set('executionId', exec.id);
    setSearchParams(next);
  };

  const handleCloseExecutionModal = () => {
    setSelectedExecutionRow(null);
    const next = new URLSearchParams(searchParams);
    next.delete('executionId');
    setSearchParams(next);
  };

  const resolvedExecutionForModal =
    executionDetailQuery.data ??
    selectedExecutionRow ??
    (executionsQuery.data ?? []).find((e) => e.id === activeExecutionIdParam) ??
    null;

  return (
    <div className="space-y-4">
      {/* Page Header Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/monitoring/journeys">
                <Button variant="outline" size="sm">
                  Configured Journeys
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                isLoading={executionsQuery.isFetching}
                onClick={() => void executionsQuery.refetch()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Runs
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsTriggerDialogOpen(true)}
                leftIcon={<Play className="w-3.5 h-3.5" />}
              >
                Trigger Synthetic Run
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
              <PlayCircle className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Synthetic Journey Executions</CardTitle>
                <MonoCode>GET /api/v1/executions</MonoCode>
              </div>
              <CardDescription>
                Chronological ledger of synthetic e-commerce transaction runs, step assertions,
                retry telemetry, safe payment verification, and correlated incidents.
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
        searchPlaceholder="Filter by execution ID, journey, failed step, error, or incident..."
        filters={[
          {
            id: 'exec-status',
            label: 'Overall Status',
            value: statusFilter,
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'passed', label: 'Passed' },
              { value: 'failed', label: 'Failed' },
              { value: 'degraded', label: 'Degraded' },
              { value: 'running', label: 'Running' },
              { value: 'timeout', label: 'Timed Out' },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'exec-journey',
            label: 'Journey',
            value: journeyFilter,
            options: journeyOptions,
            onChange: (val) => {
              setJourneyFilter(val);
              setCurrentPage(1);
              const next = new URLSearchParams(searchParams);
              if (val === 'all') {
                next.delete('journeyId');
              } else {
                next.set('journeyId', val);
              }
              setSearchParams(next);
            },
          },
          {
            id: 'exec-sort',
            label: 'Sort By',
            value: sortKey,
            options: [
              { value: 'startedAt', label: 'Start Time' },
              { value: 'durationMs', label: 'Duration' },
              { value: 'status', label: 'Overall Status' },
              { value: 'journeyName', label: 'Journey' },
            ],
            onChange: (val) => setSortKey(val as ExecutionSortKey),
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setStatusFilter('all');
          setJourneyFilter('all');
          setCurrentPage(1);
          setSearchParams({});
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
            {sortDirection === 'asc' ? 'Oldest / Asc' : 'Newest / Desc'}
          </Button>
        }
      />

      {/* Execution History Table & State Handling */}
      {executionsQuery.isFetching ? (
        <LoadingState
          title="Loading synthetic execution history"
          description="Querying GET /api/v1/executions..."
          rows={4}
        />
      ) : executionsQuery.isError && executionsQuery.error?.isUnavailable ? (
        <UnavailableState
          title="Executions History API Unavailable"
          description="Endpoint GET /api/v1/executions did not respond. Continuum withholds synthetic execution history until the FastAPI backend is reachable."
          endpoint="/api/v1/executions"
          onRetry={() => void executionsQuery.refetch()}
        />
      ) : executionsQuery.isError ? (
        <ErrorState
          title="Failed to load execution history"
          message={executionsQuery.error?.message ?? 'Error fetching executions'}
          statusCode={executionsQuery.error?.status}
          endpoint="/api/v1/executions"
          onRetry={() => void executionsQuery.refetch()}
        />
      ) : paginatedExecutions.length === 0 ? (
        <EmptyState
          title="No execution records found"
          description="Zero synthetic runs matched the current evaluation window and filter criteria."
          endpoint="/api/v1/executions"
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setStatusFilter('all');
            setJourneyFilter('all');
            setCurrentPage(1);
            setSearchParams({});
          }}
        />
      ) : (
        <Card variant="ivory">
          <DataTable
            caption="Synthetic journey execution history table"
            columns={[
              {
                key: 'id',
                header: 'Execution ID',
                mono: true,
                render: (row) => {
                  const exec = row as unknown as SyntheticExecutionItem;
                  return <MonoCode>{exec.id}</MonoCode>;
                },
              },
              {
                key: 'journeyName',
                header: 'Journey',
                render: (row) => {
                  const exec = row as unknown as SyntheticExecutionItem;
                  return (
                    <Link
                      to={`/monitoring/journeys?journeyId=${encodeURIComponent(
                        exec.journeyId
                      )}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-burgundy hover:underline"
                    >
                      {exec.journeyName}
                    </Link>
                  );
                },
              },
              {
                key: 'startedAt',
                header: 'Start Time & Duration',
                mono: true,
                render: (row) => {
                  const exec = row as unknown as SyntheticExecutionItem;
                  return (
                    <div>
                      <div className="text-ink-primary">{exec.startedAt}</div>
                      <div className="text-[10px] text-ink-secondary">
                        Duration:{' '}
                        {typeof exec.durationMs === 'number'
                          ? `${Math.round(exec.durationMs)} ms`
                          : '—'}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'status',
                header: 'Overall Status',
                render: (row) => {
                  const exec = row as unknown as SyntheticExecutionItem;
                  return (
                    <Badge variant={executionStatusToVariant(exec.status)} dot>
                      {exec.status.toUpperCase()}
                    </Badge>
                  );
                },
              },
              {
                key: 'failedStepName',
                header: 'Failed Step',
                render: (row) => {
                  const exec = row as unknown as SyntheticExecutionItem;
                  if (!exec.failedStepName) {
                    return <span className="text-ink-secondary">—</span>;
                  }
                  return (
                    <span className="font-medium text-status-critical">
                      {exec.failedStepOrder !== null ? `#${exec.failedStepOrder} ` : ''}
                      {exec.failedStepName}
                    </span>
                  );
                },
              },
              {
                key: 'errorSummary',
                header: 'Error Summary',
                render: (row) => {
                  const exec = row as unknown as SyntheticExecutionItem;
                  if (!exec.errorSummary && !exec.errorCode) {
                    return <span className="text-ink-secondary">—</span>;
                  }
                  return (
                    <div className="max-w-xs truncate font-mono text-[11px] text-ink-primary">
                      {exec.errorCode ? `[${exec.errorCode}] ` : ''}
                      {exec.errorSummary ?? ''}
                    </div>
                  );
                },
              },
              {
                key: 'incidentId',
                header: 'Associated Incident',
                render: (row) => {
                  const exec = row as unknown as SyntheticExecutionItem;
                  if (!exec.incidentId) {
                    return <span className="text-ink-secondary font-mono">None</span>;
                  }
                  return (
                    <Link
                      to="/intelligence/incidents"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Badge variant="critical" mono>
                        {exec.incidentId}
                      </Badge>
                    </Link>
                  );
                },
              },
              {
                key: 'actions',
                header: 'Trace',
                align: 'right',
                sortable: false,
                render: (row) => {
                  const exec = row as unknown as SyntheticExecutionItem;
                  return (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInspectExecution(exec);
                      }}
                      leftIcon={<Eye className="w-3 h-3" />}
                    >
                      Inspect
                    </Button>
                  );
                },
              },
            ]}
            data={paginatedExecutions as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) =>
              handleInspectExecution(row as unknown as SyntheticExecutionItem)
            }
          />

          {/* Pagination Footer */}
          <CardFooter>
            <div className="flex items-center gap-2">
              <span>
                Showing {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredAndSortedExecutions.length)} of{' '}
                {filteredAndSortedExecutions.length} execution(s)
              </span>
              <Select
                aria-label="Executions per page"
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
                leftIcon={<ChevronLeft className="w-3 h-3" />}
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
                rightIcon={<ChevronRight className="w-3 h-3" />}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {/* Execution Detail Trace Inspector Modal */}
      <ExecutionDetailModal
        open={Boolean(activeExecutionIdParam || selectedExecutionRow)}
        onClose={handleCloseExecutionModal}
        execution={resolvedExecutionForModal}
        isLoading={executionDetailQuery.isFetching && !resolvedExecutionForModal}
        isUnavailable={
          executionDetailQuery.isError &&
          Boolean(executionDetailQuery.error?.isUnavailable) &&
          !resolvedExecutionForModal
        }
        error={
          executionDetailQuery.isError &&
          !executionDetailQuery.error?.isUnavailable &&
          !resolvedExecutionForModal
            ? {
                message: executionDetailQuery.error.message,
                status: executionDetailQuery.error.status,
              }
            : null
        }
        endpoint={
          activeExecutionIdParam
            ? `/api/v1/executions/${activeExecutionIdParam}`
            : undefined
        }
        onRetry={() => void executionDetailQuery.refetch()}
      />

      {/* Trigger Synthetic Run Dialog */}
      <TriggerExecutionDialog
        open={isTriggerDialogOpen}
        onClose={() => setIsTriggerDialogOpen(false)}
        journeyId={journeyFilter !== 'all' ? journeyFilter : ''}
      />
    </div>
  );
};
