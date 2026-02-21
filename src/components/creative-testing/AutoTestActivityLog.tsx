'use client';

import { useState } from 'react';
import {
  Clock,
  Rocket,
  XCircle,
  TrendingUp,
  RefreshCw,
  Pause,
  Filter,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AutoTestLogEntry } from '@/data/mockAutoTestRules';
import { cn } from '@/lib/utils';

interface AutoTestActivityLogProps {
  log: AutoTestLogEntry[];
}

type ActionType = AutoTestLogEntry['action'];

const actionConfig: Record<
  ActionType,
  { label: string; color: string; dotColor: string; icon: LucideIcon }
> = {
  launched: {
    label: 'Launched',
    color: 'text-blue-700 bg-blue-50',
    dotColor: 'bg-blue-500',
    icon: Rocket,
  },
  killed: {
    label: 'Killed',
    color: 'text-red-700 bg-red-50',
    dotColor: 'bg-red-500',
    icon: XCircle,
  },
  scaled: {
    label: 'Scaled',
    color: 'text-green-700 bg-green-50',
    dotColor: 'bg-green-500',
    icon: TrendingUp,
  },
  replaced: {
    label: 'Replaced',
    color: 'text-orange-700 bg-orange-50',
    dotColor: 'bg-orange-500',
    icon: RefreshCw,
  },
  paused: {
    label: 'Paused',
    color: 'text-gray-700 bg-gray-50',
    dotColor: 'bg-gray-400',
    icon: Pause,
  },
};

const allActions: ActionType[] = ['launched', 'killed', 'scaled', 'replaced', 'paused'];

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMetric(entry: AutoTestLogEntry): string | null {
  if (!entry.metric || entry.value === undefined || entry.threshold === undefined) {
    return null;
  }
  if (entry.metric === 'CPA') {
    return `${entry.metric}: $${entry.value.toFixed(2)} (threshold: $${entry.threshold})`;
  }
  if (entry.metric === 'ROAS') {
    return `${entry.metric}: ${entry.value.toFixed(2)}x (threshold: ${entry.threshold}x)`;
  }
  if (entry.metric === 'Fatigue') {
    return `${entry.metric}: ${entry.value}% (threshold: ${entry.threshold}%)`;
  }
  return `${entry.metric}: ${entry.value} (threshold: ${entry.threshold})`;
}

export function AutoTestActivityLog({ log }: AutoTestActivityLogProps) {
  const [activeFilter, setActiveFilter] = useState<ActionType | 'all'>('all');

  const sorted = [...log].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const filtered =
    activeFilter === 'all'
      ? sorted
      : sorted.filter((entry) => entry.action === activeFilter);

  return (
    <div>
      {/* Filter buttons */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        <button
          onClick={() => setActiveFilter('all')}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            activeFilter === 'all'
              ? 'bg-primary text-white'
              : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed]'
          )}
        >
          All
        </button>
        {allActions.map((action) => {
          const config = actionConfig[action];
          return (
            <button
              key={action}
              onClick={() => setActiveFilter(action)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeFilter === action
                  ? config.color
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white py-12">
          <Clock className="h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">No activity matches this filter.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200" />

          <div className="space-y-0">
            {filtered.map((entry) => {
              const config = actionConfig[entry.action];
              const Icon = config.icon;
              const metricStr = formatMetric(entry);

              return (
                <div key={entry.id} className="relative flex gap-4 py-3">
                  {/* Dot */}
                  <div className="relative z-10 flex items-start pt-0.5">
                    <div
                      className={cn(
                        'flex h-[30px] w-[30px] items-center justify-center rounded-full ring-4 ring-white',
                        config.dotColor
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {entry.creativeName}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          config.color
                        )}
                      >
                        {config.label}
                      </span>
                    </div>

                    <p className="mt-0.5 text-sm text-gray-600">{entry.reason}</p>

                    {metricStr && (
                      <p className="mt-0.5 text-xs font-medium text-gray-500">{metricStr}</p>
                    )}

                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(entry.timestamp)}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span>{entry.campaignName}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
