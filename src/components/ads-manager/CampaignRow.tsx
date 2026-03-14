'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, AlertTriangle, Lock, ExternalLink, Copy } from 'lucide-react';
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
import { DuplicateCampaignModal } from './DuplicateCampaignModal';

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
  storeId?: string;
  metaAccountId?: string;
  onDuplicateSuccess?: () => void;
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
  storeId,
  metaAccountId,
  onDuplicateSuccess,
}: CampaignRowProps) {
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const isActive = campaign.status === 'ACTIVE';
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
      <td className={cn("whitespace-nowrap px-1 py-2 text-center group-hover:!bg-[var(--apple-table-row-hover)] transition-colors duration-150", stickyBg)} style={{ width: 40, minWidth: 40, maxWidth: 40 }}>
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </td>

      {/* Toggle — 70px */}
      <td className={cn("whitespace-nowrap px-1 py-2 text-center group-hover:!bg-[var(--apple-table-row-hover)] transition-colors duration-150", stickyBg)} style={{ width: 70, minWidth: 70, maxWidth: 70 }}>
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
          loading={isToggling}
        />
      </td>

      {/* Name + Objective + CBO/ABO */}
      <td
        className={cn("whitespace-nowrap overflow-hidden px-2 py-2 group-hover:!bg-[var(--apple-table-row-hover)] transition-colors duration-150 border-r border-[rgba(0,0,0,0.04)] dark:border-r-border", stickyBg)}
        style={nameColWidth ? { width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth } : undefined}
      >
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <button
            onClick={onToggleExpand}
            className="shrink-0 flex items-center gap-1 text-text-muted hover:text-text-secondary transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 transition-transform duration-200" />
            ) : (
              <ChevronRight className="h-4 w-4 transition-transform duration-200" />
            )}
          </button>
          <div className="relative group/tooltip min-w-0 flex-1">
            <button
              onClick={onToggleExpand}
              className="block w-full truncate text-[14px] font-semibold text-text-primary hover:text-primary transition-colors duration-150 text-left"
              title={campaign.name}
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
          <span title={`${campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'CBO' : 'ABO'} • ${objective.label}`}>
            <Badge
              variant={campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'info' : 'warning'}
              size="sm"
            >
              {campaign.dailyBudget > 0 || (campaign.lifetimeBudget && campaign.lifetimeBudget > 0) ? 'CBO' : 'ABO'}
            </Badge>
          </span>
          {issueCount > 0 && (
            <button
              onClick={() => onIssueClick?.()}
              className="shrink-0 inline-flex items-center gap-1 rounded-md bg-[#fff4e5] px-2 py-1 text-[12px] font-medium text-[#cc7700] hover:bg-[#ffedcc] transition-colors duration-150"
              title="This campaign has issues"
            >
              <AlertTriangle className="h-3 w-3" />
              {issueCount} issue{issueCount > 1 ? 's' : ''}
            </button>
          )}
          {/* Duplicate button */}
          {storeId && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowDuplicateModal(true); }}
              className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-hover text-text-dimmed hover:text-primary transition-all duration-150"
              title="Duplicate campaign"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Open in Meta Ads Manager */}
          <a
            href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${metaAccountId?.replace('act_', '')}&filter_set=SEARCH_BY_CAMPAIGN_GROUP_ID-STRING%1EEQUAL%1E%22${campaign.id}%22`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-hover text-text-dimmed hover:text-primary transition-all duration-150"
            title="Open in Meta Ads Manager"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </td>

      {/* Budget — ABO has no campaign-level budget (it lives on each ad set) */}
      <td className="whitespace-nowrap px-3 py-2 text-center" style={{ width: 120, minWidth: 120, maxWidth: 120 }}>
        {isABO ? (
          <span className="inline-flex items-center gap-1 text-[13px] text-text-dimmed">
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

      {/* Bid Strategy */}
      <td className="whitespace-nowrap px-3 py-2 text-[13px] text-text-secondary" style={{ width: 140, minWidth: 140, maxWidth: 140, textAlign: 'center' }}>
        <span>{bidStrategyLabels[campaign.bidStrategy] ?? campaign.bidStrategy}</span>
      </td>

      {/* Performance Sparkline */}
      <PerformanceSparkline entityId={campaign.id} data={sparklineData?.[campaign.id]} currentRoas={campaign.metrics.roas} />

      {/* Latest Actions */}
      <LatestActionsCell entityId={campaign.id} actions={activityData?.[campaign.id]} activitiesFullyLoaded={activitiesFullyLoaded} updatedTime={campaign.updatedTime} status={campaign.status} />

      {/* Dynamic Metrics */}
      {columnOrder.map((key) => (
        <MetricCell
          key={key}
          metricKey={key}
          value={getMetricValue(campaign.metrics as unknown as Record<string, number>, key)}
          shopifyRoas={key === 'roas' ? shopifyRoas : undefined}
        />
      ))}

      {/* Duplicate Modal */}
      {showDuplicateModal && storeId && (
        <DuplicateCampaignModal
          campaignId={campaign.id}
          campaignName={campaign.name}
          storeId={storeId}
          onClose={() => setShowDuplicateModal(false)}
          onSuccess={() => onDuplicateSuccess?.()}
        />
      )}
    </tr>
  );
}
