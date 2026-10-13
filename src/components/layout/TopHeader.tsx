import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  Clock,
  Command,
  Keyboard,
  Menu,
  PanelLeft,
  Plug,
  Search,
  Settings,
  UserCheck,
} from 'lucide-react';
import { findNavigationItemByPath } from '../../config/navigation';
import { useShell } from '../../context/ShellContext';
import { TIME_RANGE_OPTIONS } from '../../styles/tokens';
import { useIncidentsListQuery } from '../../api/incidentsAndRca';
import { useApprovalQueueQuery, useRecoveryExecutionsQuery } from '../../api/recovery';
import { Badge, MonoCode } from '../ui/Badge';
import { DropdownMenu } from '../ui/Dropdown';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';

export interface OperationalNotificationItem {
  id: string;
  title: string;
  subtitle: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  link: string;
}

export const TopHeader: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isSidebarCollapsed,
    toggleSidebar,
    setMobileSidebarOpen,
    timeRange,
    setTimeRange,
    setSearchDialogOpen,
  } = useShell();
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Operational event queries for live notifications
  const incidentsQuery = useIncidentsListQuery(timeRange);
  const approvalsQuery = useApprovalQueueQuery(timeRange);
  const recoveryQuery = useRecoveryExecutionsQuery(timeRange);

  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem('continuum.dismissed_notifications');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const liveNotifications = useMemo<OperationalNotificationItem[]>(() => {
    const items: OperationalNotificationItem[] = [];

    // Critical/High open incidents
    (incidentsQuery.data ?? []).forEach((inc) => {
      const isCriticalOrHigh =
        inc.severity === 'critical' ||
        inc.severity === 'sev1' ||
        inc.severity === 'high' ||
        inc.severity === 'sev2';
      const isOpen = inc.status === 'open' || inc.status === 'investigating';
      if (isCriticalOrHigh && isOpen) {
        items.push({
          id: `notif-inc-${inc.id}`,
          title: `${inc.severity.toUpperCase()}: ${inc.title}`,
          subtitle: `Target: ${inc.affectedJourneyName || inc.affectedServiceName || 'System'}`,
          severity: inc.severity === 'critical' || inc.severity === 'sev1' ? 'critical' : 'warning',
          timestamp: inc.latestUpdateAt || inc.firstSeenAt,
          link: `/intelligence/incidents?incidentId=${encodeURIComponent(inc.id)}`,
        });
      }
    });

    // Pending approvals
    (approvalsQuery.data ?? []).forEach((appr) => {
      if (appr.status === 'pending') {
        items.push({
          id: `notif-appr-${appr.id}`,
          title: `Approval Required: ${appr.playbookName}`,
          subtitle: `Blast: ${appr.blastRadius.toUpperCase()} • Incident: ${appr.incidentId}`,
          severity: appr.blastRadius === 'high' ? 'critical' : 'warning',
          timestamp: appr.requestedAt,
          link: `/recovery/approvals?approvalId=${encodeURIComponent(appr.id)}`,
        });
      }
    });

    // Failed or rolled back recovery actions
    (recoveryQuery.data ?? []).forEach((rec) => {
      if (rec.status === 'failed' || rec.status === 'rolled_back') {
        items.push({
          id: `notif-rec-${rec.id}`,
          title: `Recovery ${rec.status === 'failed' ? 'Failed' : 'Rolled Back'}: ${rec.playbookName}`,
          subtitle: `Incident: ${rec.incidentId}`,
          severity: 'critical',
          timestamp: rec.completedAt || rec.startedAt,
          link: `/recovery/executions?actionRunId=${encodeURIComponent(rec.id)}`,
        });
      }
    });

    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [incidentsQuery.data, approvalsQuery.data, recoveryQuery.data]);

  const activeUnreadNotifications = useMemo(() => {
    return liveNotifications.filter((n: OperationalNotificationItem) => !dismissedNotificationIds.has(n.id));
  }, [liveNotifications, dismissedNotificationIds]);

  const handleDismissAll = () => {
    const updated = new Set([...dismissedNotificationIds, ...liveNotifications.map((n: OperationalNotificationItem) => n.id)]);
    setDismissedNotificationIds(updated);
    try {
      window.localStorage.setItem('continuum.dismissed_notifications', JSON.stringify(Array.from(updated)));
    } catch {
      // ignore
    }
  };

  const currentNav = findNavigationItemByPath(location.pathname);
  const sectionTitle = currentNav?.section ?? 'Navigation';
  const pageTitle = currentNav?.label ?? 'Unregistered Route';

  const selectedTimeRangeOption =
    TIME_RANGE_OPTIONS.find((opt) => opt.value === timeRange) ?? TIME_RANGE_OPTIONS[1];

  return (
    <>
      <header className="sticky top-0 z-30 h-14 bg-surface-ivory/90 backdrop-blur-md border-b border-border-warm/90 px-4 lg:px-6 flex items-center justify-between gap-4 shadow-[0_1px_4px_rgba(36,21,28,0.03)]">
        {/* Left: Mobile Menu + Desktop Sidebar Toggle + Breadcrumbs + Page Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open navigation menu"
            className="lg:hidden p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary border border-border-warm"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Desktop Sidebar Toggle Button */}
          <Tooltip
            content={isSidebarCollapsed ? 'Expand sidebar sideways (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            side="bottom"
          >
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:flex p-1.5 rounded-lg text-ink-secondary hover:text-burgundy hover:bg-surface-secondary/80 border border-border-warm/90 transition-all items-center justify-center shrink-0 cursor-pointer shadow-depth-sm hover:shadow-subtle"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </Tooltip>

          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11px]">
              <Link
                to="/"
                className="text-ink-secondary hover:text-burgundy transition-colors font-medium flex items-center gap-1"
              >
                <span>SYNESIS</span>
                <span className="text-[9px] px-1 py-0.2 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">’26</span>
              </Link>
              <ChevronRight className="w-3 h-3 text-ink-secondary/60 shrink-0" aria-hidden="true" />
              <span className="text-ink-secondary font-medium truncate">{sectionTitle}</span>
              <ChevronRight className="w-3 h-3 text-ink-secondary/60 shrink-0" aria-hidden="true" />
              <span className="text-burgundy font-semibold truncate" aria-current="page">
                {pageTitle}
              </span>
            </nav>

            <div className="flex items-center gap-2">
              <h1 className="font-heading text-sm sm:text-base font-bold text-ink-primary tracking-tight truncate">
                {pageTitle}
              </h1>
              <div className="hidden xl:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-status-healthy/10 border border-status-healthy/25 text-[10px] font-semibold text-status-healthy">
                <span className="beacon-dot bg-status-healthy" />
                Mesh Synchronized
              </div>
            </div>
          </div>
        </div>

        {/* Right: Global Search, Time-Range Selector, Notifications, Profile Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Global Search Trigger */}
          <Tooltip content="Jump to route or search modules (Ctrl+K)" side="bottom">
            <button
              type="button"
              onClick={() => setSearchDialogOpen(true)}
              aria-label="Open global search and route command palette"
              className="h-8 px-2.5 sm:px-3 rounded-lg bg-surface-offwhite hover:bg-white border border-border-warm text-xs text-ink-secondary flex items-center gap-2 transition-all shadow-depth-sm hover:border-burgundy/40"
            >
              <Search className="w-3.5 h-3.5 text-ink-secondary shrink-0" aria-hidden="true" />
              <span className="hidden md:inline text-ink-secondary/90 pr-3">
                Search routes, IDs, playbooks...
              </span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-white text-ink-secondary rounded border border-border-warm shadow-subtle">
                <Command className="w-2.5 h-2.5" aria-hidden="true" />K
              </kbd>
            </button>
          </Tooltip>

          {/* Time-Range Selector */}
          <DropdownMenu
            ariaLabel="Time range selector"
            widthClass="w-56"
            header={
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink-primary">Evaluation Window</span>
                <MonoCode>{timeRange}</MonoCode>
              </div>
            }
            trigger={
              <button
                type="button"
                aria-label={`Selected time range: ${selectedTimeRangeOption.label}`}
                className="h-8 px-2.5 rounded-md bg-surface-ivory hover:bg-surface-secondary/70 border border-border-warm text-xs font-medium text-ink-primary flex items-center gap-1.5 transition-colors"
              >
                <Clock className="w-3.5 h-3.5 text-burgundy shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{selectedTimeRangeOption.label}</span>
                <span className="sm:hidden font-mono">{selectedTimeRangeOption.shortLabel}</span>
              </button>
            }
            items={TIME_RANGE_OPTIONS.map((option) => ({
              id: option.value,
              label: option.label,
              badge: (
                <Badge
                  variant={option.value === timeRange ? 'burgundy' : 'neutral'}
                  mono
                >
                  {option.shortLabel}
                </Badge>
              ),
              onSelect: () => setTimeRange(option.value),
            }))}
          />

          {/* Notifications Dropdown */}
          <DropdownMenu
            ariaLabel="System notifications"
            widthClass="w-88"
            header={
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink-primary">Operational Notifications</span>
                <Badge variant={activeUnreadNotifications.length > 0 ? 'critical' : 'healthy'} dot>
                  {activeUnreadNotifications.length > 0
                    ? `${activeUnreadNotifications.length} Actionable`
                    : 'Stream Clear'}
                </Badge>
              </div>
            }
            trigger={
              <button
                type="button"
                aria-label="View notifications"
                className="relative h-8 w-8 rounded-md bg-surface-ivory hover:bg-surface-secondary/70 border border-border-warm flex items-center justify-center text-ink-secondary hover:text-ink-primary transition-colors"
              >
                <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                {activeUnreadNotifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-status-critical text-surface-ivory rounded-full text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {activeUnreadNotifications.length}
                  </span>
                )}
              </button>
            }
            footer={
              <div className="flex items-center justify-between text-[11px] text-ink-secondary w-full">
                <span>Source: Live Telemetry Stream</span>
                {activeUnreadNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDismissAll}
                    className="text-burgundy hover:underline font-medium"
                  >
                    Dismiss All
                  </button>
                )}
              </div>
            }
          >
            {activeUnreadNotifications.length > 0 ? (
              <div className="max-h-72 overflow-y-auto divide-y divide-border-warm">
                {activeUnreadNotifications.map((notif: OperationalNotificationItem) => (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => navigate(notif.link)}
                    className="w-full text-left p-3 hover:bg-surface-cream transition-colors flex items-start gap-2.5"
                  >
                    <Badge variant={notif.severity} className="mt-0.5 shrink-0">
                      {notif.severity.toUpperCase()}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-ink-primary truncate">
                        {notif.title}
                      </div>
                      <div className="text-[11px] text-ink-secondary truncate">
                        {notif.subtitle}
                      </div>
                      <div className="text-[10px] text-ink-secondary font-mono mt-0.5">
                        {new Date(notif.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center space-y-1.5">
                <div className="text-xs font-medium text-ink-primary">
                  All operational streams clear in {timeRange}
                </div>
                <p className="text-[11px] text-ink-secondary leading-relaxed">
                  Zero unacknowledged incidents or pending recovery approvals. SYNESIS does not fabricate alerts.
                </p>
              </div>
            )}
          </DropdownMenu>

          {/* Operator Profile Controls */}
          <DropdownMenu
            ariaLabel="Operator profile and session controls"
            widthClass="w-64"
            header={
              <div>
                <div className="font-semibold text-ink-primary">Reliability Operator</div>
                <div className="text-[11px] text-ink-secondary font-mono mt-0.5">
                  role: sre-oncall-lead
                </div>
              </div>
            }
            trigger={
              <button
                type="button"
                aria-label="Operator profile controls"
                className="h-8 pl-2 pr-2.5 rounded-md bg-surface-ivory hover:bg-surface-secondary/70 border border-border-warm flex items-center gap-2 text-xs font-medium text-ink-primary transition-colors"
              >
                <span className="w-5 h-5 rounded bg-burgundy text-surface-ivory font-heading text-[11px] font-bold flex items-center justify-center">
                  OP
                </span>
                <span className="hidden xl:inline text-xs">On-Call Lead</span>
              </button>
            }
            items={[
              {
                id: 'profile-integrations',
                label: 'External Integrations',
                description: 'Manage webhooks, alert sinks & probes',
                icon: <Plug className="w-3.5 h-3.5" />,
                onSelect: () => navigate('/system/integrations'),
              },
              {
                id: 'profile-settings',
                label: 'Platform Settings',
                description: 'Guardrail policies & API configuration',
                icon: <Settings className="w-3.5 h-3.5" />,
                onSelect: () => navigate('/system/settings'),
              },
              {
                id: 'profile-shortcuts',
                label: 'Keyboard Navigation',
                description: 'View accessibility & shell shortcuts',
                icon: <Keyboard className="w-3.5 h-3.5" />,
                onSelect: () => setIsShortcutsOpen(true),
              },
            ]}
            footer={
              <div className="flex items-center justify-between text-[11px] text-ink-secondary">
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3 h-3 text-status-healthy" />
                  Local Workspace Session
                </span>
                <MonoCode>v0.1.0</MonoCode>
              </div>
            }
          />
        </div>
      </header>

      {/* Keyboard Shortcuts Reference Dialog */}
      <Dialog
        open={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
        title="Keyboard Navigation & Accessibility"
        description="SYNESIS supports full keyboard-first navigation for incident response workflows."
        size="sm"
        footer={
          <Button variant="secondary" size="sm" onClick={() => setIsShortcutsOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between py-1.5 border-b border-border-warm">
            <span className="text-ink-primary font-medium">Open Global Route &amp; Command Search</span>
            <MonoCode>Ctrl + K</MonoCode>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-border-warm">
            <span className="text-ink-primary font-medium">Toggle Sidebar Collapse</span>
            <MonoCode>Ctrl + B</MonoCode>
          </div>
          <div className="flex items-center justify-between py-1.5 border-b border-border-warm">
            <span className="text-ink-primary font-medium">Close Active Dialog or Menu</span>
            <MonoCode>Escape</MonoCode>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-ink-primary font-medium">Navigate Interactive Controls</span>
            <MonoCode>Tab / Shift + Tab</MonoCode>
          </div>
        </div>
      </Dialog>
    </>
  );
};
