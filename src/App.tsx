import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShellProvider } from './context/ShellContext';
import { AppShell } from './components/layout/AppShell';
import { ALL_NAVIGATION_ITEMS } from './config/navigation';
import { FoundationRoutePage } from './pages/FoundationRoutePage';
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';
import { BusinessJourneysPage } from './pages/BusinessJourneysPage';
import { ExecutionsPage } from './pages/ExecutionsPage';
import { ServiceHealthPage } from './pages/ServiceHealthPage';
import { IncidentManagementPage } from './pages/IncidentManagementPage';
import { AiInsightsPage } from './pages/AiInsightsPage';
import { SignalsPage } from './pages/SignalsPage';
import { RecoveryCenterPage } from './pages/RecoveryCenterPage';
import { BrandProtectionPage } from './pages/BrandProtectionPage';
import { ComplaintIntelligencePage } from './pages/ComplaintIntelligencePage';
import { ThreatMonitoringPage } from './pages/ThreatMonitoringPage';
import { IncidentCorrelationPage } from './pages/IncidentCorrelationPage';
import { RootCauseAnalysisPage } from './pages/RootCauseAnalysisPage';
import { FailurePatternsPage } from './pages/FailurePatternsPage';
import { HistoricalRecordsPage } from './pages/HistoricalRecordsPage';
import { CountermeasurePlaybooksPage } from './pages/CountermeasurePlaybooksPage';
import { RecoveryExecutionsPage } from './pages/RecoveryExecutionsPage';
import { ApprovalQueuePage } from './pages/ApprovalQueuePage';
import { ReliabilityAnalyticsPage } from './pages/ReliabilityAnalyticsPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { BrandLoginPage } from './pages/BrandLoginPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
  },
});

const DEDICATED_ROUTE_PATHS = new Set([
  '/overview',
  '/command-center',
  '/monitoring/journeys',
  '/monitoring/service-health',
  '/monitoring/executions',
  '/monitoring/incidents',
  '/intelligence/insights',
  '/intelligence/signals',
  '/intelligence/brand-protection',
  '/intelligence/complaints',
  '/intelligence/threat-monitoring',
  '/intelligence/correlation',
  '/intelligence/incidents',
  '/intelligence/root-cause',
  '/intelligence/failure-patterns',
  '/recovery/center',
  '/recovery/playbooks',
  '/recovery/executions',
  '/recovery/approvals',
  '/reports/business',
  '/reports/history',
  '/analytics/reliability',
  '/analytics/history',
  '/system/integrations',
  '/system/settings',
  '/login',
  '/brand/login',
  '/brand/onboarding',
  '/brand/settings',
]);

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ShellProvider>
        <BrowserRouter>
          <Routes>
            {/* Standalone cinematic enterprise Landing Page & Brand Portal */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<BrandLoginPage />} />
            <Route path="/brand/login" element={<BrandLoginPage />} />
            <Route path="/brand/onboarding" element={<BrandLoginPage />} />

            {/* Operational Workspaces wrapped in AppShell */}
            <Route element={<AppShell />}>
              <Route path="/brand/settings" element={<BrandLoginPage />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/command-center" element={<OverviewPage />} />
              <Route path="/monitoring/journeys" element={<BusinessJourneysPage />} />
              <Route path="/monitoring/service-health" element={<ServiceHealthPage />} />
              <Route path="/monitoring/executions" element={<ExecutionsPage />} />
              <Route path="/monitoring/incidents" element={<IncidentManagementPage />} />
              
              {/* Intelligence Hub & Dedicated Sub-Views */}
              <Route path="/intelligence/insights" element={<AiInsightsPage />} />
              <Route path="/intelligence/signals" element={<SignalsPage />} />
              <Route path="/intelligence/brand-protection" element={<BrandProtectionPage />} />
              <Route path="/intelligence/complaints" element={<ComplaintIntelligencePage />} />
              <Route path="/intelligence/threat-monitoring" element={<ThreatMonitoringPage />} />
              <Route path="/intelligence/correlation" element={<IncidentCorrelationPage />} />
              <Route path="/intelligence/incidents" element={<IncidentManagementPage />} />
              <Route path="/intelligence/root-cause" element={<RootCauseAnalysisPage />} />
              <Route path="/intelligence/failure-patterns" element={<FailurePatternsPage />} />

              {/* Recovery Hub & Approvals */}
              <Route path="/recovery/center" element={<RecoveryCenterPage />} />
              <Route path="/recovery/playbooks" element={<CountermeasurePlaybooksPage />} />
              <Route path="/recovery/executions" element={<RecoveryExecutionsPage />} />
              <Route path="/recovery/approvals" element={<ApprovalQueuePage />} />

              {/* Reports Hub */}
              <Route path="/reports/business" element={<ReliabilityAnalyticsPage />} />
              <Route path="/reports/history" element={<HistoricalRecordsPage />} />
              <Route path="/analytics/reliability" element={<ReliabilityAnalyticsPage />} />
              <Route path="/analytics/history" element={<HistoricalRecordsPage />} />

              {/* Settings Hub */}
              <Route path="/system/integrations" element={<IntegrationsPage />} />
              <Route path="/system/settings" element={<SettingsPage />} />

              {ALL_NAVIGATION_ITEMS.filter(
                (item) => !DEDICATED_ROUTE_PATHS.has(item.path)
              ).map((item) => (
                <Route
                  key={item.id}
                  path={item.path}
                  element={<FoundationRoutePage item={item} />}
                />
              ))}
              <Route path="*" element={<Navigate to="/overview" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ShellProvider>
    </QueryClientProvider>
  );
};

export default App;
