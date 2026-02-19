'use client';

import { Trophy, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { TestVariant } from '@/types/creativeSchedule';

interface TestResultCardProps {
  variants: TestVariant[];
}

export function TestResultCard({ variants }: TestResultCardProps) {
  const winner = variants.find((v) => v.isWinner);
  const losers = variants.filter((v) => !v.isWinner);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* Winner card */}
      {winner && (
        <div className="rounded-lg border-2 border-green-400 bg-green-50/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-5 w-5 text-green-600" />
            <span className="text-sm font-semibold text-green-700">Winner</span>
          </div>
          <h4 className="text-sm font-medium text-gray-900 truncate">{winner.name}</h4>
          <span className="text-xs text-gray-500 capitalize">{winner.creativeType}</span>
          <div className="mt-3 space-y-2">
            <MetricRow label="Spend" value={formatCurrency(winner.spend)} />
            <MetricRow label="Revenue" value={formatCurrency(winner.revenue)} />
            <MetricRow label="ROAS" value={`${winner.roas.toFixed(2)}x`} highlight />
            <MetricRow label="CPA" value={formatCurrency(winner.cpa)} />
            <MetricRow label="CTR" value={`${winner.ctr.toFixed(2)}%`} />
            <MetricRow label="Conversions" value={winner.conversions.toString()} />
          </div>
        </div>
      )}

      {/* Loser cards */}
      {losers.map((variant) => (
        <div key={variant.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 opacity-75">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-semibold text-gray-500">
              {winner ? 'Challenger' : 'Variant'}
            </span>
          </div>
          <h4 className="text-sm font-medium text-gray-700 truncate">{variant.name}</h4>
          <span className="text-xs text-gray-400 capitalize">{variant.creativeType}</span>
          <div className="mt-3 space-y-2">
            <MetricRow label="Spend" value={formatCurrency(variant.spend)} dimmed />
            <MetricRow label="Revenue" value={formatCurrency(variant.revenue)} dimmed />
            <MetricRow label="ROAS" value={`${variant.roas.toFixed(2)}x`} dimmed />
            <MetricRow label="CPA" value={formatCurrency(variant.cpa)} dimmed />
            <MetricRow label="CTR" value={`${variant.ctr.toFixed(2)}%`} dimmed />
            <MetricRow label="Conversions" value={variant.conversions.toString()} dimmed />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricRow({
  label,
  value,
  highlight,
  dimmed,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  dimmed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className={cn('text-gray-500', dimmed && 'text-gray-400')}>{label}</span>
      <span
        className={cn(
          'font-medium',
          highlight ? 'text-green-700' : dimmed ? 'text-gray-500' : 'text-gray-900'
        )}
      >
        {value}
      </span>
    </div>
  );
}
