'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  Check,
  X,
  Loader2,
  ArrowRight,
  Zap,
  DollarSign,
  Palette,
  Target,
  BarChart3,
  Pause,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import type { AIRecommendation } from '@/types/recommendation';
import { cn } from '@/lib/utils';

interface RecommendationCardProps {
  recommendation: AIRecommendation;
  onApply: (rec: AIRecommendation) => Promise<string>;
  onDismiss: (id: string) => void;
}

const severityConfig = {
  critical: {
    icon: AlertCircle,
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    label: 'Critical',
    pulseColor: 'bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-200',
    iconColor: 'text-amber-600',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-700',
    label: 'Warning',
    pulseColor: 'bg-amber-500',
  },
  opportunity: {
    icon: TrendingUp,
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-200',
    iconColor: 'text-emerald-600',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-700',
    label: 'Opportunity',
    pulseColor: 'bg-emerald-500',
  },
};

const categoryConfig: Record<string, { icon: typeof Zap; label: string }> = {
  budget: { icon: DollarSign, label: 'Budget' },
  creative: { icon: Palette, label: 'Creative' },
  targeting: { icon: Target, label: 'Targeting' },
  bidStrategy: { icon: BarChart3, label: 'Bid Strategy' },
  status: { icon: Pause, label: 'Status' },
  dayparting: { icon: Clock, label: 'Day-Parting' },
};

function getActionLabel(rec: AIRecommendation): string {
  switch (rec.action.type) {
    case 'pause_entity':
      return `Pause ${rec.action.entityName}`;
    case 'enable_entity':
      return `Enable ${rec.action.entityName}`;
    case 'increase_budget':
      return `Increase budget $${rec.action.payload.currentBudget} → $${rec.action.payload.newBudget}`;
    case 'decrease_budget':
      return `Decrease budget $${rec.action.payload.currentBudget} → $${rec.action.payload.newBudget}`;
    case 'change_bid_strategy':
      return `Switch to ${rec.action.payload.newBidStrategy}`;
    case 'reallocate_budget':
      return `Shift budget to ${rec.action.entityName}`;
    case 'refresh_creative':
      return `Duplicate creative to ${rec.action.payload.targetEntityName}`;
    case 'adjust_targeting':
      return `Exclude overlap with ${rec.action.payload.targetEntityName}`;
    case 'adjust_dayparting': {
      const mult = rec.action.payload.budgetMultiplier ?? 1;
      if (mult === 0) return 'Pause delivery during these hours';
      if (mult < 1) return `Reduce bids by ${Math.round((1 - mult) * 100)}% during off-peak`;
      if (mult > 1) return `Increase budget by ${Math.round((mult - 1) * 100)}% during peak`;
      return 'Adjust day-parting schedule';
    }
    default:
      return 'Apply Change';
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const HOUR_LABELS_SHORT = [
  '12a', '', '', '3a', '', '', '6a', '', '', '9a', '', '',
  '12p', '', '', '3p', '', '', '6p', '', '', '9p', '', '',
];

/** Mini 24-hour bar showing which hours are highlighted */
function DaypartingHourBar({ hours, severity }: { hours: number[]; severity: 'critical' | 'warning' | 'opportunity' }) {
  const hourSet = new Set(hours);
  const colorMap = {
    critical: 'bg-red-500',
    warning: 'bg-amber-500',
    opportunity: 'bg-emerald-500',
  };
  const activeColor = colorMap[severity];

  return (
    <div className="mt-3 rounded-lg bg-surface/60 p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Clock className="h-3 w-3 text-text-dimmed" />
        <span className="text-[10px] font-medium text-text-muted">Affected Hours</span>
      </div>
      <div className="flex gap-[2px]">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex flex-col items-center flex-1 min-w-0">
            <div
              className={cn(
                'w-full h-4 rounded-sm transition-colors',
                hourSet.has(h) ? activeColor : 'bg-surface-hover'
              )}
              title={`${['12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm'][h]}`}
            />
            {HOUR_LABELS_SHORT[h] && (
              <span className="text-[8px] text-text-dimmed mt-0.5 leading-none">{HOUR_LABELS_SHORT[h]}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecommendationCard({ recommendation, onApply, onDismiss }: RecommendationCardProps) {
  const [isApplying, setIsApplying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmState, setConfirmState] = useState<'idle' | 'confirming'>('idle');
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const severity = severityConfig[recommendation.severity];
  const category = categoryConfig[recommendation.category] || categoryConfig.budget;
  const SeverityIcon = severity.icon;
  const CategoryIcon = category.icon;

  const isApplied = recommendation.status === 'applied';
  const isDismissed = recommendation.status === 'dismissed';

  // Clear confirmation timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const executeApply = useCallback(async () => {
    setIsApplying(true);
    setConfirmState('idle');
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    try {
      await onApply(recommendation);
    } finally {
      setIsApplying(false);
    }
  }, [onApply, recommendation]);

  async function handleApply() {
    // For CRITICAL severity, skip confirmation and apply immediately
    if (recommendation.severity === 'critical') {
      await executeApply();
      return;
    }

    // First click: enter confirmation state
    if (confirmState === 'idle') {
      setConfirmState('confirming');
      // Auto-reset after 3 seconds
      confirmTimerRef.current = setTimeout(() => {
        setConfirmState('idle');
      }, 3000);
      return;
    }

    // Second click (while confirming): execute the apply
    if (confirmState === 'confirming') {
      await executeApply();
    }
  }

  if (isDismissed) return null;

  return (
    <div
      className={cn(
        'group relative rounded-lg border transition-all duration-200',
        isApplied
          ? 'border-emerald-200 bg-emerald-500/10'
          : `${severity.borderColor} ${severity.bgColor}`,
        !isApplied && 'hover:shadow-md'
      )}
    >
      {/* Main content */}
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            {/* Severity indicator with pulse */}
            <div className="relative mt-0.5 flex-shrink-0">
              <SeverityIcon className={cn('h-5 w-5', severity.iconColor)} />
              {recommendation.severity === 'critical' && !isApplied && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', severity.pulseColor)} />
                  <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', severity.pulseColor)} />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {/* Badges row */}
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', severity.badgeBg, severity.badgeText)}>
                  {severity.label}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary">
                  <CategoryIcon className="h-3 w-3" />
                  {category.label}
                </span>
                <span className="text-xs text-text-dimmed">{timeAgo(recommendation.createdAt)}</span>
              </div>

              {/* Title */}
              <h4 className="text-sm font-semibold text-text-primary">{recommendation.title}</h4>

              {/* Entity info */}
              <p className="mt-0.5 text-xs text-text-muted">
                {recommendation.action.entityType === 'campaign' ? '🎯' :
                  recommendation.action.entityType === 'adset' ? '📦' : '📄'}{' '}
                {recommendation.action.entityName}
              </p>
            </div>
          </div>

          {/* Applied state */}
          {isApplied && (
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5">
                <Check className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">Applied</span>
              </div>
              {recommendation.appliedSummary && (
                <span className="text-[11px] text-emerald-600 max-w-[220px] text-right leading-tight">
                  {recommendation.appliedSummary}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Expandable analysis */}
        <div className="mt-3">
          <p className={cn('text-sm text-text-secondary leading-relaxed', !isExpanded && 'line-clamp-2')}>
            {recommendation.analysis}
          </p>
          {recommendation.analysis.length > 150 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-1 text-xs font-medium text-primary-light hover:text-primary-light"
            >
              {isExpanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Dayparting hour bar visual */}
        {recommendation.category === 'dayparting' &&
          recommendation.action.payload.hours &&
          recommendation.action.payload.hours.length > 0 && (
            <DaypartingHourBar
              hours={recommendation.action.payload.hours}
              severity={recommendation.severity}
            />
          )}

        {/* Action area */}
        {!isApplied && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-surface/60 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
                <ArrowRight className="h-3.5 w-3.5 text-primary" />
                {getActionLabel(recommendation)}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                <Zap className="h-3 w-3 text-amber-500" />
                {recommendation.impactEstimate}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => onDismiss(recommendation.id)}
                className="rounded-md p-1.5 text-text-dimmed hover:bg-surface-hover hover:text-text-secondary transition-colors"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                onClick={handleApply}
                disabled={isApplying}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all',
                  confirmState === 'confirming'
                    ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 ring-2 ring-blue-300 animate-pulse'
                    : recommendation.severity === 'critical'
                      ? 'bg-red-600 hover:bg-red-700 active:bg-red-800'
                      : recommendation.severity === 'warning'
                        ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                        : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800',
                  isApplying && 'opacity-70 cursor-not-allowed'
                )}
              >
                {isApplying ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Applying...
                  </>
                ) : confirmState === 'confirming' ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Confirm Apply
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    Apply
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
