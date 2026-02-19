'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';

const mockBidData = Array.from({ length: 14 }, (_, i) => {
  const day = i + 1;
  const manualBaseline = 1.20;
  // AI bid fluctuates around and above manual baseline
  const aiBid = +(manualBaseline + Math.sin(i * 0.5) * 0.15 + i * 0.02 + (Math.random() * 0.1 - 0.05)).toFixed(2);
  return {
    day: `Day ${day}`,
    aiBid,
    manualBaseline,
  };
});

interface BidOptimizationChartProps {
  className?: string;
}

export function BidOptimizationChart({ className }: BidOptimizationChartProps) {
  return (
    <div className={className}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        Bid Optimization (14 days)
      </h4>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={mockBidData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              domain={['dataMin - 0.1', 'dataMax + 0.1']}
              tickFormatter={(val: number) => `$${val.toFixed(2)}`}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(value?: number, name?: string) => {
                const v = value ?? 0;
                return [
                  `$${v.toFixed(2)}`,
                  name === 'aiBid' ? 'AI Bid' : 'Manual Baseline',
                ];
              }}
            />
            <Area
              type="monotone"
              dataKey="aiBid"
              stroke="#3b82f6"
              fill="#dbeafe"
              fillOpacity={0.4}
              strokeWidth={2}
              name="aiBid"
            />
            <Line
              type="monotone"
              dataKey="manualBaseline"
              stroke="#9ca3af"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={false}
              name="manualBaseline"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
