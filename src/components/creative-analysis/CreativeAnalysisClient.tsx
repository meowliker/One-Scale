'use client';

import { useState, useMemo } from 'react';
import { LayoutGrid, Table2, Filter, ArrowUpDown } from 'lucide-react';
import type { Creative } from '@/types/creative';
import type { CreativeSummary } from '@/types/creative';
import { cn } from '@/lib/utils';
import { SummaryCards } from './SummaryCards';
import { FatigueIndicator } from './FatigueIndicator';
import { CreativeCardGrid } from './CreativeCardGrid';
import { CreativeTable } from './CreativeTable';
import { TopPerformersRanking } from './TopPerformersRanking';
import { CreativeTypeBreakdown } from './CreativeTypeBreakdown';
import { CreativeTrendChart } from './CreativeTrendChart';

type ViewMode = 'card' | 'table';
type TypeFilter = 'All' | 'Image' | 'Video';
type StatusFilter = 'All' | 'Active' | 'Fatigue';
type SortKey = 'roas' | 'spend' | 'ctr' | 'impressions';

interface CreativeAnalysisClientProps {
  creatives: Creative[];
  summary: CreativeSummary;
}

const sortOptions: { label: string; value: SortKey }[] = [
  { label: 'ROAS', value: 'roas' },
  { label: 'Spend', value: 'spend' },
  { label: 'CTR', value: 'ctr' },
  { label: 'Impressions', value: 'impressions' },
];

export function CreativeAnalysisClient({ creatives, summary }: CreativeAnalysisClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [sortBy, setSortBy] = useState<SortKey>('roas');

  const filteredAndSorted = useMemo(() => {
    let result = [...creatives];

    if (typeFilter !== 'All') {
      result = result.filter((c) => c.type === typeFilter);
    }

    if (statusFilter !== 'All') {
      result = result.filter((c) => c.status === statusFilter);
    }

    result.sort((a, b) => b[sortBy] - a[sortBy]);

    return result;
  }, [creatives, typeFilter, statusFilter, sortBy]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Creative Analysis</h1>
        <p className="text-sm text-gray-500">Performance breakdown by creative asset</p>
      </div>

      {/* Summary Cards */}
      <SummaryCards summary={summary} />

      {/* Fatigue Indicator */}
      <FatigueIndicator fatigued={summary.fatigued} total={summary.totalCreatives} />

      {/* Top Performers + Type Breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopPerformersRanking creatives={creatives} />
        <CreativeTypeBreakdown creatives={creatives} />
      </div>

      {/* Trend Chart */}
      <CreativeTrendChart />

      {/* Filter bar + View toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Type filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Type:</span>
            {(['All', 'Image', 'Video'] as TypeFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  typeFilter === t
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500">Status:</span>
            {(['All', 'Active', 'Fatigue'] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  statusFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => setViewMode('card')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'card'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Card View
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              viewMode === 'table'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Table2 className="h-3.5 w-3.5" />
            Table View
          </button>
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-500">
        Showing {filteredAndSorted.length} of {creatives.length} creatives
      </p>

      {/* Creative list */}
      {viewMode === 'card' ? (
        <CreativeCardGrid creatives={filteredAndSorted} />
      ) : (
        <CreativeTable creatives={filteredAndSorted} />
      )}
    </div>
  );
}
