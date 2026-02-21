'use client';

import { useState, useEffect, useMemo } from 'react';
import type { PnLSummary, PnLEntry, ProductCOGS } from '@/types/pnl';
import type { ProductPnLData } from '@/types/productPnL';
import type { DateRange, DateRangePreset } from '@/types/analytics';
import { Tabs } from '@/components/ui/Tabs';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { getDateRange } from '@/lib/dateUtils';
import { formatDateInTimezone } from '@/lib/timezone';
import { PnLSummaryCards } from '@/components/pnl/PnLSummaryCards';
import { PnLWaterfallChart } from '@/components/pnl/PnLWaterfallChart';
import { PnLTrendChart } from '@/components/pnl/PnLTrendChart';
import { MarginIndicator } from '@/components/pnl/MarginIndicator';
import { COGSManager } from '@/components/pnl/COGSManager';
import { LiveProfitTicker } from '@/components/pnl/LiveProfitTicker';
import { PnLDayPartChart } from '@/components/pnl/PnLDayPartChart';
import { ProductPnLSection } from '@/components/pnl/ProductPnLSection';
import { formatCurrency } from '@/lib/utils';

interface PnLDashboardClientProps {
  summary: PnLSummary;
  dailyPnL: PnLEntry[];
  products: ProductCOGS[];
  productPnL?: ProductPnLData[];
  productType?: 'physical' | 'digital';
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
    return { date: startStr, revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, netProfit: 0, margin: 0, orderCount: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0 };
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
    }),
    { revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, orderCount: 0, fullRefundCount: 0, partialRefundCount: 0, fullRefundAmount: 0, partialRefundAmount: 0 },
  );

  const netProfit = totals.revenue - totals.cogs - totals.adSpend - totals.shipping - totals.fees - totals.refunds;
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
}: PnLDashboardClientProps) {
  const [datePreset, setDatePreset] = useState<DateRangePreset>('today');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [bottomTab, setBottomTab] = useState<string>(productType === 'digital' ? 'breakdown' : 'cogs');

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
    const startStr = formatDateInTimezone(dateRange.start);
    const endStr = formatDateInTimezone(dateRange.end);
    console.log(`[P&L] Range: ${startStr} to ${endStr} | Revenue: $${entry.revenue.toFixed(2)} | Orders: ${entry.orderCount} | Ad Spend: $${entry.adSpend.toFixed(2)}`);
    return entry;
  }, [dailyPnL, dateRange]);

  // When productType changes (e.g. after data loads), update bottom tab
  useEffect(() => {
    if (isDigital && bottomTab === 'cogs') {
      setBottomTab('breakdown');
    }
  }, [isDigital, bottomTab]);

  return (
    <div className="space-y-6">
      {/* Live ticker hero */}
      <LiveProfitTicker netProfit={summary.today.netProfit} />

      {/* Date range selector */}
      <div className="flex items-center justify-between">
        <DateRangePicker dateRange={dateRange} onRangeChange={handleDateRangeChange} />
      </div>

      {/* Summary KPI cards */}
      <PnLSummaryCards entry={activeEntry} isDigital={isDigital} />

      {/* Waterfall chart + Margin indicator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-base font-semibold text-gray-800 mb-4">Profit Waterfall</h3>
            <PnLWaterfallChart entry={activeEntry} isDigital={isDigital} />
          </div>
        </div>
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Margin</h3>
            <MarginIndicator
              margin={activeEntry.margin}
              netProfit={activeEntry.netProfit}
            />
          </div>

          {/* Quick stats */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Quick Stats</h3>
            <div className="space-y-3">
              {[
                { label: 'Revenue', value: activeEntry.revenue, color: 'text-emerald-600' },
                { label: 'Total Costs', value: activeEntry.cogs + activeEntry.adSpend + activeEntry.shipping + activeEntry.fees + activeEntry.refunds, color: 'text-red-500' },
                { label: 'Net Profit', value: activeEntry.netProfit, color: activeEntry.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{stat.label}</span>
                  <span className={`text-sm font-semibold tabular-nums ${stat.color}`}>
                    {formatCurrency(stat.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Net Profit Trend chart */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Net Profit Trend</h3>
        <PnLTrendChart dailyPnL={dailyPnL} />
      </div>

      {/* Daily P&L breakdown chart */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <PnLDayPartChart dailyPnL={dailyPnL} />
      </div>

      {/* Product-wise P&L */}
      {productPnL.length > 0 && (
        <ProductPnLSection products={productPnL} />
      )}

      {/* Bottom tabs: COGS Manager / Breakdown */}
      <Tabs
        tabs={allBottomTabs.filter((t) => isDigital ? t.digital : true).map(({ id, label }) => ({ id, label }))}
        activeTab={bottomTab}
        onChange={setBottomTab}
      />

      {bottomTab === 'cogs' && <COGSManager products={products} />}

      {bottomTab === 'breakdown' && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="mb-4 text-sm font-semibold text-gray-800">
            Cost Breakdown
          </h3>
          <div className="space-y-3">
            {[
              ...(!isDigital ? [{ label: 'COGS', value: activeEntry.cogs, color: 'bg-red-500' }] : []),
              { label: 'Ad Spend', value: activeEntry.adSpend, color: 'bg-orange-500' },
              ...(!isDigital ? [{ label: 'Shipping', value: activeEntry.shipping, color: 'bg-amber-500' }] : []),
              { label: 'Transaction Fees', value: activeEntry.fees, color: 'bg-yellow-500' },
              { label: 'Refunds', value: activeEntry.refunds, color: 'bg-violet-500' },
            ].map((item) => {
              const pct =
                activeEntry.revenue > 0
                  ? (item.value / activeEntry.revenue) * 100
                  : 0;
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">{item.label}</span>
                    <span className="font-medium text-gray-800">
                      ${item.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="ml-2 text-xs text-gray-400">
                        ({pct.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full ${item.color}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
