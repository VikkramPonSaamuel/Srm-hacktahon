import React, { useState } from 'react';
import {
  SlidersHorizontal,
  RefreshCw,
  Terminal,
  Info,
  Layers,
} from 'lucide-react';
import type { NavigationItem } from '../config/navigation';
import { useShell } from '../context/ShellContext';
import { useEndpointProbeQuery } from '../api/client';
import { DESIGN_TOKENS, TIME_RANGE_OPTIONS } from '../styles/tokens';
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  FilterBar,
  FormField,
  Input,
  MonoCode,
  Select,
  Switch,
  Textarea,
  Tooltip,
} from '../components/ui';

type PreviewStateOverride = 'live' | 'loading' | 'empty' | 'error' | 'unavailable';

export interface FoundationRoutePageProps {
  item: NavigationItem;
}

export const FoundationRoutePage: React.FC<FoundationRoutePageProps> = ({ item }) => {
  const { timeRange } = useShell();
  const [searchQuery, setSearchQuery] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState(
    item.primaryFilterOptions[0]?.value ?? 'all'
  );
  const [secondaryFilter, setSecondaryFilter] = useState(
    item.secondaryFilterOptions[0]?.value ?? 'all'
  );
  const [stateOverride, setStateOverride] = useState<PreviewStateOverride>('live');
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Interactive form control state inside the Foundation Inspector dialog
  const [inspectorScopeName, setInspectorScopeName] = useState('');
  const [inspectorNotes, setInspectorNotes] = useState('');
  const [inspectorStrictMode, setInspectorStrictMode] = useState(true);

  // Reset filters when navigating between routes
  React.useEffect(() => {
    setSearchQuery('');
    setPrimaryFilter(item.primaryFilterOptions[0]?.value ?? 'all');
    setSecondaryFilter(item.secondaryFilterOptions[0]?.value ?? 'all');
    setStateOverride('live');
  }, [item.id, item.primaryFilterOptions, item.secondaryFilterOptions]);

  const endpointQuery = useEndpointProbeQuery<Record<string, unknown>[]>(
    item.expectedEndpoint,
    {
      window: timeRange,
      primary: primaryFilter,
      secondary: secondaryFilter,
      q: searchQuery.trim(),
    }
  );

  const timeRangeLabel =
    TIME_RANGE_OPTIONS.find((opt) => opt.value === timeRange)?.label ?? timeRange;

  const Icon = item.icon;

  // Determine effective state for the DataTable based on live query or explicit UI state preview
  const isLoading =
    stateOverride === 'loading' || (stateOverride === 'live' && endpointQuery.isFetching);
  const isUnavailable =
    stateOverride === 'unavailable' ||
    (stateOverride === 'live' &&
      endpointQuery.isError &&
      Boolean(endpointQuery.error?.isUnavailable));
  const errorState =
    stateOverride === 'error'
      ? {
          message: `Simulated 500 Internal Server Error while querying ${item.expectedEndpoint}. No operational records were modified.`,
          status: 500,
        }
      : stateOverride === 'live' &&
          endpointQuery.isError &&
          !endpointQuery.error?.isUnavailable
        ? {
            message: endpointQuery.error.message,
            status: endpointQuery.error.status,
          }
        : null;

  const records: Record<string, unknown>[] =
    stateOverride === 'live' && Array.isArray(endpointQuery.data)
      ? endpointQuery.data
      : [];

  return (
    <div className="space-y-4">
      {/* Module Header & Contract Metadata Card */}
      <Card variant="ivory">
        <CardHeader
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Tooltip content="Inspect reusable UI primitives, tokens, and form controls" side="bottom">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsInspectorOpen(true)}
                  leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                >
                  Foundation Primitives
                </Button>
              </Tooltip>

              <Button
                variant="primary"
                size="sm"
                isLoading={endpointQuery.isFetching}
                onClick={() => {
                  setStateOverride('live');
                  endpointQuery.refetch();
                }}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Probe Endpoint
              </Button>
            </div>
          }
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-md bg-burgundy/10 text-burgundy border border-burgundy/20 shrink-0 mt-0.5">
              <Icon className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle>{item.label}</CardTitle>
                <Badge variant="burgundy">{item.section}</Badge>
                <Badge variant="neutral" mono>
                  Window: {timeRangeLabel}
                </Badge>
              </div>
              <CardDescription>{item.subtitle}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardFooter>
          <div className="flex items-center gap-2 flex-wrap">
            <Terminal className="w-3.5 h-3.5 text-ink-secondary" aria-hidden="true" />
            <span>Expected Backend Contract:</span>
            <MonoCode>GET {item.expectedEndpoint}</MonoCode>
            <span className="text-border-strong">|</span>
            <span>Entity Schema:</span>
            <span className="font-medium text-ink-primary">{item.domainEntity}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-ink-secondary">State View:</span>
            <div
              role="group"
              aria-label="Preview UI state"
              className="inline-flex rounded border border-border-warm bg-surface-ivory p-0.5"
            >
              {(['live', 'loading', 'empty', 'unavailable', 'error'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setStateOverride(mode)}
                  className={[
                    'px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-colors',
                    stateOverride === mode
                      ? 'bg-burgundy text-surface-ivory'
                      : 'text-ink-secondary hover:text-ink-primary',
                  ].join(' ')}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Reusable Scoped Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder={`Filter ${item.label.toLowerCase()} by ID, key, or label...`}
        filters={[
          {
            id: `${item.id}-primary`,
            label: item.primaryFilterLabel,
            value: primaryFilter,
            options: item.primaryFilterOptions,
            onChange: setPrimaryFilter,
          },
          {
            id: `${item.id}-secondary`,
            label: item.secondaryFilterLabel,
            value: secondaryFilter,
            options: item.secondaryFilterOptions,
            onChange: setSecondaryFilter,
          },
        ]}
        onReset={() => {
          setSearchQuery('');
          setPrimaryFilter(item.primaryFilterOptions[0]?.value ?? 'all');
          setSecondaryFilter(item.secondaryFilterOptions[0]?.value ?? 'all');
        }}
        actions={
          <div className="flex items-center gap-2 text-xs text-ink-secondary">
            <span>Records:</span>
            <Badge variant="neutral" mono>
              {records.length}
            </Badge>
          </div>
        }
      />

      {/* Primary Domain Data Table with Integrated State Views */}
      <DataTable
        caption={`${item.label} telemetry table`}
        columns={item.columns.map((col) => ({
          key: col.key,
          header: col.header,
          mono: col.mono,
          align: col.align,
          sortable: true,
        }))}
        data={records}
        rowKey={(row, index) => String(row[item.columns[0]?.key ?? 'id'] ?? index)}
        isLoading={isLoading}
        isUnavailable={isUnavailable}
        error={errorState}
        endpoint={item.expectedEndpoint}
        emptyTitle={`No ${item.domainEntity.toLowerCase()} recorded`}
        emptyDescription={`The backend endpoint ${item.expectedEndpoint} returned zero records for the ${timeRangeLabel.toLowerCase()} evaluation window.`}
        onRetry={() => {
          setStateOverride('live');
          endpointQuery.refetch();
        }}
      />

      {/* Phase 1 Architecture & Non-Fabrication Notice */}
      <Card variant="subtle" padding="sm">
        <div className="flex items-start gap-2.5 text-xs text-ink-secondary">
          <Info className="w-4 h-4 text-status-info shrink-0 mt-0.5" aria-hidden="true" />
          <div className="leading-relaxed">
            <span className="font-semibold text-ink-primary">
              Telemetry Integrity Policy:
            </span>{' '}
            Continuum never fabricates operational metrics or simulates fake mutation success.
            All cards, tables, and action triggers on <MonoCode>{item.path}</MonoCode> are
            bound to live query states and will populate automatically when the FastAPI backend
            service responds on <MonoCode>{item.expectedEndpoint}</MonoCode>.
          </div>
        </div>
      </Card>

      {/* Reusable Primitives & Form Controls Verification Dialog */}
      <Dialog
        open={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        title="Continuum Design System & Foundation Primitives"
        description="Interactive verification of palette tokens, semantic badges, buttons, and accessible form controls."
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setIsInspectorOpen(false)}>
              Close
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled
              title="Backend mutation endpoint not connected"
            >
              Save Policy (Requires Backend)
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {/* Semantic Status Badges */}
          <div>
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-2">
              Semantic Status Badges
            </h3>
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-md bg-surface-cream border border-border-warm">
              <Badge variant="healthy" dot>
                Healthy ({DESIGN_TOKENS.colors.status.healthy})
              </Badge>
              <Badge variant="warning" dot>
                Warning ({DESIGN_TOKENS.colors.status.warning})
              </Badge>
              <Badge variant="critical" dot>
                Critical ({DESIGN_TOKENS.colors.status.critical})
              </Badge>
              <Badge variant="info" dot>
                Information ({DESIGN_TOKENS.colors.status.information})
              </Badge>
              <Badge variant="neutral" dot>
                Neutral ({DESIGN_TOKENS.colors.status.neutral})
              </Badge>
              <Badge variant="burgundy" mono>
                Burgundy ({DESIGN_TOKENS.colors.deepBurgundy})
              </Badge>
            </div>
          </div>

          {/* Button Variants */}
          <div>
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-ink-secondary mb-2">
              Button Hierarchy
            </h3>
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-md bg-surface-cream border border-border-warm">
              <Button variant="primary" size="sm" leftIcon={<Layers className="w-3.5 h-3.5" />}>
                Primary Action
              </Button>
              <Button variant="secondary" size="sm">
                Secondary Cream
              </Button>
              <Button variant="outline" size="sm">
                Soft Ivory Outline
              </Button>
              <Button variant="ghost" size="sm">
                Subtle Ghost
              </Button>
              <Button variant="critical" size="sm">
                Critical Countermeasure
              </Button>
              <Button variant="primary" size="sm" isLoading>
                Executing
              </Button>
            </div>
          </div>

          {/* Accessible Form Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <FormField
              label="Target Route Scope"
              htmlFor="inspector-scope"
              helperText="Scoped to the currently active navigation route."
            >
              <Input
                id="inspector-scope"
                value={inspectorScopeName}
                onChange={(e) => setInspectorScopeName(e.target.value)}
                placeholder={item.expectedEndpoint}
              />
            </FormField>

            <FormField
              label={item.primaryFilterLabel}
              htmlFor="inspector-select"
              helperText="Uses standard native keyboard selection."
            >
              <Select
                id="inspector-select"
                value={primaryFilter}
                options={item.primaryFilterOptions}
                onChange={(e) => setPrimaryFilter(e.target.value)}
                className="w-full"
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField
                label="Operator Annotation"
                htmlFor="inspector-notes"
                helperText="Notes are stored locally for form control verification only."
              >
                <Textarea
                  id="inspector-notes"
                  rows={2}
                  value={inspectorNotes}
                  onChange={(e) => setInspectorNotes(e.target.value)}
                  placeholder="Enter pre-recovery checklist annotation or incident reference..."
                />
              </FormField>
            </div>

            <div className="sm:col-span-2 p-3 rounded-md bg-surface-cream border border-border-warm">
              <Switch
                checked={inspectorStrictMode}
                onChange={setInspectorStrictMode}
                label="Enforce Strict Non-Fabrication Guardrail"
                description="Withhold unverified operational metrics and disable mutation submission when FastAPI backend is offline."
              />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
