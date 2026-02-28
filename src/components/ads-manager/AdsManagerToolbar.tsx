'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Columns3, AlertTriangle, LayoutDashboard, Loader2, Target } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { ColumnPicker } from '@/components/columns/ColumnPicker';
import { cn } from '@/lib/utils';

export type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED';

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'Synced just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Synced ${min}m ago`;
  const hr = Math.floor(min / 60);
  return `Synced ${hr}h ago`;
}

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
  lastSyncedAt?: string | null;
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
  lastSyncedAt,
}: AdsManagerToolbarProps) {
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  // Re-render "X min ago" every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);
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
    <div className="flex w-full items-center justify-between gap-3 apple-toolbar px-4 py-2.5 flex-nowrap overflow-visible">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-64">
            <SearchInput
              value={search}
              onChange={onSearchChange}
              placeholder="Search campaigns..."
            />
          </div>
          <div className="flex items-center rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#f5f5f7] p-0.5">
            {filterButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => onStatusFilterChange(btn.value)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  statusFilter === btn.value
                    ? 'bg-[#1d1d1f] text-white shadow-sm rounded-md'
                    : 'text-[#6e6e73] hover:text-[#1d1d1f] rounded-md'
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
        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          {attributionCoverage && (
            <Link
              href="/dashboard/attribution"
              title={`Attribution: ${attributionCoverage.mapped}/${attributionCoverage.total} purchases (${attributionCoverage.windowDays}d)`}
              className="group/attr relative inline-flex items-center justify-center rounded-full border-2 border-emerald-500 bg-transparent w-8 h-8 hover:w-auto hover:h-auto hover:rounded-lg hover:border hover:border-[rgba(52,199,89,0.2)] hover:bg-[#f0fdf4] hover:px-2 hover:py-1.5 transition-all duration-200"
            >
              <Target className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="max-w-0 overflow-hidden opacity-0 group-hover/attr:max-w-[80px] group-hover/attr:opacity-100 group-hover/attr:ml-1 text-[11px] font-semibold text-[#1b7d36] transition-all duration-200 whitespace-nowrap">
                {Math.max(0, Math.min(100, attributionCoverage.percent)).toFixed(1)}%
              </span>
              {attributionCoverage.loading && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              )}
            </Link>
          )}
          {/* Columns Button */}
          <button
            onClick={() => setColumnPickerOpen((prev) => !prev)}
            className={cn(
              'inline-flex items-center gap-2 border px-4 py-2 text-sm font-medium transition-all duration-200',
              columnPickerOpen
                ? 'border-[#0071e3] bg-[#e8f0fe] text-[#0071e3] rounded-lg'
                : 'border-[rgba(0,0,0,0.08)] bg-white text-[#86868b] hover:bg-[#f5f5f7] rounded-lg'
            )}
          >
            <Columns3 className="h-4 w-4" />
            Columns
          </button>
          <ColumnPicker
            isOpen={columnPickerOpen}
            onClose={() => setColumnPickerOpen(false)}
          />
          <div className="group/err relative">
            <button
              onClick={onToggleErrorCenter}
              className={cn(
                'relative inline-flex items-center justify-center border p-2 transition-all duration-200 rounded-lg',
                showErrorCenter
                  ? 'border-[rgba(255,149,0,0.2)] bg-[#fff4e5] text-[#cc7700]'
                  : 'border-[rgba(0,0,0,0.08)] bg-white text-[#86868b] hover:bg-[#f5f5f7]'
              )}
            >
              {showErrorCenter ? <LayoutDashboard className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {!showErrorCenter && errorCounts && errorCounts.recent12h > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">
                  {errorCounts.recent12h}
                </span>
              )}
            </button>
            {/* Hover tooltip */}
            {!showErrorCenter && errorCounts && (
              <div className="pointer-events-none absolute right-0 top-full z-50 mt-2
                opacity-0 translate-y-1 group-hover/err:opacity-100 group-hover/err:translate-y-0
                transition-all duration-150 ease-out">
                <div className="onescale-tooltip w-48 !rounded-xl !px-3 !py-2.5">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#86868b]">Last 12 hours</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px]">Issues</span>
                    <span className="text-[13px] font-semibold text-blue-500">{errorCounts.recent12h}</span>
                  </div>
                  {errorCounts.critical > 0 && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[12px]">Critical</span>
                      <span className="text-[13px] font-semibold text-red-500">{errorCounts.critical}</span>
                    </div>
                  )}
                  <p className="mt-2 text-[10px] text-[#86868b]">Click to open Error Center</p>
                </div>
              </div>
            )}
          </div>
          {syncStatus && (
            <div className="flex items-center gap-2 border-l border-[rgba(0,0,0,0.08)] pl-3">
              {isRunning && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              <span className="text-[11px] font-medium text-text-secondary">
                Sync {Math.max(0, Math.min(100, Math.round(syncPercent)))}%
              </span>
              <div className="h-1 w-16 overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)]">
                <div
                  className={cn(
                    'h-full rounded-full bg-[#0071e3] transition-all duration-300',
                    isRunning && 'animate-pulse'
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, syncPercent))}%` }}
                />
              </div>
            </div>
          )}
          {lastSyncedAt && !isRunning && (
            <span className="text-[11px] text-text-dimmed whitespace-nowrap" title={new Date(lastSyncedAt).toLocaleString()}>
              {formatTimeAgo(lastSyncedAt)}
            </span>
          )}
          <Link
            href="/dashboard/ads-manager/create"
            className="inline-flex items-center gap-2 bg-[#0071e3] hover:bg-[#0077ED] rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors duration-150 border-0 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Create Campaign
          </Link>
        </div>
    </div>
  );
}
