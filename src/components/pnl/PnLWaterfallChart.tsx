'use client';

import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import {
  BarChart,
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
  value: number;       // Actual signed dollar value (for labels/tooltip)
  base: number;        // Invisible spacer (Y start position)
  bar: number;         // Visible bar height (positive = up, negative = down)
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
  // Positive → bar goes UP from 0; Negative → bar goes DOWN from 0
  const np = entry.netProfit;
  items.push({
    name: 'Net Profit',
    value: np,
    base: 0,
    bar: np,
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
    <div className="onescale-tooltip">
      <p className="text-[13px] font-semibold">{item.name}</p>
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
    const height = Number(props.height ?? 0);
    const index = Number(props.index ?? 0);
    const item = items[index];
    if (!item || item.value === 0) return null;

    // For negative bars, label goes below; for positive, above
    const labelY = item.bar < 0 ? y + height + 14 : y - 8;

    return (
      <text
        x={x + width / 2}
        y={labelY}
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

  // Y domain: compute from all bar endpoints
  const allEnds = items.flatMap((d) => [d.base, d.base + d.bar]);
  const maxY = Math.max(...allEnds, 0);
  const minY = Math.min(...allEnds, 0);
  const yDomain: [number, number] = [
    minY < 0 ? minY * 1.15 : 0,
    maxY * 1.15,
  ];

  return (
    <div className="w-full" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={items} margin={{ top: 32, right: 16, left: 16, bottom: 8 }}>
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
            isAnimationActive={false}
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
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
