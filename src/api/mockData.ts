/**
 * SYNESIS ’26 — Enterprise Synthetic Mock Telemetry & Data Mesh
 * Populates all tabs with realistic, interconnected, high-fidelity operational data
 * when the FastAPI backend is running offline or in demonstration mode.
 */

export interface MockStore {
  takedownStatuses: Record<string, string>;
  incidentStatuses: Record<string, { status: string; notes?: string }>;
  approvalDecisions: Record<string, { status: string; approvedBy?: string }>;
}

const mockStore: MockStore = {
  takedownStatuses: {},
  incidentStatuses: {},
  approvalDecisions: {},
};

export function getMockResponse<T>(endpoint: string, method = 'GET', body?: unknown): T | undefined {
  const cleanUrl = endpoint.split('?')[0].replace(/\/+$/, '');
  let parsedBody: Record<string, unknown> = {};
  if (body) {
    try {
      parsedBody = typeof body === 'string' ? JSON.parse(body) : (body as Record<string, unknown>);
    } catch {
      // ignore parse error
    }
  }

  // Handle POST/PATCH Mutations
  if (method === 'POST') {
    // 1. Incidents status & acknowledge
    if (cleanUrl.match(/\/api\/v1\/incidents\/[^/]+\/status$/)) {
      const parts = cleanUrl.split('/');
      const incidentId = decodeURIComponent(parts[parts.length - 2]);
      const newStatus = String(parsedBody.new_status || 'investigating');
      mockStore.incidentStatuses[incidentId] = { status: newStatus, notes: String(parsedBody.notes || '') };
      return {
        id: incidentId,
        incident_number: incidentId,
        title: 'Payment Gateway SLA Breach & High Latency Alert',
        severity: 'sev1',
        status: newStatus,
        service_id: 'svc-gw-primary',
        service_name: 'Primary Payment Gateway',
        journey_id: 'j-payment',
        journey_name: 'Dual-Gateway Payment Token Capture',
        created_at: '2026-10-13T14:48:00Z',
        detected_at: '2026-10-13T14:48:00Z',
        updated_at: new Date().toISOString(),
      } as T;
    }

    if (cleanUrl.match(/\/api\/v1\/incidents\/[^/]+\/acknowledge$/)) {
      const parts = cleanUrl.split('/');
      const incidentId = decodeURIComponent(parts[parts.length - 2]);
      mockStore.incidentStatuses[incidentId] = { status: 'investigating', notes: `Acknowledged by ${parsedBody.acknowledged_by || 'Helena Vance'}` };
      return {
        id: incidentId,
        incident_number: incidentId,
        title: 'Payment Gateway SLA Breach & High Latency Alert',
        severity: 'sev1',
        status: 'investigating',
        acknowledged_by: String(parsedBody.acknowledged_by || 'Helena Vance'),
        acknowledged_at: new Date().toISOString(),
        service_id: 'svc-gw-primary',
        service_name: 'Primary Payment Gateway',
        journey_id: 'j-payment',
        journey_name: 'Dual-Gateway Payment Token Capture',
        created_at: '2026-10-13T14:48:00Z',
        detected_at: '2026-10-13T14:48:00Z',
        updated_at: new Date().toISOString(),
      } as T;
    }

    // 2. Journey Trigger / Execute
    if (cleanUrl.match(/\/api\/v1\/journeys\/[^/]+\/execute$/)) {
      const parts = cleanUrl.split('/');
      const journeyId = decodeURIComponent(parts[parts.length - 2]);
      return {
        id: `exec-${Date.now().toString().slice(-4)}`,
        journey_id: journeyId,
        journey_name: 'Customer Authentication & SSO',
        overall_status: 'passed',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 120,
        payment_safe: true,
        steps: [
          { step_id: 's-1', order: 1, name: 'Render Sign-In Modal', status: 'passed', duration_ms: 24, http_status_code: 200 },
          { step_id: 's-2', order: 2, name: 'Post Credentials & Verify Salt', status: 'passed', duration_ms: 42, http_status_code: 200 },
          { step_id: 's-3', order: 3, name: 'Issue Secure Session Cookie', status: 'passed', duration_ms: 22, http_status_code: 200 },
        ],
      } as T;
    }

    // 3. Playbook Execute
    if (cleanUrl.match(/\/api\/v1\/recovery\/playbooks\/[^/]+\/execute$/)) {
      const parts = cleanUrl.split('/');
      const playbookId = decodeURIComponent(parts[parts.length - 2]);
      return {
        id: `rec-${Date.now().toString().slice(-4)}`,
        playbook_id: playbookId,
        playbook_name: 'Automated Payment Rail Gateway Failover',
        status: 'in_progress',
        initiated_at: new Date().toISOString(),
        initiated_by: 'Helena Vance (On-Call SRE)',
        verification_status: 'pending',
        execution_steps: [
          { step_id: 'step-1', order: 1, name: 'Verify Secondary Standby Health', status: 'passed' },
          { step_id: 'step-2', order: 2, name: 'Switch Ingress Route in Envoy Mesh', status: 'passed' },
          { step_id: 'step-3', order: 3, name: 'Execute Synthetic Authorization Probe', status: 'in_progress' },
        ],
      } as T;
    }

    // 4. Approval sign-off / reject
    if (cleanUrl.match(/\/api\/v1\/recovery\/approvals\/[^/]+\/(approve|reject)$/)) {
      const parts = cleanUrl.split('/');
      const action = parts[parts.length - 1];
      const approvalId = decodeURIComponent(parts[parts.length - 2]);
      const nextStatus = action === 'approve' ? 'approved' : 'rejected';
      mockStore.approvalDecisions[approvalId] = { status: nextStatus, approvedBy: 'Helena Vance' };
      return {
        id: approvalId,
        playbook_id: 'pb-failover-payment',
        playbook_name: 'Automated Payment Rail Gateway Failover',
        action_summary: 'Dual-Key Authorization for Production Payment Traffic Redirection',
        risk_level: 'high',
        status: nextStatus,
        required_role: 'Engineering Lead / Incident Commander',
        requested_by: 'System Autonomous Sentinel',
        requested_at: '2026-10-13T14:14:00Z',
        decided_at: new Date().toISOString(),
        decided_by: 'Helena Vance (Lead Reliability Architect)',
        notes: 'Executed via SYNESIS Autonomous Console.',
      } as T;
    }

    // 5. Integration test
    if (cleanUrl.match(/\/api\/v1\/system\/integrations\/[^/]+\/test$/)) {
      const parts = cleanUrl.split('/');
      const connectorId = decodeURIComponent(parts[parts.length - 2]);
      return {
        id: connectorId,
        name: 'Connected Service Adapter',
        type: 'Adapter',
        status: 'connected',
        health_state: 'healthy',
        latency_ms: 45,
        last_health_check: 'Just now',
        config_summary: 'Connection validated successfully. Round-trip probe ping returned 200 OK.',
        capabilities: ['Real-time Telemetry', 'High Availability'],
      } as T;
    }

    // 6. Brand protection status
    if (cleanUrl.match(/\/api\/v1\/intelligence\/brand-protection\/[^/]+\/status$/)) {
      const parts = cleanUrl.split('/');
      const bpId = decodeURIComponent(parts[parts.length - 2]);
      const newStatus = String(parsedBody.status || 'TAKEDOWN_SUBMITTED');
      mockStore.takedownStatuses[bpId] = newStatus;
      return {
        id: bpId,
        domain: 'allura-luxee.com',
        similarityScore: 94.2,
        detectedAt: '2026-10-13T08:30:00Z',
        status: newStatus,
        riskLevel: 'CRITICAL',
        registrar: 'NameCheap, Inc.',
        nameservers: ['ns1.badactor-host.net', 'ns2.badactor-host.net'],
        ipAddress: '198.51.100.42',
        geoCountry: 'RU',
        mxRecordsFound: true,
        lookalikeType: 'TYPOSQUATTING',
        evidenceCount: 4,
        takedownEligible: true,
      } as T;
    }

    // 7. Threat mitigation
    if (cleanUrl.match(/\/api\/v1\/intelligence\/threat-monitoring\/[^/]+\/mitigate$/)) {
      const parts = cleanUrl.split('/');
      const vectorId = decodeURIComponent(parts[parts.length - 2]);
      return {
        id: vectorId,
        threat_type: 'bot_credential_stuffing',
        name: 'Distributed Credential Stuffing on /v1/auth/login',
        status: 'mitigated',
        severity: 'high',
        mitigation_status: 'active',
        rule_name: 'WAF Managed Challenge Rule #14',
      } as T;
    }
  }

  // 1. Backend Health
  if (cleanUrl === '/api/health') {
    return {
      status: 'healthy',
      service: 'synesis-autonomous-mesh',
      timestamp: new Date().toISOString(),
      mode: 'live-telemetry',
    } as T;
  }

  // 2. Journeys List & Detail
  if (cleanUrl === '/api/v1/journeys') {
    return [
      {
        id: 'j-login',
        name: 'Customer Authentication & SSO',
        description: 'Synthetic OAuth2 and passkey authentication validating customer session token emission.',
        enabled: true,
        overall_health: 'healthy',
        latest_execution_status: 'passed',
        success_rate: 99.8,
        avg_latency_ms: 78,
        p95_latency_ms: 125,
        last_run_at: '2026-10-13T14:48:12Z',
        schedule_cadence: 'Every 30s',
        environment: 'production',
        step_count: 3,
        steps: [
          { id: 's-1', order: 1, name: 'Render Sign-In Modal', status: 'healthy', average_latency_ms: 22, success_rate: 99.9 },
          { id: 's-2', order: 2, name: 'Post Credentials & Verify Salt', status: 'healthy', average_latency_ms: 38, success_rate: 99.8 },
          { id: 's-3', order: 3, name: 'Issue Secure Session Cookie', status: 'healthy', average_latency_ms: 18, success_rate: 99.8 },
        ],
      },
      {
        id: 'j-catalog',
        name: 'Product Catalog & Search',
        description: 'Search indexing, facets filter, and product detail cache response times.',
        enabled: true,
        overall_health: 'healthy',
        latest_execution_status: 'passed',
        success_rate: 99.9,
        avg_latency_ms: 64,
        p95_latency_ms: 98,
        last_run_at: '2026-10-13T14:48:25Z',
        schedule_cadence: 'Every 30s',
        environment: 'production',
        step_count: 4,
        steps: [
          { id: 's-4', order: 1, name: 'Query Elastic/Algolia Index', status: 'healthy', average_latency_ms: 19, success_rate: 100 },
          { id: 's-5', order: 2, name: 'Fetch Faceted Filter Options', status: 'healthy', average_latency_ms: 14, success_rate: 99.9 },
          { id: 's-6', order: 3, name: 'Resolve Product Detail SKU', status: 'healthy', average_latency_ms: 21, success_rate: 99.9 },
          { id: 's-7', order: 4, name: 'Verify CDN Image Cache', status: 'healthy', average_latency_ms: 10, success_rate: 99.9 },
        ],
      },
      {
        id: 'j-cart',
        name: 'Cart Add & Session Synchronization',
        description: 'Redis session store mutation and shopping basket cart state durability.',
        enabled: true,
        overall_health: 'healthy',
        latest_execution_status: 'passed',
        success_rate: 98.9,
        avg_latency_ms: 112,
        p95_latency_ms: 178,
        last_run_at: '2026-10-13T14:48:40Z',
        schedule_cadence: 'Every 30s',
        environment: 'production',
        step_count: 3,
        steps: [
          { id: 's-8', order: 1, name: 'Verify SKU Inventory Quota', status: 'healthy', average_latency_ms: 34, success_rate: 99.2 },
          { id: 's-9', order: 2, name: 'Append Item to Redis Cart Key', status: 'healthy', average_latency_ms: 28, success_rate: 99.0 },
          { id: 's-10', order: 3, name: 'Recalculate Basket Subtotal', status: 'healthy', average_latency_ms: 50, success_rate: 98.6 },
        ],
      },
      {
        id: 'j-checkout',
        name: 'Cart Checkout & Address Validation',
        description: 'Shipping calculations, tax estimation, and postal address verification.',
        enabled: true,
        overall_health: 'degraded',
        latest_execution_status: 'degraded',
        success_rate: 97.4,
        avg_latency_ms: 340,
        p95_latency_ms: 620,
        last_run_at: '2026-10-13T14:49:05Z',
        schedule_cadence: 'Every 30s',
        environment: 'production',
        step_count: 4,
        steps: [
          { id: 's-11', order: 1, name: 'Lock Cart Session', status: 'healthy', average_latency_ms: 45, success_rate: 99.5 },
          { id: 's-12', order: 2, name: 'Validate Shipping Address (USPS/FedEx API)', status: 'degraded', average_latency_ms: 185, success_rate: 96.8 },
          { id: 's-13', order: 3, name: 'Calculate State Tax via Avalara', status: 'healthy', average_latency_ms: 65, success_rate: 98.5 },
          { id: 's-14', order: 4, name: 'Emit Pre-Authorization Token', status: 'healthy', average_latency_ms: 45, success_rate: 97.2 },
        ],
      },
      {
        id: 'j-payment',
        name: 'Dual-Gateway Payment Token Capture',
        description: 'Synthetic sandbox charge tokenization, primary gateway charge, and 3D Secure 2.0 handshake.',
        enabled: true,
        overall_health: 'degraded',
        latest_execution_status: 'degraded',
        success_rate: 94.2,
        avg_latency_ms: 820,
        p95_latency_ms: 1840,
        last_run_at: '2026-10-13T14:49:30Z',
        schedule_cadence: 'Every 15s',
        environment: 'production',
        step_count: 5,
        steps: [
          { id: 's-15', order: 1, name: 'Generate Ephemeral Payment Intent', status: 'healthy', average_latency_ms: 55, success_rate: 99.4 },
          { id: 's-16', order: 2, name: 'Tokenize Synthetic Card (Test 4242)', status: 'healthy', average_latency_ms: 68, success_rate: 99.1 },
          { id: 's-17', order: 3, name: 'Submit Capture to Primary Gateway', status: 'degraded', average_latency_ms: 580, success_rate: 93.8 },
          { id: 's-18', order: 4, name: 'Verify Idempotency Key Durability', status: 'healthy', average_latency_ms: 32, success_rate: 99.8 },
          { id: 's-19', order: 5, name: 'Execute Automatic Safe Void', status: 'healthy', average_latency_ms: 85, success_rate: 99.9 },
        ],
      },
      {
        id: 'j-order',
        name: 'Order Confirmation & Invoice Emission',
        description: 'Post-transaction ledger persistence, ERP order emit, and customer notification event stream.',
        enabled: true,
        overall_health: 'healthy',
        latest_execution_status: 'passed',
        success_rate: 99.6,
        avg_latency_ms: 145,
        p95_latency_ms: 210,
        last_run_at: '2026-10-13T14:49:55Z',
        schedule_cadence: 'Every 30s',
        environment: 'production',
        step_count: 3,
        steps: [
          { id: 's-20', order: 1, name: 'Persist Order in PostgreSQL Cluster', status: 'healthy', average_latency_ms: 42, success_rate: 99.8 },
          { id: 's-21', order: 2, name: 'Publish Event to Kafka/EventBridge', status: 'healthy', average_latency_ms: 38, success_rate: 99.7 },
          { id: 's-22', order: 3, name: 'Generate PDF Invoice Hash', status: 'healthy', average_latency_ms: 65, success_rate: 99.5 },
        ],
      },
    ] as T;
  }

  // 3. Executions List
  if (cleanUrl === '/api/v1/executions') {
    return [
      {
        id: 'exec-9402',
        journey_id: 'j-payment',
        journey_name: 'Dual-Gateway Payment Token Capture',
        overall_status: 'degraded',
        started_at: '2026-10-13T14:49:30Z',
        completed_at: '2026-10-13T14:49:38Z',
        duration_ms: 8420,
        failed_step_name: 'Submit Capture to Primary Gateway',
        failed_step_order: 3,
        error_message: 'HTTP 504 Gateway Timeout: Primary payment gateway exceeded SLA timeout (8,620ms > 2,000ms threshold).',
        error_code: 'GATEWAY_TIMEOUT_504',
        payment_safe: true,
        payment_mode: 'synthetic_sandbox',
        sandbox_gateway: 'Stripe Alpha (US-East)',
        authorization_voided: true,
        real_charge_prevented: true,
        steps: [
          { step_id: 's-15', order: 1, name: 'Generate Ephemeral Payment Intent', status: 'passed', duration_ms: 54, http_status_code: 200 },
          { step_id: 's-16', order: 2, name: 'Tokenize Synthetic Card', status: 'passed', duration_ms: 65, http_status_code: 200 },
          { step_id: 's-17', order: 3, name: 'Submit Capture to Primary Gateway', status: 'failed', duration_ms: 8210, http_status_code: 504, error_message: 'HTTP 504 Gateway Timeout' },
          { step_id: 's-18', order: 4, name: 'Execute Automatic Safe Void', status: 'passed', duration_ms: 91, http_status_code: 200 },
        ],
      },
      {
        id: 'exec-9401',
        journey_id: 'j-checkout',
        journey_name: 'Cart Checkout & Address Validation',
        overall_status: 'passed',
        started_at: '2026-10-13T14:49:05Z',
        completed_at: '2026-10-13T14:49:06Z',
        duration_ms: 342,
        payment_safe: true,
        steps: [
          { step_id: 's-11', order: 1, name: 'Lock Cart Session', status: 'passed', duration_ms: 45, http_status_code: 200 },
          { step_id: 's-12', order: 2, name: 'Validate Shipping Address', status: 'passed', duration_ms: 185, http_status_code: 200 },
          { step_id: 's-13', order: 3, name: 'Calculate State Tax via Avalara', status: 'passed', duration_ms: 65, http_status_code: 200 },
          { step_id: 's-14', order: 4, name: 'Emit Pre-Authorization Token', status: 'passed', duration_ms: 47, http_status_code: 200 },
        ],
      },
      {
        id: 'exec-9400',
        journey_id: 'j-cart',
        journey_name: 'Cart Add & Session Synchronization',
        overall_status: 'passed',
        started_at: '2026-10-13T14:48:40Z',
        completed_at: '2026-10-13T14:48:41Z',
        duration_ms: 112,
        payment_safe: true,
        steps: [],
      },
    ] as T;
  }

  // 4. Service Health Overview
  if (cleanUrl === '/api/v1/services/health' || cleanUrl === '/api/v1/services') {
    return {
      evaluated_at: new Date().toISOString(),
      primary_gateway: {
        id: 'svc-gw-primary',
        name: 'Primary Payment Gateway (Stripe-Alpha)',
        service_role: 'primary_payment_gateway',
        category: 'Payment Rail',
        state: 'degraded',
        latency_ms: 840,
        p95_latency_ms: 1840,
        availability_percent: 94.2,
        error_rate_percent: 5.8,
        recent_errors_count: 14,
        latest_error_summary: 'Upstream gateway timeout on POST /v1/charges (HTTP 504)',
        traffic_share_percent: 92.5,
        verification_status: 'verified',
        last_checked_at: '2026-10-13T14:49:30Z',
        last_successful_transaction_at: '2026-10-13T14:47:12Z',
        last_transaction_outcome: 'unknown_timeout',
        failover_activity_summary: 'Standby Gateway (PayShield-Beta) primed for auto-failover.',
      },
      secondary_gateway: {
        id: 'svc-gw-secondary',
        name: 'Secondary Standby Gateway (PayShield-Beta)',
        service_role: 'secondary_payment_gateway',
        category: 'Payment Rail',
        state: 'healthy',
        latency_ms: 92,
        p95_latency_ms: 145,
        availability_percent: 99.98,
        error_rate_percent: 0.02,
        recent_errors_count: 0,
        latest_error_summary: null,
        traffic_share_percent: 7.5,
        verification_status: 'verified',
        last_checked_at: '2026-10-13T14:49:30Z',
        last_successful_transaction_at: '2026-10-13T14:49:28Z',
        last_transaction_outcome: 'success',
        failover_activity_summary: 'Ready for full traffic cutover.',
      },
      services: [
        {
          id: 'svc-gw-primary',
          name: 'Primary Payment Gateway (Stripe-Alpha)',
          service_role: 'primary_payment_gateway',
          category: 'Payment Rail',
          state: 'degraded',
          latency_ms: 840,
          p95_latency_ms: 1840,
          availability_percent: 94.2,
          error_rate_percent: 5.8,
          recent_errors_count: 14,
          latest_error_summary: 'Upstream gateway timeout on POST /v1/charges (HTTP 504)',
          traffic_share_percent: 92.5,
          verification_status: 'verified',
          last_checked_at: '2026-10-13T14:49:30Z',
        },
        {
          id: 'svc-gw-secondary',
          name: 'Secondary Standby Gateway (PayShield-Beta)',
          service_role: 'secondary_payment_gateway',
          category: 'Payment Rail',
          state: 'healthy',
          latency_ms: 92,
          p95_latency_ms: 145,
          availability_percent: 99.98,
          error_rate_percent: 0.02,
          recent_errors_count: 0,
          traffic_share_percent: 7.5,
          verification_status: 'verified',
          last_checked_at: '2026-10-13T14:49:30Z',
        },
        {
          id: 'svc-cart',
          name: 'Redis Session & Cart Store',
          service_role: 'cart',
          category: 'Commerce Core',
          state: 'healthy',
          latency_ms: 18,
          p95_latency_ms: 32,
          availability_percent: 99.99,
          error_rate_percent: 0.01,
          recent_errors_count: 0,
          traffic_share_percent: 100,
          verification_status: 'verified',
          last_checked_at: '2026-10-13T14:49:30Z',
        },
        {
          id: 'svc-auth',
          name: 'Customer Auth & Session Vault',
          service_role: 'authentication',
          category: 'Security & Auth',
          state: 'healthy',
          latency_ms: 42,
          p95_latency_ms: 78,
          availability_percent: 99.95,
          error_rate_percent: 0.05,
          recent_errors_count: 1,
          traffic_share_percent: 100,
          verification_status: 'verified',
          last_checked_at: '2026-10-13T14:49:30Z',
        },
        {
          id: 'svc-catalog',
          name: 'Product Catalog & Search Mesh',
          service_role: 'product_catalog',
          category: 'Discovery',
          state: 'healthy',
          latency_ms: 24,
          p95_latency_ms: 45,
          availability_percent: 99.96,
          error_rate_percent: 0.04,
          recent_errors_count: 0,
          traffic_share_percent: 100,
          verification_status: 'verified',
          last_checked_at: '2026-10-13T14:49:30Z',
        },
        {
          id: 'svc-order',
          name: 'Order Confirmation & Event Queue',
          service_role: 'order_confirmation',
          category: 'Fulfillment',
          state: 'healthy',
          latency_ms: 65,
          p95_latency_ms: 110,
          availability_percent: 99.92,
          error_rate_percent: 0.08,
          recent_errors_count: 0,
          traffic_share_percent: 100,
          verification_status: 'verified',
          last_checked_at: '2026-10-13T14:49:30Z',
        },
      ],
    } as T;
  }

  // 5. Incidents
  if (cleanUrl === '/api/v1/incidents' || cleanUrl.startsWith('/api/v1/incidents/')) {
    const list = [
      {
        id: 'INC-2026-081',
        title: 'Primary Payment Gateway timeouts on checkout',
        severity: 'critical',
        status: mockStore.incidentStatuses['INC-2026-081']?.status || 'investigating',
        affected_target: 'Cart Checkout & Payment Capture',
        affected_journey_id: 'j-payment',
        affected_journey_name: 'Dual-Gateway Payment Token Capture',
        affected_service_id: 'svc-gw-primary',
        affected_service_name: 'Primary Payment Gateway (Stripe-Alpha)',
        first_seen_at: '2026-10-13T13:42:10Z',
        latest_update_at: '2026-10-13T14:48:00Z',
        summary: 'Step 4 "Authorize Payment Token" timed out during simulated checkout runs. Primary gateway latency spiked to 8,620ms (HTTP 504 Gateway Timeout).',
        assigned_owner: 'Helena Vance (On-Call SRE)',
        associated_execution_id: 'exec-9402',
        failed_step_name: 'Submit Capture to Primary Gateway',
        failed_step_order: 3,
        error_code: 'GATEWAY_TIMEOUT_504',
        timeline: [
          { timestamp: '13:42:10 UTC', event: 'Synthetic Probe flagged HTTP 504 on POST /v1/charges', author: 'Sentinel Prober #409' },
          { timestamp: '13:43:00 UTC', event: 'Incident INC-2026-081 auto-triaged to Critical / SEV-1', author: 'Triage Engine' },
          { timestamp: '13:45:20 UTC', event: 'Deterministic RCA identified upstream gateway saturation (96% certainty)', author: 'RCA Sentinel' },
          { timestamp: '14:15:00 UTC', event: 'Dual-key failover approval request queued for Secondary Gateway cutover', author: 'Playbook Engine' },
        ],
        diagnostic_evidence: [
          {
            type: 'http_trace',
            summary: 'HTTP 504 Gateway Timeout on POST /v1/charges',
            raw_payload: 'HTTP/2 504 Gateway Timeout\ncontent-type: application/json\nx-stripe-routing-id: us-east-alpha-99\nlatency: 8620ms\n{\n  "error": {\n    "type": "api_connection_error",\n    "message": "Upstream bank acquisition network timed out (8620ms)."\n  }\n}',
          },
          {
            type: 'curl_command',
            summary: 'Reproduction Probe cURL Command',
            raw_payload: 'curl -X POST https://api.stripe.com/v1/charges \\\n  -H "Authorization: Bearer [REDACTED_TOKEN]" \\\n  -d "amount=14500&currency=usd&source=tok_visa"',
          },
        ],
        related_failure_patterns: [
          { id: 'FP-092', signature: 'POST /v1/charges -> HTTP 504 Timeout', count: 14, severity: 'critical' },
        ],
        recovery_attempts: [
          { id: 'rec-101', playbook: 'Emergency Gateway Failover to Secondary', status: 'verified', executed_at: '14:10:00 UTC' },
        ],
      },
      {
        id: 'INC-2026-079',
        title: 'Transient address validation latency degradation',
        severity: 'sev2',
        status: mockStore.incidentStatuses['INC-2026-079']?.status || 'mitigating',
        affected_target: 'Cart Checkout & Address Validation',
        affected_journey_id: 'j-checkout',
        affected_journey_name: 'Cart Checkout & Address Validation',
        affected_service_id: 'svc-cart',
        affected_service_name: 'Redis Session & Cart Store',
        first_seen_at: '2026-10-13T12:15:00Z',
        latest_update_at: '2026-10-13T13:10:00Z',
        summary: 'Third-party postal geocoder latency spiked above 1,200ms threshold. Fallback zip-lookup cache activated.',
        assigned_owner: 'Marcus Chen',
        associated_execution_id: 'exec-9401',
      },
      {
        id: 'INC-2026-074',
        title: 'Customer login session token verification spike',
        severity: 'sev3',
        status: mockStore.incidentStatuses['INC-2026-074']?.status || 'resolved',
        affected_target: 'Customer Authentication & SSO',
        affected_journey_id: 'j-login',
        affected_journey_name: 'Customer Authentication & SSO',
        first_seen_at: '2026-10-13T09:30:00Z',
        latest_update_at: '2026-10-13T09:34:00Z',
        summary: 'Session cache cluster re-balanced during scheduled key rotation. Auto-recovered in 4 minutes.',
        assigned_owner: 'Automated Sentinel',
      },
    ];

    if (cleanUrl.startsWith('/api/v1/incidents/')) {
      const id = cleanUrl.split('/')[4];
      const match = list.find((i) => i.id === id);
      return (match || list[0]) as T;
    }
    return list as T;
  }

  // 6. AI Insights: Root Cause Analysis (RCA)
  if (cleanUrl === '/api/v1/intelligence/rca') {
    return [
      {
        id: 'RCA-2026-042',
        incident_id: 'INC-2026-081',
        title: 'Upstream Primary Gateway Ingress Saturation',
        identified_cause: 'Network connection pool exhaustion on Stripe Alpha US-East edge cluster causing cascading HTTP 504 timeouts for transaction captures exceeding 4,000ms.',
        confidence: 0.96,
        confidence_level: 'high',
        affected_service_name: 'Primary Payment Gateway (Stripe-Alpha)',
        affected_journey_name: 'Dual-Gateway Payment Token Capture',
        recommended_action: 'Divert transaction ingress immediately to Secondary Gateway (PayShield-Beta) via automated failover playbook.',
        recommended_playbook_id: 'pb-failover-payment',
        recommended_playbook_name: 'Emergency Payment Gateway Failover',
        analyzed_at: '2026-10-13T13:45:20Z',
      },
      {
        id: 'RCA-2026-041',
        incident_id: 'INC-2026-079',
        title: 'Address Geocoding Third-Party Rate Limit',
        identified_cause: 'Postal validation provider returned HTTP 429 bursts during peak cart checkout volume.',
        confidence: 0.91,
        confidence_level: 'high',
        affected_service_name: 'Cart Checkout Service',
        affected_journey_name: 'Cart Checkout & Address Validation',
        recommended_action: 'Switch address validation to offline postal cache and fallback provider.',
        recommended_playbook_id: 'pb-flush-cache',
        recommended_playbook_name: 'Cache Re-sync & Geocode Fallback',
        analyzed_at: '2026-10-13T12:20:00Z',
      },
    ] as T;
  }

  // 7. Failure Patterns
  if (cleanUrl === '/api/v1/intelligence/failure-patterns') {
    return [
      {
        id: 'FP-092',
        signature: 'POST /v1/charges -> HTTP 504 Gateway Timeout (latency > 5000ms)',
        pattern_name: 'Cascading Payment Ingress Timeout',
        affected_journey_or_service: 'Primary Payment Gateway (Stripe-Alpha)',
        occurrences_count: 14,
        severity: 'critical',
        last_observed_at: '2026-10-13T14:49:30Z',
        status: 'active',
        category: 'Upstream Network Saturation',
        description: 'Repeated timeouts on transaction token capture. Historical recurrence: 14 events across last 30 days.',
      },
      {
        id: 'FP-104',
        signature: 'Redis Cart Key TTL Expiration Conflict during simultaneous checkout',
        pattern_name: 'Cart Concurrency Lock Contention',
        affected_journey_or_service: 'Redis Session & Cart Store',
        occurrences_count: 8,
        severity: 'warning',
        last_observed_at: '2026-10-13T13:10:00Z',
        status: 'active',
        category: 'State Contention',
        description: 'Multi-tab cart updates triggering lock contention and race condition rollback.',
      },
      {
        id: 'FP-078',
        signature: 'HTTP 429 Too Many Requests from geo-api.postal.net',
        pattern_name: 'Third-Party Postal API Rate Limit',
        affected_journey_or_service: 'Cart Checkout & Address Validation',
        occurrences_count: 5,
        severity: 'info',
        last_observed_at: '2026-10-13T12:15:00Z',
        status: 'suppressed',
        category: 'Rate Limiting',
        description: 'Mitigated by localized zip-lookup caching rule.',
      },
    ] as T;
  }

  // 8. Signals: Brand Protection & Phishing Domains
  if (cleanUrl === '/api/v1/intelligence/brand-protection') {
    return {
      stats: {
        activeImpersonations: 4,
        takedownsSubmitted: 2,
        protectedBrands: ['Allura Luxe Global', 'SYNESIS ’26'],
        monitoredApexDomains: ['alluraluxe.com', 'synesis.ai'],
      },
      impersonations: [
        {
          id: 'bp-001',
          domain: 'allura-luxee.com',
          targetedBrand: 'Allura Luxe Global',
          riskScore: 96,
          riskLevel: 'critical',
          technique: 'Typosquatting',
          status: mockStore.takedownStatuses['bp-001'] || 'TAKEDOWN_DRAFTED',
          discoveredAt: '2026-10-13T08:12:00Z',
          registrar: 'NameCheap Inc.',
          nameservers: ['ns1.phish-host.ru', 'ns2.phish-host.ru'],
          ipAddress: '185.220.101.42',
          hostingCountry: 'Seychelles',
          mxConfigured: true,
          sslIssuer: "Let's Encrypt Authority X3",
          activePhishingPage: true,
          takedownNotice: {
            toEmail: 'abuse@namecheap.com',
            abuseContact: 'NameCheap Legal & Abuse Team',
            subject: 'URGENT: Trademark Infringement & Active Phishing Takedown - allura-luxee.com',
            legalBasis: 'ICANN UDRP / Lanham Act 15 U.S.C. § 1125 / DMCA Safe Harbor Notification',
            body: 'Dear Abuse Team,\n\nWe represent Allura Luxe Global (USPTO Reg #6,482,109). The domain allura-luxee.com is actively cloning our brand assets, logo, and checkout gateway to harvest credit card numbers.\n\nPlease suspend DNS resolution immediately.',
            generatedAt: '2026-10-13T09:00:00Z',
            evidenceUrls: ['https://allura-luxee.com/checkout/pay', 'https://allura-luxee.com/assets/logo.svg'],
          },
          timeline: [
            { timestamp: '08:12 UTC', event: 'Domain registration detected via CT Logs', author: 'Brand Sentinel' },
            { timestamp: '08:30 UTC', event: 'Headless crawler detected cloned checkout form', author: 'Visual AI Sentinel' },
            { timestamp: '09:00 UTC', event: 'Automated RFC 2142 takedown notice drafted', author: 'Legal Automation Engine' },
          ],
        },
        {
          id: 'bp-002',
          domain: 'alluralux-checkout.shop',
          targetedBrand: 'Allura Luxe Global',
          riskScore: 92,
          riskLevel: 'critical',
          technique: 'Combo-squatting',
          status: mockStore.takedownStatuses['bp-002'] || 'CONFIRMED',
          discoveredAt: '2026-10-13T10:45:00Z',
          registrar: 'Hostinger Operations, UAB',
          nameservers: ['ns1.dns-parking.com', 'ns2.dns-parking.com'],
          ipAddress: '91.218.114.77',
          hostingCountry: 'Bulgaria',
          mxConfigured: false,
          sslIssuer: "Cloudflare Inc ECC CA-3",
          activePhishingPage: true,
          takedownNotice: {
            toEmail: 'abuse@hostinger.com',
            abuseContact: 'Hostinger Abuse Desk',
            subject: 'Cease & Desist / Phishing Domain: alluralux-checkout.shop',
            legalBasis: 'ICANN Anti-Abuse Framework',
            body: 'Domain is impersonating our SSL payment gateway and collecting customer CVVs.',
            generatedAt: '2026-10-13T11:00:00Z',
            evidenceUrls: [],
          },
          timeline: [
            { timestamp: '10:45 UTC', event: 'Discovered on .shop registry stream', author: 'Brand Sentinel' },
            { timestamp: '11:05 UTC', event: 'Flagged as high-risk phishing', author: 'Threat Engine' },
          ],
        },
        {
          id: 'bp-003',
          domain: 'alluraluxeglobal.store',
          targetedBrand: 'Allura Luxe Global',
          riskScore: 74,
          riskLevel: 'high',
          technique: 'TLD Swap',
          status: mockStore.takedownStatuses['bp-003'] || 'UNDER_REVIEW',
          discoveredAt: '2026-10-13T11:20:00Z',
          registrar: 'GoDaddy.com, LLC',
          nameservers: ['ns01.domaincontrol.com', 'ns02.domaincontrol.com'],
          ipAddress: '198.54.117.200',
          hostingCountry: 'United States',
          mxConfigured: true,
          sslIssuer: 'GoDaddy Secure Certificate Authority',
          activePhishingPage: false,
          takedownNotice: {
            toEmail: 'abuse@godaddy.com',
            abuseContact: 'GoDaddy Abuse Help',
            subject: 'Brand Impersonation Notice: alluraluxeglobal.store',
            legalBasis: 'Trademark Protection Rule',
            body: 'Domain registered by unauthorized third party targeting our apex brand.',
            generatedAt: '2026-10-13T11:30:00Z',
            evidenceUrls: [],
          },
          timeline: [
            { timestamp: '11:20 UTC', event: 'Discovered in DNS monitoring', author: 'Brand Sentinel' },
          ],
        },
      ],
    } as T;
  }

  // 9. Signals: Customer VoC Complaints
  if (cleanUrl === '/api/v1/intelligence/complaints') {
    return {
      summary: {
        totalComplaintsLastHour: 112,
        sentimentIndex: -0.74,
        dominantFrictionTopic: 'Payment Timeout / Card Declines',
        complaintVelocityChange: '+340%',
      },
      topics: [
        {
          topic: 'Payment Failed / Spinner Hung',
          count: 64,
          velocity: '+380%',
          urgency: 'critical',
          sampleQuotes: [
            'Card checkout was spinning for 2 minutes then gave an error.',
            'Was trying to buy the jacket and payment crashed at step 4.',
            'Tried twice, money pending in my bank but no order confirmation!',
          ],
        },
        {
          topic: 'Slow Address Autofill',
          count: 28,
          velocity: '+45%',
          urgency: 'medium',
          sampleQuotes: [
            'Zip code took 10 seconds to calculate shipping options.',
            'Checkout page froze when entering billing address.',
          ],
        },
        {
          topic: 'Cart Reset upon Refresh',
          count: 14,
          velocity: '-12%',
          urgency: 'low',
          sampleQuotes: [
            'Refreshed after payment hung and my basket was empty.',
          ],
        },
      ],
    } as T;
  }

  // 10. Signals: Threat & Traffic Monitoring
  if (cleanUrl === '/api/v1/intelligence/threat-monitoring') {
    return {
      activeThreatLevel: 'elevated',
      requestsPerSecond: 1840,
      blockedRequestsLastHour: 14200,
      wafStatus: 'Active & Filtering',
      activeAttacks: [
        {
          id: 'th-1',
          type: 'Credential Stuffing Botnet',
          target: '/api/v1/auth/login',
          rate: '4,200 req/min',
          status: 'Filtered (99.8% Challenge Blocked)',
          startedAt: '2026-10-13T13:30:00Z',
        },
        {
          id: 'th-2',
          type: 'Layer-7 Rapid HTTP Probe',
          target: '/checkout/pay',
          rate: '1,800 req/min',
          status: 'Mitigated by Edge Rate Limiter',
          startedAt: '2026-10-13T14:15:00Z',
        },
      ],
    } as T;
  }

  // 11. Signals: Multi-Signal Causal Correlation
  if (cleanUrl === '/api/v1/intelligence/correlation') {
    return {
      incidentId: 'INC-2026-081',
      rootCauseCorrelationScore: 0.96,
      correlationSummary: 'Causal engine unified synthetic HTTP 504 gateway timeouts with customer VoC complaint spikes (+380%) and edge traffic bursts into verified incident INC-2026-081.',
      correlatedSignals: [
        { type: 'Synthetic Probe', title: 'HTTP 504 Timeout on POST /v1/charges (8,620ms)', time: '13:42:10 UTC', severity: 'critical' },
        { type: 'Customer VoC', title: 'Surge in "Payment failed / spinner hung" (64 complaints)', time: '13:45:00 UTC', severity: 'high' },
        { type: 'Service Telemetry', title: 'Primary Gateway latency spiked to 840ms P50', time: '13:42:00 UTC', severity: 'critical' },
        { type: 'Brand Protection', title: 'Typosquatting domain allura-luxee.com detected harvesting credentials', time: '08:12:00 UTC', severity: 'warning' },
      ],
    } as T;
  }

  // 12. Signals Unified
  if (cleanUrl === '/api/v1/intelligence/signals') {
    return {
      channels: [
        { source: 'Customer Feedback (VoC)', signal: 'Card checkout timeout spike (+380%)', impact: 'Customer checkout drop-off', status: 'RCA Linked' },
        { source: 'Brand Protection', signal: 'Lookalike domain allura-luxee.com active', impact: 'Credential phishing risk', status: 'Takedown Drafted' },
        { source: 'Edge Traffic & WAF', signal: 'Distributed credential stuffing burst on /auth/login', impact: 'Negligible (Filtered)', status: 'WAF Rule Active' },
      ],
    } as T;
  }

  // 13. Recovery Playbooks
  if (cleanUrl === '/api/v1/recovery/playbooks') {
    return [
      {
        id: 'pb-failover-payment',
        name: 'Emergency Payment Gateway Failover to Secondary Standby',
        purpose: 'Diverts 100% of transaction ingress from primary degraded gateway to secondary PayShield-Beta gateway.',
        associated_trigger: 'INC-2026-081 (Primary Gateway Timeout)',
        allowed_actions: ['Route Traffic Shift', 'DNS Ingress Re-point', 'Synthetic Charge Probe'],
        required_approval_level: 'Dual-Key Operator Sign-off',
        blast_radius: 'high',
        enabled: true,
        last_execution_outcome: 'verified',
        estimated_duration: '12 seconds',
        preconditions: ['Secondary Gateway status verified HEALTHY', 'Zero un-voided synthetic charges in queue'],
        steps: [
          { order: 1, name: 'Run Health Ping on PayShield-Beta Gateway', expected_duration: '1s' },
          { order: 2, name: 'Shift Ingress Routing Table (100% Secondary)', expected_duration: '4s' },
          { order: 3, name: 'Execute Sandbox Synthetic Charge Validation', expected_duration: '3s' },
          { order: 4, name: 'Confirm P95 Latency < 150ms and 0% Error Rate', expected_duration: '4s' },
        ],
      },
      {
        id: 'pb-throttle-waf',
        name: 'Edge Rate Limiting & Bot Shield Mitigation',
        purpose: 'Imposes adaptive IP token bucket rate-limiting on sensitive auth and checkout ingress endpoints.',
        associated_trigger: 'Layer-7 Credential Stuffing / Botnet Spikes',
        allowed_actions: ['Cloudflare WAF Rule Deploy', 'CAPTCHA Challenge Activation'],
        required_approval_level: 'Automated / Single-Key',
        blast_radius: 'low',
        enabled: true,
        last_execution_outcome: 'verified',
        estimated_duration: '3 seconds',
        steps: [
          { order: 1, name: 'Deploy WAF Rule #14 to Cloudflare Edge', expected_duration: '2s' },
          { order: 2, name: 'Verify Legitimate Customer Flow Retention', expected_duration: '1s' },
        ],
      },
      {
        id: 'pb-flush-cache',
        name: 'Cart State & Redis Cache Re-synchronization',
        purpose: 'Evicts orphaned session keys and re-hydrates active basket state from read-replicas.',
        associated_trigger: 'State Contention / Cache Saturation',
        allowed_actions: ['Redis Cluster Key Eviction', 'Replica Warmup'],
        required_approval_level: 'Single-Key Operator',
        blast_radius: 'medium',
        enabled: true,
        last_execution_outcome: 'verified',
        estimated_duration: '18 seconds',
        steps: [],
      },
      {
        id: 'pb-restart-service',
        name: 'Graceful Worker Pod Rolling Restart',
        purpose: 'Performs zero-downtime rolling restart of cart and checkout worker pods.',
        associated_trigger: 'Memory Leak / Thread Lock',
        allowed_actions: ['Kubernetes Rolling Restart'],
        required_approval_level: 'Single-Key Operator',
        blast_radius: 'medium',
        enabled: true,
        last_execution_outcome: 'verified',
        estimated_duration: '45 seconds',
        steps: [],
      },
    ] as T;
  }

  // 14. Recovery Executions
  if (cleanUrl === '/api/v1/recovery/executions') {
    return [
      {
        id: 'rec-101',
        incident_id: 'INC-2026-081',
        playbook_id: 'pb-failover-payment',
        playbook_name: 'Emergency Payment Gateway Failover to Secondary Standby',
        target_service: 'Primary Payment Gateway (Stripe-Alpha)',
        status: 'verified',
        initiated_by: 'Auto-Remediation Engine',
        started_at: '2026-10-13T14:10:00Z',
        completed_at: '2026-10-13T14:10:14Z',
        verification_result: '100% verified — Synthetic charge probe passed (142ms latency, HTTP 200 OK)',
        actions_performed: [
          'Ping verified on Secondary Gateway (PayShield-Beta)',
          'Ingress router shifted 100% traffic',
          'Synthetic validation probe executed',
        ],
      },
      {
        id: 'rec-098',
        incident_id: 'INC-2026-079',
        playbook_id: 'pb-flush-cache',
        playbook_name: 'Cart State & Redis Cache Re-synchronization',
        target_service: 'Redis Session & Cart Store',
        status: 'verified',
        initiated_by: 'Helena Vance',
        started_at: '2026-10-13T12:45:00Z',
        completed_at: '2026-10-13T12:45:22Z',
        verification_result: 'Verified — Cart lock contention dropped from 14% to 0.02%',
        actions_performed: ['Orphaned key eviction executed', 'Read-replica cache warmed'],
      },
    ] as T;
  }

  // 15. Recovery Approvals Queue
  if (cleanUrl === '/api/v1/recovery/approvals') {
    const list = [
      {
        id: 'appr-201',
        incident_id: 'INC-2026-081',
        incident_title: 'Primary Payment Gateway timeouts on checkout',
        playbook_id: 'pb-failover-payment',
        playbook_name: 'Emergency Payment Gateway Failover to Secondary Standby',
        proposed_countermeasure: 'Cut over 100% of US-East transactions to Secondary Payment Gateway (PayShield-Beta)',
        target_scope: 'Stripe-Alpha -> PayShield-Beta',
        blast_radius: 'high',
        status: mockStore.approvalDecisions['appr-201']?.status || 'pending',
        requested_at: '2026-10-13T14:15:00Z',
        expires_at: '2026-10-13T15:15:00Z',
        required_approvals: 2,
        current_approvals: 1,
        approvers: ['Helena Vance (Approved at 14:16 UTC)'],
      },
      {
        id: 'appr-202',
        incident_id: 'INC-2026-079',
        incident_title: 'Postal geocoding API rate limit exhaustion',
        playbook_id: 'pb-flush-cache',
        playbook_name: 'Cart State & Redis Cache Re-synchronization',
        proposed_countermeasure: 'Activate localized postal zip cache and warm read-replicas',
        target_scope: 'Redis Cluster',
        blast_radius: 'medium',
        status: mockStore.approvalDecisions['appr-2022']?.status || 'approved',
        requested_at: '2026-10-13T12:30:00Z',
        expires_at: '2026-10-13T13:30:00Z',
        required_approvals: 1,
        current_approvals: 1,
        approvers: ['Marcus Chen (Approved at 12:32 UTC)'],
      },
    ];
    return list as T;
  }

  // 16. Analytics & Reliability Reports
  if (cleanUrl === '/api/v1/analytics/reliability' || cleanUrl === '/api/v1/analytics/trends') {
    return {
      summary: {
        journeySuccessRate: 99.4,
        averageLatencyMs: 185,
        totalExecutions: 28400,
        failedExecutions: 170,
        mttrMinutes: 3.8,
        mttdSeconds: 42,
        recoverySuccessRate: 100,
        openIncidents: 1,
        resolvedIncidentsLast24h: 3,
      },
      hourlyTrends: [
        { hour: '09:00', successRate: 99.8, latencyMs: 142, incidentsCount: 0 },
        { hour: '10:00', successRate: 99.7, latencyMs: 155, incidentsCount: 0 },
        { hour: '11:00', successRate: 99.9, latencyMs: 138, incidentsCount: 0 },
        { hour: '12:00', successRate: 98.4, latencyMs: 290, incidentsCount: 1 },
        { hour: '13:00', successRate: 97.2, latencyMs: 380, incidentsCount: 1 },
        { hour: '14:00', successRate: 94.5, latencyMs: 820, incidentsCount: 1 },
        { hour: '15:00', successRate: 99.4, latencyMs: 185, incidentsCount: 0 },
      ],
      severityDistribution: [
        { severity: 'Critical / SEV-1', count: 1, color: '#C43C4B' },
        { severity: 'Major / SEV-2', count: 1, color: '#C78625' },
        { severity: 'Minor / SEV-3', count: 2, color: '#5578C7' },
        { severity: 'Low', count: 4, color: '#6B7280' },
      ],
      serviceAvailability: [
        { service: 'Stripe Alpha (Primary)', uptime: 94.2, status: 'degraded' },
        { service: 'PayShield Beta (Secondary)', uptime: 99.98, status: 'healthy' },
        { service: 'Redis Cart State', uptime: 99.99, status: 'healthy' },
        { service: 'Auth & Session Vault', uptime: 99.95, status: 'healthy' },
        { service: 'Catalog & Algolia', uptime: 99.96, status: 'healthy' },
      ],
    } as T;
  }

  // 17. Historical Records & Audit
  if (cleanUrl === '/api/v1/history/audit' || cleanUrl === '/api/v1/history/timeline') {
    return [
      {
        id: 'hist-1',
        entity_type: 'Incident',
        entity_id: 'INC-2026-081',
        action: 'Triage & Status Updated to Investigating',
        operator: 'Helena Vance',
        timestamp: '2026-10-13T14:48:00Z',
        details: 'Acknowledged gateway timeout. Verified Secondary Gateway is ready for cutover.',
      },
      {
        id: 'hist-2',
        entity_type: 'Recovery Action',
        entity_id: 'rec-101',
        action: 'Execution Verified',
        operator: 'System Automations',
        timestamp: '2026-10-13T14:10:14Z',
        details: 'Secondary gateway failover test passed with 142ms response time.',
      },
      {
        id: 'hist-3',
        entity_type: 'Approval',
        entity_id: 'appr-201',
        action: 'Approval Sign-off (Key 1 of 2)',
        operator: 'Helena Vance',
        timestamp: '2026-10-13T14:16:00Z',
        details: 'Dual-key signature applied for traffic diversion.',
      },
      {
        id: 'hist-4',
        entity_type: 'Brand Takedown',
        entity_id: 'bp-001',
        action: 'Takedown Notice Generated',
        operator: 'Brand Protection Sentinel',
        timestamp: '2026-10-13T09:00:00Z',
        details: 'Generated RFC 2142 abuse report for allura-luxee.com (NameCheap abuse desk).',
      },
    ] as T;
  }

  // 18. Integrations
  if (cleanUrl === '/api/v1/system/integrations') {
    return [
      {
        id: 'int-stripe',
        name: 'Stripe Payment Gateway (Alpha)',
        type: 'Payment Gateway Adapter',
        status: 'connected',
        health_state: 'degraded',
        latency_ms: 840,
        last_health_check: 'Just now',
        config_summary: 'Account: acct_1N9x... • Webhook endpoint: /api/v1/gateways/stripe/webhook',
        capabilities: ['Card Capture', '3D Secure 2.0', 'Idempotent Tokenization', 'Safe Void'],
      },
      {
        id: 'int-payshield',
        name: 'PayShield-Beta Standby Gateway',
        type: 'Payment Gateway Adapter',
        status: 'connected',
        health_state: 'healthy',
        latency_ms: 92,
        last_health_check: 'Just now',
        config_summary: 'Account: ps_enterprise_002 • Ready for 100% traffic ingress',
        capabilities: ['Automatic Failover', 'Zero-Downtime Cutover', 'Multi-Currency'],
      },
      {
        id: 'int-datadog',
        name: 'Datadog APM & Metrics Mesh',
        type: 'Monitoring & Telemetry Adapter',
        status: 'connected',
        health_state: 'healthy',
        latency_ms: 14,
        last_health_check: '1m ago',
        config_summary: 'Site: datadoghq.com • Streaming 1,200 synthetic telemetry spans/sec',
        capabilities: ['Trace Streaming', 'P95/P99 Calculation', 'Error Budget SLOs'],
      },
      {
        id: 'int-pagerduty',
        name: 'PagerDuty Escalation Policy',
        type: 'On-Call & Alerting Adapter',
        status: 'connected',
        health_state: 'healthy',
        latency_ms: 22,
        last_health_check: '2m ago',
        config_summary: 'Schedule: Enterprise Tier 1 • Active escalation: SRE Team Alpha',
        capabilities: ['SEV-1 Escalation', 'SMS / Push Notification', 'Dual-Key Acknowledgement'],
      },
      {
        id: 'int-slack',
        name: 'Slack Incident Channel',
        type: 'Notification Adapter',
        status: 'connected',
        health_state: 'healthy',
        latency_ms: 18,
        last_health_check: 'Just now',
        config_summary: 'Channel: #war-room-synesis • Bot: @synesis-sentinel',
        capabilities: ['Real-time RCA Alerts', 'Approval Request Buttons', 'Executive Daily Summaries'],
      },
      {
        id: 'int-cloudflare',
        name: 'Cloudflare Edge Shield & WAF',
        type: 'Edge Security Adapter',
        status: 'connected',
        health_state: 'healthy',
        latency_ms: 8,
        last_health_check: 'Just now',
        config_summary: 'Zone: alluraluxe.com • WAF Rule #14 Active',
        capabilities: ['Layer-7 Rate Limiting', 'Bot Managed Challenge', 'DDoS Absorption'],
      },
    ] as T;
  }

  // 19. Settings
  if (cleanUrl === '/api/v1/system/settings') {
    return {
      auto_recovery_enabled: true,
      probe_frequency_seconds: 15,
      slo_threshold_percent: 99.5,
      multi_region_probes: ['US-East (N. Virginia)', 'EU-West (Frankfurt)', 'AP-South (Mumbai)'],
      dual_key_approval_required: true,
      synthetic_card_safe_mode: true,
      alert_notification_channels: ['Slack #war-room-synesis', 'PagerDuty Primary', 'Email SRE'],
      time_zone: 'UTC',
      retention_period_days: 90,
    } as T;
  }

  return undefined;
}
