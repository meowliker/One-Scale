'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { PnLSummary, PnLEntry, ProductCOGS, HourlyPnLEntry } from '@/types/pnl';
import type { ProductPnLData } from '@/types/productPnl';
import type { DateRange, DateRangePreset } from '@/types/analytics';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { getDateRange } from '@/lib/dateUtils';
import { formatDateInTimezone } from '@/lib/timezone';
import { formatCurrency } from '@/lib/utils';
import { calculateExpenses } from '@/lib/pnl/expenseEngine';
import type { CustomExpense } from '@/types/pnlSettings';
import { useStoreStore } from '@/stores/storeStore';
import { PnLSummaryCards } from '@/components/pnl/PnLSummaryCards';
import { PnLWaterfallChart } from '@/components/pnl/PnLWaterfallChart';
import { PnLTrendChart } from '@/components/pnl/PnLTrendChart';
import { MarginIndicator } from '@/components/pnl/MarginIndicator';
import { PnLDayPartChart } from '@/components/pnl/PnLDayPartChart';
import { ProductPnLSection } from '@/components/pnl/ProductPnLSection';
import { LivePulseRow } from '@/components/pnl/LivePulseRow';
import { PnLHourlyTrend } from '@/components/pnl/PnLHourlyTrend';
import { RefundBreakdown } from '@/components/pnl/RefundBreakdown';
import { ChargebackSection } from '@/components/pnl/ChargebackSection';
import { AOVSummary } from '@/components/pnl/AOVSummary';
import { MetricsBar } from '@/components/pnl/MetricsBar';
import { SectionWrapper } from '@/components/pnl/SectionWrapper';
import { ExpenseBreakdownRow } from '@/components/pnl/ExpenseBreakdownRow';

interface PnLDashboardClientProps {
  summary: PnLSummary;
  dailyPnL: PnLEntry[];
  products: ProductCOGS[];
  productPnL?: ProductPnLData[];
  productType?: 'physical' | 'digital';
  hourlyPnL?: HourlyPnLEntry[];
  currency?: string;
  refreshKey?: number;
}


function computeEntryFromDaily(dailyPnL: PnLEntry[], range: DateRange, expenses?: CustomExpense[]): PnLEntry {
  const startStr = formatDateInTimezone(range.start);
  const endStr = formatDateInTimezone(range.end);

  const filtered = dailyPnL.filter((day) => day.date >= startStr && day.date <= endStr);

  if (filtered.length === 0) {
    return { date: startStr, revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, netProfit: 0, margin: 0, orderCount: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0, chargebackLoss: 0, chargebackWon: 0, adjustments: 0, customExpenses: 0, expenseBreakdown: [] };
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
      adjustments: acc.adjustments + (day.adjustments || 0),
    }),
    { revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, orderCount: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0, chargebackLoss: 0, chargebackWon: 0, adjustments: 0 },
  );

  let customExpensesTotal = 0;
  let expenseBreakdown: { name: string; amount: number }[] = [];
  if (expenses && expenses.length > 0) {
    const result = calculateExpenses(expenses, { start: startStr, end: endStr });
    customExpensesTotal = result.totalExpenses;
    expenseBreakdown = result.breakdown.map(b => ({ name: b.name, amount: b.allocated }));
  }

  const netProfit = totals.revenue - totals.cogs - totals.adSpend - totals.shipping - totals.fees - totals.refunds - totals.chargebackLoss + totals.chargebackWon + totals.adjustments - customExpensesTotal;
  const margin = totals.revenue > 0 ? (netProfit / totals.revenue) * 100 : 0;

  return {
    date: startStr,
    ...totals,
    netProfit,
    margin,
    customExpenses: customExpensesTotal,
    expenseBreakdown,
  };
}

export function PnLDashboardClient({
  summary,
  dailyPnL,
  products,
  productPnL = [],
  productType = 'physical',
  hourlyPnL = [],
  currency = 'USD',
  refreshKey = 0,
}: PnLDashboardClientProps) {
  const [datePreset, setDatePreset] = useState<DateRangePreset>('today');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [customExpensesList, setCustomExpensesList] = useState<CustomExpense[]>([]);

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
    const entry = computeEntryFromDaily(dailyPnL, dateRange, customExpensesList);
    return entry;
  }, [dailyPnL, dateRange, customExpensesList]);

  const todayEntry = useMemo(() => {
    const todayRange = getDateRange('today');
    return computeEntryFromDaily(dailyPnL, todayRange, customExpensesList);
  }, [dailyPnL, customExpensesList]);

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
    return computeEntryFromDaily(dailyPnL, { start: prevStart, end: prevEnd }, customExpensesList);
  }, [dailyPnL, prevStart, prevEnd, customExpensesList]);

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

  // ── Scroll to top on store switch ──────────────────────────────────────────
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeStoreId]);

  // ── Date-range-aware product performance fetching ─────────────────────────
  const [liveProductPnL, setLiveProductPnL] = useState<ProductPnLData[] | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const productAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!activeStoreId) return;
    fetch(`/api/pnl/expenses?storeId=${encodeURIComponent(activeStoreId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.ok && json.data) {
          setCustomExpensesList(json.data.filter((e: any) => e.is_active).map((e: any) => ({
            id: e.id, name: e.name, category: e.category, amount: Number(e.amount),
            frequency: e.frequency, distribution: e.distribution,
            startDate: e.start_date, endDate: e.end_date, isActive: e.is_active,
          })));
        }
      })
      .catch(() => {});
  }, [activeStoreId]);

  const fetchProductsForRange = useCallback(async (from: string, to: string) => {
    if (!activeStoreId) return;

    // Abort any in-flight request
    productAbortRef.current?.abort();
    const controller = new AbortController();
    productAbortRef.current = controller;

    setProductLoading(true);
    setProductError(null);
    setLiveProductPnL(null); // Clear stale data immediately to prevent mismatched metrics

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

  // Re-fetch product data when date range changes OR live poll detects new data
  useEffect(() => {
    const from = formatDateInTimezone(dateRange.start);
    const to = formatDateInTimezone(dateRange.end);
    fetchProductsForRange(from, to);

    return () => { productAbortRef.current?.abort(); };
  }, [dateRange, fetchProductsForRange, refreshKey]);

  // Use live-fetched data ONLY — never fall back to stale props from previous store/date
  // This prevents "random amounts" flashing when switching stores or dates
  const effectiveProductPnL = productLoading ? [] : (liveProductPnL ?? []);
  // ── End product performance fetching ────────────────────────────────────────


  return (
    <div className="space-y-1">
      {/* S1: Live Pulse */}
      <div className="pb-4">
        <LivePulseRow todayEntry={todayEntry} summaryNetProfit={summary.today.netProfit} lastUpdated={lastUpdated} currency={currency} />
      </div>

      {/* Global Date Filter */}
      <div className="flex items-center justify-end pb-2">
        <DateRangePicker dateRange={dateRange} onRangeChange={handleDateRangeChange} />
      </div>

      {/* S2: Period View */}
      <SectionWrapper label="Period View">
        {/* KPI summary cards */}
        <PnLSummaryCards entry={activeEntry} comparison={previousEntry} isDigital={isDigital} lastUpdated={lastUpdated} currency={currency} />

        {/* Waterfall + Margin row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 mt-5">
          <div className="lg:col-span-3">
            <PnLWaterfallChart entry={activeEntry} isDigital={isDigital} currency={currency} />
          </div>
          <div className="lg:col-span-1">
            <div className="apple-card p-5 h-full flex flex-col justify-center">
              <MarginIndicator margin={activeEntry.margin} netProfit={activeEntry.netProfit} currency={currency} />
            </div>
          </div>
        </div>

        {(activeEntry.customExpenses || 0) > 0 && (
          <ExpenseBreakdownRow
            totalExpenses={activeEntry.customExpenses || 0}
            revenue={activeEntry.revenue}
            breakdown={activeEntry.expenseBreakdown || []}
            currency={currency}
          />
        )}

      </SectionWrapper>

      {/* S3: Refunds & Chargebacks — moved up for visibility */}
      <SectionWrapper label="Refunds & Chargebacks">
        <RefundBreakdown entry={activeEntry} currency={currency} />
        <div className="mt-4">
          <ChargebackSection
            chargebackLoss={activeEntry.chargebackLoss || 0}
            chargebackWon={activeEntry.chargebackWon || 0}
            currency={currency}
          />
        </div>
      </SectionWrapper>

      {/* S4: Trends */}
      <SectionWrapper label="Trends">
        <div className="apple-card p-5 mb-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Net Profit Trend</h3>
          <PnLTrendChart dailyPnL={filteredDailyPnL} previousDailyPnL={previousDailyPnL} comparisonDateLabel={comparisonDateLabel} currency={currency} />
        </div>
        <div className="apple-card p-5">
          <PnLDayPartChart dailyPnL={filteredDailyPnL} isDigital={isDigital} currency={currency} />
        </div>
      </SectionWrapper>

      {/* S5: Hourly Performance */}
      <SectionWrapper label="Hourly Performance" tag="NEW">
        <PnLHourlyTrend hourlyPnL={filteredHourlyPnL} previousHourlyPnL={previousHourlyPnL} comparisonDateLabel={comparisonDateLabel} currency={currency} />
      </SectionWrapper>

      {/* S6: Key Metrics Bar (AOV, Orders, Upsell Rate, ROAS) — always visible */}
      <SectionWrapper label="Key Metrics">
        <MetricsBar entry={activeEntry} currency={currency} />
      </SectionWrapper>

      {/* S7: Product Performance */}
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
          <ProductPnLSection products={effectiveProductPnL} isDigital={isDigital} currency={currency} />
        ) : (
          <div className="apple-card p-10 text-center">
            <p className="text-sm font-medium text-text-secondary">No products found for this period</p>
            <p className="text-xs text-text-secondary/50 mt-1.5">Try selecting a wider date range</p>
          </div>
        )}
      </SectionWrapper>

    </div>
  );
}
