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
}: CampaignRowProps) {
  const isActive = campaign.status === 'ACTIVE';
  const objective = objectiveLabels[campaign.objective] ?? { label: campaign.objective, variant: 'default' as const };

  return (
    <tr
      id={rowId}
      className={cn(
        'border-b border-border bg-surface-elevated hover:bg-surface-hover transition-colors',
        isSelected && 'bg-primary/10 hover:bg-primary/10',
        isHighlighted && 'bg-amber-500/10 ring-1 ring-inset ring-amber-400/70'
      )}
    >
      {/* Checkbox */}
      <td className="w-10 whitespace-nowrap px-3 py-3">
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </td>

      {/* Toggle */}
      <td className="w-12 whitespace-nowrap px-3 py-3">
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
        />
      </td>

      {/* Name + Objective + CBO/ABO */}
      <td className="whitespace-nowrap px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onToggleExpand}
            className="text-sm font-semibold text-text-primary hover:text-primary-light transition-colors text-left"
          >
            {campaign.name}
          </button>
          <Badge variant={objective.variant}>{objective.label}</Badge>
          {/* CBO = budget at campaign level, ABO = budget at adset level */}
          <Badge variant={campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'info' : 'warning'}>
            {campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'CBO' : 'ABO'}
          </Badge>
          {issueCount > 0 && (
            <button
              onClick={() => onIssueClick?.()}
              className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25"
              title="This campaign has issues"
            >
              <AlertTriangle className="h-3 w-3" />
              {issueCount} issue{issueCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="whitespace-nowrap px-3 py-3">
        <Badge variant={isActive ? 'success' : 'default'}>
          {campaign.status}
        </Badge>
      </td>

      {/* Budget */}
      <td className="whitespace-nowrap px-3 py-3">
        <InlineEdit
          value={(campaign.dailyBudget ?? 0).toFixed(2)}
          onSave={(val) => {
            const num = parseFloat(val);
            if (!isNaN(num) && num > 0) onBudgetChange(num);
          }}
          type="number"
          prefix="$"
        />
        <span className="text-xs text-text-dimmed ml-1">/day</span>
      </td>

      {/* Bid Strategy */}
      <td className="whitespace-nowrap px-3 py-3 text-sm text-text-secondary">
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
