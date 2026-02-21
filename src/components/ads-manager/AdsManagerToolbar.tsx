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
      <div className="flex items-center justify-between gap-4 apple-toolbar px-4 py-2.5">
        <div className="flex items-center gap-4">
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
        <div className="flex items-center gap-3">
          {attributionCoverage && (
            <Link
              href="/dashboard/attribution"
              className="inline-flex items-center gap-2 rounded-lg border border-[rgba(52,199,89,0.2)] bg-[#e8f7ed] px-3 py-1.5 text-xs transition-colors duration-150"
            >
              <span className="font-semibold text-[#1b7d36]">
                Attribution {Math.max(0, Math.min(100, attributionCoverage.percent)).toFixed(1)}%
              </span>
              <span className="text-[#34c759]">
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
          </div>
          <button
            onClick={onToggleErrorCenter}
            className={cn(
              'inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium transition-all duration-200',
              showErrorCenter
                ? 'border-[rgba(255,149,0,0.2)] bg-[#fff4e5] text-[#cc7700] rounded-lg'
                : 'border-[rgba(0,0,0,0.08)] bg-white text-[#86868b] hover:bg-[#f5f5f7] rounded-lg'
            )}
          >
            {showErrorCenter ? <LayoutDashboard className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {showErrorCenter ? 'Back to Ads Manager' : 'Ads Error Center'}
            {!showErrorCenter && errorCounts && (
              <span className="ml-1 inline-flex items-center gap-1">
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  {errorCounts.critical} critical
                </span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                  {errorCounts.recent12h} in 12h
                </span>
                <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[10px] font-semibold text-[#86868b]">
                  {errorCounts.total} total
                </span>
              </span>
            )}
          </button>
          <Link
            href="/dashboard/ads-manager/create"
            className="inline-flex items-center gap-2 bg-[#0071e3] hover:bg-[#0077ED] rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors duration-150"
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
          <div className="h-1 w-32 overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)]">
            <div
              className={cn(
                'h-full rounded-full bg-[#0071e3] transition-all duration-300',
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
