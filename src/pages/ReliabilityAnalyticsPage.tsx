import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  PieChart as PieChartIcon,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useShell } from '../context/ShellContext';
import { DESIGN_TOKENS } from '../styles/tokens';
import { useReliabilityAnalyticsEndpointQuery } from '../api/analytics';
import {
  useExecutionsListQuery,
  useJourneysListQuery,
} from '../api/journeysAndExecutions';
import { useIncidentsListQuery } from '../api/incidentsAndRca';
import { useServiceHealthOverviewQuery } from '../api/serviceHealth';
import {
  exportRecordsToCsv,
  useFailurePatternsQuery,
} from '../api/failurePatternsAndHistory';
import {
  usePlaybooksListQuery,
  useRecoveryExecutionsQuery,
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
  EmptyState,
  LoadingState,
  Select,
  UnavailableState,
} from '../components/ui';

export const ReliabilityAnalyticsPage: React.FC = () => {
  const { timeRange } = useShell();

  // Multi-attribute filters
  const [journeyFilter, setJourneyFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [failureCategoryFilter, setFailureCategoryFilter] = useState('all');
  const [playbookFilter, setPlaybookFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active analytics drill-down tab
  const [activeTab, setActiveTab] = useState<
    'overview' | 'journeys' | 'incidents' | 'services' | 'recoveries'
  >('overview');

  // Queries for all reliability domains
  const analyticsEndpointQuery = useReliabilityAnalyticsEndpointQuery(timeRange);
  const journeysQuery = useJourneysListQuery(timeRange);
  const executionsQuery = useExecutionsListQuery(timeRange, journeyFilter);
  const incidentsQuery = useIncidentsListQuery(timeRange);
  const servicesQuery = useServiceHealthOverviewQuery(timeRange);
  const patternsQuery = useFailurePatternsQuery(timeRange);
  const recoveryExecutionsQuery = useRecoveryExecutionsQuery(timeRange);
  const playbooksQuery = usePlaybooksListQuery(timeRange);

  const rawJourneys = journeysQuery.data ?? [];
  const rawExecutions = executionsQuery.data ?? [];
  const rawIncidents = incidentsQuery.data ?? [];
  const rawServices = servicesQuery.data?.services ?? [];
  const rawPatterns = patternsQuery.data ?? [];
  const rawRecoveryExecutions = recoveryExecutionsQuery.data ?? [];
  const rawPlaybooks = playbooksQuery.data ?? [];

  // ---------------------------------------------------------------------------
  // Filter Options
  // ---------------------------------------------------------------------------
  const journeyOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Monitored Journeys' },
      ...rawJourneys.map((j) => ({ value: j.id, label: j.name })),
    ];
  }, [rawJourneys]);

  const serviceOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Services & Gateways' },
      ...rawServices.map((s) => ({ value: s.id, label: s.name })),
    ];
  }, [rawServices]);

  const severityOptions = [
    { value: 'all', label: 'All Severities' },
    { value: 'critical', label: 'Critical / SEV-1' },
    { value: 'high', label: 'High / SEV-2' },
    { value: 'medium', label: 'Medium / SEV-3' },
    { value: 'low', label: 'Low / Minor' },
  ];

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    rawPatterns.forEach((p) => {
      if (p.category) categories.add(p.category);
    });
    return [
      { value: 'all', label: 'All Failure Categories' },
      ...Array.from(categories).map((c) => ({ value: c, label: c })),
    ];
  }, [rawPatterns]);

  const playbookOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Recovery Playbooks' },
      ...rawPlaybooks.map((pb) => ({ value: pb.id, label: pb.name })),
    ];
  }, [rawPlaybooks]);

  // ---------------------------------------------------------------------------
  // Filtered Datasets
  // ---------------------------------------------------------------------------
  const filteredExecutions = useMemo(() => {
    return rawExecutions.filter((item) => {
      const matchJourney = journeyFilter === 'all' || item.journeyId === journeyFilter;
      const matchSearch =
        !searchQuery ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.journeyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.errorSummary?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      return matchJourney && matchSearch;
    });
  }, [rawExecutions, journeyFilter, searchQuery]);

  const filteredIncidents = useMemo(() => {
    return rawIncidents.filter((inc) => {
      const matchJourney =
        journeyFilter === 'all' || inc.affectedJourneyId === journeyFilter;
      const matchService =
        serviceFilter === 'all' || inc.affectedServiceId === serviceFilter;
      const matchSev =
        severityFilter === 'all' ||
        inc.severity === severityFilter ||
        (severityFilter === 'critical' && inc.severity === 'sev1') ||
        (severityFilter === 'high' && inc.severity === 'sev2') ||
        (severityFilter === 'medium' && inc.severity === 'sev3');
      const matchSearch =
        !searchQuery ||
        inc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchJourney && matchService && matchSev && matchSearch;
    });
  }, [rawIncidents, journeyFilter, serviceFilter, severityFilter, searchQuery]);

  const filteredPatterns = useMemo(() => {
    return rawPatterns.filter((pat) => {
      const matchCategory =
        failureCategoryFilter === 'all' || pat.category === failureCategoryFilter;
      const matchJourney =
        journeyFilter === 'all' || pat.affectedJourneyId === journeyFilter;
      const matchService =
        serviceFilter === 'all' || pat.affectedServiceId === serviceFilter;
      const matchSearch =
        !searchQuery ||
        pat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pat.signatureHash.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchJourney && matchService && matchSearch;
    });
  }, [rawPatterns, failureCategoryFilter, journeyFilter, serviceFilter, searchQuery]);

  const filteredRecoveries = useMemo(() => {
    return rawRecoveryExecutions.filter((rec) => {
      const matchPlaybook =
        playbookFilter === 'all' || rec.playbookId === playbookFilter;
      const matchSearch =
        !searchQuery ||
        rec.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.playbookName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rec.incidentId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchPlaybook && matchSearch;
    });
  }, [rawRecoveryExecutions, playbookFilter, searchQuery]);

  // ---------------------------------------------------------------------------
  // Derived Reliability Metrics & Aggregations
  // ---------------------------------------------------------------------------

  // Overall Journey Success Rate
  const overallSuccessRate = useMemo(() => {
    if (filteredExecutions.length === 0) {
      if (rawJourneys.length > 0) {
        const withRate = rawJourneys.filter((j) => typeof j.successRate === 'number');
        if (withRate.length > 0) {
          const sum = withRate.reduce((acc, j) => acc + (j.successRate ?? 0), 0);
          return Math.round((sum / withRate.length) * 10) / 10;
        }
      }
      return null;
    }
    const passed = filteredExecutions.filter((e) => e.status === 'passed').length;
    return Math.round((passed / filteredExecutions.length) * 1000) / 10;
  }, [filteredExecutions, rawJourneys]);

  // Average Latency
  const averageLatencyMs = useMemo(() => {
    const withDuration = filteredExecutions.filter(
      (e) => typeof e.durationMs === 'number' && e.durationMs !== null
    );
    if (withDuration.length === 0) {
      const jWithLat = rawJourneys.filter((j) => typeof j.averageLatencyMs === 'number');
      if (jWithLat.length > 0) {
        const sum = jWithLat.reduce((acc, j) => acc + (j.averageLatencyMs ?? 0), 0);
        return Math.round(sum / jWithLat.length);
      }
      return null;
    }
    const sum = withDuration.reduce((acc, e) => acc + (e.durationMs ?? 0), 0);
    return Math.round(sum / withDuration.length);
  }, [filteredExecutions, rawJourneys]);

  // P95 Latency
  const p95LatencyMs = useMemo(() => {
    const durations = filteredExecutions
      .map((e) => e.durationMs)
      .filter((d): d is number => typeof d === 'number' && d !== null)
      .sort((a, b) => a - b);
    if (durations.length === 0) return null;
    const p95Idx = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
    return durations[p95Idx];
  }, [filteredExecutions]);

  // Service Fleet Availability Rate
  const fleetHealthPercent = useMemo(() => {
    if (rawServices.length === 0) return null;
    const healthyCount = rawServices.filter((s) => s.state === 'healthy').length;
    return Math.round((healthyCount / rawServices.length) * 1000) / 10;
  }, [rawServices]);

  // Recovery Success Rate (Strictly guarded)
  const recoverySuccessStats = useMemo(() => {
    if (filteredRecoveries.length === 0) {
      return { hasData: false, rate: null, verified: 0, failed: 0, rolledBack: 0, total: 0 };
    }
    const verified = filteredRecoveries.filter((r) => r.status === 'verified').length;
    const failed = filteredRecoveries.filter((r) => r.status === 'failed').length;
    const rolledBack = filteredRecoveries.filter((r) => r.status === 'rolled_back').length;
    const decided = verified + failed + rolledBack;
    if (decided === 0) {
      return { hasData: false, rate: null, verified, failed, rolledBack, total: filteredRecoveries.length };
    }
    const rate = Math.round((verified / decided) * 1000) / 10;
    return { hasData: true, rate, verified, failed, rolledBack, total: filteredRecoveries.length };
  }, [filteredRecoveries]);

  // MTTD / MTTR Calculation
  const mttrStats = useMemo(() => {
    // If backend provided mttd/mttr directly:
    if (analyticsEndpointQuery.data?.mttrMinutes !== null && analyticsEndpointQuery.data?.mttrMinutes !== undefined) {
      return {
        mttdMinutes: analyticsEndpointQuery.data.mttdMinutes,
        mttrMinutes: analyticsEndpointQuery.data.mttrMinutes,
        source: 'backend_analytics_engine' as const,
      };
    }

    // Derived from resolved incidents
    const resolved = filteredIncidents.filter((inc) => {
      return inc.status === 'resolved' && inc.firstSeenAt && inc.latestUpdateAt;
    });

    if (resolved.length === 0) {
      return { mttdMinutes: null, mttrMinutes: null, source: 'insufficient_records' as const };
    }

    const durationsMinutes = resolved.map((inc) => {
      const start = new Date(inc.firstSeenAt).getTime();
      const end = new Date(inc.latestUpdateAt).getTime();
      const diffMs = Math.max(0, end - start);
      return Math.round(diffMs / 60000);
    });

    const sum = durationsMinutes.reduce((a, b) => a + b, 0);
    const avgMttr = Math.round(sum / durationsMinutes.length);

    return {
      mttdMinutes: null, // MTTD requires synthetic run detection latency telemetry
      mttrMinutes: avgMttr,
      source: 'derived_incident_durations' as const,
    };
  }, [analyticsEndpointQuery.data, filteredIncidents]);

  // ---------------------------------------------------------------------------
  // Chart Data Preparation (Chronological & Aggregated)
  // ---------------------------------------------------------------------------

  // 1. Success Rate Over Time
  const journeySuccessTrendData = useMemo(() => {
    if (analyticsEndpointQuery.data?.timeSeries && analyticsEndpointQuery.data.timeSeries.length > 0) {
      return analyticsEndpointQuery.data.timeSeries.map((pt) => ({
        timestamp: pt.label,
        successRate: pt.successRate ?? null,
        latencyMs: pt.avgLatencyMs ?? null,
      }));
    }

    if (filteredExecutions.length < 2) return [];

    // Bucket executions into chronological intervals
    const sorted = [...filteredExecutions].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    );

    // Group into up to 10 equal buckets
    const bucketCount = Math.min(10, sorted.length);
    const chunkSize = Math.max(1, Math.floor(sorted.length / bucketCount));
    const points = [];

    for (let i = 0; i < sorted.length; i += chunkSize) {
      const slice = sorted.slice(i, i + chunkSize);
      const passed = slice.filter((s) => s.status === 'passed').length;
      const rate = Math.round((passed / slice.length) * 100);
      const withDuration = slice.filter((s) => typeof s.durationMs === 'number');
      const avgLat =
        withDuration.length > 0
          ? Math.round(
              withDuration.reduce((acc, curr) => acc + (curr.durationMs ?? 0), 0) /
                withDuration.length
            )
          : 0;

      const timeLabel = new Date(slice[0].startedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      points.push({
        timestamp: timeLabel,
        successRate: rate,
        latencyMs: avgLat,
        executionsCount: slice.length,
      });
    }

    return points;
  }, [analyticsEndpointQuery.data, filteredExecutions]);

  // 2. Incident Frequency & Severity Distribution
  const incidentSeverityChartData = useMemo(() => {
    const counts: Record<string, number> = {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    };

    filteredIncidents.forEach((inc) => {
      const s = inc.severity.toLowerCase();
      if (s === 'critical' || s === 'sev1') counts.Critical += 1;
      else if (s === 'high' || s === 'sev2') counts.High += 1;
      else if (s === 'medium' || s === 'sev3') counts.Medium += 1;
      else counts.Low += 1;
    });

    return [
      { name: 'Critical (SEV-1)', count: counts.Critical, color: DESIGN_TOKENS.colors.status.critical },
      { name: 'High (SEV-2)', count: counts.High, color: DESIGN_TOKENS.colors.status.warning },
      { name: 'Medium (SEV-3)', count: counts.Medium, color: DESIGN_TOKENS.colors.burgundyAccent },
      { name: 'Low / Minor', count: counts.Low, color: DESIGN_TOKENS.colors.status.neutral },
    ].filter((item) => item.count > 0);
  }, [filteredIncidents]);

  // 3. Service Health State Distribution
  const serviceStateDistributionData = useMemo(() => {
    const counts = { healthy: 0, degraded: 0, unhealthy: 0, unknown: 0 };
    rawServices.forEach((s) => {
      if (s.state === 'healthy') counts.healthy += 1;
      else if (s.state === 'degraded') counts.degraded += 1;
      else if (s.state === 'unhealthy') counts.unhealthy += 1;
      else counts.unknown += 1;
    });

    return [
      { name: 'Healthy', value: counts.healthy, color: DESIGN_TOKENS.colors.status.healthy },
      { name: 'Degraded', value: counts.degraded, color: DESIGN_TOKENS.colors.status.warning },
      { name: 'Unhealthy', value: counts.unhealthy, color: DESIGN_TOKENS.colors.status.critical },
      { name: 'Unknown / Stale', value: counts.unknown, color: DESIGN_TOKENS.colors.status.neutral },
    ].filter((item) => item.value > 0);
  }, [rawServices]);

  // 4. Failure Pattern Category Frequency
  const patternCategoryData = useMemo(() => {
    const map = new Map<string, number>();
    filteredPatterns.forEach((pat) => {
      const cat = pat.category || 'Unclassified';
      map.set(cat, (map.get(cat) ?? 0) + (pat.occurrencesCount || 1));
    });

    return Array.from(map.entries())
      .map(([category, occurrences]) => ({ category, occurrences }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 6);
  }, [filteredPatterns]);

  // 5. Recovery Outcomes Chart Data
  const recoveryOutcomesChartData = useMemo(() => {
    if (!recoverySuccessStats.hasData) return [];
    return [
      { name: 'Verified & Restored', count: recoverySuccessStats.verified, color: DESIGN_TOKENS.colors.status.healthy },
      { name: 'Failed Action', count: recoverySuccessStats.failed, color: DESIGN_TOKENS.colors.status.critical },
      { name: 'Rolled Back', count: recoverySuccessStats.rolledBack, color: DESIGN_TOKENS.colors.status.warning },
    ].filter((item) => item.count > 0);
  }, [recoverySuccessStats]);

  // ---------------------------------------------------------------------------
  // CSV Export Handlers
  // ---------------------------------------------------------------------------
  const handleExportSummaryCsv = () => {
    const filename = `continuum-reliability-summary-${timeRange}-${Date.now()}.csv`;
    const headers = [
      'Evaluation Window',
      'Overall Journey Success Rate (%)',
      'Average Latency (ms)',
      'P95 Latency (ms)',
      'Total Incidents Evaluated',
      'Service Fleet Health (%)',
      'Recovery Success Rate (%)',
      'MTTR (Minutes)',
    ];
    const rows = [
      [
        timeRange,
        overallSuccessRate ?? 'N/A',
        averageLatencyMs ?? 'N/A',
        p95LatencyMs ?? 'N/A',
        filteredIncidents.length,
        fleetHealthPercent ?? 'N/A',
        recoverySuccessStats.rate ?? 'Insufficient Outcomes',
        mttrStats.mttrMinutes ?? 'Not Measured',
      ],
    ];
    exportRecordsToCsv(filename, headers, rows);
  };

  const handleExportExecutionsCsv = () => {
    const filename = `continuum-journey-executions-${timeRange}-${Date.now()}.csv`;
    const headers = [
      'Execution ID',
      'Journey ID',
      'Journey Name',
      'Status',
      'Duration (ms)',
      'Started At',
      'Failed Step',
      'Error Summary',
    ];
    const rows = filteredExecutions.map((e) => [
      e.id,
      e.journeyId,
      e.journeyName,
      e.status,
      e.durationMs ?? '',
      e.startedAt,
      e.failedStepName ?? '',
      e.errorSummary ?? '',
    ]);
    exportRecordsToCsv(filename, headers, rows);
  };

  const handleExportIncidentsCsv = () => {
    const filename = `continuum-incidents-reliability-${timeRange}-${Date.now()}.csv`;
    const headers = [
      'Incident ID',
      'Title',
      'Severity',
      'Status',
      'Affected Journey',
      'Affected Service',
      'First Detected At',
      'Latest Update At',
    ];
    const rows = filteredIncidents.map((inc) => [
      inc.id,
      inc.title,
      inc.severity,
      inc.status,
      inc.affectedJourneyName ?? inc.affectedJourneyId ?? '',
      inc.affectedServiceName ?? inc.affectedServiceId ?? '',
      inc.firstSeenAt,
      inc.latestUpdateAt,
    ]);
    exportRecordsToCsv(filename, headers, rows);
  };

  const isAnyQueryLoading =
    journeysQuery.isLoading ||
    executionsQuery.isLoading ||
    incidentsQuery.isLoading ||
    servicesQuery.isLoading;

  const refetchAll = () => {
    void analyticsEndpointQuery.refetch();
    void journeysQuery.refetch();
    void executionsQuery.refetch();
    void incidentsQuery.refetch();
    void servicesQuery.refetch();
    void patternsQuery.refetch();
    void recoveryExecutionsQuery.refetch();
    void playbooksQuery.refetch();
  };

  if (isAnyQueryLoading && rawJourneys.length === 0 && rawExecutions.length === 0) {
    return (
      <div className="space-y-6">
        <LoadingState
          title="Aggregating Reliability Telemetry"
          description="Fetching historical synthetic runs, incident distributions, and service availability..."
          rows={4}
        />
      </div>
    );
  }

  const allEndpointsUnavailable =
    journeysQuery.isError &&
    journeysQuery.error?.isUnavailable &&
    executionsQuery.isError &&
    executionsQuery.error?.isUnavailable &&
    incidentsQuery.isError &&
    incidentsQuery.error?.isUnavailable;

  if (allEndpointsUnavailable) {
    return (
      <div className="space-y-6">
        <UnavailableState
          endpoint="/api/v1/analytics/reliability"
          title="Reliability Telemetry Streams Unavailable"
          description="The Continuum backend telemetry services are currently unreachable. Synthetic test records, incident metrics, and SLO graphs remain strictly unrepresented rather than displaying fabricated numbers."
          onRetry={refetchAll}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-warm pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink-primary font-heading">
              Reliability Analytics
            </h1>
            <Badge variant="burgundy">Telemetry Window: {timeRange}</Badge>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Empirical reliability trends, SLO attainment, journey latency distribution, failure recurrence, and recovery efficacy.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportSummaryCsv}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export Summary CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={refetchAll}
            disabled={isAnyQueryLoading}
            leftIcon={
              <RefreshCw
                className={['w-3.5 h-3.5', isAnyQueryLoading ? 'animate-spin' : ''].filter(Boolean).join(' ')}
              />
            }
          >
            Refresh Telemetry
          </Button>
        </div>
      </div>

      {/* Observability & Integrity Notice */}
      <div className="rounded-lg border border-border-warm bg-surface-ivory p-4 shadow-sm flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-burgundy-primary shrink-0 mt-0.5" />
        <div className="text-xs text-ink-primary space-y-1">
          <div className="font-semibold text-ink-primary flex items-center gap-1.5">
            Empirical Observability &amp; Calculation Guardrails
          </div>
          <p className="text-ink-secondary leading-relaxed">
            All analytics are derived strictly from retrieved synthetic execution runs, incident records, and backend health snapshots.
            Missing values and ambiguous windows are never fabricated. Filter modifications dynamically update both visual series and CSV exports.
          </p>
        </div>
      </div>

      {/* Unified Multi-Attribute Filter Bar */}
      <div className="bg-surface-ivory border border-border-warm rounded-lg p-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-primary">Multi-Domain Filters</span>
            {(journeyFilter !== 'all' ||
              serviceFilter !== 'all' ||
              severityFilter !== 'all' ||
              failureCategoryFilter !== 'all' ||
              playbookFilter !== 'all' ||
              searchQuery) && (
              <Badge variant="warning" dot>
                Filters Active
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setJourneyFilter('all');
              setServiceFilter('all');
              setSeverityFilter('all');
              setFailureCategoryFilter('all');
              setPlaybookFilter('all');
              setSearchQuery('');
            }}
          >
            Reset All Filters
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
              Target Journey
            </label>
            <Select
              options={journeyOptions}
              value={journeyFilter}
              onChange={(e) => setJourneyFilter(e.target.value)}
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
              Target Service
            </label>
            <Select
              options={serviceOptions}
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
              Incident Severity
            </label>
            <Select
              options={severityOptions}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
              Failure Category
            </label>
            <Select
              options={categoryOptions}
              value={failureCategoryFilter}
              onChange={(e) => setFailureCategoryFilter(e.target.value)}
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-ink-secondary mb-1">
              Recovery Playbook
            </label>
            <Select
              options={playbookOptions}
              value={playbookFilter}
              onChange={(e) => setPlaybookFilter(e.target.value)}
              className="w-full text-xs"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Journey Success Rate */}
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Journey Success Rate</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-ink-primary flex items-center justify-between">
              <span>{overallSuccessRate !== null ? `${overallSuccessRate}%` : '—'}</span>
              {overallSuccessRate !== null && overallSuccessRate >= 99 ? (
                <TrendingUp className="w-4 h-4 text-status-healthy" />
              ) : overallSuccessRate !== null && overallSuccessRate < 95 ? (
                <TrendingDown className="w-4 h-4 text-status-critical" />
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-ink-secondary">
            {filteredExecutions.length > 0 ? (
              <span>{filteredExecutions.length} runs evaluated</span>
            ) : (
              <span>From configured journeys</span>
            )}
          </CardContent>
        </Card>

        {/* Avg & P95 Latency */}
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Avg / P95 Latency</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-ink-primary">
              {averageLatencyMs !== null ? `${averageLatencyMs}ms` : '—'}
              <span className="text-xs font-normal text-ink-secondary ml-1">
                {p95LatencyMs !== null ? `/ ${p95LatencyMs}ms` : ''}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-ink-secondary">
            <span>Synthetic end-to-end duration</span>
          </CardContent>
        </Card>

        {/* Incidents Count */}
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Incidents In Window</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-ink-primary">
              {filteredIncidents.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-ink-secondary">
            {filteredIncidents.length > 0 ? (
              <span className="text-status-critical font-medium">
                {filteredIncidents.filter((i) => i.severity === 'critical' || i.severity === 'sev1').length} Critical
              </span>
            ) : (
              <span className="text-status-healthy font-medium">Zero incidents active</span>
            )}
          </CardContent>
        </Card>

        {/* Service Fleet Health */}
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Fleet Health Rate</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-ink-primary">
              {fleetHealthPercent !== null ? `${fleetHealthPercent}%` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-ink-secondary">
            <span>{rawServices.length} dependencies monitored</span>
          </CardContent>
        </Card>

        {/* MTTR */}
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Mean Time to Recover</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-ink-primary">
              {mttrStats.mttrMinutes !== null ? `${mttrStats.mttrMinutes}m` : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-ink-secondary">
            {mttrStats.mttrMinutes !== null ? (
              <span>From resolved incidents</span>
            ) : (
              <span>Not measured in window</span>
            )}
          </CardContent>
        </Card>

        {/* Recovery Success Rate */}
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Recovery Success</CardDescription>
            <CardTitle className="text-xl font-bold font-mono text-ink-primary">
              {recoverySuccessStats.hasData && recoverySuccessStats.rate !== null
                ? `${recoverySuccessStats.rate}%`
                : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[11px] text-ink-secondary">
            {recoverySuccessStats.hasData ? (
              <span>{recoverySuccessStats.total} actions dispatched</span>
            ) : (
              <span className="text-ink-secondary">Insufficient outcomes</span>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Journey Success Rate Over Time */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Journey Success Rate Over Time
                </CardTitle>
                <CardDescription>
                  Synthetic probe availability trajectory across chronological evaluation buckets
                </CardDescription>
              </div>
              <Activity className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent>
            {journeySuccessTrendData.length >= 2 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={journeySuccessTrendData}>
                    <defs>
                      <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={DESIGN_TOKENS.colors.status.healthy} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={DESIGN_TOKENS.colors.status.healthy} stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={DESIGN_TOKENS.colors.warmBorder} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                      unit="%"
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                        borderColor: DESIGN_TOKENS.colors.warmBorder,
                        fontSize: '11px',
                        borderRadius: '6px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="successRate"
                      name="Success Rate (%)"
                      stroke={DESIGN_TOKENS.colors.status.healthy}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#successGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center p-6 text-center border border-dashed border-border-warm rounded-md bg-surface-cream/50">
                <Activity className="w-8 h-8 text-ink-secondary/50 mb-2" />
                <div className="text-xs font-semibold text-ink-primary">
                  Insufficient Time-Series Data Points
                </div>
                <div className="text-[11px] text-ink-secondary max-w-sm mt-1">
                  At least 2 chronological synthetic execution points are required to plot the availability trend.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Journey Latency Trends */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Journey Latency Trends (ms)
                </CardTitle>
                <CardDescription>
                  Chronological execution response time and latency fluctuations
                </CardDescription>
              </div>
              <Clock className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent>
            {journeySuccessTrendData.length >= 2 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={journeySuccessTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DESIGN_TOKENS.colors.warmBorder} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                    />
                    <YAxis
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                      unit="ms"
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                        borderColor: DESIGN_TOKENS.colors.warmBorder,
                        fontSize: '11px',
                        borderRadius: '6px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="latencyMs"
                      name="Average Latency (ms)"
                      stroke={DESIGN_TOKENS.colors.deepBurgundy}
                      strokeWidth={2}
                      dot={{ r: 3, fill: DESIGN_TOKENS.colors.deepBurgundy }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center p-6 text-center border border-dashed border-border-warm rounded-md bg-surface-cream/50">
                <Clock className="w-8 h-8 text-ink-secondary/50 mb-2" />
                <div className="text-xs font-semibold text-ink-primary">
                  Insufficient Latency Data Points
                </div>
                <div className="text-[11px] text-ink-secondary max-w-sm mt-1">
                  Synthetic test latency metrics will populate as executions run in this window.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 3: Incident Frequency & Severity Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Incident Severity Distribution
                </CardTitle>
                <CardDescription>
                  Breakdown of active and historical reliability incidents by severity tier
                </CardDescription>
              </div>
              <ShieldAlert className="w-4 h-4 text-status-critical" />
            </div>
          </CardHeader>
          <CardContent>
            {incidentSeverityChartData.length > 0 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incidentSeverityChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DESIGN_TOKENS.colors.warmBorder} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                        borderColor: DESIGN_TOKENS.colors.warmBorder,
                        fontSize: '11px',
                        borderRadius: '6px',
                      }}
                    />
                    <Bar dataKey="count" name="Incidents Count" radius={[4, 4, 0, 0]}>
                      {incidentSeverityChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center p-6 text-center border border-dashed border-border-warm rounded-md bg-surface-cream/50">
                <CheckCircle2 className="w-8 h-8 text-status-healthy mb-2" />
                <div className="text-xs font-semibold text-ink-primary">
                  Zero Incidents Recorded
                </div>
                <div className="text-[11px] text-ink-secondary max-w-sm mt-1">
                  No reliability incidents match the active filter criteria in this window.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 4: Service Fleet Health Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Service Availability Breakdown
                </CardTitle>
                <CardDescription>
                  Operational state distribution across critical payment gateways and services
                </CardDescription>
              </div>
              <PieChartIcon className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent>
            {serviceStateDistributionData.length > 0 ? (
              <div className="h-64 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={serviceStateDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {serviceStateDistributionData.map((entry, index) => (
                        <Cell key={`cell-state-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                        borderColor: DESIGN_TOKENS.colors.warmBorder,
                        fontSize: '11px',
                        borderRadius: '6px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', color: DESIGN_TOKENS.colors.secondaryText }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center p-6 text-center border border-dashed border-border-warm rounded-md bg-surface-cream/50">
                <PieChartIcon className="w-8 h-8 text-ink-secondary/50 mb-2" />
                <div className="text-xs font-semibold text-ink-primary">
                  No Service Telemetry Available
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 5: Recurring Failure Patterns Frequency */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Recurring Failure Patterns by Category
                </CardTitle>
                <CardDescription>
                  Clustered occurrences by error classification (HTTP 5xx, contract drift, timeouts)
                </CardDescription>
              </div>
              <BarChart3 className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent>
            {patternCategoryData.length > 0 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={patternCategoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke={DESIGN_TOKENS.colors.warmBorder} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="category"
                      type="category"
                      width={120}
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                        borderColor: DESIGN_TOKENS.colors.warmBorder,
                        fontSize: '11px',
                        borderRadius: '6px',
                      }}
                    />
                    <Bar
                      dataKey="occurrences"
                      name="Occurrences"
                      fill={DESIGN_TOKENS.colors.burgundyAccent}
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center p-6 text-center border border-dashed border-border-warm rounded-md bg-surface-cream/50">
                <CheckCircle2 className="w-8 h-8 text-status-healthy mb-2" />
                <div className="text-xs font-semibold text-ink-primary">
                  Zero Failure Patterns Observed
                </div>
                <div className="text-[11px] text-ink-secondary max-w-sm mt-1">
                  No systemic recurring failure signatures detected across synthetic tests.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart 6: Recovery Outcomes & Verification Success */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Recovery Outcomes &amp; Verification
                </CardTitle>
                <CardDescription>
                  Post-remediation verification outcomes and rollback frequency
                </CardDescription>
              </div>
              <RotateCcw className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent>
            {recoverySuccessStats.hasData && recoveryOutcomesChartData.length > 0 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={recoveryOutcomesChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={DESIGN_TOKENS.colors.warmBorder} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: DESIGN_TOKENS.colors.secondaryText, fontSize: 10 }}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: DESIGN_TOKENS.colors.softIvorySurface,
                        borderColor: DESIGN_TOKENS.colors.warmBorder,
                        fontSize: '11px',
                        borderRadius: '6px',
                      }}
                    />
                    <Bar dataKey="count" name="Action Count" radius={[4, 4, 0, 0]}>
                      {recoveryOutcomesChartData.map((entry, index) => (
                        <Cell key={`rec-cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center p-6 text-center border border-dashed border-border-warm rounded-md bg-surface-cream/50">
                <ShieldCheck className="w-8 h-8 text-ink-secondary/50 mb-2" />
                <div className="text-xs font-semibold text-ink-primary">
                  Insufficient Recovery Outcomes
                </div>
                <div className="text-[11px] text-ink-secondary max-w-sm mt-1">
                  No recovery playbooks have been triggered or verified in this window. Continuum does not fabricate recovery success rates.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Drill-down Data Ledger Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-warm pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-primary">Analytics Data Ledgers</span>
            <span className="text-xs text-ink-secondary">
              (Filtered to {timeRange})
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm"
              variant={activeTab === 'overview' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('overview')}
            >
              Journeys Summary
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'incidents' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('incidents')}
            >
              Incidents ({filteredIncidents.length})
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'services' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('services')}
            >
              Services ({rawServices.length})
            </Button>
            <Button
              size="sm"
              variant={activeTab === 'recoveries' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('recoveries')}
            >
              Recoveries ({filteredRecoveries.length})
            </Button>
          </div>
        </div>

        {/* Tab 1: Journeys Summary */}
        {activeTab === 'overview' && (
          <Card>
            <div className="flex items-center justify-between p-3.5 border-b border-border-warm">
              <div className="text-xs font-medium text-ink-secondary">
                Configured e-commerce synthetic journeys and historical attainment metrics
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportExecutionsCsv}
                leftIcon={<Download className="w-3 h-3" />}
              >
                Export Executions CSV
              </Button>
            </div>
            {rawJourneys.length === 0 ? (
              <EmptyState
                title="No Journey Records Discovered"
                description="Backend returned zero monitored journeys for this scope."
              />
            ) : (
              <DataTable
                caption="Journey reliability overview table"
                columns={[
                  {
                    key: 'name',
                    header: 'Business Journey',
                    render: (row) => (
                      <div className="space-y-0.5">
                        <Link
                          to={`/monitoring/journeys?journeyId=${encodeURIComponent(String(row.id))}`}
                          className="font-medium text-ink-primary hover:text-burgundy-primary flex items-center gap-1"
                        >
                          {String(row.name)}
                          <ExternalLink className="w-3 h-3 text-burgundy-accent" />
                        </Link>
                        <div className="text-[11px] text-ink-secondary font-mono">{String(row.id)}</div>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Health State',
                    render: (row) => {
                      const st = String(row.overallHealth);
                      return (
                        <Badge
                          variant={st === 'healthy' ? 'healthy' : st === 'degraded' ? 'warning' : 'critical'}
                          dot
                        >
                          {st.toUpperCase()}
                        </Badge>
                      );
                    },
                  },
                  {
                    key: 'successRate',
                    header: 'Success Rate',
                    render: (row) => {
                      const rate = row.successRate;
                      return (
                        <span className="font-mono text-xs font-medium">
                          {typeof rate === 'number' ? `${rate}%` : '—'}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'averageLatencyMs',
                    header: 'Avg Latency',
                    render: (row) => {
                      const lat = row.averageLatencyMs;
                      return (
                        <span className="font-mono text-xs">
                          {typeof lat === 'number' ? `${lat}ms` : '—'}
                        </span>
                      );
                    },
                  },
                  {
                    key: 'lastRunAt',
                    header: 'Last Probe Run',
                    render: (row) => (
                      <span className="font-mono text-[11px] text-ink-secondary">
                        {row.lastRunAt ? new Date(String(row.lastRunAt)).toLocaleString() : '—'}
                      </span>
                    ),
                  },
                ]}
                data={rawJourneys as unknown as Record<string, unknown>[]}
                rowKey={(r) => String(r.id)}
              />
            )}
          </Card>
        )}

        {/* Tab 2: Incidents Ledger */}
        {activeTab === 'incidents' && (
          <Card>
            <div className="flex items-center justify-between p-3.5 border-b border-border-warm">
              <div className="text-xs font-medium text-ink-secondary">
                Reliability incidents detected in current window
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportIncidentsCsv}
                leftIcon={<Download className="w-3 h-3" />}
              >
                Export Incidents CSV
              </Button>
            </div>
            {filteredIncidents.length === 0 ? (
              <EmptyState
                title="Zero Incidents in Window"
                description="No active or historical incidents matched the filter scope."
              />
            ) : (
              <DataTable
                caption="Incidents table"
                columns={[
                  {
                    key: 'id',
                    header: 'Incident ID',
                    render: (row) => (
                      <Link
                        to={`/intelligence/incidents?incidentId=${encodeURIComponent(String(row.id))}`}
                        className="font-mono text-xs text-burgundy-primary hover:underline flex items-center gap-1"
                      >
                        {String(row.id)}
                        <ExternalLink className="w-3 h-3 text-burgundy-accent" />
                      </Link>
                    ),
                  },
                  {
                    key: 'title',
                    header: 'Title / Failure Summary',
                    render: (row) => (
                      <div className="font-medium text-ink-primary max-w-sm truncate">
                        {String(row.title)}
                      </div>
                    ),
                  },
                  {
                    key: 'severity',
                    header: 'Severity',
                    render: (row) => {
                      const sev = String(row.severity).toLowerCase();
                      const variant =
                        sev === 'critical' || sev === 'sev1'
                          ? 'critical'
                          : sev === 'high' || sev === 'sev2'
                          ? 'warning'
                          : 'neutral';
                      return <Badge variant={variant}>{sev.toUpperCase()}</Badge>;
                    },
                  },
                  {
                    key: 'status',
                    header: 'Lifecycle Status',
                    render: (row) => {
                      const st = String(row.status);
                      return <Badge variant={st === 'resolved' ? 'healthy' : 'warning'}>{st}</Badge>;
                    },
                  },
                  {
                    key: 'firstSeenAt',
                    header: 'First Detected',
                    render: (row) => (
                      <span className="font-mono text-[11px] text-ink-secondary">
                        {row.firstSeenAt ? new Date(String(row.firstSeenAt)).toLocaleString() : '—'}
                      </span>
                    ),
                  },
                ]}
                data={filteredIncidents as unknown as Record<string, unknown>[]}
                rowKey={(r) => String(r.id)}
              />
            )}
          </Card>
        )}

        {/* Tab 3: Services Ledger */}
        {activeTab === 'services' && (
          <Card>
            <div className="flex items-center justify-between p-3.5 border-b border-border-warm">
              <div className="text-xs font-medium text-ink-secondary">
                Backend dependencies, payment gateways, and uptime states
              </div>
            </div>
            {rawServices.length === 0 ? (
              <EmptyState
                title="No Monitored Services"
                description="Service health endpoint returned zero dependencies."
              />
            ) : (
              <DataTable
                caption="Monitored services table"
                columns={[
                  {
                    key: 'name',
                    header: 'Service Dependency',
                    render: (row) => (
                      <Link
                        to={`/monitoring/service-health?serviceId=${encodeURIComponent(String(row.id))}`}
                        className="font-medium text-ink-primary hover:text-burgundy-primary flex items-center gap-1"
                      >
                        {String(row.name)}
                        <ExternalLink className="w-3 h-3 text-burgundy-accent" />
                      </Link>
                    ),
                  },
                  {
                    key: 'role',
                    header: 'Role / Type',
                    render: (row) => (
                      <span className="text-xs text-ink-secondary font-mono">
                        {String(row.role || 'dependency')}
                      </span>
                    ),
                  },
                  {
                    key: 'state',
                    header: 'Health State',
                    render: (row) => {
                      const st = String(row.state);
                      return (
                        <Badge
                          variant={st === 'healthy' ? 'healthy' : st === 'degraded' ? 'warning' : 'critical'}
                          dot
                        >
                          {st.toUpperCase()}
                        </Badge>
                      );
                    },
                  },
                  {
                    key: 'latencyMs',
                    header: 'Latency',
                    render: (row) => (
                      <span className="font-mono text-xs">
                        {typeof row.latencyMs === 'number' ? `${row.latencyMs}ms` : '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'errorRatePercent',
                    header: 'Error Rate',
                    render: (row) => (
                      <span className="font-mono text-xs">
                        {typeof row.errorRatePercent === 'number' ? `${row.errorRatePercent}%` : '—'}
                      </span>
                    ),
                  },
                ]}
                data={rawServices as unknown as Record<string, unknown>[]}
                rowKey={(r) => String(r.id)}
              />
            )}
          </Card>
        )}

        {/* Tab 4: Recoveries Ledger */}
        {activeTab === 'recoveries' && (
          <Card>
            <div className="flex items-center justify-between p-3.5 border-b border-border-warm">
              <div className="text-xs font-medium text-ink-secondary">
                Recovery actions and post-recovery probe verifications
              </div>
            </div>
            {filteredRecoveries.length === 0 ? (
              <EmptyState
                title="No Recovery Executions"
                description="Zero recovery playbooks have executed in this time window."
              />
            ) : (
              <DataTable
                caption="Recovery executions table"
                columns={[
                  {
                    key: 'id',
                    header: 'Execution ID',
                    render: (row) => (
                      <Link
                        to={`/recovery/executions?actionRunId=${encodeURIComponent(String(row.id))}`}
                        className="font-mono text-xs text-burgundy-primary hover:underline flex items-center gap-1"
                      >
                        {String(row.id)}
                        <ExternalLink className="w-3 h-3 text-burgundy-accent" />
                      </Link>
                    ),
                  },
                  {
                    key: 'playbookName',
                    header: 'Playbook',
                    render: (row) => (
                      <span className="font-medium text-ink-primary">{String(row.playbookName)}</span>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Outcome',
                    render: (row) => {
                      const st = String(row.status);
                      return (
                        <Badge
                          variant={st === 'verified' ? 'healthy' : st === 'failed' ? 'critical' : 'warning'}
                          dot
                        >
                          {st.toUpperCase()}
                        </Badge>
                      );
                    },
                  },
                  {
                    key: 'startedAt',
                    header: 'Timestamp',
                    render: (row) => (
                      <span className="font-mono text-[11px] text-ink-secondary">
                        {row.startedAt ? new Date(String(row.startedAt)).toLocaleString() : '—'}
                      </span>
                    ),
                  },
                ]}
                data={filteredRecoveries as unknown as Record<string, unknown>[]}
                rowKey={(r) => String(r.id)}
              />
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

export default ReliabilityAnalyticsPage;
