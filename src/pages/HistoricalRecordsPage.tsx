import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  BarChart3,
  Download,
  LineChart as LineChartIcon,
  RefreshCw,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useShell } from '../context/ShellContext';
import { DESIGN_TOKENS } from '../styles/tokens';
import { useExecutionsListQuery } from '../api/journeysAndExecutions';
import { useIncidentsListQuery } from '../api/incidentsAndRca';
import { useServiceHealthOverviewQuery } from '../api/serviceHealth';
import { useCommandCenterData } from '../api/commandCenter';
import {
  exportRecordsToCsv,
  type HistoricalLedgerCategory,
} from '../api/failurePatternsAndHistory';
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
  FilterBar,
  LoadingState,
  MonoCode,
  Select,
} from '../components/ui';

export const HistoricalRecordsPage: React.FC = () => {
  const { timeRange } = useShell();

  // Active ledger domain tab
  const [activeLedger, setActiveLedger] =
    useState<HistoricalLedgerCategory>('executions');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Queries for the 4 historical ledger domains
  const executionsQuery = useExecutionsListQuery(timeRange);
  const incidentsQuery = useIncidentsListQuery(timeRange);
  const servicesQuery = useServiceHealthOverviewQuery(timeRange);
  const commandCenterData = useCommandCenterData(timeRange);
  const recoveryExecutionsQuery = commandCenterData.recoveryExecutionsQuery;

  // Flattened Service Snapshots from discovered services
  const serviceSnapshots = useMemo(() => {
    const list = servicesQuery.data?.services ?? [];
    return list.flatMap((svc) =>
      svc.statusHistory.map((snap, idx) => ({
        id: `${svc.id}-snap-${idx}`,
        serviceId: svc.id,
        serviceName: svc.name,
        state: snap.state,
        latencyMs: snap.latencyMs,
        errorRatePercent: snap.errorRatePercent,
        timestamp: snap.timestamp,
        note: snap.note,
      }))
    );
  }, [servicesQuery.data?.services]);

  // Unified items according to activeLedger
  const currentItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    if (activeLedger === 'executions') {
      const execs = executionsQuery.data ?? [];
      return execs.filter((item) => {
        const matchesSearch =
          !q ||
          item.id.toLowerCase().includes(q) ||
          item.journeyName.toLowerCase().includes(q) ||
          (item.errorSummary?.toLowerCase().includes(q) ?? false);
        const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
        return matchesSearch && matchesStatus;
      });
    }

    if (activeLedger === 'incidents') {
      const incs = incidentsQuery.data ?? [];
      return incs.filter((item) => {
        const matchesSearch =
          !q ||
          item.id.toLowerCase().includes(q) ||
          item.title.toLowerCase().includes(q) ||
          (item.affectedJourneyName?.toLowerCase().includes(q) ?? false) ||
          (item.affectedServiceName?.toLowerCase().includes(q) ?? false);
        const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
        return matchesSearch && matchesStatus;
      });
    }

    if (activeLedger === 'service_snapshots') {
      return serviceSnapshots.filter((item) => {
        const matchesSearch =
          !q ||
          item.serviceName.toLowerCase().includes(q) ||
          item.serviceId.toLowerCase().includes(q);
        const matchesStatus = statusFilter === 'all' || item.state === statusFilter;
        return matchesSearch && matchesStatus;
      });
    }

    if (activeLedger === 'recovery_events') {
      const recs = recoveryExecutionsQuery.data ?? [];
      return recs.filter((item) => {
        const matchesSearch =
          !q ||
          item.id.toLowerCase().includes(q) ||
          item.playbookName.toLowerCase().includes(q) ||
          item.targetServiceOrJourney.toLowerCase().includes(q);
        const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
        return matchesSearch && matchesStatus;
      });
    }

    return [];
  }, [
    activeLedger,
    executionsQuery.data,
    incidentsQuery.data,
    serviceSnapshots,
    recoveryExecutionsQuery.data,
    searchQuery,
    statusFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(currentItems.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return currentItems.slice(start, start + pageSize);
  }, [currentItems, safePage, pageSize]);

  // CSV Export for already retrieved records
  const handleExportCsv = () => {
    const timestampStr = new Date().toISOString().slice(0, 10);

    if (activeLedger === 'executions') {
      const headers = ['Execution ID', 'Journey', 'Started At', 'Duration (ms)', 'Status', 'Failed Step', 'Error Code'];
      const rows = (currentItems as typeof executionsQuery.data ?? []).map((e) => [
        e.id,
        e.journeyName,
        e.startedAt,
        e.durationMs ?? '',
        e.status,
        e.failedStepName ?? '',
        e.errorCode ?? '',
      ]);
      exportRecordsToCsv(`continuum_executions_${timestampStr}`, headers, rows);
    } else if (activeLedger === 'incidents') {
      const headers = ['Incident ID', 'Title', 'Severity', 'Status', 'First Detected', 'Latest Update', 'Journey', 'Service'];
      const rows = (currentItems as typeof incidentsQuery.data ?? []).map((i) => [
        i.id,
        i.title,
        i.severity,
        i.status,
        i.firstSeenAt,
        i.latestUpdateAt,
        i.affectedJourneyName ?? '',
        i.affectedServiceName ?? '',
      ]);
      exportRecordsToCsv(`continuum_incidents_${timestampStr}`, headers, rows);
    } else if (activeLedger === 'service_snapshots') {
      const headers = ['Service ID', 'Service Name', 'State', 'Latency (ms)', 'Error Rate (%)', 'Timestamp'];
      const rows = serviceSnapshots.map((s) => [
        s.serviceId,
        s.serviceName,
        s.state,
        s.latencyMs ?? '',
        s.errorRatePercent ?? '',
        s.timestamp,
      ]);
      exportRecordsToCsv(`continuum_service_snapshots_${timestampStr}`, headers, rows);
    } else if (activeLedger === 'recovery_events') {
      const headers = ['Execution ID', 'Playbook', 'Target', 'Status', 'Verification Result', 'Executed At'];
      const rows = (currentItems as typeof recoveryExecutionsQuery.data ?? []).map((r) => [
        r.id,
        r.playbookName,
        r.targetServiceOrJourney,
        r.status,
        r.verificationResult ?? '',
        r.executedAt,
      ]);
      exportRecordsToCsv(`continuum_recovery_events_${timestampStr}`, headers, rows);
    }
  };

  // Check if active query is fetching
  const isQueryFetching =
    activeLedger === 'executions'
      ? executionsQuery.isFetching
      : activeLedger === 'incidents'
        ? incidentsQuery.isFetching
        : activeLedger === 'service_snapshots'
          ? servicesQuery.isFetching
          : recoveryExecutionsQuery.isFetching;

  // Chart data: Only prepared when at least 3 real records exist
  const executionsChartData = useMemo(() => {
    const list = executionsQuery.data ?? [];
    if (list.length < 3) return [];
    return list
      .filter((e) => typeof e.durationMs === 'number')
      .slice(-10)
      .map((e) => ({
        label: e.id,
        durationMs: e.durationMs ?? 0,
        status: e.status,
      }));
  }, [executionsQuery.data]);

  const incidentsChartData = useMemo(() => {
    const list = incidentsQuery.data ?? [];
    if (list.length < 2) return [];
    const counts: Record<string, number> = {};
    for (const inc of list) {
      const day = inc.firstSeenAt.split(' ')[0] || inc.firstSeenAt.slice(0, 10);
      counts[day] = (counts[day] || 0) + 1;
    }
    return Object.entries(counts).map(([date, count]) => ({ date, count }));
  }, [incidentsQuery.data]);

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={currentItems.length === 0}
                leftIcon={<Download className="w-3.5 h-3.5" />}
              >
                Export Retreived CSV ({currentItems.length})
              </Button>
              <Button
                variant="primary"
                size="sm"
                isLoading={isQueryFetching}
                onClick={() => {
                  if (activeLedger === 'executions') void executionsQuery.refetch();
                  else if (activeLedger === 'incidents') void incidentsQuery.refetch();
                  else if (activeLedger === 'service_snapshots') void servicesQuery.refetch();
                  else void recoveryExecutionsQuery.refetch();
                }}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Ledger
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
              <Archive className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Historical Records &amp; Compliance Ledgers</CardTitle>
                <Badge variant="neutral" mono>
                  Window: {timeRange}
                </Badge>
              </div>
              <CardDescription>
                Searchable, compliance-grade audit ledgers across synthetic transactions,
                reliability incidents, service health snapshots, and executed countermeasures.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Domain Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Historical ledger domains"
        className="inline-flex rounded-md border border-border-warm bg-surface-cream p-1 gap-1"
      >
        {[
          { id: 'executions', label: 'Synthetic Executions', count: executionsQuery.data?.length },
          { id: 'incidents', label: 'Incident Records', count: incidentsQuery.data?.length },
          { id: 'service_snapshots', label: 'Service Health Snapshots', count: serviceSnapshots.length },
          { id: 'recovery_events', label: 'Recovery Events', count: recoveryExecutionsQuery.data?.length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeLedger === tab.id}
            onClick={() => {
              setActiveLedger(tab.id as HistoricalLedgerCategory);
              setCurrentPage(1);
              setStatusFilter('all');
            }}
            className={[
              'px-3.5 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-2',
              activeLedger === tab.id
                ? 'bg-burgundy text-surface-ivory shadow-subtle'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70',
            ].join(' ')}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <Badge variant={activeLedger === tab.id ? 'burgundy' : 'neutral'} mono>
                {tab.count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setCurrentPage(1);
        }}
        searchPlaceholder={`Filter ${activeLedger.replace(/_/g, ' ')} by ID, target, or outcome...`}
        filters={[
          {
            id: 'history-status-filter',
            label: 'Status',
            value: statusFilter,
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'passed', label: 'Passed / Healthy' },
              { value: 'failed', label: 'Failed / Unhealthy' },
              { value: 'verified', label: 'Verified' },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            },
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setStatusFilter('all');
          setCurrentPage(1);
        }}
      />

      {/* Ledger DataTable & States */}
      {isQueryFetching ? (
        <LoadingState
          title={`Retrieving historical ${activeLedger.replace(/_/g, ' ')} ledger`}
          description="Awaiting structured audit response from authorized backend query..."
          rows={5}
        />
      ) : paginatedItems.length === 0 ? (
        <EmptyState
          title={`No ${activeLedger.replace(/_/g, ' ')} records found`}
          description="Zero historical records matched the active search or status filter in this evaluation window."
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setStatusFilter('all');
            setCurrentPage(1);
          }}
        />
      ) : (
        <Card variant="ivory">
          {activeLedger === 'executions' && (
            <DataTable
              caption="Historical synthetic executions ledger"
              columns={[
                {
                  key: 'id',
                  header: 'Execution ID',
                  mono: true,
                  render: (row) => (
                    <Link
                      to={`/monitoring/executions?executionId=${encodeURIComponent(String(row.id))}`}
                      className="text-burgundy hover:underline font-mono font-semibold"
                    >
                      {String(row.id)}
                    </Link>
                  ),
                },
                { key: 'journeyName', header: 'Monitored Journey' },
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
                  key: 'status',
                  header: 'Status',
                  render: (row) => (
                    <Badge variant={row.status === 'passed' ? 'healthy' : 'critical'} dot>
                      {String(row.status).toUpperCase()}
                    </Badge>
                  ),
                },
                { key: 'startedAt', header: 'Timestamp', mono: true, align: 'right' },
              ]}
              data={paginatedItems as unknown as Record<string, unknown>[]}
              rowKey={(row) => String(row.id)}
            />
          )}

          {activeLedger === 'incidents' && (
            <DataTable
              caption="Historical incidents ledger"
              columns={[
                {
                  key: 'id',
                  header: 'Incident ID',
                  mono: true,
                  render: (row) => (
                    <Link
                      to={`/intelligence/incidents?incidentId=${encodeURIComponent(String(row.id))}`}
                      className="text-burgundy hover:underline font-mono font-semibold"
                    >
                      {String(row.id)}
                    </Link>
                  ),
                },
                { key: 'title', header: 'Incident Title' },
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
                    <Badge variant={row.status === 'resolved' ? 'healthy' : 'warning'}>
                      {String(row.status)}
                    </Badge>
                  ),
                },
                { key: 'firstSeenAt', header: 'First Detected', mono: true, align: 'right' },
              ]}
              data={paginatedItems as unknown as Record<string, unknown>[]}
              rowKey={(row) => String(row.id)}
            />
          )}

          {activeLedger === 'service_snapshots' && (
            <DataTable
              caption="Historical service health snapshots ledger"
              columns={[
                {
                  key: 'serviceName',
                  header: 'Service Dependency',
                  render: (row) => (
                    <Link
                      to={`/monitoring/service-health?serviceId=${encodeURIComponent(String(row.serviceId))}`}
                      className="text-burgundy hover:underline font-semibold"
                    >
                      {String(row.serviceName)}
                    </Link>
                  ),
                },
                {
                  key: 'state',
                  header: 'Snapshot State',
                  render: (row) => (
                    <Badge variant={row.state === 'healthy' ? 'healthy' : 'warning'} dot>
                      {String(row.state).toUpperCase()}
                    </Badge>
                  ),
                },
                {
                  key: 'latencyMs',
                  header: 'Measured Latency',
                  mono: true,
                  align: 'right',
                  render: (row) =>
                    typeof row.latencyMs === 'number'
                      ? `${Math.round(row.latencyMs)} ms`
                      : '—',
                },
                { key: 'timestamp', header: 'Timestamp', mono: true, align: 'right' },
              ]}
              data={paginatedItems as unknown as Record<string, unknown>[]}
              rowKey={(row) => String(row.id)}
            />
          )}

          {activeLedger === 'recovery_events' && (
            <DataTable
              caption="Historical recovery countermeasures ledger"
              columns={[
                {
                  key: 'id',
                  header: 'Action ID',
                  mono: true,
                  render: (row) => <MonoCode>{String(row.id)}</MonoCode>,
                },
                { key: 'playbookName', header: 'Countermeasure Playbook' },
                { key: 'targetServiceOrJourney', header: 'Target Scope' },
                {
                  key: 'status',
                  header: 'Execution State',
                  render: (row) => (
                    <Badge variant={row.status === 'verified' ? 'healthy' : 'warning'} dot>
                      {String(row.status).toUpperCase()}
                    </Badge>
                  ),
                },
                { key: 'executedAt', header: 'Timestamp', mono: true, align: 'right' },
              ]}
              data={paginatedItems as unknown as Record<string, unknown>[]}
              rowKey={(row) => String(row.id)}
            />
          )}

          <CardFooter>
            <div className="flex items-center gap-2">
              <span>
                Showing {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, currentItems.length)} of {currentItems.length} record(s)
              </span>
              <Select
                aria-label="Records per page"
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

      {/* =====================================================================
          HISTORICAL TREND ANALYTICS (Rendered Strictly on Sufficient Real Data)
          ===================================================================== */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-burgundy" />
              <span className="text-xs font-semibold text-ink-primary">
                Reliability Analytics
              </span>
            </div>
          }
        >
          <CardTitle>Historical Trend Analytics &amp; Anomaly Rollups</CardTitle>
          <CardDescription>
            Visualized strictly when sufficient real historical data points are available. Never
            interpolates trends from insufficient or fabricated samples.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {executionsChartData.length < 3 && incidentsChartData.length < 2 ? (
            <div className="p-6 rounded-lg bg-surface-cream/60 border border-border-warm text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-surface-secondary border border-border-warm mx-auto flex items-center justify-center text-ink-secondary">
                <LineChartIcon className="w-4 h-4" />
              </div>
              <h4 className="font-heading text-xs font-semibold text-ink-primary">
                Insufficient Historical Telemetry for Trend Visualization
              </h4>
              <p className="text-xs text-ink-secondary max-w-md mx-auto leading-relaxed">
                To prevent misleading trend interpretation, historical charts require at least 3
                verified execution duration records or 2 distinct incident dates. As real backend
                telemetry accumulates, trend lines will automatically render.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {executionsChartData.length >= 3 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-ink-primary">
                    Recent Execution Latencies (ms)
                  </div>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={executionsChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={DESIGN_TOKENS.colors.warmBorder}
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                        />
                        <YAxis
                          tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                            borderColor: DESIGN_TOKENS.colors.warmBorder,
                            fontSize: '11px',
                          }}
                        />
                        <Bar
                          dataKey="durationMs"
                          name="Duration (ms)"
                          fill={DESIGN_TOKENS.colors.deepBurgundy}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {incidentsChartData.length >= 2 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-ink-primary">
                    Incident Frequency by Date
                  </div>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={incidentsChartData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={DESIGN_TOKENS.colors.warmBorder}
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                        />
                        <YAxis
                          tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                            borderColor: DESIGN_TOKENS.colors.warmBorder,
                            fontSize: '11px',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          name="Incidents Opened"
                          stroke={DESIGN_TOKENS.colors.status.critical}
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
