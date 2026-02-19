'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { User, Zap, Bot } from 'lucide-react';
import { mockActionLog } from '@/data/mockActionLog';
import type { ActionActor, ActionType } from '@/types/actionLog';

interface LatestActionsProps {
  entityId: string;
  className?: string;
}

const actorIcons: Record<ActionActor, typeof User> = {
  user: User,
  automation: Zap,
  ai: Bot,
};

const actorLabels: Record<ActionActor, string> = {
  user: 'You',
  automation: 'Rule',
  ai: 'AI',
};

const actionShortLabels: Record<ActionType, string> = {
  status_change: 'Status',
  budget_change: 'Budget',
  bid_change: 'Bid',
  creative_swap: 'Creative',
  audience_change: 'Audience',
  rule_triggered: 'Rule',
};

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

export function LatestActions({ entityId, className }: LatestActionsProps) {
  const latestAction = useMemo(() => {
    const actions = mockActionLog
      .filter((a) => a.entityId === entityId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return actions[0] ?? null;
  }, [entityId]);

  if (!latestAction) return null;

  const ActorIcon = actorIcons[latestAction.actor];
  const actorLabel = actorLabels[latestAction.actor];
  const actionLabel = actionShortLabels[latestAction.action];
  const timeAgo = formatTimeAgo(latestAction.timestamp);

  // Build compact display text
  let compactText = actionLabel;
  if (latestAction.previousValue && latestAction.newValue) {
    compactText = `${actionLabel} ${latestAction.previousValue}\u2192${latestAction.newValue}`;
  }

  return (
    <div className={cn('flex items-center gap-1.5 text-xs text-text-muted', className)}>
      <ActorIcon
        className={cn(
          'h-3 w-3 shrink-0',
          latestAction.actor === 'user' && 'text-text-muted',
          latestAction.actor === 'automation' && 'text-amber-500',
          latestAction.actor === 'ai' && 'text-blue-500'
        )}
      />
      <span className="truncate max-w-[180px]">
        {compactText}
        <span className="mx-1 text-text-dimmed">&middot;</span>
        {actorLabel}
        <span className="mx-1 text-text-dimmed">&middot;</span>
        {timeAgo}
      </span>
    </div>
  );
}
