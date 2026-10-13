import React, { useId, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Globe,
  Lock,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import type { TimeRangeValue } from '../styles/tokens';
import {
  DEFAULT_USER_PREFERENCES,
  loadStoredUserPreferences,
  saveStoredUserPreferences,
  type PlatformPolicyConfig,
  type UserPreferences,
  usePlatformPoliciesQuery,
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
  FormField,
  MonoCode,
  Select,
  Switch,
} from '../components/ui';

export const SettingsPage: React.FC = () => {
  const { timeRange, setTimeRange } = useShell();

  // Local user preferences state
  const [preferences, setPreferences] = useState<UserPreferences>(loadStoredUserPreferences);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Consequential change confirmation dialog
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [policyInspectorItem, setPolicyInspectorItem] =
    useState<PlatformPolicyConfig | null>(null);

  const policiesQuery = usePlatformPoliciesQuery();
  const platformPolicies = policiesQuery.data ?? [];

  const timeZoneId = useId();
  const dateFormatId = useId();
  const dashboardDefaultId = useId();
  const refreshIntervalId = useId();

  const handlePreferenceChange = <K extends keyof UserPreferences>(
    key: K,
    val: UserPreferences[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [key]: val }));
    setHasUnsavedChanges(true);
    setSaveSuccessMessage(null);
  };

  const handleSavePreferences = () => {
    saveStoredUserPreferences(preferences);
    // Also sync the shell's active time range if default changed
    if (preferences.defaultDashboardWindow !== timeRange) {
      setTimeRange(preferences.defaultDashboardWindow);
    }
    setHasUnsavedChanges(false);
    setSaveSuccessMessage(
      'Preferences saved successfully to browser local profile (client-side storage). Changes are active immediately.'
    );
    window.setTimeout(() => setSaveSuccessMessage(null), 5000);
  };

  const handleResetToDefaults = () => {
    setPreferences(DEFAULT_USER_PREFERENCES);
    saveStoredUserPreferences(DEFAULT_USER_PREFERENCES);
    setTimeRange(DEFAULT_USER_PREFERENCES.defaultDashboardWindow);
    setHasUnsavedChanges(false);
    setConfirmResetOpen(false);
    setSaveSuccessMessage('All preferences reset to factory defaults.');
    window.setTimeout(() => setSaveSuccessMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-warm pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink-primary font-heading">
              Platform Settings &amp; Preferences
            </h1>
            <Badge variant="healthy">Client Profile Active</Badge>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Operator display preferences, time zone localization, refresh intervals, and reliability guardrail policies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirmResetOpen(true)}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset Defaults
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSavePreferences}
            disabled={!hasUnsavedChanges}
          >
            <Save className="w-3.5 h-3.5 mr-1" />
            Save Preferences
          </Button>
        </div>
      </div>

      {/* Save feedback banner */}
      {saveSuccessMessage && (
        <div className="p-3.5 bg-surface-cream border border-status-healthy/40 rounded-lg text-xs text-ink-primary flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-status-healthy shrink-0" />
          <span className="font-medium">{saveSuccessMessage}</span>
        </div>
      )}

      {/* Unsaved changes prompt */}
      {hasUnsavedChanges && (
        <div className="p-3 bg-surface-ivory border border-burgundy-accent/40 rounded-lg text-xs text-burgundy-primary flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 text-burgundy-primary shrink-0" />
            <span>You have unsaved preference changes. Click "Save Preferences" to persist them.</span>
          </div>
          <Button size="sm" variant="primary" onClick={handleSavePreferences}>
            Save Now
          </Button>
        </div>
      )}

      {/* Preferences Section: Localization & Dashboards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Localization &amp; Chronology
                </CardTitle>
                <CardDescription>
                  Configure timestamp display formats and operational time zones
                </CardDescription>
              </div>
              <Globe className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              label="Operator Time Zone"
              htmlFor={timeZoneId}
              helperText="All telemetry charts and execution timestamps render in this selected zone."
            >
              <Select
                id={timeZoneId}
                options={[
                  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
                  { value: 'America/New_York', label: 'America/New_York (US Eastern)' },
                  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
                  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST)' },
                  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
                ]}
                value={preferences.timeZone}
                onChange={(e) =>
                  handlePreferenceChange(
                    'timeZone',
                    e.target.value as UserPreferences['timeZone']
                  )
                }
              />
            </FormField>

            <FormField
              label="Date Display Format"
              htmlFor={dateFormatId}
              helperText="Determines formatting in tables and historical CSV export filenames."
            >
              <Select
                id={dateFormatId}
                options={[
                  { value: 'ISO-8601', label: 'ISO-8601 (YYYY-MM-DD HH:mm:ss)' },
                  { value: 'Locale', label: 'Locale Specific (e.g. 10/13/2026, 11:45 AM)' },
                  { value: 'Relative', label: 'Relative (e.g. 5 minutes ago, 2 hours ago)' },
                ]}
                value={preferences.dateFormat}
                onChange={(e) =>
                  handlePreferenceChange(
                    'dateFormat',
                    e.target.value as UserPreferences['dateFormat']
                  )
                }
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Dashboard &amp; Telemetry Cadence
                </CardTitle>
                <CardDescription>
                  Telemetry query windows and automatic polling frequency
                </CardDescription>
              </div>
              <Clock className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              label="Default Telemetry Evaluation Window"
              htmlFor={dashboardDefaultId}
              helperText="Initial window applied when launching the Command Center and Analytics."
            >
              <Select
                id={dashboardDefaultId}
                options={[
                  { value: '15m', label: 'Last 15 minutes' },
                  { value: '1h', label: 'Last 1 hour (Recommended)' },
                  { value: '6h', label: 'Last 6 hours' },
                  { value: '24h', label: 'Last 24 hours' },
                  { value: '7d', label: 'Last 7 days' },
                  { value: '30d', label: 'Last 30 days' },
                ]}
                value={preferences.defaultDashboardWindow}
                onChange={(e) =>
                  handlePreferenceChange(
                    'defaultDashboardWindow',
                    e.target.value as TimeRangeValue
                  )
                }
              />
            </FormField>

            <FormField
              label="Auto-Refresh Interval"
              htmlFor={refreshIntervalId}
              helperText="Background polling frequency for synthetic runs and incidents."
            >
              <Select
                id={refreshIntervalId}
                options={[
                  { value: '0', label: 'Disabled (Manual Refresh Only)' },
                  { value: '15', label: 'Every 15 seconds' },
                  { value: '30', label: 'Every 30 seconds' },
                  { value: '60', label: 'Every 60 seconds' },
                ]}
                value={String(preferences.autoRefreshIntervalSeconds)}
                onChange={(e) =>
                  handlePreferenceChange(
                    'autoRefreshIntervalSeconds',
                    Number(e.target.value) as UserPreferences['autoRefreshIntervalSeconds']
                  )
                }
              />
            </FormField>
          </CardContent>
        </Card>
      </div>

      {/* Notifications & Display Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Operator Alerts &amp; Notifications
                </CardTitle>
                <CardDescription>
                  In-browser notifications for active reliability incidents
                </CardDescription>
              </div>
              <Bell className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md bg-surface-cream border border-border-warm">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-medium text-ink-primary">
                  Critical SEV-1 Audio Tone
                </div>
                <div className="text-[11px] text-ink-secondary">
                  Audible chime when a new SEV-1 incident is opened.
                </div>
              </div>
              <Switch
                checked={preferences.alertSoundEnabled}
                onChange={(checked) => handlePreferenceChange('alertSoundEnabled', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-surface-cream border border-border-warm">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-medium text-ink-primary">
                  Pending Approval Banner
                </div>
                <div className="text-[11px] text-ink-secondary">
                  High-priority banner for recovery actions requiring operator authorization.
                </div>
              </div>
              <Switch
                checked={preferences.notifyOnPendingApproval}
                onChange={(checked) =>
                  handlePreferenceChange('notifyOnPendingApproval', checked)
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Interface &amp; Density
                </CardTitle>
                <CardDescription>
                  Table density and visual risk indicators
                </CardDescription>
              </div>
              <SlidersHorizontal className="w-4 h-4 text-burgundy-accent" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md bg-surface-cream border border-border-warm">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-medium text-ink-primary">
                  High Blast-Radius Accentuation
                </div>
                <div className="text-[11px] text-ink-secondary">
                  Highlight recovery playbooks and approval requests with critical borders.
                </div>
              </div>
              <Switch
                checked={preferences.highlightHighBlastRadius}
                onChange={(checked) =>
                  handlePreferenceChange('highlightHighBlastRadius', checked)
                }
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-surface-cream border border-border-warm">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-medium text-ink-primary">
                  Compact Table Density
                </div>
                <div className="text-[11px] text-ink-secondary">
                  Reduce row padding in executions and incident ledgers for high-density monitors.
                </div>
              </div>
              <Switch
                checked={preferences.compactTableDensity}
                onChange={(checked) =>
                  handlePreferenceChange('compactTableDensity', checked)
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Platform Policies Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-semibold text-ink-primary">
                  Platform Reliability Guardrail Policies
                </CardTitle>
                <Badge variant="warning">Backend Enforced</Badge>
              </div>
              <CardDescription>
                Server-side safety rules, payment timeout quarantines, and dual-operator quorum requirements
              </CardDescription>
            </div>
            <div className="text-xs text-ink-secondary flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-ink-secondary" />
              <span>Policies require Security Operations authorization to modify</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            caption="Server-side reliability policy rules"
            columns={[
              {
                key: 'name',
                header: 'Policy Rule & Description',
                render: (row) => {
                  const p = row as unknown as PlatformPolicyConfig;
                  return (
                    <div className="space-y-0.5">
                      <div className="font-medium text-ink-primary">{p.name}</div>
                      <div className="text-[11px] text-ink-secondary">{p.description}</div>
                      <div className="text-[11px] text-ink-secondary font-mono">{p.policyKey}</div>
                    </div>
                  );
                },
              },
              {
                key: 'scope',
                header: 'Domain Scope',
                render: (row) => {
                  const p = row as unknown as PlatformPolicyConfig;
                  return <Badge variant="neutral">{p.scope.toUpperCase()}</Badge>;
                },
              },
              {
                key: 'value',
                header: 'Configured Value',
                render: (row) => {
                  const p = row as unknown as PlatformPolicyConfig;
                  return (
                    <span className="font-mono text-xs font-semibold text-ink-primary">
                      {String(p.value)}
                    </span>
                  );
                },
              },
              {
                key: 'enforcement',
                header: 'Enforcement State',
                render: (row) => {
                  const p = row as unknown as PlatformPolicyConfig;
                  return (
                    <Badge variant={p.enforcement === 'enforced' ? 'healthy' : 'warning'} dot>
                      {p.enforcement === 'enforced' ? 'Strictly Enforced' : 'Advisory / Audit'}
                    </Badge>
                  );
                },
              },
              {
                key: 'modified',
                header: 'Last Modified',
                render: (row) => {
                  const p = row as unknown as PlatformPolicyConfig;
                  return (
                    <div className="space-y-0.5 text-xs">
                      <div className="text-ink-secondary font-mono text-[11px]">
                        {new Date(p.modifiedAt).toLocaleDateString()}
                      </div>
                      <div className="text-[11px] text-ink-secondary">{p.modifiedBy}</div>
                    </div>
                  );
                },
              },
              {
                key: 'action',
                header: 'Audit',
                align: 'right',
                render: (row) => {
                  const p = row as unknown as PlatformPolicyConfig;
                  return (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPolicyInspectorItem(p)}
                    >
                      Inspect Policy
                    </Button>
                  );
                },
              },
            ]}
            data={platformPolicies as unknown as Record<string, unknown>[]}
            rowKey={(r) => String(r.policyKey)}
          />
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Resetting Settings */}
      <Dialog
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Confirm Preference Reset"
        description="Are you sure you want to revert all operator settings to factory defaults?"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="secondary" size="sm" onClick={() => setConfirmResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="critical" size="sm" onClick={handleResetToDefaults}>
              Revert to Factory Defaults
            </Button>
          </div>
        }
      >
        <div className="p-3 bg-red-50 border border-status-critical/30 rounded text-xs text-status-critical space-y-2">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Consequential Preference Reversion
          </div>
          <p>
            This action will reset your active time zone, date formatting, auto-refresh intervals, and
            audio notification toggles stored in this browser profile.
          </p>
        </div>
      </Dialog>

      {/* Policy Inspector Dialog */}
      {policyInspectorItem && (
        <Dialog
          open={Boolean(policyInspectorItem)}
          onClose={() => setPolicyInspectorItem(null)}
          title={`Policy Specification: ${policyInspectorItem.name}`}
          description={`Immutable audit record for ${policyInspectorItem.policyKey}.`}
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-ink-secondary flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-ink-secondary" />
                <span>Read-Only Policy Audit Record</span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setPolicyInspectorItem(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-surface-cream rounded border border-border-warm space-y-1">
              <div className="font-semibold text-ink-primary">{policyInspectorItem.name}</div>
              <p className="text-ink-secondary leading-relaxed">{policyInspectorItem.description}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-surface-ivory rounded border border-border-warm">
                <span className="text-ink-secondary">Policy Key:</span>
                <MonoCode>{policyInspectorItem.policyKey}</MonoCode>
              </div>
              <div className="flex items-center justify-between p-2 bg-surface-ivory rounded border border-border-warm">
                <span className="text-ink-secondary">Enforced Value:</span>
                <span className="font-mono font-bold text-ink-primary">
                  {String(policyInspectorItem.value)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-surface-ivory rounded border border-border-warm">
                <span className="text-ink-secondary">Default Baseline:</span>
                <span className="font-mono text-ink-secondary">
                  {String(policyInspectorItem.defaultValue)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-surface-ivory rounded border border-border-warm">
                <span className="text-ink-secondary">Authorized By:</span>
                <span className="font-medium text-ink-primary">{policyInspectorItem.modifiedBy}</span>
              </div>
            </div>

            <div className="p-3 bg-surface-ivory rounded border border-border-warm text-ink-secondary leading-relaxed">
              <strong>Operational Guardrail Notice:</strong> Modifying platform guardrails requires elevated SecOps authorization
              and peer-reviewed policy pull requests to the Continuum infrastructure repository. Changes cannot be bypassed through the client UI.
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};

export default SettingsPage;
