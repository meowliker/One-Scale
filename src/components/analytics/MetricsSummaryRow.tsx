'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import { cn, formatCurrency, formatNumber, formatPercentage, formatRoas } from '@/lib/utils';
import { formatMetric } from '@/lib/metrics';

export interface MetricsSummaryRowProps {
  metrics: Record<string, number>;
}

interface SparklinePoint {
  value: number;
}

// --- Source Icons ---
type DataSource = 'shopify' | 'facebook';

function ShopifyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path
        d="M15.34 3.27c-.07-.04-.14-.04-.2-.01-.06.03-1.18.36-1.18.36s-.78-2.15-2.84-2.15c-.04 0-.08 0-.12.01C10.56.95 10.1.7 9.7.7c-2.5 0-3.7 3.12-4.07 4.71-.97.3-1.66.51-1.74.54-.54.17-.56.19-.63.7C3.2 7.1 1.5 20.15 1.5 20.15l10.97 1.9.01-.01 5.95-1.29S15.41 3.31 15.34 3.27zM11.3 4.6l-1.75.54c.24-.92.69-1.83 1.24-2.43.21-.22.5-.47.83-.61-.22.72-.32 1.64-.32 2.5zm-1.72-3c.27 0 .5.09.72.27-.94.44-1.96 1.56-2.39 3.79l-1.38.43C7 4.37 8.05 1.6 9.58 1.6zm.46 11.44c-.05-.85-.46-1.53-.46-1.53s1.06-.56 1.45-.85c.39-.29.65-.63.65-1.13 0-.5-.25-.9-.73-.9-.48 0-.96.44-.96 1.02 0 .35.15.6.15.6s-.55.53-.82.81c-.27.28-.52.62-.52 1.19 0 1.19.87 2.19 2.44 2.19 1.4 0 2.46-.86 2.46-1.89 0-.85-.56-1.3-1.14-1.62-.58-.32-1.22-.5-1.22-.92 0-.29.22-.47.54-.47.36 0 .58.22.58.58 0 .16-.04.29-.04.29l1.12-.32s.08-.22.08-.54c0-.82-.67-1.38-1.6-1.38-1.06 0-1.82.72-1.82 1.6 0 .5.15.84.42 1.13.27.29.64.49 1 .69.5.28.76.45.76.78 0 .37-.34.66-.88.66-.62 0-1.07-.36-1.42-.89z"
        fill="currentColor"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <path
        d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 5.99 4.388 10.954 10.125 11.854V15.47H7.078V12h3.047V9.356c0-3.007 1.792-4.668 4.533-4.668 1.312 0 2.686.234 2.686.234v2.953H15.83c-1.491 0-1.956.925-1.956 1.875V12h3.328l-.532 3.47h-2.796v8.385C19.612 22.954 24 17.99 24 12z"
        fill="currentColor"
      />
    </svg>
  );
}

function SourceBadge({ source }: { source: DataSource }) {
  if (source === 'shopify') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
        <ShopifyIcon />
        Shopify
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
      <FacebookIcon />
      Meta
    </span>
  );
}

/** Generate 7-day sparkline data from a base value with slight variation */
function generateSparkline(baseValue: number): SparklinePoint[] {
  const points: SparklinePoint[] = [];
  for (let i = 0; i < 7; i++) {
    const variance = 0.85 + Math.random() * 0.3; // 85% - 115% of base
    const dayFactor = i < 3 ? 0.9 + i * 0.04 : 0.95 + (i - 3) * 0.02;
    points.push({ value: baseValue * variance * dayFactor });
  }
  return points;
}

/** Compute a simulated trend % change from sparkline data */
function computeTrend(sparkline: SparklinePoint[]): number {
  if (sparkline.length < 2) return 0;
  const firstHalf = sparkline.slice(0, 3).reduce((s, p) => s + p.value, 0) / 3;
  const secondHalf = sparkline.slice(4).reduce((s, p) => s + p.value, 0) / 3;
  if (firstHalf === 0) return 0;
  return ((secondHalf - firstHalf) / firstHalf) * 100;
}

// --- Animated Number ---
function parseNumericValue(value: string): { prefix: string; number: number; suffix: string; decimals: number } | null {
  const match = value.match(/^([^0-9]*?)([\d,]+\.?\d*)(.*?)$/);
  if (!match) return null;
  const numStr = match[2].replace(/,/g, '');
  const num = parseFloat(numStr);
  if (isNaN(num)) return null;
  const decMatch = numStr.match(/\.(\d+)/);
  return { prefix: match[1], number: num, suffix: match[3], decimals: decMatch ? decMatch[1].length : 0 };
}

function formatAnimated(num: number, decimals: number, useCommas: boolean): string {
  const fixed = num.toFixed(decimals);
  if (!useCommas) return fixed;
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function AnimatedNumber({ value }: { value: string }) {
  const [display, setDisplay] = useState(value);
  const animated = useRef(false);
  const raf = useRef<number | null>(null);

  const animate = useCallback(() => {
    const parsed = parseNumericValue(value);
    if (!parsed || animated.current) {
      setDisplay(value);
      return;
    }
    animated.current = true;
    const duration = 900;
    const start = performance.now();
    const target = parsed.number;
    const hasCommas = value.includes(',');

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      setDisplay(`${parsed.prefix}${formatAnimated(current, parsed.decimals, hasCommas)}${parsed.suffix}`);
      if (progress < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [value]);

  useEffect(() => {
    animate();
    return () => { if (raf.current !== null) cancelAnimationFrame(raf.current); };
  }, [animate]);

  return <>{display}</>;
}

// --- Sparkline component ---
function MiniSparkline({ data, color }: { data: SparklinePoint[]; color: string }) {
  const gradientId = `sparkline-${color.replace('#', '')}`;
  return (
    <div className="h-[30px] w-[80px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={true}
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Profit Breakdown Modal ---
interface ProfitBreakdownModalProps {
  revenue: number;
  adSpend: number;
  transactionFees: number;
  refunds: number;
  netProfit: number;
  margin: number;
  onClose: () => void;
}

function ProfitBreakdownModal({
  revenue,
  adSpend,
  transactionFees,
  refunds,
  netProfit,
  margin,
  onClose,
}: ProfitBreakdownModalProps) {
  // Calculate bar widths as percentage of revenue (the max)
  const maxVal = revenue > 0 ? revenue : 1;
  const barPct = (val: number) => Math.min(Math.abs(val) / maxVal * 100, 100);

  const rows: { label: string; value: number; formatted: string; color: string; type: 'positive' | 'negative' | 'result' }[] = [
    { label: 'Shopify Revenue', value: revenue, formatted: formatCurrency(revenue), color: 'bg-emerald-500', type: 'positive' },
    { label: 'Ad Spend', value: adSpend, formatted: `-${formatCurrency(adSpend)}`, color: 'bg-red-500', type: 'negative' },
    { label: 'Transaction Fees (2.9%)', value: transactionFees, formatted: `-${formatCurrency(transactionFees)}`, color: 'bg-orange-500', type: 'negative' },
    { label: 'Refunds (2.5%)', value: refunds, formatted: `-${formatCurrency(refunds)}`, color: 'bg-amber-500', type: 'negative' },
    { label: 'Net Profit', value: netProfit, formatted: formatCurrency(netProfit), color: netProfit >= 0 ? 'bg-emerald-500' : 'bg-red-500', type: 'result' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface-elevated border border-border rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <h3 className="text-lg font-semibold text-text-primary mb-1">Profit Breakdown</h3>
        <p className="text-xs text-text-muted mb-5">Digital product P&L (no COGS)</p>

        {/* Waterfall bars */}
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  'text-xs font-medium',
                  row.type === 'result' ? 'text-text-primary' : 'text-text-muted'
                )}>
                  {row.type === 'negative' && <span className="text-text-muted mr-1">-</span>}
                  {row.type === 'result' && <span className="text-text-muted mr-1">=</span>}
                  {row.label}
                </span>
                <span className={cn(
                  'text-sm font-semibold tabular-nums',
                  row.type === 'positive' ? 'text-emerald-400' :
                  row.type === 'negative' ? 'text-red-400' :
                  netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {row.formatted}
                </span>
              </div>
              {/* CSS bar */}
              <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-700', row.color)}
                  style={{ width: `${barPct(row.value)}%`, opacity: row.type === 'result' ? 0.9 : 0.7 }}
                />
              </div>
              {/* Separator before result */}
              {row.type === 'negative' && row.label.startsWith('Refunds') && (
                <div className="border-t border-dashed border-border mt-3" />
              )}
            </div>
          ))}
        </div>

        {/* Margin badge */}
        <div className="mt-5 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
          <span className="text-xs font-medium text-text-muted">Profit Margin</span>
          <span className={cn(
            'text-sm font-bold',
            margin >= 0 ? 'text-emerald-400' : 'text-red-400'
          )}>
            {margin.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// --- KPI Card ---
interface KpiCardConfig {
  title: string;
  value: string;
  sparklineBase: number;
  color: string;
  isRevenue?: boolean;
  invertTrend?: boolean;
  source: DataSource;
  subValues?: { label: string; value: string; source: DataSource }[];
  onClick?: () => void;
  /** Optional extra text rendered beside the main value (e.g. margin %) */
  valueSuffix?: string;
}

function KpiCard({ config }: { config: KpiCardConfig }) {
  const sparkline = useMemo(() => generateSparkline(config.sparklineBase), [config.sparklineBase]);
  const trend = useMemo(() => computeTrend(sparkline), [sparkline]);
  const isPositive = config.invertTrend ? trend <= 0 : trend >= 0;
  const trendAbs = Math.abs(trend);

  return (
    <div
      onClick={config.onClick}
      className={cn(
        'group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-300',
        'glass hover:scale-[1.02] hover:shadow-lg',
        config.isRevenue
          ? 'border-primary/40 animate-glow'
          : 'border-border',
        config.onClick && 'cursor-pointer'
      )}
    >
      {/* Gradient glow overlay for Revenue card */}
      {config.isRevenue && (
        <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
      )}

      {/* Top: label + source badge + trend */}
      <div className="relative flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium uppercase tracking-wider text-text-muted truncate">
            {config.title}
          </span>
          <SourceBadge source={config.source} />
        </div>
        <div
          className={cn(
            'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0',
            isPositive
              ? 'bg-success/15 text-success-light'
              : 'bg-danger/15 text-danger-light'
          )}
        >
          {isPositive ? (
            <TrendingUp className="h-2.5 w-2.5" />
          ) : (
            <TrendingDown className="h-2.5 w-2.5" />
          )}
          {trendAbs.toFixed(1)}%
        </div>
      </div>

      {/* Big number + optional suffix (e.g. margin %) */}
      <div className="relative mt-2 flex items-baseline gap-1.5">
        <p className="text-2xl font-bold tracking-tight text-text-primary">
          <AnimatedNumber value={config.value} />
        </p>
        {config.valueSuffix && (
          <span className="text-xs font-medium text-text-muted">{config.valueSuffix}</span>
        )}
      </div>

      {/* Sub-values (e.g., Shopify Revenue vs FB Revenue) */}
      {config.subValues && config.subValues.length > 0 && (
        <div className="relative mt-1.5 flex flex-col gap-0.5">
          {config.subValues.map((sub) => (
            <div key={sub.label} className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <SourceBadge source={sub.source} />
              <span className="truncate">{sub.label}:</span>
              <span className="font-medium text-text-secondary">{sub.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sparkline */}
      <div className="relative mt-2">
        <MiniSparkline data={sparkline} color={config.color} />
      </div>
    </div>
  );
}

// --- Main Component ---
export function MetricsSummaryRow({ metrics }: MetricsSummaryRowProps) {
  const [showProfitBreakdown, setShowProfitBreakdown] = useState(false);

  const fbRevenue = metrics.totalRevenue ?? 0;
  const shopifyRevenue = metrics.shopifyRevenue ?? 0;
  const spend = metrics.totalSpend ?? 0;
  const conversions = metrics.totalConversions ?? 0;
  const cpa = conversions > 0 ? spend / conversions : 0;

  // P&L logic for digital product (no COGS)
  const transactionFees = shopifyRevenue * 0.029; // 2.9% Shopify Payments
  const refunds = shopifyRevenue * 0.025; // 2.5% refund rate
  const netProfit = shopifyRevenue - spend - transactionFees - refunds;
  const margin = shopifyRevenue > 0 ? (netProfit / shopifyRevenue) * 100 : 0;

  // Additional FB metrics
  const cpc = metrics.blendedCpc ?? 0;
  const cpm = metrics.blendedCpm ?? 0;
  const ctr = metrics.blendedCtr ?? 0;

  // Dual-source ROAS
  const fbRoas = spend > 0 ? fbRevenue / spend : 0;
  const shopifyRoas = spend > 0 ? shopifyRevenue / spend : 0;

  // Dual-source Conversions / Orders — use real Shopify data
  const shopifyOrders = metrics.shopifyOrders ?? 0;

  // Dual-source AOV — use real Shopify data
  const fbAov = conversions > 0 ? fbRevenue / conversions : 0;
  const shopifyAov = metrics.shopifyAov ?? (shopifyOrders > 0 ? shopifyRevenue / shopifyOrders : 0);

  const cards: KpiCardConfig[] = [
    {
      title: 'Revenue',
      value: formatCurrency(shopifyRevenue),
      sparklineBase: shopifyRevenue / 7,
      color: '#10b981',
      isRevenue: true,
      source: 'shopify',
      subValues: [
        { label: 'Shopify', value: formatCurrency(shopifyRevenue), source: 'shopify' },
        { label: 'FB Attributed', value: formatCurrency(fbRevenue), source: 'facebook' },
      ],
    },
    {
      title: 'Ad Spend',
      value: formatCurrency(spend),
      sparklineBase: spend / 7,
      color: '#3b82f6',
      source: 'facebook',
    },
    {
      title: 'ROAS',
      value: formatMetric('roas', shopifyRoas),
      sparklineBase: shopifyRoas,
      color: '#7c5cfc',
      source: 'shopify',
      subValues: [
        { label: 'Shopify ROAS', value: formatRoas(shopifyRoas), source: 'shopify' },
        { label: 'FB ROAS', value: formatRoas(fbRoas), source: 'facebook' },
      ],
    },
    {
      title: 'CPA',
      value: formatCurrency(cpa),
      sparklineBase: cpa,
      color: '#f59e0b',
      invertTrend: true,
      source: 'facebook',
    },
    {
      title: 'Conversions',
      value: formatNumber(shopifyOrders),
      sparklineBase: shopifyOrders / 7,
      color: '#06b6d4',
      source: 'shopify',
      subValues: [
        { label: 'Shopify Orders', value: formatNumber(shopifyOrders), source: 'shopify' },
        { label: 'FB Attributed', value: formatNumber(conversions), source: 'facebook' },
      ],
    },
    {
      title: 'AOV',
      value: formatCurrency(shopifyAov),
      sparklineBase: shopifyAov,
      color: '#f97316',
      invertTrend: false,
      source: 'shopify',
      subValues: [
        { label: 'Shopify AOV', value: formatCurrency(shopifyAov), source: 'shopify' },
        { label: 'FB AOV', value: formatCurrency(fbAov), source: 'facebook' },
      ],
    },
    {
      title: 'Net Profit',
      value: formatCurrency(netProfit),
      sparklineBase: netProfit / 7,
      color: netProfit >= 0 ? '#22c55e' : '#ef4444',
      source: 'shopify',
      valueSuffix: `(${margin.toFixed(1)}%)`,
      onClick: () => setShowProfitBreakdown(true),
      subValues: [
        { label: 'Revenue', value: formatCurrency(shopifyRevenue), source: 'shopify' },
        { label: 'Ad Spend', value: `-${formatCurrency(spend)}`, source: 'facebook' },
        { label: 'Txn Fees', value: `-${formatCurrency(transactionFees)}`, source: 'shopify' },
        { label: 'Refunds', value: `-${formatCurrency(refunds)}`, source: 'shopify' },
      ],
    },
    {
      title: 'Profit %',
      value: formatPercentage(margin),
      sparklineBase: Math.abs(margin),
      color: margin >= 0 ? '#22c55e' : '#ef4444',
      source: 'shopify',
      subValues: [
        { label: 'Net Profit', value: formatCurrency(netProfit), source: 'shopify' },
        { label: 'Revenue', value: formatCurrency(shopifyRevenue), source: 'shopify' },
      ],
    },
    {
      title: 'CPC',
      value: formatCurrency(cpc),
      sparklineBase: cpc,
      color: '#8b5cf6',
      invertTrend: true,
      source: 'facebook',
    },
    {
      title: 'CPM',
      value: formatCurrency(cpm),
      sparklineBase: cpm,
      color: '#ec4899',
      invertTrend: true,
      source: 'facebook',
    },
    {
      title: 'CTR',
      value: formatPercentage(ctr),
      sparklineBase: ctr,
      color: '#14b8a6',
      source: 'facebook',
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <KpiCard key={card.title} config={card} />
        ))}
      </div>

      {/* Profit Breakdown Modal */}
      {showProfitBreakdown && (
        <ProfitBreakdownModal
          revenue={shopifyRevenue}
          adSpend={spend}
          transactionFees={transactionFees}
          refunds={refunds}
          netProfit={netProfit}
          margin={margin}
          onClose={() => setShowProfitBreakdown(false)}
        />
      )}
    </>
  );
}
