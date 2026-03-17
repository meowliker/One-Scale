'use client';

import { cn, formatCurrency } from '@/lib/utils';

interface MarginIndicatorProps {
  margin: number;
  netProfit: number;
  currency?: string;
}

function getMarginConfig(margin: number) {
  if (margin > 15) {
    return { stroke: '#10b981', textClass: 'text-emerald-600 dark:text-emerald-400', label: 'Healthy', badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  }
  if (margin > 5) {
    return { stroke: '#f59e0b', textClass: 'text-amber-600 dark:text-amber-400', label: 'Moderate', badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
  }
  return { stroke: '#ef4444', textClass: 'text-red-600 dark:text-red-400', label: 'Low', badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400' };
}

export function MarginIndicator({ margin, netProfit, currency = 'USD' }: MarginIndicatorProps) {
  const { stroke, textClass, label, badgeClass } = getMarginConfig(margin);

  const size = 140;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedMargin = Math.max(0, Math.min(100, margin));
  const dashOffset = circumference - (clampedMargin / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track — uses theme-aware color */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-2xl font-extrabold tabular-nums', textClass)}>
            {margin.toFixed(1)}%
          </span>
          <span className="text-xs font-medium text-text-secondary/50 uppercase tracking-wide">Margin</span>
        </div>
      </div>

      <div className="mt-3 text-center">
        <span className={cn('inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold', badgeClass)}>
          {label}
        </span>
      </div>

      <div className="mt-3 text-center">
        <p className="text-xs text-text-secondary/50 uppercase tracking-wide">Net Profit</p>
        <p className={cn('text-lg font-bold tabular-nums', netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          {formatCurrency(netProfit, currency)}
        </p>
      </div>
    </div>
  );
}
