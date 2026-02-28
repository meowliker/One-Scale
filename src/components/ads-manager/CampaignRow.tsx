'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, AlertTriangle, Lock } from 'lucide-react';
import type { Campaign, EntityStatus } from '@/types/campaign';
import type { MetricKey } from '@/types/metrics';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import type { EntityAction } from '@/types/latestActions';
import { cn } from '@/lib/utils';
import { getMetricValue } from '@/lib/metrics';
import { Checkbox } from '@/components/ui/Checkbox';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { MetricCell } from './MetricCell';
import { PerformanceSparkline } from './PerformanceSparkline';
import { LatestActionsCell } from './LatestActionsCell';

export interface CampaignRowProps {
  campaign: Campaign;
  rowId?: string;
  isHighlighted?: boolean;
  issueCount?: number;
  onIssueClick?: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (status: EntityStatus) => void;
  onBudgetChange: (newBudget: number) => void;
  columnOrder: MetricKey[];
  sparklineData?: Record<string, SparklineDataPoint[]>;
  activityData?: Record<string, EntityAction[]>;
  activitiesFullyLoaded?: boolean;
  nameColWidth?: number;
  isToggling?: boolean;
  flashType?: 'success' | 'error';
  /** Shopify-attributed ROAS for this campaign (Real ROAS) */
  shopifyRoas?: number;
}

const objectiveLabels: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' }> = {
  CONVERSIONS: { label: 'Conversions', variant: 'success' },
  TRAFFIC: { label: 'Traffic', variant: 'info' },
  REACH: { label: 'Reach', variant: 'info' },
  ENGAGEMENT: { label: 'Engagement', variant: 'warning' },
  APP_INSTALLS: { label: 'App Installs', variant: 'default' },
  VIDEO_VIEWS: { label: 'Video Views', variant: 'default' },
  LEAD_GENERATION: { label: 'Lead Gen', variant: 'warning' },
  BRAND_AWARENESS: { label: 'Brand', variant: 'info' },
};

const bidStrategyLabels: Record<string, string> = {
  LOWEST_COST: 'Lowest Cost',
  COST_CAP: 'Cost Cap',
  BID_CAP: 'Bid Cap',
  MINIMUM_ROAS: 'Min ROAS',
};

export function CampaignRow({
  campaign,
  rowId,
  isHighlighted = false,
  issueCount = 0,
  onIssueClick,
  isExpanded,
  onToggleExpand,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onBudgetChange,
  columnOrder,
  sparklineData,
  activityData,
  activitiesFullyLoaded,
  nameColWidth,
  isToggling = false,
  flashType,
  shopifyRoas,
}: CampaignRowProps) {
  const isActive = campaign.status === 'ACTIVE';
  const [showStatusTooltip, setShowStatusTooltip] = useState(false);
  const activeAdSetsCount = campaign.adSets.filter((a) => a.status === 'ACTIVE').length;
  const isABO = !(campaign.dailyBudget > 0) && !(campaign.lifetimeBudget && campaign.lifetimeBudget > 0);
  const isLifetimeBudget = !isABO && campaign.lifetimeBudget && campaign.lifetimeBudget > 0;
  const objective = objectiveLabels[campaign.objective] ?? { label: campaign.objective, variant: 'default' as const };
  const stickyBg = cn(
    'bg-[var(--apple-table-row-bg)]',
    isSelected && 'bg-[var(--apple-table-row-selected)]',
    isHighlighted && 'bg-[var(--apple-table-row-highlighted)]',
    flashType === 'success' && 'bg-[var(--apple-table-row-flash-success)]',
    flashType === 'error' && 'bg-[var(--apple-table-row-flash-error)]'
  );

  return (
    <tr
      id={rowId}
      className={cn(
        'group border-b border-[rgba(0,0,0,0.04)] dark:border-border bg-[var(--apple-table-row-bg)] transition-colors duration-150',
        'hover:!bg-[var(--apple-table-row-hover)]',
        isSelected && 'bg-[var(--apple-table-row-selected)]',
        isHighlighted && 'bg-[var(--apple-table-row-highlighted)]',
        flashType === 'success' && 'bg-[var(--apple-table-row-flash-success)]',
        flashType === 'error' && 'bg-[var(--apple-table-row-flash-error)]'
      )}
    >
      {/* Checkbox */}
      <td className={cn("w-10 min-w-[40px] max-w-[40px] whitespace-nowrap px-3 py-2 sticky left-0 z-10 group-hover:!bg-[var(--apple-table-row-hover)] transition-colors duration-150", stickyBg)}>
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </td>

      {/* Toggle — 70px */}
      <td className={cn("min-w-[70px] max-w-[70px] whitespace-nowrap px-3 py-2 sticky left-[40px] z-10 group-hover:!bg-[var(--apple-table-row-hover)] transition-colors duration-150", stickyBg)} style={{ width: 70 }}>
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
          loading={isToggling}
        />
      </td>

      {/* Name + Objective + CBO/ABO */}
      <td
        className={cn("whitespace-nowrap px-3 py-2 sticky left-[110px] z-10 group-hover:!bg-[var(--apple-table-row-hover)] transition-colors duration-150 border-r border-[rgba(0,0,0,0.04)] dark:border-r-border", stickyBg)}
        style={nameColWidth ? { width: nameColWidth, minWidth: nameColWidth } : undefined}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 transition-transform duration-200" />
            ) : (
              <ChevronRight className="h-4 w-4 transition-transform duration-200" />
            )}
          </button>
          <div className="relative group/tooltip">
            <button
              onClick={onToggleExpand}
              className="truncate max-w-[220px] block text-[13px] font-medium text-text-primary hover:text-primary transition-colors duration-150 text-left"
            >
              {campaign.name}
            </button>
            <div className="absolute left-0 top-full mt-1 z-50 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 translate-y-1 group-hover/tooltip:translate-y-0 transition-all duration-150 ease-out">
              <div className="onescale-tooltip whitespace-nowrap max-w-xs">
                {campaign.name}
              </div>
            </div>
          </div>
          {/* CBO/ABO — small outlined pill */}
          <Badge variant={campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'info' : 'warning'} size="sm">
            {campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'CBO' : 'ABO'}
          </Badge>
          {/* Objective as subtle muted text */}
          <span className="text-[9px] font-medium text-text-dimmed uppercase tracking-wide">{objective.label}</span>
          {issueCount > 0 && (
            <button
              onClick={() => onIssueClick?.()}
              className="inline-flex items-center gap-1 rounded-md bg-[#fff4e5] px-2 py-0.5 text-[11px] font-medium text-[#cc7700] hover:bg-[#ffedcc] transition-colors duration-150"
              title="This campaign has issues"
            >
              <AlertTriangle className="h-3 w-3" />
              {issueCount} issue{issueCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="whitespace-nowrap px-3 py-2">
        <div className="relative">
          {isActive ? (
            <button
              type="button"
              onMouseEnter={() => setShowStatusTooltip(true)}
              onMouseLeave={() => setShowStatusTooltip(false)}
              onClick={() => { if (!isExpanded) onToggleExpand(); }}
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-semibold apple-status-active cursor-pointer',
                'hover:bg-[#bbf7d0] dark:hover:bg-emerald-900/60 transition-all duration-150 hover:scale-[1.02]'
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active
            </button>
          ) : (
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold apple-status-paused cursor-not-allowed"
              title="Campaign is paused"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#aeaeb2]" />
              Paused
            </span>
          )}
          {showStatusTooltip && isActive && (
            <div className="onescale-tooltip absolute left-0 top-full mt-1.5 z-50 min-w-[200px] p-3 px-4 animate-tooltip-in">
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between gap-6">
                  <span className="text-[11px] text-text-muted">Status</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Active</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-[11px] text-text-muted">Running since</span>
                  <span className="font-medium text-text-primary">{new Date(campaign.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-[11px] text-text-muted">Active ad sets</span>
                  <span className="font-bold text-text-primary">{campaign.adSets.length > 0 ? activeAdSetsCount : '\u2014'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </td>

      {/* Budget — ABO has no campaign-level budget (it lives on each ad set) */}
      <td className="whitespace-nowrap px-3 py-2">
        {isABO ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-text-dimmed">
            <Lock className="h-3 w-3" />
            <span className="italic">Ad set budgets</span>
          </span>
        ) : (
          <InlineEdit
            value={(isLifetimeBudget ? campaign.lifetimeBudget! : (campaign.dailyBudget ?? 0)).toFixed(2)}
            onSave={(val) => {
              const num = parseFloat(val);
              if (!isNaN(num) && num > 0) onBudgetChange(num);
            }}
            type="number"
            prefix="$"
          />
        )}
      </td>

      {/* Bid Strategy + Cap Value */}
      <td className="whitespace-nowrap px-3 py-2 text-sm text-text-secondary">
        <div className="flex flex-col">
          <span>{bidStrategyLabels[campaign.bidStrategy] ?? campaign.bidStrategy}</span>
          {(campaign.bidStrategy === 'BID_CAP' || campaign.bidStrategy === 'COST_CAP') && (() => {
            const capValue = campaign.adSets?.find((as) => as.bidAmount != null)?.bidAmount;
            return capValue != null ? (
              <span className="text-[10px] text-text-dimmed">${capValue.toFixed(2)} cap</span>
            ) : null;
          })()}
        </div>
      </td>

      {/* Performance Sparkline */}
      <PerformanceSparkline entityId={campaign.id} data={sparklineData?.[campaign.id]} currentRoas={campaign.metrics.roas} />

      {/* Latest Actions */}
      <LatestActionsCell entityId={campaign.id} actions={activityData?.[campaign.id]} activitiesFullyLoaded={activitiesFullyLoaded} />

      {/* Dynamic Metrics */}
      {columnOrder.map((key) => (
        <MetricCell
          key={key}
          metricKey={key}
          value={getMetricValue(campaign.metrics as unknown as Record<string, number>, key)}
          shopifyRoas={key === 'roas' ? shopifyRoas : undefined}
        />
      ))}
    </tr>
  );
}
