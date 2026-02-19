'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { MetaAuditClient } from '@/components/meta-audit/MetaAuditClient';
import {
  getAuditOverview,
  getTargetingInsights,
  getAuctionInsights,
  getGeoDemoInsights,
  getCreativeInsights,
  getAdCopyInsights,
  primeMetaAuditSnapshotCache,
  type AuditFilterPreset,
} from '@/services/metaAudit';
import type {
  AuditOverviewResult,
  TargetingInsightsResult,
  AuctionInsightsResult,
  GeoDemoInsightsResult,
  CreativeInsightsResult,
  AdCopyInsightsResult,
} from '@/services/metaAudit';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';
import { getDateRange } from '@/lib/dateUtils';
import type { DateRange } from '@/types/analytics';
import { formatDateInTimezone } from '@/lib/timezone';

interface MetaAuditSnapshot {
  overview: AuditOverviewResult | null;
  targeting: TargetingInsightsResult | null;
  auction: AuctionInsightsResult | null;
  geoDemo: GeoDemoInsightsResult | null;
  creative: CreativeInsightsResult | null;
  adCopy: AdCopyInsightsResult | null;
  generatedAt: string;
}

function hasEnhancedAdCopyPayload(value: AdCopyInsightsResult | null | undefined): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as unknown as Record<string, unknown>;
  return (
    Array.isArray(candidate.copyAnglePerformance) &&
    Array.isArray(candidate.headlinePatternPerformance) &&
    Array.isArray(candidate.topPerformingPrimaryTexts) &&
    !!candidate.copyActionBrief &&
    typeof candidate.copyActionBrief === 'object'
  );
}

function hasUsefulAdCopyInsights(value: AdCopyInsightsResult | null | undefined): boolean {
  if (!value || typeof value !== 'object') return false;
  return (
    (value.topPerformingHeadlines?.length || 0) > 0 ||
    (value.ctaPerformance?.length || 0) > 0 ||
    (value.sentimentAnalysis?.length || 0) > 0 ||
    (value.copyAnglePerformance?.length || 0) > 0 ||
    (value.topPerformingPrimaryTexts?.length || 0) > 0
  );
}

function hasEnhancedCreativePayload(value: CreativeInsightsResult | null | undefined): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as unknown as Record<string, unknown>;
  const creativeCatalog = Array.isArray(candidate.creativeCatalog)
    ? candidate.creativeCatalog as Array<Record<string, unknown>>
    : [];
  const hasStatusControls =
    creativeCatalog.length === 0 ||
    creativeCatalog.some((row) =>
      !!row &&
      typeof row === 'object' &&
      Object.prototype.hasOwnProperty.call(row, 'metaDeliveryStatus') &&
      Object.prototype.hasOwnProperty.call(row, 'canManageStatus')
    );
  return (
    Array.isArray(candidate.videoLengthPerformance) &&
    Array.isArray(candidate.underperformingCreatives) &&
    !!candidate.actionPlan &&
    typeof candidate.actionPlan === 'object' &&
    hasStatusControls
  );
}

function hasUsefulCreativeInsights(value: CreativeInsightsResult | null | undefined): boolean {
  if (!value || typeof value !== 'object') return false;
  return (
    (value.adFormatBreakdown?.length || 0) > 0 ||
    (value.creativePerformanceMatrix?.length || 0) > 0 ||
    (value.creativeSizeBreakdown?.length || 0) > 0 ||
    (value.hookRateByFormat?.length || 0) > 0 ||
    (value.videoLengthPerformance?.length || 0) > 0
  );
}

type SnapshotApplyMode = 'replace' | 'preserve';

const META_AUDIT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const META_AUDIT_CACHE_VERSION = 'v9';
const DEFAULT_SECTION_MS = 15000;
const SECTION_TIMEOUT_MS = 55_000;
const AD_COPY_SECTION_TIMEOUT_MS = 70_000;
const CREATIVE_SECTION_TIMEOUT_MS = 150_000;
type SectionStatus = 'pending' | 'loading' | 'done' | 'error';
type SectionKey = 'overview' | 'targeting' | 'auction' | 'geoDemo' | 'creative' | 'adCopy';

interface SectionProgressItem {
  key: SectionKey;
  label: string;
  status: SectionStatus;
  startedAt?: number;
  endedAt?: number;
}

function rangeKey(range: DateRange): string {
  if (range.preset && range.preset !== 'custom') return range.preset;
  return `${formatDateInTimezone(range.start)}_${formatDateInTimezone(range.end)}`;
}

function getCacheKey(storeId: string, range: DateRange, filterPreset: AuditFilterPreset): string {
  return `meta-audit:cache:${META_AUDIT_CACHE_VERSION}:${storeId}:${rangeKey(range)}:${filterPreset}`;
}

function readSnapshot(storeId: string, range: DateRange, filterPreset: AuditFilterPreset): MetaAuditSnapshot | null {
  try {
    const raw = localStorage.getItem(getCacheKey(storeId, range, filterPreset));
    if (!raw) return null;
    return JSON.parse(raw) as MetaAuditSnapshot;
  } catch {
    return null;
  }
}

function writeSnapshot(storeId: string, range: DateRange, filterPreset: AuditFilterPreset, payload: MetaAuditSnapshot): void {
  try {
    localStorage.setItem(getCacheKey(storeId, range, filterPreset), JSON.stringify(payload));
  } catch {
    // Ignore cache write failures
  }
}

function isSnapshotFresh(snapshot: MetaAuditSnapshot): boolean {
  const ts = Date.parse(snapshot.generatedAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= META_AUDIT_CACHE_TTL_MS;
}

function buildInitialSections(): SectionProgressItem[] {
  return [
    { key: 'overview', label: 'Overview', status: 'pending' },
    { key: 'targeting', label: 'Targeting', status: 'pending' },
    { key: 'auction', label: 'Auction', status: 'pending' },
    { key: 'geoDemo', label: 'Geo & Demo', status: 'pending' },
    { key: 'creative', label: 'Creative', status: 'pending' },
    { key: 'adCopy', label: 'Ad Copy', status: 'pending' },
  ];
}

function computeEtaSeconds(items: SectionProgressItem[]): number {
  const doneDurations = items
    .filter((x) => x.status === 'done' && x.startedAt && x.endedAt)
    .map((x) => Math.max(1000, (x.endedAt as number) - (x.startedAt as number)));
  const avg = doneDurations.length > 0
    ? doneDurations.reduce((s, n) => s + n, 0) / doneDurations.length
    : DEFAULT_SECTION_MS;
  const remainingCount = items.filter((x) => x.status === 'pending' || x.status === 'loading').length;
  return Math.max(0, Math.round((remainingCount * avg) / 1000));
}

function withSectionTimeout<T>(promise: Promise<T>, key: string, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Section timeout: ${key}`)), timeoutMs)
    ),
  ]);
}

export default function MetaAuditPage() {
  const [overview, setOverview] = useState<AuditOverviewResult | null>(null);
  const [targeting, setTargeting] = useState<TargetingInsightsResult | null>(null);
  const [auction, setAuction] = useState<AuctionInsightsResult | null>(null);
  const [geoDemo, setGeoDemo] = useState<GeoDemoInsightsResult | null>(null);
  const [creative, setCreative] = useState<CreativeInsightsResult | null>(null);
  const [adCopy, setAdCopy] = useState<AdCopyInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [emptyReason, setEmptyReason] = useState<'not_connected' | 'no_accounts' | 'error' | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange('last30'));
  const [filterPreset, setFilterPreset] = useState<AuditFilterPreset>('all');
  const [adCopyLoading, setAdCopyLoading] = useState(false);
  const [refreshRunning, setRefreshRunning] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [refreshStage, setRefreshStage] = useState<string>('Idle');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionProgressItem[]>(buildInitialSections);
  const [etaSeconds, setEtaSeconds] = useState(0);
  const adCopyInFlightRef = useRef(false);
  const creativeInFlightRef = useRef(false);

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;

  const updateSection = useCallback((key: SectionKey, status: SectionStatus) => {
    setSections((prev) => {
      const now = Date.now();
      const next = prev.map((item) => {
        if (item.key !== key) return item;
        if (status === 'loading') {
          return { ...item, status, startedAt: item.startedAt ?? now };
        }
        if (status === 'done' || status === 'error') {
          return { ...item, status, endedAt: now, startedAt: item.startedAt ?? now };
        }
        return { ...item, status };
      });
      setEtaSeconds(computeEtaSeconds(next));
      const done = next.filter((x) => x.status === 'done').length;
      const errored = next.filter((x) => x.status === 'error').length;
      const pct = Math.round(((done + errored) / next.length) * 100);
      setRefreshProgress(pct);
      return next;
    });
  }, []);

  const resetSections = useCallback(() => {
    const init = buildInitialSections();
    setSections(init);
    setEtaSeconds(computeEtaSeconds(init));
    setRefreshProgress(0);
  }, []);

  const applySnapshot = useCallback((snapshot: MetaAuditSnapshot, mode: SnapshotApplyMode = 'replace') => {
    if (mode === 'preserve') {
      setOverview((prev) => snapshot.overview ?? prev ?? null);
      setTargeting((prev) => snapshot.targeting ?? prev ?? null);
      setAuction((prev) => snapshot.auction ?? prev ?? null);
      setGeoDemo((prev) => snapshot.geoDemo ?? prev ?? null);
      setCreative((prev) => snapshot.creative ?? prev ?? null);
      setAdCopy((prev) => snapshot.adCopy ?? prev ?? null);
    } else {
      setOverview(snapshot.overview ?? null);
      setTargeting(snapshot.targeting ?? null);
      setAuction(snapshot.auction ?? null);
      setGeoDemo(snapshot.geoDemo ?? null);
      setCreative(snapshot.creative ?? null);
      setAdCopy(snapshot.adCopy ?? null);
    }
    setLastUpdatedAt(snapshot.generatedAt);
  }, []);

  const loadAdCopyOnly = useCallback(async (query: { dateRange: DateRange; filterPreset: AuditFilterPreset }) => {
    if (adCopyInFlightRef.current) return;
    adCopyInFlightRef.current = true;
    setAdCopyLoading(true);
    updateSection('adCopy', 'loading');
    try {
      const copy = await withSectionTimeout(
        getAdCopyInsights(query),
        'adCopy',
        AD_COPY_SECTION_TIMEOUT_MS
      );
      setAdCopy(copy);
      updateSection('adCopy', 'done');
      if (activeStoreId) {
        const existing = readSnapshot(activeStoreId, dateRange, filterPreset);
        if (existing) {
          writeSnapshot(activeStoreId, dateRange, filterPreset, {
            ...existing,
            adCopy: copy,
            generatedAt: existing.generatedAt,
          });
        }
      }
    } catch {
      updateSection('adCopy', 'error');
      // keep other tabs usable
    } finally {
      adCopyInFlightRef.current = false;
      setAdCopyLoading(false);
    }
  }, [activeStoreId, dateRange, filterPreset, updateSection]);

  const loadCreativeOnly = useCallback(async (query: { dateRange: DateRange; filterPreset: AuditFilterPreset }) => {
    if (creativeInFlightRef.current) return;
    creativeInFlightRef.current = true;
    updateSection('creative', 'loading');
    try {
      const creativeData = await withSectionTimeout(
        getCreativeInsights(query),
        'creative',
        CREATIVE_SECTION_TIMEOUT_MS
      );
      setCreative(creativeData);
      updateSection('creative', 'done');
      if (activeStoreId) {
        const existing = readSnapshot(activeStoreId, dateRange, filterPreset);
        if (existing) {
          writeSnapshot(activeStoreId, dateRange, filterPreset, {
            ...existing,
            creative: creativeData,
            generatedAt: existing.generatedAt,
          });
        }
      }
    } catch {
      updateSection('creative', 'error');
    } finally {
      creativeInFlightRef.current = false;
    }
  }, [activeStoreId, dateRange, filterPreset, updateSection]);

  const fetchFresh = useCallback(async (background = false) => {
    resetSections();
    if (background) {
      setRefreshRunning(true);
      setRefreshStage('Starting refresh');
      toast('Meta Audit refresh started in background');
    } else {
      setLoading(true);
      setRefreshRunning(true);
      setRefreshStage('Loading audit sections');
    }
    setEmptyReason(null);

    try {
      const query = { dateRange, filterPreset };
      // Seed 30-day DB snapshots in background so section APIs can serve instantly on subsequent calls.
      void primeMetaAuditSnapshotCache();
      const runCore = async <T,>(key: SectionKey, fn: () => Promise<T>): Promise<T | null> => {
        updateSection(key, 'loading');
        try {
          const timeoutMs = key === 'creative' ? CREATIVE_SECTION_TIMEOUT_MS : SECTION_TIMEOUT_MS;
          const value = await withSectionTimeout(fn(), key, timeoutMs);
          updateSection(key, 'done');
          return value;
        } catch (err) {
          if (err instanceof NotConnectedError) throw err;
          updateSection(key, 'error');
          return null;
        }
      };

      const overviewPromise = runCore('overview', () => getAuditOverview(query)).then((v) => {
        if (v) setOverview(v);
        return v;
      });
      const targetingPromise = runCore('targeting', () => getTargetingInsights(query)).then((v) => {
        if (v) setTargeting(v);
        return v;
      });
      const auctionPromise = runCore('auction', () => getAuctionInsights(query)).then((v) => {
        if (v) setAuction(v);
        return v;
      });
      const geoPromise = runCore('geoDemo', () => getGeoDemoInsights(query)).then((v) => {
        if (v) setGeoDemo(v);
        return v;
      });
      const creativePromise = runCore('creative', () => getCreativeInsights(query)).then((v) => {
        if (v) setCreative(v);
        return v;
      });

      const [ov, tgt, auc, geo, cre] = await Promise.all([
        overviewPromise,
        targetingPromise,
        auctionPromise,
        geoPromise,
        creativePromise,
      ]);

      let adCopySnapshot: AdCopyInsightsResult | null = null;
      if (background) {
        setRefreshStage('Loading ad copy');
        updateSection('adCopy', 'loading');
        try {
          adCopySnapshot = await withSectionTimeout(
            getAdCopyInsights(query),
            'adCopy',
            AD_COPY_SECTION_TIMEOUT_MS
          );
          updateSection('adCopy', 'done');
        } catch {
          updateSection('adCopy', 'error');
        }
      } else {
        // Foreground path: do not block entire page on Ad Copy
        void loadAdCopyOnly(query);
      }

      const existingSnapshot = activeStoreId
        ? readSnapshot(activeStoreId, dateRange, filterPreset)
        : null;

      const snapshot: MetaAuditSnapshot = {
        overview: ov ?? existingSnapshot?.overview ?? null,
        targeting: tgt ?? existingSnapshot?.targeting ?? null,
        auction: auc ?? existingSnapshot?.auction ?? null,
        geoDemo: geo ?? existingSnapshot?.geoDemo ?? null,
        creative: cre ?? existingSnapshot?.creative ?? null,
        adCopy: adCopySnapshot ?? existingSnapshot?.adCopy ?? null,
        generatedAt: new Date().toISOString(),
      };

      applySnapshot(snapshot, 'preserve');
      if (activeStoreId) {
        writeSnapshot(activeStoreId, dateRange, filterPreset, snapshot);
      }

      if (background) {
        setRefreshProgress(100);
        setRefreshStage('Refresh complete');
        toast.success('Meta Audit refresh is complete');
      }
    } catch (err) {
      if (err instanceof NotConnectedError) {
        setEmptyReason(err.reason);
      } else {
        setEmptyReason('error');
      }
      if (background) {
        toast.error('Meta Audit background refresh failed');
      }
    } finally {
      if (background) {
        setTimeout(() => {
          setRefreshRunning(false);
          setRefreshStage('Idle');
        }, 800);
      } else {
        setRefreshRunning(false);
        setRefreshStage('Idle');
        setLoading(false);
      }
    }
  }, [
    activeStoreId,
    applySnapshot,
    dateRange,
    filterPreset,
    loadAdCopyOnly,
    resetSections,
    updateSection,
  ]);

  const fetchData = useCallback(async () => {
    if (!activeStoreId) {
      await fetchFresh(false);
      return;
    }

    const cached = readSnapshot(activeStoreId, dateRange, filterPreset);
    if (cached) {
      applySnapshot(cached);
      setLoading(false);
      setSections((prev) => prev.map((x) => ({ ...x, status: 'done' })));
      setEtaSeconds(0);
      const stale = !isSnapshotFresh(cached);
      if (stale) {
        void fetchFresh(true);
        return;
      }
      const needsAdCopyUpgrade = !!cached.adCopy && !hasEnhancedAdCopyPayload(cached.adCopy);
      const needsAdCopyRefill = !!cached.adCopy && !hasUsefulAdCopyInsights(cached.adCopy);
      if (!cached.adCopy || needsAdCopyUpgrade || needsAdCopyRefill) {
        void loadAdCopyOnly({ dateRange, filterPreset });
      }
      const needsCreativeUpgrade = !!cached.creative && !hasEnhancedCreativePayload(cached.creative);
      const needsCreativeRefill = !!cached.creative && !hasUsefulCreativeInsights(cached.creative);
      if (!cached.creative || needsCreativeUpgrade || needsCreativeRefill) {
        void loadCreativeOnly({ dateRange, filterPreset });
      }
      return;
    }

    await fetchFresh(false);
  }, [activeStoreId, applySnapshot, dateRange, fetchFresh, filterPreset, loadAdCopyOnly, loadCreativeOnly]);

  const handleBackgroundRefresh = useCallback(() => {
    if (refreshRunning) return;
    void fetchFresh(true);
  }, [fetchFresh, refreshRunning]);

  const handleTabChange = useCallback((tab: 'dashboard' | 'targeting' | 'auction' | 'geo' | 'creative' | 'adcopy') => {
    const adCopySectionLoading = sections.some((s) => s.key === 'adCopy' && s.status === 'loading');
    const creativeSectionLoading = sections.some((s) => s.key === 'creative' && s.status === 'loading');
    if (tab === 'adcopy') {
      if (adCopy || adCopyLoading || adCopySectionLoading || refreshRunning) return;
      void loadAdCopyOnly({ dateRange, filterPreset });
      return;
    }
    if (tab === 'creative') {
      if (creative || creativeSectionLoading || refreshRunning) return;
      void loadCreativeOnly({ dateRange, filterPreset });
    }
  }, [adCopy, adCopyLoading, creative, dateRange, filterPreset, loadAdCopyOnly, loadCreativeOnly, refreshRunning, sections]);

  // Wait for connection status to be fully loaded before fetching data.
  useEffect(() => {
    if (connectionReady) {
      fetchData();
    }
  }, [connectionReady, activeStoreId, fetchData, dateRange, filterPreset]);

  const hasAnyData = !!(overview || targeting || auction || geoDemo || creative || adCopy);

  if ((!connectionReady || loading) && !hasAnyData && !emptyReason) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-text-muted">Loading audit data...</span>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  return (
    <MetaAuditClient
      overview={overview}
      targeting={targeting}
      auction={auction}
      geoDemo={geoDemo}
      creative={creative}
      adCopy={adCopy}
      adCopyLoading={adCopyLoading}
      dateRange={dateRange}
      filterPreset={filterPreset}
      onDateRangeChange={setDateRange}
      onFilterPresetChange={setFilterPreset}
      onTabChange={handleTabChange}
      onBackgroundRefresh={handleBackgroundRefresh}
      refreshRunning={refreshRunning}
      refreshProgress={refreshProgress}
      refreshStage={refreshStage}
      lastUpdatedAt={lastUpdatedAt}
      sections={sections}
      etaSeconds={etaSeconds}
    />
  );
}
