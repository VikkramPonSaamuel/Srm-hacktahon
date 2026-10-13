import React, { useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  UnavailableState,
} from './StateViews';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  mono?: boolean;
  align?: 'left' | 'right';
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  caption?: string;
  isLoading?: boolean;
  isUnavailable?: boolean;
  error?: { message: string; status?: number | null } | null;
  endpoint?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  caption,
  isLoading = false,
  isUnavailable = false,
  error = null,
  endpoint,
  emptyTitle = 'No telemetry records returned',
  emptyDescription = 'The query completed with zero matching records for the selected filter scope and time window.',
  onRetry,
  onRowClick,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortColumn === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(key);
      setSortDirection('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortColumn) return data;
    return [...data].sort((a, b) => {
      const valA = String(a[sortColumn] ?? '');
      const valB = String(b[sortColumn] ?? '');
      const cmp = valA.localeCompare(valB, undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [data, sortColumn, sortDirection]);

  return (
    <div className="bg-surface-ivory border border-border-warm rounded-lg overflow-hidden shadow-subtle">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-surface-secondary/70 border-b border-border-warm text-ink-secondary">
              {columns.map((col) => {
                const isSorted = sortColumn === col.key;
                const alignClass = col.align === 'right' ? 'text-right justify-end' : 'text-left';

                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      isSorted
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className={[
                      'py-2.5 px-4 font-semibold tracking-tight whitespace-nowrap select-none',
                      col.align === 'right' ? 'text-right' : 'text-left',
                    ].join(' ')}
                  >
                    {col.sortable !== false ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className={[
                          'inline-flex items-center gap-1 hover:text-ink-primary transition-colors',
                          alignClass,
                        ].join(' ')}
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          sortDirection === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-burgundy" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-burgundy" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown
                            className="w-3 h-3 text-ink-secondary/50"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    ) : (
                      <span>{col.header}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border-warm/70">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="p-4">
                  <LoadingState rows={3} />
                </td>
              </tr>
            ) : isUnavailable ? (
              <tr>
                <td colSpan={columns.length} className="p-4">
                  <UnavailableState endpoint={endpoint} onRetry={onRetry} />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="p-4">
                  <ErrorState
                    message={error.message}
                    statusCode={error.status}
                    endpoint={endpoint}
                    onRetry={onRetry}
                  />
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-4">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    endpoint={endpoint}
                    actionLabel={onRetry ? 'Refresh query' : undefined}
                    onAction={onRetry}
                  />
                </td>
              </tr>
            ) : (
              sortedData.map((row, idx) => (
                <tr
                  key={rowKey(row, idx)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={[
                    'transition-colors',
                    onRowClick
                      ? 'cursor-pointer hover:bg-surface-secondary/50 focus-visible:bg-surface-secondary/60'
                      : 'hover:bg-surface-cream/60',
                  ].join(' ')}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        'py-2.5 px-4 text-ink-primary whitespace-nowrap',
                        col.mono ? 'font-mono text-[11px]' : '',
                        col.align === 'right' ? 'text-right' : 'text-left',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
