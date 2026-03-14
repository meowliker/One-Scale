'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { PnLSummary, PnLEntry, ProductCOGS, HourlyPnLEntry } from '@/types/pnl';
import type { ProductPnLData } from '@/types/productPnl';
import type { DateRange, DateRangePreset } from '@/types/analytics';
import { Tabs } from '@/components/ui/Tabs';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { getDateRange } from '@/lib/dateUtils';
import { formatDateInTimezone } from '@/lib/timezone';
import { formatCurrency } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import { PnLSummaryCards } from '@/components/pnl/PnLSummaryCards';
import { PnLWaterfallChart } from '@/components/pnl/PnLWaterfallChart';
import { PnLTrendChart } from '@/components/pnl/PnLTrendChart';
import { MarginIndicator } from '@/components/pnl/MarginIndicator';
import { COGSManager } from '@/components/pnl/COGSManager';
import { PnLDayPartChart } from '@/components/pnl/PnLDayPartChart';
import { ProductPnLSection } from '@/components/pnl/ProductPnLSection';
import { LivePulseRow } from '@/components/pnl/LivePulseRow';
import { PnLHourlyTrend } from '@/components/pnl/PnLHourlyTrend';
import { RefundBreakdown } from '@/components/pnl/RefundBreakdown';
import { ChargebackSection } from '@/components/pnl/ChargebackSection';
import { AOVSummary } from '@/components/pnl/AOVSummary';
import { SectionWrapper } from '@/components/pnl/SectionWrapper';

interface PnLDashboardClientProps {
  summary: PnLSummary;
  dailyPnL: PnLEntry[];
  products: ProductCOGS[];
  productPnL?: ProductPnLData[];
  productType?: 'physical' | 'digital';
  hourlyPnL?: HourlyPnLEntry[];
}

const allBottomTabs = [
  { id: 'cogs', label: 'COGS Manager', digital: false },
  { id: 'breakdown', label: 'Breakdown', digital: true },
];

function computeEntryFromDaily(dailyPnL: PnLEntry[], range: DateRange): PnLEntry {
  const startStr = formatDateInTimezone(range.start);
  const endStr = formatDateInTimezone(range.end);

  const filtered = dailyPnL.filter((day) => day.date >= startStr && day.date <= endStr);

  if (filtered.length === 0) {
    return { date: startStr, revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, netProfit: 0, margin: 0, orderCount: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0, chargebackLoss: 0, chargebackWon: 0 };
  }

  const totals = filtered.reduce(
    (acc, day) => ({
      revenue: acc.revenue + day.revenue,
      cogs: acc.cogs + day.cogs,
      adSpend: acc.adSpend + day.adSpend,
      shipping: acc.shipping + day.shipping,
      fees: acc.fees + day.fees,
      refunds: acc.refunds + day.refunds,
      orderCount: acc.orderCount + (day.orderCount || 0),
      fullRefundCount: acc.fullRefundCount + (day.fullRefundCount || 0),
      partialRefundCount: acc.partialRefundCount + (day.partialRefundCount || 0),
      fullRefundAmount: acc.fullRefundAmount + (day.fullRefundAmount || 0),
      partialRefundAmount: acc.partialRefundAmount + (day.partialRefundAmount || 0),
      chargebackLoss: acc.chargebackLoss + (day.chargebackLoss || 0),
      chargebackWon: acc.chargebackWon + (day.chargebackWon || 0),
    }),
    { revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, orderCount: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0, chargebackLoss: 0, chargebackWon: 0 },
  );

  const netProfit = totals.revenue - totals.cogs - totals.adSpend - totals.shipping - totals.fees - totals.refunds - totals.chargebackLoss + totals.chargebackWon;
  const margin = totals.revenue > 0 ? (netProfit / totals.revenue) * 100 : 0;

  return {
    date: startStr,
    ...totals,
    netProfit,
    margin,
  };
}

export function PnLDashboardClient({
  summary,
  dailyPnL,
  products,
  productPnL = [],
  productType = 'physical',
  hourlyPnL = [],
}: PnLDashboardClientProps) {
  const [datePreset, setDatePreset] = useState<DateRangePreset>('today');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [bottomTab, setBottomTab] = useState<string>(productType === 'digital' ? 'breakdown' : 'cogs');
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());

  // Update the timestamp whenever new data props arrive
  useEffect(() => {
    setLastUpdated(new Date());
  }, [dailyPnL, hourlyPnL, summary]);

  const isDigital = productType === 'digital';

  const dateRange = useMemo(() => {
    if (datePreset === 'custom' && customRange) return customRange;
    return getDateRange(datePreset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datePreset, customRange, dailyPnL]);

  const handleDateRangeChange = (range: DateRange) => {
    if (range.preset === 'custom') {
      setCustomRange(range);
    }
    setDatePreset(range.preset || 'custom');
  };

  const activeEntry = useMemo(() => {
    const entry = computeEntryFromDaily(dailyPnL, dateRange);
    return entry;
  }, [dailyPnL, dateRange]);

  const todayEntry = useMemo(() => {
    const todayRange = getDateRange('today');
    return computeEntryFromDaily(dailyPnL, todayRange);
  }, [dailyPnL]);

  // Filter dailyPnL and hourlyPnL by the global date range
  const filteredDailyPnL = useMemo(() => {
    const startStr = formatDateInTimezone(dateRange.start);
    const endStr = formatDateInTimezone(dateRange.end);
    return dailyPnL.filter((day) => day.date >= startStr && day.date <= endStr);
  }, [dailyPnL, dateRange]);

  const filteredHourlyPnL = useMemo(() => {
    const startStr = formatDateInTimezone(dateRange.start);
    const endStr = formatDateInTimezone(dateRange.end);
    return hourlyPnL.filter((h) => h.date >= startStr && h.date <= endStr);
  }, [hourlyPnL, dateRange]);

  // Compute previous period dates and data for comparison (same duration, shifted back)
  const { prevStart, prevEnd } = useMemo(() => {
    const durationMs = dateRange.end.getTime() - dateRange.start.getTime();
    const pEnd = new Date(dateRange.start.getTime() - 86400000);
    const pStart = new Date(pEnd.getTime() - durationMs);
    return { prevStart: pStart, prevEnd: pEnd };
  }, [dateRange]);

  const previousDailyPnL = useMemo(() => {
    const startStr = formatDateInTimezone(prevStart);
    const endStr = formatDateInTimezone(prevEnd);
    return dailyPnL.filter((day) => day.date >= startStr && day.date <= endStr);
  }, [dailyPnL, prevStart, prevEnd]);

  const previousEntry = useMemo(() => {
    return computeEntryFromDaily(dailyPnL, { start: prevStart, end: prevEnd });
  }, [dailyPnL, prevStart, prevEnd]);

  const comparisonDateLabel = useMemo(() => {
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      current: `${fmt(dateRange.start)} – ${fmt(dateRange.end)}`,
      previous: `${fmt(prevStart)} – ${fmt(prevEnd)}`,
    };
  }, [dateRange, prevStart, prevEnd]);

  const previousHourlyPnL = useMemo(() => {
    const durationMs = dateRange.end.getTime() - dateRange.start.getTime();
    const prevEnd = new Date(dateRange.start.getTime() - 86400000);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const startStr = formatDateInTimezone(prevStart);
    const endStr = formatDateInTimezone(prevEnd);
    return hourlyPnL.filter((h) => h.date >= startStr && h.date <= endStr);
  }, [hourlyPnL, dateRange]);

  // ── Date-range-aware product performance fetching ─────────────────────────
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [liveProductPnL, setLiveProductPnL] = useState<ProductPnLData[] | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const productAbortRef = useRef<AbortController | null>(null);

  const fetchProductsForRange = useCallback(async (from: string, to: string) => {
    if (!activeStoreId) return;

    // Abort any in-flight request
    productAbortRef.current?.abort();
    const controller = new AbortController();
    productAbortRef.current = controller;

    setProductLoading(true);
    setProductError(null);

    try {
      const params = new URLSearchParams({ storeId: activeStoreId, from, to });
      const res = await fetch(`/api/pnl/product-performance?${params}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        // If DB cache route fails (503 = Supabase not configured), try product-breakdown
        const params2 = new URLSearchParams({ storeId: activeStoreId, from, to });
        const res2 = await fetch(`/api/pnl/product-breakdown?${params2}`, {
          signal: controller.signal,
        });
        if (res2.ok) {
          const json2 = await res2.json() as {
            ok?: boolean;
            breakdown?: Array<{
              product_id: string; title: string; image: string | null;
              units_sold: number; revenue: number; cogs: number; cost_per_unit: number;
              fees: number; ad_spend: number; net_profit: number; margin_pct: number;
              order_count: number; classification: string;
            }>;
          };
          if (json2.ok && json2.breakdown && json2.breakdown.length > 0) {
            const mapped: ProductPnLData[] = json2.breakdown.map((b) => ({
              productId: b.product_id,
              productName: b.title,
              productImage: b.image,
              shopifyUrl: `/admin/products/${b.product_id}`,
              sku: '',
              unitsSold: b.units_sold,
              revenue: b.revenue,
              cogs: b.cogs,
              shipping: 0,
              fees: b.fees,
              netProfit: b.net_profit,
              margin: b.margin_pct,
              fbMetrics: {
                roas: b.ad_spend > 0 ? Math.round((b.revenue / b.ad_spend) * 100) / 100 : 0,
                cpc: 0, cpm: 0, ctr: 0, aov: 0, atcRate: 0,
                spend: b.ad_spend, impressions: 0, clicks: 0,
                purchases: 0, costPerPurchase: 0, frequency: 0, reach: 0,
              },
              isAdvertised: b.ad_spend > 0,
              adLandingPageUrl: null, adName: null, adSetName: null, campaignName: null,
              category: (({ MAIN: 'main', UPSELL: 'upsell', BUNDLE: 'addon' } as Record<string, string>)[b.classification] ?? 'main') as 'main' | 'upsell' | 'downsell' | 'addon',
            }));
            setLiveProductPnL(mapped);
            setProductLoading(false);
            return;
          }
        }
        throw new Error(`Product API returned ${res.status}`);
      }

      const json = await res.json() as { ok?: boolean; data?: ProductPnLData[] };
      if (json.ok && json.data) {
        setLiveProductPnL(json.data);
      } else {
        setLiveProductPnL([]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[ProductPnL] Fetch failed:', err instanceof Error ? err.message : err);
      setProductError(err instanceof Error ? err.message : 'Failed to load');
      // Keep showing prop data as fallback
      setLiveProductPnL(null);
    } finally {
      setProductLoading(false);
    }
  }, [activeStoreId]);

  // Re-fetch product data when date range changes
  useEffect(() => {
    const from = formatDateInTimezone(dateRange.start);
    const to = formatDateInTimezone(dateRange.end);
    fetchProductsForRange(from, to);

    return () => { productAbortRef.current?.abort(); };
  }, [dateRange, fetchProductsForRange]);

  // Use live-fetched data if available, otherwise fall back to props
  const effectiveProductPnL = liveProductPnL ?? productPnL;
  // ── End product performance fetching ────────────────────────────────────────

  useEffect(() => {
    if (isDigital && bottomTab === 'cogs') {
      setBottomTab('breakdown');
    }
  }, [isDigital, bottomTab]);

  return (
    <div className="space-y-1">
      {/* S1: Live Pulse */}
      <div className="pb-4">
        <LivePulseRow todayEntry={todayEntry} summaryNetProfit={summary.today.netProfit} lastUpdated={lastUpdated} />
      </div>

      {/* Global Date Filter */}
      <div className="flex items-center justify-end pb-2">
        <DateRangePicker dateRange={dateRange} onRangeChange={handleDateRangeChange} />
      </div>

      {/* S2: Period View */}
      <SectionWrapper label="Period View">
        {/* KPI summary cards */}
        <PnLSummaryCards entry={activeEntry} comparison={previousEntry} isDigital={isDigital} lastUpdated={lastUpdated} />

        {/* Waterfall + Margin row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 mt-5">
          <div className="lg:col-span-3">
            <PnLWaterfallChart entry={activeEntry} isDigital={isDigital} />
          </div>
          <div className="lg:col-span-1">
            <div className="apple-card p-5 h-full flex flex-col justify-center">
              <MarginIndicator margin={activeEntry.margin} netProfit={activeEntry.netProfit} />
            </div>
          </div>
        </div>

      </SectionWrapper>

      {/* S3: Refunds & Chargebacks — moved up for visibility */}
      <SectionWrapper label="Refunds & Chargebacks">
        <RefundBreakdown entry={activeEntry} />
        <div className="mt-4">
          <ChargebackSection
            chargebackLoss={activeEntry.chargebackLoss || 0}
            chargebackWon={activeEntry.chargebackWon || 0}
          />
        </div>
      </SectionWrapper>

      {/* S4: Trends */}
      <SectionWrapper label="Trends">
        <div className="apple-card p-5 mb-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Net Profit Trend</h3>
          <PnLTrendChart dailyPnL={filteredDailyPnL} previousDailyPnL={previousDailyPnL} comparisonDateLabel={comparisonDateLabel} />
        </div>
        <div className="apple-card p-5">
          <PnLDayPartChart dailyPnL={filteredDailyPnL} isDigital={isDigital} />
        </div>
      </SectionWrapper>

      {/* S5: Hourly Performance */}
      <SectionWrapper label="Hourly Performance" tag="NEW">
        <PnLHourlyTrend hourlyPnL={filteredHourlyPnL} previousHourlyPnL={previousHourlyPnL} comparisonDateLabel={comparisonDateLabel} />
      </SectionWrapper>

      {/* S6: Product Performance + AOV */}
      <SectionWrapper label="Product Performance">
        {productLoading ? (
          <div className="apple-card p-10 text-center">
            <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-text-secondary/20 border-t-text-primary" />
            <p className="text-sm font-medium text-text-secondary mt-3">Loading product data...</p>
          </div>
        ) : productError && effectiveProductPnL.length === 0 ? (
          <div className="apple-card p-10 text-center">
            <p className="text-sm font-medium text-red-400">Failed to load product data</p>
            <p className="text-xs text-text-secondary/50 mt-1.5">{productError}</p>
            <button
              onClick={() => {
                const from = formatDateInTimezone(dateRange.start);
                const to = formatDateInTimezone(dateRange.end);
                fetchProductsForRange(from, to);
              }}
              className="mt-3 text-xs text-accent hover:text-accent/80 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : effectiveProductPnL.length > 0 ? (
          <>
            <ProductPnLSection products={effectiveProductPnL} isDigital={isDigital} />
            <div className="mt-5">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">AOV Metrics</h3>
              <AOVSummary products={effectiveProductPnL} />
            </div>
          </>
        ) : (
          <div className="apple-card p-10 text-center">
            <p className="text-sm font-medium text-text-secondary">No products found for this period</p>
            <p className="text-xs text-text-secondary/50 mt-1.5">Try selecting a wider date range</p>
          </div>
        )}
      </SectionWrapper>

      {/* S7: Settings — COGS / Breakdown tabs */}
      <SectionWrapper label="Settings">
        <Tabs
          tabs={allBottomTabs.filter((t) => isDigital ? t.digital : true).map(({ id, label }) => ({ id, label }))}
          activeTab={bottomTab}
          onChange={setBottomTab}
        />
        {bottomTab === 'cogs' && <COGSManager products={products} />}
        {bottomTab === 'breakdown' && (
          <div className="apple-card p-5 mt-3">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">Cost Breakdown</h3>
            <div className="space-y-4">
              {[
                ...(!isDigital ? [{ label: 'COGS', value: activeEntry.cogs, color: 'bg-red-500' }] : []),
                { label: 'Ad Spend', value: activeEntry.adSpend, color: 'bg-orange-500' },
                ...(!isDigital ? [{ label: 'Shipping', value: activeEntry.shipping, color: 'bg-amber-500' }] : []),
                { label: 'Transaction Fees', value: activeEntry.fees, color: 'bg-yellow-500' },
                { label: 'Refunds', value: activeEntry.refunds, color: 'bg-violet-500' },
              ].map((costItem) => {
                const pct = activeEntry.revenue > 0 ? (costItem.value / activeEntry.revenue) * 100 : 0;
                return (
                  <div key={costItem.label}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-text-secondary">{costItem.label}</span>
                      <span className="font-semibold text-text-primary">
                        {formatCurrency(costItem.value)}
                        <span className="ml-2 text-xs text-text-secondary/50">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-hover">
                      <div className={`h-full rounded-full ${costItem.color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SectionWrapper>
    </div>
  );
}
