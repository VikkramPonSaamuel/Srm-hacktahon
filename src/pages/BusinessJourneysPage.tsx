import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Play,
  RefreshCw,
  ShieldAlert,
  Workflow,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useShell } from '../context/ShellContext';
import { DESIGN_TOKENS, type SemanticStatus } from '../styles/tokens';
import type { JourneyExecutionStatus } from '../api/contracts';
import {
  type BusinessJourneyItem,
  type SyntheticExecutionItem,
  useExecutionDetailQuery,
  useJourneyDetailQuery,
  useJourneysListQuery,
} from '../api/journeysAndExecutions';
import {
  WorkflowPipeline,
  stepStatusToVariant,
} from '../components/journeys/WorkflowPipeline';
import { TriggerExecutionDialog } from '../components/journeys/TriggerExecutionDialog';
import {
  ExecutionDetailModal,
  executionStatusToVariant,
} from '../components/journeys/ExecutionDetailModal';
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
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  MonoCode,
  Select,
  UnavailableState,
} from '../components/ui';

type JourneySortKey =
  | 'name'
  | 'overallHealth'
  | 'successRate'
  | 'averageLatencyMs'
  | 'lastRunAt';

function healthToVariant(health: JourneyExecutionStatus): SemanticStatus {
  switch (health) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'warning';
    case 'failing':
      return 'critical';
    default:
      return 'neutral';
  }
}

export const BusinessJourneysPage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedJourneyId = searchParams.get('journeyId');

  // List filter, sort, and pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [enabledFilter, setEnabledFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<JourneySortKey>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Trigger Execution modal state
  const [triggerTarget, setTriggerTarget] = useState<{
    journeyId: string;
    journeyName?: string;
  } | null>(null);

  // Execution Detail inspector state (from Journey Detail recent executions)
  const [inspectedExecutionId, setInspectedExecutionId] = useState<string | null>(null);
  const [inspectedExecutionFallback, setInspectedExecutionFallback] =
    useState<SyntheticExecutionItem | null>(null);

  const journeysQuery = useJourneysListQuery(timeRange);
  const journeyDetailQuery = useJourneyDetailQuery(selectedJourneyId, timeRange);
  const executionDetailQuery = useExecutionDetailQuery(inspectedExecutionId);

  // Filter and sort journeys list
  const filteredAndSortedJourneys = useMemo(() => {
    const list = journeysQuery.data ?? [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = list.filter((journey) => {
      const matchesSearch =
        !q ||
        journey.name.toLowerCase().includes(q) ||
        journey.id.toLowerCase().includes(q) ||
        (journey.description?.toLowerCase().includes(q) ?? false);

      const matchesHealth =
        healthFilter === 'all' || journey.overallHealth === healthFilter;

      const matchesEnabled =
        enabledFilter === 'all' ||
        (enabledFilter === 'enabled' && journey.enabled === true) ||
        (enabledFilter === 'disabled' && journey.enabled === false);

      return matchesSearch && matchesHealth && matchesEnabled;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'overallHealth') {
        cmp = a.overallHealth.localeCompare(b.overallHealth);
      } else if (sortKey === 'successRate') {
        cmp = (a.successRate ?? -1) - (b.successRate ?? -1);
      } else if (sortKey === 'averageLatencyMs') {
        cmp = (a.averageLatencyMs ?? -1) - (b.averageLatencyMs ?? -1);
      } else if (sortKey === 'lastRunAt') {
        cmp = String(a.lastRunAt ?? '').localeCompare(String(b.lastRunAt ?? ''));
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [journeysQuery.data, searchQuery, healthFilter, enabledFilter, sortKey, sortDirection]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJourneys.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedJourneys = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedJourneys.slice(start, start + pageSize);
  }, [filteredAndSortedJourneys, safePage, pageSize]);

  const handleOpenJourneyDetail = (journeyId: string) => {
    setSearchParams({ journeyId });
  };

  const handleCloseJourneyDetail = () => {
    setSearchParams({});
  };

  // Resolve active journey detail (from detail endpoint or fallback from list if already loaded)
  const fallbackJourneyFromList: BusinessJourneyItem | undefined = useMemo(
    () => (journeysQuery.data ?? []).find((j) => j.id === selectedJourneyId),
    [journeysQuery.data, selectedJourneyId]
  );

  const activeJourneyDetail = journeyDetailQuery.data;

  // =========================================================================
  // JOURNEY DETAILS VIEW
  // =========================================================================
  if (selectedJourneyId) {
    const displayJourney = activeJourneyDetail ?? fallbackJourneyFromList;
    const failedSteps = (displayJourney?.steps ?? []).filter(
      (s) => s.status === 'failing' || Boolean(s.lastErrorMessage)
    );

    return (
      <div className="space-y-5">
        {/* Top Back Navigation & Header Card */}
        <Card variant="ivory">
          <CardHeader
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseJourneyDetail}
                  leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                >
                  All Business Journeys
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={journeyDetailQuery.isFetching}
                  onClick={() => void journeyDetailQuery.refetch()}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Refresh
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    setTriggerTarget({
                      journeyId: selectedJourneyId,
                      journeyName: displayJourney?.name,
                    })
                  }
                  leftIcon={<Play className="w-3.5 h-3.5" />}
                >
                  Run Synthetic Journey
                </Button>
              </div>
            }
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
                <Workflow className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle>
                    {displayJourney?.name ?? `Journey ${selectedJourneyId}`}
                  </CardTitle>
                  <MonoCode>{selectedJourneyId}</MonoCode>
                  {displayJourney && (
                    <Badge variant={healthToVariant(displayJourney.overallHealth)} dot>
                      {displayJourney.overallHealth.toUpperCase()}
                    </Badge>
                  )}
                  {displayJourney?.enabled !== null && displayJourney?.enabled !== undefined && (
                    <Badge variant={displayJourney.enabled ? 'info' : 'neutral'}>
                      {displayJourney.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {displayJourney?.description ??
                    'Inspecting configured synthetic transaction workflow, step-level assertions, execution history, and linked incidents.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          {/* Journey Metadata Strip */}
          {displayJourney && (
            <div className="px-4 py-3 bg-surface-cream/60 border-t border-border-warm grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-ink-secondary block">Success Rate</span>
                <span className="font-mono font-semibold text-ink-primary">
                  {typeof displayJourney.successRate === 'number'
                    ? `${displayJourney.successRate.toFixed(2)}%`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Avg / P95 Latency</span>
                <span className="font-mono font-semibold text-ink-primary">
                  {typeof displayJourney.averageLatencyMs === 'number'
                    ? `${Math.round(displayJourney.averageLatencyMs)} ms`
                    : '—'}
                  {typeof displayJourney.p95LatencyMs === 'number'
                    ? ` / ${Math.round(displayJourney.p95LatencyMs)} ms`
                    : ''}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Schedule Cadence</span>
                <span className="font-mono text-ink-primary">
                  {displayJourney.scheduleCadence ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Environment</span>
                <span className="font-mono text-ink-primary">
                  {displayJourney.environment ?? '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Last Execution</span>
                <span className="font-mono text-ink-primary">
                  {displayJourney.lastRunAt ?? '—'}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Loading / Unavailable / Error handling for Journey Detail */}
        {journeyDetailQuery.isFetching && !displayJourney ? (
          <LoadingState
            title="Loading journey configuration & telemetry"
            description={`Querying GET /api/v1/journeys/${selectedJourneyId}...`}
            rows={4}
          />
        ) : journeyDetailQuery.isError &&
          journeyDetailQuery.error?.isUnavailable &&
          !displayJourney ? (
          <UnavailableState
            title="Journey Detail Endpoint Unavailable"
            description={`Endpoint GET /api/v1/journeys/${selectedJourneyId} did not respond. Step configurations, execution history, and historical performance are rendered strictly from backend responses.`}
            endpoint={`/api/v1/journeys/${selectedJourneyId}`}
            onRetry={() => void journeyDetailQuery.refetch()}
          />
        ) : journeyDetailQuery.isError && !displayJourney ? (
          <ErrorState
            title="Failed to load journey details"
            message={journeyDetailQuery.error?.message ?? 'Error loading journey'}
            statusCode={journeyDetailQuery.error?.status}
            endpoint={`/api/v1/journeys/${selectedJourneyId}`}
            onRetry={() => void journeyDetailQuery.refetch()}
          />
        ) : (
          <>
            {/* 1. Ordered Workflow Pipeline */}
            <Card variant="ivory">
              <CardHeader
                actions={
                  <Badge variant="neutral" mono>
                    {(displayJourney?.steps ?? []).length} Configured Step(s)
                  </Badge>
                }
              >
                <CardTitle>Ordered Workflow Configuration &amp; Step Health</CardTitle>
                <CardDescription>
                  Actual step execution sequence configured for this journey with step-level
                  health status and latency.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <WorkflowPipeline steps={displayJourney?.steps ?? []} />
              </CardContent>
            </Card>

            {/* 2. Failed Steps & Error Details */}
            <Card variant="ivory">
              <CardHeader
                actions={
                  <Badge variant={failedSteps.length > 0 ? 'critical' : 'healthy'} dot>
                    {failedSteps.length > 0
                      ? `${failedSteps.length} Failing Step(s)`
                      : 'Zero Failing Steps'}
                  </Badge>
                }
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className="w-4 h-4 text-status-critical shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <CardTitle>Failed Steps &amp; Error Diagnostics</CardTitle>
                    <CardDescription>
                      Detailed step-level assertion failures and error payloads reported for this
                      journey.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {failedSteps.length === 0 ? (
                  <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                    No failing steps or step-level assertion errors are currently reported for
                    this journey.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {failedSteps.map((step) => (
                      <div
                        key={step.id}
                        className="p-3.5 rounded-md bg-status-critical/10 border border-status-critical/30 space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 font-semibold text-ink-primary">
                            <MonoCode>Step #{step.order}</MonoCode>
                            <span>{step.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {step.lastErrorCode && (
                              <Badge variant="critical" mono>
                                {step.lastErrorCode}
                              </Badge>
                            )}
                            <Badge variant={stepStatusToVariant(step.status)} dot>
                              {step.status.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        <p className="font-mono text-status-critical">
                          {step.lastErrorMessage ?? 'Assertion failed without error message payload.'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. Recent Execution History & 4. Associated Incidents */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              <div className="xl:col-span-7">
                <Card variant="ivory" className="h-full">
                  <CardHeader
                    actions={
                      <Link
                        to={`/monitoring/executions?journeyId=${encodeURIComponent(
                          selectedJourneyId
                        )}`}
                      >
                        <Button variant="outline" size="xs">
                          View All Executions
                        </Button>
                      </Link>
                    }
                  >
                    <CardTitle>Recent Execution History</CardTitle>
                    <CardDescription>
                      Latest synthetic runs for this journey. Select a row to inspect step-by-step
                      timing and payment handling.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      caption="Recent executions for this journey"
                      columns={[
                        { key: 'id', header: 'Execution ID', mono: true },
                        {
                          key: 'status',
                          header: 'Status',
                          render: (row) => {
                            const st = row.status as SyntheticExecutionItem['status'];
                            return (
                              <Badge variant={executionStatusToVariant(st)} dot>
                                {st.toUpperCase()}
                              </Badge>
                            );
                          },
                        },
                        {
                          key: 'durationMs',
                          header: 'Duration',
                          mono: true,
                          align: 'right',
                          render: (row) =>
                            typeof row.durationMs === 'number'
                              ? `${Math.round(row.durationMs)} ms`
                              : '—',
                        },
                        {
                          key: 'failedStepName',
                          header: 'Failed Step',
                          render: (row) => String(row.failedStepName ?? 'None'),
                        },
                        {
                          key: 'startedAt',
                          header: 'Start Time',
                          mono: true,
                          align: 'right',
                        },
                      ]}
                      data={
                        (activeJourneyDetail?.recentExecutions ??
                          []) as unknown as Record<string, unknown>[]
                      }
                      rowKey={(row) => String(row.id)}
                      emptyTitle="No recent execution records returned"
                      emptyDescription="No execution history was included in the backend response for this journey."
                      onRowClick={(row) => {
                        const item = row as unknown as SyntheticExecutionItem;
                        setInspectedExecutionFallback(item);
                        setInspectedExecutionId(item.id);
                      }}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="xl:col-span-5">
                <Card variant="ivory" className="h-full">
                  <CardHeader
                    actions={
                      <Link to="/intelligence/incidents">
                        <Button variant="outline" size="xs">
                          Incident Console
                        </Button>
                      </Link>
                    }
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert
                        className="w-4 h-4 text-status-critical shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <CardTitle>Associated Incidents</CardTitle>
                        <CardDescription>
                          Active or historical incidents linked to this business journey.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      caption="Associated incidents for this journey"
                      columns={[
                        { key: 'id', header: 'Incident ID', mono: true },
                        {
                          key: 'severity',
                          header: 'Severity',
                          render: (row) => (
                            <Badge
                              variant={
                                row.severity === 'critical' || row.severity === 'sev1'
                                  ? 'critical'
                                  : 'warning'
                              }
                              dot
                            >
                              {String(row.severity).toUpperCase()}
                            </Badge>
                          ),
                        },
                        {
                          key: 'status',
                          header: 'Status',
                          render: (row) => (
                            <Badge
                              variant={row.status === 'resolved' ? 'healthy' : 'warning'}
                            >
                              {String(row.status)}
                            </Badge>
                          ),
                        },
                        {
                          key: 'firstSeenAt',
                          header: 'First Seen',
                          mono: true,
                          align: 'right',
                        },
                      ]}
                      data={
                        (activeJourneyDetail?.associatedIncidents ??
                          []) as unknown as Record<string, unknown>[]
                      }
                      rowKey={(row) => String(row.id)}
                      emptyTitle="No associated incidents"
                      emptyDescription="Zero incidents are currently linked to this business journey."
                    />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 5. Historical Performance Chart (Rendered strictly when supported by backend data) */}
            {(activeJourneyDetail?.historicalPerformance?.length ?? 0) > 0 && (
              <Card variant="ivory">
                <CardHeader>
                  <CardTitle>Historical Journey Performance</CardTitle>
                  <CardDescription>
                    Time-series latency and success rate returned by the backend for this journey.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activeJourneyDetail!.historicalPerformance}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={DESIGN_TOKENS.colors.warmBorder}
                        />
                        <XAxis
                          dataKey="timestamp"
                          tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 11 }}
                        />
                        <YAxis
                          tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 11 }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                            borderColor: DESIGN_TOKENS.colors.warmBorder,
                            fontSize: '12px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="latencyMs"
                          name="Latency (ms)"
                          stroke={DESIGN_TOKENS.colors.deepBurgundy}
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Trigger Execution Modal */}
        <TriggerExecutionDialog
          open={Boolean(triggerTarget)}
          onClose={() => setTriggerTarget(null)}
          journeyId={triggerTarget?.journeyId ?? selectedJourneyId}
          journeyName={triggerTarget?.journeyName ?? displayJourney?.name}
        />

        {/* Execution Detail Modal */}
        <ExecutionDetailModal
          open={Boolean(inspectedExecutionId)}
          onClose={() => {
            setInspectedExecutionId(null);
            setInspectedExecutionFallback(null);
          }}
          execution={executionDetailQuery.data ?? inspectedExecutionFallback}
          isLoading={executionDetailQuery.isFetching && !inspectedExecutionFallback}
          isUnavailable={
            executionDetailQuery.isError &&
            Boolean(executionDetailQuery.error?.isUnavailable) &&
            !inspectedExecutionFallback
          }
          error={
            executionDetailQuery.isError &&
            !executionDetailQuery.error?.isUnavailable &&
            !inspectedExecutionFallback
              ? {
                  message: executionDetailQuery.error.message,
                  status: executionDetailQuery.error.status,
                }
              : null
          }
          endpoint={
            inspectedExecutionId
              ? `/api/v1/executions/${inspectedExecutionId}`
              : undefined
          }
          onRetry={() => void executionDetailQuery.refetch()}
        />
      </div>
    );
  }

  // =========================================================================
  // BUSINESS JOURNEYS LIST VIEW
  // =========================================================================
  return (
    <div className="space-y-4">
      {/* Page Header Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/monitoring/executions">
                <Button variant="outline" size="sm">
                  Execution History
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                isLoading={journeysQuery.isFetching}
                onClick={() => void journeysQuery.refetch()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Journeys
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setTriggerTarget({ journeyId: '' })}
                leftIcon={<Play className="w-3.5 h-3.5" />}
              >
                Trigger Journey Run
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
              <Workflow className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Business Journeys</CardTitle>
                <MonoCode>GET /api/v1/journeys</MonoCode>
              </div>
              <CardDescription>
                Synthetic e-commerce transactions validating storefront browsing, cart mutation,
                checkout orchestration, payment gateway authorization, and order confirmation.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Search, Status Filters, and Sorting Controls */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setCurrentPage(1);
        }}
        searchPlaceholder="Search journeys by name, description, or ID..."
        filters={[
          {
            id: 'journey-health',
            label: 'Overall Health',
            value: healthFilter,
            options: [
              { value: 'all', label: 'All Health States' },
              { value: 'healthy', label: 'Healthy' },
              { value: 'degraded', label: 'Degraded' },
              { value: 'failing', label: 'Failing' },
              { value: 'unknown', label: 'Unknown' },
            ],
            onChange: (val) => {
              setHealthFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'journey-enabled',
            label: 'State',
            value: enabledFilter,
            options: [
              { value: 'all', label: 'Enabled & Disabled' },
              { value: 'enabled', label: 'Enabled Only' },
              { value: 'disabled', label: 'Disabled Only' },
            ],
            onChange: (val) => {
              setEnabledFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'journey-sort',
            label: 'Sort By',
            value: sortKey,
            options: [
              { value: 'name', label: 'Journey Name' },
              { value: 'overallHealth', label: 'Overall Health' },
              { value: 'successRate', label: 'Success Rate' },
              { value: 'averageLatencyMs', label: 'Average Latency' },
              { value: 'lastRunAt', label: 'Last Run Time' },
            ],
            onChange: (val) => setSortKey(val as JourneySortKey),
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setHealthFilter('all');
          setEnabledFilter('all');
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

      {/* Journeys Table / States */}
      {journeysQuery.isFetching ? (
        <LoadingState
          title="Loading configured business journeys"
          description="Querying GET /api/v1/journeys..."
          rows={4}
        />
      ) : journeysQuery.isError && journeysQuery.error?.isUnavailable ? (
        <UnavailableState
          title="Business Journeys API Unavailable"
          description="Endpoint GET /api/v1/journeys is currently unreachable. Continuum does not fabricate synthetic journeys or fake pass rates when the backend service is offline."
          endpoint="/api/v1/journeys"
          onRetry={() => void journeysQuery.refetch()}
        />
      ) : journeysQuery.isError ? (
        <ErrorState
          title="Failed to load business journeys"
          message={journeysQuery.error?.message ?? 'Error fetching journeys'}
          statusCode={journeysQuery.error?.status}
          endpoint="/api/v1/journeys"
          onRetry={() => void journeysQuery.refetch()}
        />
      ) : paginatedJourneys.length === 0 ? (
        <EmptyState
          title="No business journeys found"
          description="Either no synthetic journeys are configured in the backend or no journeys matched your current search and filter criteria."
          endpoint="/api/v1/journeys"
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setHealthFilter('all');
            setEnabledFilter('all');
            setCurrentPage(1);
          }}
        />
      ) : (
        <Card variant="ivory">
          <DataTable
            caption="Configured business journeys list"
            columns={[
              {
                key: 'name',
                header: 'Journey Name & Description',
                render: (row) => {
                  const j = row as unknown as BusinessJourneyItem;
                  return (
                    <div className="min-w-[200px] max-w-md whitespace-normal">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenJourneyDetail(j.id);
                          }}
                          className="font-heading text-xs font-semibold text-burgundy hover:underline text-left"
                        >
                          {j.name}
                        </button>
                        <MonoCode>{j.id}</MonoCode>
                      </div>
                      {j.description && (
                        <p className="text-[11px] text-ink-secondary mt-0.5 line-clamp-2">
                          {j.description}
                        </p>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'enabled',
                header: 'Configuration',
                render: (row) => {
                  const j = row as unknown as BusinessJourneyItem;
                  if (j.enabled === null) {
                    return <Badge variant="neutral">Unspecified</Badge>;
                  }
                  return (
                    <Badge variant={j.enabled ? 'info' : 'neutral'}>
                      {j.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  );
                },
              },
              {
                key: 'overallHealth',
                header: 'Overall Health',
                render: (row) => {
                  const j = row as unknown as BusinessJourneyItem;
                  return (
                    <Badge variant={healthToVariant(j.overallHealth)} dot>
                      {j.overallHealth.toUpperCase()}
                    </Badge>
                  );
                },
              },
              {
                key: 'latestExecutionStatus',
                header: 'Latest Execution',
                render: (row) => {
                  const j = row as unknown as BusinessJourneyItem;
                  if (!j.latestExecutionStatus && !j.latestExecutionId) {
                    return <span className="text-ink-secondary font-mono">—</span>;
                  }
                  return (
                    <div className="flex items-center gap-1.5">
                      {j.latestExecutionStatus && (
                        <Badge
                          variant={executionStatusToVariant(j.latestExecutionStatus)}
                          dot
                        >
                          {j.latestExecutionStatus.toUpperCase()}
                        </Badge>
                      )}
                      {j.latestExecutionId && <MonoCode>{j.latestExecutionId}</MonoCode>}
                    </div>
                  );
                },
              },
              {
                key: 'successRate',
                header: 'Success Rate',
                mono: true,
                align: 'right',
                render: (row) => {
                  const j = row as unknown as BusinessJourneyItem;
                  return typeof j.successRate === 'number'
                    ? `${j.successRate.toFixed(2)}%`
                    : '—';
                },
              },
              {
                key: 'averageLatencyMs',
                header: 'Avg Latency',
                mono: true,
                align: 'right',
                render: (row) => {
                  const j = row as unknown as BusinessJourneyItem;
                  return typeof j.averageLatencyMs === 'number'
                    ? `${Math.round(j.averageLatencyMs)} ms`
                    : '—';
                },
              },
              {
                key: 'lastRunAt',
                header: 'Last Run Time',
                mono: true,
                align: 'right',
                render: (row) => {
                  const j = row as unknown as BusinessJourneyItem;
                  return j.lastRunAt ?? '—';
                },
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                sortable: false,
                render: (row) => {
                  const j = row as unknown as BusinessJourneyItem;
                  return (
                    <div
                      className="inline-flex items-center gap-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleOpenJourneyDetail(j.id)}
                        leftIcon={<Eye className="w-3 h-3" />}
                      >
                        Details
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={j.enabled === false}
                        onClick={() =>
                          setTriggerTarget({ journeyId: j.id, journeyName: j.name })
                        }
                        leftIcon={<Play className="w-3 h-3" />}
                      >
                        Run
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            data={paginatedJourneys as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => handleOpenJourneyDetail(String(row.id))}
          />

          {/* Pagination Footer */}
          <CardFooter>
            <div className="flex items-center gap-2">
              <span>
                Showing {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredAndSortedJourneys.length)} of{' '}
                {filteredAndSortedJourneys.length} journey(s)
              </span>
              <Select
                aria-label="Rows per page"
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

      {/* Trigger Synthetic Execution Confirmation Dialog */}
      <TriggerExecutionDialog
        open={Boolean(triggerTarget)}
        onClose={() => setTriggerTarget(null)}
        journeyId={triggerTarget?.journeyId ?? ''}
        journeyName={triggerTarget?.journeyName}
      />
    </div>
  );
};
