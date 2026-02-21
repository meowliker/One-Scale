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

interface PnLWaterfallChartProps {
  entry: PnLEntry;
  isDigital?: boolean;
}

interface WaterfallItem {
  name: string;
  rawValue: number;   // The actual dollar value (positive or negative)
  spacer: number;     // Invisible base — positions the colored bar at the right height
  bar: number;        // Height of the visible colored bar (always positive)
  isPositive: boolean;
  isTotal: boolean;
}

function buildWaterfallData(entry: PnLEntry, isDigital: boolean): WaterfallItem[] {
  const items: WaterfallItem[] = [];
  let running = 0;

  // Helper: add a positive (income) step
  const addPositive = (name: string, amount: number) => {
    const start = running;
    running += amount;
    items.push({
      name,
      rawValue: amount,
      spacer: start,       // bar starts at previous running total
      bar: amount,         // bar height = the income amount
      isPositive: true,
      isTotal: false,
    });
  };

  // Helper: add a negative (cost) step
  const addCost = (name: string, amount: number) => {
    if (amount <= 0) return;
    const start = running;
    running -= amount;
    const end = running;
    items.push({
      name,
      rawValue: -amount,
      spacer: end,         // bar starts at end (lower bound), extends up to start
      bar: amount,         // bar height = cost magnitude
      isPositive: false,
      isTotal: false,
    });
  };

  // Build waterfall steps
  addPositive('Revenue', entry.revenue);

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

  // Net Profit total bar — always starts from 0 (or the negative value if below zero)
  const netProfit = entry.netProfit;
  items.push({
    name: 'Net Profit',
    rawValue: netProfit,
    spacer: Math.min(0, netProfit),   // if negative, spacer goes down from 0
    bar: Math.abs(netProfit),
    isPositive: netProfit >= 0,
    isTotal: true,
  });

  return items;
}

const CustomTooltipContent = ({
  active,
  payload,
  entry,
}: {
  active?: boolean;
  payload?: Array<{ payload: WaterfallItem }>;
  entry: PnLEntry;
}) => {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  const isRevOrProfit = item.name === 'Revenue' || item.name === 'Net Profit';
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 shadow-md">
      <p className="text-sm font-medium text-text-primary">{item.name}</p>
      <p
        className={`text-sm font-semibold ${
          item.isPositive ? 'text-emerald-600' : 'text-red-600'
        }`}
      >
        {item.rawValue >= 0 ? '' : '-'}
        {formatCurrency(Math.abs(item.rawValue))}
      </p>
      {!isRevOrProfit && entry.revenue > 0 && (
        <p className="text-xs text-text-muted">
          {((Math.abs(item.rawValue) / entry.revenue) * 100).toFixed(1)}% of revenue
        </p>
      )}
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const renderLabel = (items: WaterfallItem[]) => (props: any) => {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const index = Number(props.index ?? 0);
  const item = items[index];
  if (!item) return null;

  const labelY = y - 8;
  const prefix = item.rawValue >= 0 ? '' : '-';
  const display = `${prefix}${formatCurrency(Math.abs(item.rawValue))}`;

  return (
    <text
      x={x + width / 2}
      y={labelY}
      textAnchor="middle"
      fill="#94a3b8"
      fontSize={11}
      fontWeight={item.isTotal ? 600 : 400}
    >
      {display}
    </text>
  );
};

export function PnLWaterfallChart({ entry, isDigital = false }: PnLWaterfallChartProps) {
  const items = buildWaterfallData(entry, isDigital);

  // Compute Y-axis domain covering all bar tops and bottoms with padding
  const allBoundaries = items.flatMap((d) => [d.spacer, d.spacer + d.bar]);
  const minVal = Math.min(...allBoundaries, 0);
  const maxVal = Math.max(...allBoundaries, 0);
  const range = maxVal - minVal || 100;
  const padding = range * 0.18;
  const yDomain: [number, number] = [minVal - padding, maxVal + padding];

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Profit Waterfall</h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={items} margin={{ top: 28, right: 16, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e2235" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => {
              const abs = Math.abs(v);
              const sign = v < 0 ? '-' : '';
              if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
              return `${sign}$${abs.toFixed(0)}`;
            }}
            domain={yDomain}
          />
          <Tooltip
            content={(props) => (
              <CustomTooltipContent
                active={props.active}
                payload={props.payload as Array<{ payload: WaterfallItem }>}
                entry={entry}
              />
            )}
          />

          {/* Reference line at zero so the chart axis is always visible */}
          <ReferenceLine y={0} stroke="#2d3254" strokeWidth={1.5} />

          {/* Invisible spacer — positions each colored bar at the correct waterfall height */}
          <Bar dataKey="spacer" stackId="waterfall" fill="transparent" isAnimationActive={false} />

          {/* Visible colored bar with value labels */}
          <Bar
            dataKey="bar"
            stackId="waterfall"
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            label={renderLabel(items)}
          >
            {items.map((item, idx) => (
              <Cell
                key={idx}
                fill={
                  item.isTotal
                    ? '#6366f1'
                    : item.isPositive
                    ? '#10b981'
                    : '#ef4444'
                }
                fillOpacity={item.isTotal ? 0.85 : 1}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
