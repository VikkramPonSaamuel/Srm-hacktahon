import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Flame,
  Globe,
  MessageSquare,
} from 'lucide-react';
import { ComplaintIntelligencePage } from './ComplaintIntelligencePage';
import { BrandProtectionPage } from './BrandProtectionPage';
import { ThreatMonitoringPage } from './ThreatMonitoringPage';

export const SignalsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'complaints' | 'brand' | 'threats') || 'complaints';
  const [activeTab, setActiveTab] = useState<'complaints' | 'brand' | 'threats'>(initialTab);

  const handleTabChange = (tab: 'complaints' | 'brand' | 'threats') => {
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
              Brand &amp; Customer Signals
            </h1>
            <span className="text-xs px-2 py-0.5 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">
              EXTERNAL SENSORS
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Customer sentiment surges, lookalike brand impersonations, and edge bot traffic bursts.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-surface-cream rounded-xl border border-border-warm shadow-depth-sm text-xs font-medium">
          <button
            type="button"
            onClick={() => handleTabChange('complaints')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'complaints'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Voice of Customer (VoC)</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('brand')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'brand'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Brand Impersonation</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('threats')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'threats'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Traffic &amp; Bot Defense</span>
          </button>
        </div>
      </div>

      {/* Render Active View */}
      {activeTab === 'complaints' && <ComplaintIntelligencePage />}
      {activeTab === 'brand' && <BrandProtectionPage />}
      {activeTab === 'threats' && <ThreatMonitoringPage />}
    </div>
  );
};
