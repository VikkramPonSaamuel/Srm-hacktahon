import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GitBranch,
  Layers,
  Network,
} from 'lucide-react';
import { RootCauseAnalysisPage } from './RootCauseAnalysisPage';
import { FailurePatternsPage } from './FailurePatternsPage';
import { IncidentCorrelationPage } from './IncidentCorrelationPage';

export const AiInsightsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'rca' | 'patterns' | 'correlation') || 'rca';
  const [activeTab, setActiveTab] = useState<'rca' | 'patterns' | 'correlation'>(initialTab);

  const handleTabChange = (tab: 'rca' | 'patterns' | 'correlation') => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-ink-primary tracking-tight">
              AI Insights &amp; Diagnostics
            </h1>
            <span className="text-xs px-2 py-0.5 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">
              SYNTHESIS ENGINE
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Automated root-cause analysis, recurring error pattern detection, and multi-signal causal correlation.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-surface-cream rounded-xl border border-border-warm shadow-depth-sm text-xs font-medium">
          <button
            type="button"
            onClick={() => handleTabChange('rca')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'rca'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Root Cause Analysis</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('patterns')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'patterns'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Recurring Patterns</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('correlation')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'correlation'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Causal Correlation</span>
          </button>
        </div>
      </div>

      {/* Render Active View */}
      {activeTab === 'rca' && <RootCauseAnalysisPage />}
      {activeTab === 'patterns' && <FailurePatternsPage />}
      {activeTab === 'correlation' && <IncidentCorrelationPage />}
    </div>
  );
};
