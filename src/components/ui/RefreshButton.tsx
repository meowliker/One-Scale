'use client';

import { RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useDataFetchStore } from '@/stores/dataFetchStore';

export function RefreshButton() {
  const { lastRefreshed, isRefreshing, refresh } = useDataFetchStore();

  const timeAgoText = lastRefreshed
    ? formatDistanceToNow(lastRefreshed, { addSuffix: true })
    : null;

  // If the refresh just happened within the last 30 seconds, show "Just now"
  const isJustNow =
    lastRefreshed && Date.now() - lastRefreshed.getTime() < 30_000;

  return (
    <button
      onClick={refresh}
      disabled={isRefreshing}
      className={cn(
        'flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <RefreshCw
        className={cn('h-4 w-4', isRefreshing && 'animate-spin')}
      />
      <span className="hidden sm:inline">
        {isRefreshing
          ? 'Refreshing...'
          : isJustNow
            ? 'Just now'
            : timeAgoText
              ? `Updated ${timeAgoText}`
              : 'Refresh'}
      </span>
    </button>
  );
}
