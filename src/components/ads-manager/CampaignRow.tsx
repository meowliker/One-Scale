'use client';


import { ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
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
}: CampaignRowProps) {
  const isActive = campaign.status === 'ACTIVE';
  const objective = objectiveLabels[campaign.objective] ?? { label: campaign.objective, variant: 'default' as const };

  return (
    <tr
      id={rowId}
      className={cn(
        'group border-b border-[rgba(0,0,0,0.04)] bg-white transition-colors duration-150',
        'hover:bg-[#f5f5f7]',
        isSelected && 'bg-[#e8f0fe]',
        isHighlighted && 'bg-[#fff8e1]'
      )}
    >
      {/* Checkbox */}
      <td className="w-10 whitespace-nowrap px-3 py-2">
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </td>

      {/* Toggle */}
      <td className="w-12 whitespace-nowrap px-3 py-2">
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
        />
      </td>

      {/* Name + Objective + CBO/ABO */}
      <td
        className="whitespace-nowrap px-3 py-2 sticky left-[96px] z-10 bg-white group-hover:bg-[#f5f5f7] transition-colors duration-150 border-r border-[rgba(0,0,0,0.04)]"
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
              className="truncate max-w-[220px] block text-[13px] font-medium text-[#1d1d1f] hover:text-[#0071e3] transition-colors duration-150 text-left"
            >
              {campaign.name}
            </button>
            <div className="absolute left-0 top-full mt-1 z-50 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 translate-y-1 group-hover/tooltip:translate-y-0 transition-all duration-150 ease-out">
              <div className="rounded-lg bg-[#1d1d1f] px-3 py-1.5 text-xs text-white shadow-lg whitespace-nowrap max-w-xs">
                {campaign.name}
              </div>
            </div>
          </div>
          <Badge variant={objective.variant}>{objective.label}</Badge>
          {/* CBO = budget at campaign level, ABO = budget at adset level */}
          <Badge variant={campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'info' : 'warning'}>
            {campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'CBO' : 'ABO'}
          </Badge>
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
          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          {campaign.status}
        </span>
      </td>

      {/* Budget */}
      <td className="whitespace-nowrap px-3 py-2">
        <InlineEdit
          value={(campaign.dailyBudget ?? 0).toFixed(2)}
          onSave={(val) => {
            const num = parseFloat(val);
            if (!isNaN(num) && num > 0) onBudgetChange(num);
          }}
          type="number"
          prefix="$"
        />
        <span className="text-[11px] text-[#aeaeb2] ml-1">/day</span>
      </td>

      {/* Bid Strategy */}
      <td className="whitespace-nowrap px-3 py-2 text-sm text-text-secondary">
        {bidStrategyLabels[campaign.bidStrategy] ?? campaign.bidStrategy}
      </td>

      {/* Performance Sparkline */}
      <PerformanceSparkline entityId={campaign.id} data={sparklineData?.[campaign.id]} />

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
