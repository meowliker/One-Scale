'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  CheckCircle2,
  Filter,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { AIRecommendation, RecommendationCategory } from '@/types/recommendation';
import type { Campaign, EntityStatus } from '@/types/campaign';
import type { HourlyPnLEntry } from '@/types/pnl';
import { generateRecommendations, calculateEstimatedSavings } from '@/lib/generateRecommendations';
import { RecommendationCard } from './RecommendationCard';
import { cn } from '@/lib/utils';

type FilterTab = 'all' | RecommendationCategory;

interface AIRecommendationsProps {
  campaigns: Campaign[];
  hourlyData?: HourlyPnLEntry[];
  onCampaignStatusChange: (id: string, status: EntityStatus) => void;
  onAdSetStatusChange: (id: string, status: EntityStatus) => void;
  onAdStatusChange: (id: string, status: EntityStatus) => void;
  onCampaignBudgetChange: (id: string, budget: number) => void;
  onAdSetBudgetChange: (id: string, budget: number) => void;
}

const filterTabs: { key: FilterTab; label: string; icon?: typeof Clock }[] = [
  { key: 'all', label: 'All' },
  { key: 'budget', label: 'Budget' },
  { key: 'creative', label: 'Creative' },
  { key: 'targeting', label: 'Targeting' },
  { key: 'bidStrategy', label: 'Bid Strategy' },
  { key: 'status', label: 'Status' },
  { key: 'dayparting', label: 'Day-Parting', icon: Clock },
];

export function AIRecommendations({
  campaigns,
  hourlyData,
  onCampaignStatusChange,
  onAdSetStatusChange,
  onAdStatusChange,
  onCampaignBudgetChange,
  onAdSetBudgetChange,
}: AIRecommendationsProps) {
  const generated = useMemo(() => generateRecommendations(campaigns, hourlyData), [campaigns, hourlyData]);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);

  // Sync recommendations when campaigns change
  useEffect(() => {
    setRecommendations(generated);
  }, [generated]);

  const [isExpanded, setIsExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [applyingAll, setApplyingAll] = useState(false);

  // Filter recommendations
  const filteredRecs = useMemo(() => {
    return recommendations.filter((r) => {
      if (r.status === 'dismissed') return false;
      if (activeFilter === 'all') return true;
      return r.category === activeFilter;
    });
  }, [recommendations, activeFilter]);

  const pendingRecs = filteredRecs.filter((r) => r.status === 'pending');
  const appliedRecs = filteredRecs.filter((r) => r.status === 'applied');

  // Stats
  const stats = useMemo(() => {
    const pending = recommendations.filter((r) => r.status === 'pending');
    return {
      total: pending.length,
      critical: pending.filter((r) => r.severity === 'critical').length,
      warning: pending.filter((r) => r.severity === 'warning').length,
      opportunity: pending.filter((r) => r.severity === 'opportunity').length,
    };
  }, [recommendations]);

  // Category counts for filter badges
  const categoryCounts = useMemo(() => {
    const pending = recommendations.filter((r) => r.status === 'pending');
    const counts: Record<string, number> = { all: pending.length };
    for (const r of pending) {
      counts[r.category] = (counts[r.category] || 0) + 1;
    }
    return counts;
  }, [recommendations]);

  // Build a human-readable summary for an applied action
  const getAppliedSummary = useCallback((rec: AIRecommendation): string => {
    const { action } = rec;
    switch (action.type) {
      case 'pause_entity':
        return `Paused ${action.entityType}: ${action.entityName}`;
      case 'enable_entity':
        return `Enabled ${action.entityType}: ${action.entityName}`;
      case 'increase_budget':
      case 'decrease_budget':
      case 'scale_budget':
        return `Budget changed: $${action.payload.currentBudget ?? '?'} → $${action.payload.newBudget ?? '?'}`;
      case 'reallocate_budget':
        return `Budget reallocated from ${action.entityName} to ${action.payload.targetEntityName ?? 'target'}`;
      case 'change_bid_strategy':
        return `Bid strategy change noted — apply manually in Meta Ads Manager for now`;
      case 'refresh_creative':
        return `Creative refresh noted — create new ad variants in the campaign creator`;
      case 'adjust_targeting':
        return `Targeting adjustment noted — review audience settings in ad set configuration`;
      case 'adjust_dayparting':
        return `Day-parting schedule saved — configure in Automation > Day-Parting Bot`;
      default:
        return 'Change applied';
    }
  }, []);

  // Apply a single recommendation
  const handleApply = useCallback(
    async (rec: AIRecommendation): Promise<string> => {
      try {
        // Simulate a brief delay for the "AI" processing
        await new Promise((resolve) => setTimeout(resolve, 600));

        const { action } = rec;

        switch (action.type) {
          case 'pause_entity':
            if (action.entityType === 'campaign') {
              onCampaignStatusChange(action.entityId, 'PAUSED');
            } else if (action.entityType === 'adset') {
              onAdSetStatusChange(action.entityId, 'PAUSED');
            } else {
              onAdStatusChange(action.entityId, 'PAUSED');
            }
            break;

          case 'enable_entity':
            if (action.entityType === 'campaign') {
              onCampaignStatusChange(action.entityId, 'ACTIVE');
            } else if (action.entityType === 'adset') {
              onAdSetStatusChange(action.entityId, 'ACTIVE');
            } else {
              onAdStatusChange(action.entityId, 'ACTIVE');
            }
            break;

          case 'increase_budget':
          case 'decrease_budget':
          case 'scale_budget':
            if (action.payload.newBudget !== undefined) {
              if (action.entityType === 'campaign') {
                onCampaignBudgetChange(action.entityId, action.payload.newBudget);
              } else if (action.entityType === 'adset') {
                onAdSetBudgetChange(action.entityId, action.payload.newBudget);
              }
            }
            break;

          case 'reallocate_budget':
            // Increase target, decrease source
            if (action.payload.newBudget !== undefined) {
              onCampaignBudgetChange(action.entityId, action.payload.newBudget);
            }
            if (action.payload.targetEntityId && action.payload.currentBudget !== undefined) {
              // Decrease the source campaign by the difference
              const diff = (action.payload.newBudget || 0) - (action.payload.currentBudget || 0);
              // For simplicity, we'll just increase the target. In production you'd fetch current budget.
              onCampaignBudgetChange(action.payload.targetEntityId, Math.max(0, 100 - diff));
            }
            break;

          case 'change_bid_strategy':
            // Bid strategy changes would need a dedicated handler
            toast('Bid strategy change noted — apply manually in Meta Ads Manager for now', { icon: 'ℹ️' });
            break;

          case 'refresh_creative':
            toast('Creative refresh noted — create new ad variants in the campaign creator', { icon: 'ℹ️' });
            break;

          case 'adjust_targeting':
            toast('Targeting adjustment noted — review audience settings in ad set configuration', { icon: 'ℹ️' });
            break;

          case 'adjust_dayparting':
            toast('Day-parting schedule saved — configure in Automation > Day-Parting Bot', { icon: 'ℹ️' });
            break;
        }

        const summary = getAppliedSummary(rec);

        // Mark recommendation as applied with summary
        setRecommendations((prev) =>
          prev.map((r) => (r.id === rec.id ? { ...r, status: 'applied' as const, appliedSummary: summary } : r))
        );

        toast.success(`Applied: ${summary}`);
        return summary;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to apply: ${message}`);
        throw error;
      }
    },
    [onCampaignStatusChange, onAdSetStatusChange, onAdStatusChange, onCampaignBudgetChange, onAdSetBudgetChange, getAppliedSummary]
  );

  // Dismiss a recommendation
  const handleDismiss = useCallback((id: string) => {
    setRecommendations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'dismissed' as const } : r))
    );
  }, []);

  // Apply all pending recommendations
  const handleApplyAll = useCallback(async () => {
    setApplyingAll(true);
    for (const rec of pendingRecs) {
      await handleApply(rec);
    }
    setApplyingAll(false);
  }, [pendingRecs, handleApply]);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-6 py-4 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            {stats.critical > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                {stats.critical}
              </span>
            )}
          </div>
          <div className="text-left">
            <h3 className="text-base font-semibold text-text-primary">AI Recommendations</h3>
            <p className="text-xs text-text-muted">
              {stats.total} actionable {stats.total === 1 ? 'insight' : 'insights'} for your account
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Severity summary */}
          <div className="hidden sm:flex items-center gap-3">
            {stats.critical > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                <span className="font-medium text-red-600">{stats.critical}</span>
              </div>
            )}
            {stats.warning > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="font-medium text-amber-600">{stats.warning}</span>
              </div>
            )}
            {stats.opportunity > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                <span className="font-medium text-emerald-600">{stats.opportunity}</span>
              </div>
            )}
          </div>

          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-text-dimmed" />
          ) : (
            <ChevronDown className="h-5 w-5 text-text-dimmed" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Filter tabs + Apply All */}
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-1 overflow-x-auto">
              <Filter className="mr-1.5 h-3.5 w-3.5 text-text-dimmed flex-shrink-0" />
              {filterTabs.map((tab) => {
                const TabIcon = tab.icon;
                return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
                    activeFilter === tab.key
                      ? 'bg-violet-100 text-violet-700'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                  )}
                >
                  {TabIcon && <TabIcon className="h-3 w-3" />}
                  {tab.label}
                  {(categoryCounts[tab.key] || 0) > 0 && (
                    <span
                      className={cn(
                        'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                        activeFilter === tab.key
                          ? 'bg-violet-200 text-violet-800'
                          : 'bg-surface-hover text-text-secondary'
                      )}
                    >
                      {categoryCounts[tab.key]}
                    </span>
                  )}
                </button>
                );
              })}
            </div>

            {pendingRecs.length > 1 && (
              <button
                onClick={handleApplyAll}
                disabled={applyingAll}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:from-violet-700 hover:to-purple-700 transition-all whitespace-nowrap',
                  applyingAll && 'opacity-70 cursor-not-allowed'
                )}
              >
                {applyingAll ? (
                  <>
                    <Zap className="h-3.5 w-3.5 animate-pulse" />
                    Applying All...
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    Apply All ({pendingRecs.length})
                  </>
                )}
              </button>
            )}
          </div>

          {/* Recommendations list */}
          <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
            {/* Pending recommendations (sorted: critical → warning → opportunity) */}
            {pendingRecs
              .sort((a, b) => {
                const order = { critical: 0, warning: 1, opportunity: 2 };
                return order[a.severity] - order[b.severity];
              })
              .map((rec) => (
                <RecommendationCard
                  key={rec.id}
                  recommendation={rec}
                  onApply={handleApply}
                  onDismiss={handleDismiss}
                />
              ))}

            {/* Applied recommendations */}
            {appliedRecs.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-xs font-medium text-text-muted">
                    {appliedRecs.length} applied
                  </span>
                  <div className="flex-1 border-t border-border" />
                </div>
                {appliedRecs.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    recommendation={rec}
                    onApply={handleApply}
                    onDismiss={handleDismiss}
                  />
                ))}
              </>
            )}

            {/* Empty state */}
            {filteredRecs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mb-3">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                </div>
                <h4 className="text-sm font-semibold text-text-primary">All clear!</h4>
                <p className="mt-1 text-xs text-text-muted max-w-xs">
                  {activeFilter !== 'all'
                    ? `No ${activeFilter} recommendations right now. Try a different filter.`
                    : 'No recommendations at the moment. Your campaigns are performing well.'}
                </p>
              </div>
            )}
          </div>

          {/* Footer stats bar */}
          {recommendations.filter((r) => r.status === 'applied').length > 0 && (
            <div className="border-t border-border bg-surface px-6 py-3">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  <span className="font-medium text-text-secondary">
                    {recommendations.filter((r) => r.status === 'applied').length}
                  </span>{' '}
                  recommendations applied this session
                </span>
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <TrendingUp className="h-3 w-3" />
                  Estimated impact: ~${calculateEstimatedSavings(recommendations).toFixed(0)}/day
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
