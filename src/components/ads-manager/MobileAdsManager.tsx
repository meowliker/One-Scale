'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  Image as ImageIcon,
  Eye,
  Loader2,
  AlertCircle,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RotateCcw,
} from 'lucide-react';
import type { Campaign, AdSet, Ad, EntityStatus } from '@/types/campaign';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import type { MetricKey } from '@/types/metrics';
import { cn } from '@/lib/utils';
import { formatMetric, getMetricValue } from '@/lib/metrics';
import { Toggle } from '@/components/ui/Toggle';
import { Checkbox } from '@/components/ui/Checkbox';
import { InlineEdit } from '@/components/ui/InlineEdit';

// ---------- Types ----------

type MobileLevel = 'campaigns' | 'adsets' | 'ads';

interface DrilldownState {
  level: MobileLevel;
  campaignId?: string;
  campaignName?: string;
  adSetId?: string;
  adSetName?: string;
}

export interface MobileAdsManagerProps {
  campaigns: Campaign[];
  selectedIds: Set<string>;
  expandedCampaigns: Set<string>;
  sparklineData: Record<string, SparklineDataPoint[]>;
  loadingAdSets: Set<string>;
  loadingAds: Set<string>;
  errorAdSets: Set<string>;
  errorAds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleExpandCampaign: (id: string) => void;
  onToggleExpandAdSet: (id: string) => void;
  onCampaignStatusChange: (id: string, status: EntityStatus) => void;
  onAdSetStatusChange: (id: string, status: EntityStatus) => void;
  onAdStatusChange: (id: string, status: EntityStatus) => void;
  onCampaignBudgetChange: (id: string, budget: number) => void;
  onAdSetBudgetChange: (id: string, budget: number) => void;
  onRetryAdSets: (campaignId: string) => void;
  onRetryAds: (adSetId: string) => void;
}

// ---------- Orientation hook ----------

function useOrientation() {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    setIsLandscape(mq.matches && window.innerWidth < 1024);

    function handler(e: MediaQueryListEvent) {
      setIsLandscape(e.matches && window.innerWidth < 1024);
    }
    mq.addEventListener('change', handler);

    // Also listen for resize to catch cases where matchMedia doesn't fire
    function resizeHandler() {
      setIsLandscape(mq.matches && window.innerWidth < 1024);
    }
    window.addEventListener('resize', resizeHandler);

    return () => {
      mq.removeEventListener('change', handler);
      window.removeEventListener('resize', resizeHandler);
    };
  }, []);

  return isLandscape;
}

// ---------- Landscape table metrics ----------

const LANDSCAPE_METRICS: { key: MetricKey; label: string; short: string }[] = [
  { key: 'spend', label: 'Spend', short: 'Spend' },
  { key: 'revenue', label: 'Revenue', short: 'Rev' },
  { key: 'roas', label: 'ROAS', short: 'ROAS' },
  { key: 'cpa', label: 'CPA', short: 'CPA' },
  { key: 'impressions', label: 'Impressions', short: 'Impr' },
  { key: 'clicks', label: 'Clicks', short: 'Clicks' },
  { key: 'ctr', label: 'CTR', short: 'CTR' },
  { key: 'conversions', label: 'Conversions', short: 'Conv' },
  { key: 'cpc', label: 'CPC', short: 'CPC' },
  { key: 'cpm', label: 'CPM', short: 'CPM' },
];

// ---------- Metric color helper ----------

function metricColor(key: MetricKey, value: number): string {
  if (key === 'roas' || key === 'appPixelRoas') {
    if (value === 0) return 'text-[#aeaeb2]';
    if (value < 1.0) return 'text-red-500';
    if (value < 1.3) return 'text-amber-500';
    return 'text-emerald-600';
  }
  return 'text-[#1d1d1f]';
}

// ---------- Main component ----------

export function MobileAdsManager({
  campaigns,
  selectedIds,
  sparklineData,
  loadingAdSets,
  loadingAds,
  errorAdSets,
  errorAds,
  onToggleSelection,
  onToggleExpandCampaign,
  onToggleExpandAdSet,
  onCampaignStatusChange,
  onAdSetStatusChange,
  onAdStatusChange,
  onCampaignBudgetChange,
  onAdSetBudgetChange,
  onRetryAdSets,
  onRetryAds,
}: MobileAdsManagerProps) {
  const isLandscape = useOrientation();
  const [drilldown, setDrilldown] = useState<DrilldownState>({ level: 'campaigns' });
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Resizable name column for landscape table
  const TOGGLE_COL_W = 32; // compact on/off column
  const [nameColWidth, setNameColWidth] = useState(120);
  const nameResizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleNameResizeStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    nameResizeRef.current = { startX: clientX, startW: nameColWidth };

    function onMove(ev: TouchEvent | MouseEvent) {
      ev.preventDefault(); // prevent scroll while dragging
      if (!nameResizeRef.current) return;
      const cx = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      const delta = cx - nameResizeRef.current.startX;
      setNameColWidth(Math.max(80, Math.min(300, nameResizeRef.current.startW + delta)));
    }
    function onEnd() {
      nameResizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [nameColWidth]);

  // Resolve current data for the active drill level
  const currentCampaign = useMemo(() => {
    if (!drilldown.campaignId) return null;
    return campaigns.find((c) => c.id === drilldown.campaignId) ?? null;
  }, [campaigns, drilldown.campaignId]);

  const currentAdSets = useMemo(() => {
    return currentCampaign?.adSets ?? [];
  }, [currentCampaign]);

  const currentAdSet = useMemo(() => {
    if (!drilldown.adSetId) return null;
    return currentAdSets.find((as) => as.id === drilldown.adSetId) ?? null;
  }, [currentAdSets, drilldown.adSetId]);

  const currentAds = useMemo(() => {
    return currentAdSet?.ads ?? [];
  }, [currentAdSet]);

  // Sort handler
  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }, [sortKey]);

  // Generic sorter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortEntities = useCallback(<T extends Record<string, any>>(items: T[]): T[] => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      if (sortKey === 'name') {
        aVal = a.name as string;
        bVal = b.name as string;
      } else if (sortKey === 'status') {
        aVal = a.status as string;
        bVal = b.status as string;
      } else if (sortKey === 'budget') {
        aVal = (a.dailyBudget as number) ?? 0;
        bVal = (b.dailyBudget as number) ?? 0;
      } else {
        aVal = getMetricValue(a.metrics as Record<string, number>, sortKey as MetricKey);
        bVal = getMetricValue(b.metrics as Record<string, number>, sortKey as MetricKey);
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [sortKey, sortDir]);

  // Navigation
  const drillIntoCampaign = useCallback((campaign: Campaign) => {
    // Trigger lazy-load of adsets
    onToggleExpandCampaign(campaign.id);
    setDrilldown({
      level: 'adsets',
      campaignId: campaign.id,
      campaignName: campaign.name,
    });
    setSortKey(null);
  }, [onToggleExpandCampaign]);

  const drillIntoAdSet = useCallback((adSet: AdSet, campaignId: string, campaignName: string) => {
    // Trigger lazy-load of ads
    onToggleExpandAdSet(adSet.id);
    setDrilldown({
      level: 'ads',
      campaignId,
      campaignName,
      adSetId: adSet.id,
      adSetName: adSet.name,
    });
    setSortKey(null);
  }, [onToggleExpandAdSet]);

  const goBack = useCallback(() => {
    if (drilldown.level === 'ads') {
      setDrilldown({
        level: 'adsets',
        campaignId: drilldown.campaignId,
        campaignName: drilldown.campaignName,
      });
    } else {
      setDrilldown({ level: 'campaigns' });
    }
    setSortKey(null);
  }, [drilldown]);

  const goHome = useCallback(() => {
    setDrilldown({ level: 'campaigns' });
    setSortKey(null);
  }, []);

  // ---------- Landscape table renderer ----------

  const renderLandscapeTable = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let items: any[];
    let levelLabel: string;

    if (drilldown.level === 'campaigns') {
      items = sortEntities(campaigns);
      levelLabel = 'Campaigns';
    } else if (drilldown.level === 'adsets') {
      items = sortEntities(currentAdSets);
      levelLabel = 'Ad Sets';
    } else {
      items = sortEntities(currentAds);
      levelLabel = 'Ads';
    }

    return (
      <div className="flex flex-col h-full">
        {/* Breadcrumb bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#f5f5f7] border-b border-[rgba(0,0,0,0.06)] flex-shrink-0">
          {drilldown.level !== 'campaigns' && (
            <button onClick={goBack} className="flex items-center gap-1 text-[#0071e3] text-xs font-medium">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
          <div className="flex items-center gap-1 text-[11px] text-[#86868b] overflow-hidden">
            <button onClick={goHome} className="text-[#0071e3] font-medium flex-shrink-0">Campaigns</button>
            {drilldown.campaignName && (
              <>
                <ChevronRight className="h-3 w-3 flex-shrink-0" />
                <button
                  onClick={() => setDrilldown({ level: 'adsets', campaignId: drilldown.campaignId, campaignName: drilldown.campaignName })}
                  className={cn(drilldown.level === 'ads' ? 'text-[#0071e3] font-medium' : 'text-[#1d1d1f] font-semibold', 'truncate max-w-[120px]')}
                >
                  {drilldown.campaignName}
                </button>
              </>
            )}
            {drilldown.adSetName && (
              <>
                <ChevronRight className="h-3 w-3 flex-shrink-0" />
                <span className="text-[#1d1d1f] font-semibold truncate max-w-[120px]">{drilldown.adSetName}</span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            <RotateCcw className="h-3 w-3 text-[#86868b]" />
            <span className="text-[10px] text-[#86868b]">Landscape</span>
          </div>
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full min-w-[700px] text-[11px]">
            <thead className="sticky top-0 z-10" style={{ overflow: 'visible' }}>
              <tr className="bg-[#f5f5f7]" style={{ overflow: 'visible' }}>
                <th
                  className="sticky left-0 z-20 bg-[#f5f5f7] whitespace-nowrap px-1 py-1.5 text-center font-semibold text-[#86868b]"
                  style={{ width: TOGGLE_COL_W, minWidth: TOGGLE_COL_W, maxWidth: TOGGLE_COL_W }}
                >
                  <span className="text-[9px]">On</span>
                </th>
                <th
                  className="relative sticky z-20 bg-[#f5f5f7] whitespace-nowrap px-2 py-1.5 text-left font-semibold text-[#86868b] border-r border-[rgba(0,0,0,0.06)] overflow-visible"
                  style={{ left: TOGGLE_COL_W, width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth }}
                >
                  <button onClick={() => handleSort('name')} className="flex items-center gap-1">
                    Name
                    <SortIcon active={sortKey === 'name'} dir={sortKey === 'name' ? sortDir : null} />
                  </button>
                  {/* Drag handle to resize — large 44px touch target */}
                  <div
                    onMouseDown={handleNameResizeStart}
                    onTouchStart={handleNameResizeStart}
                    className="absolute -right-[22px] top-0 h-full w-[44px] cursor-col-resize flex items-center justify-center z-30 select-none"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="flex flex-col items-center gap-[2px] rounded-md bg-[#e0e0e5] px-[3px] py-1">
                      <div className="w-[3px] h-[3px] rounded-full bg-[#86868b]" />
                      <div className="w-[3px] h-[3px] rounded-full bg-[#86868b]" />
                      <div className="w-[3px] h-[3px] rounded-full bg-[#86868b]" />
                    </div>
                  </div>
                </th>
                <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-[#86868b]">Status</th>
                {LANDSCAPE_METRICS.map((m) => (
                  <th key={m.key} className="whitespace-nowrap px-2 py-1.5 text-right font-semibold text-[#86868b]">
                    <button onClick={() => handleSort(m.key)} className="flex items-center gap-1 ml-auto">
                      {m.short}
                      <SortIcon active={sortKey === m.key} dir={sortKey === m.key ? sortDir : null} />
                    </button>
                  </th>
                ))}
                {drilldown.level !== 'ads' && (
                  <th className="whitespace-nowrap px-2 py-1.5 text-center font-semibold text-[#86868b]" />
                )}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={LANDSCAPE_METRICS.length + 4} className="px-4 py-8 text-center text-[#aeaeb2]">
                    No {levelLabel.toLowerCase()} found.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isActive = item.status === 'ACTIVE';
                  const metrics = item.metrics as Record<string, number>;
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-[rgba(0,0,0,0.04)] bg-white hover:bg-[#f9f9fb] transition-colors"
                    >
                      <td
                        className="sticky left-0 z-10 bg-white px-1 py-1.5"
                        style={{ width: TOGGLE_COL_W, minWidth: TOGGLE_COL_W, maxWidth: TOGGLE_COL_W }}
                      >
                        <Toggle
                          checked={isActive}
                          onChange={(checked) => {
                            const status = checked ? 'ACTIVE' : 'PAUSED';
                            if (drilldown.level === 'campaigns') onCampaignStatusChange(item.id, status);
                            else if (drilldown.level === 'adsets') onAdSetStatusChange(item.id, status);
                            else onAdStatusChange(item.id, status);
                          }}
                          size="sm"
                        />
                      </td>
                      <td
                        className="sticky z-10 bg-white px-2 py-1.5 border-r border-[rgba(0,0,0,0.04)]"
                        style={{ left: TOGGLE_COL_W, width: nameColWidth, minWidth: nameColWidth, maxWidth: nameColWidth }}
                      >
                        <span className="text-[12px] font-medium text-[#1d1d1f] truncate block" style={{ maxWidth: nameColWidth - 16 }}>
                          {item.name}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-semibold',
                          isActive ? 'text-emerald-600' : 'text-[#86868b]'
                        )}>
                          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                          {item.status}
                        </span>
                      </td>
                      {LANDSCAPE_METRICS.map((m) => (
                        <td key={m.key} className={cn(
                          'whitespace-nowrap px-2 py-1.5 text-right tabular-nums font-medium',
                          metricColor(m.key, getMetricValue(metrics, m.key))
                        )}>
                          {formatMetric(m.key, getMetricValue(metrics, m.key))}
                        </td>
                      ))}
                      {drilldown.level !== 'ads' && (
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => {
                              if (drilldown.level === 'campaigns') drillIntoCampaign(item as Campaign);
                              else drillIntoAdSet(item as AdSet, drilldown.campaignId!, drilldown.campaignName!);
                            }}
                            className="text-[#0071e3]"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ---------- Portrait card renderer ----------

  const renderPortraitView = () => {
    if (drilldown.level === 'campaigns') {
      const sorted = sortEntities(campaigns);
      return (
        <div className="space-y-2.5">
          {/* Level header */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[13px] font-bold text-[#1d1d1f]">
              {sorted.length} Campaign{sorted.length !== 1 ? 's' : ''}
            </h3>
            <SortButton sortKey={sortKey} onSort={handleSort} />
          </div>

          {sorted.length === 0 ? (
            <EmptyState label="campaigns" />
          ) : (
            sorted.map((campaign) => (
              <MobileCampaignCard
                key={campaign.id}
                campaign={campaign}
                isSelected={selectedIds.has(campaign.id)}
                onToggleSelect={() => onToggleSelection(campaign.id)}
                onStatusChange={(status) => onCampaignStatusChange(campaign.id, status)}
                onBudgetChange={(budget) => onCampaignBudgetChange(campaign.id, budget)}
                onDrillDown={() => drillIntoCampaign(campaign)}
              />
            ))
          )}
        </div>
      );
    }

    if (drilldown.level === 'adsets') {
      const isLoading = drilldown.campaignId ? loadingAdSets.has(drilldown.campaignId) : false;
      const hasError = drilldown.campaignId ? errorAdSets.has(drilldown.campaignId) : false;
      const sorted = sortEntities(currentAdSets);
      const isCBO = currentCampaign ? (currentCampaign.dailyBudget > 0 || (currentCampaign.lifetimeBudget != null && currentCampaign.lifetimeBudget > 0)) : false;

      return (
        <div className="space-y-2.5">
          {/* Breadcrumb */}
          <Breadcrumb drilldown={drilldown} goBack={goBack} goHome={goHome} />

          {/* Campaign summary bar */}
          {currentCampaign && <CampaignSummaryBar campaign={currentCampaign} />}

          {/* Level header */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[13px] font-bold text-[#1d1d1f]">
              {sorted.length} Ad Set{sorted.length !== 1 ? 's' : ''}
            </h3>
            <SortButton sortKey={sortKey} onSort={handleSort} />
          </div>

          {isLoading && <LoadingState label="ad sets" />}
          {!isLoading && hasError && (
            <ErrorState label="ad sets" onRetry={() => drilldown.campaignId && onRetryAdSets(drilldown.campaignId)} />
          )}
          {!isLoading && !hasError && sorted.length === 0 && <EmptyState label="ad sets" />}
          {!isLoading && !hasError && sorted.map((adSet) => (
            <MobileAdSetCard
              key={adSet.id}
              adSet={adSet}
              isCBO={isCBO}
              isSelected={selectedIds.has(adSet.id)}
              onToggleSelect={() => onToggleSelection(adSet.id)}
              onStatusChange={(status) => onAdSetStatusChange(adSet.id, status)}
              onBudgetChange={(budget) => onAdSetBudgetChange(adSet.id, budget)}
              onDrillDown={() => drillIntoAdSet(adSet, drilldown.campaignId!, drilldown.campaignName!)}
            />
          ))}
        </div>
      );
    }

    // Ads level
    const isLoading = drilldown.adSetId ? loadingAds.has(drilldown.adSetId) : false;
    const hasError = drilldown.adSetId ? errorAds.has(drilldown.adSetId) : false;
    const sorted = sortEntities(currentAds);

    return (
      <div className="space-y-2.5">
        {/* Breadcrumb */}
        <Breadcrumb drilldown={drilldown} goBack={goBack} goHome={goHome} />

        {/* Ad Set summary bar */}
        {currentAdSet && <AdSetSummaryBar adSet={currentAdSet} />}

        {/* Level header */}
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[13px] font-bold text-[#1d1d1f]">
            {sorted.length} Ad{sorted.length !== 1 ? 's' : ''}
          </h3>
          <SortButton sortKey={sortKey} onSort={handleSort} />
        </div>

        {isLoading && <LoadingState label="ads" />}
        {!isLoading && hasError && (
          <ErrorState label="ads" onRetry={() => drilldown.adSetId && onRetryAds(drilldown.adSetId)} />
        )}
        {!isLoading && !hasError && sorted.length === 0 && <EmptyState label="ads" />}
        {!isLoading && !hasError && sorted.map((ad) => (
          <MobileAdCard
            key={ad.id}
            ad={ad}
            isSelected={selectedIds.has(ad.id)}
            onToggleSelect={() => onToggleSelection(ad.id)}
            onStatusChange={(status) => onAdStatusChange(ad.id, status)}
          />
        ))}
      </div>
    );
  };

  // Landscape = horizontal scrollable table, Portrait = drill-down cards
  if (isLandscape) {
    return (
      <div className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
        {renderLandscapeTable()}
      </div>
    );
  }

  return renderPortraitView();
}

// ---------- Sub-components ----------

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' | null }) {
  if (!active) return <ArrowUpDown className="h-2.5 w-2.5 text-[#aeaeb2]" />;
  return dir === 'asc'
    ? <ArrowUp className="h-2.5 w-2.5 text-[#0071e3]" />
    : <ArrowDown className="h-2.5 w-2.5 text-[#0071e3]" />;
}

function SortButton({ sortKey, onSort }: { sortKey: string | null; onSort: (key: string) => void }) {
  const options: { key: string; label: string }[] = [
    { key: 'spend', label: 'Spend' },
    { key: 'roas', label: 'ROAS' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'cpa', label: 'CPA' },
    { key: 'name', label: 'Name' },
  ];
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-lg bg-[#f5f5f7] px-2.5 py-1.5 text-[11px] font-medium text-[#86868b] active:bg-[#e8e8ed] transition-colors"
      >
        <ArrowUpDown className="h-3 w-3" />
        {sortKey ? options.find((o) => o.key === sortKey)?.label || 'Sort' : 'Sort'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-36 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-lg overflow-hidden">
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => { onSort(o.key); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-[12px] font-medium transition-colors',
                  sortKey === o.key ? 'text-[#0071e3] bg-[#f0f6ff]' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Breadcrumb({ drilldown, goBack, goHome }: { drilldown: DrilldownState; goBack: () => void; goHome: () => void }) {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <button onClick={goBack} className="flex items-center gap-0.5 text-[#0071e3] text-[12px] font-medium active:opacity-70">
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      <div className="h-3 w-px bg-[rgba(0,0,0,0.1)]" />
      <div className="flex items-center gap-1 text-[11px] text-[#86868b] overflow-hidden min-w-0">
        <button onClick={goHome} className="text-[#0071e3] font-medium flex-shrink-0">Campaigns</button>
        {drilldown.campaignName && (
          <>
            <ChevronRight className="h-3 w-3 flex-shrink-0 text-[#aeaeb2]" />
            <span className={cn(
              drilldown.level === 'ads' ? 'text-[#0071e3] font-medium' : 'text-[#1d1d1f] font-semibold',
              'truncate max-w-[140px]'
            )}>
              {drilldown.campaignName}
            </span>
          </>
        )}
        {drilldown.adSetName && (
          <>
            <ChevronRight className="h-3 w-3 flex-shrink-0 text-[#aeaeb2]" />
            <span className="text-[#1d1d1f] font-semibold truncate max-w-[120px]">{drilldown.adSetName}</span>
          </>
        )}
      </div>
    </div>
  );
}

function CampaignSummaryBar({ campaign }: { campaign: Campaign }) {
  const m = campaign.metrics;
  return (
    <div className="rounded-lg bg-[#f0f6ff] border border-[#0071e3]/10 px-3 py-2">
      <p className="text-[11px] font-semibold text-[#0071e3] truncate">{campaign.name}</p>
      <div className="flex items-center gap-4 mt-1">
        <MiniMetric label="Spend" value={`$${m.spend.toFixed(0)}`} />
        <MiniMetric label="Rev" value={`$${m.revenue.toFixed(0)}`} color="text-emerald-600" />
        <MiniMetric label="ROAS" value={`${m.roas.toFixed(2)}x`} color={m.roas >= 1.3 ? 'text-emerald-600' : m.roas >= 1 ? 'text-amber-500' : 'text-red-500'} />
        <MiniMetric label="Conv" value={`${m.conversions}`} />
      </div>
    </div>
  );
}

function AdSetSummaryBar({ adSet }: { adSet: AdSet }) {
  const m = adSet.metrics;
  return (
    <div className="rounded-lg bg-[#f5f0ff] border border-purple-500/10 px-3 py-2">
      <p className="text-[11px] font-semibold text-purple-600 truncate">{adSet.name}</p>
      <div className="flex items-center gap-4 mt-1">
        <MiniMetric label="Spend" value={`$${m.spend.toFixed(0)}`} />
        <MiniMetric label="Rev" value={`$${m.revenue.toFixed(0)}`} color="text-emerald-600" />
        <MiniMetric label="ROAS" value={`${m.roas.toFixed(2)}x`} color={m.roas >= 1.3 ? 'text-emerald-600' : m.roas >= 1 ? 'text-amber-500' : 'text-red-500'} />
        <MiniMetric label="CPA" value={`$${m.cpa.toFixed(2)}`} />
      </div>
    </div>
  );
}

function MiniMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase text-[#86868b]">{label}</p>
      <p className={cn('text-[12px] font-bold tabular-nums', color || 'text-[#1d1d1f]')}>{value}</p>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="rounded-xl bg-white border border-[rgba(0,0,0,0.06)] p-8 flex items-center justify-center gap-2 text-sm text-[#aeaeb2]">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading {label}...
    </div>
  );
}

function ErrorState({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl bg-white border border-[rgba(0,0,0,0.06)] p-6 flex flex-col items-center gap-3">
      <AlertCircle className="h-5 w-5 text-amber-500" />
      <p className="text-sm text-[#86868b]">Could not load {label}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-lg bg-[#0071e3]/10 px-3 py-1.5 text-[12px] font-medium text-[#0071e3] active:bg-[#0071e3]/20"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </button>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl bg-white border border-[rgba(0,0,0,0.06)] p-8 text-center text-sm text-[#aeaeb2]">
      No {label} found.
    </div>
  );
}

// ---------- Campaign Card ----------

function MobileCampaignCard({
  campaign,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onBudgetChange,
  onDrillDown,
}: {
  campaign: Campaign;
  isSelected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (status: EntityStatus) => void;
  onBudgetChange: (budget: number) => void;
  onDrillDown: () => void;
}) {
  const isActive = campaign.status === 'ACTIVE';
  const m = campaign.metrics;
  const adSetCount = (campaign.adSets || []).length;
  const adCount = (campaign.adSets || []).reduce((sum, as) => sum + (as.ads || []).length, 0);

  return (
    <div
      className={cn(
        'rounded-xl border bg-white transition-all duration-150 active:scale-[0.99] overflow-hidden',
        isSelected ? 'border-[#0071e3] bg-[#f0f6ff]' : 'border-[rgba(0,0,0,0.06)]'
      )}
    >
      {/* Top: toggle + name + drill + checkbox */}
      <div className="flex items-start gap-3 p-3.5 pb-0">
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
        />
        <div className="flex-1 min-w-0" onClick={onDrillDown}>
          <p className="text-[14px] font-semibold text-[#1d1d1f] truncate leading-tight">{campaign.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              'inline-flex items-center gap-1 text-[11px] font-semibold',
              isActive ? 'text-emerald-600' : 'text-[#86868b]'
            )}>
              {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              {campaign.status}
            </span>
            <span className="text-[11px] text-[#aeaeb2]">
              {campaign.dailyBudget > 0
                ? `$${campaign.dailyBudget.toFixed(0)}/day`
                : campaign.lifetimeBudget
                ? `$${campaign.lifetimeBudget.toFixed(0)} lifetime`
                : 'ABO'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Checkbox checked={isSelected} onChange={onToggleSelect} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-2 px-3.5 pt-3 pb-2.5 mt-2 border-t border-[rgba(0,0,0,0.04)]">
        <MetricTile label="Spend" value={`$${m.spend.toFixed(0)}`} />
        <MetricTile label="Revenue" value={`$${m.revenue.toFixed(0)}`} color="text-emerald-600" />
        <MetricTile label="ROAS" value={`${m.roas.toFixed(2)}x`} color={m.roas >= 1.5 ? 'text-emerald-600' : m.roas >= 1 ? 'text-amber-600' : 'text-red-500'} />
        <MetricTile label="CPA" value={`$${m.cpa.toFixed(2)}`} />
      </div>
      <div className="grid grid-cols-4 gap-2 px-3.5 pb-2.5">
        <MetricTile label="Clicks" value={m.clicks.toLocaleString()} small />
        <MetricTile label="CTR" value={`${m.ctr.toFixed(2)}%`} small />
        <MetricTile label="Conv." value={`${m.conversions}`} small />
        <MetricTile label="Impr." value={m.impressions.toLocaleString()} small />
      </div>

      {/* Drill-down button */}
      <button
        onClick={onDrillDown}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#f9f9fb] border-t border-[rgba(0,0,0,0.04)] active:bg-[#f0f0f5] transition-colors"
      >
        <span className="text-[11px] font-medium text-[#86868b]">
          {adSetCount > 0 ? `${adSetCount} ad set${adSetCount !== 1 ? 's' : ''}` : 'View ad sets'}
          {adCount > 0 ? ` · ${adCount} ad${adCount !== 1 ? 's' : ''}` : ''}
        </span>
        <ChevronRight className="h-4 w-4 text-[#aeaeb2]" />
      </button>
    </div>
  );
}

// ---------- Ad Set Card ----------

function MobileAdSetCard({
  adSet,
  isCBO,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onBudgetChange,
  onDrillDown,
}: {
  adSet: AdSet;
  isCBO: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (status: EntityStatus) => void;
  onBudgetChange: (budget: number) => void;
  onDrillDown: () => void;
}) {
  const isActive = adSet.status === 'ACTIVE';
  const m = adSet.metrics;
  const adCount = (adSet.ads || []).length;

  // Build targeting summary
  const targeting = formatTargetingSummary(adSet);

  return (
    <div
      className={cn(
        'rounded-xl border bg-white transition-all duration-150 active:scale-[0.99] overflow-hidden',
        isSelected ? 'border-[#0071e3] bg-[#f0f6ff]' : 'border-[rgba(0,0,0,0.06)]'
      )}
    >
      {/* Top: toggle + name + checkbox */}
      <div className="flex items-start gap-3 p-3.5 pb-0">
        <Toggle
          checked={isActive}
          onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
          size="sm"
        />
        <div className="flex-1 min-w-0" onClick={onDrillDown}>
          <p className="text-[14px] font-semibold text-[#1d1d1f] truncate leading-tight">{adSet.name}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={cn(
              'inline-flex items-center gap-1 text-[11px] font-semibold',
              isActive ? 'text-emerald-600' : 'text-[#86868b]'
            )}>
              {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              {adSet.status}
            </span>
            {targeting && (
              <span className="text-[10px] text-[#aeaeb2] truncate max-w-[180px]">{targeting}</span>
            )}
          </div>
        </div>
        <Checkbox checked={isSelected} onChange={onToggleSelect} />
      </div>

      {/* Budget row */}
      <div className="flex items-center gap-2 px-3.5 pt-2">
        {isCBO ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500 border border-blue-500/20">
            CBO — Campaign budget
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#86868b]">Budget:</span>
            <InlineEdit
              value={(adSet.dailyBudget ?? 0).toFixed(2)}
              onSave={(val) => {
                const num = parseFloat(val);
                if (!isNaN(num) && num > 0) onBudgetChange(num);
              }}
              type="number"
              prefix="$"
            />
            <span className="text-[10px] text-[#aeaeb2]">/day</span>
          </div>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-2 px-3.5 pt-3 pb-2.5 mt-2 border-t border-[rgba(0,0,0,0.04)]">
        <MetricTile label="Spend" value={`$${m.spend.toFixed(0)}`} />
        <MetricTile label="Revenue" value={`$${m.revenue.toFixed(0)}`} color="text-emerald-600" />
        <MetricTile label="ROAS" value={`${m.roas.toFixed(2)}x`} color={m.roas >= 1.5 ? 'text-emerald-600' : m.roas >= 1 ? 'text-amber-600' : 'text-red-500'} />
        <MetricTile label="CPA" value={`$${m.cpa.toFixed(2)}`} />
      </div>
      <div className="grid grid-cols-4 gap-2 px-3.5 pb-2.5">
        <MetricTile label="Clicks" value={m.clicks.toLocaleString()} small />
        <MetricTile label="CTR" value={`${m.ctr.toFixed(2)}%`} small />
        <MetricTile label="Conv." value={`${m.conversions}`} small />
        <MetricTile label="Impr." value={m.impressions.toLocaleString()} small />
      </div>

      {/* Drill-down button */}
      <button
        onClick={onDrillDown}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#f9f9fb] border-t border-[rgba(0,0,0,0.04)] active:bg-[#f0f0f5] transition-colors"
      >
        <span className="text-[11px] font-medium text-[#86868b]">
          {adCount > 0 ? `${adCount} ad${adCount !== 1 ? 's' : ''}` : 'View ads'}
        </span>
        <ChevronRight className="h-4 w-4 text-[#aeaeb2]" />
      </button>
    </div>
  );
}

// ---------- Ad Card ----------

function MobileAdCard({
  ad,
  isSelected,
  onToggleSelect,
  onStatusChange,
}: {
  ad: Ad;
  isSelected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (status: EntityStatus) => void;
}) {
  const isActive = ad.status === 'ACTIVE';
  const m = ad.metrics;
  const hasMedia = !!ad.creative.mediaUrl || !!ad.creative.thumbnailUrl;
  const isVideo = ad.creative.type === 'video';
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div
      className={cn(
        'rounded-xl border bg-white transition-all duration-150 active:scale-[0.99] overflow-hidden',
        isSelected ? 'border-[#0071e3] bg-[#f0f6ff]' : 'border-[rgba(0,0,0,0.06)]'
      )}
    >
      {/* Top: creative thumb + toggle + name + checkbox */}
      <div className="flex items-start gap-3 p-3.5">
        {/* Creative thumbnail */}
        <button
          onClick={() => setPreviewOpen(true)}
          className="relative h-14 w-14 flex-shrink-0 rounded-lg bg-[#f5f5f7] flex items-center justify-center overflow-hidden border border-[rgba(0,0,0,0.06)]"
        >
          {hasMedia ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ad.creative.thumbnailUrl || ad.creative.mediaUrl}
                alt={ad.name}
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Play className="h-4 w-4 text-white fill-white" />
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              {isVideo ? <Play className="h-5 w-5 text-[#aeaeb2]" /> : <ImageIcon className="h-5 w-5 text-[#aeaeb2]" />}
              <span className="text-[8px] font-medium text-[#aeaeb2] uppercase">{ad.creative.type}</span>
            </div>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1d1d1f] truncate leading-tight">{ad.name}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-semibold',
                  isActive ? 'text-emerald-600' : 'text-[#86868b]'
                )}>
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  {ad.status}
                </span>
                <span className="inline-flex items-center rounded-md bg-[#f5f5f7] px-1.5 py-0.5 text-[9px] font-semibold text-[#86868b] uppercase">
                  {ad.creative.type}
                </span>
                {ad.creative.ctaType && (
                  <span className="text-[9px] text-[#aeaeb2]">{ad.creative.ctaType.replace(/_/g, ' ')}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Toggle
                checked={isActive}
                onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
                size="sm"
              />
              <Checkbox checked={isSelected} onChange={onToggleSelect} />
            </div>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-2 px-3.5 pb-2.5 border-t border-[rgba(0,0,0,0.04)] pt-2.5">
        <MetricTile label="Spend" value={`$${m.spend.toFixed(0)}`} />
        <MetricTile label="Revenue" value={`$${m.revenue.toFixed(0)}`} color="text-emerald-600" />
        <MetricTile label="ROAS" value={`${m.roas.toFixed(2)}x`} color={m.roas >= 1.5 ? 'text-emerald-600' : m.roas >= 1 ? 'text-amber-600' : 'text-red-500'} />
        <MetricTile label="CPA" value={`$${m.cpa.toFixed(2)}`} />
      </div>
      <div className="grid grid-cols-4 gap-2 px-3.5 pb-3">
        <MetricTile label="Clicks" value={m.clicks.toLocaleString()} small />
        <MetricTile label="CTR" value={`${m.ctr.toFixed(2)}%`} small />
        <MetricTile label="Conv." value={`${m.conversions}`} small />
        <MetricTile label="Impr." value={m.impressions.toLocaleString()} small />
      </div>

      {/* Preview button for ads with media */}
      {hasMedia && (
        <button
          onClick={() => setPreviewOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#f9f9fb] border-t border-[rgba(0,0,0,0.04)] active:bg-[#f0f0f5] transition-colors text-[11px] font-medium text-[#0071e3]"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview Creative
        </button>
      )}

      {/* Full-screen creative preview */}
      {previewOpen && (
        <MobileCreativePreview ad={ad} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

// ---------- Mobile Creative Preview ----------

function MobileCreativePreview({ ad, onClose }: { ad: Ad; onClose: () => void }) {
  const hasMedia = !!ad.creative.mediaUrl || !!ad.creative.thumbnailUrl;
  const isVideo = ad.creative.type === 'video';

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1 mr-3">
          <p className="text-[13px] font-semibold text-white truncate">{ad.name}</p>
          <p className="text-[10px] text-white/60">{ad.creative.type} · {ad.creative.ctaType?.replace(/_/g, ' ') || ''}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white active:bg-white/30"
        >
          ✕
        </button>
      </div>

      {/* Media */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {isVideo && (ad.creative.mediaUrl || ad.creative.videoId) ? (
          <video
            src={ad.creative.mediaUrl}
            poster={ad.creative.thumbnailUrl || undefined}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full rounded-lg"
          />
        ) : hasMedia ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.creative.mediaUrl || ad.creative.thumbnailUrl}
            alt={ad.name}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/60">
            <ImageIcon className="h-12 w-12" />
            <span className="text-sm">No preview available</span>
          </div>
        )}
      </div>

      {/* Bottom metrics */}
      <div className="flex-shrink-0 bg-black/50 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <p className="text-[9px] font-medium uppercase text-white/50">Spend</p>
            <p className="text-[13px] font-bold text-white tabular-nums">${ad.metrics.spend.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-[9px] font-medium uppercase text-white/50">Revenue</p>
            <p className="text-[13px] font-bold text-emerald-400 tabular-nums">${ad.metrics.revenue.toFixed(0)}</p>
          </div>
          <div>
            <p className="text-[9px] font-medium uppercase text-white/50">ROAS</p>
            <p className={cn(
              'text-[13px] font-bold tabular-nums',
              ad.metrics.roas >= 1.5 ? 'text-emerald-400' : ad.metrics.roas >= 1 ? 'text-amber-400' : 'text-red-400'
            )}>{ad.metrics.roas.toFixed(2)}x</p>
          </div>
          <div>
            <p className="text-[9px] font-medium uppercase text-white/50">CPA</p>
            <p className="text-[13px] font-bold text-white tabular-nums">${ad.metrics.cpa.toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Shared metric tile ----------

function MetricTile({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase text-[#86868b]">{label}</p>
      <p className={cn(
        'tabular-nums',
        small ? 'text-[12px] font-semibold' : 'text-[13px] font-bold',
        color || 'text-[#1d1d1f]'
      )}>{value}</p>
    </div>
  );
}

// ---------- Helper ----------

function formatTargetingSummary(adSet: AdSet): string {
  const parts: string[] = [];
  const t = adSet.targeting;
  if (!t) return '';
  if (t.genders?.length === 1 && t.genders[0] !== 'all') {
    parts.push(t.genders[0] === 'female' ? 'Women' : 'Men');
  }
  if (t.ageMin && t.ageMax) parts.push(`${t.ageMin}-${t.ageMax}`);
  if (t.locations?.length > 0) {
    parts.push(t.locations[0] + (t.locations.length > 1 ? ` +${t.locations.length - 1}` : ''));
  }
  return parts.join(', ');
}
