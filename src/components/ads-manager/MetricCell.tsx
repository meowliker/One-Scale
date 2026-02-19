'use client';

import type { MetricKey } from '@/types/metrics';
import { formatMetric } from '@/lib/metrics';
import { cn } from '@/lib/utils';

export interface MetricCellProps {
  metricKey: MetricKey;
  value: number;
}

function getMetricColorClass(metricKey: MetricKey, value: number): string {
  switch (metricKey) {
    case 'roas':
    case 'appPixelRoas': {
      if (value === 0) return 'text-text-dimmed';
      if (value < 1.0) return 'text-red-400';
      if (value < 1.4) return 'text-amber-400';
      if (value < 1.6) return 'text-emerald-400';
      return 'text-emerald-300 font-semibold';
    }
    case 'ctr': {
      if (value === 0) return 'text-text-dimmed';
      if (value < 0.5) return 'text-red-400';
      if (value < 1.0) return 'text-amber-400';
      return 'text-emerald-400';
    }
    case 'cvr': {
      if (value === 0) return 'text-text-dimmed';
      if (value < 1.0) return 'text-red-400';
      if (value < 3.0) return 'text-amber-400';
      return 'text-emerald-400';
    }
    default:
      return '';
  }
}

function getRoasDotColor(value: number): string {
  if (value === 0) return 'bg-text-dimmed';
  if (value < 1.0) return 'bg-red-400';
  if (value < 1.4) return 'bg-amber-400';
  if (value < 1.6) return 'bg-emerald-400';
  return 'bg-emerald-300';
}

export function MetricCell({ metricKey, value }: MetricCellProps) {
  const colorClass = getMetricColorClass(metricKey, value);

  return (
    <td className={cn(
      "whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums",
      colorClass || "text-text-secondary"
    )}>
      {(metricKey === 'roas' || metricKey === 'appPixelRoas') && (
        <span
          className={cn(
            "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
            getRoasDotColor(value)
          )}
          aria-hidden="true"
        />
      )}
      {formatMetric(metricKey, value)}
    </td>
  );
}
