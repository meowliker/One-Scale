'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Columns3, AlertTriangle, LayoutDashboard, Loader2 } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { ColumnPicker } from '@/components/columns/ColumnPicker';
import { cn } from '@/lib/utils';

export type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED';

export interface AdsManagerToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  campaignCount: number;
  showErrorCenter?: boolean;
  onToggleErrorCenter?: () => void;
  errorCounts?: {
    total: number;
    critical: number;
    recent12h: number;
  };
  syncStatus?: {
    core: 'idle' | 'loading' | 'done';
    actions: 'idle' | 'loading' | 'done';
    errors: 'idle' | 'loading' | 'done';
  };
  syncPercent?: number;
  attributionCoverage?: {
    percent: number;
    mapped: number;
    total: number;
    windowDays: number;
    loading?: boolean;
  };
}

const filterButtons: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Paused', value: 'PAUSED' },
];

export function AdsManagerToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  campaignCount,
  showErrorCenter = false,
  onToggleErrorCenter,
  errorCounts,
  syncStatus,
  syncPercent = 0,
  attributionCoverage,
}: AdsManagerToolbarProps) {
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const isRunning =
    syncStatus?.core === 'loading' ||
    syncStatus?.actions === 'loading' ||
    syncStatus?.errors === 'loading';
  const stageText = !syncStatus
    ? 'Idle'
    : syncStatus.core === 'loading'
    ? 'Fetching core data...'
    : syncStatus.actions === 'loading'
    ? 'Loading latest actions...'
    : syncStatus.errors === 'loading'
    ? 'Scanning recent errors...'
    : 'Up to date';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 glass-futuristic rounded-2xl px-5 py-3.5">
        <div className="flex items-center gap-4">
          <div className="w-80">
            <SearchInput
              value={search}
              onChange={onSearchChange}
              placeholder="Search campaigns..."
            />
          </div>
          <div className="flex items-center rounded-xl border border-border/50 bg-white/60 p-1 backdrop-blur-sm">
            {filterButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => onStatusFilterChange(btn.value)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  statusFilter === btn.value
                    ? 'bg-gradient-to-r from-primary to-primary-dark text-white shadow-md shadow-primary/20 rounded-lg'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/80 rounded-lg'
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-text-muted">
            {campaignCount} campaign{campaignCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {attributionCoverage && (
            <Link
              href="/dashboard/attribution"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/50 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2.5 text-xs hover:shadow-md hover:shadow-emerald-100/50 transition-all duration-300"
            >
              <span className="font-semibold text-emerald-700">
                Attribution {Math.max(0, Math.min(100, attributionCoverage.percent)).toFixed(1)}%
              </span>
              <span className="text-emerald-600/80">
                {attributionCoverage.mapped}/{attributionCoverage.total} purchases ({attributionCoverage.windowDays}d)
              </span>
              {attributionCoverage.loading && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
              )}
            </Link>
          )}
          {/* Columns Button */}
          <div className="relative">
            <button
              onClick={() => setColumnPickerOpen((prev) => !prev)}
              className={cn(
                'inline-flex items-center gap-2 border px-4 py-2 text-sm font-medium transition-all duration-200',
                columnPickerOpen
                  ? 'border-primary/30 bg-primary/5 text-primary shadow-md shadow-primary/10 rounded-xl'
                  : 'border-border/40 bg-white/70 text-text-secondary hover:bg-white hover:shadow-md rounded-xl backdrop-blur-sm'
              )}
            >
              <Columns3 className="h-4 w-4" />
              Columns
            </button>
            <ColumnPicker
              isOpen={columnPickerOpen}
              onClose={() => setColumnPickerOpen(false)}
            />
          </div>
          <button
            onClick={onToggleErrorCenter}
            className={cn(
              'inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium transition-all duration-200',
              showErrorCenter
                ? 'border-amber-300/50 bg-amber-50 text-amber-700 shadow-md shadow-amber-100/30 rounded-xl'
                : 'border-border/40 bg-white/70 text-text-secondary hover:bg-white hover:shadow-md rounded-xl backdrop-blur-sm'
            )}
          >
            {showErrorCenter ? <LayoutDashboard className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {showErrorCenter ? 'Back to Ads Manager' : 'Ads Error Center'}
            {!showErrorCenter && errorCounts && (
              <span className="ml-1 inline-flex items-center gap-1">
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                  {errorCounts.critical} critical
                </span>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                  {errorCounts.recent12h} in 12h
                </span>
                <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                  {errorCounts.total} total
                </span>
              </span>
            )}
          </button>
          <Link
            href="/dashboard/ads-manager/create"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 px-4 py-2 text-sm font-medium text-white transition-all duration-300 hover:-translate-y-0.5"
          >
            <Plus className="h-4 w-4" />
            Create Campaign
          </Link>
        </div>
      </div>

      {syncStatus && (
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5 font-medium text-text-secondary">
            {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            <span>Sync {Math.max(0, Math.min(100, Math.round(syncPercent)))}%</span>
          </span>
          <div className="h-1 w-40 overflow-hidden rounded-full bg-border/30">
            <div
              className={cn(
                'h-full rounded-full bg-gradient-to-r from-primary to-info transition-all duration-500',
                isRunning && 'animate-pulse'
              )}
              style={{ width: `${Math.max(0, Math.min(100, syncPercent))}%` }}
            />
          </div>
          <span className={cn('text-[11px]', isRunning ? 'text-primary' : 'text-text-muted')}>{stageText}</span>
        </div>
      )}
    </div>
  );
}
