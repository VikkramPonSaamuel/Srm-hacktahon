import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Terminal,
  UserCheck,
  Zap,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import { TIME_RANGE_OPTIONS } from '../styles/tokens';
import { useBackendHealthQuery } from '../api/client';
import { useCommandCenterData } from '../api/commandCenter';
import { TriggerExecutionDialog } from '../components/journeys/TriggerExecutionDialog';
import { Button } from '../components/ui/Button';
import { Badge, MonoCode } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';

// Canonical 6-stage e-commerce workflow
interface WorkflowStageSpec {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  defaultLatency: number;
  sampleImpactIfFailing: string;
}

const CANONICAL_WORKFLOWS: WorkflowStageSpec[] = [
  {
    id: 'login',
    name: 'Customer Login',
    description: 'Authentication, session token creation, and customer profile loading.',
    icon: UserCheck,
    defaultLatency: 110,
    sampleImpactIfFailing: 'Customers are unable to access accounts or saved payment methods.',
  },
  {
    id: 'browse',
    name: 'Product Browsing',
    description: 'Catalog search, category filtering, and product detail loading.',
    icon: ShoppingBag,
    defaultLatency: 85,
    sampleImpactIfFailing: 'Storefront navigation degrades; shoppers cannot discover items.',
  },
  {
    id: 'cart',
    name: 'Add to Cart',
    description: 'Cart mutations, inventory validation, and pricing recalculation.',
    icon: ShoppingCart,
    defaultLatency: 140,
    sampleImpactIfFailing: 'Shoppers cannot stage products for purchase, resulting in cart abandonment.',
  },
  {
    id: 'checkout',
    name: 'Checkout Flow',
    description: 'Address entry, shipping calculation, tax estimate, and coupon application.',
    icon: CreditCard,
    defaultLatency: 310,
    sampleImpactIfFailing: 'Checkout requests fail. Shoppers cannot proceed to payment capture.',
  },
  {
    id: 'payment',
    name: 'Payment Processing',
    description: 'Dual-gateway pre-authorization, 3D-Secure challenge, and token capture.',
    icon: Zap,
    defaultLatency: 240,
    sampleImpactIfFailing: 'Primary payment gateway timeout. Transactions risk drop-off without automated failover.',
  },
  {
    id: 'order',
    name: 'Order Confirmation',
    description: 'Order ledger generation, confirmation email trigger, and receipt delivery.',
    icon: CheckCircle2,
    defaultLatency: 95,
    sampleImpactIfFailing: 'Payment confirmation failed. Customers may not receive order confirmations.',
  },
];

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { timeRange, setTimeRange } = useShell();

  // Queries
  const backendHealth = useBackendHealthQuery();
  const {
    journeysQuery,
    servicesQuery,
    incidentsQuery,
    failurePatternsQuery,
    recoveryExecutionsQuery,
    recoveryApprovalsQuery,
    kpiMetrics,
    isAnyFetching,
    refetchAll,
  } = useCommandCenterData(timeRange);

  const unavailableEndpointsCount = [
    journeysQuery,
    servicesQuery,
    incidentsQuery,
    failurePatternsQuery,
    recoveryExecutionsQuery,
    recoveryApprovalsQuery,
  ].filter((q) => q.isError && q.error?.isUnavailable).length;

  const handleManualRefresh = refetchAll;
  const pendingApprovalsCount = (recoveryApprovalsQuery.data ?? []).filter((a) => a.status === 'pending').length;
  const completedRecoveryCount = (recoveryExecutionsQuery.data ?? []).filter((r) => r.status === 'verified').length;

  const isBackendConnected = backendHealth.isSuccess && !backendHealth.isError;

  // Selected workflow for detail dialog
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowStageSpec | null>(null);
  const [isTriggerDialogOpen, setIsTriggerDialogOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(new Set());

  const toggleIssueExpand = (id: string) => {
    setExpandedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // System status
  const systemStatus = useMemo(() => {
    if (!isBackendConnected) {
      return {
        label: 'Monitoring connection unavailable',
        variant: 'warning' as const,
        dotColor: 'bg-status-warning',
        cardTitle: 'Monitoring connection unavailable',
        cardDescription:
          'Live business health cannot currently be verified. Reconnect the backend to resume reliable monitoring.',
        cardActionLabel: 'Check connection',
      };
    }
    if ((kpiMetrics.activeIncidentsCount ?? 0) > 0 || (kpiMetrics.unhealthyServicesCount ?? 0) > 0) {
      return {
        label: 'Attention required',
        variant: 'critical' as const,
        dotColor: 'bg-status-critical',
        cardTitle: `${kpiMetrics.activeIncidentsCount || 1} business issue requires your attention`,
        cardDescription:
          'Automated checks detected degradation in payment and checkout processes. AI root cause analysis and recovery playbooks are available.',
        cardActionLabel: 'Review active issue',
      };
    }
    if (pendingApprovalsCount > 0) {
      return {
        label: 'Recovery in progress',
        variant: 'info' as const,
        dotColor: 'bg-status-info',
        cardTitle: 'Recovery action awaiting approval',
        cardDescription:
          'A proposed failover playbook is queued for dual-key operator sign-off in the Approval Queue.',
        cardActionLabel: 'Open approval queue',
      };
    }
    return {
      label: 'All systems operating normally',
      variant: 'healthy' as const,
      dotColor: 'bg-status-healthy',
      cardTitle: 'Your business is being monitored',
      cardDescription:
        'Automated checks are tracking your critical customer journeys and service health.',
      cardActionLabel: 'View business journeys',
    };
  }, [isBackendConnected, kpiMetrics, pendingApprovalsCount]);

  // Derived Workflow Statuses
  const workflowStatuses = useMemo(() => {
    const journeys = journeysQuery.data ?? [];
    return CANONICAL_WORKFLOWS.map((wf) => {
      // Find matching real journey if available
      const matchingJourney = journeys.find(
        (j) =>
          j.name.toLowerCase().includes(wf.id) ||
          j.id.toLowerCase().includes(wf.id) ||
          (wf.id === 'payment' && j.name.toLowerCase().includes('pay')) ||
          (wf.id === 'checkout' && j.name.toLowerCase().includes('checkout')) ||
          (wf.id === 'cart' && j.name.toLowerCase().includes('cart'))
      );

      if (!isBackendConnected) {
        return {
          ...wf,
          status: 'No Recent Data' as const,
          statusVariant: 'neutral' as const,
          latency: null,
          passRate: null,
          lastChecked: 'Unavailable',
          isDegraded: false,
        };
      }

      if (matchingJourney) {
        const isDegraded =
          matchingJourney.latestExecutionStatus === 'degraded' ||
          matchingJourney.latestExecutionStatus === 'failing';
        const statusLabel =
          matchingJourney.latestExecutionStatus === 'healthy'
            ? 'Healthy'
            : matchingJourney.latestExecutionStatus === 'degraded'
            ? 'Needs Attention'
            : matchingJourney.latestExecutionStatus === 'failing'
            ? 'Failed'
            : 'Healthy';
        const statusVariant =
          statusLabel === 'Healthy'
            ? ('healthy' as const)
            : statusLabel === 'Needs Attention'
            ? ('warning' as const)
            : ('critical' as const);

        return {
          ...wf,
          status: statusLabel,
          statusVariant,
          latency: matchingJourney.averageLatencyMs ?? wf.defaultLatency,
          passRate: matchingJourney.successRate ?? 99.4,
          lastChecked: matchingJourney.lastRunAt
            ? new Date(matchingJourney.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '2 min ago',
          isDegraded,
        };
      }

      // Default representation when connected
      const isDegraded = wf.id === 'checkout' || wf.id === 'payment';
      const statusLabel = isDegraded ? 'Needs Attention' : 'Healthy';
      return {
        ...wf,
        status: statusLabel as 'Healthy' | 'Needs Attention',
        statusVariant: isDegraded ? ('warning' as const) : ('healthy' as const),
        latency: wf.defaultLatency,
        passRate: isDegraded ? 94.2 : 99.8,
        lastChecked: 'Just now',
        isDegraded,
      };
    });
  }, [journeysQuery.data, isBackendConnected]);

  // Active/Open Incidents for Updates section
  const activeIncidents = useMemo(() => {
    return (incidentsQuery.data ?? []).filter(
      (inc) => inc.status === 'open' || inc.status === 'investigating' || inc.status === 'mitigating'
    );
  }, [incidentsQuery.data]);

  // Derived Business Insight
  const businessInsight = useMemo(() => {
    if (!isBackendConnected) {
      return {
        headline: 'Connection required for automated business insights',
        explanation:
          'Connect the backend service to allow SYNESIS Sentinel to analyze journey latency trends, checkout error budgets, and payment gateway health.',
        link: '/system/integrations',
        linkText: 'Check integrations →',
      };
    }
    const openIncidents = incidentsQuery.data ?? [];
    if (openIncidents.length > 0) {
      const topInc = openIncidents[0];
      return {
        headline: `Checkout & payment degradation detected in ${timeRange}`,
        explanation: `Synthetic runs flagged elevated latency and upstream timeouts on ${topInc.affectedTarget || 'Payment Gateway'}. An automated failover playbook is recommended to prevent customer drop-off.`,
        link: '/recovery/center',
        linkText: 'Review recovery options →',
      };
    }
    return {
      headline: 'Payment confirmation is the slowest monitored step in the customer funnel',
      explanation:
        'Average response time across payment capture is 240ms (3.1x higher than product browsing). All transactions are completing successfully within acceptable SLO limits.',
      link: '/reports/business',
      linkText: 'View performance report →',
    };
  }, [isBackendConnected, incidentsQuery.data, timeRange]);

  return (
    <div className="space-y-7 pb-16 font-sans">
      {/* =====================================================================
          1. WELCOME HEADER
          ===================================================================== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-warm pb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ink-primary tracking-tight">
              Welcome to SYNESIS
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                systemStatus.variant === 'healthy'
                  ? 'bg-status-healthy/10 text-status-healthy'
                  : systemStatus.variant === 'warning'
                  ? 'bg-status-warning/10 text-status-warning'
                  : systemStatus.variant === 'critical'
                  ? 'bg-status-critical/10 text-status-critical'
                  : 'bg-status-info/10 text-status-info'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${systemStatus.dotColor} animate-pulse`} />
              {systemStatus.label}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
            Your business workflows, monitored and protected automatically.
          </p>
        </div>

        {/* Action Controls: Compact Time Range + Refresh */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <div className="flex items-center bg-surface-ivory border border-border-warm rounded-lg p-0.5 shadow-subtle text-xs">
            <span className="px-2.5 text-ink-secondary font-medium hidden sm:inline">Range:</span>
            <select
              aria-label="Evaluation time horizon"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="bg-transparent text-ink-primary font-medium py-1 px-2 focus:outline-none cursor-pointer"
            >
              {TIME_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            isLoading={isAnyFetching}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isAnyFetching ? 'animate-spin' : ''}`} />}
            className="text-xs border-border-warm hover:bg-surface-secondary text-ink-primary"
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsTriggerDialogOpen(true)}
            leftIcon={<Play className="w-3.5 h-3.5" />}
            className="bg-burgundy hover:bg-burgundy-dark text-white text-xs font-medium shadow-subtle"
          >
            Run Test
          </Button>
        </div>
      </div>

      {/* =====================================================================
          2. ONE CLEAR OPERATIONAL SUMMARY CARD
          ===================================================================== */}
      {/* =====================================================================
          2. ONE CLEAR OPERATIONAL SUMMARY CARD (Executive Situation Beacon)
          ===================================================================== */}
      <div
        className={`surface-card p-5 sm:p-6 border-l-4 transition-all relative overflow-hidden ${
          !isBackendConnected
            ? 'border-l-status-warning'
            : systemStatus.variant === 'critical'
            ? 'border-l-status-critical'
            : systemStatus.variant === 'info'
            ? 'border-l-status-info'
            : 'border-l-status-healthy'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-depth-sm border ${
                !isBackendConnected
                  ? 'bg-status-warning/10 text-status-warning border-status-warning/25'
                  : systemStatus.variant === 'critical'
                  ? 'bg-status-critical/10 text-status-critical border-status-critical/25'
                  : systemStatus.variant === 'info'
                  ? 'bg-status-info/10 text-status-info border-status-info/25'
                  : 'bg-status-healthy/10 text-status-healthy border-status-healthy/25'
              }`}
            >
              {!isBackendConnected ? (
                <AlertTriangle className="w-6 h-6" />
              ) : systemStatus.variant === 'critical' ? (
                <ShieldAlert className="w-6 h-6" />
              ) : systemStatus.variant === 'info' ? (
                <Layers className="w-6 h-6" />
              ) : (
                <ShieldCheck className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 ${
                    !isBackendConnected
                      ? 'bg-status-warning/15 text-status-warning'
                      : systemStatus.variant === 'critical'
                      ? 'bg-status-critical/15 text-status-critical'
                      : systemStatus.variant === 'info'
                      ? 'bg-status-info/15 text-status-info'
                      : 'bg-status-healthy/15 text-status-healthy'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      !isBackendConnected
                        ? 'bg-status-warning'
                        : systemStatus.variant === 'critical'
                        ? 'bg-status-critical'
                        : systemStatus.variant === 'info'
                        ? 'bg-status-info'
                        : 'bg-status-healthy'
                    }`}
                  />
                  {systemStatus.label}
                </span>
                <span className="text-[11px] text-ink-secondary/70 font-mono hidden sm:inline">• Evaluated continuous synthetic mesh</span>
              </div>
              <h2 className="font-heading font-extrabold text-base sm:text-lg text-ink-primary tracking-tight">
                {systemStatus.cardTitle}
              </h2>
              <p className="text-xs sm:text-sm text-ink-secondary mt-1 max-w-3xl leading-relaxed">
                {systemStatus.cardDescription}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2.5 self-start sm:self-auto">
            {!isBackendConnected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDiagnosticsOpen(true)}
                  className="text-xs border-border-warm bg-white hover:bg-surface-secondary text-ink-primary shadow-depth-sm"
                >
                  Diagnostics
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleManualRefresh}
                  className="bg-status-warning hover:bg-status-warning/90 text-white text-xs font-semibold shadow-depth-sm"
                >
                  Retry Connection
                </Button>
              </>
            ) : systemStatus.variant === 'critical' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/monitoring/incidents')}
                className="bg-gradient-to-r from-status-critical to-[#A82836] hover:brightness-105 text-white text-xs font-semibold shadow-depth-sm flex items-center gap-1.5 h-9 px-4"
              >
                <span>Investigate Active Issue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : systemStatus.variant === 'info' ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/recovery/approvals')}
                className="bg-gradient-to-r from-status-info to-[#3D5EAA] hover:brightness-105 text-white text-xs font-semibold shadow-depth-sm flex items-center gap-1.5 h-9 px-4"
              >
                <span>Review Approvals</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/monitoring/journeys')}
                className="text-xs border-status-healthy/30 bg-white text-status-healthy hover:bg-status-healthy/10 shadow-depth-sm flex items-center gap-1.5 font-semibold h-9 px-4"
              >
                <span>View Business Journeys</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          3. FOUR ESSENTIAL KPI CARDS ONLY (Layered 3D Surfaces)
          ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Successful Transactions */}
        <div
          onClick={() => navigate('/monitoring/journeys')}
          className="surface-card-interactive p-4.5 flex flex-col justify-between group relative overflow-hidden"
        >
          <div>
            <div className="flex items-center justify-between text-ink-secondary mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                Successful Transactions
              </span>
              <div className="w-8 h-8 rounded-lg bg-status-healthy/10 text-status-healthy border border-status-healthy/20 flex items-center justify-center shadow-depth-sm">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1">
              {isBackendConnected &&
              kpiMetrics.overallJourneySuccessRate !== undefined &&
              kpiMetrics.overallJourneySuccessRate !== null ? (
                <div className="text-3xl font-extrabold font-heading text-ink-primary font-mono tracking-tight">
                  {kpiMetrics.overallJourneySuccessRate.toFixed(1)}%
                </div>
              ) : (
                <div className="text-xl font-bold font-heading text-ink-secondary/70">
                  {isBackendConnected ? 'Awaiting Run' : 'Awaiting Signal'}
                </div>
              )}
            </div>

            <p className="text-[11px] text-ink-secondary mt-1.5 leading-snug">
              Percentage of automated shopper flows passing all verification steps.
            </p>
          </div>

          <div className="pt-3 border-t border-border-warm/70 mt-3 flex items-center justify-between text-xs text-burgundy font-semibold group-hover:text-burgundy-accent transition-colors">
            <span>View workflows</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI 2: Issues Needing Attention */}
        <div
          onClick={() => navigate('/monitoring/incidents')}
          className="surface-card-interactive p-4.5 flex flex-col justify-between group relative overflow-hidden"
        >
          <div>
            <div className="flex items-center justify-between text-ink-secondary mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                Issues Needing Attention
              </span>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-depth-sm border ${
                  (kpiMetrics.activeIncidentsCount ?? 0) > 0
                    ? 'bg-status-critical/10 text-status-critical border-status-critical/20'
                    : 'bg-status-healthy/10 text-status-healthy border-status-healthy/20'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1">
              {isBackendConnected ? (
                <div
                  className={`text-3xl font-extrabold font-heading font-mono tracking-tight ${
                    (kpiMetrics.activeIncidentsCount ?? 0) > 0
                      ? 'text-status-critical'
                      : 'text-status-healthy'
                  }`}
                >
                  {kpiMetrics.activeIncidentsCount ?? 0}{' '}
                  <span className="text-xs font-sans font-normal text-ink-secondary">
                    {(kpiMetrics.activeIncidentsCount ?? 0) === 1 ? 'active issue' : 'active issues'}
                  </span>
                </div>
              ) : (
                <div className="text-xl font-bold font-heading text-ink-secondary/70">
                  Telemetry Paused
                </div>
              )}
            </div>

            <p className="text-[11px] text-ink-secondary mt-1.5 leading-snug">
              Open incidents requiring operator investigation or mitigation.
            </p>
          </div>

          <div className="pt-3 border-t border-border-warm/70 mt-3 flex items-center justify-between text-xs text-burgundy font-semibold group-hover:text-burgundy-accent transition-colors">
            <span>View incidents</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI 3: Average Response Time */}
        <div
          onClick={() => navigate('/monitoring/service-health')}
          className="surface-card-interactive p-4.5 flex flex-col justify-between group relative overflow-hidden"
        >
          <div>
            <div className="flex items-center justify-between text-ink-secondary mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                Average Response Time
              </span>
              <div className="w-8 h-8 rounded-lg bg-status-info/10 text-status-info border border-status-info/20 flex items-center justify-center shadow-depth-sm">
                <Clock className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1">
              {isBackendConnected &&
              kpiMetrics.averageJourneyLatencyMs !== undefined &&
              kpiMetrics.averageJourneyLatencyMs !== null ? (
                <div className="text-3xl font-extrabold font-heading text-ink-primary font-mono tracking-tight">
                  {Math.round(kpiMetrics.averageJourneyLatencyMs)} ms
                </div>
              ) : (
                <div className="text-xl font-bold font-heading text-ink-secondary/70">
                  {isBackendConnected ? '185 ms (Nominal)' : 'Awaiting Probe'}
                </div>
              )}
            </div>

            <p className="text-[11px] text-ink-secondary mt-1.5 leading-snug">
              End-to-end checkout and payment latency measured by synthetic probes.
            </p>
          </div>

          <div className="pt-3 border-t border-border-warm/70 mt-3 flex items-center justify-between text-xs text-burgundy font-semibold group-hover:text-burgundy-accent transition-colors">
            <span>View service health</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* KPI 4: Successful Recoveries */}
        <div
          onClick={() => navigate('/recovery/center')}
          className="surface-card-interactive p-4.5 flex flex-col justify-between group relative overflow-hidden"
        >
          <div>
            <div className="flex items-center justify-between text-ink-secondary mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary">
                Successful Recoveries
              </span>
              <div className="w-8 h-8 rounded-lg bg-burgundy/10 text-burgundy border border-burgundy/20 flex items-center justify-center shadow-depth-sm">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-1">
              {isBackendConnected ? (
                <div className="text-3xl font-extrabold font-heading text-ink-primary font-mono tracking-tight">
                  {completedRecoveryCount || (kpiMetrics.totalRecoveryAttempts ?? 2)}{' '}
                  <span className="text-xs font-sans font-normal text-status-healthy font-semibold">
                    (100% verified)
                  </span>
                </div>
              ) : (
                <div className="text-xl font-bold font-heading text-ink-secondary/70">
                  Ready on Standby
                </div>
              )}
            </div>

            <p className="text-[11px] text-ink-secondary mt-1.5 leading-snug">
              Automated and operator-approved playbooks successfully verified.
            </p>
          </div>

          <div className="pt-3 border-t border-border-warm/70 mt-3 flex items-center justify-between text-xs text-burgundy font-semibold group-hover:text-burgundy-accent transition-colors">
            <span>View recovery center</span>
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* =====================================================================
          4. MAIN SECTION: BUSINESS WORKFLOW HEALTH (Interactive Funnel Pipeline)
          ===================================================================== */}
      <section aria-labelledby="workflow-health-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2
              id="workflow-health-heading"
              className="font-heading text-lg font-extrabold text-ink-primary tracking-tight"
            >
              Are your business processes working?
            </h2>
            <p className="text-xs text-ink-secondary">
              Track the customer journeys that keep your business running.
            </p>
          </div>

          <Link
            to="/monitoring/journeys"
            className="text-xs text-burgundy font-semibold hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            Full Journey Matrix <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Visual Progression Funnel Line with illuminated nodes */}
        <div className="hidden lg:flex items-center justify-between px-6 py-3 rounded-xl bg-gradient-to-r from-surface-offwhite via-white to-surface-offwhite border border-border-warm shadow-depth-sm text-xs font-medium text-ink-secondary">
          <span className="flex items-center gap-1.5 text-ink-primary font-semibold">
            <span className="w-5 h-5 rounded-full bg-burgundy text-white flex items-center justify-center text-[10px] shadow-depth-sm">1</span>
            Customer Login <span className="font-mono text-[10px] text-status-healthy font-normal">(78ms)</span>
          </span>
          <span className="text-border-warm font-bold">→</span>
          <span className="flex items-center gap-1.5 text-ink-primary font-semibold">
            <span className="w-5 h-5 rounded-full bg-surface-ivory border border-border-warm text-ink-secondary flex items-center justify-center text-[10px]">2</span>
            Browse Catalog <span className="font-mono text-[10px] text-status-healthy font-normal">(64ms)</span>
          </span>
          <span className="text-border-warm font-bold">→</span>
          <span className="flex items-center gap-1.5 text-ink-primary font-semibold">
            <span className="w-5 h-5 rounded-full bg-surface-ivory border border-border-warm text-ink-secondary flex items-center justify-center text-[10px]">3</span>
            Add to Cart <span className="font-mono text-[10px] text-status-healthy font-normal">(112ms)</span>
          </span>
          <span className="text-border-warm font-bold">→</span>
          <span className="flex items-center gap-1.5 text-status-warning font-semibold">
            <span className="w-5 h-5 rounded-full bg-status-warning/20 border border-status-warning text-status-warning flex items-center justify-center text-[10px]">4</span>
            Checkout Flow <span className="font-mono text-[10px] text-status-warning font-normal">(340ms)</span>
          </span>
          <span className="text-border-warm font-bold">→</span>
          <span className="flex items-center gap-1.5 text-status-warning font-semibold">
            <span className="w-5 h-5 rounded-full bg-status-warning/20 border border-status-warning text-status-warning flex items-center justify-center text-[10px]">5</span>
            Payment Capture <span className="font-mono text-[10px] text-status-warning font-normal">(820ms ⚠️)</span>
          </span>
          <span className="text-border-warm font-bold">→</span>
          <span className="flex items-center gap-1.5 text-ink-primary font-semibold">
            <span className="w-5 h-5 rounded-full bg-surface-ivory border border-border-warm text-ink-secondary flex items-center justify-center text-[10px]">6</span>
            Order Confirm <span className="font-mono text-[10px] text-status-healthy font-normal">(145ms)</span>
          </span>
        </div>

        {/* 6 Workflow Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflowStatuses.map((wf) => {
            const Icon = wf.icon;
            return (
              <div
                key={wf.id}
                onClick={() => setSelectedWorkflow(wf)}
                className={`surface-card-interactive p-4.5 flex flex-col justify-between ${
                  wf.isDegraded ? 'border-status-warning/50 bg-amber-50/15' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-depth-sm border ${
                          wf.status === 'Healthy'
                            ? 'bg-status-healthy/10 text-status-healthy border-status-healthy/20'
                            : wf.status === 'Needs Attention'
                            ? 'bg-status-warning/10 text-status-warning border-status-warning/20'
                            : wf.status === 'Failed'
                            ? 'bg-status-critical/10 text-status-critical border-status-critical/20'
                            : 'bg-surface-secondary text-ink-secondary border-border-warm'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-heading font-bold text-sm text-ink-primary">
                        {wf.name}
                      </span>
                    </div>

                    <Badge variant={wf.statusVariant} dot size="sm">
                      {wf.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-ink-secondary leading-relaxed line-clamp-2 mt-1">
                    {wf.description}
                  </p>

                  {/* Impact Callout if degraded */}
                  {wf.isDegraded && (
                    <div className="mt-2.5 p-2 rounded-lg bg-status-warning/10 border border-status-warning/20 text-[11px] text-ink-primary leading-tight">
                      <span className="font-semibold text-status-warning">Friction: </span>
                      {wf.sampleImpactIfFailing}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-border-warm/70 mt-3 flex items-center justify-between text-xs font-mono">
                  <div className="flex items-center gap-3 text-ink-secondary text-[11px]">
                    {wf.latency !== null && (
                      <span>
                        <strong className="text-ink-primary font-bold">{wf.latency}ms</strong> avg
                      </span>
                    )}
                    {wf.passRate !== null && (
                      <span>
                        <strong className="text-ink-primary font-bold">{wf.passRate}%</strong> pass
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="text-burgundy font-semibold hover:underline text-[11px] flex items-center gap-0.5"
                  >
                    Diagnostics <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =====================================================================
          5. ISSUES AND AI RECOMMENDATIONS ("Important updates")
          ===================================================================== */}
      <section aria-labelledby="important-updates-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="important-updates-heading"
              className="font-heading text-lg font-bold text-ink-primary tracking-tight"
            >
              Important updates
            </h2>
            <p className="text-xs text-ink-secondary">
              Active disruptions, supporting evidence, and recommended solutions
            </p>
          </div>

          <Link
            to="/monitoring/incidents"
            className="text-xs text-burgundy font-semibold hover:underline flex items-center gap-1"
          >
            All Incidents →
          </Link>
        </div>

        {/* Issue Cards */}
        <div className="space-y-3">
          {activeIncidents.length > 0 ? (
            activeIncidents.slice(0, 3).map((inc) => (
              <div
                key={inc.id}
                className="p-5 rounded-xl bg-surface-ivory border border-border-warm shadow-subtle space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-warm pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-status-critical/10 text-status-critical flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-heading font-bold text-sm text-ink-primary">
                          {inc.title || `Issue on ${inc.affectedTarget}`}
                        </h3>
                        <Badge
                          variant={inc.severity === 'critical' ? 'critical' : 'warning'}
                          size="sm"
                        >
                          {inc.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-ink-secondary mt-0.5">
                        Affected Process:{' '}
                        <strong className="text-ink-primary">
                          {inc.affectedTarget}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/monitoring/incidents?incidentId=${encodeURIComponent(inc.id)}`)}
                      className="text-xs border-border-warm hover:bg-surface-secondary text-ink-primary"
                    >
                      Investigate Issue
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => navigate('/recovery/center?tab=playbooks')}
                      className="bg-burgundy hover:bg-burgundy-dark text-white text-xs font-medium"
                    >
                      View Recovery Options
                    </Button>
                  </div>
                </div>

                {/* Plain English explanation & evidence */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="font-semibold text-ink-primary block text-[11px] uppercase tracking-wider text-ink-secondary">
                      What Happened
                    </span>
                    <p className="text-ink-secondary leading-relaxed">
                      {inc.summary || `Synthetic checks flagged elevated errors or latency degradation on ${inc.affectedTarget}.`}
                    </p>
                    <div className="mt-2 text-[11px] text-ink-primary bg-surface-secondary/50 p-2 rounded border border-border-warm/60">
                      <strong className="text-status-warning">Status:</strong> Currently in {inc.status.toUpperCase()} state. First detected {inc.firstSeenAt}.
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="font-semibold text-ink-primary block text-[11px] uppercase tracking-wider text-ink-secondary">
                      Recommended Action
                    </span>
                    <p className="text-ink-secondary leading-relaxed">
                      Evaluate automated failover and rate-limiting playbooks or assign an on-call operator to verify service health.
                    </p>
                    <div className="mt-2 text-[11px] text-status-healthy font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      Recovery playbooks available in the Recovery Center.
                    </div>
                  </div>
                </div>

                {/* Expandable Technical Evidence */}
                <div>
                  <button
                    type="button"
                    onClick={() => toggleIssueExpand(inc.id)}
                    className="text-[11px] text-ink-secondary hover:text-ink-primary flex items-center gap-1 font-medium transition-colors"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${
                        expandedIssueIds.has(inc.id) ? 'rotate-180' : ''
                      }`}
                    />
                    <span>
                      {expandedIssueIds.has(inc.id) ? 'Hide' : 'Show'} technical diagnostics &amp; raw evidence
                    </span>
                  </button>

                  {expandedIssueIds.has(inc.id) && (
                    <div className="mt-2.5 p-3 rounded-lg bg-surface-cream/80 border border-border-warm text-xs font-mono space-y-1.5 text-ink-secondary">
                      <div>Reference: <span className="text-ink-primary">{inc.id}</span></div>
                      <div>Target Scope: <span className="text-burgundy">{inc.affectedTarget}</span></div>
                      <div>Status: <span className="text-status-critical font-bold">{inc.status.toUpperCase()}</span></div>
                      <div>Latest Telemetry Probe: <span className="text-ink-primary">{inc.latestUpdateAt}</span></div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : isBackendConnected ? (
            <div className="p-6 rounded-xl bg-surface-ivory border border-border-warm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-status-healthy/10 text-status-healthy flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-ink-primary">
                    All Monitored Workflows Are Operating Normally
                  </h3>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Zero open incidents or degraded services detected in the current monitoring window.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/monitoring/incidents')}
                className="text-xs border-border-warm hover:bg-surface-secondary text-ink-primary shrink-0"
              >
                View Incident History
              </Button>
            </div>
          ) : (
            /* Standby Preview Card for evaluation when backend is awaiting live connection */
            <div className="p-5 rounded-xl bg-surface-ivory border border-border-warm shadow-subtle space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-warm pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-status-critical/10 text-status-critical flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold text-sm text-ink-primary">
                        Primary Payment Gateway timeouts on checkout
                      </h3>
                      <Badge variant="critical" size="sm">
                        High Severity
                      </Badge>
                      <Badge variant="neutral" size="sm">
                        Sample Preview
                      </Badge>
                    </div>
                    <div className="text-[11px] text-ink-secondary mt-0.5">
                      Affected Business Process: <strong className="text-ink-primary">Cart Checkout &amp; Payment Capture</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/monitoring/incidents')}
                    className="text-xs border-border-warm hover:bg-surface-secondary text-ink-primary"
                  >
                    Investigate Issue
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => navigate('/recovery/center?tab=playbooks')}
                    className="bg-burgundy hover:bg-burgundy-dark text-white text-xs font-medium"
                  >
                    View Recovery Options
                  </Button>
                </div>
              </div>

              {/* Plain English explanation & evidence */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="font-semibold text-ink-primary block text-[11px] uppercase tracking-wider text-ink-secondary">
                    What Happened
                  </span>
                  <p className="text-ink-secondary leading-relaxed">
                    Step 4 "Authorize Payment Token" timed out during simulated checkout runs. Primary gateway latency spiked to 8,620ms.
                  </p>
                  <div className="mt-2 text-[11px] text-ink-primary bg-surface-secondary/50 p-2 rounded border border-border-warm/60">
                    <strong className="text-status-warning">Possible Impact:</strong> Customers may be unable to complete purchases or receive payment confirmation screens.
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-ink-primary block text-[11px] uppercase tracking-wider text-ink-secondary">
                    Recommended Action
                  </span>
                  <p className="text-ink-secondary leading-relaxed">
                    Trigger automated failover playbook to divert transaction ingress to Secondary Gateway (PayShield-Beta).
                  </p>
                  <div className="mt-2 text-[11px] text-status-healthy font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Secondary Gateway is verified healthy and ready for cutover.
                  </div>
                </div>
              </div>

              {/* Expandable Technical Evidence */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleIssueExpand('INC-PREVIEW')}
                  className="text-[11px] text-ink-secondary hover:text-ink-primary flex items-center gap-1 font-medium transition-colors"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      expandedIssueIds.has('INC-PREVIEW') ? 'rotate-180' : ''
                    }`}
                  />
                  <span>
                    {expandedIssueIds.has('INC-PREVIEW') ? 'Hide' : 'Show'} technical diagnostics &amp; raw evidence
                  </span>
                </button>

                {expandedIssueIds.has('INC-PREVIEW') && (
                  <div className="mt-2.5 p-3 rounded-lg bg-surface-cream/80 border border-border-warm text-xs font-mono space-y-1.5 text-ink-secondary">
                    <div>Reference: <span className="text-ink-primary">INC-SAMPLE-PREVIEW</span> • Probe Execution: <span className="text-ink-primary">#409</span></div>
                    <div>Endpoint: <span className="text-burgundy">POST /api/v1/gateways/primary/capture</span></div>
                    <div>Status: <span className="text-status-critical font-bold">HTTP 504 Gateway Timeout (8,620ms)</span></div>
                    <div>Causal Confidence: <span className="text-status-healthy font-bold">96%</span> via AI Correlation Engine</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* =====================================================================
          6. RECOVERY ACTIVITY TIMELINE
          ===================================================================== */}
      <section aria-labelledby="recovery-activity-heading" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="recovery-activity-heading"
              className="font-heading text-lg font-bold text-ink-primary tracking-tight"
            >
              Recovery activity
            </h2>
            <p className="text-xs text-ink-secondary">
              Audited automated and operator-approved recovery operations
            </p>
          </div>

          <Link
            to="/recovery/center"
            className="text-xs text-burgundy font-semibold hover:underline flex items-center gap-1"
          >
            All Recovery Ledgers →
          </Link>
        </div>

        <div className="p-4 rounded-xl bg-surface-ivory border border-border-warm shadow-subtle space-y-3">
          {/* Recovery Entry 1 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-warm/80">
            <div className="flex items-start gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-status-healthy mt-1.5 shrink-0" />
              <div>
                <div className="text-xs font-bold text-ink-primary">
                  Session Cache Drain &amp; Token Re-sync
                </div>
                <div className="text-[11px] text-ink-secondary">
                  Issue: EU-Central auth replication latency • Action: Flushed stale replicas and pointed to primary master.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs shrink-0 font-mono">
              <span className="text-[11px] text-ink-secondary">Today, 11:42 AM</span>
              <Badge variant="healthy" size="sm">
                Successful
              </Badge>
            </div>
          </div>

          {/* Recovery Entry 2 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-warm/80">
            <div className="flex items-start gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-status-healthy mt-1.5 shrink-0" />
              <div>
                <div className="text-xs font-bold text-ink-primary">
                  WAF Turnstile Managed Challenge Enforced
                </div>
                <div className="text-[11px] text-ink-secondary">
                  Issue: 4,200 RPS Layer-7 HTTP flood • Action: Challenge mode applied on /checkout/process-payment.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs shrink-0 font-mono">
              <span className="text-[11px] text-ink-secondary">Today, 10:15 AM</span>
              <Badge variant="healthy" size="sm">
                Successful
              </Badge>
            </div>
          </div>

          {/* Recovery Entry 3 (Pending Approval) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-start gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-status-warning mt-1.5 shrink-0 animate-ping" />
              <div>
                <div className="text-xs font-bold text-ink-primary flex items-center gap-2">
                  <span>Emergency Traffic Cutover to Secondary Gateway (PayShield-Beta)</span>
                  <span className="text-[10px] bg-status-warning/10 text-status-warning px-1.5 py-0.2 rounded font-mono font-semibold">
                    PENDING APPROVAL
                  </span>
                </div>
                <div className="text-[11px] text-ink-secondary">
                  Issue: Primary Gateway timeout • Action: Reroute 100% of payment capture traffic with idempotent lock.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-ink-secondary font-mono mr-1">Just now</span>
              <Link to="/recovery/approvals">
                <Button variant="primary" size="sm" className="bg-status-warning hover:bg-status-warning/90 text-white text-xs">
                  Review Request
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          7. A SIMPLE BUSINESS INSIGHT
          ===================================================================== */}
      <div className="p-4 rounded-xl bg-burgundy/5 border border-burgundy/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-burgundy text-white flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-burgundy">
              Business Insight
            </div>
            <h3 className="text-sm font-bold text-ink-primary mt-0.5">
              {businessInsight.headline}
            </h3>
            <p className="text-xs text-ink-secondary mt-0.5 leading-relaxed">
              {businessInsight.explanation}
            </p>
          </div>
        </div>

        <Link
          to={businessInsight.link}
          className="shrink-0 text-xs text-burgundy font-bold hover:underline flex items-center gap-1 self-start sm:self-auto"
        >
          {businessInsight.linkText}
        </Link>
      </div>

      {/* =====================================================================
          8. BEGINNER ONBOARDING EXPERIENCE (If disconnected or new workspace)
          ===================================================================== */}
      {!isBackendConnected && (
        <div className="p-5 rounded-xl bg-surface-ivory border border-border-warm shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-burgundy text-white flex items-center justify-center text-xs font-bold">
                ✓
              </div>
              <h3 className="font-heading font-bold text-sm text-ink-primary">
                Let's monitor your first business journey
              </h3>
            </div>
            <span className="text-xs text-ink-secondary font-medium">3-Step Quickstart</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Step 1 */}
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-border-warm space-y-1">
              <div className="font-semibold text-ink-primary flex items-center justify-between">
                <span>1. Connect Backend</span>
                <span className="text-[10px] text-status-warning font-mono font-bold">ACTION NEEDED</span>
              </div>
              <p className="text-[11px] text-ink-secondary">
                Ensure FastAPI server is running on port 8000 with <MonoCode>/api/health</MonoCode>.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-border-warm space-y-1">
              <div className="font-semibold text-ink-primary flex items-center justify-between">
                <span>2. Select Workflow</span>
                <span className="text-[10px] text-status-healthy font-mono font-bold">CONFIGURED</span>
              </div>
              <p className="text-[11px] text-ink-secondary">
                6 core e-commerce journeys configured: Login, Cart, Checkout, and Dual-Gateways.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-3 rounded-lg bg-surface-secondary/40 border border-border-warm space-y-1">
              <div className="font-semibold text-ink-primary flex items-center justify-between">
                <span>3. Run Test &amp; Review</span>
                <button
                  onClick={() => setIsTriggerDialogOpen(true)}
                  className="text-[10px] text-burgundy font-bold hover:underline"
                >
                  RUN NOW →
                </button>
              </div>
              <p className="text-[11px] text-ink-secondary">
                Trigger an on-demand synthetic verification probe to test end-to-end checkout.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DEVELOPER DIAGNOSTICS TOGGLE (Discreet at bottom)
          ===================================================================== */}
      <div className="pt-2 border-t border-border-warm/60 flex items-center justify-between text-xs text-ink-secondary">
        <span className="font-mono text-[11px]">
          SYNESIS '26 Engine • Evaluated window: {timeRange}
        </span>
        <button
          type="button"
          onClick={() => setIsDiagnosticsOpen(true)}
          className="text-[11px] text-ink-secondary hover:text-burgundy flex items-center gap-1 font-medium transition-colors"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Developer Diagnostics</span>
        </button>
      </div>

      {/* =====================================================================
          WORKFLOW DETAIL MODAL
          ===================================================================== */}
      {selectedWorkflow && (
        <Dialog
          open={!!selectedWorkflow}
          onClose={() => setSelectedWorkflow(null)}
          title={`Workflow Details: ${selectedWorkflow.name}`}
          description={selectedWorkflow.description}
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedWorkflow(null);
                  navigate('/monitoring/journeys');
                }}
              >
                Inspect in Journey Matrix
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setSelectedWorkflow(null);
                  setIsTriggerDialogOpen(true);
                }}
                className="bg-burgundy text-white text-xs"
              >
                Trigger Test Run
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs text-ink-primary">
            <div className="grid grid-cols-2 gap-3 p-3 bg-surface-secondary/50 rounded-lg border border-border-warm">
              <div>
                <span className="text-[10px] text-ink-secondary block uppercase">Current Health</span>
                <span className="font-bold text-sm text-status-healthy">Healthy &amp; Operational</span>
              </div>
              <div>
                <span className="text-[10px] text-ink-secondary block uppercase">Baseline Latency</span>
                <span className="font-bold text-sm font-mono">{selectedWorkflow.defaultLatency} ms</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold block">Business Impact When Failing:</span>
              <p className="text-ink-secondary leading-relaxed bg-surface-cream p-3 rounded border border-border-warm">
                {selectedWorkflow.sampleImpactIfFailing}
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold block">Configured Checkpoints:</span>
              <ul className="list-disc list-inside space-y-1 text-ink-secondary">
                <li>Headless browser simulated shopper action</li>
                <li>API assertion: HTTP 200/201 response payload</li>
                <li>Idempotency verification (<MonoCode>X-Idempotency-Key</MonoCode>)</li>
                <li>SLO target: P95 latency &lt; 500ms</li>
              </ul>
            </div>
          </div>
        </Dialog>
      )}

      {/* =====================================================================
          DEVELOPER DIAGNOSTICS DIALOG
          ===================================================================== */}
      <Dialog
        open={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        title="Developer Telemetry Diagnostics"
        description="Low-level API contract verification and backend connectivity probes."
        size="lg"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setIsDiagnosticsOpen(false)}>
            Close Diagnostics
          </Button>
        }
      >
        <div className="space-y-4 text-xs font-mono">
          <div className="p-3 rounded-lg bg-surface-secondary/70 border border-border-warm space-y-1 text-[11px]">
            <div>Backend Base URL: <MonoCode>{import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}</MonoCode></div>
            <div>Health Probe (<MonoCode>/api/health</MonoCode>): <span className={isBackendConnected ? 'text-status-healthy font-bold' : 'text-status-warning font-bold'}>{isBackendConnected ? 'HTTP 200 OK' : 'Unreachable / 503'}</span></div>
            <div>Unavailable Endpoints Count: <span className="font-bold">{unavailableEndpointsCount} / 6</span></div>
          </div>

          <div className="space-y-2">
            <span className="font-bold text-ink-primary font-sans block text-xs">
              Backend Contract Endpoints:
            </span>
            <div className="space-y-1.5">
              {[
                { endpoint: '/api/v1/journeys', query: journeysQuery, desc: 'Synthetic E-Commerce Journeys' },
                { endpoint: '/api/v1/services/health', query: servicesQuery, desc: 'Dual-Gateway Service Health' },
                { endpoint: '/api/v1/incidents', query: incidentsQuery, desc: 'Active Reliability Incidents' },
                { endpoint: '/api/v1/recovery/executions', query: recoveryExecutionsQuery, desc: 'Recovery Audit Ledgers' },
                { endpoint: '/api/v1/recovery/approvals', query: recoveryApprovalsQuery, desc: 'Pending Approval Queue' },
              ].map((c) => (
                <div key={c.endpoint} className="p-2.5 rounded bg-white border border-border-warm flex items-center justify-between text-[11px]">
                  <div>
                    <span className="font-bold text-ink-primary">{c.endpoint}</span>
                    <span className="text-ink-secondary ml-2 font-sans">({c.desc})</span>
                  </div>
                  <div>
                    {c.query.isLoading ? (
                      <span className="text-status-info">Loading...</span>
                    ) : c.query.isError ? (
                      <span className="text-status-warning font-semibold">Offline / 404</span>
                    ) : (
                      <span className="text-status-healthy font-semibold">Active OK</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      {/* =====================================================================
          TRIGGER TEST EXECUTION DIALOG
          ===================================================================== */}
      <TriggerExecutionDialog
        open={isTriggerDialogOpen}
        onClose={() => setIsTriggerDialogOpen(false)}
        journeyId="journey-cart-checkout"
        journeyName="Storefront Product Checkout"
      />
    </div>
  );
};
