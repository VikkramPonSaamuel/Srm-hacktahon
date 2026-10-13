import React from 'react';
import { Filter, RotateCcw, Search, X } from 'lucide-react';
import { Input, Select, type SelectOption } from './FormControls';
import { Button } from './Button';

export interface FilterGroupConfig {
  id: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
}

export interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterGroupConfig[];
  onReset?: () => void;
  actions?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Filter records by ID, name, or attribute...',
  filters = [],
  onReset,
  actions,
}) => {
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filters.some((f) => f.value !== 'all' && f.value !== f.options[0]?.value);

  return (
    <div
      role="region"
      aria-label="Filter controls"
      className="bg-surface-ivory border border-border-warm rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 shadow-subtle"
    >
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
        <div className="w-full sm:w-64">
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            leftAddon={<Search className="w-3.5 h-3.5" />}
            rightAddon={
              searchQuery ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Clear filter search"
                  className="hover:text-ink-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : undefined
            }
          />
        </div>

        {filters.map((filter) => (
          <div key={filter.id} className="flex items-center gap-1.5">
            <label
              htmlFor={`filter-${filter.id}`}
              className="text-[11px] font-medium text-ink-secondary flex items-center gap-1 whitespace-nowrap"
            >
              <Filter className="w-3 h-3 text-ink-secondary/80" aria-hidden="true" />
              {filter.label}:
            </label>
            <Select
              id={`filter-${filter.id}`}
              value={filter.value}
              options={filter.options}
              onChange={(e) => filter.onChange(e.target.value)}
            />
          </div>
        ))}

        {hasActiveFilters && onReset && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onReset}
            leftIcon={<RotateCcw className="w-3 h-3" />}
          >
            Reset filters
          </Button>
        )}
      </div>

      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};
