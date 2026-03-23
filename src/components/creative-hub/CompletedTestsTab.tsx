'use client';

import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Trophy, DollarSign, BarChart3 } from 'lucide-react';
import { cn, formatCurrency, formatPercentage } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { CompletedTestCard } from '@/components/creative-hub/CompletedTestCard';
import type { CreativeTest } from '@/types/creativeHub';

interface CompletedTestsTabProps {
  storeId: string;
}

type DateFilter = '7' | '30' | '90' | 'all';
type SortOption = 'recent' | 'best_roas';

export function CompletedTestsTab({ storeId }: CompletedTestsTabProps) {
  const { completedTests, profiles, fetchCompletedTests } = useCreativeHubStore();
  const [productFilter, setProductFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('recent');

  useEffect(() => {
    if (!storeId) return;
    fetchCompletedTests(storeId);
  }, [storeId, fetchCompletedTests]);

  const filtered = useMemo(() => {
    let result = [...completedTests];

    // Product filter
    if (productFilter !== 'all') {
      result = result.filter((t) => t.productProfileId === productFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const days = parseInt(dateFilter, 10);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      result = result.filter(
        (t) => t.completedAt && new Date(t.completedAt) >= cutoff
      );
    }

    // Sort
    if (sortBy === 'recent') {
      result.sort(
        (a, b) =>
          new Date(b.completedAt ?? b.launchedAt).getTime() -
          new Date(a.completedAt ?? a.launchedAt).getTime()
      );
    } else {
      result.sort((a, b) => {
        const bestA = Math.max(...a.items.map((i) => i.roas), 0);
        const bestB = Math.max(...b.items.map((i) => i.roas), 0);
        return bestB - bestA;
      });
    }

    return result;
  }, [completedTests, productFilter, dateFilter, sortBy]);

  // Summary stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const withWinners = filtered.filter((t) =>
      t.items.some((i) => i.testStatus === 'winner')
    ).length;
    const winRate = total > 0 ? (withWinners / total) * 100 : 0;
    const avgSpend =
      total > 0
        ? filtered.reduce((sum, t) => sum + t.totalSpend, 0) / total
        : 0;
    return { total, winRate, avgSpend };
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={<FlaskConical className="h-4 w-4 text-blue-500" />}
          label="Total Tests"
          value={String(stats.total)}
        />
        <StatCard
          icon={<Trophy className="h-4 w-4 text-emerald-500" />}
          label="Win Rate"
          value={formatPercentage(stats.winRate)}
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4 text-amber-500" />}
          label="Avg Test Spend"
          value={formatCurrency(stats.avgSpend)}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Product dropdown */}
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="all">All Products</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.productName}
            </option>
          ))}
        </select>

        {/* Date range */}
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="all">All Time</option>
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="recent">Most Recent</option>
          <option value="best_roas">Best ROAS</option>
        </select>
      </div>

      {/* Test list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center">
          <BarChart3 className="mx-auto h-12 w-12 text-text-dimmed" />
          <p className="mt-4 text-sm text-text-secondary">No completed tests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((test) => (
            <CompletedTestCard key={test.id} test={test} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-text-secondary mb-1">
        {icon}
        {label}
      </div>
      <p className="text-lg font-semibold text-text-primary">{value}</p>
    </div>
  );
}
