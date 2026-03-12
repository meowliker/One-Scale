'use client';

import type { MetricKey } from '@/types/metrics';
import { formatMetric } from '@/lib/metrics';
import { formatRoas } from '@/lib/utils';
import { cn } from '@/lib/utils';

const PIXEL_METRIC_KEYS = new Set(['appPixelResults', 'appPixelPurchases', 'appPixelPurchaseValue', 'appPixelRoas', 'appPixelCpa']);

export interface MetricCellProps {
  metricKey: MetricKey;
  value: number;
  isTotals?: boolean;
  /** Shopify-attributed ROAS — shown as "Real" ROAS when metricKey is 'roas' */
  shopifyRoas?: number;
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

function getRoasTextColor(value: number): string {
  if (value === 0) return 'text-[#aeaeb2]';
  if (value < 1.0) return 'text-[#ff3b30]';
  if (value < 1.5) return 'text-[#ff9500]';
  return 'text-[#34c759]';
}

export function MetricCell({ metricKey, value, isTotals, shopifyRoas }: MetricCellProps) {
  const hasDualRoas = metricKey === 'roas' && shopifyRoas != null;
  const colorClass = hasDualRoas ? '' : getMetricColorClass(metricKey, value);

  return (
    <td 
      style={{ width: 90, minWidth: 90, maxWidth: 90 }}
      className={cn(
      "whitespace-nowrap px-3 py-2 text-right text-[13px] tabular-nums leading-5",
      colorClass || "text-text-primary",
      PIXEL_METRIC_KEYS.has(metricKey) && "app-pixel-metric-cell",
      isTotals && "!font-bold !text-[14px] bg-[#f8fafc] dark:bg-[#1e293b] text-[#111827] dark:text-[#f1f5f9]"
    )}>
      {hasDualRoas ? (
        /* Dual ROAS: Shopify "Real" (prominent) + Meta (muted) */
        <div className="flex flex-col items-end gap-0.5">
          <span className={cn("text-[12px] font-bold tabular-nums", getRoasTextColor(shopifyRoas))}>
            <span
              className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", getRoasDotColor(shopifyRoas))}
              aria-hidden="true"
            />
            {formatRoas(shopifyRoas)}
            <span className="ml-1 text-[9px] font-medium text-text-dimmed align-middle">Real</span>
          </span>
          <span className="text-[10px] text-text-dimmed tabular-nums">
            {formatRoas(value)}
            <span className="ml-1 text-[9px]">Meta</span>
          </span>
        </div>
      ) : (
        <>
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
        </>
      )}
    </td>
  );
}
