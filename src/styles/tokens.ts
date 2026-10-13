/**
 * SYNESIS ’26 — Autonomous Business Monitoring, Intelligence & Recovery
 * Canonical Design System Tokens
 */
export const DESIGN_TOKENS = {
  colors: {
    primaryBurgundy: '#6D1735',
    deepBurgundy: '#431024',
    darkWine: '#2A0A17',
    secondaryBurgundy: '#8D3151',
    cleanWhite: '#FFFFFF',
    warmOffWhite: '#FAF8F9',
    lightSurface: '#F3EEF1',
    borderSubtle: '#E8DDE2',
    primaryText: '#24151C',
    secondaryText: '#776771',
    mutedText: '#A0919B',
    // Compatibility aliases
    deepBurgundyCompat: '#6D1735',
    darkBurgundy: '#431024',
    burgundyAccent: '#8D3151',
    warmCreamBackground: '#FAF8F9',
    softIvorySurface: '#FFFFFF',
    secondaryCream: '#F3EEF1',
    warmBorder: '#E8DDE2',
    status: {
      healthy: '#16845B',
      success: '#16845B',
      warning: '#C78625',
      critical: '#C43C4B',
      information: '#5578C7',
      neutral: '#776771',
    },
  },
  fonts: {
    heading: '"Plus Jakarta Sans", "Manrope", system-ui, -apple-system, sans-serif',
    body: '"Inter", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, monospace',
  },
} as const;

export type SemanticStatus = 'healthy' | 'warning' | 'critical' | 'info' | 'neutral' | 'burgundy';

export type TimeRangeValue = '15m' | '1h' | '6h' | '24h' | '7d' | '30d';

export interface TimeRangeOption {
  value: TimeRangeValue;
  label: string;
  shortLabel: string;
}

export const TIME_RANGE_OPTIONS: readonly TimeRangeOption[] = [
  { value: '15m', label: 'Last 15 minutes', shortLabel: '15m' },
  { value: '1h', label: 'Last 1 hour', shortLabel: '1h' },
  { value: '6h', label: 'Last 6 hours', shortLabel: '6h' },
  { value: '24h', label: 'Last 24 hours', shortLabel: '24h' },
  { value: '7d', label: 'Last 7 days', shortLabel: '7d' },
  { value: '30d', label: 'Last 30 days', shortLabel: '30d' },
] as const;
