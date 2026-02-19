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

interface PnLWaterfallChartProps {
  entry: PnLEntry;
  isDigital?: boolean;
}

interface WaterfallItem {
  name: string;
  value: number;
  fill: string;
  // For waterfall: invisible base + visible bar
  base: number;
  bar: number;
}

export function PnLWaterfallChart({ entry, isDigital = false }: PnLWaterfallChartProps) {
  // Build waterfall data: each cost "reduces" the running total from revenue
  let running = entry.revenue;

  const items: WaterfallItem[] = [
    {
      name: 'Revenue',
      value: entry.revenue,
      fill: '#10b981',
      base: 0,
      bar: entry.revenue,
    },
  ];

  // Helper to add a cost item — base is where the visible bar STARTS (after deduction)
  // and bar is the height. Stacked: invisible base + visible bar = top of cost bar = running before deduction
  const addCost = (name: string, amount: number) => {
    if (amount <= 0) return; // Skip zero-cost items
    items.push({
      name,
      value: -amount,
      fill: '#ef4444',
      base: running - amount, // Bar starts at reduced level
      bar: amount,            // Bar height = cost amount (extends up to previous running)
    });
    running = running - amount;
  };

  if (!isDigital) {
    addCost('COGS', entry.cogs);
  }
  addCost('Ad Spend', entry.adSpend);
  if (!isDigital) {
    addCost('Shipping', entry.shipping);
  }
  addCost(isDigital ? 'Txn Fees' : 'Fees', entry.fees);
  addCost('Refunds', entry.refunds);

  // Net profit bar starts from 0
  const netProfit = running; // Should equal entry.netProfit
  items.push({
    name: 'Net Profit',
    value: netProfit,
    fill: netProfit >= 0 ? '#10b981' : '#ef4444',
    base: netProfit >= 0 ? 0 : netProfit,
    bar: Math.abs(netProfit),
  });

  // Calculate proper Y-axis domain to ensure all bars are proportional
  const maxValue = entry.revenue;

  const CustomTooltipContent = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: WaterfallItem }> }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0].payload;
    const isRevOrProfit = item.name === 'Revenue' || item.name === 'Net Profit';
    return (
      <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 shadow-md">
        <p className="text-sm font-medium text-text-primary">{item.name}</p>
        <p className={`text-sm font-semibold ${isRevOrProfit && item.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {formatCurrency(item.value)}
        </p>
        {!isRevOrProfit && (
          <p className="text-xs text-text-muted">
            {((Math.abs(item.value) / entry.revenue) * 100).toFixed(1)}% of revenue
          </p>
        )}
      </div>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const index = Number(props.index ?? 0);
    const item = items[index];
    if (!item) return null;

    // Position label above the visible top of the bar
    const labelY = item.name === 'Revenue' || item.name === 'Net Profit'
      ? y - 8
      : y - 8; // For cost bars, y is already the top of the visible bar

    return (
      <text
        x={x + width / 2}
        y={labelY}
        textAnchor="middle"
        className="text-xs"
        fill="#94a3b8"
        fontSize={11}
        fontWeight={item.name === 'Revenue' || item.name === 'Net Profit' ? 600 : 400}
      >
        {formatCurrency(item.value)}
      </text>
    );
  };

  // Connector lines between bars
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ConnectorLines = ({ formattedGraphicalItems }: any) => {
    if (!formattedGraphicalItems?.[1]?.props?.data) return null;
    const barData = formattedGraphicalItems[1].props.data;
    const lines: React.ReactElement[] = [];

    for (let i = 0; i < barData.length - 1; i++) {
      const curr = barData[i];
      const next = barData[i + 1];
      if (!curr || !next) continue;

      // The bottom of a cost bar = the running total after deduction
      // For revenue bar: bottom of next bar connection is at running - cost
      const currBottomY = items[i].name === 'Revenue' || items[i].name === 'Net Profit'
        ? curr.y
        : curr.y + curr.height; // Bottom of cost bar = reduced running
      const currRight = curr.x + curr.width;
      const nextLeft = next.x;

      // Only connect if there's meaningful visual connection
      if (items[i + 1].name === 'Net Profit') continue; // No connector before Net Profit

      lines.push(
        <line
          key={`connector-${i}`}
          x1={currRight}
          y1={items[i].name === 'Revenue' ? curr.y : curr.y}
          x2={nextLeft}
          y2={items[i].name === 'Revenue' ? curr.y : curr.y}
          stroke="#282d42"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      );
    }
    return <g>{lines}</g>;
  };

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Profit Waterfall</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={items} margin={{ top: 24, right: 16, left: 16, bottom: 8 }}>
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
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
            domain={[0, maxValue * 1.15]}
          />
          <Tooltip content={<CustomTooltipContent />} />
          {/* Invisible base bar */}
          <Bar dataKey="base" stackId="waterfall" fill="transparent" isAnimationActive={false} />
          {/* Visible bar on top */}
          <Bar
            dataKey="bar"
            stackId="waterfall"
            radius={[4, 4, 0, 0]}
            label={renderLabel}
          >
            {items.map((item, idx) => (
              <Cell key={idx} fill={item.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
