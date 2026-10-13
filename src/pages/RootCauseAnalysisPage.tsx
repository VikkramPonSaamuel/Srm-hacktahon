import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  Cpu,
  ExternalLink,
  GitBranch,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import { useRcaListQuery } from '../api/incidentsAndRca';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  MonoCode,
  UnavailableState,
} from '../components/ui';

export const RootCauseAnalysisPage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialIncidentParam = searchParams.get('incidentId');

  const [searchQuery, setSearchQuery] = useState(initialIncidentParam ?? '');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const rcaQuery = useRcaListQuery(timeRange);
  const reports = rcaQuery.data ?? [];

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((rep) => {
      const matchesSearch =
        !q ||
        rep.id.toLowerCase().includes(q) ||
        rep.incidentId.toLowerCase().includes(q) ||
        (rep.incidentTitle?.toLowerCase().includes(q) ?? false) ||
        rep.identifiedCause.toLowerCase().includes(q) ||
        rep.culpritServiceOrDependency.toLowerCase().includes(q);

      const matchesType =
        typeFilter === 'all' ||
        (typeFilter === 'deterministic' && rep.analysisType === 'deterministic') ||
        (typeFilter === 'ai_assisted' && rep.analysisType === 'ai_assisted');

      return matchesSearch && matchesType;
    });
  }, [reports, searchQuery, typeFilter]);

  const activeReport = useMemo(() => {
    if (selectedReportId) {
      return reports.find((r) => r.id === selectedReportId) ?? null;
    }
    if (initialIncidentParam) {
      return reports.find((r) => r.incidentId === initialIncidentParam) ?? reports[0] ?? null;
    }
    return reports[0] ?? null;
  }, [selectedReportId, initialIncidentParam, reports]);

  return (
    <div className="space-y-5">
      {/* Page Header Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/intelligence/incidents">
                <Button variant="outline" size="sm">
                  Active Incidents
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                isLoading={rcaQuery.isFetching}
                onClick={() => void rcaQuery.refetch()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh RCA Telemetry
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-burgundy text-surface-ivory shrink-0 mt-0.5">
              <GitBranch className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Root Cause Analysis</CardTitle>
                <MonoCode>GET /api/v1/intelligence/rca</MonoCode>
              </div>
              <CardDescription>
                Deterministic causal dependency graphs and AI-assisted hypothesis generation
                correlating synthetic transaction failures to code deployments, network faults,
                and provider outages.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Filter reports by incident ID, culprit service, or failure signature..."
        filters={[
          {
            id: 'rca-type-filter',
            label: 'Analysis Classification',
            value: typeFilter,
            options: [
              { value: 'all', label: 'All Analyses' },
              { value: 'deterministic', label: 'Deterministic (Confirmed)' },
              { value: 'ai_assisted', label: 'AI-Assisted (Hypothesis)' },
            ],
            onChange: setTypeFilter,
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setTypeFilter('all');
          setSearchParams({});
        }}
      />

      {/* States handling */}
      {rcaQuery.isFetching ? (
        <LoadingState
          title="Loading root cause intelligence"
          description="Querying GET /api/v1/intelligence/rca..."
          rows={4}
        />
      ) : rcaQuery.isError && rcaQuery.error?.isUnavailable ? (
        <UnavailableState
          title="Root Cause Analysis API Unavailable"
          description="Endpoint GET /api/v1/intelligence/rca is not responding. Deterministic causal links and AI-assisted hypotheses are withheld until verified by backend telemetry."
          endpoint="/api/v1/intelligence/rca"
          onRetry={() => void rcaQuery.refetch()}
        />
      ) : rcaQuery.isError ? (
        <ErrorState
          title="Failed to load RCA reports"
          message={rcaQuery.error?.message ?? 'Error fetching root cause intelligence'}
          statusCode={rcaQuery.error?.status}
          endpoint="/api/v1/intelligence/rca"
          onRetry={() => void rcaQuery.refetch()}
        />
      ) : filteredReports.length === 0 ? (
        <EmptyState
          title="No root cause analysis reports available"
          description="Zero root cause analyses matched your current filter scope in this evaluation window."
          endpoint="/api/v1/intelligence/rca"
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setTypeFilter('all');
          }}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left Column: RCA Reports Ledger (5 Cols) */}
          <div className="xl:col-span-5 space-y-3">
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              Analyzed Incidents ({filteredReports.length})
            </h3>
            <div className="space-y-2.5">
              {filteredReports.map((report) => {
                const isSelected = activeReport?.id === report.id;
                const isAi = report.analysisType === 'ai_assisted';

                return (
                  <div
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                    className={[
                      'p-3.5 rounded-lg border text-xs cursor-pointer transition-colors space-y-2',
                      isSelected
                        ? 'bg-surface-ivory border-burgundy shadow-subtle'
                        : 'bg-surface-cream/60 border-border-warm hover:border-burgundy-accent',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <MonoCode>{report.incidentId}</MonoCode>
                        <span className="font-semibold text-ink-primary truncate">
                          {report.culpritServiceOrDependency}
                        </span>
                      </div>
                      <Badge variant={isAi ? 'info' : 'healthy'} dot>
                        {isAi ? 'AI Hypothesis' : 'Deterministic'}
                      </Badge>
                    </div>

                    <p className="text-ink-primary font-medium line-clamp-2">
                      {report.identifiedCause}
                    </p>

                    <div className="flex items-center justify-between text-[11px] font-mono text-ink-secondary pt-1 border-t border-border-warm/60">
                      <span>
                        Confidence:{' '}
                        {report.confidenceScore !== null
                          ? `${report.confidenceScore}%`
                          : report.confidenceLevel.toUpperCase()}
                      </span>
                      <span>{report.analyzedAt}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Detailed Causal Breakdown & Evidence (7 Cols) */}
          <div className="xl:col-span-7">
            {activeReport && (
              <Card variant="ivory" className="space-y-4">
                <CardHeader
                  actions={
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/intelligence/incidents?incidentId=${encodeURIComponent(
                          activeReport.incidentId
                        )}`}
                      >
                        <Button
                          variant="outline"
                          size="xs"
                          rightIcon={<ExternalLink className="w-3 h-3" />}
                        >
                          Triage Incident {activeReport.incidentId}
                        </Button>
                      </Link>
                    </div>
                  }
                >
                  <div className="flex items-start gap-2.5">
                    {activeReport.analysisType === 'ai_assisted' ? (
                      <div className="p-1.5 rounded bg-status-info/10 text-status-info mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="p-1.5 rounded bg-status-healthy/10 text-status-healthy mt-0.5">
                        <Cpu className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle>Causal Breakdown &amp; Evidence Ledger</CardTitle>
                        <Badge
                          variant={
                            activeReport.analysisType === 'ai_assisted' ? 'info' : 'healthy'
                          }
                        >
                          {activeReport.analysisType === 'ai_assisted'
                            ? 'AI-Assisted Analysis'
                            : 'Deterministic Root Cause'}
                        </Badge>
                      </div>
                      <CardDescription>
                        Linked to Incident <MonoCode>{activeReport.incidentId}</MonoCode>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* AI Hypothesis Warning Banner when analysis is AI-assisted */}
                  {activeReport.analysisType === 'ai_assisted' && (
                    <div
                      role="note"
                      className="p-3 rounded-md bg-status-info/10 border border-status-info/30 flex items-start gap-2.5 text-xs text-ink-primary"
                    >
                      <Bot className="w-4 h-4 text-status-info shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <span className="font-semibold text-ink-primary block">
                          AI-Assisted Candidate Hypothesis (Not Confirmed Fact)
                        </span>
                        This analysis was synthesized using LLM correlation over telemetry logs.
                        Operators must independently verify the supporting evidence before
                        initiating high-blast-radius countermeasures.
                      </div>
                    </div>
                  )}

                  {/* Core Identified Cause */}
                  <div className="p-3.5 rounded-lg bg-surface-cream border border-border-warm space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase text-ink-secondary">
                        Identified Cause
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink-secondary">Certainty:</span>
                        <Badge
                          variant={
                            activeReport.confidenceLevel === 'confirmed'
                              ? 'healthy'
                              : activeReport.confidenceLevel === 'high'
                                ? 'info'
                                : 'warning'
                          }
                          dot
                        >
                          {activeReport.confidenceLevel.toUpperCase()}
                          {activeReport.confidenceScore !== null &&
                            ` (${activeReport.confidenceScore}%)`}
                        </Badge>
                      </div>
                    </div>

                    <p className="font-heading text-sm font-bold text-ink-primary leading-snug">
                      {activeReport.identifiedCause}
                    </p>

                    <div className="pt-2 border-t border-border-warm/70 grid grid-cols-2 gap-2 text-ink-secondary">
                      <div>
                        Culprit Service:{' '}
                        <span className="font-semibold text-ink-primary">
                          {activeReport.culpritServiceOrDependency}
                        </span>
                      </div>
                      <div className="text-right">
                        Analyzed At: <span className="font-mono">{activeReport.analyzedAt}</span>
                      </div>
                    </div>
                  </div>

                  {/* Supporting Evidence Items */}
                  <div className="space-y-2">
                    <h4 className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                      Supporting Evidence &amp; Telemetry Correlation
                    </h4>
                    {activeReport.supportingEvidence.length === 0 ? (
                      <div className="p-3 rounded bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                        No individual evidence items were recorded in the backend report.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeReport.supportingEvidence.map((ev, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded bg-surface-cream/50 border border-border-warm flex items-start justify-between gap-3 text-xs"
                          >
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-status-healthy shrink-0 mt-0.5" />
                              <span className="text-ink-primary leading-relaxed">
                                {ev.summary}
                              </span>
                            </div>
                            {ev.metricDelta && (
                              <MonoCode className="shrink-0">{ev.metricDelta}</MonoCode>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recommended Remediation & Countermeasure Action */}
                  <div className="p-3.5 rounded-lg bg-surface-cream border border-border-warm space-y-2 text-xs">
                    <span className="font-semibold text-ink-primary block">
                      Recommended Remediation
                    </span>
                    <p className="text-ink-secondary leading-relaxed">
                      {activeReport.recommendedRemediation}
                    </p>

                    <div className="pt-2 flex items-center justify-between gap-2 flex-wrap">
                      <Link to="/recovery/playbooks">
                        <Button
                          variant="primary"
                          size="xs"
                          rightIcon={<Play className="w-3 h-3" />}
                        >
                          Execute Remediation Playbook
                        </Button>
                      </Link>
                      <Link to="/recovery/approvals">
                        <Button variant="outline" size="xs">
                          Approval Queue
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
