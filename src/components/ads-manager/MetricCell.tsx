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
      if (value === 0) return 'text-[#aeaeb2]';
      if (value < 1.0) return 'text-[#ff3b30]';
      if (value < 1.4) return 'text-[#ff9500]';
      if (value < 1.6) return 'text-[#34c759]';
      return 'text-[#34c759] font-semibold';
    }
    case 'ctr': {
      if (value === 0) return 'text-[#aeaeb2]';
      if (value < 0.5) return 'text-[#ff3b30]';
      if (value < 1.0) return 'text-[#ff9500]';
      return 'text-[#34c759]';
    }
    case 'cvr': {
      if (value === 0) return 'text-[#aeaeb2]';
      if (value < 1.0) return 'text-[#ff3b30]';
      if (value < 3.0) return 'text-[#ff9500]';
      return 'text-[#34c759]';
    }
    default:
      return '';
  }
}

function getRoasDotColor(value: number): string {
  if (value === 0) return 'bg-[#aeaeb2]';
  if (value < 1.0) return 'bg-[#ff3b30]';
  if (value < 1.4) return 'bg-[#ff9500]';
  if (value < 1.6) return 'bg-[#34c759]';
  return 'bg-[#34c759]';
}

export function MetricCell({ metricKey, value }: MetricCellProps) {
  const colorClass = getMetricColorClass(metricKey, value);

  return (
    <td className={cn(
      "whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums",
      colorClass || "text-[#1d1d1f]"
    )}>
      {(metricKey === 'roas' || metricKey === 'appPixelRoas') && (
        <span
          className={cn(
            "mr-1 inline-block h-1.5 w-1.5 rounded-full",
            getRoasDotColor(value)
          )}
          aria-hidden="true"
        />
      )}
      {formatMetric(metricKey, value)}
    </td>
  );
}
