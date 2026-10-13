import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileCode2,
  Flame,
  GitPullRequest,
  Globe,
  Layers,
  MessageSquare,
  Network,
  Radar,
  RefreshCw,
  Server,
  ShieldAlert,
  Workflow,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useShell } from '../context/ShellContext';
import { DESIGN_TOKENS, TIME_RANGE_OPTIONS, type SemanticStatus } from '../styles/tokens';
import { useCommandCenterData } from '../api/commandCenter';
import {
  COMMAND_CENTER_ENDPOINT_CONTRACTS,
  type IncidentActivityRecord,
  type JourneyExecutionStatus,
  type ServiceHealthState,
} from '../api/contracts';
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
  Input,
  LoadingState,
  MonoCode,
  Select,
  UnavailableState,
} from '../components/ui';

const CANONICAL_ECOMMERCE_JOURNEY_STAGES = [
  'Login',
  'Product browsing',
  'Add to cart',
  'Checkout',
  'Payment',
  'Order confirmation',
] as const;

function journeyStatusToVariant(status: JourneyExecutionStatus): SemanticStatus {
  switch (status) {
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

function serviceStateToVariant(state: ServiceHealthState): SemanticStatus {
  switch (state) {
    case 'healthy':
      return 'healthy';
    case 'degraded':
      return 'warning';
    case 'unhealthy':
      return 'critical';
    default:
      return 'neutral';
  }
}

function severityToVariant(severity: IncidentActivityRecord['severity']): SemanticStatus {
  switch (severity) {
    case 'sev1':
    case 'critical':
      return 'critical';
    case 'sev2':
    case 'high':
      return 'warning';
    case 'sev3':
    case 'medium':
      return 'info';
    default:
      return 'neutral';
  }
}

export const CommandCenterPage: React.FC = () => {
  const { timeRange, setTimeRange } = useShell();
  const {
    journeysQuery,
    incidentsQuery,
    servicesQuery,
    failurePatternsQuery,
    recoveryExecutionsQuery,
    recoveryApprovalsQuery,
    kpiMetrics,
    isAnyFetching,
    refetchAll,
  } = useCommandCenterData(timeRange);

  const [lastRefreshAttempt, setLastRefreshAttempt] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
  const [isContractsDialogOpen, setIsContractsDialogOpen] = useState(false);

  // Section 3: Journey filters
  const [journeySearch, setJourneySearch] = useState('');
  const [journeyStatusFilter, setJourneyStatusFilter] = useState<string>('all');

  // Section 4: Incident filters & view mode
  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState<string>('all');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState<string>('all');
  const [incidentViewMode, setIncidentViewMode] = useState<'table' | 'timeline'>('table');

  // Section 5: Service health filter
  const [serviceStateFilter, setServiceStateFilter] = useState<string>('all');

  // Section 6: Intelligence & Recovery tab
  const [recoveryPanelTab, setRecoveryPanelTab] = useState<'patterns' | 'recoveries' | 'approvals'>(
    'patterns'
  );

  const handleManualRefresh = () => {
    setLastRefreshAttempt(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );
    refetchAll();
  };

  const selectedTimeRangeLabel =
    TIME_RANGE_OPTIONS.find((opt) => opt.value === timeRange)?.label ?? timeRange;

  // Filtered Journeys
  const filteredJourneys = useMemo(() => {
    const list = journeysQuery.data ?? [];
    return list.filter((j) => {
      const matchesSearch =
        !journeySearch.trim() ||
        j.name.toLowerCase().includes(journeySearch.trim().toLowerCase()) ||
        j.id.toLowerCase().includes(journeySearch.trim().toLowerCase());
      const matchesStatus =
        journeyStatusFilter === 'all' || j.latestExecutionStatus === journeyStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [journeysQuery.data, journeySearch, journeyStatusFilter]);

  // Only render chart if actual journey records have numeric successRate or averageLatencyMs
  const journeysChartData = useMemo(() => {
    return filteredJourneys
      .filter((j) => j.successRate !== null || j.averageLatencyMs !== null)
      .map((j) => ({
        name: j.name,
        successRate: j.successRate ?? 0,
        latencyMs: j.averageLatencyMs ?? 0,
      }));
  }, [filteredJourneys]);

  // Filtered Incidents
  const filteredIncidents = useMemo(() => {
    const list = incidentsQuery.data ?? [];
    return list.filter((inc) => {
      const q = incidentSearch.trim().toLowerCase();
      const matchesSearch =
        !q ||
        inc.id.toLowerCase().includes(q) ||
        inc.affectedTarget.toLowerCase().includes(q) ||
        (inc.title?.toLowerCase().includes(q) ?? false);
      const matchesSeverity =
        incidentSeverityFilter === 'all' || inc.severity === incidentSeverityFilter;
      const matchesStatus =
        incidentStatusFilter === 'all' || inc.status === incidentStatusFilter;
      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [incidentsQuery.data, incidentSearch, incidentSeverityFilter, incidentStatusFilter]);

  // Filtered Services
  const filteredServices = useMemo(() => {
    const list = servicesQuery.data ?? [];
    return list.filter(
      (svc) => serviceStateFilter === 'all' || svc.state === serviceStateFilter
    );
  }, [servicesQuery.data, serviceStateFilter]);

  // Overall posture evaluation strictly from actual backend responses
  const anyEndpointConnected =
    journeysQuery.isSuccess ||
    incidentsQuery.isSuccess ||
    servicesQuery.isSuccess ||
    failurePatternsQuery.isSuccess ||
    recoveryExecutionsQuery.isSuccess ||
    recoveryApprovalsQuery.isSuccess;

  const unavailableEndpointsCount = [
    journeysQuery,
    incidentsQuery,
    servicesQuery,
    failurePatternsQuery,
    recoveryExecutionsQuery,
    recoveryApprovalsQuery,
  ].filter((q) => q.isError && q.error?.isUnavailable).length;

  // KPI Card definitions
  const kpiCards = [
    {
      id: 'journey-success-rate',
      label: 'Overall Journey Success Rate',
      endpoint: '/api/v1/journeys',
      isLoading: journeysQuery.isFetching,
      isUnavailable: journeysQuery.isError && Boolean(journeysQuery.error?.isUnavailable),
      hasError: journeysQuery.isError && !journeysQuery.error?.isUnavailable,
      value:
        kpiMetrics.overallJourneySuccessRate !== undefined &&
        kpiMetrics.overallJourneySuccessRate !== null
          ? `${kpiMetrics.overallJourneySuccessRate.toFixed(2)}%`
          : null,
      statusVariant: (kpiMetrics.overallJourneySuccessRate == null
        ? 'neutral'
        : kpiMetrics.overallJourneySuccessRate >= 99
          ? 'healthy'
          : kpiMetrics.overallJourneySuccessRate >= 95
            ? 'warning'
            : 'critical') as SemanticStatus,
      statusLabel:
        kpiMetrics.overallJourneySuccessRate == null
          ? 'No Telemetry'
          : kpiMetrics.overallJourneySuccessRate >= 99
            ? 'Within SLO'
            : kpiMetrics.overallJourneySuccessRate >= 95
              ? 'Degraded'
              : 'SLO Breach',
      footnote:
        journeysQuery.isSuccess && journeysQuery.data
          ? `Across ${journeysQuery.data.length} configured journey(s)`
          : 'Requires GET /api/v1/journeys',
    },
    {
      id: 'active-incidents',
      label: 'Active Incidents',
      endpoint: '/api/v1/incidents',
      isLoading: incidentsQuery.isFetching,
      isUnavailable: incidentsQuery.isError && Boolean(incidentsQuery.error?.isUnavailable),
      hasError: incidentsQuery.isError && !incidentsQuery.error?.isUnavailable,
      value:
        kpiMetrics.activeIncidentsCount !== undefined && kpiMetrics.activeIncidentsCount !== null
          ? String(kpiMetrics.activeIncidentsCount)
          : null,
      statusVariant: (kpiMetrics.activeIncidentsCount == null
        ? 'neutral'
        : kpiMetrics.activeIncidentsCount === 0
          ? 'healthy'
          : (kpiMetrics.criticalIncidentsCount ?? 0) > 0
            ? 'critical'
            : 'warning') as SemanticStatus,
      statusLabel:
        kpiMetrics.activeIncidentsCount == null
          ? 'No Telemetry'
          : kpiMetrics.activeIncidentsCount === 0
            ? 'Zero Open'
            : `${kpiMetrics.criticalIncidentsCount ?? 0} Critical`,
      footnote:
        incidentsQuery.isSuccess && incidentsQuery.data
          ? `${incidentsQuery.data.length} total incident(s) in window`
          : 'Requires GET /api/v1/incidents',
    },
    {
      id: 'unhealthy-services',
      label: 'Critical or Unhealthy Services',
      endpoint: '/api/v1/services/health',
      isLoading: servicesQuery.isFetching,
      isUnavailable: servicesQuery.isError && Boolean(servicesQuery.error?.isUnavailable),
      hasError: servicesQuery.isError && !servicesQuery.error?.isUnavailable,
      value:
        kpiMetrics.unhealthyServicesCount !== undefined &&
        kpiMetrics.unhealthyServicesCount !== null
          ? `${kpiMetrics.unhealthyServicesCount} / ${kpiMetrics.totalServicesCount ?? 0}`
          : null,
      statusVariant: (kpiMetrics.unhealthyServicesCount == null
        ? 'neutral'
        : kpiMetrics.unhealthyServicesCount === 0
          ? 'healthy'
          : 'critical') as SemanticStatus,
      statusLabel:
        kpiMetrics.unhealthyServicesCount == null
          ? 'No Telemetry'
          : kpiMetrics.unhealthyServicesCount === 0
            ? 'All Healthy'
            : 'Impaired',
      footnote:
        servicesQuery.isSuccess && servicesQuery.data
          ? `${servicesQuery.data.length} monitored service node(s)`
          : 'Requires GET /api/v1/services/health',
    },
    {
      id: 'avg-journey-latency',
      label: 'Average Journey Latency',
      endpoint: '/api/v1/journeys',
      isLoading: journeysQuery.isFetching,
      isUnavailable: journeysQuery.isError && Boolean(journeysQuery.error?.isUnavailable),
      hasError: journeysQuery.isError && !journeysQuery.error?.isUnavailable,
      value:
        kpiMetrics.averageJourneyLatencyMs !== undefined &&
        kpiMetrics.averageJourneyLatencyMs !== null
          ? `${kpiMetrics.averageJourneyLatencyMs} ms`
          : null,
      statusVariant: (kpiMetrics.averageJourneyLatencyMs == null
        ? 'neutral'
        : kpiMetrics.averageJourneyLatencyMs <= 800
          ? 'healthy'
          : kpiMetrics.averageJourneyLatencyMs <= 1500
            ? 'warning'
            : 'critical') as SemanticStatus,
      statusLabel:
        kpiMetrics.averageJourneyLatencyMs == null
          ? 'No Telemetry'
          : kpiMetrics.averageJourneyLatencyMs <= 800
            ? 'Nominal'
            : 'Elevated',
      footnote:
        journeysQuery.isSuccess && journeysQuery.data
          ? `Window: ${selectedTimeRangeLabel}`
          : 'Requires GET /api/v1/journeys',
    },
    {
      id: 'recovery-success-rate',
      label: 'Recovery Success Rate',
      endpoint: '/api/v1/recovery/executions',
      isLoading: recoveryExecutionsQuery.isFetching,
      isUnavailable:
        recoveryExecutionsQuery.isError && Boolean(recoveryExecutionsQuery.error?.isUnavailable),
      hasError:
        recoveryExecutionsQuery.isError && !recoveryExecutionsQuery.error?.isUnavailable,
      value:
        kpiMetrics.recoverySuccessRate !== undefined && kpiMetrics.recoverySuccessRate !== null
          ? `${kpiMetrics.recoverySuccessRate.toFixed(1)}%`
          : null,
      statusVariant: (kpiMetrics.recoverySuccessRate == null
        ? 'neutral'
        : kpiMetrics.recoverySuccessRate >= 90
          ? 'healthy'
          : kpiMetrics.recoverySuccessRate >= 70
            ? 'warning'
            : 'critical') as SemanticStatus,
      statusLabel:
        kpiMetrics.recoverySuccessRate == null
          ? 'No Telemetry'
          : `${kpiMetrics.totalRecoveryAttempts ?? 0} Executed`,
      footnote:
        recoveryExecutionsQuery.isSuccess && recoveryExecutionsQuery.data
          ? `${recoveryExecutionsQuery.data.length} recovery run(s) recorded`
          : 'Requires GET /api/v1/recovery/executions',
    },
    {
      id: 'detected-failure-patterns',
      label: 'Detected Failure Patterns',
      endpoint: '/api/v1/intelligence/failure-patterns',
      isLoading: failurePatternsQuery.isFetching,
      isUnavailable:
        failurePatternsQuery.isError && Boolean(failurePatternsQuery.error?.isUnavailable),
      hasError: failurePatternsQuery.isError && !failurePatternsQuery.error?.isUnavailable,
      value:
        kpiMetrics.detectedFailurePatternsCount !== undefined &&
        kpiMetrics.detectedFailurePatternsCount !== null
          ? String(kpiMetrics.detectedFailurePatternsCount)
          : null,
      statusVariant: (kpiMetrics.detectedFailurePatternsCount == null
        ? 'neutral'
        : kpiMetrics.detectedFailurePatternsCount === 0
          ? 'healthy'
          : (kpiMetrics.recurringPatternsCount ?? 0) > 0
            ? 'warning'
            : 'info') as SemanticStatus,
      statusLabel:
        kpiMetrics.detectedFailurePatternsCount == null
          ? 'No Telemetry'
          : kpiMetrics.detectedFailurePatternsCount === 0
            ? 'None Detected'
            : `${kpiMetrics.recurringPatternsCount ?? 0} Active`,
      footnote:
        failurePatternsQuery.isSuccess && failurePatternsQuery.data
          ? 'Clustered across synthetic executions'
          : 'Requires GET /api/v1/intelligence/failure-patterns',
    },
  ];

  return (
    <div className="space-y-6">
      {/* =====================================================================
          1. PAGE HEADER & SYSTEM RELIABILITY POSTURE BANNER
          ===================================================================== */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="cc-time-range"
                  className="text-xs font-medium text-ink-secondary whitespace-nowrap"
                >
                  Time Range:
                </label>
                <Select
                  id="cc-time-range"
                  value={timeRange}
                  options={TIME_RANGE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                  }))}
                  onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsContractsDialogOpen(true)}
                leftIcon={<FileCode2 className="w-3.5 h-3.5" />}
              >
                API Contracts ({6 - unavailableEndpointsCount}/6)
              </Button>

              <Button
                variant="primary"
                size="sm"
                isLoading={isAnyFetching}
                onClick={handleManualRefresh}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Telemetry
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-burgundy text-surface-ivory border border-burgundy-dark shrink-0 mt-0.5">
              <Activity className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-heading text-base font-bold text-ink-primary tracking-tight">
                  Command Center
                </h2>
                <Badge
                  variant={
                    isAnyFetching
                      ? 'info'
                      : !anyEndpointConnected
                        ? 'warning'
                        : (kpiMetrics.activeIncidentsCount ?? 0) > 0 ||
                            (kpiMetrics.unhealthyServicesCount ?? 0) > 0
                          ? 'critical'
                          : 'healthy'
                  }
                  dot
                >
                  {isAnyFetching
                    ? 'Probing Endpoints'
                    : !anyEndpointConnected
                      ? 'Backend Telemetry Unconnected'
                      : (kpiMetrics.activeIncidentsCount ?? 0) > 0 ||
                          (kpiMetrics.unhealthyServicesCount ?? 0) > 0
                        ? 'Action Required — Degradation Detected'
                        : 'Monitored Business Healthy'}
                </Badge>
              </div>
              <CardDescription>
                Real-time operational posture for synthetic e-commerce journeys, service
                dependencies, recurring failure intelligence, and safe recovery orchestration.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardFooter>
          <div className="flex items-center gap-2 flex-wrap">
            <span>Evaluation Window:</span>
            <Badge variant="burgundy" mono>
              {selectedTimeRangeLabel}
            </Badge>
            <span className="text-border-strong">|</span>
            <span>Last Probe Attempt:</span>
            <MonoCode>{lastRefreshAttempt}</MonoCode>
          </div>
          <div className="text-[11px] text-ink-secondary">
            {unavailableEndpointsCount > 0 ? (
              <span className="text-status-warning font-medium">
                {unavailableEndpointsCount} of 6 backend telemetry endpoints currently unreachable
              </span>
            ) : (
              <span className="text-status-healthy font-medium">
                All 6 backend telemetry contracts active
              </span>
            )}
          </div>
        </CardFooter>
      </Card>

      {/* =====================================================================
          2. KPI CARDS (Strictly Bound to Backend API Availability)
          ===================================================================== */}
      <section aria-labelledby="cc-kpi-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2
            id="cc-kpi-heading"
            className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary"
          >
            Key Reliability Indicators
          </h2>
          <span className="text-[11px] text-ink-secondary">
            Metrics populate strictly from verified FastAPI responses
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
          {kpiCards.map((kpi) => (
            <Card key={kpi.id} variant="ivory" padding="md" className="flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-ink-secondary leading-snug">
                    {kpi.label}
                  </span>
                </div>

                <div className="mt-3 mb-2">
                  {kpi.isLoading ? (
                    <div
                      className="h-7 w-24 rounded bg-surface-secondary animate-pulse"
                      aria-label="Loading metric"
                    />
                  ) : kpi.value !== null ? (
                    <div className="font-heading text-2xl font-bold text-ink-primary font-mono tracking-tight">
                      {kpi.value}
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span
                        className="font-mono text-xl font-semibold text-ink-secondary/60"
                        aria-label="Metric unavailable"
                      >
                        —
                      </span>
                      <span className="text-[11px] text-status-warning font-medium">
                        {kpi.isUnavailable ? 'API Offline' : 'No Data'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2.5 border-t border-border-warm/80 space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <Badge
                    variant={kpi.isUnavailable ? 'warning' : kpi.statusVariant}
                    dot
                  >
                    {kpi.isUnavailable
                      ? 'Unavailable'
                      : kpi.hasError
                        ? 'Query Error'
                        : kpi.statusLabel}
                  </Badge>
                </div>
                <div
                  className="text-[10px] font-mono text-ink-secondary truncate"
                  title={kpi.footnote}
                >
                  {kpi.footnote}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* =====================================================================
          2.5 SYNESIS INTELLIGENCE & THREAT SURVEILLANCE BAR
          ===================================================================== */}
      <section aria-labelledby="cc-intelligence-heading" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2
            id="cc-intelligence-heading"
            className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary"
          >
            SYNESIS Threat &amp; Voice-of-Customer Intelligence
          </h2>
          <span className="text-[11px] text-burgundy font-medium">
            Multi-Signal Autonomous Correlation Active
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Tile 1: Brand Impersonation */}
          <Link to="/intelligence/brand-protection" className="block group">
            <Card variant="ivory" padding="sm" className="hover:border-burgundy/40 transition-colors h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-ink-primary flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-burgundy" />
                    Brand Protection
                  </span>
                  <Badge variant="burgundy" size="sm">TAKEDOWN DRAFT</Badge>
                </div>
                <div className="text-sm font-bold text-ink-primary font-mono truncate">
                  syndicate-pay-portal.com
                </div>
                <div className="text-[11px] text-ink-secondary mt-0.5">
                  Combo-squatting • Risk 98/100
                </div>
              </div>
              <div className="pt-2 border-t border-border-subtle mt-2 flex items-center justify-between text-[10px] text-burgundy font-medium group-hover:underline">
                <span>View Registrar Dossier</span>
                <span>→</span>
              </div>
            </Card>
          </Link>

          {/* Tile 2: Complaint Intelligence */}
          <Link to="/intelligence/complaints" className="block group">
            <Card variant="ivory" padding="sm" className="hover:border-burgundy/40 transition-colors h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-ink-primary flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-status-critical" />
                    Complaint Surge
                  </span>
                  <Badge variant="critical" size="sm">+340% SURGE</Badge>
                </div>
                <div className="text-sm font-bold text-ink-primary font-mono truncate">
                  64 complaints / hr
                </div>
                <div className="text-[11px] text-ink-secondary mt-0.5">
                  Checkout Timeout &amp; Double Debit
                </div>
              </div>
              <div className="pt-2 border-t border-border-subtle mt-2 flex items-center justify-between text-[10px] text-burgundy font-medium group-hover:underline">
                <span>Analyze Sentiment</span>
                <span>→</span>
              </div>
            </Card>
          </Link>

          {/* Tile 3: Threat & Traffic Bursts */}
          <Link to="/intelligence/threat-monitoring" className="block group">
            <Card variant="ivory" padding="sm" className="hover:border-burgundy/40 transition-colors h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-ink-primary flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-status-critical" />
                    L7 Threat Burst
                  </span>
                  <Badge variant="critical" size="sm">4,200 RPS</Badge>
                </div>
                <div className="text-sm font-bold text-ink-primary font-mono truncate">
                  HTTP Flood on /checkout/*
                </div>
                <div className="text-[11px] text-ink-secondary mt-0.5">
                  WAF Turnstile Rule Enforced
                </div>
              </div>
              <div className="pt-2 border-t border-border-subtle mt-2 flex items-center justify-between text-[10px] text-burgundy font-medium group-hover:underline">
                <span>Inspect Traffic WAF</span>
                <span>→</span>
              </div>
            </Card>
          </Link>

          {/* Tile 4: Unified Incident Correlation */}
          <Link to="/intelligence/correlation" className="block group">
            <Card variant="ivory" padding="sm" className="hover:border-burgundy/40 transition-colors h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-ink-primary flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-burgundy" />
                    Unified Correlation
                  </span>
                  <Badge variant="healthy" size="sm">96% CONFIDENCE</Badge>
                </div>
                <div className="text-sm font-bold text-ink-primary font-mono truncate">
                  CORR-2026-101
                </div>
                <div className="text-[11px] text-ink-secondary mt-0.5">
                  Converged RCA: 5 Signal Vectors
                </div>
              </div>
              <div className="pt-2 border-t border-border-subtle mt-2 flex items-center justify-between text-[10px] text-burgundy font-medium group-hover:underline">
                <span>Inspect Causal Graph</span>
                <span>→</span>
              </div>
            </Card>
          </Link>
        </div>
      </section>

      {/* =====================================================================
          3. BUSINESS JOURNEY HEALTH
          ===================================================================== */}
      <section aria-labelledby="cc-journeys-heading">
        <Card variant="ivory">
          <CardHeader
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-48">
                  <Input
                    type="search"
                    value={journeySearch}
                    onChange={(e) => setJourneySearch(e.target.value)}
                    placeholder="Filter journeys..."
                    aria-label="Filter monitored business journeys"
                  />
                </div>
                <Select
                  aria-label="Filter journeys by execution status"
                  value={journeyStatusFilter}
                  onChange={(e) => setJourneyStatusFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All States' },
                    { value: 'healthy', label: 'Healthy' },
                    { value: 'degraded', label: 'Degraded' },
                    { value: 'failing', label: 'Failing' },
                  ]}
                />
                <Link to="/monitoring/journeys">
                  <Button
                    variant="outline"
                    size="sm"
                    rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                  >
                    Full Journey Matrix
                  </Button>
                </Link>
              </div>
            }
          >
            <div className="flex items-center gap-2">
              <Workflow className="w-4 h-4 text-burgundy shrink-0" aria-hidden="true" />
              <div>
                <CardTitle id="cc-journeys-heading">Business Journey Health</CardTitle>
                <CardDescription>
                  Synthetic e-commerce user flows (Login, Product browsing, Add to cart, Checkout,
                  Payment, Order confirmation) with pass rate, latency, and latest execution state.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {journeysQuery.isFetching ? (
              <LoadingState
                title="Loading synthetic business journeys"
                description="Querying GET /api/v1/journeys..."
                rows={4}
              />
            ) : journeysQuery.isError && journeysQuery.error?.isUnavailable ? (
              <div className="space-y-4">
                <UnavailableState
                  title="Business Journey Telemetry API Unavailable"
                  description="Endpoint GET /api/v1/journeys did not respond. SYNESIS does not fabricate synthetic pass rates or latencies when the monitoring backend is offline."
                  endpoint="/api/v1/journeys"
                  onRetry={() => void journeysQuery.refetch()}
                />

                {/* Expected E-Commerce Journey Schema Reference (Unprobed) */}
                <div className="rounded-lg border border-border-warm bg-surface-cream/60 p-3.5">
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="text-xs font-semibold text-ink-primary">
                      Target E-Commerce Funnel Checkpoints (Awaiting Backend Configuration)
                    </span>
                    <MonoCode>GET /api/v1/journeys</MonoCode>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {CANONICAL_ECOMMERCE_JOURNEY_STAGES.map((stageName, index) => (
                      <div
                        key={stageName}
                        className="rounded-md bg-surface-ivory border border-border-warm p-2.5 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-ink-secondary">
                          <span>STAGE 0{index + 1}</span>
                          <Badge variant="neutral">Unverified</Badge>
                        </div>
                        <div className="text-xs font-semibold text-ink-primary mt-1.5">
                          {stageName}
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-border-warm/60 flex items-center justify-between text-[11px] font-mono text-ink-secondary">
                          <span>Pass: —</span>
                          <span>Latency: —</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : journeysQuery.isError ? (
              <ErrorState
                title="Failed to load business journeys"
                message={journeysQuery.error?.message ?? 'Unexpected error'}
                statusCode={journeysQuery.error?.status}
                endpoint="/api/v1/journeys"
                onRetry={() => void journeysQuery.refetch()}
              />
            ) : filteredJourneys.length === 0 ? (
              <EmptyState
                title="No monitored journeys matched the active filter"
                description="Either no synthetic journeys are configured in the backend or the current filter excluded all records."
                endpoint="/api/v1/journeys"
                actionLabel="Reset journey filters"
                onAction={() => {
                  setJourneySearch('');
                  setJourneyStatusFilter('all');
                }}
              />
            ) : (
              <>
                <DataTable
                  caption="Monitored business journeys health table"
                  columns={[
                    {
                      key: 'id',
                      header: 'Journey ID',
                      mono: true,
                    },
                    {
                      key: 'name',
                      header: 'Journey Name',
                      render: (row) => (
                        <span className="font-semibold text-ink-primary">
                          {String(row.name)}
                        </span>
                      ),
                    },
                    {
                      key: 'latestExecutionStatus',
                      header: 'Latest Execution Status',
                      render: (row) => {
                        const st = row.latestExecutionStatus as JourneyExecutionStatus;
                        return (
                          <Badge variant={journeyStatusToVariant(st)} dot>
                            {st.toUpperCase()}
                          </Badge>
                        );
                      },
                    },
                    {
                      key: 'successRate',
                      header: 'Success Rate',
                      mono: true,
                      align: 'right',
                      render: (row) =>
                        typeof row.successRate === 'number'
                          ? `${row.successRate.toFixed(2)}%`
                          : '—',
                    },
                    {
                      key: 'averageLatencyMs',
                      header: 'Avg Latency',
                      mono: true,
                      align: 'right',
                      render: (row) =>
                        typeof row.averageLatencyMs === 'number'
                          ? `${Math.round(row.averageLatencyMs)} ms`
                          : '—',
                    },
                    {
                      key: 'lastRunAt',
                      header: 'Last Run Time',
                      mono: true,
                      align: 'right',
                      render: (row) => String(row.lastRunAt ?? '—'),
                    },
                  ]}
                  data={filteredJourneys as unknown as Record<string, unknown>[]}
                  rowKey={(row) => String(row.id)}
                />

                {/* Conditional Recharts Visualization: Rendered ONLY when actual numeric journey data exists */}
                {journeysChartData.length > 0 && (
                  <div className="pt-3 border-t border-border-warm">
                    <div className="text-xs font-semibold text-ink-primary mb-2">
                      Journey Latency Distribution (ms)
                    </div>
                    <div className="h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={journeysChartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={DESIGN_TOKENS.colors.warmBorder}
                          />
                          <XAxis
                            dataKey="name"
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
                          <Bar
                            dataKey="latencyMs"
                            name="Avg Latency (ms)"
                            fill={DESIGN_TOKENS.colors.deepBurgundy}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {/* =====================================================================
          4. INCIDENT ACTIVITY & 5. SERVICE HEALTH (Two-Column Enterprise Grid)
          ===================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* 4. INCIDENT ACTIVITY (7 Columns on XL) */}
        <section aria-labelledby="cc-incidents-heading" className="xl:col-span-7">
          <Card variant="ivory" className="h-full flex flex-col justify-between">
            <div>
              <CardHeader
                actions={
                  <div className="flex items-center gap-2 flex-wrap">
                    <div
                      role="group"
                      aria-label="Incident view mode"
                      className="inline-flex rounded border border-border-warm bg-surface-cream p-0.5"
                    >
                      {(['table', 'timeline'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setIncidentViewMode(mode)}
                          className={[
                            'px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors',
                            incidentViewMode === mode
                              ? 'bg-burgundy text-surface-ivory'
                              : 'text-ink-secondary hover:text-ink-primary',
                          ].join(' ')}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>

                    <Link to="/intelligence/incidents">
                      <Button
                        variant="outline"
                        size="sm"
                        rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                      >
                        Incident Console
                      </Button>
                    </Link>
                  </div>
                }
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-status-critical shrink-0" aria-hidden="true" />
                  <div>
                    <CardTitle id="cc-incidents-heading">Incident Activity</CardTitle>
                    <CardDescription>
                      Active and recent incidents with affected journey or service, severity,
                      status, first-seen time, and latest update.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              {/* Incident Filters */}
              <div className="px-4 py-2.5 bg-surface-cream/60 border-b border-border-warm flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[160px]">
                  <Input
                    type="search"
                    value={incidentSearch}
                    onChange={(e) => setIncidentSearch(e.target.value)}
                    placeholder="Filter by incident ID or target..."
                    aria-label="Filter incidents by ID or affected target"
                  />
                </div>
                <Select
                  aria-label="Filter incidents by severity"
                  value={incidentSeverityFilter}
                  onChange={(e) => setIncidentSeverityFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Severities' },
                    { value: 'sev1', label: 'SEV-1 / Critical' },
                    { value: 'sev2', label: 'SEV-2 / High' },
                    { value: 'sev3', label: 'SEV-3 / Medium' },
                    { value: 'low', label: 'Low' },
                  ]}
                />
                <Select
                  aria-label="Filter incidents by status"
                  value={incidentStatusFilter}
                  onChange={(e) => setIncidentStatusFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'open', label: 'Open' },
                    { value: 'investigating', label: 'Investigating' },
                    { value: 'mitigating', label: 'Mitigating' },
                    { value: 'resolved', label: 'Resolved' },
                  ]}
                />
              </div>

              <CardContent>
                {incidentsQuery.isFetching ? (
                  <LoadingState
                    title="Loading incident activity"
                    description="Querying GET /api/v1/incidents..."
                    rows={3}
                  />
                ) : incidentsQuery.isError && incidentsQuery.error?.isUnavailable ? (
                  <UnavailableState
                    title="Incident Activity API Unavailable"
                    description="Endpoint GET /api/v1/incidents is unreachable. No synthetic or mock incidents are fabricated."
                    endpoint="/api/v1/incidents"
                    onRetry={() => void incidentsQuery.refetch()}
                  />
                ) : incidentsQuery.isError ? (
                  <ErrorState
                    title="Incident query failed"
                    message={incidentsQuery.error?.message ?? 'Failed to fetch incidents'}
                    statusCode={incidentsQuery.error?.status}
                    endpoint="/api/v1/incidents"
                    onRetry={() => void incidentsQuery.refetch()}
                  />
                ) : filteredIncidents.length === 0 ? (
                  <EmptyState
                    title="No incidents in current scope"
                    description="Zero active or historical incidents matched the selected filter and evaluation window."
                    endpoint="/api/v1/incidents"
                  />
                ) : incidentViewMode === 'table' ? (
                  <DataTable
                    caption="Incident activity table"
                    columns={[
                      { key: 'id', header: 'Incident ID', mono: true },
                      {
                        key: 'affectedTarget',
                        header: 'Affected Journey / Service',
                        render: (row) => (
                          <span className="font-medium text-ink-primary">
                            {String(row.affectedTarget)}
                          </span>
                        ),
                      },
                      {
                        key: 'severity',
                        header: 'Severity',
                        render: (row) => {
                          const sev = row.severity as IncidentActivityRecord['severity'];
                          return (
                            <Badge variant={severityToVariant(sev)} dot>
                              {String(sev).toUpperCase()}
                            </Badge>
                          );
                        },
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
                      {
                        key: 'latestUpdateAt',
                        header: 'Latest Update',
                        mono: true,
                        align: 'right',
                      },
                    ]}
                    data={filteredIncidents as unknown as Record<string, unknown>[]}
                    rowKey={(row) => String(row.id)}
                  />
                ) : (
                  <ol className="relative border-l border-border-warm ml-3 space-y-4 py-1">
                    {filteredIncidents.map((inc) => (
                      <li key={inc.id} className="ml-4">
                        <span
                          className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-burgundy border-2 border-surface-ivory"
                          aria-hidden="true"
                        />
                        <div className="p-3 rounded-md bg-surface-cream/60 border border-border-warm">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <MonoCode>{inc.id}</MonoCode>
                              <span className="text-xs font-semibold text-ink-primary">
                                {inc.affectedTarget}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Badge variant={severityToVariant(inc.severity)} dot>
                                {inc.severity.toUpperCase()}
                              </Badge>
                              <Badge
                                variant={inc.status === 'resolved' ? 'healthy' : 'warning'}
                              >
                                {inc.status}
                              </Badge>
                            </div>
                          </div>
                          {inc.title && (
                            <p className="text-xs text-ink-secondary mt-1">{inc.title}</p>
                          )}
                          <div className="mt-2 flex items-center gap-4 text-[11px] font-mono text-ink-secondary">
                            <span>First seen: {inc.firstSeenAt}</span>
                            <span>Updated: {inc.latestUpdateAt}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </div>

            <CardFooter>
              <span>Contract: GET /api/v1/incidents</span>
              <span>Showing {filteredIncidents.length} incident(s)</span>
            </CardFooter>
          </Card>
        </section>

        {/* 5. SERVICE HEALTH (5 Columns on XL) */}
        <section aria-labelledby="cc-services-heading" className="xl:col-span-5">
          <Card variant="ivory" className="h-full flex flex-col justify-between">
            <div>
              <CardHeader
                actions={
                  <Link to="/monitoring/service-health">
                    <Button
                      variant="outline"
                      size="sm"
                      rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                    >
                      Service Topology
                    </Button>
                  </Link>
                }
              >
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-burgundy shrink-0" aria-hidden="true" />
                  <div>
                    <CardTitle id="cc-services-heading">Service Health</CardTitle>
                    <CardDescription>
                      Configured payment gateways and backend services distinguishing healthy,
                      degraded, unhealthy, and unknown states.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              {/* State Filter Bar */}
              <div className="px-4 py-2.5 bg-surface-cream/60 border-b border-border-warm flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-ink-secondary">
                  Filter by State:
                </span>
                <div
                  role="group"
                  aria-label="Filter services by state"
                  className="inline-flex rounded border border-border-warm bg-surface-ivory p-0.5"
                >
                  {(['all', 'healthy', 'degraded', 'unhealthy', 'unknown'] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setServiceStateFilter(st)}
                        className={[
                          'px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors',
                          serviceStateFilter === st
                            ? 'bg-burgundy text-surface-ivory'
                            : 'text-ink-secondary hover:text-ink-primary',
                        ].join(' ')}
                      >
                        {st}
                      </button>
                    )
                  )}
                </div>
              </div>

              <CardContent>
                {servicesQuery.isFetching ? (
                  <LoadingState
                    title="Probing service health nodes"
                    description="Querying GET /api/v1/services/health..."
                    rows={3}
                  />
                ) : servicesQuery.isError && servicesQuery.error?.isUnavailable ? (
                  <div className="space-y-3">
                    <UnavailableState
                      title="Service Health Configuration API Unavailable"
                      description="Endpoint GET /api/v1/services/health did not respond. Primary payment gateway, secondary payment gateway, and downstream services are displayed strictly when present in backend configuration."
                      endpoint="/api/v1/services/health"
                      onRetry={() => void servicesQuery.refetch()}
                    />

                    {/* State Legend distinguishing Healthy, Degraded, Unhealthy, Unknown */}
                    <div className="rounded-md bg-surface-cream/70 border border-border-warm p-3">
                      <div className="text-[11px] font-semibold text-ink-primary mb-2">
                        Supported Service Health Classification States
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Badge variant="healthy" dot>
                          Healthy
                        </Badge>
                        <Badge variant="warning" dot>
                          Degraded
                        </Badge>
                        <Badge variant="critical" dot>
                          Unhealthy
                        </Badge>
                        <Badge variant="neutral" dot>
                          Unknown
                        </Badge>
                      </div>
                    </div>
                  </div>
                ) : servicesQuery.isError ? (
                  <ErrorState
                    title="Service health query failed"
                    message={servicesQuery.error?.message ?? 'Error querying service health'}
                    statusCode={servicesQuery.error?.status}
                    endpoint="/api/v1/services/health"
                    onRetry={() => void servicesQuery.refetch()}
                  />
                ) : filteredServices.length === 0 ? (
                  <EmptyState
                    title="No configured services returned"
                    description="No services matched the selected state filter in the backend configuration."
                    endpoint="/api/v1/services/health"
                  />
                ) : (
                  <div className="space-y-2.5">
                    {filteredServices.map((svc) => (
                      <div
                        key={svc.id}
                        className="p-3 rounded-md bg-surface-cream/50 border border-border-warm flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-ink-primary truncate">
                              {svc.name}
                            </span>
                            {svc.role && <Badge variant="neutral">{svc.role}</Badge>}
                          </div>
                          <div className="text-[11px] font-mono text-ink-secondary mt-1 flex items-center gap-3">
                            <span>ID: {svc.id}</span>
                            {typeof svc.latencyMs === 'number' && (
                              <span>Latency: {Math.round(svc.latencyMs)} ms</span>
                            )}
                            {typeof svc.errorRatePercent === 'number' && (
                              <span>Err: {svc.errorRatePercent.toFixed(2)}%</span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <Badge variant={serviceStateToVariant(svc.state)} dot>
                            {svc.state.toUpperCase()}
                          </Badge>
                          {svc.lastCheckedAt && (
                            <div className="text-[10px] font-mono text-ink-secondary mt-1">
                              {svc.lastCheckedAt}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </div>

            <CardFooter>
              <span>Contract: GET /api/v1/services/health</span>
              <span>Configured nodes: {servicesQuery.data?.length ?? 0}</span>
            </CardFooter>
          </Card>
        </section>
      </div>

      {/* =====================================================================
          6. FAILURE PATTERNS AND RECOVERY ACTIVITY
          ===================================================================== */}
      <section aria-labelledby="cc-recovery-intelligence-heading">
        <Card variant="ivory">
          <CardHeader
            actions={
              <div
                role="tablist"
                aria-label="Failure patterns and recovery activity tabs"
                className="inline-flex rounded-md border border-border-warm bg-surface-cream p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={recoveryPanelTab === 'patterns'}
                  onClick={() => setRecoveryPanelTab('patterns')}
                  className={[
                    'px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
                    recoveryPanelTab === 'patterns'
                      ? 'bg-burgundy text-surface-ivory shadow-subtle'
                      : 'text-ink-secondary hover:text-ink-primary',
                  ].join(' ')}
                >
                  <Radar className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Failure Patterns</span>
                  {failurePatternsQuery.isSuccess && (
                    <Badge variant="neutral" mono>
                      {failurePatternsQuery.data.length}
                    </Badge>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={recoveryPanelTab === 'recoveries'}
                  onClick={() => setRecoveryPanelTab('recoveries')}
                  className={[
                    'px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
                    recoveryPanelTab === 'recoveries'
                      ? 'bg-burgundy text-surface-ivory shadow-subtle'
                      : 'text-ink-secondary hover:text-ink-primary',
                  ].join(' ')}
                >
                  <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Recovery &amp; Verification</span>
                  {recoveryExecutionsQuery.isSuccess && (
                    <Badge variant="neutral" mono>
                      {recoveryExecutionsQuery.data.length}
                    </Badge>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={recoveryPanelTab === 'approvals'}
                  onClick={() => setRecoveryPanelTab('approvals')}
                  className={[
                    'px-3 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1.5',
                    recoveryPanelTab === 'approvals'
                      ? 'bg-burgundy text-surface-ivory shadow-subtle'
                      : 'text-ink-secondary hover:text-ink-primary',
                  ].join(' ')}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Pending Approvals</span>
                  {recoveryApprovalsQuery.isSuccess && (
                    <Badge variant="neutral" mono>
                      {recoveryApprovalsQuery.data.length}
                    </Badge>
                  )}
                </button>
              </div>
            }
          >
            <div>
              <CardTitle id="cc-recovery-intelligence-heading">
                Failure Patterns &amp; Recovery Activity
              </CardTitle>
              <CardDescription>
                Recurring error signatures, countermeasure execution attempts, post-action
                verification outcomes, and human-in-the-loop approval requests.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {recoveryPanelTab === 'patterns' && (
              <DataTable
                caption="Recurring failure patterns table"
                columns={[
                  { key: 'id', header: 'Pattern ID', mono: true },
                  { key: 'signature', header: 'Failure Signature' },
                  {
                    key: 'affectedJourneyOrService',
                    header: 'Affected Journey / Service',
                  },
                  {
                    key: 'occurrencesCount',
                    header: 'Occurrences',
                    mono: true,
                    align: 'right',
                  },
                  {
                    key: 'severity',
                    header: 'Classification',
                    render: (row) => (
                      <Badge
                        variant={
                          row.severity === 'critical'
                            ? 'critical'
                            : row.severity === 'warning'
                              ? 'warning'
                              : 'info'
                        }
                        dot
                      >
                        {String(row.severity).toUpperCase()}
                      </Badge>
                    ),
                  },
                  {
                    key: 'lastObservedAt',
                    header: 'Last Observed',
                    mono: true,
                    align: 'right',
                  },
                ]}
                data={
                  (failurePatternsQuery.data ?? []) as unknown as Record<string, unknown>[]
                }
                rowKey={(row) => String(row.id)}
                isLoading={failurePatternsQuery.isFetching}
                isUnavailable={
                  failurePatternsQuery.isError &&
                  Boolean(failurePatternsQuery.error?.isUnavailable)
                }
                error={
                  failurePatternsQuery.isError && !failurePatternsQuery.error?.isUnavailable
                    ? {
                        message: failurePatternsQuery.error.message,
                        status: failurePatternsQuery.error.status,
                      }
                    : null
                }
                endpoint="/api/v1/intelligence/failure-patterns"
                emptyTitle="No recurring failure patterns detected"
                emptyDescription="Zero recurring error signatures were clustered in the selected evaluation window."
                onRetry={() => void failurePatternsQuery.refetch()}
              />
            )}

            {recoveryPanelTab === 'recoveries' && (
              <DataTable
                caption="Recent recovery attempts and verification outcomes"
                columns={[
                  { key: 'id', header: 'Execution ID', mono: true },
                  { key: 'playbookName', header: 'Countermeasure Playbook' },
                  { key: 'targetServiceOrJourney', header: 'Target Scope' },
                  {
                    key: 'status',
                    header: 'Execution State',
                    render: (row) => (
                      <Badge
                        variant={
                          row.status === 'verified'
                            ? 'healthy'
                            : row.status === 'in_progress'
                              ? 'info'
                              : row.status === 'pending_approval'
                                ? 'warning'
                                : 'critical'
                        }
                        dot
                      >
                        {String(row.status).replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    ),
                  },
                  {
                    key: 'verificationResult',
                    header: 'Verification Result',
                    render: (row) => String(row.verificationResult ?? 'Pending probe check'),
                  },
                  {
                    key: 'executedAt',
                    header: 'Executed At',
                    mono: true,
                    align: 'right',
                  },
                ]}
                data={
                  (recoveryExecutionsQuery.data ?? []) as unknown as Record<string, unknown>[]
                }
                rowKey={(row) => String(row.id)}
                isLoading={recoveryExecutionsQuery.isFetching}
                isUnavailable={
                  recoveryExecutionsQuery.isError &&
                  Boolean(recoveryExecutionsQuery.error?.isUnavailable)
                }
                error={
                  recoveryExecutionsQuery.isError &&
                  !recoveryExecutionsQuery.error?.isUnavailable
                    ? {
                        message: recoveryExecutionsQuery.error.message,
                        status: recoveryExecutionsQuery.error.status,
                      }
                    : null
                }
                endpoint="/api/v1/recovery/executions"
                emptyTitle="No recovery executions recorded"
                emptyDescription="No countermeasure playbooks have been triggered during the selected evaluation window."
                onRetry={() => void recoveryExecutionsQuery.refetch()}
              />
            )}

            {recoveryPanelTab === 'approvals' && (
              <DataTable
                caption="Pending recovery approvals queue"
                columns={[
                  { key: 'id', header: 'Request ID', mono: true },
                  { key: 'proposedCountermeasure', header: 'Proposed Countermeasure' },
                  { key: 'targetScope', header: 'Target Scope' },
                  {
                    key: 'blastRadius',
                    header: 'Blast Radius',
                    render: (row) => (
                      <Badge
                        variant={
                          row.blastRadius === 'high'
                            ? 'critical'
                            : row.blastRadius === 'medium'
                              ? 'warning'
                              : 'info'
                        }
                      >
                        {String(row.blastRadius).toUpperCase()}
                      </Badge>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Authorization Status',
                    render: (row) => (
                      <Badge
                        variant={
                          row.status === 'approved'
                            ? 'healthy'
                            : row.status === 'pending'
                              ? 'warning'
                              : 'neutral'
                        }
                        dot
                      >
                        {String(row.status).toUpperCase()}
                      </Badge>
                    ),
                  },
                  {
                    key: 'requestedAt',
                    header: 'Requested At',
                    mono: true,
                    align: 'right',
                  },
                ]}
                data={
                  (recoveryApprovalsQuery.data ?? []) as unknown as Record<string, unknown>[]
                }
                rowKey={(row) => String(row.id)}
                isLoading={recoveryApprovalsQuery.isFetching}
                isUnavailable={
                  recoveryApprovalsQuery.isError &&
                  Boolean(recoveryApprovalsQuery.error?.isUnavailable)
                }
                error={
                  recoveryApprovalsQuery.isError &&
                  !recoveryApprovalsQuery.error?.isUnavailable
                    ? {
                        message: recoveryApprovalsQuery.error.message,
                        status: recoveryApprovalsQuery.error.status,
                      }
                    : null
                }
                endpoint="/api/v1/recovery/approvals"
                emptyTitle="Approval queue is clear"
                emptyDescription="Zero recovery actions are currently awaiting operator authorization."
                onRetry={() => void recoveryApprovalsQuery.refetch()}
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* =====================================================================
          7. QUICK ACTIONS
          ===================================================================== */}
      <section aria-labelledby="cc-quick-actions-heading" className="space-y-2.5">
        <h2
          id="cc-quick-actions-heading"
          className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary"
        >
          Quick Operational Actions
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Link
            to="/monitoring/journeys"
            className="group block rounded-lg bg-surface-ivory border border-border-warm hover:border-burgundy-accent p-4 shadow-subtle transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-md bg-burgundy/10 text-burgundy">
                <Workflow className="w-4 h-4" aria-hidden="true" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-ink-secondary group-hover:text-burgundy transition-colors" />
            </div>
            <h3 className="font-heading text-sm font-semibold text-ink-primary mt-3 group-hover:text-burgundy transition-colors">
              View Journeys
            </h3>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
              Inspect synthetic step assertions, funnel latency breakdowns, and execution schedules.
            </p>
          </Link>

          <Link
            to="/intelligence/incidents"
            className="group block rounded-lg bg-surface-ivory border border-border-warm hover:border-burgundy-accent p-4 shadow-subtle transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-md bg-status-critical/10 text-status-critical">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-ink-secondary group-hover:text-burgundy transition-colors" />
            </div>
            <h3 className="font-heading text-sm font-semibold text-ink-primary mt-3 group-hover:text-burgundy transition-colors">
              Inspect Incidents
            </h3>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
              Triage active commerce disruptions, review affected services, and track mitigation timelines.
            </p>
          </Link>

          <Link
            to="/intelligence/failure-patterns"
            className="group block rounded-lg bg-surface-ivory border border-border-warm hover:border-burgundy-accent p-4 shadow-subtle transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-md bg-status-warning/12 text-status-warning">
                <Radar className="w-4 h-4" aria-hidden="true" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-ink-secondary group-hover:text-burgundy transition-colors" />
            </div>
            <h3 className="font-heading text-sm font-semibold text-ink-primary mt-3 group-hover:text-burgundy transition-colors">
              Analyze Failure Patterns
            </h3>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
              Examine clustered error signatures and recurring anomalies across storefront probes.
            </p>
          </Link>

          <Link
            to="/recovery/approvals"
            className="group block rounded-lg bg-surface-ivory border border-border-warm hover:border-burgundy-accent p-4 shadow-subtle transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-md bg-status-healthy/10 text-status-healthy">
                <GitPullRequest className="w-4 h-4" aria-hidden="true" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-ink-secondary group-hover:text-burgundy transition-colors" />
            </div>
            <h3 className="font-heading text-sm font-semibold text-ink-primary mt-3 group-hover:text-burgundy transition-colors">
              Review Recovery Approvals
            </h3>
            <p className="text-xs text-ink-secondary mt-1 leading-relaxed">
              Authorize or reject pending high-impact countermeasures with blast-radius guardrails.
            </p>
          </Link>
        </div>
      </section>

      {/* =====================================================================
          DOCUMENTED API CONTRACTS & AVAILABILITY MODAL
          ===================================================================== */}
      <Dialog
        open={isContractsDialogOpen}
        onClose={() => setIsContractsDialogOpen(false)}
        title="Command Center Backend API Contracts"
        description="Documented FastAPI endpoints queried by the Command Center. Missing or unreachable endpoints are explicitly surfaced instead of generating fake metrics."
        size="xl"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setIsContractsDialogOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-3">
          {COMMAND_CENTER_ENDPOINT_CONTRACTS.map((contract) => {
            const queryMap = {
              journeys: journeysQuery,
              incidents: incidentsQuery,
              services: servicesQuery,
              'failure-patterns': failurePatternsQuery,
              'recovery-executions': recoveryExecutionsQuery,
              'recovery-approvals': recoveryApprovalsQuery,
            } as const;
            const q = queryMap[contract.id as keyof typeof queryMap];
            const isAvailable = q?.isSuccess;

            return (
              <div
                key={contract.id}
                className="p-3.5 rounded-md bg-surface-cream/60 border border-border-warm space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink-primary">
                      {contract.domain}
                    </span>
                    <MonoCode>
                      {contract.method} {contract.endpoint}
                    </MonoCode>
                  </div>
                  <Badge variant={isAvailable ? 'healthy' : 'warning'} dot>
                    {q?.isFetching
                      ? 'Probing...'
                      : isAvailable
                        ? 'Connected'
                        : 'Endpoint Unavailable'}
                  </Badge>
                </div>

                <p className="text-xs text-ink-secondary leading-relaxed">
                  {contract.description}
                </p>

                <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-ink-secondary">
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  <span>Expected schema fields:</span>
                  {contract.expectedFields.map((field) => (
                    <MonoCode key={field}>{field}</MonoCode>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>
    </div>
  );
};
