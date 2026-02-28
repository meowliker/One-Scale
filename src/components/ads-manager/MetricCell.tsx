'use client';

import type { MetricKey } from '@/types/metrics';
import { formatMetric } from '@/lib/metrics';
import { cn } from '@/lib/utils';

const PIXEL_METRIC_KEYS = new Set(['appPixelResults', 'appPixelPurchases', 'appPixelPurchaseValue', 'appPixelRoas', 'appPixelCpa']);

export interface MetricCellProps {
  metricKey: MetricKey;
  value: number;
  isTotals?: boolean;
}

function getMetricColorClass(metricKey: MetricKey, value: number): string {
  switch (metricKey) {
    case 'roas':
    case 'appPixelRoas': {
      if (value === 0) return 'text-[#aeaeb2]';
      if (value < 1.0) return 'text-[#ff3b30]';       // red — bad
      if (value < 1.5) return 'text-[#ff9500]';       // orange — ok
      return 'text-[#34c759] font-bold';               // bold green — good
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
  if (value < 1.5) return 'bg-[#ff9500]';
  return 'bg-[#34c759]';
}

export function MetricCell({ metricKey, value, isTotals }: MetricCellProps) {
  const colorClass = getMetricColorClass(metricKey, value);

  return (
    <td className={cn(
      "whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums",
      colorClass || "text-text-primary",
      PIXEL_METRIC_KEYS.has(metricKey) && "bg-[#e8f2ff] dark:bg-[#1e3a5f] border-l border-[#0071e3]/10",
      isTotals && "!font-bold !text-[13.5px] bg-[#f0f4ff] dark:bg-[#172554]"
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
