/**
 * Continuum — Business Reliability & Recovery
 * Typed API Contracts for Command Center & Core Reliability Domains.
 * Supports both snake_case (FastAPI default) and camelCase payloads.
 */

export type JourneyExecutionStatus = 'healthy' | 'degraded' | 'failing' | 'unknown';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low' | 'sev1' | 'sev2' | 'sev3';
export type IncidentLifecycleStatus = 'open' | 'investigating' | 'mitigating' | 'resolved';
export type ServiceHealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type RecoveryVerificationStatus =
  | 'verified'
  | 'in_progress'
  | 'pending_approval'
  | 'failed'
  | 'rolled_back';

export interface CommandCenterKpiMetrics {
  overallJourneySuccessRate?: number | null;
  overallJourneySuccessDelta?: number | null;
  activeIncidentsCount?: number | null;
  criticalIncidentsCount?: number | null;
  unhealthyServicesCount?: number | null;
  totalServicesCount?: number | null;
  averageJourneyLatencyMs?: number | null;
  latencySloTargetMs?: number | null;
  recoverySuccessRate?: number | null;
  totalRecoveryAttempts?: number | null;
  detectedFailurePatternsCount?: number | null;
  recurringPatternsCount?: number | null;
}

export interface MonitoredJourneyRecord {
  id: string;
  name: string;
  slug?: string;
  category?: string;
  successRate: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs?: number | null;
  latestExecutionStatus: JourneyExecutionStatus;
  lastRunAt: string | null;
  stepCount?: number | null;
}

export interface IncidentActivityRecord {
  id: string;
  title?: string;
  affectedTarget: string;
  targetType?: 'journey' | 'service';
  severity: IncidentSeverity;
  status: IncidentLifecycleStatus;
  firstSeenAt: string;
  latestUpdateAt: string;
  summary?: string;
}

export interface ServiceHealthRecord {
  id: string;
  name: string;
  role?: string;
  category?: string;
  state: ServiceHealthState;
  latencyMs?: number | null;
  errorRatePercent?: number | null;
  lastCheckedAt?: string | null;
  providerType?: string;
}

export interface FailurePatternRecord {
  id: string;
  signature: string;
  affectedJourneyOrService: string;
  occurrencesCount: number;
  severity: 'critical' | 'warning' | 'info';
  lastObservedAt: string;
  status: 'active' | 'regressing' | 'suppressed';
}

export interface RecoveryAttemptRecord {
  id: string;
  playbookName: string;
  targetServiceOrJourney: string;
  incidentId?: string | null;
  status: RecoveryVerificationStatus;
  verificationResult?: string | null;
  initiatedBy?: string;
  executedAt: string;
}

export interface PendingApprovalRecord {
  id: string;
  proposedCountermeasure: string;
  targetScope: string;
  blastRadius: 'low' | 'medium' | 'high';
  requestedAt: string;
  expiresAt?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface EndpointContractSpec {
  id: string;
  domain: string;
  method: 'GET' | 'POST';
  endpoint: string;
  description: string;
  expectedFields: string[];
}

export const COMMAND_CENTER_ENDPOINT_CONTRACTS: readonly EndpointContractSpec[] = [
  {
    id: 'journeys',
    domain: 'Business Journey Health',
    method: 'GET',
    endpoint: '/api/v1/journeys',
    description:
      'Returns configured synthetic e-commerce journeys (e.g., Login, Product browsing, Add to cart, Checkout, Payment, Order confirmation) with pass rate, latency, latest status, and last-run timestamp.',
    expectedFields: [
      'id',
      'name',
      'success_rate',
      'avg_latency_ms',
      'latest_status',
      'last_run_at',
    ],
  },
  {
    id: 'incidents',
    domain: 'Incident Activity',
    method: 'GET',
    endpoint: '/api/v1/incidents',
    description:
      'Returns active and recent reliability incidents with affected journey/service, severity, lifecycle status, first-seen time, and latest update.',
    expectedFields: [
      'id',
      'affected_target',
      'severity',
      'status',
      'first_seen_at',
      'latest_update_at',
    ],
  },
  {
    id: 'services',
    domain: 'Service Health',
    method: 'GET',
    endpoint: '/api/v1/services/health',
    description:
      'Returns monitored backend dependencies (such as primary payment gateway, secondary payment gateway, inventory, auth) and their healthy/degraded/unhealthy/unknown state.',
    expectedFields: ['id', 'name', 'state', 'latency_ms', 'error_rate_percent', 'last_checked_at'],
  },
  {
    id: 'failure-patterns',
    domain: 'Failure Patterns',
    method: 'GET',
    endpoint: '/api/v1/intelligence/failure-patterns',
    description:
      'Returns clustered recurring error signatures detected across synthetic journey executions.',
    expectedFields: [
      'id',
      'signature',
      'affected_target',
      'occurrences_count',
      'severity',
      'last_observed_at',
    ],
  },
  {
    id: 'recovery-executions',
    domain: 'Recovery Activity & Verification',
    method: 'GET',
    endpoint: '/api/v1/recovery/executions',
    description:
      'Returns recent countermeasure executions, rollout status, and post-recovery synthetic verification results.',
    expectedFields: [
      'id',
      'playbook_name',
      'target',
      'status',
      'verification_result',
      'executed_at',
    ],
  },
  {
    id: 'recovery-approvals',
    domain: 'Pending Recovery Approvals',
    method: 'GET',
    endpoint: '/api/v1/recovery/approvals',
    description:
      'Returns human-in-the-loop approval requests awaiting operator authorization before countermeasure execution.',
    expectedFields: [
      'id',
      'proposed_countermeasure',
      'target_scope',
      'blast_radius',
      'requested_at',
      'status',
    ],
  },
] as const;
