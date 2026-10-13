import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  type IntegrationCategory,
  type IntegrationConnectionStatus,
  type IntegrationConnectorItem,
  useIntegrationsQuery,
  useTestIntegrationMutation,
} from '../api/system';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  LoadingState,
  MonoCode,
} from '../components/ui';

export function statusToBadge(status: IntegrationConnectionStatus) {
  switch (status) {
    case 'connected':
      return <Badge variant="healthy" dot>Connected &amp; Verified</Badge>;
    case 'degraded':
      return <Badge variant="warning" dot>Degraded / High Latency</Badge>;
    case 'error':
      return <Badge variant="critical" dot>Connection Failed</Badge>;
    case 'unconfigured':
    default:
      return <Badge variant="neutral">Not Configured</Badge>;
  }
}

export function categoryToBadge(cat: IntegrationCategory) {
  switch (cat) {
    case 'commerce-provider':
      return <Badge variant="burgundy">Payment &amp; Commerce</Badge>;
    case 'alerting':
      return <Badge variant="warning">Incident Alerting</Badge>;
    case 'cloud-infra':
      return <Badge variant="info">Cloud &amp; Kubernetes</Badge>;
    case 'telemetry':
    default:
      return <Badge variant="healthy">Telemetry / OTel</Badge>;
  }
}

export const IntegrationsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Selected Connector for detail inspector
  const [selectedConnector, setSelectedConnector] =
    useState<IntegrationConnectorItem | null>(null);

  // Active handshake test state
  const [testResult, setTestResult] = useState<{
    connectorId: string;
    message: string;
    status: 'passed' | 'failed';
    latencyMs: number;
  } | null>(null);

  const integrationsQuery = useIntegrationsQuery();
  const testMutation = useTestIntegrationMutation();

  const connectors = integrationsQuery.data ?? [];

  const filteredConnectors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return connectors.filter((c) => {
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.provider.toLowerCase().includes(q) ||
        c.endpointUrl.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'all' || c.category === categoryFilter;
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchCat && matchStatus;
    });
  }, [connectors, searchQuery, categoryFilter, statusFilter]);

  const handleTestConnection = async (connector: IntegrationConnectorItem) => {
    setTestResult(null);
    try {
      const res = await testMutation.mutateAsync({ connectorId: connector.id });
      setTestResult({
        connectorId: connector.id,
        message: res.message,
        status: res.status,
        latencyMs: res.latencyMs,
      });
    } catch {
      setTestResult({
        connectorId: connector.id,
        message: 'Handshake verification failed or connection timed out.',
        status: 'failed',
        latencyMs: 0,
      });
    }
  };

  const connectedCount = connectors.filter((c) => c.status === 'connected').length;
  const paymentCount = connectors.filter((c) => c.category === 'commerce-provider').length;
  const alertingCount = connectors.filter((c) => c.category === 'alerting').length;

  if (integrationsQuery.isLoading && !integrationsQuery.data) {
    return (
      <div className="space-y-6">
        <LoadingState
          title="Loading External Integration Connectors"
          description="Querying GET /api/v1/system/integrations..."
          rows={4}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-warm pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink-primary font-heading">
              Integrations &amp; Connectors
            </h1>
            <Badge variant="healthy" dot>
              {connectedCount} of {connectors.length} Verified
            </Badge>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Production payment gateways, notification bridges, synthetic runner clusters, and telemetry sinks.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => integrationsQuery.refetch()}
          disabled={integrationsQuery.isFetching}
          leftIcon={
            <RefreshCw
              className={['w-3.5 h-3.5', integrationsQuery.isFetching ? 'animate-spin' : ''].filter(Boolean).join(' ')}
            />
          }
        >
          Refresh Connectors
        </Button>
      </div>

      {/* Security & Credential Protection Notice */}
      <div className="rounded-lg border border-burgundy-accent/30 bg-surface-ivory p-4 shadow-sm flex items-start gap-3">
        <Lock className="w-5 h-5 text-burgundy-primary shrink-0 mt-0.5" />
        <div className="text-xs text-ink-primary space-y-1">
          <div className="font-semibold text-burgundy-primary flex items-center gap-1.5">
            Zero-Trust Credential Masking &amp; Server-Side Secret Management
          </div>
          <p className="text-ink-secondary leading-relaxed">
            All production API keys, bearer tokens, and webhook secrets are stored securely in backend key vaults.
            The frontend never receives or displays raw credentials. Connectors operate in authenticated isolation.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Verified Connectors</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-ink-primary">
              {connectedCount} / {connectors.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-secondary">
            Operational handshake established
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Payment Adapters</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-ink-primary">
              {paymentCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-secondary">
            Primary &amp; standby failover gateways
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Alerting Channels</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-ink-primary">
              {alertingCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-secondary">
            PagerDuty &amp; Slack incident webhooks
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Security Enclosure</CardDescription>
            <CardTitle className="text-2xl font-bold font-mono text-ink-primary">
              100%
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-ink-secondary">
            Masked tokens &amp; TLS 1.3 enforced
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Filter connectors by name, provider, or endpoint URL..."
        filters={[
          {
            id: 'category',
            label: 'Connector Category',
            value: categoryFilter,
            onChange: setCategoryFilter,
            options: [
              { value: 'all', label: 'All Categories' },
              { value: 'commerce-provider', label: 'Payment & Commerce APIs' },
              { value: 'alerting', label: 'Incident Alerting' },
              { value: 'cloud-infra', label: 'Cloud & Runners' },
              { value: 'telemetry', label: 'Telemetry & OTel' },
            ],
          },
          {
            id: 'status',
            label: 'Connection Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'connected', label: 'Connected & Verified' },
              { value: 'degraded', label: 'Degraded / Latency' },
              { value: 'unconfigured', label: 'Unconfigured' },
            ],
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setCategoryFilter('all');
          setStatusFilter('all');
        }}
      />

      {/* Connectors Table */}
      {filteredConnectors.length === 0 ? (
        <EmptyState
          title="No Matching Connectors Found"
          description="Try broadening your search query or switching connector filters."
          actionLabel="Reset Filters"
          onAction={() => {
            setSearchQuery('');
            setCategoryFilter('all');
            setStatusFilter('all');
          }}
        />
      ) : (
        <Card className="overflow-hidden">
          <DataTable
            caption="Configured external integration connectors"
            columns={[
              {
                key: 'name',
                header: 'Connector & Provider',
                render: (row) => {
                  const c = row as unknown as IntegrationConnectorItem;
                  return (
                    <div className="space-y-0.5">
                      <div
                        className="font-medium text-ink-primary hover:text-burgundy-primary cursor-pointer flex items-center gap-1.5"
                        onClick={() => setSelectedConnector(c)}
                      >
                        {c.name}
                      </div>
                      <div className="text-[11px] text-ink-secondary flex items-center gap-1.5">
                        <MonoCode>{c.id}</MonoCode>
                        <span>•</span>
                        <span>{c.provider}</span>
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'category',
                header: 'Integration Type',
                render: (row) => {
                  const c = row as unknown as IntegrationConnectorItem;
                  return categoryToBadge(c.category);
                },
              },
              {
                key: 'status',
                header: 'Operational Status',
                render: (row) => {
                  const c = row as unknown as IntegrationConnectorItem;
                  return statusToBadge(c.status);
                },
              },
              {
                key: 'maskedCredential',
                header: 'Credential Scope',
                render: (row) => {
                  const c = row as unknown as IntegrationConnectorItem;
                  return (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1 text-xs font-mono text-ink-secondary">
                        <KeyRound className="w-3 h-3 text-ink-secondary" />
                        <span>{c.maskedCredential}</span>
                      </div>
                      <div className="text-[11px] text-ink-secondary font-mono truncate max-w-[200px]">
                        {c.endpointUrl}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'lastHealthCheckAt',
                header: 'Last Verified',
                render: (row) => {
                  const c = row as unknown as IntegrationConnectorItem;
                  return (
                    <div className="space-y-0.5 text-xs">
                      <div className="font-mono text-[11px] text-ink-primary">
                        {c.lastHealthCheckAt ? new Date(c.lastHealthCheckAt).toLocaleTimeString() : '—'}
                      </div>
                      {typeof c.latencyMs === 'number' && (
                        <div className="text-[11px] text-status-healthy font-mono">
                          {c.latencyMs}ms RTT
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (row) => {
                  const c = row as unknown as IntegrationConnectorItem;
                  const isTesting = testMutation.isPending && testMutation.variables?.connectorId === c.id;
                  return (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleTestConnection(c)}
                        disabled={isTesting}
                      >
                        {isTesting ? (
                          <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Zap className="w-3 h-3 mr-1 text-burgundy-accent" />
                        )}
                        Test Handshake
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedConnector(c)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Inspect
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            data={filteredConnectors as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
          />
        </Card>
      )}

      {/* Handshake Test Feedback Banner */}
      {testResult && (
        <div
          className={[
            'p-4 rounded-lg border text-xs flex items-start gap-3 shadow-sm',
            testResult.status === 'passed'
              ? 'bg-surface-cream border-status-healthy/40 text-ink-primary'
              : 'bg-red-50 border-status-critical/40 text-status-critical',
          ].join(' ')}
        >
          {testResult.status === 'passed' ? (
            <CheckCircle2 className="w-4 h-4 text-status-healthy shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-status-critical shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-semibold flex items-center gap-2">
              <span>Handshake Test Result for {testResult.connectorId}:</span>
              <Badge variant={testResult.status === 'passed' ? 'healthy' : 'critical'}>
                {testResult.status === 'passed' ? 'PASS' : 'FAIL'}
              </Badge>
              {testResult.latencyMs > 0 && (
                <span className="font-mono text-ink-secondary">({testResult.latencyMs} ms)</span>
              )}
            </div>
            <p className="text-ink-secondary leading-relaxed">{testResult.message}</p>
          </div>
        </div>
      )}

      {/* Connector Detail Modal */}
      {selectedConnector && (
        <Dialog
          open={Boolean(selectedConnector)}
          onClose={() => setSelectedConnector(null)}
          title={`Connector Specification: ${selectedConnector.name}`}
          description={`Non-sensitive operational parameters and capabilities for ${selectedConnector.provider}.`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-ink-secondary flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-ink-secondary" />
                <span>Zero-Trust Credential Masking Enforced</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setSelectedConnector(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleTestConnection(selectedConnector)}
                  disabled={testMutation.isPending}
                >
                  <Zap className="w-3.5 h-3.5 mr-1" />
                  Run Live Handshake Probe
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Badges bar */}
            <div className="flex items-center justify-between p-3 bg-surface-cream rounded-md border border-border-warm flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink-primary">Status:</span>
                {statusToBadge(selectedConnector.status)}
                {categoryToBadge(selectedConnector.category)}
              </div>
              <div className="text-xs font-mono text-ink-secondary">
                RTT: {selectedConnector.latencyMs ?? '—'} ms
              </div>
            </div>

            {/* Non-sensitive Config Parameters */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-ink-primary uppercase tracking-wider text-burgundy-primary">
                Non-Sensitive Configuration Parameters
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Object.entries(selectedConnector.configSummary).map(([key, val]) => (
                  <div
                    key={key}
                    className="p-2.5 bg-surface-ivory rounded border border-border-warm text-xs space-y-0.5"
                  >
                    <div className="text-ink-secondary text-[11px] font-medium">{key}</div>
                    <div className="font-mono text-ink-primary font-medium">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Credential Scope */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-ink-primary uppercase tracking-wider text-burgundy-primary">
                Credential &amp; Network Ingress
              </div>
              <div className="p-3 bg-surface-ivory rounded border border-border-warm text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Ingress Endpoint URL:</span>
                  <span className="font-mono text-ink-primary">{selectedConnector.endpointUrl}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Masked Key Identity:</span>
                  <span className="font-mono text-ink-primary font-bold">{selectedConnector.maskedCredential}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Secret Storage:</span>
                  <span className="text-status-healthy font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Encrypted Vault (AWS KMS / HashiCorp Vault)
                  </span>
                </div>
              </div>
            </div>

            {/* Capabilities */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-ink-primary uppercase tracking-wider text-burgundy-primary">
                Supported Connector Capabilities
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedConnector.capabilities.map((cap) => (
                  <div
                    key={cap}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-secondary border border-border-warm text-xs font-mono text-ink-primary"
                  >
                    <CheckCircle2 className="w-3 h-3 text-status-healthy" />
                    <span>{cap}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Error or Warnings if present */}
            {selectedConnector.recentError && (
              <div className="p-3 bg-red-50 border border-status-critical/40 rounded text-xs text-status-critical space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Recent Connector Fault
                </div>
                <p>{selectedConnector.recentError}</p>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default IntegrationsPage;
