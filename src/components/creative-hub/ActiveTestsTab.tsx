'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, FlaskConical, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import { TestCard } from '@/components/creative-hub/TestCard';
import { FatigueAlertBanner } from '@/components/creative-hub/FatigueAlertBanner';

const AUTO_REFRESH_INTERVAL = 90_000; // 90 seconds

export function ActiveTestsTab() {
  const {
    activeTests,
    activeTestsLoading,
    fatigueAlerts,
    fetchActiveTests,
    executeAIActions,
  } = useCreativeHubStore();
  const { stores, activeStoreId } = useStoreStore();
  const activeStore = stores.find((s) => s.id === activeStoreId);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const storeId = activeStore?.id;

  // Fetch data
  const refresh = useCallback(async () => {
    if (!storeId) return;
    await fetchActiveTests(storeId);
    setLastRefreshAt(new Date());
  }, [storeId, fetchActiveTests]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  // "Xs ago" ticker
  useEffect(() => {
    if (!lastRefreshAt) return;
    const tick = () => {
      setSecondsAgo(Math.floor((Date.now() - lastRefreshAt.getTime()) / 1000));
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [lastRefreshAt]);

  // Summary stats
  const productCount = new Set(activeTests.map((t) => t.productProfileId)).size;
  const creativeCount = activeTests.reduce((sum, t) => sum + t.items.length, 0);
  const totalDailySpend = activeTests.reduce((sum, t) => sum + t.dailyBudget, 0);

  // Active fatigue alerts only
  const activeFatigueAlerts = fatigueAlerts.filter((a) => a.status === 'active');

  const handleExecuteActions = async (testId: string, actions: Record<string, string>, _saveCopy: boolean) => {
    await executeAIActions(testId, actions);
    // saveCopy handling deferred to Task 16
  };

  const handleSnoozeFatigue = (_alertId: string) => {
    // API call deferred to Task 16
  };

  const handleDismissFatigue = (_alertId: string) => {
    // API call deferred to Task 16
  };

  const handleLaunchNewTest = (_productProfileId: string) => {
    // Navigate to inbox with product pre-selected — deferred to Task 16
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-text-primary">Active Tests</h2>
          {lastRefreshAt && (
            <span className="text-xs text-text-dimmed">
              Last refresh: {secondsAgo}s ago
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={activeTestsLoading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50 transition-colors"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', activeTestsLoading && 'animate-spin')}
          />
          Refresh
        </button>
      </div>

      {/* Summary bar */}
      {activeTests.length > 0 && (
        <div className="flex items-center gap-3 text-xs text-text-dimmed">
          <Activity className="h-3.5 w-3.5" />
          <span>
            <span className="font-semibold text-text-primary">{productCount}</span> product{productCount !== 1 ? 's' : ''}
            {' · '}
            <span className="font-semibold text-text-primary">{creativeCount}</span> creative{creativeCount !== 1 ? 's' : ''} testing
            {' · '}
            <span className="font-semibold text-text-primary">{formatCurrency(totalDailySpend)}</span>/day total spend
          </span>
        </div>
      )}

      {/* Team activity bar */}
      {activeTests.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg bg-surface px-4 py-2.5 border border-border/50">
          {/* Small avatar circles */}
          <div className="flex -space-x-1.5">
            {Array.from(new Set(activeTests.map((t) => t.launchedBy)))
              .slice(0, 3)
              .map((name) => (
                <div
                  key={name}
                  className="h-6 w-6 rounded-full bg-primary/10 border-2 border-surface-elevated flex items-center justify-center"
                  title={name}
                >
                  <span className="text-[9px] font-bold text-primary">
                    {name.charAt(0).toUpperCase()}
                  </span>
                </div>
              ))}
          </div>
          <p className="text-xs text-text-dimmed">
            <span className="font-medium text-text-secondary">{activeTests[0]?.launchedBy}</span>
            {': Testing '}
            <span className="font-medium text-text-secondary">{activeTests[0]?.items.length} creatives</span>
            {' for '}
            <span className="font-medium text-text-secondary">{activeTests[0]?.productName}</span>
            {activeTests[0]?.launchedAt && (
              <span className="text-text-dimmed">
                {' '}({getTimeAgo(activeTests[0].launchedAt)})
              </span>
            )}
          </p>
        </div>
      )}

      {/* Fatigue alert banners */}
      {activeFatigueAlerts.length > 0 && (
        <div className="space-y-3">
          {activeFatigueAlerts.map((alert) => (
            <FatigueAlertBanner
              key={alert.id}
              alert={alert}
              onLaunchNewTest={handleLaunchNewTest}
              onSnooze={handleSnoozeFatigue}
              onDismiss={handleDismissFatigue}
            />
          ))}
        </div>
      )}

      {/* Test cards */}
      {activeTests.length > 0 ? (
        <div className="space-y-4">
          {activeTests.map((test) => (
            <TestCard
              key={test.id}
              test={test}
              onExecuteActions={handleExecuteActions}
            />
          ))}
        </div>
      ) : (
        !activeTestsLoading && (
          <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center">
            <FlaskConical className="mx-auto h-12 w-12 text-text-dimmed/30" />
            <p className="mt-4 text-sm font-medium text-text-dimmed">No active tests</p>
            <p className="mt-1 text-xs text-text-dimmed/70">
              Launch creatives from the Inbox.
            </p>
          </div>
        )
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
