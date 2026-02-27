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
  ReferenceLine,
} from 'recharts';

/* ================================================================
   PnL Waterfall Chart — complete rewrite
   Uses stacked bar pattern: invisible base (spacer) + visible bar.
   Revenue starts at 0 → goes up (green).
   Each cost starts at the running total → drops down (red).
   Net Profit always starts from 0 → goes up/down (green/red).
   ================================================================ */

interface PnLWaterfallChartProps {
  entry: PnLEntry;
  isDigital?: boolean;
}

interface WaterfallItem {
  name: string;
  value: number;       // Actual signed dollar value
  spacer: number;      // Invisible base positioning the bar
  bar: number;         // Visible bar height (always >= 0)
  isPositive: boolean;
  isTotal: boolean;
}

function buildWaterfallData(entry: PnLEntry, isDigital: boolean): WaterfallItem[] {
  const items: WaterfallItem[] = [];
  let running = 0;

  // Income step: bar grows UP from current running total
  const addIncome = (name: string, amount: number) => {
    const base = running;
    running += amount;
    items.push({
      name,
      value: amount,
      spacer: base,
      bar: amount,
      isPositive: true,
      isTotal: false,
    });
  };

  // Cost step: bar drops DOWN from current running total
  const addCost = (name: string, amount: number) => {
    if (amount <= 0) return;
    running -= amount;
    items.push({
      name,
      value: -amount,
      spacer: running,     // bar bottom = new running total
      bar: amount,         // bar height = cost
      isPositive: false,
      isTotal: false,
    });
  };

  // --- Build waterfall steps ---
  addIncome('Revenue', entry.revenue);

  if (!isDigital) {
    addCost('COGS', entry.cogs);
  }

  addCost('Ad Spend', entry.adSpend);

  if (!isDigital) {
    addCost('Shipping', entry.shipping);
  }

  addCost(isDigital ? 'Txn Fees' : 'Fees', entry.fees);

  if (entry.refunds > 0) {
    addCost('Refunds', entry.refunds);
  }

  // Net Profit: always anchored at 0
  const netProfit = entry.netProfit;
  items.push({
    name: 'Net Profit',
    value: netProfit,
    spacer: netProfit >= 0 ? 0 : netProfit,
    bar: Math.abs(netProfit),
    isPositive: netProfit >= 0,
    isTotal: true,
  });

  return items;
}

// --- Tooltip ---
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

// --- Value labels above/below bars ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderBarLabel(items: WaterfallItem[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (props: any) => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const index = Number(props.index ?? 0);
    const item = items[index];
    if (!item) return null;

    const label = `${item.value < 0 ? '-' : ''}${formatCurrency(Math.abs(item.value))}`;

    return (
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fill={item.isTotal ? '#1d1d1f' : '#6e6e73'}
        fontSize={11}
        fontWeight={item.isTotal ? 700 : 500}
      >
        {label}
      </text>
    );
  };
}

export function PnLWaterfallChart({ entry, isDigital = false }: PnLWaterfallChartProps) {
  const items = buildWaterfallData(entry, isDigital);

  // Y-axis domain: cover all bar edges with 18% padding
  const edges = items.flatMap((d) => [d.spacer, d.spacer + d.bar]);
  const minY = Math.min(...edges, 0);
  const maxY = Math.max(...edges, 0);
  const span = maxY - minY || 100;
  const pad = span * 0.18;
  const yDomain: [number, number] = [minY - pad, maxY + pad];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={items} margin={{ top: 28, right: 16, left: 16, bottom: 8 }}>
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
            tickFormatter={(v: number) => {
              const abs = Math.abs(v);
              const sign = v < 0 ? '-' : '';
              if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
              return `${sign}$${abs.toFixed(0)}`;
            }}
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

          {/* Zero reference line */}
          <ReferenceLine y={0} stroke="rgba(0,0,0,0.10)" strokeWidth={1} />

          {/* Invisible spacer — stacked below the visible bar */}
          <Bar
            dataKey="spacer"
            stackId="waterfall"
            fill="transparent"
            isAnimationActive={false}
          />

          {/* Visible colored bar — grows on mount */}
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
