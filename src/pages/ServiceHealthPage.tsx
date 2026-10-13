import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Clock,
  CreditCard,
  Eye,
  Lock,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
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
import {
  EXPECTED_SERVICE_ROLES,
  type MonitoredServiceNode,
  type OperationalServiceState,
  type TransactionOutcomeState,
  useServiceDetailQuery,
  useServiceHealthOverviewQuery,
} from '../api/serviceHealth';
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
  UnavailableState,
} from '../components/ui';

export function operationalStateToVariant(state: OperationalServiceState): SemanticStatus {
  switch (state) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
    case 'stale':
      return 'warning';
    case 'unhealthy':
      return 'critical';
    case 'unknown':
    default:
      return 'neutral';
  }
}

export function operationalStateLabel(state: OperationalServiceState): string {
  switch (state) {
    case 'healthy':
      return 'HEALTHY';
    case 'degraded':
      return 'DEGRADED';
    case 'unhealthy':
      return 'UNHEALTHY';
    case 'stale':
      return 'STALE TELEMETRY';
    case 'unknown':
    default:
      return 'UNKNOWN';
  }
}

export function transactionOutcomeBadge(outcome: TransactionOutcomeState | null) {
  if (!outcome) {
    return <Badge variant="neutral">Unknown</Badge>;
  }
  switch (outcome) {
    case 'success':
      return (
        <Badge variant="healthy" dot>
          Confirmed Success
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="critical" dot>
          Confirmed Failure
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="info" dot>
          Pending Settlement
        </Badge>
      );
    case 'unknown_timeout':
      return (
        <Badge variant="warning" dot>
          Timeout — Outcome Unknown (Not Marked Failed)
        </Badge>
      );
    case 'unknown':
    default:
      return (
        <Badge variant="neutral" dot>
          Unknown Outcome
        </Badge>
      );
  }
}

function StatusHistoryStrip({
  snapshots,
}: {
  snapshots: MonitoredServiceNode['statusHistory'];
}) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <span className="text-[11px] font-mono text-ink-secondary">
        No recent snapshots
      </span>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1"
      aria-label={`Recent status history (${snapshots.length} snapshots)`}
    >
      {snapshots.slice(-12).map((snap, idx) => {
        const bgClass =
          snap.state === 'healthy'
            ? 'bg-status-healthy'
            : snap.state === 'degraded' || snap.state === 'stale'
              ? 'bg-status-warning'
              : snap.state === 'unhealthy'
                ? 'bg-status-critical'
                : 'bg-status-neutral';

        return (
          <span
            key={`${snap.timestamp}-${idx}`}
            title={`${snap.timestamp}: ${snap.state.toUpperCase()}${
              typeof snap.latencyMs === 'number' ? ` (${Math.round(snap.latencyMs)} ms)` : ''
            }`}
            className={['w-2 h-4 rounded-sm', bgClass].join(' ')}
          />
        );
      })}
    </div>
  );
}

export const ServiceHealthPage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedServiceId = searchParams.get('serviceId');

  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const overviewQuery = useServiceHealthOverviewQuery(timeRange);
  const serviceDetailQuery = useServiceDetailQuery(selectedServiceId, timeRange);

  const services = overviewQuery.data?.services ?? [];
  const primaryGateway = overviewQuery.data?.primaryGateway ?? null;
  const secondaryGateway = overviewQuery.data?.secondaryGateway ?? null;

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return services.filter((svc) => {
      const matchesSearch =
        !q ||
        svc.name.toLowerCase().includes(q) ||
        svc.id.toLowerCase().includes(q) ||
        (svc.category?.toLowerCase().includes(q) ?? false) ||
        (svc.latestErrorSummary?.toLowerCase().includes(q) ?? false);

      const matchesState =
        stateFilter === 'all' ||
        (stateFilter === 'unknown_or_stale'
          ? svc.state === 'unknown' || svc.state === 'stale' || svc.isStale
          : svc.state === stateFilter);

      const matchesRole = roleFilter === 'all' || svc.serviceRole === roleFilter;

      return matchesSearch && matchesState && matchesRole;
    });
  }, [services, searchQuery, stateFilter, roleFilter]);

  // Count states across discovered services (never counting missing data as healthy)
  const stateCounts = useMemo(() => {
    return {
      healthy: services.filter((s) => s.state === 'healthy' && !s.isStale).length,
      degraded: services.filter((s) => s.state === 'degraded').length,
      unhealthy: services.filter((s) => s.state === 'unhealthy').length,
      unknownOrStale: services.filter(
        (s) => s.state === 'unknown' || s.state === 'stale' || s.isStale
      ).length,
    };
  }, [services]);

  // Check if Primary Gateway is impaired while Secondary Gateway is healthy
  const isPrimaryFailingWhileSecondaryHealthy = Boolean(
    primaryGateway &&
      secondaryGateway &&
      (primaryGateway.state === 'unhealthy' || primaryGateway.state === 'degraded') &&
      secondaryGateway.state === 'healthy' &&
      !secondaryGateway.isStale
  );

  const handleOpenServiceDetail = (serviceId: string) => {
    setSearchParams({ serviceId });
  };

  const handleCloseServiceDetail = () => {
    setSearchParams({});
  };

  const fallbackServiceNode = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId]
  );

  // =========================================================================
  // SERVICE DETAIL VIEW (?serviceId=...)
  // =========================================================================
  if (selectedServiceId) {
    const detail = serviceDetailQuery.data;
    const displayNode = detail ?? fallbackServiceNode;
    const snapshots = detail?.historicalSnapshots ?? displayNode?.statusHistory ?? [];
    const chartSnapshots = snapshots.filter(
      (s) => typeof s.latencyMs === 'number' || typeof s.errorRatePercent === 'number'
    );

    return (
      <div className="space-y-5">
        {/* Top Header & Back Button */}
        <Card variant="ivory">
          <CardHeader
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseServiceDetail}
                  leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                >
                  All Monitored Services
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={serviceDetailQuery.isFetching}
                  onClick={() => void serviceDetailQuery.refetch()}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Refresh Service Telemetry
                </Button>
              </div>
            }
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
                <Server className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle>
                    {displayNode?.name ?? `Service ${selectedServiceId}`}
                  </CardTitle>
                  <MonoCode>{selectedServiceId}</MonoCode>
                  <Badge
                    variant={operationalStateToVariant(displayNode?.state ?? 'unknown')}
                    dot
                  >
                    {operationalStateLabel(displayNode?.state ?? 'unknown')}
                  </Badge>
                  {displayNode?.isStale && (
                    <Badge variant="warning" dot>
                      Stale Heartbeat
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Historical health snapshots, error summaries, transaction outcome
                  classifications, and linked synthetic executions.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          {displayNode && (
            <div className="px-4 py-3 bg-surface-cream/60 border-t border-border-warm grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-ink-secondary block">Availability</span>
                <span className="font-mono font-semibold text-ink-primary">
                  {typeof displayNode.availabilityPercent === 'number'
                    ? `${displayNode.availabilityPercent.toFixed(2)}%`
                    : '— (Unverified)'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Error Rate</span>
                <span className="font-mono font-semibold text-ink-primary">
                  {typeof displayNode.errorRatePercent === 'number'
                    ? `${displayNode.errorRatePercent.toFixed(2)}%`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Avg / P95 Latency</span>
                <span className="font-mono font-semibold text-ink-primary">
                  {typeof displayNode.latencyMs === 'number'
                    ? `${Math.round(displayNode.latencyMs)} ms`
                    : '—'}
                  {typeof displayNode.p95LatencyMs === 'number'
                    ? ` / ${Math.round(displayNode.p95LatencyMs)} ms`
                    : ''}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Last Checked</span>
                <span className="font-mono text-ink-primary">
                  {displayNode.lastCheckedAt ?? 'Never / Unknown'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">
                  Last Transaction Outcome
                </span>
                <div className="mt-0.5">
                  {transactionOutcomeBadge(displayNode.lastTransactionOutcome)}
                </div>
              </div>
            </div>
          )}
        </Card>

        {serviceDetailQuery.isFetching && !displayNode ? (
          <LoadingState
            title="Loading service health history"
            description={`Querying GET /api/v1/services/${selectedServiceId}/health...`}
            rows={4}
          />
        ) : serviceDetailQuery.isError &&
          serviceDetailQuery.error?.isUnavailable &&
          !displayNode ? (
          <UnavailableState
            title="Service Detail Endpoint Unavailable"
            description={`Endpoint GET /api/v1/services/${selectedServiceId}/health did not respond. Missing data is treated as Unknown, never Healthy.`}
            endpoint={`/api/v1/services/${selectedServiceId}/health`}
            onRetry={() => void serviceDetailQuery.refetch()}
          />
        ) : serviceDetailQuery.isError && !displayNode ? (
          <ErrorState
            title="Failed to load service details"
            message={serviceDetailQuery.error?.message ?? 'Error loading service detail'}
            statusCode={serviceDetailQuery.error?.status}
            endpoint={`/api/v1/services/${selectedServiceId}/health`}
            onRetry={() => void serviceDetailQuery.refetch()}
          />
        ) : (
          <>
            {/* 1. Historical Health Snapshots */}
            <Card variant="ivory">
              <CardHeader
                actions={
                  <Badge variant="neutral" mono>
                    {snapshots.length} Snapshot(s)
                  </Badge>
                }
              >
                <CardTitle>Historical Health Snapshots</CardTitle>
                <CardDescription>
                  Chronological state transitions, latency measurements, and error rates recorded
                  by backend probes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <DataTable
                  caption="Historical service health snapshots"
                  columns={[
                    { key: 'timestamp', header: 'Timestamp', mono: true },
                    {
                      key: 'state',
                      header: 'Evaluated State',
                      render: (row) => {
                        const st = row.state as OperationalServiceState;
                        return (
                          <Badge variant={operationalStateToVariant(st)} dot>
                            {operationalStateLabel(st)}
                          </Badge>
                        );
                      },
                    },
                    {
                      key: 'latencyMs',
                      header: 'Latency',
                      mono: true,
                      align: 'right',
                      render: (row) =>
                        typeof row.latencyMs === 'number'
                          ? `${Math.round(row.latencyMs)} ms`
                          : '—',
                    },
                    {
                      key: 'errorRatePercent',
                      header: 'Error Rate',
                      mono: true,
                      align: 'right',
                      render: (row) =>
                        typeof row.errorRatePercent === 'number'
                          ? `${row.errorRatePercent.toFixed(2)}%`
                          : '—',
                    },
                    {
                      key: 'note',
                      header: 'Diagnostic Note',
                      render: (row) => String(row.note ?? '—'),
                    },
                  ]}
                  data={snapshots as unknown as Record<string, unknown>[]}
                  rowKey={(row, idx) => `${String(row.timestamp)}-${idx}`}
                  emptyTitle="No historical health snapshots available"
                  emptyDescription="The backend did not return historical status snapshots for this service."
                />

                {chartSnapshots.length > 0 && (
                  <div className="pt-3 border-t border-border-warm">
                    <div className="text-xs font-semibold text-ink-primary mb-2">
                      Historical Latency Trend (ms)
                    </div>
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartSnapshots}>
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
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Error Summaries & 3. Relevant Incidents */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              <div className="xl:col-span-7">
                <Card variant="ivory" className="h-full">
                  <CardHeader>
                    <CardTitle>Error Summaries &amp; Outcome Classifications</CardTitle>
                    <CardDescription>
                      Distinguishes confirmed transaction failures from request timeouts and
                      pending outcomes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      caption="Service error summaries"
                      columns={[
                        { key: 'errorCode', header: 'Error Code', mono: true },
                        { key: 'message', header: 'Diagnostic Summary' },
                        {
                          key: 'outcomeClassification',
                          header: 'Outcome State',
                          render: (row) =>
                            transactionOutcomeBadge(
                              row.outcomeClassification as TransactionOutcomeState
                            ),
                        },
                        {
                          key: 'occurrencesCount',
                          header: 'Count',
                          mono: true,
                          align: 'right',
                        },
                        {
                          key: 'lastObservedAt',
                          header: 'Last Observed',
                          mono: true,
                          align: 'right',
                        },
                      ]}
                      data={
                        (detail?.errorSummaries ?? []) as unknown as Record<string, unknown>[]
                      }
                      rowKey={(row) => String(row.id)}
                      emptyTitle="No error summaries recorded"
                      emptyDescription="Zero error summaries were returned by the backend for this service."
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
                        <CardTitle>Relevant Incidents</CardTitle>
                        <CardDescription>
                          Incidents correlated with this service dependency.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <DataTable
                      caption="Relevant service incidents"
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
                        (detail?.relevantIncidents ?? []) as unknown as Record<
                          string,
                          unknown
                        >[]
                      }
                      rowKey={(row) => String(row.id)}
                      emptyTitle="No correlated incidents"
                      emptyDescription="Zero incidents are currently linked to this service."
                    />
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* 4. Recent Execution References */}
            <Card variant="ivory">
              <CardHeader
                actions={
                  <Link to="/monitoring/executions">
                    <Button variant="outline" size="xs">
                      All Synthetic Executions
                    </Button>
                  </Link>
                }
              >
                <CardTitle>Recent Synthetic Execution References</CardTitle>
                <CardDescription>
                  Synthetic journey executions that exercised this service dependency.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataTable
                  caption="Recent executions referencing this service"
                  columns={[
                    {
                      key: 'executionId',
                      header: 'Execution ID',
                      mono: true,
                      render: (row) => (
                        <Link
                          to={`/monitoring/executions?executionId=${encodeURIComponent(
                            String(row.executionId)
                          )}`}
                          className="text-burgundy hover:underline font-mono font-semibold"
                        >
                          {String(row.executionId)}
                        </Link>
                      ),
                    },
                    { key: 'journeyName', header: 'Business Journey' },
                    {
                      key: 'outcome',
                      header: 'Transaction Outcome',
                      render: (row) =>
                        transactionOutcomeBadge(row.outcome as TransactionOutcomeState),
                    },
                    {
                      key: 'latencyMs',
                      header: 'Service Latency',
                      mono: true,
                      align: 'right',
                      render: (row) =>
                        typeof row.latencyMs === 'number'
                          ? `${Math.round(row.latencyMs)} ms`
                          : '—',
                    },
                    {
                      key: 'timestamp',
                      header: 'Timestamp',
                      mono: true,
                      align: 'right',
                    },
                  ]}
                  data={
                    (detail?.recentExecutions ?? []) as unknown as Record<string, unknown>[]
                  }
                  rowKey={(row) => String(row.executionId)}
                  emptyTitle="No execution references returned"
                  emptyDescription="The backend did not include recent execution references for this service."
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  // =========================================================================
  // SERVICE HEALTH OVERVIEW & PAYMENT GATEWAY COMPARISON
  // =========================================================================
  return (
    <div className="space-y-5">
      {/* Page Header & State Classification Strip */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/recovery/playbooks">
                <Button variant="outline" size="sm">
                  Countermeasure Playbooks
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                isLoading={overviewQuery.isFetching}
                onClick={() => void overviewQuery.refetch()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Service Health
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
              <Server className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Service Health &amp; Payment Gateway Telemetry</CardTitle>
                <MonoCode>GET /api/v1/services/health</MonoCode>
              </div>
              <CardDescription>
                Operational visibility across primary and secondary payment gateways,
                authentication, product catalog, cart, checkout, and order confirmation services.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardFooter>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-medium text-ink-primary">Discovered State Summary:</span>
            <Badge variant="healthy" dot>
              Healthy: {stateCounts.healthy}
            </Badge>
            <Badge variant="warning" dot>
              Degraded: {stateCounts.degraded}
            </Badge>
            <Badge variant="critical" dot>
              Unhealthy: {stateCounts.unhealthy}
            </Badge>
            <Badge variant="neutral" dot>
              Unknown / Stale: {stateCounts.unknownOrStale}
            </Badge>
          </div>
          <div className="text-[11px] text-ink-secondary">
            Missing or unprobed telemetry is classified as{' '}
            <span className="font-semibold text-ink-primary">Unknown / Stale</span> — never
            Healthy.
          </div>
        </CardFooter>
      </Card>

      {/* =====================================================================
          PAYMENT GATEWAY COMPARISON (Primary vs. Secondary Gateway)
          ===================================================================== */}
      <section aria-labelledby="gateway-comparison-heading">
        <Card variant="ivory">
          <CardHeader
            actions={
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    isPrimaryFailingWhileSecondaryHealthy
                      ? 'critical'
                      : primaryGateway && secondaryGateway
                        ? 'info'
                        : 'neutral'
                  }
                  dot
                >
                  {isPrimaryFailingWhileSecondaryHealthy
                    ? 'Primary Gateway Impaired — Secondary Healthy'
                    : primaryGateway || secondaryGateway
                      ? 'Gateway Telemetry Active'
                      : 'Awaiting Gateway Telemetry'}
                </Badge>
              </div>
            }
          >
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-burgundy shrink-0" aria-hidden="true" />
              <div>
                <CardTitle id="gateway-comparison-heading">
                  Payment Gateway Comparison (Primary vs. Secondary)
                </CardTitle>
                <CardDescription>
                  Side-by-side comparison of availability, error rates, latency, last successful
                  transaction, failover activity, and verification status.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Divergence Alert Banner when Primary is failing while Secondary is healthy */}
            {isPrimaryFailingWhileSecondaryHealthy && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-status-critical/10 border border-status-critical/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="w-4 h-4 text-status-critical shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="text-xs">
                    <div className="font-heading font-semibold text-ink-primary">
                      Primary Payment Gateway is {primaryGateway?.state.toUpperCase()} while
                      Secondary Payment Gateway is HEALTHY
                    </div>
                    <p className="text-ink-secondary mt-0.5 leading-relaxed">
                      Gateway traffic switching cannot be triggered directly from this
                      observability view. Review verified countermeasure playbooks or pending
                      approvals to coordinate a safe failover.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to="/recovery/playbooks">
                    <Button
                      variant="primary"
                      size="xs"
                      rightIcon={<ArrowUpRight className="w-3 h-3" />}
                    >
                      Countermeasure Playbooks
                    </Button>
                  </Link>
                  <Link to="/recovery/approvals">
                    <Button variant="outline" size="xs">
                      Approval Queue
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Side-by-Side Gateway Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {[
                {
                  slotLabel: 'Primary Payment Gateway',
                  roleKey: 'primary_payment_gateway',
                  gateway: primaryGateway,
                },
                {
                  slotLabel: 'Secondary Payment Gateway (Failover)',
                  roleKey: 'secondary_payment_gateway',
                  gateway: secondaryGateway,
                },
              ].map(({ slotLabel, roleKey, gateway }) => {
                const effectiveState: OperationalServiceState = gateway
                  ? gateway.state
                  : 'unknown';

                return (
                  <div
                    key={roleKey}
                    className={[
                      'rounded-lg border p-4 space-y-3',
                      effectiveState === 'unhealthy'
                        ? 'bg-status-critical/5 border-status-critical/40'
                        : effectiveState === 'degraded' || effectiveState === 'stale'
                          ? 'bg-status-warning/5 border-status-warning/40'
                          : 'bg-surface-cream/60 border-border-warm',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CreditCard
                          className="w-4 h-4 text-burgundy shrink-0"
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-secondary">
                            {slotLabel}
                          </div>
                          <h3 className="font-heading text-sm font-bold text-ink-primary">
                            {gateway ? gateway.name : 'Not Configured / No Backend Signal'}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Badge variant={operationalStateToVariant(effectiveState)} dot>
                          {operationalStateLabel(effectiveState)}
                        </Badge>
                        {gateway?.verificationStatus && (
                          <Badge
                            variant={
                              gateway.verificationStatus === 'verified'
                                ? 'healthy'
                                : gateway.verificationStatus === 'failed'
                                  ? 'critical'
                                  : 'neutral'
                            }
                          >
                            {gateway.verificationStatus.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border-warm text-xs">
                      <div>
                        <dt className="text-[11px] text-ink-secondary">Availability</dt>
                        <dd className="font-mono font-semibold text-ink-primary mt-0.5">
                          {typeof gateway?.availabilityPercent === 'number'
                            ? `${gateway.availabilityPercent.toFixed(2)}%`
                            : '— (Unknown)'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-secondary">Error Rate</dt>
                        <dd className="font-mono font-semibold text-ink-primary mt-0.5">
                          {typeof gateway?.errorRatePercent === 'number'
                            ? `${gateway.errorRatePercent.toFixed(2)}%`
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-secondary">Latency (Avg / P95)</dt>
                        <dd className="font-mono font-semibold text-ink-primary mt-0.5">
                          {typeof gateway?.latencyMs === 'number'
                            ? `${Math.round(gateway.latencyMs)} ms`
                            : '—'}
                          {typeof gateway?.p95LatencyMs === 'number'
                            ? ` / ${Math.round(gateway.p95LatencyMs)} ms`
                            : ''}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-secondary">Recent Failures</dt>
                        <dd className="font-mono text-ink-primary mt-0.5">
                          {typeof gateway?.recentErrorsCount === 'number'
                            ? `${gateway.recentErrorsCount} event(s)`
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-secondary">
                          Last Successful Txn
                        </dt>
                        <dd className="font-mono text-ink-primary mt-0.5">
                          {gateway?.lastSuccessfulTransactionAt ?? '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-secondary">
                          Recovery / Failover
                        </dt>
                        <dd className="font-mono text-ink-primary mt-0.5 truncate">
                          {gateway?.failoverActivitySummary ??
                            (typeof gateway?.trafficSharePercent === 'number'
                              ? `Traffic share: ${gateway.trafficSharePercent}%`
                              : 'None reported')}
                        </dd>
                      </div>
                    </dl>

                    <div className="pt-2 border-t border-border-warm/70 flex items-center justify-between gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-ink-secondary">
                          Latest Probe Outcome:
                        </span>
                        {transactionOutcomeBadge(gateway?.lastTransactionOutcome ?? null)}
                      </div>

                      {gateway && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleOpenServiceDetail(gateway.id)}
                          leftIcon={<Eye className="w-3 h-3" />}
                        >
                          Inspect Gateway
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* =====================================================================
          SERVICE OVERVIEW FILTER BAR & TABLE
          ===================================================================== */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Filter services by name, ID, category, or error message..."
        filters={[
          {
            id: 'service-state-filter',
            label: 'Health State',
            value: stateFilter,
            options: [
              { value: 'all', label: 'All States' },
              { value: 'healthy', label: 'Healthy' },
              { value: 'degraded', label: 'Degraded' },
              { value: 'unhealthy', label: 'Unhealthy' },
              { value: 'unknown_or_stale', label: 'Unknown or Stale' },
            ],
            onChange: setStateFilter,
          },
          {
            id: 'service-role-filter',
            label: 'Service Role',
            value: roleFilter,
            options: [
              { value: 'all', label: 'All Service Roles' },
              ...EXPECTED_SERVICE_ROLES.map((r) => ({
                value: r.role,
                label: r.label,
              })),
              { value: 'other', label: 'Other Services' },
            ],
            onChange: setRoleFilter,
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setStateFilter('all');
          setRoleFilter('all');
        }}
      />

      {overviewQuery.isFetching ? (
        <LoadingState
          title="Probing service health endpoints"
          description="Querying GET /api/v1/services/health..."
          rows={5}
        />
      ) : overviewQuery.isError && overviewQuery.error?.isUnavailable ? (
        <div className="space-y-4">
          <UnavailableState
            title="Service Health Telemetry API Unavailable"
            description="Endpoint GET /api/v1/services/health did not respond. Continuum does not interpret missing data as healthy; all expected transaction services remain in an explicit UNKNOWN state until verified by the backend."
            endpoint="/api/v1/services/health"
            onRetry={() => void overviewQuery.refetch()}
          />

          {/* Expected Transaction System Topology Reference (Explicitly marked UNKNOWN) */}
          <Card variant="ivory">
            <CardHeader
              actions={
                <Badge variant="neutral" dot>
                  All States: UNKNOWN (Unprobed)
                </Badge>
              }
            >
              <CardTitle>
                Expected Synthetic Transaction System Topology (Awaiting Backend API)
              </CardTitle>
              <CardDescription>
                These service roles will populate with live telemetry once{' '}
                <MonoCode>GET /api/v1/services/health</MonoCode> is online. Missing data is
                strictly classified as <MonoCode>UNKNOWN</MonoCode>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {EXPECTED_SERVICE_ROLES.map((spec) => (
                  <div
                    key={spec.role}
                    className="p-3 rounded-md bg-surface-cream/60 border border-border-warm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase text-ink-secondary">
                          {spec.category}
                        </span>
                        <Badge variant="neutral" dot>
                          UNKNOWN
                        </Badge>
                      </div>
                      <div className="text-xs font-semibold text-ink-primary mt-1.5">
                        {spec.label}
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-border-warm/60 flex items-center justify-between text-[11px] font-mono text-ink-secondary">
                      <span>Latency: —</span>
                      <span>Checked: Never</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : overviewQuery.isError ? (
        <ErrorState
          title="Failed to query service health"
          message={overviewQuery.error?.message ?? 'Error fetching service health'}
          statusCode={overviewQuery.error?.status}
          endpoint="/api/v1/services/health"
          onRetry={() => void overviewQuery.refetch()}
        />
      ) : filteredServices.length === 0 ? (
        <EmptyState
          title="No configured services matched the active filter"
          description="Either the backend returned zero service health nodes or your filter criteria excluded all services."
          endpoint="/api/v1/services/health"
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setStateFilter('all');
            setRoleFilter('all');
          }}
        />
      ) : (
        <Card variant="ivory">
          <DataTable
            caption="Discovered services operational health table"
            columns={[
              {
                key: 'name',
                header: 'Service Name & Role',
                render: (row) => {
                  const svc = row as unknown as MonitoredServiceNode;
                  return (
                    <div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenServiceDetail(svc.id);
                          }}
                          className="font-heading text-xs font-semibold text-burgundy hover:underline text-left"
                        >
                          {svc.name}
                        </button>
                        <MonoCode>{svc.id}</MonoCode>
                      </div>
                      {svc.category && (
                        <div className="text-[11px] text-ink-secondary mt-0.5">
                          {svc.category}
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'state',
                header: 'Current Health',
                render: (row) => {
                  const svc = row as unknown as MonitoredServiceNode;
                  return (
                    <div className="flex items-center gap-1.5">
                      <Badge variant={operationalStateToVariant(svc.state)} dot>
                        {operationalStateLabel(svc.state)}
                      </Badge>
                      {svc.isStale && svc.state !== 'stale' && (
                        <Badge variant="warning">Stale</Badge>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'recentErrorsCount',
                header: 'Recent Errors',
                render: (row) => {
                  const svc = row as unknown as MonitoredServiceNode;
                  return (
                    <div className="text-xs">
                      <div className="font-mono text-ink-primary">
                        {typeof svc.recentErrorsCount === 'number'
                          ? `${svc.recentErrorsCount} error(s)`
                          : typeof svc.errorRatePercent === 'number'
                            ? `${svc.errorRatePercent.toFixed(2)}% err rate`
                            : '—'}
                      </div>
                      {svc.latestErrorSummary && (
                        <div className="text-[11px] text-status-critical truncate max-w-xs">
                          {svc.latestErrorSummary}
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'latencyMs',
                header: 'Latency',
                mono: true,
                align: 'right',
                render: (row) => {
                  const svc = row as unknown as MonitoredServiceNode;
                  return typeof svc.latencyMs === 'number'
                    ? `${Math.round(svc.latencyMs)} ms`
                    : '—';
                },
              },
              {
                key: 'lastCheckedAt',
                header: 'Last Checked',
                mono: true,
                align: 'right',
                render: (row) => {
                  const svc = row as unknown as MonitoredServiceNode;
                  return svc.lastCheckedAt ?? 'Unknown';
                },
              },
              {
                key: 'statusHistory',
                header: 'Recent Status History',
                sortable: false,
                render: (row) => {
                  const svc = row as unknown as MonitoredServiceNode;
                  return <StatusHistoryStrip snapshots={svc.statusHistory} />;
                },
              },
              {
                key: 'actions',
                header: 'Details',
                align: 'right',
                sortable: false,
                render: (row) => {
                  const svc = row as unknown as MonitoredServiceNode;
                  return (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenServiceDetail(svc.id);
                      }}
                      leftIcon={<Eye className="w-3 h-3" />}
                    >
                      Inspect
                    </Button>
                  );
                },
              },
            ]}
            data={filteredServices as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => handleOpenServiceDetail(String(row.id))}
          />
        </Card>
      )}

      {/* =====================================================================
          OBSERVABILITY & PAYMENT SAFETY GUARDRAILS FOOTER
          ===================================================================== */}
      <Card variant="subtle" padding="sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-ink-secondary">
          <div className="flex items-start gap-2">
            <Lock className="w-4 h-4 text-burgundy shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-ink-primary block">
                Observability-Only Interface
              </span>
              Continuum never collects, transmits, or renders real payment card numbers, CVVs,
              or sensitive cardholder credentials.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-status-warning shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-ink-primary block">
                Timeout vs. Failure Distinction
              </span>
              Timed-out probe requests are classified as{' '}
              <MonoCode>Timeout — Outcome Unknown</MonoCode> and are never conflated with
              confirmed payment failures.
            </div>
          </div>

          <div className="flex items-start gap-2">
            <ShieldCheck
              className="w-4 h-4 text-status-healthy shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div>
              <span className="font-semibold text-ink-primary block">
                Safeguarded Gateway Switching
              </span>
              Payment gateway routing cannot be mutated directly from telemetry charts; all
              failovers require verified recovery playbooks and approval gates.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
