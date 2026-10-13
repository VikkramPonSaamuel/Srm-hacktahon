import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Search,
  TrendingUp,
  Workflow,
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
import { useComplaintIntelligenceQuery } from '../api/threatAndIntelligence';
import { Button } from '../components/ui/Button';
import { EmptyState, LoadingState } from '../components/ui';

export const ComplaintIntelligencePage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const complaintQuery = useComplaintIntelligenceQuery('1h');
  const data = complaintQuery.data;

  // Filter complaints
  const filteredComplaints = (data?.liveComplaints ?? []).filter((item) => {
    if (selectedChannel !== 'all') {
      if (selectedChannel === 'zendesk' && item.source !== 'Zendesk Ticket') return false;
      if (selectedChannel === 'social' && item.source !== 'X / Social Media') return false;
      if (selectedChannel === 'app' && item.source !== 'Mobile App Review') return false;
      if (selectedChannel === 'csat' && item.source !== 'In-App CSAT') return false;
    }
    if (selectedCategory !== 'all') {
      if (!item.category.toLowerCase().includes(selectedCategory.toLowerCase())) return false;
    }
    if (
      searchQuery.trim() &&
      !item.snippet.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !item.customerHandle.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* ========================================================= */}
      {/* HEADER */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-ink-primary tracking-tight">
              Customer Complaint Intelligence
            </h1>
            <span className="text-xs px-2 py-0.5 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">
              VOICE OF CUSTOMER (VOC)
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Real-time sentiment anomaly detection, support ticket surge alerts, and automated checkout failure correlation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => complaintQuery.refetch()}
            disabled={complaintQuery.isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${complaintQuery.isFetching ? 'animate-spin' : ''}`} />
            <span>Poll Feedback Streams</span>
          </Button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SURGE DETECTION ALERT BANNER */}
      {/* ========================================================= */}
      {data && data.surgeStatus === 'CRITICAL_SURGE' && (
        <div className="p-4 rounded-xl bg-status-critical/10 border border-status-critical/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-status-critical text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-ink-primary flex items-center gap-2">
                <span>Critical VoC Surge Detected (+{Math.round((data.surgeMultiplier - 1) * 100)}% vs Baseline)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-status-critical text-white font-mono font-semibold">
                  HIGH SEVERITY
                </span>
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">
                Current ticket frequency is <strong className="text-ink-primary">{data.currentRatePerHour} complaints/hr</strong> (Normal baseline: {data.baselineRatePerHour}/hr).
                Dominated by checkout payment timeouts and duplicate auth notifications.
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span className="text-ink-secondary font-medium">Correlated Journeys:</span>
                {data.affectedJourneys.map((j, idx) => (
                  <span key={idx} className="font-mono text-[11px] text-burgundy font-semibold bg-white/80 px-2 py-0.5 rounded border border-border-subtle">
                    {j}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/intelligence/correlation')}
            className="bg-status-critical hover:bg-status-critical/90 text-white font-medium shrink-0 flex items-center gap-1.5"
          >
            <span>View Causal Graph</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* ========================================================= */}
      {/* METRICS ROW */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Hourly Complaint Rate</div>
          <div className="text-2xl font-bold font-heading text-status-critical mt-1">
            {data?.currentRatePerHour ?? 0}/hr
          </div>
          <div className="text-[11px] text-status-critical mt-1 flex items-center gap-1 font-medium">
            <TrendingUp className="w-3.5 h-3.5" />
            +340% over 24h average
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Average VoC Sentiment</div>
          <div className="text-2xl font-bold font-heading text-status-critical mt-1">
            -0.78
          </div>
          <div className="text-[11px] text-ink-secondary mt-1">
            Scale: -1.0 (Critical) to +1.0
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Primary Friction Point</div>
          <div className="text-lg font-bold font-heading text-burgundy mt-1 truncate">
            Payment Gateways
          </div>
          <div className="text-[11px] text-ink-secondary mt-1">
            62% of incoming volume
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Synthetic Probe Correlation</div>
          <div className="text-2xl font-bold font-heading text-status-healthy mt-1">
            94%
          </div>
          <div className="text-[11px] text-status-healthy mt-1 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Confirmed Root Cause
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SURGE TIMELINE CHART & CATEGORY BREAKDOWN */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Chart: Real-time Volume vs Baseline */}
        <div className="lg:col-span-8 p-5 rounded-xl bg-white border border-border-subtle shadow-subtle space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold font-heading text-ink-primary">
                VoC Feedback Volume vs. Operational Baseline
              </h2>
              <p className="text-xs text-ink-secondary">
                5-minute rolling complaint windows across all monitored channels
              </p>
            </div>
            <span className="text-xs font-mono text-ink-secondary">Window: Last 60 Minutes</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trendSeries ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="complaintFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C43C4B" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#C43C4B" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="baselineFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#776771" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#776771" stopOpacity={0.0} />
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
                  dataKey="baselineVolume"
                  name="Baseline Rate"
                  stroke="#776771"
                  strokeDasharray="4 4"
                  fill="url(#baselineFill)"
                />
                <Area
                  type="monotone"
                  dataKey="complaintVolume"
                  name="Live Complaint Surge"
                  stroke="#C43C4B"
                  strokeWidth={2}
                  fill="url(#complaintFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Card: Category Breakdown */}
        <div className="lg:col-span-4 p-5 rounded-xl bg-white border border-border-subtle shadow-subtle space-y-4">
          <div>
            <h2 className="text-sm font-bold font-heading text-ink-primary">
              Friction Category Distribution
            </h2>
            <p className="text-xs text-ink-secondary">
              Proportion of feedback tagged by NLP classification
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {(data?.categories ?? []).map((cat, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink-primary">{cat.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ink-primary">{cat.sharePercent}%</span>
                    <span
                      className={`text-[10px] font-mono ${
                        cat.deltaVsBaseline > 0 ? 'text-status-critical font-bold' : 'text-status-healthy'
                      }`}
                    >
                      {cat.deltaVsBaseline > 0 ? `+${cat.deltaVsBaseline}%` : `${cat.deltaVsBaseline}%`}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      cat.severity === 'critical'
                        ? 'bg-status-critical'
                        : cat.severity === 'warning'
                        ? 'bg-status-warning'
                        : 'bg-status-info'
                    }`}
                    style={{ width: `${cat.sharePercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-surface-offwhite rounded-lg border border-border-subtle text-[11px] text-ink-secondary leading-relaxed">
            <strong className="text-ink-primary">AI Correlation Insight:</strong> Customers citing "card charged twice" coincide with timeout retries issued by browser clients during primary gateway stall.
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* LIVE CUSTOMER FEED TABLE */}
      {/* ========================================================= */}
      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-white border border-border-subtle flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ticket feedback or user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-offwhite border border-border-subtle rounded-lg focus:outline-none focus:border-burgundy text-ink-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-secondary font-medium">Channel:</span>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="text-xs bg-surface-offwhite border border-border-subtle rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-burgundy text-ink-primary font-medium"
              >
                <option value="all">All Feedback Channels</option>
                <option value="zendesk">Zendesk Tickets</option>
                <option value="social">X / Social Mentions</option>
                <option value="app">Mobile App Reviews</option>
                <option value="csat">In-App CSAT</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-secondary font-medium">Category:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs bg-surface-offwhite border border-border-subtle rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-burgundy text-ink-primary font-medium"
              >
                <option value="all">All Categories</option>
                <option value="checkout">Checkout &amp; Gateway</option>
                <option value="debit">Double Debits</option>
                <option value="otp">OTP Delays</option>
                <option value="cart">Cart Eviction</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-ink-secondary font-mono">
            Showing {filteredComplaints.length} incoming customer friction records
          </div>
        </div>

        {complaintQuery.isLoading ? (
          <LoadingState title="Aggregating live customer sentiment & ticket streams..." />
        ) : filteredComplaints.length === 0 ? (
          <EmptyState
            title="No Matching Feedback"
            description="No customer complaints match the active filter parameters."
          />
        ) : (
          <div className="space-y-3">
            {filteredComplaints.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle hover:border-burgundy/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="font-mono font-semibold text-burgundy">{item.id}</span>
                    <span className="px-2 py-0.5 rounded bg-surface-light border border-border-subtle font-medium text-ink-primary text-[11px]">
                      {item.source}
                    </span>
                    <span className="font-mono text-ink-secondary text-[11px]">
                      {item.customerHandle}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-status-critical/10 text-status-critical font-bold text-[10px]">
                      {item.category.toUpperCase()}
                    </span>
                    <span className="text-ink-secondary text-[11px] font-mono">
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-ink-primary leading-relaxed bg-surface-offwhite/50 p-2.5 rounded-lg border border-border-subtle/60 italic">
                    "{item.snippet}"
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-ink-secondary">
                    <span className="flex items-center gap-1 font-medium text-ink-primary">
                      <Workflow className="w-3.5 h-3.5 text-burgundy" />
                      Correlated Flow: {item.correlatedJourney}
                    </span>
                    {item.correlatedIncidentId && (
                      <span className="font-mono text-status-critical font-semibold">
                        Linked: {item.correlatedIncidentId}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-between gap-2 shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-border-subtle">
                  <div className="text-right">
                    <span className="text-[10px] text-ink-secondary block">Friction Score</span>
                    <span className="text-sm font-bold font-mono text-status-critical">
                      {item.impactScore}/100
                    </span>
                  </div>
                  {item.correlatedIncidentId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/intelligence/incidents?incidentId=${encodeURIComponent(item.correlatedIncidentId!)}`)}
                      className="text-xs text-burgundy hover:bg-burgundy/5"
                    >
                      <span>Investigate Incident</span>
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
