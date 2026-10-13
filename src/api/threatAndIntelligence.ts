/**
 * SYNESIS ’26 — Autonomous Business Monitoring, Intelligence & Recovery
 * Threat, Brand Protection, Complaint & Multi-Signal Correlation API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ContinuumApiError } from './client';

// ==========================================
// 1. BRAND PROTECTION & IMPERSONATION TYPES
// ==========================================

export type TakedownStatus =
  | 'DISCOVERED'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'FALSE_POSITIVE'
  | 'TAKEDOWN_DRAFTED'
  | 'APPROVED'
  | 'RESOLVED';

export type ImpersonationTechnique =
  | 'Homoglyph / Punycode'
  | 'Typosquatting'
  | 'Combo-squatting'
  | 'Subdomain Phishing'
  | 'TLD Swap';

export interface ImpersonationDomainRecord {
  id: string;
  domain: string;
  targetedBrand: string;
  riskScore: number; // 0-100
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  technique: ImpersonationTechnique;
  status: TakedownStatus;
  discoveredAt: string;
  registrar: string;
  nameservers: string[];
  ipAddress: string;
  hostingCountry: string;
  mxConfigured: boolean;
  sslIssuer: string;
  activePhishingPage: boolean;
  takedownNotice: {
    toEmail: string;
    abuseContact: string;
    subject: string;
    legalBasis: string;
    body: string;
    generatedAt: string;
    evidenceUrls: string[];
  };
  timeline: {
    timestamp: string;
    event: string;
    author: string;
  }[];
}

export interface BrandProtectionSummary {
  monitoredAssetsCount: number;
  activeThreatCount: number;
  pendingTakedownCount: number;
  resolvedTakedownsCount: number;
  averageTakedownHours: number;
  impersonations: ImpersonationDomainRecord[];
}

// ==========================================
// 2. COMPLAINT INTELLIGENCE TYPES
// ==========================================

export interface ComplaintDataPoint {
  timestamp: string;
  complaintVolume: number;
  baselineVolume: number;
  sentimentScore: number; // -1.0 to 1.0
  dominantCategory: string;
}

export interface CustomerComplaintItem {
  id: string;
  source: 'Zendesk Ticket' | 'X / Social Media' | 'Mobile App Review' | 'In-App CSAT';
  customerHandle: string;
  sentiment: 'severe_negative' | 'negative' | 'neutral';
  category: 'Checkout Failure' | 'OTP Delay' | 'Payment Timeout' | 'Double Debit' | 'Cart Eviction';
  snippet: string;
  timestamp: string;
  correlatedJourney: string;
  correlatedIncidentId?: string;
  impactScore: number;
}

export interface ComplaintIntelligencePayload {
  surgeMultiplier: number; // e.g. +340%
  surgeStatus: 'NORMAL' | 'ELEVATED' | 'CRITICAL_SURGE';
  currentRatePerHour: number;
  baselineRatePerHour: number;
  affectedJourneys: string[];
  categories: {
    name: string;
    sharePercent: number;
    deltaVsBaseline: number;
    severity: 'critical' | 'warning' | 'info';
  }[];
  trendSeries: ComplaintDataPoint[];
  liveComplaints: CustomerComplaintItem[];
}

// ==========================================
// 3. THREAT MONITORING TYPES
// ==========================================

export interface ThreatTrafficPoint {
  timestamp: string;
  totalRps: number;
  legitRps: number;
  anomalyRps: number;
  botRatio: number;
}

export interface ThreatVectorRecord {
  id: string;
  vectorType:
    | 'Layer 7 HTTP Flood'
    | 'Credential Stuffing'
    | 'Cart Scraping Botnet'
    | 'Distributed Token Harvesting'
    | 'Payment Gateway Brute-Force';
  targetedPath: string;
  severity: 'critical' | 'high' | 'medium';
  activeStatus: 'ATTACK_IN_PROGRESS' | 'MITIGATED' | 'ANALYZING';
  peakRps: number;
  blockedRequests: number;
  firstDetectedAt: string;
  sourceDistribution: {
    asn: string;
    organization: string;
    country: string;
    share: number;
  }[];
  mitigationRule: {
    id: string;
    ruleType: 'WAF Rate Limit' | 'Managed Turnstile Challenge' | 'ASN Block' | 'Geo Filter';
    threshold: string;
    enforced: boolean;
    lastUpdated: string;
  };
}

export interface ThreatMonitoringPayload {
  overallThreatLevel: 'CRITICAL_ATTACK' | 'ELEVATED' | 'NORMAL';
  currentTotalRps: number;
  botPercentage: number;
  mitigatedToday: number;
  activeAttacksCount: number;
  trafficSeries: ThreatTrafficPoint[];
  vectors: ThreatVectorRecord[];
}

// ==========================================
// 4. UNIFIED INCIDENT CORRELATION TYPES
// ==========================================

export interface CorrelatedSignalItem {
  id: string;
  type:
    | 'synthetic_journey'
    | 'infrastructure_latency'
    | 'complaint_surge'
    | 'threat_traffic'
    | 'brand_phish';
  title: string;
  metricDelta: string;
  relationship: 'Confirmed' | 'Correlated' | 'Suspected' | 'Unrelated';
  confidenceScore: number; // 0-100%
  timestamp: string;
  evidence: string;
}

export interface UnifiedIncidentCorrelation {
  correlationId: string;
  primaryIncidentId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium';
  firstObservedAt: string;
  signals: CorrelatedSignalItem[];
  synthesizedRootCause: string;
  recommendedPlaybookId: string;
  recommendedPlaybookName: string;
  confidenceScore: number;
  isResolved: boolean;
}

// ==========================================
// LOCAL STORAGE PERSISTENCE & MOCK SEEDS
// ==========================================

const BRAND_STORAGE_KEY = 'synesis.intelligence.brand.v1';
const THREAT_STORAGE_KEY = 'synesis.intelligence.threat.v1';

const INITIAL_IMPERSONATION_DATA: ImpersonationDomainRecord[] = [
  {
    id: 'IMP-2026-904',
    domain: 'syndicate-pay-portal.com',
    targetedBrand: 'Syndicate Commerce Pay',
    riskScore: 98,
    riskLevel: 'critical',
    technique: 'Combo-squatting',
    status: 'TAKEDOWN_DRAFTED',
    discoveredAt: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
    registrar: 'NameCheap Inc.',
    nameservers: ['ns1.shadyhost.xyz', 'ns2.shadyhost.xyz'],
    ipAddress: '185.220.101.42',
    hostingCountry: 'Seychelles (SC)',
    mxConfigured: true,
    sslIssuer: "Let's Encrypt Authority X3",
    activePhishingPage: true,
    takedownNotice: {
      toEmail: 'abuse@namecheap.com',
      abuseContact: 'NameCheap Legal & Abuse Operations',
      subject: 'URGENT: Trademark Infringement & Active Credential Harvesting on syndicate-pay-portal.com',
      legalBasis: 'ICANN UDRP / Digital Millennium Copyright Act / Anti-Phishing Enforcement Standard',
      body: `To NameCheap Abuse Team,\n\nThis constitutes formal notice of an ongoing brand impersonation and active phishing campaign targeting SYNESIS clients hosted on domain syndicate-pay-portal.com (IP: 185.220.101.42).\n\nThe domain duplicates the checkout authentication form and captures user payment tokens. Active MX records indicate immediate phishing email distribution.\n\nImmediate suspension of DNS delegation is requested under ICANN Registrar Accreditation Agreement 3.7.7.`,
      generatedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      evidenceUrls: [
        'https://syndicate-pay-portal.com/auth/login',
        'https://syndicate-pay-portal.com/capture/checkout',
      ],
    },
    timeline: [
      {
        timestamp: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
        event: 'Domain registration telemetry indexed by SYNESIS Sentinel crawler.',
        author: 'Autonomous Sentinel Engine',
      },
      {
        timestamp: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
        event: 'Automated headless scan verified active replica of Payment Gateway checkout form.',
        author: 'Heuristic Vision Scanner',
      },
      {
        timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
        event: 'Official ICANN takedown affidavit drafted and abuse queue targeted.',
        author: 'Autonomous Legal Drafter',
      },
    ],
  },
  {
    id: 'IMP-2026-891',
    domain: 'synesls-commerce.io',
    targetedBrand: 'Synesis Commerce Platform',
    riskScore: 92,
    riskLevel: 'critical',
    technique: 'Homoglyph / Punycode',
    status: 'CONFIRMED',
    discoveredAt: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    registrar: 'Tucows Domains Inc.',
    nameservers: ['dns1.p04.nsone.net', 'dns2.p04.nsone.net'],
    ipAddress: '91.240.118.88',
    hostingCountry: 'Panama (PA)',
    mxConfigured: false,
    sslIssuer: 'ZeroSSL Global TLS CA',
    activePhishingPage: true,
    takedownNotice: {
      toEmail: 'domainabuse@tucows.com',
      abuseContact: 'Tucows Compliance Directorate',
      subject: 'Notification of Homoglyphic Brand Impersonation on synesls-commerce.io',
      legalBasis: 'ICANN Uniform Dispute Resolution Policy (UDRP)',
      body: `Formal takedown demand for synesls-commerce.io (substituting 'i' with lowercase 'l'). Active replica of merchant admin console observed.`,
      generatedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      evidenceUrls: ['https://synesls-commerce.io/admin/login'],
    },
    timeline: [
      {
        timestamp: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
        event: 'Discovered via CT Log (Certificate Transparency) stream.',
        author: 'CertStream Monitor',
      },
      {
        timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        event: 'Phishing signature confirmed by SecOps analyst.',
        author: 'SecOps Lead (sec-lead-01)',
      },
    ],
  },
  {
    id: 'IMP-2026-788',
    domain: 'pay-synesis-checkout.app',
    targetedBrand: 'Synesis Checkout Express',
    riskScore: 84,
    riskLevel: 'high',
    technique: 'TLD Swap',
    status: 'APPROVED',
    discoveredAt: new Date(Date.now() - 320 * 60 * 1000).toISOString(),
    registrar: 'GoDaddy.com, LLC',
    nameservers: ['ns31.domaincontrol.com', 'ns32.domaincontrol.com'],
    ipAddress: '104.21.32.190',
    hostingCountry: 'United States (US)',
    mxConfigured: true,
    sslIssuer: "Let's Encrypt Authority X3",
    activePhishingPage: false,
    takedownNotice: {
      toEmail: 'abuse@godaddy.com',
      abuseContact: 'GoDaddy Abuse Department',
      subject: 'Takedown Request: Unauthorized Merchant Intermediary pay-synesis-checkout.app',
      legalBasis: 'Trademark Protection & Brand Integrity Protocol',
      body: `Requesting DNS blackholing for pay-synesis-checkout.app. Domain registered without authorization duplicating corporate trade dress.`,
      generatedAt: new Date(Date.now() - 280 * 60 * 1000).toISOString(),
      evidenceUrls: ['https://pay-synesis-checkout.app/portal'],
    },
    timeline: [
      {
        timestamp: new Date(Date.now() - 320 * 60 * 1000).toISOString(),
        event: 'Identified by weekly brand asset scan.',
        author: 'SYNESIS Brand Engine',
      },
      {
        timestamp: new Date(Date.now() - 250 * 60 * 1000).toISOString(),
        event: 'Executive council authorized registrar cease & desist.',
        author: 'General Counsel (gc-synesis)',
      },
    ],
  },
  {
    id: 'IMP-2026-640',
    domain: 'synesis-verify-card.cc',
    targetedBrand: 'Synesis Card Verification',
    riskScore: 99,
    riskLevel: 'critical',
    technique: 'Typosquatting',
    status: 'RESOLVED',
    discoveredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    registrar: 'Cloudflare, Inc.',
    nameservers: ['carl.ns.cloudflare.com', 'lola.ns.cloudflare.com'],
    ipAddress: '198.51.100.12',
    hostingCountry: 'Bulgaria (BG)',
    mxConfigured: false,
    sslIssuer: 'Cloudflare Origin CA',
    activePhishingPage: false,
    takedownNotice: {
      toEmail: 'abuse@cloudflare.com',
      abuseContact: 'Cloudflare Trust & Safety',
      subject: 'RESOLVED: Takedown of synesis-verify-card.cc Completed',
      legalBasis: 'ICANN Anti-Abuse Directive',
      body: `Registrar has terminated domain resolution and quarantined registrant account.`,
      generatedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      evidenceUrls: [],
    },
    timeline: [
      {
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        event: 'Severe phishing kit discovered.',
        author: 'SYNESIS Sentinel',
      },
      {
        timestamp: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
        event: 'Cloudflare Trust & Safety confirmed domain suspension.',
        author: 'Cloudflare API Sink',
      },
    ],
  },
];

function getStoredImpersonations(): ImpersonationDomainRecord[] {
  try {
    const raw = window.localStorage.getItem(BRAND_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(INITIAL_IMPERSONATION_DATA));
      return INITIAL_IMPERSONATION_DATA;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_IMPERSONATION_DATA;
  }
}

function saveStoredImpersonations(records: ImpersonationDomainRecord[]) {
  try {
    window.localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // ignore
  }
}

// ==========================================
// THREAT SEED DATA & STORAGE
// ==========================================

const INITIAL_THREAT_VECTORS: ThreatVectorRecord[] = [
  {
    id: 'THR-701',
    vectorType: 'Layer 7 HTTP Flood',
    targetedPath: '/api/v1/checkout/process-payment',
    severity: 'critical',
    activeStatus: 'ATTACK_IN_PROGRESS',
    peakRps: 4200,
    blockedRequests: 284000,
    firstDetectedAt: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
    sourceDistribution: [
      { asn: 'AS13335', organization: 'Cloud Provider Leased CIDR', country: 'RU', share: 48 },
      { asn: 'AS20940', organization: 'Akamai Distributed Tor Exits', country: 'NL', share: 26 },
      { asn: 'AS16276', organization: 'OVH Hosting SAS', country: 'FR', share: 18 },
      { asn: 'OTHER', organization: 'Residential Proxy Botnet', country: 'VARIOUS', share: 8 },
    ],
    mitigationRule: {
      id: 'MIT-WAF-09',
      ruleType: 'Managed Turnstile Challenge',
      threshold: '5 req/sec per IP on /checkout/*',
      enforced: true,
      lastUpdated: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 'THR-702',
    vectorType: 'Credential Stuffing',
    targetedPath: '/api/v1/auth/customer-token',
    severity: 'high',
    activeStatus: 'MITIGATED',
    peakRps: 1850,
    blockedRequests: 95400,
    firstDetectedAt: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
    sourceDistribution: [
      { asn: 'AS8075', organization: 'Compromised VPS Nodes', country: 'US', share: 64 },
      { asn: 'AS45102', organization: 'Alibaba Cloud Proxy Pool', country: 'CN', share: 36 },
    ],
    mitigationRule: {
      id: 'MIT-GEO-02',
      ruleType: 'WAF Rate Limit',
      threshold: '2 login attempts/min per fingerprint',
      enforced: true,
      lastUpdated: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  },
  {
    id: 'THR-703',
    vectorType: 'Payment Gateway Brute-Force',
    targetedPath: '/api/v1/gateways/primary/capture',
    severity: 'critical',
    activeStatus: 'ATTACK_IN_PROGRESS',
    peakRps: 890,
    blockedRequests: 42100,
    firstDetectedAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    sourceDistribution: [
      { asn: 'AS9009', organization: 'M247 Europe Rotated IPs', country: 'RO', share: 55 },
      { asn: 'AS49453', organization: 'Global Host Limited', country: 'BG', share: 45 },
    ],
    mitigationRule: {
      id: 'MIT-RATE-88',
      ruleType: 'ASN Block',
      threshold: 'Instant 403 on known card-testing heuristics',
      enforced: false, // Pending operator confirmation
      lastUpdated: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    },
  },
];

function getStoredThreatVectors(): ThreatVectorRecord[] {
  try {
    const raw = window.localStorage.getItem(THREAT_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(THREAT_STORAGE_KEY, JSON.stringify(INITIAL_THREAT_VECTORS));
      return INITIAL_THREAT_VECTORS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_THREAT_VECTORS;
  }
}

function saveStoredThreatVectors(vectors: ThreatVectorRecord[]) {
  try {
    window.localStorage.setItem(THREAT_STORAGE_KEY, JSON.stringify(vectors));
  } catch {
    // ignore
  }
}

// ==========================================
// REACT QUERY HOOKS
// ==========================================

export function useBrandProtectionQuery() {
  return useQuery<BrandProtectionSummary, ContinuumApiError>({
    queryKey: ['synesis', 'intelligence', 'brand-protection'],
    queryFn: async () => {
      // In production tries GET /api/v1/intelligence/brand-protection, otherwise returns stateful local data
      try {
        const remote = await apiRequest<BrandProtectionSummary>(
          '/api/v1/intelligence/brand-protection'
        );
        return remote;
      } catch {
        const items = getStoredImpersonations();
        const activeCount = items.filter(
          (i) => i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE'
        ).length;
        const pendingCount = items.filter(
          (i) => i.status === 'TAKEDOWN_DRAFTED' || i.status === 'APPROVED'
        ).length;
        const resolvedCount = items.filter((i) => i.status === 'RESOLVED').length;

        return {
          monitoredAssetsCount: 24,
          activeThreatCount: activeCount,
          pendingTakedownCount: pendingCount,
          resolvedTakedownsCount: resolvedCount,
          averageTakedownHours: 4.2,
          impersonations: items,
        };
      }
    },
    staleTime: 10_000,
  });
}

export function useUpdateTakedownStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    ImpersonationDomainRecord,
    ContinuumApiError,
    { id: string; nextStatus: TakedownStatus; comment?: string }
  >({
    mutationFn: async ({ id, nextStatus, comment }) => {
      try {
        return await apiRequest<ImpersonationDomainRecord>(
          `/api/v1/intelligence/brand-protection/${encodeURIComponent(id)}/status`,
          {
            method: 'POST',
            body: JSON.stringify({ status: nextStatus, comment }),
          }
        );
      } catch {
        const current = getStoredImpersonations();
        const foundIndex = current.findIndex((i) => i.id === id);
        if (foundIndex === -1) {
          throw new ContinuumApiError({
            message: `Impersonation record ${id} not found`,
            status: 404,
            endpoint: `/api/v1/intelligence/brand-protection/${encodeURIComponent(id)}/status`,
            isUnavailable: false,
          });
        }
        const updatedRecord = { ...current[foundIndex] };
        updatedRecord.status = nextStatus;
        updatedRecord.timeline.unshift({
          timestamp: new Date().toISOString(),
          event: comment || `Status transitioned to ${nextStatus.replace(/_/g, ' ')} by Operator.`,
          author: 'Reliability On-Call Lead',
        });
        current[foundIndex] = updatedRecord;
        saveStoredImpersonations(current);
        return updatedRecord;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synesis', 'intelligence', 'brand-protection'] });
    },
  });
}

export function useComplaintIntelligenceQuery(timeRange: string = '1h') {
  return useQuery<ComplaintIntelligencePayload, ContinuumApiError>({
    queryKey: ['synesis', 'intelligence', 'complaints', timeRange],
    queryFn: async () => {
      try {
        return await apiRequest<ComplaintIntelligencePayload>(
          `/api/v1/intelligence/complaints?range=${encodeURIComponent(timeRange)}`
        );
      } catch {
        // High fidelity complaint intelligence payload correlated with current checkout issues
        const now = Date.now();
        const trendSeries: ComplaintDataPoint[] = [];

        // Generate 12 intervals representing past hour
        for (let i = 11; i >= 0; i--) {
          const t = new Date(now - i * 5 * 60 * 1000);
          const timeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          // Surge peaks in recent 20 mins
          const isSurgePeriod = i <= 4;
          const baseline = 12 + Math.floor(Math.sin(i) * 3);
          const actual = isSurgePeriod
            ? baseline * (3.8 + (4 - i) * 0.4) + Math.floor(Math.random() * 5)
            : baseline + Math.floor(Math.random() * 4);
          const sentiment = isSurgePeriod ? -0.78 : -0.22;

          trendSeries.push({
            timestamp: timeStr,
            complaintVolume: Math.round(actual),
            baselineVolume: baseline,
            sentimentScore: sentiment,
            dominantCategory: isSurgePeriod ? 'Checkout Failure' : 'General Inquiry',
          });
        }

        const liveComplaints: CustomerComplaintItem[] = [
          {
            id: 'CMP-8901',
            source: 'X / Social Media',
            customerHandle: '@alex_m_tech',
            sentiment: 'severe_negative',
            category: 'Double Debit',
            snippet:
              'Your checkout page froze at 3D-Secure screen and timed out, but my bank notification shows $249 charged TWICE! Fix this immediately!!',
            timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
            correlatedJourney: 'Cart Checkout & Payment Capture Flow',
            correlatedIncidentId: 'INC-2026-081',
            impactScore: 94,
          },
          {
            id: 'CMP-8898',
            source: 'Zendesk Ticket',
            customerHandle: 'ticket-#49201 (usr_82*a)',
            sentiment: 'severe_negative',
            category: 'Checkout Failure',
            snippet:
              'Error 504 Gateway Timeout while submitting credit card on checkout. My cart is now completely emptied with no order confirmation.',
            timestamp: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
            correlatedJourney: 'Storefront Product Checkout',
            correlatedIncidentId: 'INC-2026-081',
            impactScore: 88,
          },
          {
            id: 'CMP-8874',
            source: 'Mobile App Review',
            customerHandle: 'AppStore: Sam_R',
            sentiment: 'negative',
            category: 'OTP Delay',
            snippet:
              'Payment SMS OTP arrived 6 minutes late after the timer expired. Tried 3 times and got locked out.',
            timestamp: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
            correlatedJourney: 'Member Quick-Pay Express',
            correlatedIncidentId: 'INC-2026-079',
            impactScore: 75,
          },
          {
            id: 'CMP-8842',
            source: 'In-App CSAT',
            customerHandle: 'Session #99014 (Guest)',
            sentiment: 'negative',
            category: 'Cart Eviction',
            snippet:
              'I spent 20 minutes picking items, clicked place order, spinning wheel spun forever, then returned to an empty cart.',
            timestamp: new Date(Date.now() - 29 * 60 * 1000).toISOString(),
            correlatedJourney: 'Storefront Product Checkout',
            correlatedIncidentId: 'INC-2026-081',
            impactScore: 82,
          },
        ];

        return {
          surgeMultiplier: 3.4, // +340% surge
          surgeStatus: 'CRITICAL_SURGE',
          currentRatePerHour: 64,
          baselineRatePerHour: 14,
          affectedJourneys: [
            'Cart Checkout & Payment Capture Flow',
            'Storefront Product Checkout',
          ],
          categories: [
            {
              name: 'Checkout & Gateway Failures',
              sharePercent: 62,
              deltaVsBaseline: 420,
              severity: 'critical',
            },
            {
              name: 'Duplicate Debits / Pre-Auth Holds',
              sharePercent: 24,
              deltaVsBaseline: 290,
              severity: 'critical',
            },
            {
              name: 'OTP & 3D-Secure Lag',
              sharePercent: 10,
              deltaVsBaseline: 45,
              severity: 'warning',
            },
            {
              name: 'Account & Login Inquiries',
              sharePercent: 4,
              deltaVsBaseline: -12,
              severity: 'info',
            },
          ],
          trendSeries,
          liveComplaints,
        };
      }
    },
    staleTime: 10_000,
  });
}

export function useThreatMonitoringQuery() {
  return useQuery<ThreatMonitoringPayload, ContinuumApiError>({
    queryKey: ['synesis', 'intelligence', 'threat-monitoring'],
    queryFn: async () => {
      try {
        return await apiRequest<ThreatMonitoringPayload>(
          '/api/v1/intelligence/threat-monitoring'
        );
      } catch {
        const vectors = getStoredThreatVectors();
        const now = Date.now();
        const trafficSeries: ThreatTrafficPoint[] = [];

        for (let i = 11; i >= 0; i--) {
          const t = new Date(now - i * 5 * 60 * 1000);
          const timeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const isAttack = i <= 5;
          const legit = 2200 + Math.floor(Math.random() * 300);
          const anomaly = isAttack ? 4800 + Math.floor(Math.random() * 800) : 120 + Math.floor(Math.random() * 50);
          const total = legit + anomaly;
          const botRatio = Math.round((anomaly / total) * 100);

          trafficSeries.push({
            timestamp: timeStr,
            totalRps: total,
            legitRps: legit,
            anomalyRps: anomaly,
            botRatio,
          });
        }

        const activeAttacks = vectors.filter((v) => v.activeStatus === 'ATTACK_IN_PROGRESS').length;

        return {
          overallThreatLevel: activeAttacks > 0 ? 'CRITICAL_ATTACK' : 'NORMAL',
          currentTotalRps: 7650,
          botPercentage: 62,
          mitigatedToday: 421500,
          activeAttacksCount: activeAttacks,
          trafficSeries,
          vectors,
        };
      }
    },
    staleTime: 10_000,
  });
}

export function useToggleThreatMitigationMutation() {
  const queryClient = useQueryClient();

  return useMutation<
    ThreatVectorRecord,
    ContinuumApiError,
    { vectorId: string; enforce: boolean }
  >({
    mutationFn: async ({ vectorId, enforce }) => {
      try {
        return await apiRequest<ThreatVectorRecord>(
          `/api/v1/intelligence/threat-monitoring/${encodeURIComponent(vectorId)}/mitigate`,
          {
            method: 'POST',
            body: JSON.stringify({ enforce }),
          }
        );
      } catch {
        const current = getStoredThreatVectors();
        const found = current.find((v) => v.id === vectorId);
        if (!found) {
          throw new ContinuumApiError({
            message: `Threat vector ${vectorId} not found`,
            status: 404,
            endpoint: `/api/v1/intelligence/threat-monitoring/${encodeURIComponent(vectorId)}/mitigate`,
            isUnavailable: false,
          });
        }
        found.mitigationRule.enforced = enforce;
        found.mitigationRule.lastUpdated = new Date().toISOString();
        if (enforce && found.activeStatus === 'ATTACK_IN_PROGRESS') {
          found.activeStatus = 'MITIGATED';
        } else if (!enforce && found.activeStatus === 'MITIGATED') {
          found.activeStatus = 'ATTACK_IN_PROGRESS';
        }
        saveStoredThreatVectors(current);
        return found;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['synesis', 'intelligence', 'threat-monitoring'] });
    },
  });
}

export function useIncidentCorrelationsQuery() {
  return useQuery<UnifiedIncidentCorrelation[], ContinuumApiError>({
    queryKey: ['synesis', 'intelligence', 'correlations'],
    queryFn: async () => {
      try {
        return await apiRequest<UnifiedIncidentCorrelation[]>(
          '/api/v1/intelligence/correlations'
        );
      } catch {
        const correlations: UnifiedIncidentCorrelation[] = [
          {
            correlationId: 'CORR-2026-101',
            primaryIncidentId: 'INC-2026-081',
            title: 'Cascading Payment Capture Outage & Distributed Bot Flood',
            severity: 'critical',
            firstObservedAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
            confidenceScore: 96,
            isResolved: false,
            synthesizedRootCause:
              'A targeted Layer-7 HTTP flood (4,200 RPS) against /checkout/process-payment exhausted connection pool capacity on Primary Gateway (PayEngine-Alpha), triggering 8,400ms p99 latency timeouts in synthetic journey validation. Concurrently, duplicate auth holds caused a 340% surge in Zendesk and Twitter complaints.',
            recommendedPlaybookId: 'PB-GATEWAY-FAILOVER-01',
            recommendedPlaybookName: 'Emergency Traffic Cutover to Secondary Gateway (PayShield-Beta)',
            signals: [
              {
                id: 'SIG-01',
                type: 'synthetic_journey',
                title: 'Checkout Payment Step Timeout (Execution #409)',
                metricDelta: 'Pass rate dropped 100% -> 0% (Timeout > 8000ms)',
                relationship: 'Confirmed',
                confidenceScore: 99,
                timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                evidence: 'Step 4 "Authorize Payment Token" timed out with HTTP 504. Socket disconnected.',
              },
              {
                id: 'SIG-02',
                type: 'infrastructure_latency',
                title: 'Primary Gateway (PayEngine-Alpha) Latency Spike',
                metricDelta: 'p99 latency 240ms -> 8,620ms (+3,490%)',
                relationship: 'Confirmed',
                confidenceScore: 98,
                timestamp: new Date(Date.now() - 29 * 60 * 1000).toISOString(),
                evidence: 'Upstream gateway TLS connection pool saturated with 1,024 queued requests.',
              },
              {
                id: 'SIG-03',
                type: 'threat_traffic',
                title: 'Distributed Layer 7 Bot Burst on /checkout/*',
                metricDelta: '+4,200 RPS from ASN 13335 (Cloud Proxies)',
                relationship: 'Confirmed',
                confidenceScore: 95,
                timestamp: new Date(Date.now() - 26 * 60 * 1000).toISOString(),
                evidence: 'Heuristic fingerprint shows automated card testing script targeting payment authorization.',
              },
              {
                id: 'SIG-04',
                type: 'complaint_surge',
                title: 'Customer Support Surge: "Charged Twice" & "Gateway Timeout"',
                metricDelta: '+340% volume surge in tickets & mentions',
                relationship: 'Correlated',
                confidenceScore: 92,
                timestamp: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
                evidence: '62 tickets logged within 15 minutes citing payment freezes and duplicated SMS debit alerts.',
              },
              {
                id: 'SIG-05',
                type: 'brand_phish',
                title: 'Fake Lookalike Domain syndicate-pay-portal.com Live',
                metricDelta: 'Risk Score 98/100 (Combo-squatting)',
                relationship: 'Suspected',
                confidenceScore: 78,
                timestamp: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
                evidence: 'Domain replica identified 18 minutes prior to traffic surge. May indicate coordinated phishing diversion.',
              },
            ],
          },
          {
            correlationId: 'CORR-2026-098',
            primaryIncidentId: 'INC-2026-079',
            title: 'Authentication Token Latency & Mobile CSAT Degradation',
            severity: 'high',
            firstObservedAt: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
            confidenceScore: 88,
            isResolved: false,
            synthesizedRootCause:
              'Redis session cache replication lag in EU-Central caused 1,200ms latency on /auth/token, correlating with slow OTP delivery and elevated mobile app negative reviews.',
            recommendedPlaybookId: 'PB-SESSION-DRAIN-02',
            recommendedPlaybookName: 'Flush Degraded Session Replicas & Failover to Primary Replica',
            signals: [
              {
                id: 'SIG-11',
                type: 'synthetic_journey',
                title: 'Member Login Journey Latency Jump',
                metricDelta: 'Auth Step duration 110ms -> 1,240ms',
                relationship: 'Confirmed',
                confidenceScore: 94,
                timestamp: new Date(Date.now() - 105 * 60 * 1000).toISOString(),
                evidence: 'Probe detected 9x slowdown during JWT key validation check.',
              },
              {
                id: 'SIG-12',
                type: 'complaint_surge',
                title: 'AppStore Negative Reviews on SMS OTP Delay',
                metricDelta: 'Negative sentiment increased to -0.62',
                relationship: 'Correlated',
                confidenceScore: 86,
                timestamp: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
                evidence: 'Customer complaints citing 6-minute delay in OTP arrival.',
              },
              {
                id: 'SIG-13',
                type: 'threat_traffic',
                title: 'Low-Volume Credential Stuffing on /auth/customer-token',
                metricDelta: '1,850 RPS credential testing attack',
                relationship: 'Correlated',
                confidenceScore: 89,
                timestamp: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
                evidence: 'Blocked by WAF Rate Limit rule MIT-GEO-02.',
              },
            ],
          },
        ];

        return correlations;
      }
    },
    staleTime: 10_000,
  });
}
