'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Pause,
  Play,
  DollarSign,
  Palette,
  Copy,
  Sparkles,
  Users,
  Clock,
  User,
  ChevronUp,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActionsForEntity } from '@/data/mockLatestActions';
import type { ActionType, EntityAction } from '@/types/latestActions';
import { PortalTooltip } from '@/components/ui/PortalTooltip';

interface LatestActionsCellProps {
  entityId: string;
  actions?: EntityAction[];
  activitiesFullyLoaded?: boolean;
  updatedTime?: string;
  status?: string;
}

interface ActionConfig {
  icon: LucideIcon;
  color: string;
  bg: string;
  label: string;
}

const actionConfigMap: Record<ActionType, ActionConfig> = {
  status_enable: {
    icon: Play,
    color: 'text-emerald-600 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    label: 'Activated',
  },
  status_pause: {
    icon: Pause,
    color: 'text-orange-500 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-950/60',
    label: 'Paused',
  },
  budget_increase: {
    icon: TrendingUp,
    color: 'text-blue-600 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/60',
    label: 'Budget increased',
  },
  budget_decrease: {
    icon: TrendingDown,
    color: 'text-red-500 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-950/60',
    label: 'Budget decreased',
  },
  bid_change: {
    icon: DollarSign,
    color: 'text-purple-600 dark:text-purple-300',
    bg: 'bg-purple-50 dark:bg-purple-950/60',
    label: 'Bid updated',
  },
  creative_update: {
    icon: Palette,
    color: 'text-pink-600 dark:text-pink-300',
    bg: 'bg-pink-50 dark:bg-pink-950/60',
    label: 'Creative changed',
  },
  duplicate: {
    icon: Copy,
    color: 'text-cyan-600 dark:text-cyan-300',
    bg: 'bg-cyan-50 dark:bg-cyan-950/60',
    label: 'Duplicated',
  },
  ai_optimization: {
    icon: Sparkles,
    color: 'text-indigo-600 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-950/60',
    label: 'AI Optimization',
  },
  audience_change: {
    icon: Users,
    color: 'text-orange-600 dark:text-orange-300',
    bg: 'bg-orange-50 dark:bg-orange-950/60',
    label: 'Audience changed',
  },
  schedule_change: {
    icon: Clock,
    color: 'text-slate-600 dark:text-slate-300',
    bg: 'bg-slate-50 dark:bg-slate-800/60',
    label: 'Schedule changed',
  },
};

const performedByConfig: Record<EntityAction['performedBy'], { label: string; className: string }> = {
  user: { label: 'User', className: 'bg-slate-500/20 text-slate-300' },
  ai: { label: 'AI', className: 'bg-primary/20 text-primary-light' },
  rule: { label: 'Rule', className: 'bg-amber-500/20 text-amber-300' },
};

const MAX_ACTIONS_TO_SHOW = 7;

function formatActivityDate(timestamp: string): string {
  const date = new Date(timestamp);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day} at ${time}`;
}

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${hours}h ago`;
}

/* ─── Compact icon-only pill (shown in the cell) ─── */
function ActionPill({
  action,
  onMouseEnter,
  onMouseLeave,
  innerRef,
}: {
  action: EntityAction;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  const config = actionConfigMap[action.type];
  const Icon = config.icon;

  return (
    <div
      ref={innerRef}
      className={cn(
        'flex h-5 w-5 items-center justify-center rounded-full cursor-default transition-all duration-150',
        'hover:ring-1 hover:ring-border-light hover:scale-105',
        config.bg,
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Icon className={cn('h-2.5 w-2.5', config.color)} />
    </div>
  );
}

/* ─── Hover tooltip for a single action ─── */
function ActionTooltipContent({ action }: { action: EntityAction }) {
  const config = actionConfigMap[action.type];
  const performedBy = performedByConfig[action.performedBy];
  const Icon = config.icon;

  return (
    <div className="min-w-[280px] max-w-[340px] rounded-lg border border-border-light bg-surface-elevated p-3 shadow-xl">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('flex h-5 w-5 items-center justify-center rounded', config.bg)}>
          <Icon className={cn('h-3.5 w-3.5', config.color)} />
        </div>
        <span className="text-sm font-semibold text-text-primary">{action.description}</span>
      </div>
      <div className="mb-2.5 rounded-md bg-surface-hover/60 px-2.5 py-1.5">
        <p className="text-xs text-text-secondary leading-relaxed">{action.details}</p>
        {action.oldValue && action.newValue && (
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <span className="text-text-muted line-through">{action.oldValue}</span>
            <span className="text-text-dimmed">&rarr;</span>
            <span className="text-text-primary font-medium">{action.newValue}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 mb-2 text-[11px] text-text-dimmed">
        <span>{formatTimeAgo(action.timestamp)}</span>
        {action.objectName && (
          <>
            <span className="text-text-dimmed/50">&middot;</span>
            <span className="text-text-secondary font-medium truncate max-w-[160px]">{action.objectName}</span>
          </>
        )}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-text-dimmed" />
          {action.performedByName && (
            <span className="text-[11px] text-text-secondary font-medium">{action.performedByName}</span>
          )}
          <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', performedBy.className)}>
            {performedBy.label}
          </span>
        </div>
        <span className="text-[11px] text-text-dimmed">{formatActivityDate(action.timestamp)}</span>
      </div>
    </div>
  );
}

/* ─── Expanded all-actions popover ─── */
function AllActionsTooltipContent({ actions, onCollapse }: { actions: EntityAction[]; onCollapse: () => void }) {
  return (
    <div className="min-w-[320px] max-w-[380px] rounded-lg border border-border-light bg-surface-elevated shadow-xl">
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border">
        <span className="text-xs font-semibold text-text-primary">Activity History ({actions.length})</span>
        <button onClick={onCollapse} className="flex items-center gap-0.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors">
          Collapse <ChevronUp className="h-3 w-3" />
        </button>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {actions.map((action, index) => {
          const config = actionConfigMap[action.type];
          const Icon = config.icon;
          return (
            <div key={action.id} className={cn('px-3 py-2.5', index < actions.length - 1 && 'border-b border-border/50')}>
              <div className="flex items-start gap-2">
                <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded mt-0.5', config.bg)}>
                  <Icon className={cn('h-3 w-3', config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-text-primary truncate">{action.description}</span>
                    <span className="text-[10px] text-text-dimmed shrink-0 whitespace-nowrap">{formatActivityDate(action.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">{action.details}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-text-dimmed">
                    {action.objectName && <span className="truncate max-w-[140px]" title={action.objectName}>{action.objectName}</span>}
                    {action.objectName && action.performedByName && <span className="text-text-dimmed/50">|</span>}
                    {action.performedByName && (
                      <span className="flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{action.performedByName}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main cell ─── */
export function LatestActionsCell({ entityId, actions: actionsProp, activitiesFullyLoaded, status }: LatestActionsCellProps) {
  const [showAllActions, setShowAllActions] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellRef = useRef<HTMLButtonElement | null>(null);

  const actions = useMemo(() => {
    // Only show actions for ACTIVE entities
    if (status && status !== 'ACTIVE') return [];

    let raw: EntityAction[] = [];
    if (actionsProp && actionsProp.length > 0) raw = actionsProp;
    else if (activitiesFullyLoaded) raw = getActionsForEntity(entityId);

    // Sort by timestamp (newest first) and take last 7 actions
    return raw
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, MAX_ACTIONS_TO_SHOW);
  }, [entityId, actionsProp, activitiesFullyLoaded, status]);

  const handleClick = useCallback(() => {
    setShowAllActions((prev) => !prev);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => { setShowAllActions(false); hideTimeoutRef.current = null; }, 150);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
  }, []);

  // Empty state — simple dash
  if (actions.length === 0) {
    return (
      <td className="px-3 py-2 text-center" style={{ width: 160, minWidth: 160, maxWidth: 160 }}>
        <span className="text-[11px] text-text-dimmed">&mdash;</span>
      </td>
    );
  }

  const actionCount = actions.length;
  const actionLabel = actionCount === 1 ? 'action' : 'actions';

  return (
    <td className="px-3 py-2" style={{ width: 160, minWidth: 160, maxWidth: 160 }}>
      <button
        ref={cellRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="flex items-center justify-center gap-1.5 w-full text-[12px] text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer transition-colors"
      >
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/10 dark:bg-blue-400/10">
          <Activity className="h-2.5 w-2.5 text-blue-500 dark:text-blue-400" />
        </div>
        <span className="font-medium">{actionCount} {actionLabel}</span>
      </button>
      <PortalTooltip anchorRef={cellRef} visible={showAllActions}>
        <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
          <AllActionsTooltipContent actions={actions} onCollapse={() => setShowAllActions(false)} />
        </div>
      </PortalTooltip>
    </td>
  );
}
