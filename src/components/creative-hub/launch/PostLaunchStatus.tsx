'use client';

import {
  CheckCircle,
  Loader2,
  XCircle,
  RefreshCw,
  Play,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type LaunchItemStatus = 'ok' | 'creating' | 'failed';

export interface LaunchStatusItem {
  id: string;
  label: string;
  status: LaunchItemStatus;
  error?: string;
}

interface PostLaunchStatusProps {
  items: LaunchStatusItem[];
  onRetry?: (itemId: string) => void;
  onEnable?: (itemId: string) => void;
  onRollback?: () => void;
  hasPartialFailure: boolean;
}

const STATUS_ICON = {
  ok: CheckCircle,
  creating: Loader2,
  failed: XCircle,
};

const STATUS_COLOR = {
  ok: 'text-emerald-500',
  creating: 'text-blue-500',
  failed: 'text-red-500',
};

export function PostLaunchStatus({
  items,
  onRetry,
  onEnable,
  onRollback,
  hasPartialFailure,
}: PostLaunchStatusProps) {
  const completedCount = items.filter((i) => i.status === 'ok').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const creatingCount = items.filter((i) => i.status === 'creating').length;

  return (
    <div className="space-y-4">
      {/* Progress summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Launch Progress</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="h-3.5 w-3.5" />
            {completedCount} created
          </span>
          {creatingCount > 0 && (
            <span className="flex items-center gap-1 text-blue-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {creatingCount} in progress
            </span>
          )}
          {failedCount > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3.5 w-3.5" />
              {failedCount} failed
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            failedCount > 0
              ? 'bg-gradient-to-r from-emerald-500 to-red-500'
              : 'bg-gradient-to-r from-emerald-500 to-blue-500'
          )}
          style={{
            width: `${((completedCount + failedCount) / Math.max(items.length, 1)) * 100}%`,
          }}
        />
      </div>

      {/* Item list */}
      <div className="space-y-1.5">
        {items.map((item) => {
          const Icon = STATUS_ICON[item.status];

          return (
            <div
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2',
                item.status === 'ok' && 'border-emerald-200 bg-emerald-50/50',
                item.status === 'creating' && 'border-blue-200 bg-blue-50/50',
                item.status === 'failed' && 'border-red-200 bg-red-50/50'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 flex-shrink-0',
                  STATUS_COLOR[item.status],
                  item.status === 'creating' && 'animate-spin'
                )}
              />
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-800">{item.label}</p>
                {item.error && (
                  <p className="text-[10px] text-red-600">{item.error}</p>
                )}
              </div>
              {item.status === 'failed' && onRetry && (
                <button
                  onClick={() => onRetry(item.id)}
                  className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
              {item.status === 'failed' && onEnable && (
                <button
                  onClick={() => onEnable(item.id)}
                  className="flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-[10px] font-medium text-blue-600 transition-colors hover:bg-blue-50"
                >
                  <Play className="h-3 w-3" />
                  Enable
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Partial failure actions */}
      {hasPartialFailure && onRollback && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-800">
              Some items failed to create. You can retry individual items or rollback the entire launch.
            </p>
          </div>
          <button
            onClick={onRollback}
            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Rollback All
          </button>
        </div>
      )}
    </div>
  );
}
