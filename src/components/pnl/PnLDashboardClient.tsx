'use client';

import { useState, useMemo, useCallback } from 'react';
import type { PnLSummary, PnLEntry, HourlyPnLEntry } from '@/types/pnl';
import type { ProductPnLData } from '@/types/productPnL';
import type { DateRange } from '@/types/analytics';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { getDateRange } from '@/lib/dateUtils';
import { formatDateInTimezone } from '@/lib/timezone';
import { formatCurrency } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import { LiveProfitTicker } from '@/components/pnl/LiveProfitTicker';
import { PnLChartGrid } from '@/components/pnl/PnLChartGrid';
import { COGSManager } from '@/components/pnl/COGSManager';

interface PnLDashboardClientProps {
  summary: PnLSummary;
  dailyPnL: PnLEntry[];
  productPnL?: ProductPnLData[];
  productType?: 'physical' | 'digital';
  hourlyPnL?: HourlyPnLEntry[];
}

function computeEntryFromDaily(dailyPnL: PnLEntry[], range: DateRange): PnLEntry {
  const startStr = formatDateInTimezone(range.start);
  const endStr = formatDateInTimezone(range.end);
  const filtered = dailyPnL.filter((d) => d.date >= startStr && d.date <= endStr);
  if (filtered.length === 0) {
    return { date: startStr, revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, netProfit: 0, margin: 0, orderCount: 0 };
  }
  const t = filtered.reduce(
    (acc, d) => ({
      revenue: acc.revenue + d.revenue,
      cogs: acc.cogs + d.cogs,
      adSpend: acc.adSpend + d.adSpend,
      shipping: acc.shipping + d.shipping,
      fees: acc.fees + d.fees,
      refunds: acc.refunds + d.refunds,
      orderCount: acc.orderCount + (d.orderCount || 0),
      chargebackLoss: acc.chargebackLoss + (d.chargebackLoss || 0),
      chargebackWon: acc.chargebackWon + (d.chargebackWon || 0),
    }),
    { revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, orderCount: 0, chargebackLoss: 0, chargebackWon: 0 }
  );
  const netProfit = t.revenue - t.cogs - t.adSpend - t.shipping - t.fees - t.refunds - t.chargebackLoss + t.chargebackWon;
  const margin = t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0;
  return { date: startStr, ...t, netProfit, margin };
}

export function PnLDashboardClient({
  summary,
  dailyPnL,
  productPnL = [],
  productType = 'physical',
  hourlyPnL = [],
}: PnLDashboardClientProps) {
  const [datePreset, setDatePreset] = useState<string>('today');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);

  const dateRange = useMemo(() => {
    if (datePreset === 'custom' && customRange) return customRange;
    return getDateRange(datePreset as Parameters<typeof getDateRange>[0]);
  }, [datePreset, customRange]);

  const handleDateRangeChange = (range: DateRange) => {
    if (range.preset === 'custom') setCustomRange(range);
    setDatePreset(range.preset || 'custom');
  };

  const activeEntry = useMemo(() => computeEntryFromDaily(dailyPnL, dateRange), [dailyPnL, dateRange]);
  const todayEntry = useMemo(() => computeEntryFromDaily(dailyPnL, getDateRange('today')), [dailyPnL]);

  const isPositive = activeEntry.netProfit >= 0;

  const kpiCards = [
    { label: 'Revenue', value: activeEntry.revenue, color: 'text-emerald-600', sub: `${activeEntry.orderCount || 0} orders` },
    { label: 'COGS', value: activeEntry.cogs, color: 'text-red-500', sub: `${activeEntry.revenue > 0 ? ((activeEntry.cogs / activeEntry.revenue) * 100).toFixed(1) : 0}% of rev` },
    { label: 'Ad Spend', value: activeEntry.adSpend, color: 'text-orange-500', sub: `ROAS ${activeEntry.adSpend > 0 ? (activeEntry.revenue / activeEntry.adSpend).toFixed(2) : '\u2014'}\u00D7` },
    { label: 'Fees', value: activeEntry.fees + activeEntry.shipping, color: 'text-amber-500', sub: `${activeEntry.revenue > 0 ? (((activeEntry.fees + activeEntry.shipping) / activeEntry.revenue) * 100).toFixed(1) : 0}% of rev` },
    { label: 'Refunds', value: activeEntry.refunds, color: 'text-violet-500', sub: '' },
    { label: 'Net Profit', value: activeEntry.netProfit, color: isPositive ? 'text-emerald-600' : 'text-red-600', sub: `${activeEntry.margin.toFixed(1)}% margin`, bold: true },
  ];

  const chargebackLoss = activeEntry.chargebackLoss || 0;
  const chargebackWon = activeEntry.chargebackWon || 0;

  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  const handleCogsSave = useCallback(async (updates: Record<string, number>) => {
    if (!activeStoreId) throw new Error('No active store');
    // Build payload: { updates: { productId: { cost_per_unit, title } } }
    const payload: Record<string, { cost_per_unit: number; title: string }> = {};
    for (const [productId, costPerUnit] of Object.entries(updates)) {
      payload[productId] = { cost_per_unit: costPerUnit, title: productId };
    }
    const res = await fetch(`/api/pnl/save-cogs?storeId=${encodeURIComponent(activeStoreId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: payload }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to save COGS');
    }
  }, [activeStoreId]);

  return (
    <div className="space-y-5">

      {/* SECTION A: Today's Pulse */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <LiveProfitTicker netProfit={todayEntry.netProfit || summary.today.netProfit} />
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          {[
            { label: 'Revenue', value: formatCurrency(todayEntry.revenue), color: 'text-emerald-600' },
            { label: 'Ad Spend', value: formatCurrency(todayEntry.adSpend), color: 'text-orange-500' },
            { label: 'Margin', value: `${todayEntry.margin.toFixed(1)}%`, color: todayEntry.margin >= 15 ? 'text-emerald-600' : todayEntry.margin >= 5 ? 'text-amber-500' : 'text-red-600' },
            { label: 'Orders', value: (todayEntry.orderCount || 0).toString(), color: 'text-indigo-500' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-surface border border-border p-4 shadow-sm flex flex-col justify-between">
              <span className="text-sm font-semibold text-text-secondary uppercase tracking-widest">{s.label}</span>
              <span className={`text-2xl font-bold tabular-nums mt-1 ${s.color}`}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Date picker row */}
      <div className="flex items-center justify-between">
        <DateRangePicker dateRange={dateRange} onRangeChange={handleDateRangeChange} />
      </div>

      {/* SECTION B: KPI Bar */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl bg-surface border p-4 shadow-sm flex flex-col gap-1 ${card.bold ? 'border-border ring-1 ring-border-light' : 'border-border'}`}
          >
            <span className="text-sm font-semibold uppercase tracking-widest text-text-secondary">{card.label}</span>
            <span className={`text-2xl font-bold tabular-nums leading-none ${card.color}`}>
              {formatCurrency(card.value)}
            </span>
            {card.sub && <span className="text-sm text-text-secondary">{card.sub}</span>}
          </div>
        ))}
      </div>

      {/* SECTION C: Chart Grid — all 4 panels visible */}
      <PnLChartGrid
        dailyPnL={dailyPnL}
        hourlyPnL={hourlyPnL}
        dateRange={dateRange}
        activeEntry={activeEntry}
      />

      {/* SECTION D: Chargebacks */}
      <div className="rounded-2xl bg-surface border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-bold uppercase tracking-widest text-text-secondary">Chargebacks</p>
          {chargebackLoss === 0 && chargebackWon === 0 && (
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 text-[10px] font-semibold text-emerald-600">No chargebacks</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl border p-4 ${chargebackLoss > 0 ? 'border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/30' : 'border-border bg-surface-hover'}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-1">Lost</p>
            <p className={`text-2xl font-bold tabular-nums ${chargebackLoss > 0 ? 'text-red-600' : 'text-text-dimmed'}`}>
              {chargebackLoss > 0 ? formatCurrency(chargebackLoss) : '$0.00'}
            </p>
            <p className="text-sm text-text-secondary mt-1">{chargebackLoss > 0 ? 'Disputed & lost' : 'No lost chargebacks'}</p>
          </div>
          <div className={`rounded-xl border p-4 ${chargebackWon > 0 ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-border bg-surface-hover'}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary mb-1">Recovered</p>
            <p className={`text-2xl font-bold tabular-nums ${chargebackWon > 0 ? 'text-emerald-600' : 'text-text-dimmed'}`}>
              {chargebackWon > 0 ? formatCurrency(chargebackWon) : '$0.00'}
            </p>
            <p className="text-sm text-text-secondary mt-1">{chargebackWon > 0 ? 'Disputed & won' : 'No recoveries'}</p>
          </div>
        </div>
        {chargebackLoss === 0 && chargebackWon === 0 && (
          <p className="mt-3 text-sm text-text-secondary">
            Chargebacks are tracked automatically via Shopify webhooks. Data will appear here if any disputes are filed.
          </p>
        )}
      </div>

      {/* SECTION E: Product Performance & COGS */}
      <COGSManager onSave={handleCogsSave} />

    </div>
  );
}
