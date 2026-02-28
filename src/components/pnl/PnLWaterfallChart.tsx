'use client';

import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';

/* ================================================================
   PnL Waterfall Chart
   Uses stacked bar pattern: invisible base + visible bar.
   Revenue starts at 0 → goes up (green).
   Each cost starts at the running total → drops down (red).
   Net Profit always starts from 0 → goes up/down (green/red).
   Y domain anchored at 0 so bars never float.
   ================================================================ */

interface PnLWaterfallChartProps {
  entry: PnLEntry;
  isDigital?: boolean;
}

interface WaterfallItem {
  name: string;
  value: number;       // Actual signed dollar value
  base: number;        // Invisible spacer (Y position of bar bottom)
  bar: number;         // Visible bar height (always >= 0)
  isPositive: boolean;
  isTotal: boolean;
}

function buildWaterfallData(entry: PnLEntry, isDigital: boolean): WaterfallItem[] {
  const items: WaterfallItem[] = [];
  let running = 0;

  // Income: bar grows UP from current running total
  const addIncome = (name: string, amount: number) => {
    const b = running;
    running += amount;
    items.push({ name, value: amount, base: b, bar: amount, isPositive: true, isTotal: false });
  };

  // Cost: bar drops DOWN from current running total
  const addCost = (name: string, amount: number) => {
    if (amount <= 0) return;
    running -= amount;
    items.push({ name, value: -amount, base: running, bar: amount, isPositive: false, isTotal: false });
  };

  addIncome('Revenue', entry.revenue);
  if (!isDigital) addCost('COGS', entry.cogs);
  addCost('Ad Spend', entry.adSpend);
  if (!isDigital) addCost('Shipping', entry.shipping);
  addCost(isDigital ? 'Txn Fees' : 'Fees', entry.fees);
  if (entry.refunds > 0) addCost('Refunds', entry.refunds);

  // Net Profit: always anchored at 0
  const np = entry.netProfit;
  items.push({
    name: 'Net Profit',
    value: np,
    base: np >= 0 ? 0 : np,
    bar: Math.abs(np),
    isPositive: np >= 0,
    isTotal: true,
  });

  return items;
}

// Compact currency: $1.2k, $12.5k, $1.2M
function formatCompact(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

// Tooltip
function WaterfallTooltip({
  active,
  payload,
  entry,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: unknown[];
  entry: PnLEntry;
}) {
  if (!active || !payload || !payload.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = (payload[0] as any)?.payload as WaterfallItem | undefined;
  if (!item) return null;

  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 shadow-lg">
      <p className="text-[13px] font-semibold text-[#1d1d1f]">{item.name}</p>
      <p className={`text-[13px] font-bold ${item.isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
        {item.value >= 0 ? '' : '-'}
        {formatCurrency(Math.abs(item.value))}
      </p>
      {item.name !== 'Revenue' && item.name !== 'Net Profit' && entry.revenue > 0 && (
        <p className="text-[11px] text-[#86868b]">
          {((Math.abs(item.value) / entry.revenue) * 100).toFixed(1)}% of revenue
        </p>
      )}
    </div>
  );
}

// Value labels above bars — bold, compact format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderBarLabel(items: WaterfallItem[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (props: any) => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const index = Number(props.index ?? 0);
    const item = items[index];
    if (!item || item.bar === 0) return null;

    return (
      <text
        x={x + width / 2}
        y={y - 8}
        textAnchor="middle"
        fill={item.isPositive ? '#059669' : '#dc2626'}
        fontSize={12}
        fontWeight={700}
      >
        {formatCompact(item.value)}
      </text>
    );
  };
}

export function PnLWaterfallChart({ entry, isDigital = false }: PnLWaterfallChartProps) {
  const items = buildWaterfallData(entry, isDigital);

  // Y domain: [0, max * 1.15] — only go negative if net profit is negative
  const tops = items.map((d) => d.base + d.bar);
  const bases = items.map((d) => d.base);
  const maxY = Math.max(...tops, 0);
  const minY = Math.min(...bases, 0);
  const yDomain: [number, number] = [
    minY < 0 ? minY * 1.15 : 0,
    maxY * 1.15,
  ];

  return (
    <div className="w-full" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={items} margin={{ top: 32, right: 16, left: 16, bottom: 8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(0,0,0,0.06)"
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#86868b' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#86868b' }}
            axisLine={false}
            tickLine={false}
            width={55}
            tickFormatter={formatCompact}
            domain={yDomain}
          />
          <Tooltip
            cursor={false}
            content={(props) => (
              <WaterfallTooltip
                active={props.active}
                payload={props.payload as unknown[]}
                entry={entry}
              />
            )}
          />

          {/* Invisible base — positions the visible bar */}
          <Bar
            dataKey="base"
            stackId="waterfall"
            fill="transparent"
            isAnimationActive={false}
          />

          {/* Visible colored bar */}
          <Bar
            dataKey="bar"
            stackId="waterfall"
            radius={[4, 4, 0, 0]}
            isAnimationActive={true}
            animationDuration={600}
            animationBegin={100}
            label={renderBarLabel(items)}
          >
            {items.map((item, idx) => (
              <Cell
                key={idx}
                fill={item.isPositive ? '#10b981' : '#ef4444'}
                opacity={item.isTotal ? 1 : 0.85}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
