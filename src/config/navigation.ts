import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Archive,
  BarChart3,
  Compass,
  Layers,
  Plug,
  Radio,
  Settings,
  Sparkles,
  Workflow,
} from 'lucide-react';

export interface RouteColumnSpec {
  key: string;
  header: string;
  mono?: boolean;
  align?: 'left' | 'right';
}

export interface NavigationItem {
  id: string;
  label: string;
  path: string;
  section: string;
  icon: LucideIcon;
  subtitle: string;
  expectedEndpoint: string;
  domainEntity: string;
  primaryFilterLabel: string;
  primaryFilterOptions: { value: string; label: string }[];
  secondaryFilterLabel: string;
  secondaryFilterOptions: { value: string; label: string }[];
  columns: RouteColumnSpec[];
}

export interface NavigationSection {
  id: string;
  title: string;
  items: NavigationItem[];
}

export const NAVIGATION_SECTIONS: NavigationSection[] = [
  {
    id: 'home',
    title: 'Home',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        path: '/overview',
        section: 'Home',
        icon: Compass,
        subtitle:
          'Your business workflows, monitored and protected automatically.',
        expectedEndpoint: '/api/v1/overview/command-center',
        domainEntity: 'Business Operations Posture',
        primaryFilterLabel: 'Environment',
        primaryFilterOptions: [
          { value: 'all', label: 'All Environments' },
          { value: 'prod-us-east', label: 'prod-us-east' },
          { value: 'prod-eu-central', label: 'prod-eu-central' },
        ],
        secondaryFilterLabel: 'Status Scope',
        secondaryFilterOptions: [
          { value: 'all', label: 'All Statuses' },
          { value: 'needs-attention', label: 'Needs Attention' },
          { value: 'healthy', label: 'Healthy' },
        ],
        columns: [
          { key: 'workflow', header: 'Business Workflow' },
          { key: 'status', header: 'Current Health' },
          { key: 'latency', header: 'Response Time', mono: true },
          { key: 'updatedAt', header: 'Last Checked', mono: true, align: 'right' },
        ],
      },
    ],
  },
  {
    id: 'monitor',
    title: 'Monitor',
    items: [
      {
        id: 'business-journeys',
        label: 'Business Journeys',
        path: '/monitoring/journeys',
        section: 'Monitor',
        icon: Workflow,
        subtitle:
          'Track the critical customer workflows keeping your e-commerce operations running.',
        expectedEndpoint: '/api/v1/journeys',
        domainEntity: 'Customer Journey Workflows',
        primaryFilterLabel: 'Funnel Step',
        primaryFilterOptions: [
          { value: 'all', label: 'All Funnel Steps' },
          { value: 'login', label: 'Customer Login' },
          { value: 'checkout', label: 'Cart & Checkout' },
          { value: 'payment', label: 'Payment Capture' },
        ],
        secondaryFilterLabel: 'Health State',
        secondaryFilterOptions: [
          { value: 'all', label: 'All States' },
          { value: 'healthy', label: 'Healthy' },
          { value: 'degraded', label: 'Needs Attention' },
          { value: 'failing', label: 'Failed' },
        ],
        columns: [
          { key: 'journeyId', header: 'Workflow ID', mono: true },
          { key: 'name', header: 'Workflow Name' },
          { key: 'passRate', header: 'Success Rate' },
          { key: 'latency', header: 'Avg Response', mono: true },
          { key: 'status', header: 'State' },
        ],
      },
      {
        id: 'service-health',
        label: 'Service Health',
        path: '/monitoring/service-health',
        section: 'Monitor',
        icon: Activity,
        subtitle:
          'Operational health of primary & secondary payment gateways, catalog, and cart backends.',
        expectedEndpoint: '/api/v1/services/health',
        domainEntity: 'Infrastructure & Payment Gateways',
        primaryFilterLabel: 'Gateway Tier',
        primaryFilterOptions: [
          { value: 'all', label: 'All Services' },
          { value: 'primary-gw', label: 'Primary Payment Gateway' },
          { value: 'secondary-gw', label: 'Secondary Standby Gateway' },
          { value: 'core', label: 'Commerce Core' },
        ],
        secondaryFilterLabel: 'Health Status',
        secondaryFilterOptions: [
          { value: 'all', label: 'All Statuses' },
          { value: 'healthy', label: 'Healthy' },
          { value: 'degraded', label: 'Degraded' },
          { value: 'unhealthy', label: 'Unhealthy' },
        ],
        columns: [
          { key: 'service', header: 'Service' },
          { key: 'status', header: 'Health' },
          { key: 'latency', header: 'P95 Latency', mono: true },
          { key: 'gatewayRole', header: 'Role' },
        ],
      },
    ],
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    items: [
      {
        id: 'ai-insights',
        label: 'AI Insights',
        path: '/intelligence/insights',
        section: 'Intelligence',
        icon: Sparkles,
        subtitle:
          'Automated root-cause analysis, recurring error patterns, and multi-signal causal correlation.',
        expectedEndpoint: '/api/v1/intelligence/insights',
        domainEntity: 'AI Diagnostics & RCA',
        primaryFilterLabel: 'Insight Type',
        primaryFilterOptions: [
          { value: 'all', label: 'All Insights' },
          { value: 'root-cause', label: 'Root Cause Hypotheses' },
          { value: 'patterns', label: 'Recurring Patterns' },
          { value: 'correlations', label: 'Causal Correlations' },
        ],
        secondaryFilterLabel: 'Confidence',
        secondaryFilterOptions: [
          { value: 'all', label: 'All Confidence Levels' },
          { value: 'high', label: 'High Confidence (>90%)' },
          { value: 'medium', label: 'Moderate Confidence' },
        ],
        columns: [
          { key: 'id', header: 'Insight ID', mono: true },
          { key: 'title', header: 'Diagnosis' },
          { key: 'confidence', header: 'Certainty' },
          { key: 'remedy', header: 'Suggested Remedy' },
        ],
      },
      {
        id: 'signals',
        label: 'Brand & Customer Signals',
        path: '/intelligence/signals',
        section: 'Intelligence',
        icon: Radio,
        subtitle:
          'Customer sentiment surges, lookalike brand impersonation domains, and edge bot traffic bursts.',
        expectedEndpoint: '/api/v1/intelligence/signals',
        domainEntity: 'Customer & Threat Signals',
        primaryFilterLabel: 'Signal Channel',
        primaryFilterOptions: [
          { value: 'all', label: 'All Channels' },
          { value: 'complaints', label: 'Customer Feedback (VoC)' },
          { value: 'brand', label: 'Brand Impersonation' },
          { value: 'threats', label: 'Traffic & Bot Spikes' },
        ],
        secondaryFilterLabel: 'Urgency',
        secondaryFilterOptions: [
          { value: 'all', label: 'All Urgencies' },
          { value: 'surge', label: 'Surge Active' },
          { value: 'normal', label: 'Baseline Activity' },
        ],
        columns: [
          { key: 'source', header: 'Channel' },
          { key: 'signal', header: 'Detected Anomaly' },
          { key: 'impact', header: 'Customer Friction' },
          { key: 'status', header: 'Protective Action' },
        ],
      },
    ],
  },
  {
    id: 'recovery',
    title: 'Recovery',
    items: [
      {
        id: 'recovery-center',
        label: 'Recovery Center',
        path: '/recovery/center',
        section: 'Recovery',
        icon: Layers,
        subtitle:
          'Safe, pre-approved recovery playbooks, automated failover controls, and auditable action ledgers.',
        expectedEndpoint: '/api/v1/recovery/center',
        domainEntity: 'Recovery Playbooks & Executions',
        primaryFilterLabel: 'Playbook Action',
        primaryFilterOptions: [
          { value: 'all', label: 'All Playbooks' },
          { value: 'failover', label: 'Gateway Failover' },
          { value: 'traffic', label: 'Traffic Throttle / WAF' },
          { value: 'cache', label: 'Cache Re-sync' },
        ],
        secondaryFilterLabel: 'Execution State',
        secondaryFilterOptions: [
          { value: 'all', label: 'All States' },
          { value: 'verified', label: 'Verified & Completed' },
          { value: 'in-progress', label: 'In Progress' },
          { value: 'pending', label: 'Pending Approval' },
        ],
        columns: [
          { key: 'id', header: 'Operation ID', mono: true },
          { key: 'playbook', header: 'Countermeasure' },
          { key: 'target', header: 'Target Service' },
          { key: 'outcome', header: 'Verification' },
        ],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    items: [
      {
        id: 'business-reports',
        label: 'Business Reports',
        path: '/reports/business',
        section: 'Reports',
        icon: BarChart3,
        subtitle:
          'Executive uptime reports, customer journey reliability trends, and recovery performance.',
        expectedEndpoint: '/api/v1/analytics/reliability',
        domainEntity: 'Reliability & SLO Analytics',
        primaryFilterLabel: 'Time Horizon',
        primaryFilterOptions: [
          { value: '24h', label: 'Last 24 Hours' },
          { value: '7d', label: 'Last 7 Days' },
          { value: '30d', label: 'Last 30 Days' },
        ],
        secondaryFilterLabel: 'Report Metric',
        secondaryFilterOptions: [
          { value: 'all', label: 'All Business Metrics' },
          { value: 'availability', label: 'Workflow Availability' },
          { value: 'latency', label: 'Customer Speed (Latency)' },
        ],
        columns: [
          { key: 'metric', header: 'Reliability Objective' },
          { key: 'target', header: 'Business Target' },
          { key: 'actual', header: 'Attainment' },
          { key: 'status', header: 'SLO Health' },
        ],
      },
      {
        id: 'activity-history',
        label: 'Activity History',
        path: '/reports/history',
        section: 'Reports',
        icon: Archive,
        subtitle:
          'Searchable compliance ledger of past executions, incident postmortems, and recovery audits.',
        expectedEndpoint: '/api/v1/analytics/history',
        domainEntity: 'Compliance & Audit Ledgers',
        primaryFilterLabel: 'Ledger Category',
        primaryFilterOptions: [
          { value: 'all', label: 'All Records' },
          { value: 'incidents', label: 'Incident Records' },
          { value: 'recovery', label: 'Recovery Executions' },
        ],
        secondaryFilterLabel: 'Time Horizon',
        secondaryFilterOptions: [
          { value: 'all', label: 'All Time' },
          { value: 'recent', label: 'Last 30 Days' },
        ],
        columns: [
          { key: 'id', header: 'Record ID', mono: true },
          { key: 'type', header: 'Activity Type' },
          { key: 'reference', header: 'Subject' },
          { key: 'timestamp', header: 'Recorded At', mono: true },
        ],
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    items: [
      {
        id: 'integrations',
        label: 'Integrations',
        path: '/system/integrations',
        section: 'Settings',
        icon: Plug,
        subtitle:
          'Payment gateway adapters, alert webhooks (Slack/PagerDuty), and synthetic monitor agents.',
        expectedEndpoint: '/api/v1/system/integrations',
        domainEntity: 'Connectors & Webhooks',
        primaryFilterLabel: 'Adapter Type',
        primaryFilterOptions: [
          { value: 'all', label: 'All Integrations' },
          { value: 'gateways', label: 'Payment Gateways' },
          { value: 'alerting', label: 'Alert Channels' },
        ],
        secondaryFilterLabel: 'Connection',
        secondaryFilterOptions: [
          { value: 'all', label: 'All Statuses' },
          { value: 'connected', label: 'Connected' },
        ],
        columns: [
          { key: 'name', header: 'Connector' },
          { key: 'type', header: 'Adapter' },
          { key: 'status', header: 'Connection State' },
        ],
      },
      {
        id: 'settings-config',
        label: 'Settings',
        path: '/system/settings',
        section: 'Settings',
        icon: Settings,
        subtitle:
          'Reliability policies, dual-approval quorum thresholds, and operator preferences.',
        expectedEndpoint: '/api/v1/system/settings',
        domainEntity: 'Platform Configuration',
        primaryFilterLabel: 'Policy Scope',
        primaryFilterOptions: [
          { value: 'all', label: 'All Policies' },
          { value: 'guardrails', label: 'Recovery Guardrails' },
        ],
        secondaryFilterLabel: 'Enforcement',
        secondaryFilterOptions: [
          { value: 'all', label: 'All Modes' },
          { value: 'enforced', label: 'Strictly Enforced' },
        ],
        columns: [
          { key: 'policy', header: 'Rule / Policy' },
          { key: 'value', header: 'Configured Value' },
          { key: 'mode', header: 'Mode' },
        ],
      },
    ],
  },
];

export const ALL_NAVIGATION_ITEMS: NavigationItem[] = NAVIGATION_SECTIONS.flatMap(
  (section) => section.items
);

export function findNavigationItemByPath(pathname: string): NavigationItem | undefined {
  if (pathname === '/' || pathname === '/overview' || pathname === '/command-center') {
    return ALL_NAVIGATION_ITEMS[0];
  }
  // Support legacy routes mapping to parent items
  if (pathname.startsWith('/monitoring/incidents') || pathname.startsWith('/intelligence/incidents')) {
    return ALL_NAVIGATION_ITEMS.find((item) => item.id === 'business-journeys');
  }
  if (pathname.startsWith('/intelligence/insights') || pathname.startsWith('/intelligence/root-cause') || pathname.startsWith('/intelligence/failure-patterns') || pathname.startsWith('/intelligence/correlation')) {
    return ALL_NAVIGATION_ITEMS.find((item) => item.id === 'ai-insights');
  }
  if (pathname.startsWith('/intelligence/signals') || pathname.startsWith('/intelligence/brand-protection') || pathname.startsWith('/intelligence/complaints') || pathname.startsWith('/intelligence/threat-monitoring')) {
    return ALL_NAVIGATION_ITEMS.find((item) => item.id === 'signals');
  }
  if (pathname.startsWith('/recovery/center') || pathname.startsWith('/recovery/playbooks') || pathname.startsWith('/recovery/executions') || pathname.startsWith('/recovery/approvals')) {
    return ALL_NAVIGATION_ITEMS.find((item) => item.id === 'recovery-center');
  }
  if (pathname.startsWith('/reports/business') || pathname.startsWith('/analytics/reliability')) {
    return ALL_NAVIGATION_ITEMS.find((item) => item.id === 'business-reports');
  }
  if (pathname.startsWith('/reports/history') || pathname.startsWith('/analytics/history')) {
    return ALL_NAVIGATION_ITEMS.find((item) => item.id === 'activity-history');
  }
  return ALL_NAVIGATION_ITEMS.find((item) => item.path === pathname);
}
