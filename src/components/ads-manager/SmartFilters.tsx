'use client';

import { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, X, Search, SlidersHorizontal } from 'lucide-react';
import { mockCampaigns } from '@/data/mockCampaigns';
import { objectiveToFunnel, funnelStages } from '@/data/mockFunnelStages';
import type { FunnelStage } from '@/data/mockFunnelStages';
import type { EntityStatus } from '@/types/campaign';

export interface SmartFilterState {
  funnelStages: FunnelStage[];
  statuses: EntityStatus[];
  minRoas: number | null;
  maxCpa: number | null;
  nameSearch: string;
}

const defaultFilterState: SmartFilterState = {
  funnelStages: [],
  statuses: [],
  minRoas: null,
  maxCpa: null,
  nameSearch: '',
};

export function useSmartFilters() {
  const [filters, setFilters] = useState<SmartFilterState>(defaultFilterState);

  const filteredCampaignIds = useMemo(() => {
    return mockCampaigns
      .filter((campaign) => {
        // Funnel stage filter
        if (filters.funnelStages.length > 0) {
          const stage = objectiveToFunnel[campaign.objective];
          if (!stage || !filters.funnelStages.includes(stage)) return false;
        }

        // Status filter
        if (filters.statuses.length > 0) {
          if (!filters.statuses.includes(campaign.status)) return false;
        }

        // Min ROAS filter
        if (filters.minRoas !== null && campaign.metrics.roas < filters.minRoas) {
          return false;
        }

        // Max CPA filter
        if (filters.maxCpa !== null && campaign.metrics.cpa > filters.maxCpa) {
          return false;
        }

        // Name search filter
        if (filters.nameSearch.trim()) {
          const search = filters.nameSearch.toLowerCase();
          if (!campaign.name.toLowerCase().includes(search)) return false;
        }

        return true;
      })
      .map((c) => c.id);
  }, [filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.funnelStages.length > 0) count++;
    if (filters.statuses.length > 0) count++;
    if (filters.minRoas !== null) count++;
    if (filters.maxCpa !== null) count++;
    if (filters.nameSearch.trim()) count++;
    return count;
  }, [filters]);

  const clearAll = useCallback(() => setFilters(defaultFilterState), []);

  const updateFilter = useCallback(<K extends keyof SmartFilterState>(key: K, value: SmartFilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFunnelStage = useCallback((stage: FunnelStage) => {
    setFilters((prev) => ({
      ...prev,
      funnelStages: prev.funnelStages.includes(stage)
        ? prev.funnelStages.filter((s) => s !== stage)
        : [...prev.funnelStages, stage],
    }));
  }, []);

  const toggleStatus = useCallback((status: EntityStatus) => {
    setFilters((prev) => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter((s) => s !== status)
        : [...prev.statuses, status],
    }));
  }, []);

  return {
    filters,
    filteredCampaignIds,
    activeFilterCount,
    clearAll,
    updateFilter,
    toggleFunnelStage,
    toggleStatus,
  };
}

interface SmartFiltersProps {
  filters: SmartFilterState;
  activeFilterCount: number;
  onClearAll: () => void;
  onUpdateFilter: <K extends keyof SmartFilterState>(key: K, value: SmartFilterState[K]) => void;
  onToggleFunnelStage: (stage: FunnelStage) => void;
  onToggleStatus: (status: EntityStatus) => void;
}

export function SmartFilters({
  filters,
  activeFilterCount,
  onClearAll,
  onUpdateFilter,
  onToggleFunnelStage,
  onToggleStatus,
}: SmartFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const activeBadges: { label: string; onRemove: () => void }[] = [];

  filters.funnelStages.forEach((stage) => {
    const config = funnelStages.find((f) => f.stage === stage);
    if (config) {
      activeBadges.push({
        label: config.label,
        onRemove: () => onToggleFunnelStage(stage),
      });
    }
  });

  filters.statuses.forEach((status) => {
    activeBadges.push({
      label: status === 'ACTIVE' ? 'Active' : 'Paused',
      onRemove: () => onToggleStatus(status),
    });
  });

  if (filters.minRoas !== null) {
    activeBadges.push({
      label: `ROAS > ${filters.minRoas}`,
      onRemove: () => onUpdateFilter('minRoas', null),
    });
  }

  if (filters.maxCpa !== null) {
    activeBadges.push({
      label: `CPA < $${filters.maxCpa}`,
      onRemove: () => onUpdateFilter('maxCpa', null),
    });
  }

  if (filters.nameSearch.trim()) {
    activeBadges.push({
      label: `"${filters.nameSearch}"`,
      onRemove: () => onUpdateFilter('nameSearch', ''),
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface-elevated">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Smart Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-white">
              {activeFilterCount}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-text-dimmed" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-dimmed" />
          )}
        </button>

        {/* Active badges */}
        {activeBadges.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {activeBadges.map((badge) => (
                <span
                  key={badge.label}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary-light"
                >
                  {badge.label}
                  <button
                    type="button"
                    onClick={badge.onRemove}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onClearAll}
              className="text-xs font-medium text-text-muted hover:text-text-secondary"
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Expanded filter panel */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Funnel Stage */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Funnel Stage
              </label>
              <div className="flex flex-col gap-1.5">
                {funnelStages.map((config) => (
                  <label
                    key={config.stage}
                    className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary"
                  >
                    <input
                      type="checkbox"
                      checked={filters.funnelStages.includes(config.stage)}
                      onChange={() => onToggleFunnelStage(config.stage)}
                      className="h-3.5 w-3.5 rounded border-border-light text-primary-light focus:ring-primary"
                    />
                    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium', config.bgColor, config.color)}>
                      {config.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Performance */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Performance
              </label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-muted w-16">ROAS &gt;</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 2.0"
                    value={filters.minRoas ?? ''}
                    onChange={(e) =>
                      onUpdateFilter('minRoas', e.target.value ? parseFloat(e.target.value) : null)
                    }
                    className="w-24 rounded border border-border-light px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-muted w-16">CPA &lt; $</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="e.g. 20"
                    value={filters.maxCpa ?? ''}
                    onChange={(e) =>
                      onUpdateFilter('maxCpa', e.target.value ? parseFloat(e.target.value) : null)
                    }
                    className="w-24 rounded border border-border-light px-2 py-1 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Status
              </label>
              <div className="flex flex-col gap-1.5">
                {(['ACTIVE', 'PAUSED'] as EntityStatus[]).map((status) => (
                  <label
                    key={status}
                    className="flex cursor-pointer items-center gap-2 text-sm text-text-secondary"
                  >
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(status)}
                      onChange={() => onToggleStatus(status)}
                      className="h-3.5 w-3.5 rounded border-border-light text-primary-light focus:ring-primary"
                    />
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        status === 'ACTIVE'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-surface-hover text-text-secondary'
                      )}
                    >
                      {status === 'ACTIVE' ? 'Active' : 'Paused'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Name Search */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Name Search
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dimmed" />
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={filters.nameSearch}
                  onChange={(e) => onUpdateFilter('nameSearch', e.target.value)}
                  className="w-full rounded border border-border-light py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
