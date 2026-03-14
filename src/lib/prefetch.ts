'use client';

import { getQueryClient } from './queryClient';
import { getCreatives } from '@/services/creativeAnalysis';
import { getPnLSummary, getDailyPnL, getProducts } from '@/services/pnl';
// Dynamic import to avoid pulling server-only deps (better-sqlite3/fs) into client bundle
const getProductPnL = (...args: Parameters<typeof import('@/services/productPnL').getProductPnL>) =>
  import('@/services/productPnL').then(m => m.getProductPnL(...args));
import {
  getBlendedMetricsForRange,
  getTimeSeriesForRange,
  getTopCampaignsForRange,
} from '@/services/analytics';
import { getCampaigns } from '@/services/adsManager';
import { formatDateInTimezone } from '@/lib/timezone';
import { getDateRange } from '@/lib/dateUtils';
import type { DateRangePreset } from '@/types/analytics';
import type { PnLEntry, PnLSummary } from '@/types/pnl';

function computeShopifyMetricsFromPnL(dailyPnL: PnLEntry[], preset: DateRangePreset) {
  const range = getDateRange(preset);
  const startStr = formatDateInTimezone(range.start);
  const endStr = formatDateInTimezone(range.end);

  const filteredDays = dailyPnL.filter((day) => day.date >= startStr && day.date <= endStr);
  const shopifyRevenue = Math.round(filteredDays.reduce((sum, day) => sum + (day.revenue || 0), 0) * 100) / 100;
  const shopifyOrders = filteredDays.reduce((sum, day) => sum + (day.orderCount || 0), 0);
  const shopifyAov = shopifyOrders > 0 ? Math.round((shopifyRevenue / shopifyOrders) * 100) / 100 : 0;
  return { shopifyRevenue, shopifyOrders, shopifyAov };
}

function computeShopifyMetrics(dailyPnL: PnLEntry[], pnlSummary: PnLSummary | null, preset: DateRangePreset) {
  if (preset === 'today' && pnlSummary?.today) {
    const revenue = Math.round((pnlSummary.today.revenue || 0) * 100) / 100;
    const orders = pnlSummary.today.orderCount || 0;
    return {
      shopifyRevenue: revenue,
      shopifyOrders: orders,
      shopifyAov: orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0,
    };
  }
  return computeShopifyMetricsFromPnL(dailyPnL, preset);
}

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
          const [metrics, series, campaigns, dailyPnL, pnlSummary] = await Promise.all([
            getBlendedMetricsForRange('today')(),
            getTimeSeriesForRange('today')(),
            getTopCampaignsForRange('today')(),
            getDailyPnL(),
            getPnLSummary().catch(() => null),
          ]);
          const shopifyMetrics = computeShopifyMetrics(dailyPnL, pnlSummary, 'today');
          return {
            blendedMetrics: {
              ...metrics,
              shopifyRevenue: shopifyMetrics.shopifyRevenue,
              shopifyOrders: shopifyMetrics.shopifyOrders,
              shopifyAov: shopifyMetrics.shopifyAov,
            },
            timeSeries: series,
            topCampaigns: campaigns,
          };
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

    case '/dashboard/ads-manager': {
      const todayRange = getDateRange('today');
      const since = formatDateInTimezone(todayRange.start);
      const until = formatDateInTimezone(todayRange.end);
      qc.prefetchQuery({
        queryKey: ['campaigns', activeStoreId, since, until],
        queryFn: () => getCampaigns({ since, until }, { preferCache: true }),
        staleTime: 5 * 60 * 1000,
      });
      break;
    }

    // Other pages that don't use React Query yet don't need prefetching
    default:
      break;
  }
}
