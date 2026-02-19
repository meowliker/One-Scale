'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TrendPoint {
  date: string;
  [key: string]: string | number;
}

const CREATIVE_NAMES = [
  'Morning Routine - Influencer Collab',
  'Summer Glow - UGC Testimonial',
  'Limited Edition Launch - Story Ad',
];

const LINE_COLORS = ['#6366f1', '#f59e0b', '#10b981'];

function generateTrendData(): TrendPoint[] {
  const baseRoas = [5.2, 4.71, 4.1];
  const data: TrendPoint[] = [];
  const baseDate = new Date('2026-01-29');

  // Use a seeded random-like approach for consistency per render
  let seed = 42;
  function pseudoRandom() {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  for (let i = 0; i < 14; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const dateStr = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;

    const point: TrendPoint = { date: dateStr };
    CREATIVE_NAMES.forEach((name, idx) => {
      const variance = (pseudoRandom() - 0.5) * 1.4;
      point[name] = parseFloat((baseRoas[idx] + variance).toFixed(2));
    });
    data.push(point);
  }

  return data;
}

export function CreativeTrendChart() {
  const data = useMemo(() => generateTrendData(), []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Creative Performance Trends</h3>
        <p className="text-xs text-gray-500">ROAS over the last 14 days for top 3 creatives</p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(v: number) => `${v.toFixed(1)}x`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number | undefined) => {
                if (value === undefined) return '';
                return `${value.toFixed(2)}x`;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            />
            {CREATIVE_NAMES.map((name, idx) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={LINE_COLORS[idx]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
