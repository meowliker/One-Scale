'use client';

import { useMemo, useState } from 'react';

import { ChevronRight, ChevronDown } from 'lucide-react';
import type { AdSet, EntityStatus } from '@/types/campaign';
import type { MetricKey } from '@/types/metrics';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import type { EntityAction } from '@/types/latestActions';
import type { AdIssue } from './AdsIssuesPanel';
import { cn } from '@/lib/utils';
import { getMetricValue } from '@/lib/metrics';
import { Checkbox } from '@/components/ui/Checkbox';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { MetricCell } from './MetricCell';
import { PerformanceSparkline } from './PerformanceSparkline';
import { LatestActionsCell } from './LatestActionsCell';

export interface AdSetRowProps {
  adSet: AdSet;
  rowId?: string;
  isHighlighted?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  isSelected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (status: EntityStatus) => void;
  onBudgetChange: (newBudget: number) => void;
  onBidChange?: (newBid: number) => void;
  columnOrder: MetricKey[];
  isCBO?: boolean;
  sparklineData?: Record<string, SparklineDataPoint[]>;
  activityData?: Record<string, EntityAction[]>;
  activitiesFullyLoaded?: boolean;
  issues?: AdIssue[];
  onIssueClick?: (issue: AdIssue) => void;
  nameColWidth?: number;
  isToggling?: boolean;
  flashType?: 'success' | 'error';
}

function formatTargetingSummary(adSet: AdSet): string {
  const parts: string[] = [];
  const t = adSet.targeting;
  if (t.genders.length === 1 && t.genders[0] !== 'all') {
    parts.push(t.genders[0] === 'female' ? 'Women' : 'Men');
  }
  parts.push(`${t.ageMin}-${t.ageMax}`);
  if (t.locations.length > 0) {
    parts.push(t.locations[0] + (t.locations.length > 1 ? ` +${t.locations.length - 1}` : ''));
  }
  return parts.join(', ');
}

export function AdSetRow({
  adSet,
  rowId,
  isHighlighted = false,
  isExpanded,
  onToggleExpand,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onBudgetChange,
  onBidChange,
  columnOrder,
  isCBO = false,
  sparklineData,
  activityData,
  activitiesFullyLoaded,
  issues = [],
  onIssueClick,
  nameColWidth,
  isToggling = false,
  flashType,
}: AdSetRowProps) {
  const isActive = adSet.status === 'ACTIVE';
  const [showIssueDetails, setShowIssueDetails] = useState(false);
  const [showStatusTooltip, setShowStatusTooltip] = useState(false);
  const activeAdsCount = adSet.ads.filter((a) => a.status === 'ACTIVE').length;
  const primaryIssue = useMemo(() => {
    if (issues.length === 0) return null;
    return [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))[0];
  }, [issues]);
  const hasRejected = issues.some((i) => i.kind === 'ad_policy_rejected' || i.reason.toLowerCase().includes('reject'));
  const effectiveStatus = (adSet.policyInfo?.effectiveStatus || '').toUpperCase();
  const deliveryBlocked =
    hasRejected ||
    effectiveStatus.includes('DISAPPROVED') ||
    effectiveStatus.includes('REJECTED') ||
    effectiveStatus.includes('WITH_ISSUES') ||
    effectiveStatus.includes('PENDING');
  const statusLabel = !isActive ? adSet.status : deliveryBlocked ? 'NOT DELIVERING' : 'ACTIVE';
  const statusVariant: 'success' | 'default' | 'danger' = !isActive ? 'default' : deliveryBlocked ? 'danger' : 'success';
  const stickyBg = cn(
    'bg-[var(--apple-table-row-alt-bg)]',
    isSelected && 'bg-[var(--apple-table-row-selected)]',
    isHighlighted && 'bg-[var(--apple-table-row-highlighted)]',
    flashType === 'success' && 'bg-[var(--apple-table-row-flash-success)]',
    flashType === 'error' && 'bg-[var(--apple-table-row-flash-error)]'
  );

  return (
    <>
    <tr
      id={rowId}
      className={cn(
        'group border-b border-[rgba(0,0,0,0.03)] dark:border-border bg-[var(--apple-table-row-alt-bg)] border-l-2 border-l-[#3b82f620] transition-colors duration-150',
        'hover:!bg-[var(--apple-table-row-alt-hover)]',
        isSelected && 'bg-[var(--apple-table-row-selected)]',
        isHighlighted && 'bg-[var(--apple-table-row-highlighted)]',
        flashType === 'success' && 'bg-[var(--apple-table-row-flash-success)]',
        flashType === 'error' && 'bg-[var(--apple-table-row-flash-error)]'
      )}
    >
      {/* Checkbox */}
      <td className={cn("w-10 min-w-[40px] max-w-[40px] whitespace-nowrap py-3 pl-10 pr-4 sticky left-0 z-10 group-hover:!bg-[var(--apple-table-row-alt-hover)] transition-colors duration-150", stickyBg)}>
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </td>

      {/* Toggle */}
      <td className={cn("min-w-[70px] max-w-[70px] whitespace-nowrap px-3 py-2 sticky left-[40px] z-10 group-hover:!bg-[var(--apple-table-row-alt-hover)] transition-colors duration-150", stickyBg)} style={{ width: 70 }}>
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
          loading={isToggling}
        />
      </td>

      {/* Name + Targeting */}
      <td
        className={cn("whitespace-nowrap overflow-hidden px-3 py-2 sticky left-[110px] z-10 group-hover:!bg-[var(--apple-table-row-alt-hover)] transition-colors duration-150 border-r border-[rgba(0,0,0,0.04)] dark:border-r-border", stickyBg)}
        style={nameColWidth ? { width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth } : undefined}
      >
        <div className="flex items-center gap-2 pl-8 min-w-0 overflow-hidden">
          <button
            onClick={onToggleExpand}
            className="shrink-0 flex items-center gap-1 text-text-dimmed hover:text-text-secondary transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="relative group/tooltip min-w-0">
              <button
                onClick={onToggleExpand}
                className="block w-full truncate text-sm font-medium text-text-primary hover:text-primary-light transition-colors text-left"
                title={adSet.name || `Ad Set ${adSet.id}`}
              >
                {adSet.name || `Ad Set ${adSet.id}`}
              </button>
              <div className="absolute left-0 top-full mt-1 z-50 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 translate-y-1 group-hover/tooltip:translate-y-0 transition-all duration-150 ease-out">
                <div className="onescale-tooltip whitespace-nowrap max-w-xs">
                  {adSet.name || adSet.id}
                </div>
              </div>
            </div>
            <span className="text-[11px] text-text-dimmed truncate">
              {formatTargetingSummary(adSet)}
            </span>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="whitespace-nowrap px-3 py-2">
        <div className="relative flex items-center gap-2">
          {isActive && !deliveryBlocked ? (
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
              className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-semibold apple-status-paused',
                deliveryBlocked ? 'cursor-default' : 'cursor-not-allowed'
              )}
              title={deliveryBlocked ? 'Delivery is blocked' : 'Ad set is paused'}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#aeaeb2]" />
              {deliveryBlocked ? 'Not Delivering' : 'Paused'}
            </span>
          )}
          {showStatusTooltip && isActive && !deliveryBlocked && (
            <div className="onescale-tooltip absolute left-0 top-full mt-1.5 z-50 min-w-[200px] p-3 px-4 animate-tooltip-in">
              <div className="space-y-2 text-[12px]">
                <div className="flex justify-between gap-6">
                  <span className="text-[11px] text-text-muted">Status</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Active</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-[11px] text-text-muted">Running since</span>
                  <span className="font-medium text-text-primary">{new Date(adSet.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div className="flex justify-between gap-6">
                  <span className="text-[11px] text-text-muted">Active ads</span>
                  <span className="font-bold text-text-primary">{adSet.ads.length > 0 ? activeAdsCount : '\u2014'}</span>
                </div>
              </div>
            </div>
          )}
          {issues.length > 0 && (
            <button
              onClick={() => setShowIssueDetails(true)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                hasRejected
                  ? 'border-red-400/60 bg-red-500/20 text-red-300'
                  : 'border-amber-400/50 bg-amber-500/20 text-amber-300'
              )}
              title="View issue details"
            >
              {hasRejected ? 'Rejected' : `Issues ${issues.length}`}
            </button>
          )}
        </div>
      </td>

      {/* Budget */}
      <td className="whitespace-nowrap px-3 py-2">
        {isCBO ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
            CBO
          </span>
        ) : (
          <div className="flex flex-col gap-0.5">
            <div>
              <InlineEdit
                value={(adSet.dailyBudget ?? 0).toFixed(2)}
                onSave={(val) => {
                  const num = parseFloat(val);
                  if (!isNaN(num) && num > 0) onBudgetChange(num);
                }}
                type="number"
                prefix="$"
              />
              <span className="text-xs text-text-dimmed ml-1">daily</span>
            </div>
            {adSet.bidAmount !== null && onBidChange && (
              <div>
                <InlineEdit
                  value={(adSet.bidAmount ?? 0).toFixed(2)}
                  onSave={(val) => {
                    const num = parseFloat(val);
                    if (!isNaN(num) && num > 0) onBidChange(num);
                  }}
                  type="number"
                  prefix="$"
                />
                <span className="text-xs text-text-dimmed ml-1">bid</span>
              </div>
            )}
          </div>
        )}
      </td>

      {/* Bid Strategy - empty for ad sets */}
      <td className="whitespace-nowrap px-3 py-2 text-sm text-text-dimmed">
        &mdash;
      </td>

      {/* Performance Sparkline */}
      <PerformanceSparkline entityId={adSet.id} data={sparklineData?.[adSet.id]} currentRoas={adSet.metrics.roas} />

      {/* Latest Actions */}
      <LatestActionsCell entityId={adSet.id} actions={activityData?.[adSet.id]} activitiesFullyLoaded={activitiesFullyLoaded} updatedTime={adSet.updatedTime} status={adSet.status} />

      {/* Dynamic Metrics */}
      {columnOrder.map((key) => (
        <MetricCell
          key={key}
          metricKey={key}
          value={getMetricValue(adSet.metrics as unknown as Record<string, number>, key)}
        />
      ))}
    </tr>
    {showIssueDetails && primaryIssue && (
      <tr>
        <td colSpan={8 + columnOrder.length}>
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border-light bg-surface-elevated p-4 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-primary">Ad Set Issue Details</h4>
                <button
                  onClick={() => setShowIssueDetails(false)}
                  className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-text-primary"
                >
                  Close
                </button>
              </div>
              <div className="space-y-2 text-xs">
                <p className="text-text-secondary"><span className="text-text-muted">Ad Set:</span> {adSet.name}</p>
                <p className="text-text-secondary"><span className="text-text-muted">Issue:</span> {primaryIssue.reason}</p>
                <p className="text-text-secondary"><span className="text-text-muted">Details:</span> {primaryIssue.details || 'No details from Meta'}</p>
                <p className="text-text-secondary"><span className="text-text-muted">Suggested Fix:</span> {primaryIssue.suggestion}</p>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => {
                    setShowIssueDetails(false);
                    onIssueClick?.(primaryIssue);
                  }}
                  className="rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                >
                  View in Error Center
                </button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    )}
    </>
  );
}
