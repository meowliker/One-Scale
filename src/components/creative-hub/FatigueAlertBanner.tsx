'use client';

import { AlertTriangle, TrendingDown, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FatigueAlert } from '@/types/creativeHub';

interface FatigueAlertBannerProps {
  alert: FatigueAlert;
  onLaunchNewTest: (productProfileId: string) => void;
  onSnooze: (alertId: string) => void;
  onDismiss: (alertId: string) => void;
}

function TrendIndicator({ values, label, unit, invertColor }: { values: number[]; label: string; unit: string; invertColor?: boolean }) {
  if (values.length < 2) return null;
  const current = values[values.length - 1];
  const previous = values[values.length - 2];
  const delta = current - previous;
  const isUp = delta > 0;
  // For CPA/Frequency, up is bad. For CTR, down is bad.
  const isBad = invertColor ? isUp : !isUp;
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-amber-700 dark:text-amber-300 font-medium">{label}</span>
      <span className={cn('flex items-center gap-0.5 font-semibold', isBad ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
        <Icon className="h-3 w-3" />
        {current.toFixed(2)}{unit}
      </span>
    </div>
  );
}

export function FatigueAlertBanner({ alert, onLaunchNewTest, onSnooze, onDismiss }: FatigueAlertBannerProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 px-5 py-3.5">
      {/* Left: Alert info */}
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 truncate">
            Creative Fatigue Alert — {alert.productName}
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 truncate">{alert.creativeName}</p>
        </div>
      </div>

      {/* Center: Trend data */}
      <div className="flex items-center gap-4 flex-1 justify-center">
        <TrendIndicator values={alert.ctrTrend} label="CTR" unit="%" />
        <TrendIndicator values={alert.cpaTrend} label="CPA" unit="" invertColor />
        <TrendIndicator values={alert.frequencyTrend} label="Freq" unit="x" invertColor />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onLaunchNewTest(alert.productProfileId)}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
        >
          Launch New Test
        </button>
        <button
          onClick={() => onSnooze(alert.id)}
          className="rounded-lg border border-amber-300 dark:border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
        >
          Snooze 3 days
        </button>
        <button
          onClick={() => onDismiss(alert.id)}
          className="rounded-md p-1 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
