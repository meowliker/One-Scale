'use client';

import { getQueryClient } from './queryClient';
import { getCreatives } from '@/services/creativeAnalysis';
import { getPnLSummary, getDailyPnL, getProducts } from '@/services/pnl';
import { getProductPnL } from '@/services/productPnL';
import {
  getBlendedMetricsForRange,
  getTimeSeriesForRange,
  getTopCampaignsForRange,
} from '@/services/analytics';

/**
 * Prefetch React Query data for a given route on sidebar hover.
 * Only prefetches if data isn't already cached.
 */
export function prefetchRouteData(href: string, activeStoreId: string | null) {
  if (!activeStoreId) return;

  const qc = getQueryClient();

  switch (href) {
    case '/dashboard/summary':
      qc.prefetchQuery({
        queryKey: ['summary', activeStoreId, 'today'],
        queryFn: async () => {
          const [metrics, series, campaigns, dailyPnL] = await Promise.all([
            getBlendedMetricsForRange('today')(),
            getTimeSeriesForRange('today')(),
            getTopCampaignsForRange('today')(),
            getDailyPnL(),
          ]);
          return { blendedMetrics: metrics, timeSeries: series, topCampaigns: campaigns };
        },
        staleTime: 5 * 60 * 1000,
      });
      break;

    case '/dashboard/pnl':
      qc.prefetchQuery({
        queryKey: ['pnl', activeStoreId],
        queryFn: async () => {
          const [summary, products, dailyPnL, productPnL] = await Promise.all([
            getPnLSummary(),
            getProducts(),
            getDailyPnL(),
            getProductPnL(),
          ]);
          return { summary, products, dailyPnL, productPnL };
        },
        staleTime: 5 * 60 * 1000,
      });
      break;

    case '/dashboard/creative-analysis':
      qc.prefetchQuery({
        queryKey: ['creatives', activeStoreId],
        queryFn: () => getCreatives(),
        staleTime: 5 * 60 * 1000,
      });
      break;

    // Other pages that don't use React Query yet don't need prefetching
    default:
      break;
  }
}
