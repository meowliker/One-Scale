'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Columns3, AlertTriangle, LayoutDashboard, Loader2, Check } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { ColumnPicker } from '@/components/columns/ColumnPicker';
import { cn } from '@/lib/utils';

export type StatusFilter = 'all' | 'ACTIVE' | 'PAUSED';

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
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
  onManualSync?: () => void;
}

const filterButtons: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Paused', value: 'PAUSED' },
];

/** SVG circular progress ring for the health badge */
function HealthRing({ percent, size = 28 }: { percent: number; size?: number }) {
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  const color = percent >= 80 ? '#10b981' : percent >= 60 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-[#e5e7eb] dark:text-[#334155]"
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  );
}

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
  attributionCoverage,
  lastSyncedAt,
  onManualSync,
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

  const healthPercent = attributionCoverage
    ? Math.max(0, Math.min(100, attributionCoverage.percent))
    : null;

  return (
    <div
      className="flex w-full items-center gap-2 bg-white dark:bg-[var(--color-surface)] border border-[#e5e7eb] dark:border-[var(--color-border)] rounded-xl px-4 flex-nowrap overflow-visible"
      style={{ height: 52 }}
    >
      {/* ── Search ── */}
      <div className="w-[220px] shrink-0">
        <SearchInput
          value={search}
          onChange={onSearchChange}
          placeholder="Search campaigns..."
        />
      </div>

      {/* ── Divider ── */}
      <div className="h-6 w-px bg-[#e5e7eb] dark:bg-[var(--color-border)] shrink-0" />

      {/* ── Filter Tabs ── */}
      <div className="flex items-center rounded-lg bg-[#f5f5f7] dark:bg-[var(--color-surface-hover)] p-0.5 shrink-0">
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => onStatusFilterChange(btn.value)}
            className={cn(
              'px-3 py-1 text-[13px] font-medium rounded-md transition-all duration-200',
              statusFilter === btn.value
                ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] shadow-sm'
                : 'text-[#6e6e73] dark:text-[var(--color-text-muted)] hover:text-[#1d1d1f] dark:hover:text-[var(--color-text-primary)]'
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Campaign Count ── */}
      <span className="text-[13px] font-medium text-[#6b7280] dark:text-[var(--color-text-muted)] whitespace-nowrap shrink-0">
        {campaignCount} campaign{campaignCount !== 1 ? 's' : ''}
      </span>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Health Score Badge ── */}
      {healthPercent !== null && (
        <Link
          href="/dashboard/attribution"
          className="group/health relative flex items-center justify-center shrink-0"
          title={`Health: ${healthPercent.toFixed(1)}% — ${attributionCoverage!.mapped}/${attributionCoverage!.total} purchases`}
        >
          {/* Default: ring only */}
          <div className="relative flex items-center justify-center w-[34px] h-[34px]">
            <HealthRing percent={healthPercent} size={28} />
            <span
              className="absolute inset-0 flex items-center justify-center text-[8px] font-bold"
              style={{ color: healthPercent >= 80 ? '#10b981' : healthPercent >= 60 ? '#f59e0b' : '#ef4444' }}
            >
              {Math.round(healthPercent)}
            </span>
          </div>
          {/* Hover: expand to show text */}
          <span className="max-w-0 overflow-hidden opacity-0 group-hover/health:max-w-[80px] group-hover/health:opacity-100 group-hover/health:ml-1 text-[12px] font-semibold whitespace-nowrap transition-all duration-200"
            style={{ color: healthPercent >= 80 ? '#10b981' : healthPercent >= 60 ? '#f59e0b' : '#ef4444' }}
          >
            {healthPercent.toFixed(1)}%
          </span>
          {/* Hover tooltip */}
          <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 opacity-0 translate-y-1 group-hover/health:opacity-100 group-hover/health:translate-y-0 transition-all duration-150 ease-out">
            <div className="onescale-tooltip w-52 !rounded-xl !px-3 !py-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#86868b]">Attribution Health</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[12px]">Mapped purchases</span>
                  <span className="text-[12px] font-semibold">{attributionCoverage!.mapped}/{attributionCoverage!.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[12px]">Window</span>
                  <span className="text-[12px] font-semibold">{attributionCoverage!.windowDays}d</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[12px]">Coverage</span>
                  <span className="text-[12px] font-bold" style={{ color: healthPercent >= 80 ? '#10b981' : healthPercent >= 60 ? '#f59e0b' : '#ef4444' }}>
                    {healthPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ── Divider ── */}
      <div className="h-6 w-px bg-[#e5e7eb] dark:bg-[var(--color-border)] shrink-0" />

      {/* ── Columns Button ── */}
      <button
        onClick={() => setColumnPickerOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center gap-1.5 border px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-150 shrink-0',
          columnPickerOpen
            ? 'border-[#0071e3] bg-[#e8f0fe] text-[#0071e3]'
            : 'border-[#e5e7eb] dark:border-[var(--color-border)] bg-white dark:bg-transparent text-[#6b7280] dark:text-[var(--color-text-muted)] hover:bg-[#f9fafb] dark:hover:bg-[var(--color-surface-hover)]'
        )}
      >
        <Columns3 className="h-3.5 w-3.5" />
        Columns
      </button>
      <ColumnPicker
        isOpen={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
      />

      {/* ── Warning / Error Center ── */}
      <div className="group/err relative shrink-0">
        <button
          onClick={onToggleErrorCenter}
          className={cn(
            'relative inline-flex items-center justify-center border p-2 rounded-lg transition-all duration-150',
            showErrorCenter
              ? 'border-[rgba(255,149,0,0.3)] bg-[#fff4e5] text-[#cc7700]'
              : 'border-[#e5e7eb] dark:border-[var(--color-border)] bg-white dark:bg-transparent text-[#86868b] hover:bg-[#f9fafb] dark:hover:bg-[var(--color-surface-hover)]'
          )}
        >
          {showErrorCenter ? <LayoutDashboard className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {!showErrorCenter && errorCounts && errorCounts.recent12h > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white">
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

      {/* ── Sync Indicator ── */}
      <button
        onClick={onManualSync}
        disabled={isRunning}
        className={cn(
          'inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all duration-150 whitespace-nowrap shrink-0',
          'border-[#e5e7eb] dark:border-[var(--color-border)] bg-white dark:bg-transparent hover:bg-[#f9fafb] dark:hover:bg-[var(--color-surface-hover)]',
          isRunning && 'cursor-wait'
        )}
        title={lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString()}` : 'Sync status'}
      >
        {isRunning ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0071e3]" />
            <span className="text-[#0071e3]">Syncing<span className="animate-pulse">...</span></span>
          </>
        ) : lastSyncedAt ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[#6b7280] dark:text-[var(--color-text-muted)]">{formatTimeAgo(lastSyncedAt)}</span>
          </>
        ) : (
          <span className="text-[#6b7280] dark:text-[var(--color-text-muted)]">Not synced</span>
        )}
      </button>

      {/* ── Create Campaign ── */}
      <Link
        href="/dashboard/ads-manager/create"
        className="inline-flex items-center gap-1.5 bg-[#0071e3] hover:bg-[#005bb5] rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-colors duration-150 whitespace-nowrap shrink-0"
      >
        <Plus className="h-4 w-4" />
        Create Campaign
      </Link>
    </div>
  );
}
