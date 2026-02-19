'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BenchmarkData } from '@/data/mockBenchmarks';

function formatValue(value: number, format: BenchmarkData['format']): string {
  switch (format) {
    case 'currency':
      return `$${value.toFixed(2)}`;
    case 'percentage':
      return `${value.toFixed(2)}%`;
    case 'roas':
      return `${value.toFixed(2)}x`;
    case 'number':
      return value.toFixed(1);
  }
}

function isLowerBetter(metric: string): boolean {
  return ['CPA', 'CPM', 'CPC', 'Frequency'].includes(metric);
}

interface BenchmarkCardProps {
  data: BenchmarkData;
}

export function BenchmarkCard({ data }: BenchmarkCardProps) {
  const lowerBetter = isLowerBetter(data.metric);
  const isAboveAvg = lowerBetter
    ? data.yourValue < data.industryAvg
    : data.yourValue > data.industryAvg;

  const diffPct = ((data.yourValue - data.industryAvg) / data.industryAvg) * 100;
  const absDiff = Math.abs(diffPct);

  // Calculate position on the bar (0 to 100)
  const minVal = Math.min(data.yourValue, data.industryAvg, data.top25) * 0.7;
  const maxVal = Math.max(data.yourValue, data.industryAvg, data.top25) * 1.3;
  const range = maxVal - minVal;
  const yourPos = range > 0 ? ((data.yourValue - minVal) / range) * 100 : 50;
  const avgPos = range > 0 ? ((data.industryAvg - minVal) / range) * 100 : 50;
  const topPos = range > 0 ? ((data.top25 - minVal) / range) * 100 : 50;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500">{data.metric}</h3>
        <div
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            isAboveAvg
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          )}
        >
          {isAboveAvg ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {absDiff.toFixed(1)}% {isAboveAvg ? 'better' : 'worse'}
        </div>
      </div>

      <p className="mb-4 text-2xl font-bold text-gray-900">
        {formatValue(data.yourValue, data.format)}
      </p>

      <div className="mb-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Industry Avg</span>
          <span className="font-medium text-gray-700">
            {formatValue(data.industryAvg, data.format)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Top 25%</span>
          <span className="font-medium text-gray-700">
            {formatValue(data.top25, data.format)}
          </span>
        </div>
      </div>

      {/* Position bar */}
      <div className="relative mt-4 h-2 rounded-full bg-gray-100">
        {/* Industry Avg marker */}
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-gray-400"
          style={{ left: `${Math.min(Math.max(avgPos, 2), 98)}%` }}
          title="Industry Avg"
        />
        {/* Top 25% marker */}
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-blue-400"
          style={{ left: `${Math.min(Math.max(topPos, 2), 98)}%` }}
          title="Top 25%"
        />
        {/* Your value dot */}
        <div
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow',
            isAboveAvg ? 'bg-green-500' : 'bg-red-500'
          )}
          style={{ left: `${Math.min(Math.max(yourPos, 2), 98)}%` }}
          title="Your Value"
        />
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  );
}
