'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronDown, Info } from 'lucide-react';
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
  campaignBudget?: number;
  sparklineData?: Record<string, SparklineDataPoint[]>;
  activityData?: Record<string, EntityAction[]>;
  activitiesFullyLoaded?: boolean;
  issues?: AdIssue[];
  onIssueClick?: (issue: AdIssue) => void;
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
  campaignBudget,
  sparklineData,
  activityData,
  activitiesFullyLoaded,
  issues = [],
  onIssueClick,
}: AdSetRowProps) {
  const isActive = adSet.status === 'ACTIVE';
  const [showIssueDetails, setShowIssueDetails] = useState(false);
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

  return (
    <>
    <motion.tr
      id={rowId}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        'group border-b border-border/20 bg-white/60 backdrop-blur-sm transition-all duration-200',
        'hover:bg-gradient-to-r hover:from-primary/[0.015] hover:via-transparent hover:to-info/[0.015]',
        isSelected && 'bg-primary/[0.03] ring-1 ring-inset ring-primary/15',
        isHighlighted && 'bg-amber-50/80 ring-1 ring-inset ring-amber-300/50'
      )}
    >
      {/* Checkbox */}
      <td className="w-10 whitespace-nowrap py-3 pl-8 pr-4">
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </td>

      {/* Toggle */}
      <td className="w-12 whitespace-nowrap px-4 py-3">
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
        />
      </td>

      {/* Name + Targeting */}
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2 pl-4">
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 text-text-dimmed hover:text-text-secondary transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="flex flex-col">
            <button
              onClick={onToggleExpand}
              className="text-sm font-medium text-text-primary hover:text-primary-light transition-colors text-left"
            >
              {adSet.name}
            </button>
            <span className="text-xs text-text-dimmed">
              {formatTargetingSummary(adSet)}
            </span>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide',
            isActive && !deliveryBlocked ? 'badge-active-futuristic' : 'badge-paused-futuristic'
          )}>
            {isActive && !deliveryBlocked && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            {statusLabel}
          </span>
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
      <td className="whitespace-nowrap px-4 py-3">
        {isCBO ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/20">
              CBO
            </span>
            <div className="group relative">
              <Info className="h-3.5 w-3.5 text-text-dimmed cursor-help hover:text-blue-400 transition-colors" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 min-w-[220px] rounded-lg border border-border-light bg-surface-elevated p-3 shadow-xl animate-in fade-in duration-150">
                <p className="font-semibold text-text-primary text-xs">Campaign Budget Optimization</p>
                <p className="text-text-muted text-xs mt-1">Budget is managed at the campaign level.</p>
                {campaignBudget !== undefined && (
                  <p className="text-text-secondary text-xs mt-1">
                    Campaign budget: ${campaignBudget.toFixed(2)}/day
                  </p>
                )}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                  <div className="border-4 border-transparent border-t-border-light" />
                </div>
              </div>
            </div>
          </div>
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
              <span className="text-xs text-text-dimmed ml-1">/day</span>
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
      <td className="whitespace-nowrap px-4 py-3 text-sm text-text-dimmed">
        &mdash;
      </td>

      {/* Performance Sparkline */}
      <PerformanceSparkline entityId={adSet.id} data={sparklineData?.[adSet.id]} />

      {/* Latest Actions */}
      <LatestActionsCell entityId={adSet.id} actions={activityData?.[adSet.id]} activitiesFullyLoaded={activitiesFullyLoaded} />

      {/* Dynamic Metrics */}
      {columnOrder.map((key) => (
        <MetricCell
          key={key}
          metricKey={key}
          value={getMetricValue(adSet.metrics as unknown as Record<string, number>, key)}
        />
      ))}
    </motion.tr>
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
