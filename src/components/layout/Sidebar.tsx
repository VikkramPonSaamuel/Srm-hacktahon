import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Palette,
  Radio,
  X,
} from 'lucide-react';
import { NAVIGATION_SECTIONS } from '../../config/navigation';
import { useShell } from '../../context/ShellContext';
import { useBackendHealthQuery } from '../../api/client';
import { Tooltip } from '../ui/Tooltip';
import { Badge } from '../ui/Badge';

export const Sidebar: React.FC = () => {
  const {
    isSidebarCollapsed,
    toggleSidebar,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    brandProfile,
  } = useShell();
  const location = useLocation();
  const healthQuery = useBackendHealthQuery();

  const isBackendConnected = healthQuery.isSuccess && !healthQuery.isError;

  const renderSidebarContent = (collapsed: boolean, isMobile = false) => (
    <div className="flex flex-col h-full bg-surface-ivory border-r border-border-warm select-none">
      {/* Brand Header */}
      <div
        className={[
          'h-14 border-b border-border-warm flex items-center shrink-0',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        ].join(' ')}
      >
        <Link to="/login" className="flex items-center gap-2.5 min-w-0 group" title="Open Brand Identity Portal">
          <div
            style={{ backgroundColor: brandProfile.primaryColor || '#6D1735' }}
            className="w-8 h-8 rounded-md text-surface-ivory flex items-center justify-center shrink-0 shadow-subtle border border-black/10 overflow-hidden transition-transform group-hover:scale-105"
            aria-hidden="true"
          >
            {brandProfile.logoUrl ? (
              <img
                src={brandProfile.logoUrl}
                alt={brandProfile.brandName}
                className="w-full h-full object-contain p-0.5"
              />
            ) : (
              <span className="font-heading font-black text-xs text-white">
                {brandProfile.brandName.charAt(0) || 'S'}
              </span>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div
                style={{ fontFamily: brandProfile.fontFamily }}
                className="font-heading text-sm font-bold text-ink-primary tracking-tight truncate flex items-center gap-1.5"
              >
                {brandProfile.brandName || 'SYNESIS'}
              </div>
              <div className="text-[10px] font-medium text-ink-secondary uppercase tracking-wider truncate">
                {brandProfile.primaryDomain || 'Autonomous Recovery'}
              </div>
            </div>
          )}
        </Link>

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 rounded text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          !collapsed && (
            <Tooltip content="Collapse sidebar (Ctrl+B)" side="right">
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
                className="p-1 rounded text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </Tooltip>
          )
        )}
      </div>

      {/* Navigation Sections */}
      <nav
        aria-label="Primary platform navigation"
        className="flex-1 overflow-y-auto py-3 px-2.5 space-y-4"
      >
        {/* Quick Expand Button at the very top of collapsed sidebar */}
        {collapsed && !isMobile && (
          <div className="flex justify-center pb-2 border-b border-border-warm/70 mb-2">
            <Tooltip content="Expand sidebar sideways (Ctrl+B)" side="right">
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Expand sidebar sideways"
                className="w-10 h-8 rounded-lg bg-burgundy/10 text-burgundy hover:bg-burgundy hover:text-white flex items-center justify-center transition-all shadow-subtle border border-burgundy/25 cursor-pointer"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        )}

        {NAVIGATION_SECTIONS.map((section) => (
          <div key={section.id} role="group" aria-labelledby={`nav-group-${section.id}`}>
            {!collapsed ? (
              <div
                id={`nav-group-${section.id}`}
                className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-secondary"
              >
                {section.title}
              </div>
            ) : (
              <div
                id={`nav-group-${section.id}`}
                className="sr-only"
              >
                {section.title}
              </div>
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.path ||
                  (item.path === '/overview' && (location.pathname === '/' || location.pathname === '/command-center')) ||
                  (item.path === '/monitoring/incidents' && location.pathname.startsWith('/intelligence/incidents')) ||
                  (item.path === '/intelligence/insights' && (location.pathname.startsWith('/intelligence/root-cause') || location.pathname.startsWith('/intelligence/failure-patterns') || location.pathname.startsWith('/intelligence/correlation'))) ||
                  (item.path === '/intelligence/signals' && (location.pathname.startsWith('/intelligence/brand-protection') || location.pathname.startsWith('/intelligence/complaints') || location.pathname.startsWith('/intelligence/threat-monitoring'))) ||
                  (item.path === '/recovery/center' && (location.pathname.startsWith('/recovery/playbooks') || location.pathname.startsWith('/recovery/executions'))) ||
                  (item.path === '/reports/business' && location.pathname.startsWith('/analytics/reliability')) ||
                  (item.path === '/reports/history' && location.pathname.startsWith('/analytics/history'));

                const linkElement = (
                  <NavLink
                    to={item.path}
                    onClick={() => {
                      if (isMobile) setMobileSidebarOpen(false);
                    }}
                    className={[
                      'group relative flex items-center rounded-lg text-xs font-medium transition-all duration-150',
                      collapsed ? 'justify-center h-9 w-9 mx-auto' : 'gap-2.5 px-3 py-2',
                      isActive
                        ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold border border-burgundy-deep/30 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/20'
                        : 'text-ink-secondary hover:bg-surface-secondary/90 hover:text-ink-primary hover:translate-x-0.5',
                    ].join(' ')}
                  >
                    <Icon
                      className={[
                        'w-4 h-4 shrink-0 transition-colors',
                        isActive
                          ? 'text-white'
                          : 'text-ink-secondary group-hover:text-ink-primary',
                      ].join(' ')}
                      aria-hidden="true"
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                );

                return (
                  <li key={item.id}>
                    {collapsed ? (
                      <Tooltip content={`${section.title}: ${item.label}`} side="right">
                        {linkElement}
                      </Tooltip>
                    ) : (
                      linkElement
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer / Telemetry Link Status & Expand Control */}
      <div className="p-2.5 border-t border-border-warm bg-surface-cream/60 space-y-2 shrink-0">
        {!collapsed && (
          <Link
            to="/login"
            className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-white border border-border-warm hover:border-burgundy/40 text-xs text-ink-primary shadow-subtle group transition-colors"
            title="Configure logos, domains, and font colours"
          >
            <div className="flex items-center gap-2 truncate">
              <span
                style={{ backgroundColor: brandProfile.primaryColor || '#6D1735' }}
                className="w-2.5 h-2.5 rounded-full shrink-0"
              />
              <span className="font-medium text-[11px] truncate">Brand Identity Portal</span>
            </div>
            <Palette className="w-3.5 h-3.5 text-ink-secondary group-hover:text-burgundy shrink-0" />
          </Link>
        )}

        {collapsed && !isMobile && (
          <div className="flex justify-center">
            <Tooltip content="Expand sidebar (Ctrl+B)" side="right">
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Expand sidebar"
                className="p-1.5 rounded text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>
        )}

        <div
          className={[
            'rounded-md border border-border-warm bg-surface-ivory px-2.5 py-2 flex items-center',
            collapsed ? 'justify-center' : 'justify-between gap-2',
          ].join(' ')}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Radio
              className={[
                'w-3.5 h-3.5 shrink-0',
                healthQuery.isLoading
                  ? 'text-status-info animate-pulse'
                  : isBackendConnected
                    ? 'text-status-healthy'
                    : 'text-status-warning',
              ].join(' ')}
              aria-hidden="true"
            />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-ink-primary truncate">
                  API Telemetry Link
                </div>
                <div className="text-[10px] font-mono text-ink-secondary truncate">
                  {healthQuery.isLoading
                    ? 'Probing /api/health...'
                    : isBackendConnected
                      ? 'FastAPI Connected'
                      : 'No Backend Signal'}
                </div>
              </div>
            )}
          </div>
          {!collapsed && (
            <Badge
              variant={
                healthQuery.isLoading
                  ? 'info'
                  : isBackendConnected
                    ? 'healthy'
                    : 'warning'
              }
              dot
            >
              {healthQuery.isLoading ? 'Sync' : isBackendConnected ? 'Live' : 'Offline'}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Collapsible Sidebar */}
      <aside
        aria-label="Sidebar navigation"
        className={[
          'hidden lg:block shrink-0 transition-[width] duration-200 ease-out relative',
          isSidebarCollapsed ? 'w-16' : 'w-60',
        ].join(' ')}
      >
        <div className="sticky top-0 h-screen">
          {renderSidebarContent(isSidebarCollapsed, false)}

          {/* Floating Edge Toggle Pill - Sits right on the border between sidebar and main content */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={isSidebarCollapsed ? 'Expand sidebar sideways' : 'Collapse sidebar'}
            title={isSidebarCollapsed ? 'Expand sidebar sideways (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            className="absolute -right-3.5 top-4.5 z-40 w-7 h-7 rounded-full bg-white border border-border-warm shadow-md flex items-center justify-center text-ink-primary hover:text-burgundy hover:border-burgundy transition-all hover:scale-110 cursor-pointer"
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4 text-burgundy" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-ink-secondary" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-ink-primary/40 backdrop-blur-[1px]"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            aria-label="Mobile navigation drawer"
            className="relative z-10 w-64 max-w-[80vw] h-full"
          >
            {renderSidebarContent(false, true)}
          </aside>
        </div>
      )}
    </>
  );
};
