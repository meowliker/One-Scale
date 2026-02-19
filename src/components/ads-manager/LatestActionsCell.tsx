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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActionsForEntity } from '@/data/mockLatestActions';
import type { ActionType, EntityAction } from '@/types/latestActions';
import { PortalTooltip } from '@/components/ui/PortalTooltip';

interface LatestActionsCellProps {
  entityId: string;
  actions?: EntityAction[]; // Real API data from Meta activities
  activitiesFullyLoaded?: boolean; // Whether full 90-day history has been fetched
}

interface ActionConfig {
  icon: LucideIcon;
  colorClass: string;
  bgClass: string;
  label: string;
}

const actionConfigMap: Record<ActionType, ActionConfig> = {
  budget_increase: {
    icon: TrendingUp,
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    label: 'Budget Increase',
  },
  budget_decrease: {
    icon: TrendingDown,
    colorClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    label: 'Budget Decrease',
  },
  status_pause: {
    icon: Pause,
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    label: 'Paused',
  },
  status_enable: {
    icon: Play,
    colorClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
    label: 'Enabled',
  },
  bid_change: {
    icon: DollarSign,
    colorClass: 'text-blue-400',
    bgClass: 'bg-blue-500/10',
    label: 'Bid Change',
  },
  creative_update: {
    icon: Palette,
    colorClass: 'text-purple-400',
    bgClass: 'bg-purple-500/10',
    label: 'Creative Update',
  },
  duplicate: {
    icon: Copy,
    colorClass: 'text-cyan-400',
    bgClass: 'bg-cyan-500/10',
    label: 'Duplicated',
  },
  ai_optimization: {
    icon: Sparkles,
    colorClass: 'text-primary-light',
    bgClass: 'bg-primary/10',
    label: 'AI Optimization',
  },
  audience_change: {
    icon: Users,
    colorClass: 'text-orange-400',
    bgClass: 'bg-orange-500/10',
    label: 'Audience Change',
  },
  schedule_change: {
    icon: Clock,
    colorClass: 'text-slate-400',
    bgClass: 'bg-slate-500/10',
    label: 'Schedule Change',
  },
};

const performedByConfig: Record<EntityAction['performedBy'], { label: string; className: string }> = {
  user: {
    label: 'User',
    className: 'bg-slate-500/20 text-slate-300',
  },
  ai: {
    label: 'AI',
    className: 'bg-primary/20 text-primary-light',
  },
  rule: {
    label: 'Rule',
    className: 'bg-amber-500/20 text-amber-300',
  },
};

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

/** Format timestamp as "Feb 12 at 10:45 AM" matching Facebook Activity History */
function formatActivityDate(timestamp: string): string {
  const date = new Date(timestamp);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${month} ${day} at ${time}`;
}

function ActionIconBadge({
  action,
  onMouseEnter,
  onMouseLeave,
}: {
  action: EntityAction;
  onMouseEnter: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
}) {
  const config = actionConfigMap[action.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md cursor-default transition-all',
        'hover:ring-1 hover:ring-border-light'
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={cn('flex h-6 w-6 items-center justify-center rounded-md', config.bgClass)}>
        <Icon className={cn('h-4 w-4', config.colorClass)} />
      </div>
      {action.performedByName && (
        <span className="hidden group-hover/actions:inline text-[10px] text-text-secondary font-medium max-w-[60px] truncate">
          {action.performedByName}
        </span>
      )}
    </div>
  );
}

function ActionTooltipContent({ action }: { action: EntityAction }) {
  const config = actionConfigMap[action.type];
  const performedBy = performedByConfig[action.performedBy];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'min-w-[280px] max-w-[340px]',
        'rounded-lg border border-border-light bg-surface-elevated',
        'p-3 shadow-xl'
      )}
    >
      {/* Activity type header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('flex h-5 w-5 items-center justify-center rounded', config.bgClass)}>
          <Icon className={cn('h-3.5 w-3.5', config.colorClass)} />
        </div>
        <span className="text-sm font-semibold text-text-primary">{action.description}</span>
      </div>

      {/* Activity details (old -> new values) */}
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

      {/* Item changed (object name + entity ID) */}
      {action.objectName && (
        <div className="flex items-start gap-1.5 mb-2 text-xs">
          <span className="text-text-dimmed shrink-0">Item changed:</span>
          <span className="text-text-secondary font-medium truncate">
            {action.objectName}
            <span className="text-text-dimmed font-normal ml-1">({action.entityId})</span>
          </span>
        </div>
      )}

      {/* Changed by + date/time */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-text-dimmed" />
          {action.performedByName && (
            <span className="text-[11px] text-text-secondary font-medium">
              {action.performedByName}
            </span>
          )}
          <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', performedBy.className)}>
            {performedBy.label}
          </span>
        </div>
        <span className="text-[11px] text-text-dimmed">{formatActivityDate(action.timestamp)}</span>
      </div>

      {/* Timezone info */}
      <div className="flex flex-col gap-0.5 mt-1.5 pt-1.5 border-t border-border">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-text-dimmed">Your timezone</span>
          <span className="text-text-muted font-mono">
            {new Date(action.timestamp).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
            })}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-text-dimmed">Ad account timezone</span>
          <span className="text-text-muted font-mono">
            {new Date(action.timestamp).toLocaleString('en-US', {
              timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Expanded tooltip showing all actions in a scrollable Activity History list */
function AllActionsTooltipContent({
  actions,
  onCollapse,
}: {
  actions: EntityAction[];
  onCollapse: () => void;
}) {
  return (
    <div
      className={cn(
        'min-w-[320px] max-w-[380px]',
        'rounded-lg border border-border-light bg-surface-elevated',
        'shadow-xl'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border">
        <span className="text-xs font-semibold text-text-primary">
          Activity History ({actions.length})
        </span>
        <button
          onClick={onCollapse}
          className="flex items-center gap-0.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Collapse
          <ChevronUp className="h-3 w-3" />
        </button>
      </div>

      {/* Scrollable action list */}
      <div className="max-h-[360px] overflow-y-auto">
        {actions.map((action, index) => {
          const config = actionConfigMap[action.type];
          const Icon = config.icon;
          return (
            <div
              key={action.id}
              className={cn(
                'px-3 py-2.5',
                index < actions.length - 1 && 'border-b border-border/50'
              )}
            >
              {/* Row: icon + description + time */}
              <div className="flex items-start gap-2">
                <div className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded mt-0.5', config.bgClass)}>
                  <Icon className={cn('h-3 w-3', config.colorClass)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-text-primary truncate">
                      {action.description}
                    </span>
                    <span className="text-[10px] text-text-dimmed shrink-0 whitespace-nowrap">
                      {formatActivityDate(action.timestamp)}
                    </span>
                  </div>
                  {/* Details */}
                  <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
                    {action.details}
                  </p>
                  {/* Item changed + changed by */}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-text-dimmed">
                    {action.objectName && (
                      <span className="truncate max-w-[140px]" title={action.objectName}>
                        {action.objectName}
                      </span>
                    )}
                    {action.objectName && action.performedByName && (
                      <span className="text-text-dimmed/50">|</span>
                    )}
                    {action.performedByName && (
                      <span className="flex items-center gap-0.5">
                        <User className="h-2.5 w-2.5" />
                        {action.performedByName}
                      </span>
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

export function LatestActionsCell({ entityId, actions: actionsProp, activitiesFullyLoaded }: LatestActionsCellProps) {
  const [hoveredActionId, setHoveredActionId] = useState<string | null>(null);
  const [showAllActions, setShowAllActions] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const overflowRef = useRef<HTMLSpanElement | null>(null);

  // Use real API data if available.
  // Only fall back to generated mock data when full history has been loaded and
  // the entity still has no activities. When only the 7-day partial load has been
  // done and there's no data, we show "No recent activity" instead of fake data.
  const actions = useMemo(() => {
    if (actionsProp && actionsProp.length > 0) return actionsProp;
    // If full history loaded but still no data, use mock data as fallback
    if (activitiesFullyLoaded) return getActionsForEntity(entityId);
    // Partial load (7 days) with no data — return empty to show hint
    return [];
  }, [entityId, actionsProp, activitiesFullyLoaded]);

  const handleMouseEnter = useCallback((actionId: string) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setShowAllActions(false);
    setHoveredActionId(actionId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredActionId(null);
      setShowAllActions(false);
      hideTimeoutRef.current = null;
    }, 150);
  }, []);

  const handleOverflowEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setHoveredActionId(null);
    setShowAllActions(true);
  }, []);

  const handleOverflowLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowAllActions(false);
      hideTimeoutRef.current = null;
    }, 150);
  }, []);

  if (actions.length === 0) {
    return (
      <td className="whitespace-nowrap px-3 py-3">
        {!activitiesFullyLoaded ? (
          <span className="text-[10px] text-text-dimmed italic" title="No activity in last 7 days. Click 'Full history' in the column header to load more.">
            No recent activity
          </span>
        ) : (
          <span className="text-xs text-text-dimmed">&mdash;</span>
        )}
      </td>
    );
  }

  const visibleActions = actions.slice(0, 3);
  const overflowCount = actions.length - 3;

  return (
    <td className="whitespace-nowrap px-3 py-3">
      <div className="group/actions flex items-center gap-1">
        {visibleActions.map((action) => (
          <div
            key={action.id}
            ref={(el) => {
              if (el) {
                iconRefs.current.set(action.id, el);
              }
            }}
          >
            <ActionIconBadge
              action={action}
              onMouseEnter={(e) => {
                e.stopPropagation();
                handleMouseEnter(action.id);
              }}
              onMouseLeave={handleMouseLeave}
            />
            <PortalTooltip
              anchorRef={{ current: iconRefs.current.get(action.id) || null }}
              visible={hoveredActionId === action.id}
            >
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
              className="flex h-6 items-center gap-0.5 rounded-md bg-surface-hover px-1.5 text-[11px] font-medium text-text-muted cursor-default hover:bg-surface-hover/80 transition-colors"
              onMouseEnter={handleOverflowEnter}
              onMouseLeave={handleOverflowLeave}
            >
              +{overflowCount}
              <ChevronDown className="h-3 w-3" />
            </span>
            <PortalTooltip
              anchorRef={overflowRef}
              visible={showAllActions}
            >
              <div onMouseEnter={handleOverflowEnter} onMouseLeave={handleOverflowLeave}>
                <AllActionsTooltipContent
                  actions={actions}
                  onCollapse={() => setShowAllActions(false)}
                />
              </div>
            </PortalTooltip>
          </>
        )}
      </div>
    </td>
  );
}
