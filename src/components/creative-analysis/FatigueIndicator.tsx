'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FatigueIndicatorProps {
  fatigued: number;
  total: number;
}

export function FatigueIndicator({ fatigued, total }: FatigueIndicatorProps) {
  const ratio = total > 0 ? fatigued / total : 0;
  const percentage = Math.round(ratio * 100);
  const showWarning = ratio > 0.3;

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {showWarning && (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
          <span className="text-sm font-medium text-gray-700">
            {fatigued} of {total} creatives showing fatigue
          </span>
        </div>
        <span
          className={cn(
            'text-sm font-semibold',
            showWarning ? 'text-red-600' : 'text-green-600'
          )}
        >
          {percentage}%
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className="flex h-full">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${100 - percentage}%` }}
          />
          <div
            className="h-full bg-red-500 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
