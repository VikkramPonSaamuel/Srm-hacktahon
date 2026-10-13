import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Clock,
  Lock,
  Play,
  Radar,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useShell } from '../context/ShellContext';
import type { SemanticStatus } from '../styles/tokens';
import {
  type FailurePatternItem,
  type PatternRecurrenceStatus,
  useFailurePatternDetailQuery,
  useFailurePatternsQuery,
} from '../api/failurePatternsAndHistory';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  MonoCode,
  Select,
  UnavailableState,
} from '../components/ui';

export function patternStatusToBadgeVariant(status: PatternRecurrenceStatus): SemanticStatus {
  switch (status) {
    case 'resolved':
      return 'healthy';
    case 'new':
      return 'info';
    case 'suppressed':
      return 'neutral';
    case 'recurring':
    default:
      return 'warning';
  }
}

type PatternSortKey = 'occurrencesCount' | 'lastObservedAt' | 'firstSeenAt' | 'name';

export const FailurePatternsPage: React.FC = () => {
  const { timeRange } = useShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPatternId = searchParams.get('patternId');

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<PatternSortKey>('occurrencesCount');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const patternsQuery = useFailurePatternsQuery(timeRange);
  const patternDetailQuery = useFailurePatternDetailQuery(selectedPatternId, timeRange);

  const patterns = patternsQuery.data ?? [];

  // Distinct category options
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of patterns) {
      if (p.category) set.add(p.category);
    }
    return [
      { value: 'all', label: 'All Failure Categories' },
      ...Array.from(set).map((cat) => ({ value: cat, label: cat })),
    ];
  }, [patterns]);

  const filteredAndSortedPatterns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = patterns.filter((p) => {
      const matchesSearch =
        !q ||
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.signatureHash.toLowerCase().includes(q) ||
        (p.summary?.toLowerCase().includes(q) ?? false) ||
        (p.affectedJourneyName?.toLowerCase().includes(q) ?? false) ||
        (p.affectedServiceName?.toLowerCase().includes(q) ?? false);

      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'occurrencesCount') {
        cmp = a.occurrencesCount - b.occurrencesCount;
      } else if (sortKey === 'lastObservedAt') {
        cmp = a.lastObservedAt.localeCompare(b.lastObservedAt);
      } else if (sortKey === 'firstSeenAt') {
        cmp = a.firstSeenAt.localeCompare(b.firstSeenAt);
      } else if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [patterns, searchQuery, categoryFilter, statusFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedPatterns.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPatterns = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredAndSortedPatterns.slice(start, start + pageSize);
  }, [filteredAndSortedPatterns, safePage, pageSize]);

  const handleOpenDetail = (id: string) => {
    setSearchParams({ patternId: id });
  };

  const handleCloseDetail = () => {
    setSearchParams({});
  };

  const fallbackPatternNode = useMemo(
    () => patterns.find((p) => p.id === selectedPatternId) ?? null,
    [patterns, selectedPatternId]
  );

  const displayPattern = patternDetailQuery.data ?? fallbackPatternNode;

  // =========================================================================
  // PATTERN DETAILS VIEW (?patternId=...)
  // =========================================================================
  if (selectedPatternId) {
    return (
      <div className="space-y-5">
        {/* Header & Back Button */}
        <Card variant="ivory">
          <CardHeader
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCloseDetail}
                  leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
                >
                  All Failure Patterns
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={patternDetailQuery.isFetching}
                  onClick={() => void patternDetailQuery.refetch()}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Refresh Telemetry
                </Button>
                {displayPattern?.suggestedPlaybookId && (
                  <Link to="/recovery/playbooks">
                    <Button variant="primary" size="sm" leftIcon={<Play className="w-3.5 h-3.5" />}>
                      Execute Suggested Playbook
                    </Button>
                  </Link>
                )}
              </div>
            }
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-status-warning/12 text-status-warning shrink-0 mt-0.5">
                <Radar className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle>
                    {displayPattern?.name ?? `Pattern ${selectedPatternId}`}
                  </CardTitle>
                  <MonoCode>{displayPattern?.signatureHash ?? selectedPatternId}</MonoCode>
                  {displayPattern && (
                    <Badge variant={patternStatusToBadgeVariant(displayPattern.status)} dot>
                      {displayPattern.status.toUpperCase()}
                    </Badge>
                  )}
                  {displayPattern?.category && (
                    <Badge variant="neutral">{displayPattern.category}</Badge>
                  )}
                </div>
                <CardDescription>
                  {displayPattern?.summary ??
                    'Correlated recurring error signature clustered across synthetic transaction probe runs.'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          {displayPattern && (
            <div className="px-4 py-3 bg-surface-cream/60 border-t border-border-warm grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-ink-secondary block">Occurrences</span>
                <span className="font-mono font-semibold text-ink-primary">
                  {displayPattern.occurrencesCount} total
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Confidence Score</span>
                <span className="font-mono font-semibold text-ink-primary">
                  {displayPattern.confidenceScore !== null
                    ? `${displayPattern.confidenceScore}%`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">First Detected</span>
                <span className="font-mono text-ink-primary">
                  {displayPattern.firstSeenAt}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">Last Observed</span>
                <span className="font-mono text-ink-primary">
                  {displayPattern.lastObservedAt}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-ink-secondary block">
                  Correlated Incidents
                </span>
                <span className="font-mono font-semibold text-ink-primary">
                  {displayPattern.relatedIncidentIds.length} linked
                </span>
              </div>
            </div>
          )}
        </Card>

        {patternDetailQuery.isFetching && !displayPattern ? (
          <LoadingState
            title="Loading failure pattern details"
            description={`Querying GET /api/v1/intelligence/failure-patterns/${selectedPatternId}...`}
            rows={4}
          />
        ) : patternDetailQuery.isError &&
          patternDetailQuery.error?.isUnavailable &&
          !displayPattern ? (
          <UnavailableState
            title="Failure Pattern API Unavailable"
            description={`Endpoint GET /api/v1/intelligence/failure-patterns/${selectedPatternId} did not respond.`}
            endpoint={`/api/v1/intelligence/failure-patterns/${selectedPatternId}`}
            onRetry={() => void patternDetailQuery.refetch()}
          />
        ) : patternDetailQuery.isError && !displayPattern ? (
          <ErrorState
            title="Failed to load failure pattern"
            message={patternDetailQuery.error?.message ?? 'Error fetching pattern'}
            statusCode={patternDetailQuery.error?.status}
            endpoint={`/api/v1/intelligence/failure-patterns/${selectedPatternId}`}
            onRetry={() => void patternDetailQuery.refetch()}
          />
        ) : (
          <>
            {/* Detection Rule & Suggested Countermeasures */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card variant="ivory">
                <CardHeader>
                  <CardTitle>Detection Rule &amp; Classification Logic</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="p-3 rounded-md bg-surface-cream border border-border-warm space-y-1.5">
                    <span className="font-semibold text-ink-primary block">
                      Clustering Rule:
                    </span>
                    <p className="font-mono text-ink-secondary">
                      {displayPattern?.detectionRule ??
                        'Clustered via HTTP status code, assertion mismatch schema, and stack trace hashing.'}
                    </p>
                  </div>
                  {displayPattern?.classificationRule && (
                    <div className="p-3 rounded-md bg-surface-cream border border-border-warm space-y-1.5">
                      <span className="font-semibold text-ink-primary block">
                        Classifier:
                      </span>
                      <p className="font-mono text-ink-secondary">
                        {displayPattern.classificationRule}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card variant="ivory">
                <CardHeader>
                  <CardTitle>Suggested Countermeasures &amp; Playbooks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="p-3 rounded-md bg-surface-cream border border-border-warm space-y-1.5">
                    <span className="font-semibold text-ink-primary block">
                      Recommended Action:
                    </span>
                    <p className="text-ink-secondary leading-relaxed">
                      {displayPattern?.suggestedCountermeasure ??
                        'Inspect recent deployments and review pre-approved countermeasure playbooks.'}
                    </p>
                  </div>
                  {displayPattern?.suggestedPlaybookId && (
                    <div className="pt-2">
                      <Link to="/recovery/playbooks">
                        <Button
                          variant="primary"
                          size="xs"
                          rightIcon={<ArrowUpRight className="w-3 h-3" />}
                        >
                          Execute Playbook:{' '}
                          {displayPattern.suggestedPlaybookName ??
                            displayPattern.suggestedPlaybookId}
                        </Button>
                      </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Common Error Signatures & Sanitized Samples */}
            <Card variant="ivory">
              <CardHeader
                actions={
                  <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
                    <Lock className="w-3.5 h-3.5 text-status-healthy" />
                    <span>Scrubbed Signatures</span>
                  </div>
                }
              >
                <CardTitle>Common Error Signatures &amp; Sanitized Samples</CardTitle>
                <CardDescription>
                  Exact error codes and sanitized payload traces matching this failure signature.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(displayPattern?.errorSignatures.length ?? 0) === 0 ? (
                  <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                    No individual error signature samples were returned by the backend.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayPattern!.errorSignatures.map((sig) => (
                      <div
                        key={sig.signatureHash}
                        className="rounded-md border border-border-warm bg-surface-cream/50 p-3 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Badge variant="critical" mono>
                              {sig.errorCode}
                            </Badge>
                            <MonoCode>{sig.signatureHash}</MonoCode>
                          </div>
                          <span className="font-mono text-[11px] text-ink-secondary">
                            Observed {sig.frequencyCount} time(s)
                          </span>
                        </div>
                        <pre className="p-2.5 rounded bg-surface-ivory border border-border-warm font-mono text-[11px] text-ink-primary overflow-x-auto whitespace-pre-wrap leading-relaxed">
                          {sig.sanitizedSample || sig.rawSample}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Historical Occurrence Timeline & Correlated Incidents */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card variant="ivory">
                <CardHeader
                  actions={
                    <Badge variant="neutral" mono>
                      {displayPattern?.occurrencesTimeline.length ?? 0} Event(s)
                    </Badge>
                  }
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-burgundy" />
                    <CardTitle>Historical Occurrence Timeline</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {(displayPattern?.occurrencesTimeline.length ?? 0) === 0 ? (
                    <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                      No granular occurrence timeline entries were returned for this pattern.
                    </div>
                  ) : (
                    <DataTable
                      caption="Occurrence timeline"
                      columns={[
                        { key: 'timestamp', header: 'Timestamp', mono: true },
                        {
                          key: 'stepName',
                          header: 'Failed Step / Target',
                          render: (row) => String(row.stepName ?? '—'),
                        },
                        {
                          key: 'executionId',
                          header: 'Execution Run',
                          mono: true,
                          render: (row) => {
                            if (!row.executionId) return '—';
                            return (
                              <Link
                                to={`/monitoring/executions?executionId=${encodeURIComponent(
                                  String(row.executionId)
                                )}`}
                                className="text-burgundy hover:underline"
                              >
                                {String(row.executionId)}
                              </Link>
                            );
                          },
                        },
                      ]}
                      data={
                        displayPattern!.occurrencesTimeline as unknown as Record<
                          string,
                          unknown
                        >[]
                      }
                      rowKey={(row) => String(row.id)}
                    />
                  )}
                </CardContent>
              </Card>

              <Card variant="ivory">
                <CardHeader
                  actions={
                    <Link to="/intelligence/incidents">
                      <Button variant="outline" size="xs">
                        Incident Console
                      </Button>
                    </Link>
                  }
                >
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-status-critical" />
                    <CardTitle>Related Incidents</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {(displayPattern?.relatedIncidentIds.length ?? 0) === 0 ? (
                    <div className="p-4 rounded-md bg-surface-cream/60 border border-border-warm text-xs text-ink-secondary">
                      Zero incidents are currently linked to this recurring failure pattern.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayPattern!.relatedIncidentIds.map((incId) => (
                        <div
                          key={incId}
                          className="p-3 rounded-md bg-surface-cream/60 border border-border-warm flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <MonoCode>{incId}</MonoCode>
                            <span className="font-semibold text-ink-primary">
                              Correlated Incident
                            </span>
                          </div>
                          <Link
                            to={`/intelligence/incidents?incidentId=${encodeURIComponent(incId)}`}
                            className="inline-flex items-center gap-1 text-burgundy hover:underline font-semibold"
                          >
                            <span>Inspect Incident</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    );
  }

  // =========================================================================
  // FAILURE PATTERNS LIST VIEW
  // =========================================================================
  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Link to="/intelligence/rca">
                <Button variant="outline" size="sm">
                  Root Cause Analysis
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                isLoading={patternsQuery.isFetching}
                onClick={() => void patternsQuery.refetch()}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh Patterns
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-status-warning/12 text-status-warning shrink-0 mt-0.5">
              <Radar className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>Failure Patterns</CardTitle>
                <MonoCode>GET /api/v1/intelligence/failure-patterns</MonoCode>
              </div>
              <CardDescription>
                Clustered recurring error signatures across synthetic transactions to isolate
                systemic regressions from transient noise.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={(val) => {
          setSearchQuery(val);
          setCurrentPage(1);
        }}
        searchPlaceholder="Filter patterns by title, hash, journey, or service..."
        filters={[
          {
            id: 'pattern-category-filter',
            label: 'Category',
            value: categoryFilter,
            options: categoryOptions,
            onChange: (val) => {
              setCategoryFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'pattern-status-filter',
            label: 'Recurrence Status',
            value: statusFilter,
            options: [
              { value: 'all', label: 'All Statuses' },
              { value: 'recurring', label: 'Recurring' },
              { value: 'new', label: 'New / Emerging' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'suppressed', label: 'Suppressed' },
            ],
            onChange: (val) => {
              setStatusFilter(val);
              setCurrentPage(1);
            },
          },
          {
            id: 'pattern-sort-filter',
            label: 'Sort By',
            value: sortKey,
            options: [
              { value: 'occurrencesCount', label: 'Occurrences' },
              { value: 'lastObservedAt', label: 'Last Observed' },
              { value: 'firstSeenAt', label: 'First Detected' },
              { value: 'name', label: 'Pattern Name' },
            ],
            onChange: (val) => setSortKey(val as PatternSortKey),
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setCategoryFilter('all');
          setStatusFilter('all');
          setCurrentPage(1);
        }}
        actions={
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
            }
            leftIcon={
              sortDirection === 'asc' ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )
            }
          >
            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          </Button>
        }
      />

      {/* Patterns Table & States */}
      {patternsQuery.isFetching ? (
        <LoadingState
          title="Clustering failure signatures"
          description="Querying GET /api/v1/intelligence/failure-patterns..."
          rows={4}
        />
      ) : patternsQuery.isError && patternsQuery.error?.isUnavailable ? (
        <UnavailableState
          title="Failure Patterns API Unavailable"
          description="Endpoint GET /api/v1/intelligence/failure-patterns did not respond. No fabricated recurring patterns are shown."
          endpoint="/api/v1/intelligence/failure-patterns"
          onRetry={() => void patternsQuery.refetch()}
        />
      ) : patternsQuery.isError ? (
        <ErrorState
          title="Failed to load failure patterns"
          message={patternsQuery.error?.message ?? 'Error fetching patterns'}
          statusCode={patternsQuery.error?.status}
          endpoint="/api/v1/intelligence/failure-patterns"
          onRetry={() => void patternsQuery.refetch()}
        />
      ) : paginatedPatterns.length === 0 ? (
        <EmptyState
          title="No failure patterns found"
          description="Zero recurring failure signatures matched the current filter scope."
          endpoint="/api/v1/intelligence/failure-patterns"
          actionLabel="Reset filters"
          onAction={() => {
            setSearchQuery('');
            setCategoryFilter('all');
            setStatusFilter('all');
            setCurrentPage(1);
          }}
        />
      ) : (
        <Card variant="ivory">
          <DataTable
            caption="Recurring failure patterns table"
            columns={[
              {
                key: 'name',
                header: 'Pattern Name & Signature Hash',
                render: (row) => {
                  const pat = row as unknown as FailurePatternItem;
                  return (
                    <div className="max-w-md whitespace-normal">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(pat.id)}
                        className="font-semibold text-burgundy hover:underline text-left block"
                      >
                        {pat.name}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5">
                        <MonoCode>{pat.signatureHash}</MonoCode>
                        <Badge variant="neutral">{pat.category}</Badge>
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'status',
                header: 'Recurrence Status',
                render: (row) => {
                  const pat = row as unknown as FailurePatternItem;
                  return (
                    <Badge variant={patternStatusToBadgeVariant(pat.status)} dot>
                      {pat.status.toUpperCase()}
                    </Badge>
                  );
                },
              },
              {
                key: 'affectedTarget',
                header: 'Affected Journey / Service',
                render: (row) => {
                  const pat = row as unknown as FailurePatternItem;
                  return (
                    <div className="text-xs">
                      <div className="font-medium text-ink-primary">
                        {pat.affectedJourneyName ?? '—'}
                      </div>
                      <div className="text-[11px] text-ink-secondary">
                        {pat.affectedServiceName ?? ''}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'occurrencesCount',
                header: 'Occurrences',
                mono: true,
                align: 'right',
                render: (row) => {
                  const pat = row as unknown as FailurePatternItem;
                  return pat.occurrencesCount;
                },
              },
              {
                key: 'firstSeenAt',
                header: 'First & Latest Seen',
                mono: true,
                render: (row) => {
                  const pat = row as unknown as FailurePatternItem;
                  return (
                    <div className="text-xs">
                      <div>First: {pat.firstSeenAt}</div>
                      <div className="text-[10px] text-ink-secondary">
                        Last: {pat.lastObservedAt}
                      </div>
                    </div>
                  );
                },
              },
              {
                key: 'relatedIncidents',
                header: 'Incidents',
                mono: true,
                align: 'right',
                render: (row) => {
                  const pat = row as unknown as FailurePatternItem;
                  return pat.relatedIncidentIds.length;
                },
              },
              {
                key: 'actions',
                header: 'Inspect',
                align: 'right',
                sortable: false,
                render: (row) => {
                  const pat = row as unknown as FailurePatternItem;
                  return (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetail(pat.id);
                      }}
                      rightIcon={<ArrowRight className="w-3 h-3" />}
                    >
                      Pattern Details
                    </Button>
                  );
                },
              },
            ]}
            data={paginatedPatterns as unknown as Record<string, unknown>[]}
            rowKey={(row) => String(row.id)}
            onRowClick={(row) => handleOpenDetail(String(row.id))}
          />

          <CardFooter>
            <div className="flex items-center gap-2">
              <span>
                Showing {(safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredAndSortedPatterns.length)} of{' '}
                {filteredAndSortedPatterns.length} pattern(s)
              </span>
              <Select
                aria-label="Patterns per page"
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                options={[
                  { value: '10', label: '10 / page' },
                  { value: '25', label: '25 / page' },
                  { value: '50', label: '50 / page' },
                ]}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="font-mono text-xs px-2">
                Page {safePage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="xs"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  );
};
