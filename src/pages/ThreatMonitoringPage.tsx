import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Flame,
  RefreshCw,
  Shield,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  useThreatMonitoringQuery,
  useToggleThreatMitigationMutation,
  ThreatVectorRecord,
} from '../api/threatAndIntelligence';
import { Button } from '../components/ui/Button';
import { MonoCode } from '../components/ui/Badge';
import { EmptyState, LoadingState } from '../components/ui';

export const ThreatMonitoringPage: React.FC = () => {
  const navigate = useNavigate();
  const threatQuery = useThreatMonitoringQuery();
  const toggleMitigationMutation = useToggleThreatMitigationMutation();

  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const data = threatQuery.data;

  const handleToggleRule = async (vector: ThreatVectorRecord) => {
    const nextState = !vector.mitigationRule.enforced;
    try {
      await toggleMitigationMutation.mutateAsync({
        vectorId: vector.id,
        enforce: nextState,
      });
      setActionMessage(
        `WAF Rule ${vector.mitigationRule.id} ${nextState ? 'enforced' : 'deactivated'} successfully.`
      );
      setTimeout(() => setActionMessage(null), 4000);
    } catch {
      setActionMessage('Failed to update mitigation rule.');
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
              Threat Monitoring &amp; Traffic Telemetry
            </h1>
            <span className="text-xs px-2 py-0.5 bg-status-critical/10 text-status-critical font-mono rounded font-semibold">
              L7 WAF DEFENSE
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Real-time detection of Layer-7 HTTP floods, credential stuffing bots, and allowlisted edge WAF mitigations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => threatQuery.refetch()}
            disabled={threatQuery.isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${threatQuery.isFetching ? 'animate-spin' : ''}`} />
            <span>Poll Edge Sensors</span>
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-burgundy/10 border border-burgundy/20 text-burgundy text-xs rounded-lg flex items-center justify-between">
          <span className="font-medium">{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-burgundy/70 hover:text-burgundy">
            ✕
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* METRIC CARDS */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Edge Ingress Volume</div>
          <div className="text-2xl font-bold font-heading text-ink-primary mt-1">
            {data?.currentTotalRps.toLocaleString() ?? 0} RPS
          </div>
          <div className="text-[11px] text-ink-secondary mt-1 flex items-center gap-1 font-mono">
            Peak: 8,400 RPS (Last 15m)
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Bot-to-Human Traffic Ratio</div>
          <div className="text-2xl font-bold font-heading text-status-critical mt-1">
            {data?.botPercentage ?? 0}% Bots
          </div>
          <div className="text-[11px] text-status-critical mt-1 flex items-center gap-1 font-medium">
            <Flame className="w-3.5 h-3.5" />
            Abnormal L7 Anomaly Spike
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Threat Requests Blocked Today</div>
          <div className="text-2xl font-bold font-heading text-status-healthy mt-1">
            {data?.mitigatedToday.toLocaleString() ?? 0}
          </div>
          <div className="text-[11px] text-status-healthy mt-1 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Automatic Edge Null-Routing
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Active Attack Vectors</div>
          <div className="text-2xl font-bold font-heading text-burgundy mt-1">
            {data?.activeAttacksCount ?? 0} Active
          </div>
          <div className="text-[11px] text-burgundy mt-1 flex items-center gap-1 font-medium">
            <ShieldAlert className="w-3 h-3" />
            Targeting /checkout/*
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* REAL-TIME TRAFFIC FLOW CHART */}
      {/* ========================================================= */}
      <div className="p-5 rounded-xl bg-white border border-border-subtle shadow-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold font-heading text-ink-primary">
              Edge Traffic Telemetry (Requests / Second)
            </h2>
            <p className="text-xs text-ink-secondary">
              Real-time classification of legitimate human shoppers vs. automated bot attacks
            </p>
          </div>
          <span className="text-xs font-mono text-ink-secondary">Resolution: 5-minute telemetry</span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.trafficSeries ?? []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="anomalyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#C43C4B" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#C43C4B" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="legitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16845B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#16845B" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DDE2" vertical={false} />
              <XAxis dataKey="timestamp" stroke="#776771" tick={{ fontSize: 11 }} />
              <YAxis stroke="#776771" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderColor: '#E8DDE2',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Area
                type="monotone"
                dataKey="legitRps"
                name="Legitimate Shopper Traffic (RPS)"
                stroke="#16845B"
                strokeWidth={2}
                fill="url(#legitGradient)"
              />
              <Area
                type="monotone"
                dataKey="anomalyRps"
                name="Malicious / Bot Ingress (RPS)"
                stroke="#C43C4B"
                strokeWidth={2}
                fill="url(#anomalyGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ATTACK VECTORS & WAF MITIGATIONS */}
      {/* ========================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold font-heading text-ink-primary">
            Active Threat Vectors &amp; Operator Mitigations
          </h2>
          <span className="text-xs text-ink-secondary">
            Human-in-the-loop allowlisted rule enforcement
          </span>
        </div>

        {threatQuery.isLoading ? (
          <LoadingState title="Querying edge WAF & threat telemetry..." />
        ) : (data?.vectors ?? []).length === 0 ? (
          <EmptyState
            title="All Ingress Clean"
            description="Zero anomalous bot floods or brute-force vectors detected."
          />
        ) : (
          <div className="space-y-4">
            {(data?.vectors ?? []).map((vector) => (
              <div
                key={vector.id}
                className="p-5 rounded-xl bg-white border border-border-subtle shadow-subtle space-y-4"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border-subtle pb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        vector.activeStatus === 'ATTACK_IN_PROGRESS'
                          ? 'bg-status-critical/10 text-status-critical'
                          : 'bg-status-healthy/10 text-status-healthy'
                      }`}
                    >
                      <Flame className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold text-sm text-ink-primary">
                          {vector.vectorType}
                        </span>
                        <MonoCode>{vector.id}</MonoCode>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                            vector.activeStatus === 'ATTACK_IN_PROGRESS'
                              ? 'bg-status-critical/10 text-status-critical'
                              : 'bg-status-healthy/10 text-status-healthy'
                          }`}
                        >
                          {vector.activeStatus.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-ink-secondary mt-0.5 flex items-center gap-2">
                        <span>Target Path:</span>
                        <MonoCode className="text-burgundy font-semibold">
                          {vector.targetedPath}
                        </MonoCode>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div>
                      <span className="text-ink-secondary block text-[10px]">Peak Ingress</span>
                      <span className="font-bold text-status-critical">
                        {vector.peakRps.toLocaleString()} RPS
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-secondary block text-[10px]">Blocked Count</span>
                      <span className="font-bold text-ink-primary">
                        {vector.blockedRequests.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ASN Source Distribution */}
                <div>
                  <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider block mb-2">
                    Attacker Network Origin (ASN &amp; Geo-Distribution)
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {vector.sourceDistribution.map((src, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-surface-offwhite border border-border-subtle text-xs">
                        <div className="flex items-center justify-between font-mono font-bold">
                          <span className="text-ink-primary">{src.asn}</span>
                          <span className="text-status-critical">{src.share}%</span>
                        </div>
                        <div className="text-[11px] text-ink-secondary truncate mt-0.5">
                          {src.organization}
                        </div>
                        <div className="text-[10px] text-ink-secondary font-mono mt-0.5">
                          Country: {src.country}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mitigation Action Bar */}
                <div className="p-3.5 bg-surface-light rounded-xl border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-ink-primary flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-burgundy" />
                      <span>Mitigation Rule: {vector.mitigationRule.ruleType}</span>
                      <MonoCode>{vector.mitigationRule.id}</MonoCode>
                    </div>
                    <div className="text-[11px] text-ink-secondary">
                      Threshold Parameter: <strong className="text-ink-primary">{vector.mitigationRule.threshold}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={vector.mitigationRule.enforced ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => handleToggleRule(vector)}
                      disabled={toggleMitigationMutation.isPending}
                      className={
                        vector.mitigationRule.enforced
                          ? 'border-status-healthy text-status-healthy hover:bg-status-healthy/5 text-xs'
                          : 'bg-burgundy hover:bg-burgundy-deep text-white text-xs'
                      }
                    >
                      {vector.mitigationRule.enforced ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Rule Enforced (Active)
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 mr-1" />
                          Enforce WAF Rule Now
                        </>
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate('/intelligence/correlation')}
                      className="text-xs text-burgundy"
                    >
                      Correlate Anomaly →
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
