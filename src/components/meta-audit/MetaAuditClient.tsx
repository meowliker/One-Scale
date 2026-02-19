'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Shield,
  LayoutDashboard,
  Target,
  Gavel,
  Globe,
  Image,
  Type,
  RefreshCw,
} from 'lucide-react';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { MetaDashboardTab } from './MetaDashboardTab';
import { TargetingInsightsTab } from './TargetingInsightsTab';
import { AuctionInsightsTab } from './AuctionInsightsTab';
import { GeoDemoInsightsTab } from './GeoDemoInsightsTab';
import { CreativeInsightsTab } from './CreativeInsightsTab';
import { AdCopyInsightsTab } from './AdCopyInsightsTab';
import type {
  AuditOverviewResult,
  TargetingInsightsResult,
  AuctionInsightsResult,
  GeoDemoInsightsResult,
  CreativeInsightsResult,
  AdCopyInsightsResult,
  AuditFilterPreset,
} from '@/services/metaAudit';
import type { DateRange } from '@/types/analytics';

// ── Tab Configuration ────────────────────────────────────────────────

const tabs = [
  { key: 'dashboard', label: 'Meta Dashboard', icon: LayoutDashboard },
  { key: 'targeting', label: 'Targeting Insights', icon: Target },
  { key: 'auction', label: 'Auction Insights', icon: Gavel },
  { key: 'geo', label: 'Geo & Demo Insights', icon: Globe },
  { key: 'creative', label: 'Creative Insights', icon: Image },
  { key: 'adcopy', label: 'Ad Copy Insights', icon: Type },
] as const;

type TabKey = (typeof tabs)[number]['key'];

// ── Props ───────────────────────────────────────────────────────────

interface MetaAuditClientProps {
  overview: AuditOverviewResult | null;
  targeting: TargetingInsightsResult | null;
  auction: AuctionInsightsResult | null;
  geoDemo: GeoDemoInsightsResult | null;
  creative: CreativeInsightsResult | null;
  adCopy: AdCopyInsightsResult | null;
  adCopyLoading?: boolean;
  dateRange: DateRange;
  filterPreset: AuditFilterPreset;
  onDateRangeChange: (range: DateRange) => void;
  onFilterPresetChange: (preset: AuditFilterPreset) => void;
  onTabChange?: (tab: TabKey) => void;
  onBackgroundRefresh: () => void;
  refreshRunning: boolean;
  refreshProgress: number;
  refreshStage: string;
  lastUpdatedAt: string | null;
  sections: Array<{
    key: 'overview' | 'targeting' | 'auction' | 'geoDemo' | 'creative' | 'adCopy';
    label: string;
    status: 'pending' | 'loading' | 'done' | 'error';
    startedAt?: number;
    endedAt?: number;
  }>;
  etaSeconds: number;
}

// ── Main Component ──────────────────────────────────────────────────

export function MetaAuditClient({
  overview,
  targeting,
  auction,
  geoDemo,
  creative,
  adCopy,
  adCopyLoading = false,
  dateRange,
  filterPreset,
  onDateRangeChange,
  onFilterPresetChange,
  onTabChange,
  onBackgroundRefresh,
  refreshRunning,
  refreshProgress,
  refreshStage,
  lastUpdatedAt,
  sections,
  etaSeconds,
}: MetaAuditClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const sectionStatusByKey = new Map(sections.map((s) => [s.key, s.status]));

  const renderSectionLoading = (label: string) => (
    <div className="rounded-xl border border-border bg-surface-elevated p-8 text-center">
      <p className="text-sm text-text-secondary">Loading {label}...</p>
    </div>
  );

  const renderSectionError = (label: string) => (
    <div className="rounded-xl border border-danger/30 bg-danger/10 p-8 text-center">
      <p className="text-sm text-danger">{label} failed to load for this refresh.</p>
      <p className="mt-1 text-xs text-text-secondary">Use Refresh in Background to retry. Previous cached data is preserved when available.</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-12">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">360&deg; Meta Audit</h1>
            <p className="text-sm text-text-secondary">
              Full breakdown of your Meta Ads account structure and performance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Date selector */}
          <DateRangePicker dateRange={dateRange} onRangeChange={onDateRangeChange} />

          {/* Filter presets */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {([
              { key: 'all' as const, label: 'All Campaigns' },
              { key: 'active' as const, label: 'Active Only' },
              { key: 'spending' as const, label: 'Spending' },
            ]).map((p) => (
              <button
                key={p.key}
                onClick={() => onFilterPresetChange(p.key)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  filterPreset === p.key
                    ? 'bg-primary text-white'
                    : 'bg-surface-elevated text-text-secondary hover:bg-surface-hover'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={onBackgroundRefresh}
            disabled={refreshRunning}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
              refreshRunning
                ? 'border-border bg-surface-hover text-text-muted cursor-not-allowed'
                : 'border-primary/40 bg-primary/10 text-primary-light hover:bg-primary/20'
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshRunning && 'animate-spin')} />
            {refreshRunning ? 'Refreshing...' : 'Refresh in Background'}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2">
        <div className="text-xs text-text-secondary">
          {lastUpdatedAt
            ? `Last updated: ${new Date(lastUpdatedAt).toLocaleString()}`
            : 'No cached snapshot yet'}
        </div>
        <div className="flex items-center gap-3">
          {refreshRunning && (
            <>
              <div className="w-40 h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, refreshProgress))}%` }}
                />
              </div>
              <div className="text-xs text-text-muted min-w-[120px] text-right">
                {refreshStage} ({refreshProgress}%)
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-elevated p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-primary">Audit Job Progress</h3>
          <div className="text-xs text-text-muted">
            {refreshRunning ? `ETA ~${etaSeconds}s` : 'Idle'}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {sections.map((section) => {
            const isDone = section.status === 'done';
            const isLoading = section.status === 'loading';
            const isError = section.status === 'error';
            const tone = isDone
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : isLoading
              ? 'border-blue-500/30 bg-blue-500/10 text-blue-300'
              : isError
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-border bg-surface-hover text-text-secondary';
            const elapsedDone = section.startedAt && section.endedAt
              ? Math.max(1, Math.round((section.endedAt - section.startedAt) / 1000))
              : null;
            return (
              <div key={section.key} className={cn('rounded-md border px-3 py-2 text-xs', tone)}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{section.label}</span>
                  <span className="uppercase tracking-wide">{section.status}</span>
                </div>
                <div className="mt-1 opacity-80">
                  {isDone && elapsedDone !== null && `Done in ${elapsedDone}s`}
                  {isLoading && `Loading (~${etaSeconds}s ETA)`}
                  {section.status === 'pending' && 'Queued'}
                  {isError && 'Failed'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tab Navigation (Horizontal Pills) ───────────── */}
      <div className="border-b border-border overflow-x-auto scrollbar-hide">
        <nav className="flex gap-1 min-w-max px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  onTabChange?.(tab.key);
                }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all whitespace-nowrap',
                  isActive
                    ? 'border-primary text-primary-light'
                    : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border-light'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Tab Content ─────────────────────────────────── */}
      <div className="animate-fade-in">
        {activeTab === 'dashboard' && (overview
          ? <MetaDashboardTab data={overview} filterPreset={filterPreset} />
          : sectionStatusByKey.get('overview') === 'error'
          ? renderSectionError('Meta Dashboard')
          : renderSectionLoading('Meta Dashboard'))}
        {activeTab === 'targeting' && (targeting
          ? <TargetingInsightsTab data={targeting} filterPreset={filterPreset} />
          : sectionStatusByKey.get('targeting') === 'error'
          ? renderSectionError('Targeting Insights')
          : renderSectionLoading('Targeting Insights'))}
        {activeTab === 'auction' && (auction
          ? <AuctionInsightsTab data={auction} filterPreset={filterPreset} />
          : sectionStatusByKey.get('auction') === 'error'
          ? renderSectionError('Auction Insights')
          : renderSectionLoading('Auction Insights'))}
        {activeTab === 'geo' && (geoDemo
          ? <GeoDemoInsightsTab data={geoDemo} filterPreset={filterPreset} />
          : sectionStatusByKey.get('geoDemo') === 'error'
          ? renderSectionError('Geo & Demo Insights')
          : renderSectionLoading('Geo & Demo Insights'))}
        {activeTab === 'creative' && (creative
          ? <CreativeInsightsTab data={creative} filterPreset={filterPreset} />
          : sectionStatusByKey.get('creative') === 'error'
          ? renderSectionError('Creative Insights')
          : renderSectionLoading('Creative Insights'))}
        {activeTab === 'adcopy' && <AdCopyInsightsTab data={adCopy} filterPreset={filterPreset} loading={adCopyLoading} />}
      </div>
    </div>
  );
}
