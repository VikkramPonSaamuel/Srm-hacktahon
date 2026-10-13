import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { CountermeasurePlaybooksPage } from './CountermeasurePlaybooksPage';
import { RecoveryExecutionsPage } from './RecoveryExecutionsPage';
import { ApprovalQueuePage } from './ApprovalQueuePage';
import { useApprovalQueueQuery } from '../api/recovery';
import { Button } from '../components/ui/Button';

export const RecoveryCenterPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab =
    (searchParams.get('tab') as 'playbooks' | 'executions' | 'approvals') || 'playbooks';
  const [activeTab, setActiveTab] = useState<'playbooks' | 'executions' | 'approvals'>(initialTab);

  const approvalsQuery = useApprovalQueueQuery('1h');
  const pendingCount = (approvalsQuery.data ?? []).filter((a) => a.status === 'pending').length;

  const handleTabChange = (tab: 'playbooks' | 'executions' | 'approvals') => {
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
              Recovery Center
            </h1>
            <span className="text-xs px-2 py-0.5 bg-burgundy/10 text-burgundy font-mono rounded font-semibold">
              AUTONOMOUS REMEDIATION
            </span>
          </div>
          <p className="text-xs text-ink-secondary mt-1">
            Safe, pre-approved recovery playbooks, automated failover controls, and auditable action ledgers.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center p-1 bg-surface-cream rounded-xl border border-border-warm shadow-depth-sm text-xs font-medium">
          <button
            type="button"
            onClick={() => handleTabChange('playbooks')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'playbooks'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Playbook Catalog</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('executions')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'executions'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Execution Timeline</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('approvals')}
            className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'approvals'
                ? 'bg-gradient-to-r from-burgundy to-[#852C4B] text-white shadow-depth-sm font-semibold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary/70'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Approval Queue</span>
            {pendingCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === 'approvals'
                    ? 'bg-white text-burgundy'
                    : 'bg-status-warning text-white'
                }`}
              >
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Pending Approval Callout if applicable */}
      {pendingCount > 0 && activeTab !== 'approvals' && (
        <div className="p-4 rounded-xl bg-status-warning/10 border border-status-warning/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-status-warning text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-ink-primary">
                {pendingCount} Recovery {pendingCount === 1 ? 'Action Requires' : 'Actions Require'} Operator Approval
              </div>
              <div className="text-[11px] text-ink-secondary mt-0.5">
                High-blast-radius countermeasures require dual-key human approval before execution.
              </div>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleTabChange('approvals')}
            className="bg-status-warning hover:bg-status-warning/90 text-white text-xs"
          >
            <span>Review Approvals ({pendingCount})</span>
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
      )}

      {/* Render Active View */}
      {activeTab === 'playbooks' && <CountermeasurePlaybooksPage />}
      {activeTab === 'executions' && <RecoveryExecutionsPage />}
      {activeTab === 'approvals' && <ApprovalQueuePage />}
    </div>
  );
};
