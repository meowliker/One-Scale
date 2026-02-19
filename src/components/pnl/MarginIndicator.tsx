'use client';

import { cn, formatCurrency } from '@/lib/utils';

interface MarginIndicatorProps {
  margin: number;
  netProfit: number;
}

function getMarginColor(margin: number): {
  stroke: string;
  text: string;
  label: string;
} {
  if (margin > 15) {
    return { stroke: '#10b981', text: 'text-emerald-600', label: 'Healthy' };
  }
  if (margin > 5) {
    return { stroke: '#f59e0b', text: 'text-amber-600', label: 'Moderate' };
  }
  return { stroke: '#ef4444', text: 'text-red-600', label: 'Low' };
}

export function MarginIndicator({ margin, netProfit }: MarginIndicatorProps) {
  const { stroke, text, label } = getMarginColor(margin);

  // SVG circle parameters
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Clamp margin between 0 and 100 for the visual ring
  const clampedMargin = Math.max(0, Math.min(100, margin));
  const dashOffset = circumference - (clampedMargin / 100) * circumference;

  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1e2235"
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
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-3xl font-bold', text)}>
            {margin.toFixed(1)}%
          </span>
          <span className="text-xs font-medium text-text-muted">Margin</span>
        </div>
      </div>

      <div className="mt-4 text-center">
        <span
          className={cn(
            'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
            margin > 15
              ? 'bg-emerald-50 text-emerald-700'
              : margin > 5
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-700'
          )}
        >
          {label}
        </span>
      </div>

      <div className="mt-3 text-center">
        <p className="text-xs text-text-muted">Net Profit</p>
        <p
          className={cn(
            'text-lg font-semibold',
            netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
          )}
        >
          {formatCurrency(netProfit)}
        </p>
      </div>
    </div>
  );
}
