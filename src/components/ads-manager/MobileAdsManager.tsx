'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Play,
  Image as ImageIcon,
  Eye,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import type { Campaign, AdSet, Ad, EntityStatus } from '@/types/campaign';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import type { MetricKey } from '@/types/metrics';
import { cn } from '@/lib/utils';
import { formatMetric, getMetricValue } from '@/lib/metrics';
import { Toggle } from '@/components/ui/Toggle';
import { Checkbox } from '@/components/ui/Checkbox';
import { InlineEdit } from '@/components/ui/InlineEdit';

// ── Types ────────────────────────────────────────────────────────────

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

// ── Metrics configuration ────────────────────────────────────────────

const PORTRAIT_METRICS: { key: MetricKey; label: string }[] = [
  { key: 'spend', label: 'Spend' },
  { key: 'roas', label: 'ROAS' },
  { key: 'revenue', label: 'Rev' },
  { key: 'cpa', label: 'CPA' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'conversions', label: 'Conv' },
  { key: 'impressions', label: 'Impr' },
  { key: 'cpc', label: 'CPC' },
  { key: 'cpm', label: 'CPM' },
];

const LANDSCAPE_METRICS: { key: MetricKey; label: string }[] = [
  { key: 'spend', label: 'Spend' },
  { key: 'revenue', label: 'Rev' },
  { key: 'roas', label: 'ROAS' },
  { key: 'cpa', label: 'CPA' },
  { key: 'impressions', label: 'Impr' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'ctr', label: 'CTR' },
  { key: 'conversions', label: 'Conv' },
  { key: 'cpc', label: 'CPC' },
  { key: 'cpm', label: 'CPM' },
];

// ── Orientation hook ─────────────────────────────────────────────────

function useOrientation() {
  const [isLandscape, setIsLandscape] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsLandscape(window.innerWidth > window.innerHeight && window.innerWidth < 1024);
    };
    check();
    window.addEventListener('resize', check);
    const mq = window.matchMedia('(orientation: landscape)');
    const handler = () => check();
    mq.addEventListener('change', handler);
    return () => {
      window.removeEventListener('resize', check);
      mq.removeEventListener('change', handler);
    };
  }, []);

  return isLandscape;
}

// ── Metric color helper ──────────────────────────────────────────────

function metricColor(key: MetricKey, value: number): string {
  if (key === 'roas' || key === 'appPixelRoas') {
    if (value === 0) return 'text-[#8e8e93]';
    if (value < 1.0) return 'text-[#ff3b30]';
    if (value < 1.3) return 'text-[#ff9500]';
    return 'text-[#34c759]';
  }
  if (key === 'ctr') {
    if (value === 0) return 'text-[#8e8e93]';
    if (value < 0.5) return 'text-[#ff3b30]';
    return '';
  }
  return '';
}

// ── Resizable name column ────────────────────────────────────────────

const CHECKBOX_W = 28;
const TOGGLE_W = 40;
const FROZEN_LEFT = CHECKBOX_W + TOGGLE_W; // 68px for checkbox + toggle

function useResizableColumn(initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);
  const ref = useRef<{ startX: number; startW: number } | null>(null);

  const onStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    ref.current = { startX: x, startW: width };

    const onMove = (ev: TouchEvent | MouseEvent) => {
      ev.preventDefault();
      if (!ref.current) return;
      const cx = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;
      setWidth(Math.max(min, Math.min(max, ref.current.startW + (cx - ref.current.startX))));
    };
    const onEnd = () => {
      ref.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [width, min, max]);

  return { width, onStart };
}

// ── Main Component ───────────────────────────────────────────────────

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
  const [sortKey, setSortKey] = useState<string | null>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [previewAd, setPreviewAd] = useState<Ad | null>(null);
  const nameCol = useResizableColumn(isLandscape ? 140 : 130, 80, 260);

  // ── Resolve data for drill level ──
  const currentCampaign = useMemo(() => {
    if (!drilldown.campaignId) return null;
    return campaigns.find((c) => c.id === drilldown.campaignId) ?? null;
  }, [campaigns, drilldown.campaignId]);

  const currentAdSets = useMemo(() => currentCampaign?.adSets ?? [], [currentCampaign]);

  const currentAdSet = useMemo(() => {
    if (!drilldown.adSetId) return null;
    return currentAdSets.find((as) => as.id === drilldown.adSetId) ?? null;
  }, [currentAdSets, drilldown.adSetId]);

  const currentAds = useMemo(() => currentAdSet?.ads ?? [], [currentAdSet]);

  // ── Sort ──
  const handleSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }, [sortKey]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortItems = useCallback(<T extends Record<string, any>>(items: T[]): T[] => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortKey === 'name') { av = a.name; bv = b.name; }
      else if (sortKey === 'budget') { av = a.dailyBudget ?? 0; bv = b.dailyBudget ?? 0; }
      else { av = getMetricValue(a.metrics as Record<string, number>, sortKey as MetricKey); bv = getMetricValue(b.metrics as Record<string, number>, sortKey as MetricKey); }
      if (typeof av === 'string') return sortDir === 'asc' ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [sortKey, sortDir]);

  // ── Navigation ──
  const drillIntoCampaign = useCallback((c: Campaign) => {
    onToggleExpandCampaign(c.id);
    setDrilldown({ level: 'adsets', campaignId: c.id, campaignName: c.name });
  }, [onToggleExpandCampaign]);

  const drillIntoAdSet = useCallback((as: AdSet) => {
    onToggleExpandAdSet(as.id);
    setDrilldown((prev) => ({ ...prev, level: 'ads', adSetId: as.id, adSetName: as.name }));
  }, [onToggleExpandAdSet]);

  const goBack = useCallback(() => {
    if (drilldown.level === 'ads') setDrilldown((p) => ({ level: 'adsets', campaignId: p.campaignId, campaignName: p.campaignName }));
    else setDrilldown({ level: 'campaigns' });
  }, [drilldown.level]);

  // ── Resolve items + loading states ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[];
  let isLoading = false;
  let hasError = false;
  let retryFn: (() => void) | null = null;
  const metrics = isLandscape ? LANDSCAPE_METRICS : PORTRAIT_METRICS;

  if (drilldown.level === 'campaigns') {
    items = sortItems(campaigns);
  } else if (drilldown.level === 'adsets') {
    items = sortItems(currentAdSets);
    isLoading = !!drilldown.campaignId && loadingAdSets.has(drilldown.campaignId);
    hasError = !!drilldown.campaignId && errorAdSets.has(drilldown.campaignId);
    retryFn = drilldown.campaignId ? () => onRetryAdSets(drilldown.campaignId!) : null;
  } else {
    items = sortItems(currentAds);
    isLoading = !!drilldown.adSetId && loadingAds.has(drilldown.adSetId);
    hasError = !!drilldown.adSetId && errorAds.has(drilldown.adSetId);
    retryFn = drilldown.adSetId ? () => onRetryAds(drilldown.adSetId!) : null;
  }

  const frozenW = FROZEN_LEFT + nameCol.width; // total frozen columns width
  const totalMetricCols = metrics.length + (drilldown.level !== 'ads' ? 1 : 0); // +1 for drill arrow

  // ── Status change handler ──
  const handleStatusChange = useCallback((id: string, status: EntityStatus) => {
    if (drilldown.level === 'campaigns') onCampaignStatusChange(id, status);
    else if (drilldown.level === 'adsets') onAdSetStatusChange(id, status);
    else onAdStatusChange(id, status);
  }, [drilldown.level, onCampaignStatusChange, onAdSetStatusChange, onAdStatusChange]);

  // ── Drill handler ──
  const handleDrill = useCallback((item: Campaign | AdSet) => {
    if (drilldown.level === 'campaigns') drillIntoCampaign(item as Campaign);
    else drillIntoAdSet(item as AdSet);
  }, [drilldown.level, drillIntoCampaign, drillIntoAdSet]);

  return (
    <div className="flex flex-col">
      {/* ── Breadcrumb / Navigation bar ── */}
      {drilldown.level !== 'campaigns' && (
        <div className="flex items-center gap-1 px-2 py-2 bg-white border-b border-[rgba(0,0,0,0.06)] overflow-hidden">
          <button onClick={goBack} className="flex items-center gap-0.5 text-[#007aff] text-[13px] font-medium flex-shrink-0 min-h-[32px] px-1">
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-0.5 text-[11px] overflow-hidden min-w-0">
            <ChevronRight className="h-3 w-3 text-[#c7c7cc] flex-shrink-0" />
            <span className="text-[#1d1d1f] font-semibold truncate">{drilldown.campaignName}</span>
            {drilldown.adSetName && (
              <>
                <ChevronRight className="h-3 w-3 text-[#c7c7cc] flex-shrink-0" />
                <span className="text-[#1d1d1f] font-semibold truncate">{drilldown.adSetName}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Loading / Error / Empty states ── */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-[#8e8e93]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}
      {!isLoading && hasError && (
        <div className="flex flex-col items-center gap-3 py-12">
          <AlertCircle className="h-5 w-5 text-[#ff9500]" />
          <p className="text-[13px] text-[#8e8e93]">Failed to load — Meta may be rate limiting.</p>
          {retryFn && (
            <button onClick={retryFn} className="flex items-center gap-1.5 text-[13px] font-medium text-[#007aff]">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          )}
        </div>
      )}
      {!isLoading && !hasError && items.length === 0 && (
        <div className="py-12 text-center text-[13px] text-[#8e8e93]">
          No {drilldown.level === 'campaigns' ? 'campaigns' : drilldown.level === 'adsets' ? 'ad sets' : 'ads'} found.
        </div>
      )}

      {/* ── Table ── */}
      {!isLoading && !hasError && items.length > 0 && (
        <div
          className="overflow-x-auto overflow-y-auto -webkit-overflow-scrolling-touch"
          style={{ maxHeight: isLandscape ? 'calc(100vh - 120px)' : undefined, WebkitOverflowScrolling: 'touch' }}
        >
          <table className="w-max text-[12px] border-collapse" style={{ minWidth: frozenW + totalMetricCols * 72 }}>
            {/* ── Header ── */}
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#f2f2f7]">
                {/* Frozen: Checkbox */}
                <th
                  className="sticky left-0 z-30 bg-[#f2f2f7] px-1 py-2 text-center"
                  style={{ width: CHECKBOX_W, minWidth: CHECKBOX_W }}
                />
                {/* Frozen: Toggle */}
                <th
                  className="sticky z-30 bg-[#f2f2f7] px-1 py-2 text-center text-[10px] font-semibold text-[#8e8e93] uppercase"
                  style={{ left: CHECKBOX_W, width: TOGGLE_W, minWidth: TOGGLE_W }}
                >
                  On
                </th>
                {/* Frozen: Name (resizable) */}
                <th
                  className="sticky z-30 bg-[#f2f2f7] px-2 py-2 text-left text-[10px] font-semibold text-[#8e8e93] uppercase border-r border-[rgba(0,0,0,0.08)]"
                  style={{ left: FROZEN_LEFT, width: nameCol.width, minWidth: nameCol.width, maxWidth: nameCol.width }}
                >
                  <div className="flex items-center justify-between">
                    <button onClick={() => handleSort('name')} className="truncate">
                      {drilldown.level === 'campaigns' ? 'Campaign' : drilldown.level === 'adsets' ? 'Ad Set' : 'Ad'}
                    </button>
                    {/* Resize grip */}
                    <div
                      onMouseDown={nameCol.onStart}
                      onTouchStart={nameCol.onStart}
                      className="ml-1 flex-shrink-0 cursor-col-resize px-1 py-2 -my-2 -mr-2 select-none"
                      style={{ touchAction: 'none' }}
                    >
                      <div className="w-[3px] h-4 rounded-full bg-[#c7c7cc]" />
                    </div>
                  </div>
                </th>
                {/* Scrollable: Metric columns */}
                {metrics.map((m) => (
                  <th
                    key={m.key}
                    className="px-2 py-2 text-right text-[10px] font-semibold text-[#8e8e93] uppercase whitespace-nowrap cursor-pointer"
                    onClick={() => handleSort(m.key)}
                    style={{ minWidth: 64 }}
                  >
                    <span className={cn(sortKey === m.key && 'text-[#007aff]')}>
                      {m.label}
                      {sortKey === m.key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                    </span>
                  </th>
                ))}
                {/* Drill arrow header */}
                {drilldown.level !== 'ads' && (
                  <th className="px-1 py-2 w-8" />
                )}
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody>
              {items.map((item) => {
                const isActive = item.status === 'ACTIVE';
                const isPaused = item.status === 'PAUSED';
                const itemMetrics = item.metrics as Record<string, number>;
                const isAd = drilldown.level === 'ads';
                const ad = isAd ? (item as Ad) : null;
                const hasThumb = ad && (ad.creative.thumbnailUrl || ad.creative.mediaUrl);

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      'border-b border-[rgba(0,0,0,0.04)] transition-colors',
                      isPaused ? 'bg-[#f9f9f9]' : 'bg-white',
                      selectedIds.has(item.id) && 'bg-[#e8f0fe]'
                    )}
                  >
                    {/* Checkbox */}
                    <td
                      className={cn('sticky left-0 z-10 px-1 py-1.5 text-center', isPaused ? 'bg-[#f9f9f9]' : 'bg-white', selectedIds.has(item.id) && 'bg-[#e8f0fe]')}
                      style={{ width: CHECKBOX_W, minWidth: CHECKBOX_W }}
                    >
                      <Checkbox checked={selectedIds.has(item.id)} onChange={() => onToggleSelection(item.id)} />
                    </td>

                    {/* Toggle */}
                    <td
                      className={cn('sticky z-10 px-1 py-1.5', isPaused ? 'bg-[#f9f9f9]' : 'bg-white', selectedIds.has(item.id) && 'bg-[#e8f0fe]')}
                      style={{ left: CHECKBOX_W, width: TOGGLE_W, minWidth: TOGGLE_W }}
                    >
                      <Toggle
                        checked={isActive}
                        onChange={(checked) => handleStatusChange(item.id, checked ? 'ACTIVE' : 'PAUSED')}
                        size="sm"
                      />
                    </td>

                    {/* Name */}
                    <td
                      className={cn(
                        'sticky z-10 px-2 py-1.5 border-r border-[rgba(0,0,0,0.04)]',
                        isPaused ? 'bg-[#f9f9f9]' : 'bg-white',
                        selectedIds.has(item.id) && 'bg-[#e8f0fe]'
                      )}
                      style={{ left: FROZEN_LEFT, width: nameCol.width, minWidth: nameCol.width, maxWidth: nameCol.width }}
                    >
                      <div className="flex items-center gap-2">
                        {/* Ad thumbnail */}
                        {isAd && (
                          <button
                            onClick={() => ad && setPreviewAd(ad)}
                            className="relative h-8 w-8 flex-shrink-0 rounded bg-[#f2f2f7] flex items-center justify-center overflow-hidden"
                          >
                            {hasThumb ? (
                              <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={ad!.creative.thumbnailUrl || ad!.creative.mediaUrl} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                {ad!.creative.type === 'video' && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Play className="h-3 w-3 text-white fill-white" />
                                  </div>
                                )}
                              </>
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5 text-[#c7c7cc]" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => !isAd ? handleDrill(item) : ad && setPreviewAd(ad)}
                          className="min-w-0 text-left"
                        >
                          <span className={cn(
                            'text-[13px] font-medium truncate block',
                            !isAd ? 'text-[#007aff]' : 'text-[#1d1d1f]',
                            isPaused && 'opacity-60'
                          )} style={{ maxWidth: nameCol.width - (isAd ? 48 : 16) }}>
                            {item.name}
                          </span>
                        </button>
                      </div>
                    </td>

                    {/* Metric cells */}
                    {metrics.map((m) => (
                      <td
                        key={m.key}
                        className={cn(
                          'px-2 py-1.5 text-right tabular-nums whitespace-nowrap',
                          metricColor(m.key, getMetricValue(itemMetrics, m.key)),
                          isPaused && 'opacity-50'
                        )}
                        style={{ minWidth: 64 }}
                      >
                        {formatMetric(m.key, getMetricValue(itemMetrics, m.key))}
                      </td>
                    ))}

                    {/* Drill arrow */}
                    {!isAd && (
                      <td className="px-1 py-1.5 text-center w-8">
                        <button onClick={() => handleDrill(item)} className="text-[#c7c7cc]">
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Ad creative preview modal ── */}
      {previewAd && (
        <AdPreviewModal ad={previewAd} onClose={() => setPreviewAd(null)} />
      )}
    </div>
  );
}

// ── Ad Preview Modal ─────────────────────────────────────────────────

function AdPreviewModal({ ad, onClose }: { ad: Ad; onClose: () => void }) {
  const hasMedia = !!ad.creative.mediaUrl || !!ad.creative.thumbnailUrl;
  const isVideo = ad.creative.type === 'video';
  const m = ad.metrics;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col safe-top safe-bottom" onClick={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1 mr-3">
          <p className="text-[14px] font-semibold text-white truncate">{ad.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-white/60 uppercase">{ad.creative.type}</span>
            {ad.creative.ctaType && (
              <span className="text-[11px] text-white/40">{ad.creative.ctaType.replace(/_/g, ' ')}</span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 active:bg-white/25">
          <X className="h-4 w-4 text-white" />
        </button>
      </div>

      {/* Media */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {isVideo && ad.creative.mediaUrl ? (
          <video
            src={ad.creative.mediaUrl}
            poster={ad.creative.thumbnailUrl || undefined}
            controls autoPlay playsInline
            className="max-w-full max-h-full rounded-xl"
          />
        ) : hasMedia ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.creative.mediaUrl || ad.creative.thumbnailUrl}
            alt={ad.name}
            className="max-w-full max-h-full object-contain rounded-xl"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/40">
            <ImageIcon className="h-12 w-12" />
            <span className="text-[13px]">No preview</span>
          </div>
        )}
      </div>

      {/* Bottom metrics */}
      <div className="flex-shrink-0 px-4 py-3 bg-black/40" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Spend" value={`$${m.spend.toFixed(0)}`} />
          <Stat label="Revenue" value={`$${m.revenue.toFixed(0)}`} color="text-[#34c759]" />
          <Stat label="ROAS" value={`${m.roas.toFixed(2)}x`} color={m.roas >= 1.3 ? 'text-[#34c759]' : m.roas >= 1 ? 'text-[#ff9500]' : 'text-[#ff3b30]'} />
          <Stat label="CPA" value={`$${m.cpa.toFixed(2)}`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase text-white/40">{label}</p>
      <p className={cn('text-[14px] font-bold tabular-nums', color || 'text-white')}>{value}</p>
    </div>
  );
}
