'use client';

import { motion } from 'framer-motion';
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
    <motion.tr
      id={rowId}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'group border-b border-border/30 bg-white/80 backdrop-blur-sm transition-all duration-200',
        'hover:bg-gradient-to-r hover:from-primary/[0.02] hover:via-transparent hover:to-info/[0.02]',
        'hover:shadow-[0_2px_16px_rgba(124,92,252,0.05)]',
        isSelected && 'bg-primary/[0.04] ring-1 ring-inset ring-primary/20',
        isHighlighted && 'bg-amber-50/80 ring-1 ring-inset ring-amber-300/50'
      )}
    >
      {/* Checkbox */}
      <td className="w-10 whitespace-nowrap px-4 py-3.5">
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </td>

      {/* Toggle */}
      <td className="w-12 whitespace-nowrap px-4 py-3.5">
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
        />
      </td>

      {/* Name + Objective + CBO/ABO */}
      <td className="whitespace-nowrap px-4 py-3.5">
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
          <button
            onClick={onToggleExpand}
            className="text-sm font-semibold text-text-primary hover:text-primary transition-all duration-200 text-left group-hover:translate-x-0.5 transform"
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
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:shadow-md hover:shadow-amber-100/50 transition-all duration-200"
              title="This campaign has issues"
            >
              <AlertTriangle className="h-3 w-3" />
              {issueCount} issue{issueCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="whitespace-nowrap px-4 py-3.5">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide',
          isActive ? 'badge-active-futuristic' : 'badge-paused-futuristic'
        )}>
          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          {campaign.status}
        </span>
      </td>

      {/* Budget */}
      <td className="whitespace-nowrap px-4 py-3.5">
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
      <td className="whitespace-nowrap px-4 py-3.5 text-sm text-text-secondary">
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
    </motion.tr>
  );
}
