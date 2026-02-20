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
      if (value === 0) return 'text-text-dimmed/50';
      if (value < 1.0) return 'text-red-500';
      if (value < 1.4) return 'text-amber-600';
      if (value < 1.6) return 'text-emerald-600';
      return 'text-emerald-600 font-bold';
    }
    case 'ctr': {
      if (value === 0) return 'text-text-dimmed/50';
      if (value < 0.5) return 'text-red-500';
      if (value < 1.0) return 'text-amber-600';
      return 'text-emerald-600';
    }
    case 'cvr': {
      if (value === 0) return 'text-text-dimmed/50';
      if (value < 1.0) return 'text-red-500';
      if (value < 3.0) return 'text-amber-600';
      return 'text-emerald-600';
    }
    default:
      return '';
  }
}

function getRoasDotColor(value: number): string {
  if (value === 0) return 'bg-text-dimmed/30';
  if (value < 1.0) return 'bg-red-500';
  if (value < 1.4) return 'bg-amber-500';
  if (value < 1.6) return 'bg-emerald-500';
  return 'bg-emerald-500';
}

export function MetricCell({ metricKey, value }: MetricCellProps) {
  const colorClass = getMetricColorClass(metricKey, value);

  return (
    <td className={cn(
      "whitespace-nowrap px-4 py-3.5 text-right text-[13px] tabular-nums tracking-tight",
      colorClass || "text-text-secondary"
    )}>
      {(metricKey === 'roas' || metricKey === 'appPixelRoas') && (
        <span
          className={cn(
            "mr-1.5 inline-block h-2 w-2 rounded-full shadow-sm",
            getRoasDotColor(value)
          )}
          aria-hidden="true"
        />
      )}
      {formatMetric(metricKey, value)}
    </td>
  );
}
