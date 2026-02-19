'use client';

import { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Campaign } from '@/types/campaign';
import type { DateRangePreset } from '@/types/analytics';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface TopCampaignsTableProps {
  campaigns: Campaign[];
  datePreset?: DateRangePreset;
}

const objectiveBadgeColors: Record<string, string> = {
  CONVERSIONS: 'bg-emerald-500/15 text-emerald-400',
  TRAFFIC: 'bg-blue-500/15 text-blue-400',
  REACH: 'bg-purple-500/15 text-purple-400',
  ENGAGEMENT: 'bg-amber-500/15 text-amber-400',
  VIDEO_VIEWS: 'bg-pink-500/15 text-pink-400',
  LEAD_GENERATION: 'bg-orange-500/15 text-orange-400',
  APP_INSTALLS: 'bg-indigo-500/15 text-indigo-400',
  BRAND_AWARENESS: 'bg-teal-500/15 text-teal-400',
};

const statusConfig: Record<string, { dot: string; text: string; bg: string }> = {
  ACTIVE: { dot: 'bg-success', text: 'text-success-light', bg: 'bg-success/10' },
  PAUSED: { dot: 'bg-text-muted', text: 'text-text-secondary', bg: 'bg-surface-hover' },
  DELETED: { dot: 'bg-danger', text: 'text-danger-light', bg: 'bg-danger/10' },
  ARCHIVED: { dot: 'bg-text-dimmed', text: 'text-text-muted', bg: 'bg-surface-hover' },
};

/** Multipliers to simulate date-range scoped data from 30-day aggregate mock data */
const dateMultiplier: Record<string, number> = {
  today: 0.033,
  yesterday: 0.033,
  last7: 0.233,
  last14: 0.467,
  last30: 1.0,
  thisMonth: 1.0,
  lastMonth: 0.95,
};

/** Human-readable labels for each date preset */
const datePresetLabels: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  last14: 'Last 14 Days',
  last30: 'Last 30 Days',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
};

/** Quick-access period pills shown in the header */
const quickPeriods: { label: string; preset: DateRangePreset }[] = [
  { label: 'Day', preset: 'today' },
  { label: 'Week', preset: 'last7' },
  { label: 'Month', preset: 'last30' },
];

/** All available presets for the dropdown */
const allPresets: DateRangePreset[] = [
  'today',
  'yesterday',
  'last7',
  'last14',
  'last30',
  'thisMonth',
  'lastMonth',
];

function formatObjective(objective: string): string {
  return objective
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = {
    1: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
    2: 'bg-gray-300/15 text-gray-300 border-gray-300/30',
    3: 'bg-orange-400/15 text-orange-300 border-orange-400/30',
  };

  const color = colors[rank] ?? 'bg-surface-hover text-text-muted border-border';

  return (
    <span
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold',
        color
      )}
    >
      {rank}
    </span>
  );
}

function RoasBadge({ roas }: { roas: number }) {
  let classes = 'bg-danger/15 text-danger-light';
  if (roas >= 3) classes = 'bg-success/15 text-success-light';
  else if (roas >= 1.5) classes = 'bg-warning/15 text-warning-light';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold',
        classes
      )}
    >
      {roas.toFixed(2)}x
    </span>
  );
}

function applyDateMultiplier(campaign: Campaign, multiplier: number): Campaign {
  const m = campaign.metrics;
  const spend = m.spend * multiplier;
  const revenue = m.revenue * multiplier;
  const conversions = Math.round(m.conversions * multiplier);
  const impressions = Math.round(m.impressions * multiplier);
  const clicks = Math.round(m.clicks * multiplier);

  return {
    ...campaign,
    metrics: {
      ...m,
      spend,
      revenue,
      conversions,
      impressions,
      clicks,
      // Derived metrics
      roas: m.roas, // ROAS stays the same (ratio)
      cpa: conversions > 0 ? spend / conversions : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    },
  };
}

export function TopCampaignsTable({ campaigns, datePreset = 'last30' }: TopCampaignsTableProps) {
  const [localPreset, setLocalPreset] = useState<DateRangePreset>(datePreset);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Apply date multiplier to create transformed campaign data
  const transformedCampaigns = useMemo(() => {
    const multiplier = dateMultiplier[localPreset] ?? 1.0;
    return campaigns.map((c) => applyDateMultiplier(c, multiplier));
  }, [campaigns, localPreset]);

  const sorted = useMemo(
    () => [...transformedCampaigns].sort((a, b) => b.metrics.roas - a.metrics.roas),
    [transformedCampaigns]
  );

  const totalSpend = sorted.reduce((sum, c) => sum + c.metrics.spend, 0);

  const handlePresetChange = (preset: DateRangePreset) => {
    setLocalPreset(preset);
    setIsDropdownOpen(false);
  };

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
      {/* Header with title and date filter controls */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            Top Performing Campaigns
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Ranked by ROAS &middot; {datePresetLabels[localPreset] ?? 'Last 30 Days'}
          </p>
        </div>

        {/* Date filter controls */}
        <div className="flex items-center gap-2">
          {/* Quick period toggle pills */}
          <div className="flex rounded-lg border border-border bg-surface p-0.5">
            {quickPeriods.map((period) => (
              <button
                key={period.preset}
                onClick={() => handlePresetChange(period.preset)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-all',
                  localPreset === period.preset
                    ? 'bg-primary/15 text-primary-light shadow-sm'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                )}
              >
                {period.label}
              </button>
            ))}
          </div>

          {/* Full preset dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                isDropdownOpen
                  ? 'border-primary/40 bg-primary/10 text-primary-light'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              {datePresetLabels[localPreset] ?? 'Last 30 Days'}
              <ChevronDown
                className={cn(
                  'h-3 w-3 transition-transform',
                  isDropdownOpen && 'rotate-180'
                )}
              />
            </button>

            {isDropdownOpen && (
              <>
                {/* Invisible overlay to close dropdown when clicking outside */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-surface-elevated py-1 shadow-lg">
                  {allPresets.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handlePresetChange(preset)}
                      className={cn(
                        'flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors',
                        localPreset === preset
                          ? 'bg-primary/10 font-medium text-primary-light'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      )}
                    >
                      {datePresetLabels[preset]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="pb-3 pr-3 text-left font-medium text-text-muted w-8">
                #
              </th>
              <th className="pb-3 pr-4 text-left font-medium text-text-muted">
                Campaign
              </th>
              <th className="pb-3 px-4 text-left font-medium text-text-muted">
                Objective
              </th>
              <th className="pb-3 px-4 text-left font-medium text-text-muted">
                Status
              </th>
              <th className="pb-3 px-4 text-right font-medium text-text-muted">
                Spend
              </th>
              <th className="pb-3 px-4 text-left font-medium text-text-muted">
                Allocation
              </th>
              <th className="pb-3 px-4 text-right font-medium text-text-muted">
                Revenue
              </th>
              <th className="pb-3 px-4 text-right font-medium text-text-muted">
                ROAS
              </th>
              <th className="pb-3 pl-4 text-right font-medium text-text-muted">
                CPA
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((campaign, index) => {
              const rank = index + 1;
              const spendPercent = totalSpend > 0 ? (campaign.metrics.spend / totalSpend) * 100 : 0;
              const status = statusConfig[campaign.status] ?? statusConfig.PAUSED;

              return (
                <tr
                  key={campaign.id}
                  className="border-b border-border transition-colors hover:bg-surface-hover"
                >
                  {/* Rank */}
                  <td className="py-3 pr-3">
                    <RankBadge rank={rank} />
                  </td>
                  {/* Campaign name */}
                  <td className="py-3 pr-4">
                    <span className="font-medium text-text-primary">
                      {campaign.name}
                    </span>
                  </td>
                  {/* Objective */}
                  <td className="py-3 px-4">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                        objectiveBadgeColors[campaign.objective] ??
                          'bg-surface-hover text-text-secondary'
                      )}
                    >
                      {formatObjective(campaign.objective)}
                    </span>
                  </td>
                  {/* Status */}
                  <td className="py-3 px-4">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                        status.bg,
                        status.text
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                      {campaign.status.charAt(0) +
                        campaign.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  {/* Spend */}
                  <td className="py-3 px-4 text-right font-medium text-text-secondary">
                    {formatCurrency(campaign.metrics.spend)}
                  </td>
                  {/* Spend allocation bar */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-hover">
                        <div
                          className="h-full rounded-full bg-primary/60 transition-all duration-500"
                          style={{ width: `${Math.min(spendPercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-text-dimmed">
                        {spendPercent.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  {/* Revenue */}
                  <td className="py-3 px-4 text-right text-text-secondary">
                    {formatCurrency(campaign.metrics.revenue)}
                  </td>
                  {/* ROAS badge */}
                  <td className="py-3 px-4 text-right">
                    <RoasBadge roas={campaign.metrics.roas} />
                  </td>
                  {/* CPA */}
                  <td className="py-3 pl-4 text-right text-text-secondary">
                    {formatCurrency(campaign.metrics.cpa)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
