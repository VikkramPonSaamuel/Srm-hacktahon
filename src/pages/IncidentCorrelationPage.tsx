import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Flame,
  Globe,
  MessageSquare,
  Network,
  PlayCircle,
  RefreshCw,
  Workflow,
  Zap,
} from 'lucide-react';
import {
  useIncidentCorrelationsQuery,
  CorrelatedSignalItem,
} from '../api/threatAndIntelligence';
import { Button } from '../components/ui/Button';
import { Badge, MonoCode } from '../components/ui/Badge';
import { EmptyState, LoadingState } from '../components/ui';

export const IncidentCorrelationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const correlationsQuery = useIncidentCorrelationsQuery();

  const correlations = correlationsQuery.data ?? [];
  const selectedCorrId = searchParams.get('correlationId') || correlations[0]?.correlationId;
  const activeCorrelation = correlations.find((c) => c.correlationId === selectedCorrId) || correlations[0];

  const [filterRelationship, setFilterRelationship] = useState<string>('all');

  const filteredSignals = (activeCorrelation?.signals ?? []).filter((sig) => {
    if (filterRelationship !== 'all' && sig.relationship.toLowerCase() !== filterRelationship.toLowerCase()) {
      return false;
    }
    return true;
  });

  const getSignalIcon = (type: CorrelatedSignalItem['type']) => {
    switch (type) {
      case 'synthetic_journey':
        return <Workflow className="w-4 h-4 text-burgundy" />;
      case 'infrastructure_latency':
        return <Activity className="w-4 h-4 text-status-warning" />;
      case 'threat_traffic':
        return <Flame className="w-4 h-4 text-status-critical" />;
      case 'complaint_surge':
        return <MessageSquare className="w-4 h-4 text-status-info" />;
      case 'brand_phish':
        return <Globe className="w-4 h-4 text-burgundy" />;
    }
  };

  const getRelationshipBadge = (rel: CorrelatedSignalItem['relationship']) => {
    switch (rel) {
      case 'Confirmed':
        return <Badge variant="critical" size="sm">CONFIRMED CAUSALITY</Badge>;
      case 'Correlated':
        return <Badge variant="warning" size="sm">STATISTICALLY CORRELATED</Badge>;
      case 'Suspected':
        return <Badge variant="info" size="sm">SUSPECTED LINK</Badge>;
      case 'Unrelated':
        return <Badge variant="neutral" size="sm">UNRELATED</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ========================================================= */}
      {/* HEADER */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-ink-primary tracking-tight">
              Unified Incident Correlation &amp; Causal Graph
            </h1>
            <span className="text-xs px-2 py-0.5 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">
              CROSS-SIGNAL SYNTHESIS
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Replaces isolated alerts by unifying synthetic journey failures, gateway latency, customer complaints, and external threats.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => correlationsQuery.refetch()}
            disabled={correlationsQuery.isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${correlationsQuery.isFetching ? 'animate-spin' : ''}`} />
            <span>Re-evaluate Graph</span>
          </Button>
        </div>
      </div>

      {correlationsQuery.isLoading ? (
        <LoadingState title="Synthesizing multi-signal causal correlation graphs..." />
      ) : !activeCorrelation ? (
        <EmptyState
          title="No Active Correlations"
          description="All operational telemetry streams are currently isolated and operating within normal thresholds."
        />
      ) : (
        <div className="space-y-6">
          {/* ========================================================= */}
          {/* TOP SELECTION TABS */}
          {/* ========================================================= */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-border-subtle">
            {correlations.map((corr) => (
              <button
                key={corr.correlationId}
                type="button"
                onClick={() => navigate(`/intelligence/correlation?correlationId=${encodeURIComponent(corr.correlationId)}`)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-2 whitespace-nowrap ${
                  corr.correlationId === activeCorrelation.correlationId
                    ? 'bg-burgundy text-white border-burgundy shadow-sm'
                    : 'bg-white text-ink-primary border-border-subtle hover:bg-surface-offwhite'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                <span>{corr.correlationId}: {corr.title}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                    corr.correlationId === activeCorrelation.correlationId
                      ? 'bg-white/20 text-white'
                      : 'bg-burgundy/10 text-burgundy'
                  }`}
                >
                  {corr.confidenceScore}% RCA
                </span>
              </button>
            ))}
          </div>

          {/* ========================================================= */}
          {/* ROOT CAUSE SYNTHESIS HERO CARD */}
          {/* ========================================================= */}
          <div className="p-6 rounded-2xl bg-white border border-border-subtle shadow-subtle space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-burgundy">
                    {activeCorrelation.correlationId}
                  </span>
                  <span className="text-ink-secondary text-xs">•</span>
                  <span className="text-xs font-mono text-ink-secondary">
                    Primary Incident: {activeCorrelation.primaryIncidentId}
                  </span>
                  <Badge variant="critical" size="sm">
                    {activeCorrelation.severity.toUpperCase()}
                  </Badge>
                </div>
                <h2 className="text-xl font-bold font-heading text-ink-primary">
                  {activeCorrelation.title}
                </h2>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="text-right">
                  <span className="text-ink-secondary block text-[10px]">Causal Confidence</span>
                  <span className="text-lg font-bold font-heading text-burgundy">
                    {activeCorrelation.confidenceScore}%
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-ink-secondary block text-[10px]">Converged Signals</span>
                  <span className="text-lg font-bold font-heading text-ink-primary">
                    {activeCorrelation.signals.length} Vectors
                  </span>
                </div>
              </div>
            </div>

            {/* Synthesized AI Root Cause */}
            <div className="p-4 rounded-xl bg-surface-offwhite border border-border-subtle space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-burgundy">
                <Zap className="w-4 h-4" />
                <span>Autonomous Root Cause Synthesis (RCA)</span>
              </div>
              <p className="text-xs text-ink-primary leading-relaxed font-sans">
                {activeCorrelation.synthesizedRootCause}
              </p>
            </div>

            {/* Recommended Recovery Playbook Callout */}
            <div className="p-4 rounded-xl bg-burgundy/5 border border-burgundy/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs text-ink-secondary font-medium">Recommended Countermeasure:</div>
                <div className="text-sm font-bold text-burgundy flex items-center gap-2">
                  <span>{activeCorrelation.recommendedPlaybookName}</span>
                  <MonoCode>{activeCorrelation.recommendedPlaybookId}</MonoCode>
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/recovery/playbooks?playbookId=${encodeURIComponent(activeCorrelation.recommendedPlaybookId)}`)}
                className="bg-burgundy hover:bg-burgundy-deep text-white text-xs font-medium shrink-0 flex items-center gap-1.5"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Launch Countermeasure Playbook</span>
              </Button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* CONVERGED SIGNALS TIMELINE & EVIDENCE TABLE */}
          {/* ========================================================= */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold font-heading text-ink-primary">
                  Converged Telemetry Signals &amp; Evidence Chain
                </h3>
                <p className="text-xs text-ink-secondary">
                  Chronological progression of anomalies contributing to this operational state
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-secondary font-medium">Filter Link:</span>
                <select
                  value={filterRelationship}
                  onChange={(e) => setFilterRelationship(e.target.value)}
                  className="text-xs bg-white border border-border-subtle rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-burgundy text-ink-primary font-medium"
                >
                  <option value="all">All Signals ({activeCorrelation.signals.length})</option>
                  <option value="confirmed">Confirmed Only</option>
                  <option value="correlated">Correlated Only</option>
                  <option value="suspected">Suspected Only</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {filteredSignals.map((sig) => (
                <div
                  key={sig.id}
                  className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle hover:border-burgundy/30 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-surface-offwhite border border-border-subtle flex items-center justify-center shrink-0 mt-0.5">
                      {getSignalIcon(sig.type)}
                    </div>

                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink-primary">{sig.id}</span>
                        <span className="font-heading font-bold text-sm text-ink-primary">{sig.title}</span>
                        {getRelationshipBadge(sig.relationship)}
                      </div>

                      <div className="text-xs font-mono font-semibold text-burgundy">
                        {sig.metricDelta}
                      </div>

                      <div className="text-xs text-ink-secondary leading-relaxed bg-surface-offwhite/50 p-2.5 rounded-lg border border-border-subtle/70 font-sans">
                        <strong className="text-ink-primary font-medium">Evidence:</strong> {sig.evidence}
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col items-center md:items-end justify-between gap-2 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-border-subtle text-xs">
                    <div className="text-right">
                      <span className="text-[10px] text-ink-secondary block">Signal Confidence</span>
                      <span className="font-mono font-bold text-ink-primary">
                        {sig.confidenceScore}%
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-ink-secondary">
                      {new Date(sig.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
