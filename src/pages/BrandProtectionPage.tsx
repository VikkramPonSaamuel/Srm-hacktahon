import React, { useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  useBrandProtectionQuery,
  useUpdateTakedownStatusMutation,
  ImpersonationDomainRecord,
  TakedownStatus,
} from '../api/threatAndIntelligence';
import { Button } from '../components/ui/Button';
import { Badge, MonoCode } from '../components/ui/Badge';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState, ErrorState, LoadingState } from '../components/ui';

export const BrandProtectionPage: React.FC = () => {
  const brandQuery = useBrandProtectionQuery();
  const updateStatusMutation = useUpdateTakedownStatusMutation();

  const [selectedRecord, setSelectedRecord] = useState<ImpersonationDomainRecord | null>(null);
  const [isTakedownModalOpen, setIsTakedownModalOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTechnique, setFilterTechnique] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const data = brandQuery.data;

  // Filter logic
  const filteredRecords = (data?.impersonations ?? []).filter((rec) => {
    if (filterStatus !== 'all' && rec.status !== filterStatus) return false;
    if (filterTechnique !== 'all' && !rec.technique.toLowerCase().includes(filterTechnique.toLowerCase())) {
      return false;
    }
    if (
      searchQuery.trim() &&
      !rec.domain.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !rec.targetedBrand.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleOpenTakedown = (rec: ImpersonationDomainRecord) => {
    setSelectedRecord(rec);
    setIsTakedownModalOpen(true);
  };

  const handleStatusTransition = async (nextStatus: TakedownStatus, comment?: string) => {
    if (!selectedRecord) return;
    try {
      const updated = await updateStatusMutation.mutateAsync({
        id: selectedRecord.id,
        nextStatus,
        comment,
      });
      setSelectedRecord(updated);
      setActionNotice(`Status updated to ${nextStatus.replace(/_/g, ' ')} successfully.`);
      setTimeout(() => setActionNotice(null), 4000);
    } catch {
      setActionNotice('Failed to update takedown status.');
    }
  };

  const getStatusBadge = (status: TakedownStatus) => {
    switch (status) {
      case 'DISCOVERED':
        return <Badge variant="neutral" size="sm">DISCOVERED</Badge>;
      case 'UNDER_REVIEW':
        return <Badge variant="warning" size="sm">UNDER REVIEW</Badge>;
      case 'CONFIRMED':
        return <Badge variant="critical" size="sm">CONFIRMED PHISHING</Badge>;
      case 'TAKEDOWN_DRAFTED':
        return <Badge variant="burgundy" size="sm">TAKEDOWN DRAFTED</Badge>;
      case 'APPROVED':
        return <Badge variant="warning" size="sm">APPROVED</Badge>;
      case 'RESOLVED':
        return <Badge variant="healthy" size="sm">RESOLVED</Badge>;
      case 'FALSE_POSITIVE':
        return <Badge variant="neutral" size="sm">FALSE POSITIVE</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* ========================================================= */}
      {/* PAGE HEADER & REFRESH */}
      {/* ========================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-ink-primary tracking-tight">
              Brand Protection &amp; Impersonation Intelligence
            </h1>
            <span className="text-xs px-2 py-0.5 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">
              SENTINEL RADAR
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Autonomous discovery of lookalike domains, credential phishing kits, and automated ICANN registrar takedowns.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => brandQuery.refetch()}
            disabled={brandQuery.isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${brandQuery.isFetching ? 'animate-spin' : ''}`} />
            <span>Scan CT Logs</span>
          </Button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 bg-burgundy/10 border border-burgundy/20 text-burgundy text-xs rounded-lg flex items-center justify-between">
          <span className="font-medium">{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-burgundy/70 hover:text-burgundy">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* METRIC CARDS */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Monitored Brand Assets</div>
          <div className="text-2xl font-bold font-heading text-ink-primary mt-1">
            {data?.monitoredAssetsCount ?? 24}
          </div>
          <div className="text-[11px] text-ink-secondary mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-status-healthy" />
            Active SSL &amp; Trademark Watch
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Active Threat Signatures</div>
          <div className="text-2xl font-bold font-heading text-status-critical mt-1">
            {data?.activeThreatCount ?? 0}
          </div>
          <div className="text-[11px] text-ink-secondary mt-1 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-status-critical" />
            Live Credential Harvesters
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Pending Takedown Notice</div>
          <div className="text-2xl font-bold font-heading text-burgundy mt-1">
            {data?.pendingTakedownCount ?? 0}
          </div>
          <div className="text-[11px] text-ink-secondary mt-1 flex items-center gap-1">
            <Mail className="w-3 h-3 text-burgundy" />
            ICANN Abuse Draft Ready
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-border-subtle shadow-subtle">
          <div className="text-xs text-ink-secondary font-medium">Avg Takedown Resolution</div>
          <div className="text-2xl font-bold font-heading text-status-healthy mt-1">
            {data?.averageTakedownHours ?? 4.2}h
          </div>
          <div className="text-[11px] text-ink-secondary mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-status-healthy" />
            Automated Evidence Packet
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* FILTER & SEARCH TOOLBAR */}
      {/* ========================================================= */}
      <div className="p-4 rounded-xl bg-white border border-border-subtle flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search domain or brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-offwhite border border-border-subtle rounded-lg focus:outline-none focus:border-burgundy text-ink-primary"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-secondary font-medium">Status:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs bg-surface-offwhite border border-border-subtle rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-burgundy text-ink-primary font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="DISCOVERED">Discovered</option>
              <option value="CONFIRMED">Confirmed Phishing</option>
              <option value="TAKEDOWN_DRAFTED">Takedown Drafted</option>
              <option value="APPROVED">Approved</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-secondary font-medium">Technique:</span>
            <select
              value={filterTechnique}
              onChange={(e) => setFilterTechnique(e.target.value)}
              className="text-xs bg-surface-offwhite border border-border-subtle rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-burgundy text-ink-primary font-medium"
            >
              <option value="all">All Techniques</option>
              <option value="homoglyph">Homoglyph / Punycode</option>
              <option value="combo">Combo-squatting</option>
              <option value="tld">TLD Swap</option>
              <option value="typo">Typosquatting</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-ink-secondary font-mono">
          Showing {filteredRecords.length} of {data?.impersonations.length ?? 0} signatures
        </div>
      </div>

      {/* ========================================================= */}
      {/* IMPERSONATIONS TABLE */}
      {/* ========================================================= */}
      {brandQuery.isLoading ? (
        <LoadingState title="Querying Certificate Transparency & DNS Registries..." />
      ) : brandQuery.isError ? (
        <ErrorState
          title="Threat Radar Offline"
          message="Failed to load impersonation records from the backend."
          onRetry={() => void brandQuery.refetch()}
        />
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          title="No Threat Signatures Found"
          description="No lookalike domains match the active filter criteria."
        />
      ) : (
        <div className="bg-white rounded-xl border border-border-subtle overflow-hidden shadow-subtle">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-offwhite border-b border-border-subtle font-semibold text-ink-secondary uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Impersonating Domain</th>
                  <th className="py-3 px-4">Targeted Asset</th>
                  <th className="py-3 px-4">Squat Technique</th>
                  <th className="py-3 px-4">Risk Meter</th>
                  <th className="py-3 px-4">Hosting &amp; Mail</th>
                  <th className="py-3 px-4">Takedown State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-surface-offwhite/60 transition-colors">
                    {/* Domain */}
                    <td className="py-3.5 px-4 font-mono font-medium text-ink-primary">
                      <div className="flex items-center gap-2">
                        <span className="text-burgundy font-semibold">{rec.domain}</span>
                        {rec.activePhishingPage && (
                          <span className="px-1.5 py-0.5 text-[9px] bg-status-critical/10 text-status-critical font-bold rounded">
                            ACTIVE KIT
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-ink-secondary mt-0.5">
                        Registrar: {rec.registrar}
                      </div>
                    </td>

                    {/* Brand */}
                    <td className="py-3.5 px-4 font-medium text-ink-primary">
                      {rec.targetedBrand}
                      <div className="text-[10px] text-ink-secondary font-mono mt-0.5">
                        ID: {rec.id}
                      </div>
                    </td>

                    {/* Technique */}
                    <td className="py-3.5 px-4 text-ink-secondary">
                      <span className="px-2 py-0.5 bg-surface-light border border-border-subtle rounded text-[11px] font-medium text-ink-primary">
                        {rec.technique}
                      </span>
                    </td>

                    {/* Risk Meter */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono font-bold text-xs ${
                            rec.riskScore >= 90
                              ? 'text-status-critical'
                              : rec.riskScore >= 75
                              ? 'text-status-warning'
                              : 'text-status-info'
                          }`}
                        >
                          {rec.riskScore}/100
                        </span>
                        <div className="w-16 h-1.5 bg-surface-light rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              rec.riskScore >= 90
                                ? 'bg-status-critical'
                                : rec.riskScore >= 75
                                ? 'bg-status-warning'
                                : 'bg-status-info'
                            }`}
                            style={{ width: `${rec.riskScore}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Hosting & Mail */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-ink-secondary">
                      <div>IP: {rec.ipAddress}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span>{rec.hostingCountry}</span>
                        {rec.mxConfigured ? (
                          <span className="text-status-critical font-semibold flex items-center gap-0.5 text-[10px]">
                            <Mail className="w-3 h-3" /> MX Active
                          </span>
                        ) : (
                          <span className="text-ink-secondary/70 text-[10px]">No MX</span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {getStatusBadge(rec.status)}
                      <div className="text-[10px] text-ink-secondary font-mono mt-1">
                        {new Date(rec.discoveredAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenTakedown(rec)}
                        className="text-xs text-burgundy border-burgundy/30 hover:bg-burgundy/5"
                      >
                        <FileText className="w-3.5 h-3.5 mr-1" />
                        Takedown Dossier
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAKEDOWN DOSSIER DIALOG */}
      {/* ========================================================= */}
      {selectedRecord && (
        <Dialog
          open={isTakedownModalOpen}
          onClose={() => setIsTakedownModalOpen(false)}
          title={`Takedown Dossier: ${selectedRecord.domain}`}
          description={`Autonomous ICANN UDRP affidavit and abuse dispatch for ${selectedRecord.targetedBrand}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {selectedRecord.status !== 'RESOLVED' && selectedRecord.status !== 'FALSE_POSITIVE' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleStatusTransition('FALSE_POSITIVE', 'Operator determined safe test domain.')}
                      className="text-xs text-ink-secondary"
                    >
                      Mark False Positive
                    </Button>
                    {selectedRecord.status !== 'APPROVED' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleStatusTransition('APPROVED', 'Legal counsel approved takedown demand.')}
                        className="text-xs text-status-warning border-status-warning/40"
                      >
                        Approve Notice
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleStatusTransition('RESOLVED', 'Registrar confirmed DNS null-routing.')}
                      className="text-xs bg-status-healthy hover:bg-status-healthy text-white"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Mark Resolved (DNS Suspended)
                    </Button>
                  </>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={() => setIsTakedownModalOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-6 text-xs text-ink-primary">
            {/* Top Overview Cards */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-surface-offwhite rounded-xl border border-border-subtle">
              <div>
                <span className="text-[10px] text-ink-secondary font-medium uppercase">Registrar</span>
                <div className="font-semibold mt-0.5">{selectedRecord.registrar}</div>
              </div>
              <div>
                <span className="text-[10px] text-ink-secondary font-medium uppercase">Abuse Contact</span>
                <div className="font-semibold text-burgundy font-mono mt-0.5">
                  {selectedRecord.takedownNotice.toEmail}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-ink-secondary font-medium uppercase">Current Status</span>
                <div className="mt-0.5">{getStatusBadge(selectedRecord.status)}</div>
              </div>
            </div>

            {/* Generated Affidavit Body */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-ink-primary flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-burgundy" />
                  ICANN / Registrar Anti-Abuse Notice Template
                </span>
                <MonoCode>{selectedRecord.takedownNotice.legalBasis}</MonoCode>
              </div>
              <div className="p-4 bg-surface-light border border-border-subtle rounded-xl font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-all">
                {selectedRecord.takedownNotice.body}
              </div>
            </div>

            {/* Evidence Links */}
            <div>
              <span className="font-semibold text-ink-primary block mb-1.5">
                Headless Evidence Capture &amp; URLs
              </span>
              <div className="space-y-1">
                {selectedRecord.takedownNotice.evidenceUrls.length > 0 ? (
                  selectedRecord.takedownNotice.evidenceUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className="p-2 bg-white rounded border border-border-subtle font-mono text-[11px] flex items-center justify-between"
                    >
                      <span className="text-status-critical">{url}</span>
                      <span className="text-[10px] text-ink-secondary">CAPTURED VIA HEADLESS RUNNER</span>
                    </div>
                  ))
                ) : (
                  <div className="text-ink-secondary italic">No active URLs remaining (suspended).</div>
                )}
              </div>
            </div>

            {/* Audit Trail Timeline */}
            <div>
              <span className="font-semibold text-ink-primary block mb-2">
                Investigation &amp; Dispatch Timeline
              </span>
              <div className="space-y-2 border-l-2 border-border-subtle pl-4 ml-1">
                {selectedRecord.timeline.map((item, idx) => (
                  <div key={idx} className="relative">
                    <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-burgundy border-2 border-white" />
                    <div className="text-ink-primary font-medium">{item.event}</div>
                    <div className="text-[10px] text-ink-secondary font-mono mt-0.5">
                      {new Date(item.timestamp).toLocaleString()} • {item.author}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
