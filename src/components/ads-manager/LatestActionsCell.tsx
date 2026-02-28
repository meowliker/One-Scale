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
  ChevronDown,
  ChevronUp,
  Pencil,
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
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    label: 'Activated',
  },
  status_pause: {
    icon: Pause,
    color: 'text-orange-500 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    label: 'Paused',
  },
  budget_increase: {
    icon: TrendingUp,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    label: 'Budget increased',
  },
  budget_decrease: {
    icon: TrendingDown,
    color: 'text-red-500 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
    label: 'Budget decreased',
  },
  bid_change: {
    icon: DollarSign,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    label: 'Bid updated',
  },
  creative_update: {
    icon: Palette,
    color: 'text-pink-600 dark:text-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-900/20',
    label: 'Creative changed',
  },
  duplicate: {
    icon: Copy,
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    label: 'Duplicated',
  },
  ai_optimization: {
    icon: Sparkles,
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    label: 'AI Optimization',
  },
  audience_change: {
    icon: Users,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    label: 'Audience changed',
  },
  schedule_change: {
    icon: Clock,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-700/40',
    label: 'Schedule changed',
  },
};

const performedByConfig: Record<EntityAction['performedBy'], { label: string; className: string }> = {
  user: { label: 'User', className: 'bg-slate-500/20 text-slate-300' },
  ai: { label: 'AI', className: 'bg-primary/20 text-primary-light' },
  rule: { label: 'Rule', className: 'bg-amber-500/20 text-amber-300' },
};

function formatTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatActivityDate(timestamp: string): string {
  const date = new Date(timestamp);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day} at ${time}`;
}

/* ─── Inline action pill (shown in the cell) ─── */
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
        'flex items-center gap-1.5 rounded-md px-2 py-1 cursor-default transition-all duration-150',
        'hover:ring-1 hover:ring-border-light',
        config.bg,
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Icon className={cn('h-3 w-3 shrink-0', config.color)} />
      <div className="flex flex-col min-w-0">
        <span className={cn('text-[11px] font-semibold leading-tight truncate', config.color)}>
          {config.label}
        </span>
        <span className="text-[10px] leading-tight text-text-dimmed">
          {formatTimeAgo(action.timestamp)}
        </span>
      </div>
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
      {action.objectName && (
        <div className="flex items-start gap-1.5 mb-2 text-xs">
          <span className="text-text-dimmed shrink-0">Item:</span>
          <span className="text-text-secondary font-medium truncate">{action.objectName}</span>
        </div>
      )}
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

/* ─── Expanded all-actions tooltip ─── */
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
export function LatestActionsCell({ entityId, actions: actionsProp, activitiesFullyLoaded, updatedTime }: LatestActionsCellProps) {
  const [hoveredActionId, setHoveredActionId] = useState<string | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const overflowRef = useRef<HTMLSpanElement | null>(null);

  const actions = useMemo(() => {
    if (actionsProp && actionsProp.length > 0) return actionsProp;
    if (activitiesFullyLoaded) return getActionsForEntity(entityId);
    return [];
  }, [entityId, actionsProp, activitiesFullyLoaded]);

  const handleMouseEnter = useCallback((actionId: string) => {
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
    setShowAllActions(false);
    setHoveredActionId(actionId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => { setHoveredActionId(null); setShowAllActions(false); hideTimeoutRef.current = null; }, 150);
  }, []);

  const handleOverflowEnter = useCallback(() => {
    if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
    setHoveredActionId(null);
    setShowAllActions(true);
  }, []);

  const handleOverflowLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => { setShowAllActions(false); hideTimeoutRef.current = null; }, 150);
  }, []);

  // Empty state
  if (actions.length === 0) {
    return (
      <td className="px-3 py-2 min-w-[180px]">
        {updatedTime ? (
          <div className={cn('flex items-center gap-1.5 rounded-md px-2 py-1', 'bg-slate-50 dark:bg-slate-700/40')}>
            <Pencil className="h-3 w-3 shrink-0 text-slate-400" />
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">Modified</span>
              <span className="text-[10px] leading-tight text-text-dimmed">{formatTimeAgo(updatedTime)}</span>
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-text-dimmed px-2">&mdash;</span>
        )}
      </td>
    );
  }

  const visibleActions = actions.slice(0, 2);
  const overflowCount = actions.length - 2;

  return (
    <td className="px-3 py-2 min-w-[180px]">
      <div className="flex flex-col gap-1">
        {visibleActions.map((action) => (
          <div key={action.id}>
            <ActionPill
              action={action}
              innerRef={(el) => { if (el) iconRefs.current.set(action.id, el); }}
              onMouseEnter={(e) => { e.stopPropagation(); handleMouseEnter(action.id); }}
              onMouseLeave={handleMouseLeave}
            />
            <PortalTooltip anchorRef={{ current: iconRefs.current.get(action.id) || null }} visible={hoveredActionId === action.id}>
              <div onMouseEnter={() => handleMouseEnter(action.id)} onMouseLeave={handleMouseLeave}>
                <ActionTooltipContent action={action} />
              </div>
            </PortalTooltip>
          </div>
        ))}
        {overflowCount > 0 && (
          <>
            <span
              ref={overflowRef}
              className="flex h-5 items-center gap-0.5 rounded-md bg-surface-hover px-2 text-[10px] font-medium text-text-muted cursor-default hover:bg-surface-active transition-colors w-fit"
              onMouseEnter={handleOverflowEnter}
              onMouseLeave={handleOverflowLeave}
            >
              +{overflowCount} more
              <ChevronDown className="h-3 w-3" />
            </span>
            <PortalTooltip anchorRef={overflowRef} visible={showAllActions}>
              <div onMouseEnter={handleOverflowEnter} onMouseLeave={handleOverflowLeave}>
                <AllActionsTooltipContent actions={actions} onCollapse={() => setShowAllActions(false)} />
              </div>
            </PortalTooltip>
          </>
        )}
      </div>
    </td>
  );
}
