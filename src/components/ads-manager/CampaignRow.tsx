'use client';


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
}: CampaignRowProps) {
  const isActive = campaign.status === 'ACTIVE';
  const isABO = !(campaign.dailyBudget > 0) && !(campaign.lifetimeBudget && campaign.lifetimeBudget > 0);
  const isLifetimeBudget = !isABO && campaign.lifetimeBudget && campaign.lifetimeBudget > 0;
  const objective = objectiveLabels[campaign.objective] ?? { label: campaign.objective, variant: 'default' as const };
  const stickyBg = cn(
    'bg-white dark:bg-surface',
    isSelected && 'bg-[#e8f0fe]',
    isHighlighted && 'bg-[#fff8e1]',
    flashType === 'success' && 'bg-[#f0fdf4]',
    flashType === 'error' && 'bg-[#fef2f2]'
  );

  return (
    <tr
      id={rowId}
      className={cn(
        'group border-b border-[rgba(0,0,0,0.04)] dark:border-border bg-white dark:bg-surface transition-colors duration-150',
        'hover:!bg-[#f9fafb] dark:hover:!bg-[#273449]',
        isSelected && 'bg-[#e8f0fe]',
        isHighlighted && 'bg-[#fff8e1]',
        flashType === 'success' && 'bg-[#f0fdf4]',
        flashType === 'error' && 'bg-[#fef2f2]'
      )}
    >
      {/* Checkbox */}
      <td className={cn("w-10 whitespace-nowrap px-3 py-2 sticky left-0 z-10 group-hover:!bg-[#f9fafb] dark:group-hover:!bg-[#273449] transition-colors duration-150", stickyBg)}>
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </td>

      {/* Toggle */}
      <td className={cn("w-14 whitespace-nowrap px-3 py-2 sticky left-[40px] z-10 group-hover:!bg-[#f9fafb] dark:group-hover:!bg-[#273449] transition-colors duration-150", stickyBg)}>
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
          loading={isToggling}
        />
      </td>

      {/* Name + Objective + CBO/ABO */}
      <td
        className={cn("whitespace-nowrap px-3 py-2 sticky left-[96px] z-10 group-hover:!bg-[#f9fafb] dark:group-hover:!bg-[#273449] transition-colors duration-150 border-r border-[rgba(0,0,0,0.04)] dark:border-r-border", stickyBg)}
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
              <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#1d1d1f] px-3 py-1.5 text-xs text-white shadow-md whitespace-nowrap max-w-xs">
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
        <span className={cn(
          'inline-flex items-center gap-1.5 text-[11px] font-semibold',
          isActive ? 'apple-status-active' : 'apple-status-paused'
        )}>
          <span className={cn(
            'h-1.5 w-1.5 rounded-full',
            isActive ? 'bg-emerald-500' : 'bg-[#aeaeb2]'
          )} />
          {isActive ? 'Active' : 'Paused'}
        </span>
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
        />
      ))}
    </tr>
  );
}
