'use client';

import type { RuleLogEntry } from '@/types/automation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Clock, Shield } from 'lucide-react';

interface ActivityLogProps {
  log: RuleLogEntry[];
}

const actionColorMap: Record<string, string> = {
  paused: 'bg-red-500',
  pause: 'bg-red-500',
  enabled: 'bg-green-500',
  enable: 'bg-green-500',
  increased: 'bg-blue-500',
  increase: 'bg-blue-500',
  reduced: 'bg-blue-500',
  decrease: 'bg-blue-500',
  notification: 'bg-yellow-500',
  notify: 'bg-yellow-500',
};

function getDotColor(actionTaken: string): string {
  const lower = actionTaken.toLowerCase();
  for (const [keyword, color] of Object.entries(actionColorMap)) {
    if (lower.includes(keyword)) return color;
  }
  return 'bg-gray-400';
}

function entityBadgeVariant(
  entityType: RuleLogEntry['entityType']
): 'success' | 'warning' | 'info' | 'default' {
  switch (entityType) {
    case 'campaign':
      return 'info';
    case 'adset':
      return 'warning';
    case 'ad':
      return 'success';
    default:
      return 'default';
  }
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ActivityLog({ log }: ActivityLogProps) {
  // Sort newest first
  const sorted = [...log].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white py-16">
        <Shield className="h-10 w-10 text-gray-400" />
        <h3 className="mt-3 text-sm font-semibold text-gray-900">No activity yet</h3>
        <p className="mt-1 text-sm text-gray-500">
          Rule activity will appear here once rules start triggering.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200" />

      <div className="space-y-0">
        {sorted.map((entry) => {
          const dotColor = getDotColor(entry.actionTaken);

          return (
            <div key={entry.id} className="relative flex gap-4 py-3">
              {/* Dot */}
              <div className="relative z-10 flex items-start pt-1">
                <div className={cn('h-[10px] w-[10px] rounded-full ring-4 ring-white', dotColor)} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{entry.ruleName}</span>
                  <Badge variant={entityBadgeVariant(entry.entityType)}>
                    {entry.entityType}
                  </Badge>
                </div>

                <p className="mt-0.5 text-sm text-gray-700">
                  {entry.actionTaken} &mdash;{' '}
                  <span className="text-gray-500">{entry.entityName}</span>
                </p>

                <p className="mt-0.5 text-xs text-gray-400">{entry.conditionMatched}</p>

                <div className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(entry.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
