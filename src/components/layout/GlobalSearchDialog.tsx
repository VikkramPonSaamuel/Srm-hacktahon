import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
  Layers,
  Loader2,
  PlayCircle,
  Radar,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { ALL_NAVIGATION_ITEMS, type NavigationItem } from '../../config/navigation';
import { useShell } from '../../context/ShellContext';
import { useJourneysListQuery, useExecutionsListQuery } from '../../api/journeysAndExecutions';
import { useIncidentsListQuery } from '../../api/incidentsAndRca';
import { useFailurePatternsQuery } from '../../api/failurePatternsAndHistory';
import { usePlaybooksListQuery, useRecoveryExecutionsQuery } from '../../api/recovery';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/FormControls';
import { Badge } from '../ui/Badge';

export type SearchCategoryFilter =
  | 'all'
  | 'routes'
  | 'journeys'
  | 'incidents'
  | 'executions'
  | 'playbooks'
  | 'patterns'
  | 'recoveries';

export interface SearchResultItem {
  id: string;
  category: 'Route' | 'Journey' | 'Incident' | 'Execution' | 'Playbook' | 'Pattern' | 'Recovery';
  title: string;
  subtitle: string;
  path: string;
  badge?: string;
  badgeVariant?: 'healthy' | 'warning' | 'critical' | 'info' | 'neutral' | 'burgundy';
  icon: React.ElementType;
}

export const GlobalSearchDialog: React.FC = () => {
  const navigate = useNavigate();
  const {
    isSearchDialogOpen,
    setSearchDialogOpen,
    globalSearchQuery,
    setGlobalSearchQuery,
    timeRange,
  } = useShell();

  const [activeCategory, setActiveCategory] = useState<SearchCategoryFilter>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  // Queries only execute when dialog is open or from React Query cache
  const journeysQuery = useJourneysListQuery(timeRange);
  const executionsQuery = useExecutionsListQuery(timeRange);
  const incidentsQuery = useIncidentsListQuery(timeRange);
  const patternsQuery = useFailurePatternsQuery(timeRange);
  const playbooksQuery = usePlaybooksListQuery(timeRange);
  const recoveryQuery = useRecoveryExecutionsQuery(timeRange);

  const isSearching =
    journeysQuery.isLoading ||
    executionsQuery.isLoading ||
    incidentsQuery.isLoading ||
    patternsQuery.isLoading;

  // Build searchable index across all entities
  const allResults = useMemo<SearchResultItem[]>(() => {
    const q = globalSearchQuery.trim().toLowerCase();

    const results: SearchResultItem[] = [];

    // 1. Navigation Routes
    ALL_NAVIGATION_ITEMS.forEach((nav: NavigationItem) => {
      if (
        !q ||
        nav.label.toLowerCase().includes(q) ||
        nav.section.toLowerCase().includes(q) ||
        nav.subtitle.toLowerCase().includes(q) ||
        nav.path.toLowerCase().includes(q)
      ) {
        results.push({
          id: `route-${nav.id}`,
          category: 'Route',
          title: nav.label,
          subtitle: `${nav.section} • ${nav.subtitle}`,
          path: nav.path,
          badge: nav.section,
          badgeVariant: 'neutral',
          icon: nav.icon || Compass,
        });
      }
    });

    // 2. Business Journeys
    (journeysQuery.data ?? []).forEach((j) => {
      if (
        !q ||
        j.name.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q) ||
        (j.description?.toLowerCase().includes(q) ?? false)
      ) {
        results.push({
          id: `journey-${j.id}`,
          category: 'Journey',
          title: j.name,
          subtitle: `Journey ID: ${j.id} • Cadence: ${j.scheduleCadence || '60s'}`,
          path: `/monitoring/journeys?journeyId=${encodeURIComponent(j.id)}`,
          badge: j.overallHealth.toUpperCase(),
          badgeVariant:
            j.overallHealth === 'healthy'
              ? 'healthy'
              : j.overallHealth === 'degraded'
              ? 'warning'
              : 'critical',
          icon: Compass,
        });
      }
    });

    // 3. Incidents
    (incidentsQuery.data ?? []).forEach((inc) => {
      if (
        !q ||
        inc.id.toLowerCase().includes(q) ||
        inc.title.toLowerCase().includes(q) ||
        (inc.summary?.toLowerCase().includes(q) ?? false) ||
        (inc.affectedJourneyName?.toLowerCase().includes(q) ?? false) ||
        (inc.affectedServiceName?.toLowerCase().includes(q) ?? false)
      ) {
        results.push({
          id: `inc-${inc.id}`,
          category: 'Incident',
          title: inc.title,
          subtitle: `${inc.id} • Target: ${inc.affectedJourneyName || inc.affectedServiceName || 'System'} • Status: ${inc.status}`,
          path: `/intelligence/incidents?incidentId=${encodeURIComponent(inc.id)}`,
          badge: inc.severity.toUpperCase(),
          badgeVariant:
            inc.severity === 'critical' || inc.severity === 'sev1'
              ? 'critical'
              : inc.severity === 'high' || inc.severity === 'sev2'
              ? 'warning'
              : 'neutral',
          icon: ShieldAlert,
        });
      }
    });

    // 4. Synthetic Executions
    (executionsQuery.data ?? []).forEach((exec) => {
      if (
        !q ||
        exec.id.toLowerCase().includes(q) ||
        exec.journeyName.toLowerCase().includes(q) ||
        (exec.failedStepName?.toLowerCase().includes(q) ?? false) ||
        (exec.errorSummary?.toLowerCase().includes(q) ?? false)
      ) {
        results.push({
          id: `exec-${exec.id}`,
          category: 'Execution',
          title: `${exec.journeyName} Run`,
          subtitle: `ID: ${exec.id} • ${exec.errorSummary || (exec.durationMs ? `${exec.durationMs}ms duration` : 'Completed')}`,
          path: `/monitoring/executions?executionId=${encodeURIComponent(exec.id)}`,
          badge: exec.status.toUpperCase(),
          badgeVariant: exec.status === 'passed' ? 'healthy' : 'critical',
          icon: PlayCircle,
        });
      }
    });

    // 5. Failure Patterns
    (patternsQuery.data ?? []).forEach((pat) => {
      if (
        !q ||
        pat.name.toLowerCase().includes(q) ||
        pat.signatureHash.toLowerCase().includes(q) ||
        pat.category.toLowerCase().includes(q) ||
        (pat.summary?.toLowerCase().includes(q) ?? false)
      ) {
        results.push({
          id: `pat-${pat.id}`,
          category: 'Pattern',
          title: pat.name,
          subtitle: `Signature: ${pat.signatureHash} • ${pat.occurrencesCount} occurrences`,
          path: `/intelligence/failure-patterns?patternId=${encodeURIComponent(pat.id)}`,
          badge: pat.category,
          badgeVariant: 'warning',
          icon: Radar,
        });
      }
    });

    // 6. Playbooks
    (playbooksQuery.data ?? []).forEach((pb) => {
      if (
        !q ||
        pb.name.toLowerCase().includes(q) ||
        pb.id.toLowerCase().includes(q) ||
        pb.purpose.toLowerCase().includes(q)
      ) {
        results.push({
          id: `pb-${pb.id}`,
          category: 'Playbook',
          title: pb.name,
          subtitle: `ID: ${pb.id} • ${pb.purpose}`,
          path: `/recovery/playbooks?playbookId=${encodeURIComponent(pb.id)}`,
          badge: pb.approvalLevel,
          badgeVariant: pb.blastRadius === 'high' ? 'critical' : 'healthy',
          icon: Layers,
        });
      }
    });

    // 7. Recovery Executions
    (recoveryQuery.data ?? []).forEach((rec) => {
      if (
        !q ||
        rec.id.toLowerCase().includes(q) ||
        rec.playbookName.toLowerCase().includes(q) ||
        rec.incidentId.toLowerCase().includes(q)
      ) {
        results.push({
          id: `rec-${rec.id}`,
          category: 'Recovery',
          title: `Recovery: ${rec.playbookName}`,
          subtitle: `Action ID: ${rec.id} • Incident: ${rec.incidentId}`,
          path: `/recovery/executions?actionRunId=${encodeURIComponent(rec.id)}`,
          badge: rec.status.toUpperCase(),
          badgeVariant: rec.status === 'verified' ? 'healthy' : rec.status === 'failed' ? 'critical' : 'warning',
          icon: RotateCcw,
        });
      }
    });

    return results;
  }, [
    globalSearchQuery,
    journeysQuery.data,
    incidentsQuery.data,
    executionsQuery.data,
    patternsQuery.data,
    playbooksQuery.data,
    recoveryQuery.data,
  ]);

  // Filter by category tab
  const filteredResults = useMemo(() => {
    if (activeCategory === 'all') return allResults;
    const catMap: Record<SearchCategoryFilter, string> = {
      all: 'all',
      routes: 'Route',
      journeys: 'Journey',
      incidents: 'Incident',
      executions: 'Execution',
      playbooks: 'Playbook',
      patterns: 'Pattern',
      recoveries: 'Recovery',
    };
    return allResults.filter((r) => r.category === catMap[activeCategory]);
  }, [allResults, activeCategory]);

  useEffect(() => {
    setActiveIndex(0);
  }, [globalSearchQuery, activeCategory, isSearchDialogOpen]);

  const handleSelectResult = (item: SearchResultItem) => {
    navigate(item.path);
    setSearchDialogOpen(false);
    setGlobalSearchQuery('');
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allResults.length,
      routes: 0,
      journeys: 0,
      incidents: 0,
      executions: 0,
      playbooks: 0,
      patterns: 0,
      recoveries: 0,
    };
    allResults.forEach((r) => {
      if (r.category === 'Route') counts.routes++;
      else if (r.category === 'Journey') counts.journeys++;
      else if (r.category === 'Incident') counts.incidents++;
      else if (r.category === 'Execution') counts.executions++;
      else if (r.category === 'Playbook') counts.playbooks++;
      else if (r.category === 'Pattern') counts.patterns++;
      else if (r.category === 'Recovery') counts.recoveries++;
    });
    return counts;
  }, [allResults]);

  return (
    <Dialog
      open={isSearchDialogOpen}
      onClose={() => setSearchDialogOpen(false)}
      title="Global Reliability Search"
      description="Cross-entity search across journeys, probe executions, active incidents, failure patterns, and recovery actions."
      size="xl"
    >
      <div className="space-y-3">
        {/* Search input */}
        <div className="relative">
          <Input
            type="search"
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  filteredResults.length > 0 ? (prev + 1) % filteredResults.length : 0
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((prev) =>
                  filteredResults.length > 0
                    ? (prev - 1 + filteredResults.length) % filteredResults.length
                    : 0
                );
              } else if (e.key === 'Enter' && filteredResults[activeIndex]) {
                e.preventDefault();
                handleSelectResult(filteredResults[activeIndex]);
              }
            }}
            placeholder="Search journeys, incidents (e.g. inc-101), error signatures, playbooks, or executions..."
            aria-label="Search platform entities"
            leftAddon={<Search className="w-4 h-4 text-burgundy" />}
            rightAddon={
              isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-secondary" />
              ) : undefined
            }
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-border-warm">
          {[
            { id: 'all', label: 'All Results', count: categoryCounts.all },
            { id: 'journeys', label: 'Journeys', count: categoryCounts.journeys },
            { id: 'incidents', label: 'Incidents', count: categoryCounts.incidents },
            { id: 'executions', label: 'Executions', count: categoryCounts.executions },
            { id: 'playbooks', label: 'Playbooks', count: categoryCounts.playbooks },
            { id: 'patterns', label: 'Patterns', count: categoryCounts.patterns },
            { id: 'recoveries', label: 'Recoveries', count: categoryCounts.recoveries },
            { id: 'routes', label: 'Modules', count: categoryCounts.routes },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id as SearchCategoryFilter)}
              className={[
                'px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1',
                activeCategory === cat.id
                  ? 'bg-burgundy text-surface-ivory shadow-xs'
                  : 'bg-surface-cream text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary',
              ].join(' ')}
            >
              <span>{cat.label}</span>
              <span className="opacity-75 font-mono text-[10px]">({cat.count})</span>
            </button>
          ))}
        </div>

        {/* Results List */}
        <div
          role="listbox"
          aria-label="Matching search results"
          className="max-h-96 overflow-y-auto divide-y divide-border-warm border border-border-warm rounded-md bg-surface-cream/30"
        >
          {filteredResults.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-1.5">
              <Search className="w-8 h-8 text-ink-secondary/40 mx-auto" />
              <div className="text-xs font-semibold text-ink-primary">
                No matching entities or records found
              </div>
              <p className="text-[11px] text-ink-secondary max-w-sm mx-auto">
                No journeys, incidents, executions, or playbooks matched &ldquo;{globalSearchQuery}&rdquo; in this scope.
              </p>
            </div>
          ) : (
            filteredResults.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelectResult(item)}
                  className={[
                    'w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 transition-colors',
                    isSelected ? 'bg-surface-secondary' : 'bg-surface-ivory hover:bg-surface-cream',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="p-1.5 rounded bg-burgundy/10 text-burgundy shrink-0 mt-0.5">
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-ink-primary truncate">
                          {item.title}
                        </span>
                        <Badge variant="neutral">{item.category}</Badge>
                        {item.badge && (
                          <Badge variant={item.badgeVariant ?? 'neutral'}>{item.badge}</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-secondary truncate mt-0.5 font-mono">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="flex items-center justify-between text-[11px] text-ink-secondary pt-1 px-1">
          <span>Use <strong>&uarr;</strong> and <strong>&darr;</strong> to navigate, <strong>Enter</strong> to open</span>
          <span>Showing {filteredResults.length} records</span>
        </div>
      </div>
    </Dialog>
  );
};

export default GlobalSearchDialog;
