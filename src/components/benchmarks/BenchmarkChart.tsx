'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { BenchmarkData } from '@/data/mockBenchmarks';

interface BenchmarkChartProps {
  benchmarks: BenchmarkData[];
}

export function BenchmarkChart({ benchmarks }: BenchmarkChartProps) {
  const chartData = benchmarks.map((b) => ({
    metric: b.metric,
    'Your Value': b.yourValue,
    'Industry Avg': b.industryAvg,
    'Top 25%': b.top25,
  }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">
        Performance Comparison
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} barGap={4} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="metric"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              fontSize: '12px',
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
          />
          <Bar
            dataKey="Your Value"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="Industry Avg"
            fill="#9ca3af"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="Top 25%"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
