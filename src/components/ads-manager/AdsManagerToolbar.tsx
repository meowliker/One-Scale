'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Columns3, AlertTriangle, LayoutDashboard, Loader2, Target } from 'lucide-react';
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
    <div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between apple-toolbar px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          <div className="w-full md:w-64">
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
                    ? 'bg-white text-[#1d1d1f] shadow-sm rounded-md'
                    : 'text-[#86868b] hover:text-[#1d1d1f] rounded-md'
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
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {/* Attribution coverage - desktop only */}
          {attributionCoverage && (
            <Link
              href="/dashboard/attribution"
              title={`Attribution: ${attributionCoverage.mapped}/${attributionCoverage.total} purchases (${attributionCoverage.windowDays}d)`}
              className="relative hidden md:inline-flex items-center gap-1 rounded-lg border border-[rgba(52,199,89,0.2)] bg-[#e8f7ed] px-2 py-1.5 transition-colors duration-150 hover:bg-[#d4f0de]"
            >
              <Target className="h-4 w-4 text-[#1b7d36]" />
              <span className="text-[11px] font-semibold text-[#1b7d36]">
                {Math.max(0, Math.min(100, attributionCoverage.percent)).toFixed(1)}%
              </span>
              {attributionCoverage.loading && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              )}
            </Link>
          )}
          {/* Columns Button - desktop only (no table on mobile) */}
          <div className="relative hidden md:block">
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
              <span>Columns</span>
            </button>
            <ColumnPicker
              isOpen={columnPickerOpen}
              onClose={() => setColumnPickerOpen(false)}
            />
          </div>
          {/* Error center toggle */}
          <div className="group/err relative">
            <button
              onClick={onToggleErrorCenter}
              className={cn(
                'relative inline-flex items-center justify-center border p-2 transition-all duration-200 rounded-lg min-h-[44px] min-w-[44px]',
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
            {/* Hover tooltip - desktop only */}
            {!showErrorCenter && errorCounts && (
              <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden md:block
                opacity-0 translate-y-1 group-hover/err:opacity-100 group-hover/err:translate-y-0
                transition-all duration-150 ease-out">
                <div className="w-48 rounded-xl bg-[#1d1d1f] px-3 py-2.5 shadow-xl">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#86868b]">Last 12 hours</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-white">Issues</span>
                    <span className="text-[13px] font-semibold text-blue-400">{errorCounts.recent12h}</span>
                  </div>
                  {errorCounts.critical > 0 && (
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[12px] text-white">Critical</span>
                      <span className="text-[13px] font-semibold text-red-400">{errorCounts.critical}</span>
                    </div>
                  )}
                  <p className="mt-2 text-[10px] text-[#86868b]">Click to open Error Center</p>
                </div>
              </div>
            )}
          </div>
          {/* Sync status - desktop only */}
          {syncStatus && (
            <div className="hidden md:flex items-center gap-2 border-l border-[rgba(0,0,0,0.08)] pl-3">
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
          {/* Create button - icon only on mobile, full on desktop */}
          <Link
            href="/dashboard/ads-manager/create"
            className="inline-flex items-center gap-2 bg-[#0071e3] hover:bg-[#0077ED] rounded-lg px-3 py-2 md:px-4 text-sm font-medium text-white transition-colors duration-150 min-h-[44px]"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">Create Campaign</span>
          </Link>
        </div>
    </div>
  );
}
