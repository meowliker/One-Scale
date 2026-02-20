'use client';

import { useState, useMemo, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { Loader2, AlertCircle, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown, History } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Campaign, AdSet, Ad, EntityStatus } from '@/types/campaign';
import type { HourlyPnLEntry, PnLEntry, PnLSummary } from '@/types/pnl';
import { daysAgoInTimezone } from '@/lib/timezone';
import type { MetricKey } from '@/types/metrics';
import type { TimeSeriesDataPoint } from '@/types/analytics';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import type { EntityAction } from '@/types/latestActions';
import type { ProductCOGS } from '@/types/pnl';
import type { ProductPnLData } from '@/types/productPnL';
import { useCampaignStore } from '@/stores/campaignStore';
import { useColumnPresetStore } from '@/stores/columnPresetStore';
import { getBlendedMetricsForRange, getTimeSeriesForRange, getTopCampaignsForRange } from '@/services/analytics';
import { getPnLSummary, getDailyPnL, getProducts } from '@/services/pnl';
import { getProductPnL } from '@/services/productPnL';
import {
  updateCampaignStatus,
  updateAdSetStatus,
  updateAdStatus,
  updateBudget,
  updateBid,
  bulkUpdateStatus,
} from '@/services/adsManager';
import { apiClient, RateLimitError, TimeoutError } from '@/services/api';
import { getMetricValue } from '@/lib/metrics';
import { useStoreStore } from '@/stores/storeStore';
import { todayInTimezone } from '@/lib/timezone';
import { AdsManagerToolbar, type StatusFilter } from './AdsManagerToolbar';
import { CampaignRow } from './CampaignRow';
import { AdSetRow } from './AdSetRow';
import { AdRow } from './AdRow';
import { MetricCell } from './MetricCell';
import { BulkActionBar } from './BulkActionBar';
import { AIRecommendations } from './AIRecommendations';
import { AdsIssuesPanel, type AdIssue } from './AdsIssuesPanel';
import { Checkbox } from '@/components/ui/Checkbox';
import { DraggableColumnHeader } from '@/components/columns/DraggableColumnHeader';

// Sort indicator for fixed column headers
function FixedSortIndicator({ active, direction }: { active: boolean; direction: 'asc' | 'desc' | null }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 text-text-dimmed opacity-0 group-hover/sort:opacity-50 transition-opacity" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3 w-3 text-primary" />
    : <ArrowDown className="h-3 w-3 text-primary" />;
}

// Sortable fixed column header (Name, Status, Budget)
function SortableFixedHeader({
  label,
  sortKeyName,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  sortKeyName: string;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc' | null;
  onSort: (key: string) => void;
}) {
  return (
    <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
      <button
        onClick={() => onSort(sortKeyName)}
        className="group/sort flex items-center gap-1 cursor-pointer hover:text-text transition-colors"
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        <FixedSortIndicator active={sortKey === sortKeyName} direction={sortKey === sortKeyName ? sortDirection : null} />
      </button>
    </th>
  );
}

export interface AdsManagerClientProps {
  initialCampaigns: Campaign[];
  dateRange?: { since: string; until: string };
}

type SyncStageState = 'idle' | 'loading' | 'done';
const PAGE_PREWARM_INTERVAL_MS = 10 * 60 * 1000; // 10 min cooldown for Summary/P&L prewarm

interface SummaryWarmCachePayload {
  blendedMetrics: Record<string, number>;
  timeSeries: TimeSeriesDataPoint[];
  topCampaigns: Campaign[];
  cachedAt: string;
}

interface PnLWarmCachePayload {
  summary: PnLSummary;
  dailyPnL: PnLEntry[];
  products: ProductCOGS[];
  productPnL: ProductPnLData[];
  lastRefreshedIso: string | null;
}

interface AppPixelMetricSummary {
  results: number;
  purchases: number;
  purchaseValue: number;
}

interface AppPixelEntityMetricsPayload {
  campaigns: Record<string, AppPixelMetricSummary>;
  adSets: Record<string, AppPixelMetricSummary>;
  ads: Record<string, AppPixelMetricSummary>;
}

interface AttributionCoveragePayload {
  percent: number;
  mapped_purchases: number;
  total_purchases: number;
  windowDays: number;
}

function applyAppPixelMetrics(
  baseMetrics: Record<string, number>,
  appPixel: AppPixelMetricSummary | undefined
): Record<string, number> {
  const spend = Number(baseMetrics.spend || 0);
  const appPixelResults = Number(appPixel?.results || 0);
  const appPixelPurchases = Number(appPixel?.purchases || 0);
  const appPixelPurchaseValue = Number(appPixel?.purchaseValue || 0);

  return {
    ...baseMetrics,
    appPixelResults,
    appPixelPurchases,
    appPixelPurchaseValue,
    appPixelRoas: spend > 0 ? appPixelPurchaseValue / spend : 0,
    appPixelCpa: appPixelPurchases > 0 ? spend / appPixelPurchases : 0,
  };
}

function getSummaryWarmCacheKey(storeId: string, preset: 'today'): string {
  return `summary:cache:${storeId}:${preset}`;
}

function writeSummaryWarmCache(storeId: string, preset: 'today', payload: SummaryWarmCachePayload): void {
  try {
    window.localStorage.setItem(getSummaryWarmCacheKey(storeId, preset), JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

function getPnLWarmCacheKey(storeId: string): string {
  return `pnl:cache:${storeId}`;
}

function readPnLWarmCache(storeId: string): PnLWarmCachePayload | null {
  try {
    const raw = window.localStorage.getItem(getPnLWarmCacheKey(storeId));
    if (!raw) return null;
    return JSON.parse(raw) as PnLWarmCachePayload;
  } catch {
    return null;
  }
}

function writePnLWarmCache(storeId: string, payload: PnLWarmCachePayload): void {
  try {
    window.localStorage.setItem(getPnLWarmCacheKey(storeId), JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

function extractLocalPolicyIssues(campaigns: Campaign[]): AdIssue[] {
  const issues: AdIssue[] = [];
  for (const campaign of campaigns) {
    const campaignEffective = (campaign.policyInfo?.effectiveStatus || '').toUpperCase();
    const campaignReview = campaign.policyInfo?.reviewFeedback || '';
    const campaignIssues = campaign.policyInfo?.issuesInfo?.join(' | ') || '';
    if (
      campaignEffective.includes('DISAPPROVED') ||
      campaignEffective.includes('REJECTED') ||
      campaignEffective.includes('WITH_ISSUES') ||
      campaignReview.length > 0 ||
      campaignIssues.length > 0
    ) {
      issues.push({
        id: `local-campaign-${campaign.id}`,
        kind: campaignEffective.includes('DISAPPROVED') || campaignEffective.includes('REJECTED') ? 'ad_policy_rejected' : 'ad_with_issues',
        severity: 'critical',
        level: 'campaign',
        entityStatus: campaign.status,
        campaignStatus: campaign.status,
        adId: '',
        adSetId: '',
        campaignId: campaign.id,
        adName: '(campaign level)',
        adSetName: '-',
        campaignName: campaign.name,
        reason: campaignEffective.includes('DISAPPROVED') || campaignEffective.includes('REJECTED') ? 'Rejected/Disapproved by Meta policy' : 'Campaign has delivery/policy issues',
        details: campaignReview || campaignIssues || campaign.policyInfo?.effectiveStatus,
        suggestion: 'Review campaign setup and destination compliance, then relaunch.',
        actionLabel: campaign.status === 'ACTIVE' ? 'Pause Campaign' : 'Enable Campaign',
      });
    }
    for (const adSet of campaign.adSets || []) {
      const adSetEffective = (adSet.policyInfo?.effectiveStatus || '').toUpperCase();
      const adSetReview = adSet.policyInfo?.reviewFeedback || '';
      const adSetIssues = adSet.policyInfo?.issuesInfo?.join(' | ') || '';
      if (
        adSetEffective.includes('DISAPPROVED') ||
        adSetEffective.includes('REJECTED') ||
        adSetEffective.includes('WITH_ISSUES') ||
        adSetReview.length > 0 ||
        adSetIssues.length > 0
      ) {
        issues.push({
          id: `local-adset-${adSet.id}`,
          kind: adSetEffective.includes('DISAPPROVED') || adSetEffective.includes('REJECTED') ? 'ad_policy_rejected' : 'ad_with_issues',
          severity: 'critical',
          level: 'adset',
          entityStatus: adSet.status,
          campaignStatus: campaign.status,
          adId: '',
          adSetId: adSet.id,
          campaignId: campaign.id,
          adName: '(ad set level)',
          adSetName: adSet.name,
          campaignName: campaign.name,
          reason: adSetEffective.includes('DISAPPROVED') || adSetEffective.includes('REJECTED') ? 'Rejected/Disapproved by Meta policy' : 'Ad set has delivery/policy issues',
          details: adSetReview || adSetIssues || adSet.policyInfo?.effectiveStatus,
          suggestion: 'Review targeting/placements and associated ads.',
          actionLabel: adSet.status === 'ACTIVE' ? 'Pause Ad Set' : 'Enable Ad Set',
        });
      }
      for (const ad of adSet.ads || []) {
        const adEffective = (ad.policyInfo?.effectiveStatus || '').toUpperCase();
        const adReview = ad.policyInfo?.reviewFeedback || '';
        const adIssues = ad.policyInfo?.issuesInfo?.join(' | ') || '';
        if (
          adEffective.includes('DISAPPROVED') ||
          adEffective.includes('REJECTED') ||
          adEffective.includes('WITH_ISSUES') ||
          adReview.length > 0 ||
          adIssues.length > 0
        ) {
          issues.push({
            id: `local-ad-${ad.id}`,
            kind: adEffective.includes('DISAPPROVED') || adEffective.includes('REJECTED') ? 'ad_policy_rejected' : 'ad_with_issues',
            severity: 'critical',
            level: 'ad',
            entityStatus: ad.status,
            campaignStatus: campaign.status,
            adId: ad.id,
            adSetId: adSet.id,
            campaignId: campaign.id,
            adName: ad.name,
            adSetName: adSet.name,
            campaignName: campaign.name,
            reason: adEffective.includes('DISAPPROVED') || adEffective.includes('REJECTED') ? 'Rejected/Disapproved by Meta policy' : 'Ad has delivery/policy issues',
            details: adReview || adIssues || ad.policyInfo?.effectiveStatus,
            suggestion: 'Review policy feedback and fix creative/copy/destination.',
            actionLabel: ad.status === 'ACTIVE' ? 'Pause Ad' : 'Enable Ad',
          });
        }
      }
    }
  }
  return issues;
}

function issueKey(issue: AdIssue): string {
  return [
    issue.level,
    issue.campaignId || '',
    issue.adSetId || '',
    issue.adId || '',
    issue.kind,
    issue.reason,
  ].join('|');
}

export function AdsManagerClient({ initialCampaigns, dateRange }: AdsManagerClientProps) {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [appPixelMetrics, setAppPixelMetrics] = useState<AppPixelEntityMetricsPayload>({
    campaigns: {},
    adSets: {},
    ads: {},
  });
  const [attributionCoverage, setAttributionCoverage] = useState<{
    percent: number;
    mapped: number;
    total: number;
    windowDays: number;
    loading: boolean;
  }>({
    percent: 0,
    mapped: 0,
    total: 0,
    windowDays: 7,
    loading: true,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  // Track which campaigns/adsets are currently loading children
  const [loadingAdSets, setLoadingAdSets] = useState<Set<string>>(new Set());
  const [loadingAds, setLoadingAds] = useState<Set<string>>(new Set());
  // Track which campaigns/adsets failed to load (for retry UI)
  const [errorAdSets, setErrorAdSets] = useState<Set<string>>(new Set());
  const [errorAds, setErrorAds] = useState<Set<string>>(new Set());
  // Track which campaigns/adsets have already had their children fetched
  const fetchedAdSets = useRef<Set<string>>(new Set());
  const fetchedAds = useRef<Set<string>>(new Set());
  const rateLimitUntilRef = useRef<number>(0);
  const lastRateLimitToastAtRef = useRef<number>(0);

  // Sparkline data fetched from the real Meta API (keyed by entity ID)
  const [sparklineData, setSparklineData] = useState<Record<string, SparklineDataPoint[]>>({});

  // Activity data fetched from Meta Activities API (keyed by entity ID)
  const [activityData, setActivityData] = useState<Record<string, EntityAction[]>>({});
  // Track whether full activity history (90 days) has been loaded
  const [activitiesFullyLoaded, setActivitiesFullyLoaded] = useState(false);
  // Track whether full history is currently being fetched
  const [activitiesFullLoading, setActivitiesFullLoading] = useState(false);
  const [prefetchedIssues, setPrefetchedIssues] = useState<AdIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [showErrorCenter, setShowErrorCenter] = useState(false);
  const [focusedIssueId, setFocusedIssueId] = useState<string | null>(null);
  const [corePreloadDone, setCorePreloadDone] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ core: SyncStageState; actions: SyncStageState; errors: SyncStageState }>({
    core: 'idle',
    actions: 'idle',
    errors: 'idle',
  });
  const preloadingCoreRef = useRef(false);
  const actionsLoadedRef = useRef(false);
  const prewarmingPagesRef = useRef(false);
  const hierarchyCacheKey = useMemo(() => {
    const since = dateRange?.since || 'na';
    const until = dateRange?.until || 'na';
    return `ads-manager-hierarchy:${activeStoreId}:${since}:${until}`;
  }, [activeStoreId, dateRange?.since, dateRange?.until]);

  // Live attribution coverage badge for media buyers.
  useEffect(() => {
    if (!activeStoreId) return;
    let cancelled = false;

    const fetchCoverage = async () => {
      setAttributionCoverage((prev) => ({ ...prev, loading: true }));
      try {
        const res = await apiClient<{ data: AttributionCoveragePayload }>('/api/tracking/coverage', {
          params: { storeId: activeStoreId, days: '7' },
          timeoutMs: 8_000,
          maxRetries: 1,
        });
        if (cancelled) return;
        const payload = res.data;
        setAttributionCoverage({
          percent: Number(payload?.percent || 0),
          mapped: Number(payload?.mapped_purchases || 0),
          total: Number(payload?.total_purchases || 0),
          windowDays: Number(payload?.windowDays || 7),
          loading: false,
        });
      } catch {
        if (cancelled) return;
        setAttributionCoverage((prev) => ({ ...prev, loading: false }));
      }
    };

    void fetchCoverage();
    const intervalId = window.setInterval(fetchCoverage, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeStoreId]);

  // Sync with new initialCampaigns when they change (e.g. reconnect or date change)
  useEffect(() => {
    // Normalize: ensure every campaign has adSets array, every adSet has ads array
    const normalized = initialCampaigns.map((c) => ({
      ...c,
      adSets: (c.adSets || []).map((as) => ({
        ...as,
        ads: as.ads || [],
      })),
    }));
    let hydrated = normalized;
    if (typeof window !== 'undefined' && activeStoreId) {
      try {
        const raw = window.localStorage.getItem(hierarchyCacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { campaigns?: Record<string, { adSets: AdSet[] }> };
          const cacheMap = parsed.campaigns || {};
          hydrated = normalized.map((c) => {
            if (c.status !== 'ACTIVE') return c;
            const cached = cacheMap[c.id];
            if (!cached?.adSets?.length) return c;
            return {
              ...c,
              adSets: cached.adSets.map((as) => ({ ...as, ads: as.ads || [] })),
            };
          });
        }
      } catch {
        // Ignore bad cache
      }
    }
    setCampaigns(hydrated);
    // Clear lazy-load caches so expanded items re-fetch with new date range
    fetchedAdSets.current.clear();
    fetchedAds.current.clear();
    // Clear error states
    setErrorAdSets(new Set());
    setErrorAds(new Set());
    // Clear sparkline cache so they re-fetch too
    setSparklineData({});
    // Clear activity cache so they re-fetch too
    setActivityData({});
    setActivitiesFullyLoaded(false);
    setActivitiesFullLoading(false);
    setCorePreloadDone(false);
    setSyncStatus({ core: 'idle', actions: 'idle', errors: 'idle' });
    actionsLoadedRef.current = false;
  }, [initialCampaigns, activeStoreId, hierarchyCacheKey]);

  const fetchAppPixelMetrics = useCallback(async () => {
    if (!activeStoreId) return null;
    const params: Record<string, string> = {};
    if (dateRange?.since && dateRange?.until) {
      params.since = dateRange.since;
      params.until = dateRange.until;
    }
    const res = await apiClient<{ data: AppPixelEntityMetricsPayload }>('/api/tracking/entity-metrics', {
      params,
      timeoutMs: 10_000,
      maxRetries: 1,
    });
    return res.data || {
      campaigns: {},
      adSets: {},
      ads: {},
    };
  }, [activeStoreId, dateRange?.since, dateRange?.until]);

  // Fetch internal App Pixel metrics by entity for the active date range.
  // Keep this live with a light poll so Ads Manager columns update without a full page reload.
  useEffect(() => {
    if (!activeStoreId) return;
    let cancelled = false;

    const run = async () => {
      try {
        const next = await fetchAppPixelMetrics();
        if (cancelled || !next) return;
        setAppPixelMetrics(next);
      } catch {
        // Preserve last good values on transient API/network errors.
      }
    };

    void run();
    const intervalId = window.setInterval(run, 30_000);
    const onFocus = () => void run();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
    };
  }, [activeStoreId, fetchAppPixelMetrics]);

  // Auto-trigger Shopify order backfill so pixel ROAS data is fresh.
  // Backfill days match the selected date range so all pixel data is available.
  // Re-triggers when date range changes (e.g., switching from "Today" to "Last 7 Days").
  const backfillKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeStoreId) return;
    // Compute days from date range (default 7, capped 1-30 to match API)
    let backfillDays = 7;
    if (dateRange?.since && dateRange?.until) {
      const sinceMs = new Date(dateRange.since + 'T00:00:00Z').getTime();
      const untilMs = new Date(dateRange.until + 'T23:59:59Z').getTime();
      if (sinceMs && untilMs && untilMs >= sinceMs) {
        backfillDays = Math.max(1, Math.min(30, Math.ceil((untilMs - sinceMs) / 86_400_000) + 1));
      }
    }
    // Only re-run if store or backfill days actually changed
    const backfillKey = `${activeStoreId}|${backfillDays}`;
    if (backfillKeyRef.current === backfillKey) return;
    backfillKeyRef.current = backfillKey;
    let cancelled = false;

    const runBackfill = async () => {
      try {
        await apiClient('/api/tracking/backfill-orders', {
          method: 'POST',
          body: JSON.stringify({ days: backfillDays, fast: true }),
          timeoutMs: 55_000,
          maxRetries: 0,
        });
        if (cancelled) return;
        // Refresh pixel metrics after backfill completes
        const next = await fetchAppPixelMetrics();
        if (!cancelled && next) setAppPixelMetrics(next);
      } catch {
        // Best-effort — don't block UI
      }
    };

    // Delay initial backfill to not compete with campaign fetch
    const initialTimer = window.setTimeout(runBackfill, 3000);
    // Re-run every 2 minutes for near-real-time pixel ROAS
    const intervalId = window.setInterval(runBackfill, 120_000);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [activeStoreId, dateRange?.since, dateRange?.until, fetchAppPixelMetrics]);

  // Background load policy/delivery issues only when Error Center is opened.
  // This prevents heavy issue scans from competing with core ad-set loading.
  useEffect(() => {
    if (!showErrorCenter) {
      setSyncStatus((prev) => ({ ...prev, errors: 'idle' }));
      return;
    }
    if (!activeStoreId) return;
    let cancelled = false;
    setSyncStatus((prev) => ({ ...prev, errors: 'loading' }));
    setIssuesLoading(true);
    apiClient<{ data: AdIssue[] }>('/api/meta/issues', { params: { storeId: activeStoreId } })
      .then((res) => {
        if (cancelled) return;
        setPrefetchedIssues(res.data || []);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep last good issues instead of clearing to empty on transient failures.
      })
      .finally(() => {
        if (cancelled) return;
        setIssuesLoading(false);
        setSyncStatus((prev) => ({ ...prev, errors: 'done' }));
      });
    return () => {
      cancelled = true;
    };
  }, [showErrorCenter, initialCampaigns, activeStoreId]);

  // Lightweight latest-actions load (small window, no retry) after core preload
  // so ad management data is prioritized first.
  useEffect(() => {
    if (!activeStoreId || campaigns.length === 0) return;
    if (showErrorCenter) return;
    if (!corePreloadDone) return;
    if (actionsLoadedRef.current) return;
    let cancelled = false;
    actionsLoadedRef.current = true;
    setSyncStatus((prev) => ({ ...prev, actions: 'loading' }));

    const timer = window.setTimeout(() => {
      apiClient<{ data: Record<string, EntityAction[]> }>(
        '/api/meta/activities',
        { params: { since: '3', limit: '30' }, timeoutMs: 7000, maxRetries: 0 }
      )
        .then((res) => {
          if (cancelled) return;
          setActivityData((prev) => ({ ...prev, ...(res.data || {}) }));
          setSyncStatus((prev) => ({ ...prev, actions: 'done' }));
        })
        .catch(() => {
          // keep existing/fallback UI
          if (cancelled) return;
          setSyncStatus((prev) => ({ ...prev, actions: 'done' }));
        });
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeStoreId, campaigns, showErrorCenter, corePreloadDone]);

  // Phase 2: On-demand full history load (90 days) — triggered by user clicking
  // "Load full history" button in the column header.
  const loadFullActivityHistory = useCallback(() => {
    if (activitiesFullyLoaded || activitiesFullLoading) return;
    setActivitiesFullLoading(true);

    apiClient<{ data: Record<string, EntityAction[]> }>(
      '/api/meta/activities',
      { params: { since: '90', limit: '500' } }
    ).then((res) => {
      setActivityData((prev) => ({ ...prev, ...res.data }));
      setActivitiesFullyLoaded(true);
    }).catch(() => {
      // Allow retry
    }).finally(() => {
      setActivitiesFullLoading(false);
    });
  }, [activitiesFullyLoaded, activitiesFullLoading]);

  const {
    selectedIds,
    expandedCampaigns,
    expandedAdSets,
    toggleSelection,
    selectAll,
    clearSelection,
    toggleExpandCampaign,
    toggleExpandAdSet,
  } = useCampaignStore();

  const { columnOrder, reorderColumns } = useColumnPresetStore();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = columnOrder.indexOf(active.id as MetricKey);
      const newIndex = columnOrder.indexOf(over.id as MetricKey);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
        reorderColumns(newOrder);
      }
    }
  }

  // --- Lazy load adsets when campaign is expanded ---
  const loadAdSetsForCampaign = useCallback(async (campaignId: string, force = false, mode?: 'fast' | 'basic') => {
    if (fetchedAdSets.current.has(campaignId)) return;
    if (!force && Date.now() < rateLimitUntilRef.current) {
      setErrorAdSets((prev) => new Set(prev).add(campaignId));
      return;
    }

    setLoadingAdSets((prev) => new Set(prev).add(campaignId));
    setErrorAdSets((prev) => {
      const next = new Set(prev);
      next.delete(campaignId);
      return next;
    });
    try {
      const params: Record<string, string> = { campaignId };
      if (dateRange) {
        params.since = dateRange.since;
        params.until = dateRange.until;
        params.strictDate = '1';
      }
      params.mode = mode || 'fast';
      const response = await apiClient<{ data: AdSet[] }>('/api/meta/adsets', {
        params,
        timeoutMs: 12000,
        maxRetries: 0,
      });
      // Ensure each adSet has an ads array (defensive)
      const adSets = (response.data || []).map((as) => ({
        ...as,
        ads: as.ads ?? [],
      }));
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId ? { ...c, adSets } : c
        )
      );
      fetchedAdSets.current.add(campaignId); // Mark as fetched only on success
      return adSets;
    } catch (err) {
      // Emergency fallback: basic ad set load (minimal fields, no insights).
      try {
        const fallbackParams: Record<string, string> = { campaignId, mode: 'basic' };
        if (dateRange) {
          fallbackParams.since = dateRange.since;
          fallbackParams.until = dateRange.until;
          fallbackParams.strictDate = '1';
        }
        const fallback = await apiClient<{ data: AdSet[] }>('/api/meta/adsets', {
          params: fallbackParams,
          timeoutMs: 10000,
          maxRetries: 0,
        });
        const adSets = (fallback.data || []).map((as) => ({
          ...as,
          ads: as.ads ?? [],
        }));
        setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, adSets } : c)));
        fetchedAdSets.current.add(campaignId);
        setErrorAdSets((prev) => {
          const next = new Set(prev);
          next.delete(campaignId);
          return next;
        });
        return adSets;
      } catch {
        // fall through to existing error handling
      }

      console.error('Failed to load adsets for campaign', campaignId, err);
      if (err instanceof RateLimitError) {
        rateLimitUntilRef.current = Date.now() + 60_000;
        if (Date.now() - lastRateLimitToastAtRef.current > 120_000) {
          toast.error('Meta API rate limited — wait a minute and try again', { duration: 5000, icon: '⏳' });
          lastRateLimitToastAtRef.current = Date.now();
        }
      } else if (err instanceof TimeoutError) {
        toast.error('Request timed out — Meta may be slow, try again shortly', { duration: 5000, icon: '⏱️' });
      } else {
        const message = err instanceof Error ? err.message : 'Failed to load ad sets';
        toast.error(`Could not load ad sets: ${message}`);
      }
      setErrorAdSets((prev) => new Set(prev).add(campaignId));
      return null;
    } finally {
      setLoadingAdSets((prev) => {
        const next = new Set(prev);
        next.delete(campaignId);
        return next;
      });
    }
  }, [dateRange]);

  // --- Lazy load ads when adset is expanded ---
  const loadAdsForAdSet = useCallback(async (adSetId: string, force = false, mode?: 'fast' | 'basic') => {
    if (fetchedAds.current.has(adSetId)) return;
    if (!force && Date.now() < rateLimitUntilRef.current) {
      setErrorAds((prev) => new Set(prev).add(adSetId));
      return;
    }

    setLoadingAds((prev) => new Set(prev).add(adSetId));
    setErrorAds((prev) => {
      const next = new Set(prev);
      next.delete(adSetId);
      return next;
    });
    try {
      const params: Record<string, string> = { adsetId: adSetId };
      if (dateRange) {
        params.since = dateRange.since;
        params.until = dateRange.until;
        params.strictDate = '1';
      }
      params.mode = mode || 'fast';
      const response = await apiClient<{ data: Ad[] }>('/api/meta/ads', {
        params,
        timeoutMs: 12000,
        maxRetries: 0,
      });
      setCampaigns((prev) =>
        prev.map((c) => ({
          ...c,
          adSets: (c.adSets || []).map((as) =>
            as.id === adSetId ? { ...as, ads: response.data || [] } : as
          ),
        }))
      );
      fetchedAds.current.add(adSetId); // Mark as fetched only on success
      return response.data || [];
    } catch (err) {
      console.error('Failed to load ads for adset', adSetId, err);
      if (err instanceof RateLimitError) {
        rateLimitUntilRef.current = Date.now() + 60_000;
        if (Date.now() - lastRateLimitToastAtRef.current > 120_000) {
          toast.error('Meta API rate limited — wait a minute and try again', { duration: 5000, icon: '⏳' });
          lastRateLimitToastAtRef.current = Date.now();
        }
      } else if (err instanceof TimeoutError) {
        toast.error('Request timed out — Meta may be slow, try again shortly', { duration: 5000, icon: '⏱️' });
      } else {
        const message = err instanceof Error ? err.message : 'Failed to load ads';
        toast.error(`Could not load ads: ${message}`);
      }
      setErrorAds((prev) => new Set(prev).add(adSetId));
      return null;
    } finally {
      setLoadingAds((prev) => {
        const next = new Set(prev);
        next.delete(adSetId);
        return next;
      });
    }
  }, [dateRange]);

  // Management-first preload:
  // 1) only active campaigns
  // 2) in safe mode, fetch in basic mode with strict sequencing + spacing
  // 3) populate local ad/adset policy issues without requiring manual expansion
  // 4) mark core preload complete so latest-actions can start afterwards
  useEffect(() => {
    if (!activeStoreId) return;
    if (showErrorCenter) return;
    if (corePreloadDone) return;
    if (preloadingCoreRef.current) return;
    if (campaigns.length === 0) {
      setCorePreloadDone(true);
      setSyncStatus((prev) => ({ ...prev, core: 'done' }));
      return;
    }

    const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
    if (activeCampaigns.length === 0) {
      setCorePreloadDone(true);
      setSyncStatus((prev) => ({ ...prev, core: 'done' }));
      return;
    }
    let cancelled = false;
    preloadingCoreRef.current = true;
    setCorePreloadDone(false);
    setSyncStatus((prev) => ({ ...prev, core: 'loading', actions: 'idle' }));

    (async () => {
      // keep bounded even for accounts with many campaigns
      const MAX_ACTIVE_PRELOAD = 8;
      const selectedCampaigns = activeCampaigns.slice(0, MAX_ACTIVE_PRELOAD);

      for (const campaign of selectedCampaigns) {
        if (cancelled) break;

        const adSets = await loadAdSetsForCampaign(campaign.id, false, 'fast');
        if (!adSets || adSets.length === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 320));
          continue;
        }

        const MAX_ADSETS_PER_CAMPAIGN = 10;
        for (const adSet of adSets.slice(0, MAX_ADSETS_PER_CAMPAIGN)) {
          if (cancelled) break;
          await loadAdsForAdSet(adSet.id, false, 'fast');
          await new Promise((resolve) => window.setTimeout(resolve, 260));
        }

        await new Promise((resolve) => window.setTimeout(resolve, 360));
      }
    })()
      .catch(() => {
        // keep UI usable; individual loaders already set row-level errors.
      })
      .finally(() => {
        preloadingCoreRef.current = false;
        if (!cancelled) {
          setCorePreloadDone(true);
          setSyncStatus((prev) => ({ ...prev, core: 'done' }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeStoreId, campaigns, corePreloadDone, loadAdSetsForCampaign, loadAdsForAdSet, showErrorCenter]);

  // Persist active campaign hierarchy cache for fast reload.
  useEffect(() => {
    if (typeof window === 'undefined' || !activeStoreId) return;
    const payload: { campaigns: Record<string, { adSets: AdSet[] }> } = { campaigns: {} };
    for (const campaign of campaigns) {
      if (campaign.status !== 'ACTIVE') continue;
      if (!campaign.adSets || campaign.adSets.length === 0) continue;
      payload.campaigns[campaign.id] = {
        adSets: campaign.adSets.map((as) => ({ ...as, ads: as.ads || [] })),
      };
    }
    try {
      window.localStorage.setItem(hierarchyCacheKey, JSON.stringify(payload));
    } catch {
      // Ignore cache write failures
    }
  }, [campaigns, activeStoreId, hierarchyCacheKey]);

  // Background prewarm for Summary + P&L pages:
  // - Runs only after core ads sync is done
  // - Throttled with cooldown to avoid Meta/API spikes
  // - Writes to the exact page cache keys so those pages open instantly
  useEffect(() => {
    if (!activeStoreId) return;
    if (!corePreloadDone) return;
    if (showErrorCenter) return;
    if (prewarmingPagesRef.current) return;
    if (typeof window === 'undefined') return;

    const stampKey = `ads-manager:pages-prewarm:${activeStoreId}`;
    try {
      const last = Number(window.localStorage.getItem(stampKey) || 0);
      if (Number.isFinite(last) && last > 0 && Date.now() - last < PAGE_PREWARM_INTERVAL_MS) {
        return;
      }
    } catch {
      // ignore read failures
    }

    let cancelled = false;
    prewarmingPagesRef.current = true;

    (async () => {
      // Stage 1: Summary (today) prewarm
      const preset = 'today' as const;
      const [metrics, series, topCampaigns, dailyPnL] = await Promise.all([
        getBlendedMetricsForRange(preset)(),
        getTimeSeriesForRange(preset)(),
        getTopCampaignsForRange(preset)(),
        getDailyPnL(),
      ]);
      if (cancelled) return;

      const todayStr = todayInTimezone();
      const todayRows = dailyPnL.filter((d) => d.date === todayStr);
      const shopifyRevenue = Math.round(todayRows.reduce((sum, d) => sum + (d.revenue || 0), 0) * 100) / 100;
      const shopifyOrders = todayRows.reduce((sum, d) => sum + (d.orderCount || 0), 0);
      const shopifyAov = shopifyOrders > 0 ? Math.round((shopifyRevenue / shopifyOrders) * 100) / 100 : 0;

      writeSummaryWarmCache(activeStoreId, preset, {
        blendedMetrics: {
          ...metrics,
          shopifyRevenue,
          shopifyOrders,
          shopifyAov,
        },
        timeSeries: series,
        topCampaigns,
        cachedAt: new Date().toISOString(),
      });

      // Stage 2: P&L prewarm (staggered to reduce burst traffic)
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      if (cancelled) return;

      const [summary, products, productPnL] = await Promise.all([
        getPnLSummary(),
        getProducts(),
        getProductPnL().catch(() => []),
      ]);
      if (cancelled) return;

      const existing = readPnLWarmCache(activeStoreId);
      writePnLWarmCache(activeStoreId, {
        summary,
        dailyPnL,
        products,
        productPnL: (productPnL as ProductPnLData[]) || existing?.productPnL || [],
        lastRefreshedIso: new Date().toISOString(),
      });

      try {
        window.localStorage.setItem(stampKey, String(Date.now()));
      } catch {
        // ignore stamp write failures
      }
    })()
      .catch(() => {
        // best-effort prewarm only
      })
      .finally(() => {
        prewarmingPagesRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [activeStoreId, corePreloadDone, showErrorCenter]);

  // --- Toggle expand with lazy loading ---
  const handleToggleExpandCampaign = useCallback(
    (campaignId: string) => {
      const willExpand = !expandedCampaigns.has(campaignId);
      toggleExpandCampaign(campaignId);
      if (willExpand) {
        // Check if campaign already has adsets loaded
        const campaign = campaigns.find((c) => c.id === campaignId);
        // Defensive: treat undefined, null, or empty adSets as needing to fetch
        if (!campaign || !campaign.adSets || campaign.adSets.length === 0) {
          loadAdSetsForCampaign(campaignId);
        }
      }
    },
    [expandedCampaigns, toggleExpandCampaign, campaigns, loadAdSetsForCampaign]
  );

  const handleToggleExpandAdSet = useCallback(
    (adSetId: string) => {
      const willExpand = !expandedAdSets.has(adSetId);
      toggleExpandAdSet(adSetId);
      if (willExpand) {
        // Find the adset and check if ads are loaded
        let found = false;
        for (const c of campaigns) {
          const adSets = c.adSets || [];
          const adSet = adSets.find((as) => as.id === adSetId);
          if (adSet) {
            found = true;
            // Defensive: treat undefined, null, or empty ads as needing to fetch
            if (!adSet.ads || adSet.ads.length === 0) {
              loadAdsForAdSet(adSetId);
            }
            break;
          }
        }
        // If adSet wasn't found in any campaign (edge case), still try to fetch
        if (!found) {
          loadAdsForAdSet(adSetId);
        }
      }
    },
    [expandedAdSets, toggleExpandAdSet, campaigns, loadAdsForAdSet]
  );

  // Retry handler for failed adset loads
  const handleRetryAdSets = useCallback(
    (campaignId: string) => {
      fetchedAdSets.current.delete(campaignId);
      loadAdSetsForCampaign(campaignId, true);
    },
    [loadAdSetsForCampaign]
  );

  // Retry handler for failed ad loads
  const handleRetryAds = useCallback(
    (adSetId: string) => {
      fetchedAds.current.delete(adSetId);
      loadAdsForAdSet(adSetId, true);
    },
    [loadAdsForAdSet]
  );

  const campaignsWithAppPixel = useMemo(() => {
    return campaigns.map((campaign) => ({
      ...campaign,
      metrics: applyAppPixelMetrics(
        campaign.metrics as unknown as Record<string, number>,
        appPixelMetrics.campaigns[campaign.id]
      ) as unknown as typeof campaign.metrics,
      adSets: (campaign.adSets || []).map((adSet) => ({
        ...adSet,
        metrics: applyAppPixelMetrics(
          adSet.metrics as unknown as Record<string, number>,
          appPixelMetrics.adSets[adSet.id]
        ) as unknown as typeof adSet.metrics,
        ads: (adSet.ads || []).map((ad) => ({
          ...ad,
          metrics: applyAppPixelMetrics(
            ad.metrics as unknown as Record<string, number>,
            appPixelMetrics.ads[ad.id]
          ) as unknown as typeof ad.metrics,
        })),
      })),
    }));
  }, [campaigns, appPixelMetrics]);

  // Filter campaigns by search and status
  const filteredCampaigns = useMemo(() => {
    return campaignsWithAppPixel.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [campaignsWithAppPixel, search, statusFilter]);

  // Sort handler: cycles null -> asc -> desc -> null
  const handleSort = useCallback((key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      setSortKey(null);
      setSortDirection(null);
    }
  }, [sortKey, sortDirection]);

  // Generic comparator for sorting entities by the current sort key.
  // Uses a loose type so it works for Campaign, AdSet, and Ad alike.
  const compareEntities = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any, b: any): number => {
      if (!sortKey || !sortDirection) return 0;
      let aVal: string | number;
      let bVal: string | number;
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
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    },
    [sortKey, sortDirection]
  );

  // Sorted campaigns (top level)
  const sortedCampaigns = useMemo(() => {
    if (!sortKey || !sortDirection) return filteredCampaigns;
    return [...filteredCampaigns].sort(compareEntities);
  }, [filteredCampaigns, sortKey, sortDirection, compareEntities]);

  // Collect all entity ids for "select all"
  const allEntityIds = useMemo(() => {
    const ids: string[] = [];
    filteredCampaigns.forEach((c) => {
      ids.push(c.id);
      (c.adSets || []).forEach((as) => {
        ids.push(as.id);
        (as.ads || []).forEach((ad) => ids.push(ad.id));
      });
    });
    return ids;
  }, [filteredCampaigns]);

  // Generate mock hourly data from campaign metrics for dayparting analysis
  const hourlyPnLData = useMemo(() => {
    const totalSpend = campaigns.reduce((s, c) => s + c.metrics.spend, 0);
    const totalRevenue = campaigns.reduce((s, c) => s + c.metrics.revenue, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.metrics.conversions, 0);
    if (totalSpend === 0) return [];

    // Generate 7 days of hourly data
    const entries: HourlyPnLEntry[] = [];

    for (let d = 6; d >= 0; d--) {
      const dateStr = daysAgoInTimezone(d);

      for (let h = 0; h < 24; h++) {
        // Circadian rhythm multiplier
        let mult = 1.0;
        if (h >= 8 && h <= 11) mult = 1.6;
        else if (h >= 12 && h <= 14) mult = 1.2;
        else if (h >= 15 && h <= 18) mult = 1.1;
        else if (h >= 19 && h <= 21) mult = 1.3;
        else if (h >= 1 && h <= 5) mult = 0.4;
        else if (h === 0 || h >= 22) mult = 0.6;

        // Add some variance
        const variance = 0.85 + Math.random() * 0.3;
        const hourMult = mult * variance;

        // Daily fraction: each hour gets ~1/24th of daily, scaled by multiplier
        const dailySpend = totalSpend / 30; // assume 30 day data
        const hourSpend = (dailySpend / 24) * hourMult;
        const roasMultiplier = mult > 1 ? mult * 1.1 : mult * 0.8; // better ROAS during peak
        const hourRevenue = hourSpend * (totalRevenue / totalSpend) * roasMultiplier;
        const hourConversions = Math.max(0, Math.round((totalConversions / 30 / 24) * hourMult));

        entries.push({
          date: dateStr,
          hour: h,
          hourLabel: ['12am','1am','2am','3am','4am','5am','6am','7am','8am','9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm'][h],
          spend: Math.round(hourSpend * 100) / 100,
          revenue: Math.round(hourRevenue * 100) / 100,
          roas: hourSpend > 0 ? Math.round((hourRevenue / hourSpend) * 100) / 100 : 0,
          impressions: Math.round((1000 / 24) * hourMult),
          clicks: Math.round((50 / 24) * hourMult),
          conversions: hourConversions,
          cpa: hourConversions > 0 ? Math.round((hourSpend / hourConversions) * 100) / 100 : 0,
          ctr: 5.0 * (mult > 1 ? 1.1 : 0.9),
          cpc: hourSpend > 0 ? Math.round((hourSpend / Math.max(1, Math.round((50 / 24) * hourMult))) * 100) / 100 : 0,
          cpm: Math.round(hourSpend / Math.max(1, Math.round((1000 / 24) * hourMult)) * 1000 * 100) / 100,
        });
      }
    }
    return entries;
  }, [campaigns]);

  const selectedCount = selectedIds.size;
  const allSelected = allEntityIds.length > 0 && allEntityIds.every((id) => selectedIds.has(id));
  const someSelected = allEntityIds.some((id) => selectedIds.has(id)) && !allSelected;

  const totals = useMemo(() => {
    const metrics: Record<string, number> = {};
    const rankingKeys: MetricKey[] = ['qualityRanking', 'engagementRateRanking', 'conversionRateRanking'];
    const rankingCounts: Record<string, number> = {};
    let budgetTotal = 0;
    let activeCampaigns = 0;

    for (const campaign of sortedCampaigns) {
      budgetTotal += campaign.dailyBudget || 0;
      if (campaign.status === 'ACTIVE') activeCampaigns += 1;

      const m = campaign.metrics as unknown as Record<string, number>;
      for (const [key, rawValue] of Object.entries(m)) {
        const value = Number(rawValue || 0);
        metrics[key] = (metrics[key] || 0) + value;
      }

      for (const key of rankingKeys) {
        const v = (m[key] || 0);
        if (v > 0) {
          rankingCounts[key] = (rankingCounts[key] || 0) + 1;
        }
      }
    }

    const spend = metrics.spend || 0;
    const revenue = metrics.revenue || 0;
    const impressions = metrics.impressions || 0;
    const reach = metrics.reach || 0;
    const clicks = metrics.clicks || 0;
    const conversions = metrics.conversions || 0;
    const results = metrics.results || 0;
    const purchases = metrics.purchases || 0;
    const linkClicks = metrics.linkClicks || 0;
    const leads = metrics.leads || 0;
    const thruPlays = metrics.videoThruPlays || 0;
    const landingPageViews = metrics.landingPageViews || 0;
    const appPixelPurchases = metrics.appPixelPurchases || 0;
    const appPixelPurchaseValue = metrics.appPixelPurchaseValue || 0;

    metrics.roas = spend > 0 ? revenue / spend : 0;
    metrics.ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    metrics.cpc = clicks > 0 ? spend / clicks : 0;
    metrics.cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
    metrics.aov = conversions > 0 ? revenue / conversions : 0;
    metrics.frequency = reach > 0 ? impressions / reach : 0;
    metrics.cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
    metrics.cpa = conversions > 0 ? spend / conversions : 0;
    metrics.netProfit = revenue - spend;
    metrics.costPerResult = results > 0 ? spend / results : 0;
    metrics.costPerLead = leads > 0 ? spend / leads : 0;
    metrics.linkCTR = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
    metrics.costPerLinkClick = linkClicks > 0 ? spend / linkClicks : 0;
    metrics.costPerThruPlay = thruPlays > 0 ? spend / thruPlays : 0;
    metrics.uniqueCTR = impressions > 0 ? ((metrics.uniqueClicks || 0) / impressions) * 100 : 0;
    metrics.costPerLandingPageView = landingPageViews > 0 ? spend / landingPageViews : 0;
    metrics.purchaseValue = metrics.purchaseValue || revenue;
    metrics.aov = purchases > 0 ? revenue / purchases : metrics.aov;
    metrics.appPixelRoas = spend > 0 ? appPixelPurchaseValue / spend : 0;
    metrics.appPixelCpa = appPixelPurchases > 0 ? spend / appPixelPurchases : 0;

    for (const key of rankingKeys) {
      const count = rankingCounts[key] || 0;
      metrics[key] = count > 0 ? (metrics[key] || 0) / count : 0;
    }

    return {
      metrics,
      budgetTotal,
      campaignCount: sortedCampaigns.length,
      activeCampaigns,
    };
  }, [sortedCampaigns]);

  // Total column count: checkbox + toggle + name + status + budget + bid strategy + dynamic metrics
  const totalColumns = 8 + columnOrder.length;

  // --- Handlers ---
  const handleCampaignStatusChange = useCallback(
    async (campaignId: string, status: EntityStatus) => {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? { ...c, status } : c))
      );
      await updateCampaignStatus(campaignId, status);
    },
    []
  );

  const handleAdSetStatusChange = useCallback(
    async (adSetId: string, status: EntityStatus) => {
      setCampaigns((prev) =>
        prev.map((c) => ({
          ...c,
          adSets: (c.adSets || []).map((as) =>
            as.id === adSetId ? { ...as, status } : as
          ),
        }))
      );
      await updateAdSetStatus(adSetId, status);
    },
    []
  );

  const handleAdStatusChange = useCallback(
    async (adId: string, status: EntityStatus) => {
      setCampaigns((prev) =>
        prev.map((c) => ({
          ...c,
          adSets: (c.adSets || []).map((as) => ({
            ...as,
            ads: (as.ads || []).map((ad) =>
              ad.id === adId ? { ...ad, status } : ad
            ),
          })),
        }))
      );
      await updateAdStatus(adId, status);
    },
    []
  );

  const handleCampaignBudgetChange = useCallback(
    async (campaignId: string, newBudget: number) => {
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaignId ? { ...c, dailyBudget: newBudget } : c
        )
      );
      await updateBudget('campaign', campaignId, newBudget);
    },
    []
  );

  const handleAdSetBudgetChange = useCallback(
    async (adSetId: string, newBudget: number) => {
      setCampaigns((prev) =>
        prev.map((c) => ({
          ...c,
          adSets: (c.adSets || []).map((as) =>
            as.id === adSetId ? { ...as, dailyBudget: newBudget } : as
          ),
        }))
      );
      await updateBudget('adset', adSetId, newBudget);
    },
    []
  );

  const handleAdSetBidChange = useCallback(
    async (adSetId: string, newBid: number) => {
      setCampaigns((prev) =>
        prev.map((c) => ({
          ...c,
          adSets: (c.adSets || []).map((as) =>
            as.id === adSetId ? { ...as, bidAmount: newBid } : as
          ),
        }))
      );
      await updateBid(adSetId, newBid);
    },
    []
  );

  const handleAdNameChange = useCallback(
    (adId: string, newName: string) => {
      setCampaigns((prev) =>
        prev.map((c) => ({
          ...c,
          adSets: (c.adSets || []).map((as) => ({
            ...as,
            ads: (as.ads || []).map((ad) =>
              ad.id === adId ? { ...ad, name: newName } : ad
            ),
          })),
        }))
      );
      // TODO: persist via Meta API when write access is available
    },
    []
  );

  const handleBulkPause = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setCampaigns((prev) => {
      const idSet = new Set(ids);
      return prev.map((c) => ({
        ...c,
        status: idSet.has(c.id) ? ('PAUSED' as EntityStatus) : c.status,
        adSets: (c.adSets || []).map((as) => ({
          ...as,
          status: idSet.has(as.id) ? ('PAUSED' as EntityStatus) : as.status,
          ads: (as.ads || []).map((ad) => ({
            ...ad,
            status: idSet.has(ad.id) ? ('PAUSED' as EntityStatus) : ad.status,
          })),
        })),
      }));
    });
    await bulkUpdateStatus(ids, 'PAUSED');
    clearSelection();
  }, [selectedIds, clearSelection]);

  const handleBulkEnable = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setCampaigns((prev) => {
      const idSet = new Set(ids);
      return prev.map((c) => ({
        ...c,
        status: idSet.has(c.id) ? ('ACTIVE' as EntityStatus) : c.status,
        adSets: (c.adSets || []).map((as) => ({
          ...as,
          status: idSet.has(as.id) ? ('ACTIVE' as EntityStatus) : as.status,
          ads: (as.ads || []).map((ad) => ({
            ...ad,
            status: idSet.has(ad.id) ? ('ACTIVE' as EntityStatus) : ad.status,
          })),
        })),
      }));
    });
    await bulkUpdateStatus(ids, 'ACTIVE');
    clearSelection();
  }, [selectedIds, clearSelection]);

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      clearSelection();
    } else {
      selectAll(allEntityIds);
    }
  }, [allSelected, allEntityIds, clearSelection, selectAll]);

  const mergedIssues = useMemo(() => {
    const localIssues = extractLocalPolicyIssues(campaigns);
    const merged = [...prefetchedIssues, ...localIssues];
    return Array.from(new Map(merged.map((i) => [issueKey(i), i])).values());
  }, [prefetchedIssues, campaigns]);

  const campaignIssueCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const issue of mergedIssues) {
      if (!issue.campaignId) continue;
      map.set(issue.campaignId, (map.get(issue.campaignId) || 0) + 1);
    }
    return map;
  }, [mergedIssues]);

  const campaignIssuesById = useMemo(() => {
    const map = new Map<string, AdIssue[]>();
    for (const issue of mergedIssues) {
      if (!issue.campaignId) continue;
      map.set(issue.campaignId, [...(map.get(issue.campaignId) || []), issue]);
    }
    return map;
  }, [mergedIssues]);

  const adSetIssuesById = useMemo(() => {
    const map = new Map<string, AdIssue[]>();
    for (const issue of mergedIssues) {
      if (!issue.adSetId) continue;
      map.set(issue.adSetId, [...(map.get(issue.adSetId) || []), issue]);
    }
    return map;
  }, [mergedIssues]);

  const adIssuesById = useMemo(() => {
    const map = new Map<string, AdIssue[]>();
    for (const issue of mergedIssues) {
      if (!issue.adId) continue;
      map.set(issue.adId, [...(map.get(issue.adId) || []), issue]);
    }
    return map;
  }, [mergedIssues]);

  const errorCounts = useMemo(() => {
    const total = mergedIssues.length;
    const critical = mergedIssues.filter((i) => i.severity === 'critical').length;
    const now = Date.now();
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const recent12h = mergedIssues.filter((i) => {
      const ts = i.lastUpdatedAt ? Date.parse(i.lastUpdatedAt) : NaN;
      return Number.isFinite(ts) && now - ts <= twelveHoursMs;
    }).length;
    return { total, critical, recent12h };
  }, [mergedIssues]);

  const syncPercent = useMemo(() => {
    const coreWeight = 70;
    const actionsWeight = 30;
    const corePart = syncStatus.core === 'done' ? coreWeight : syncStatus.core === 'loading' ? 40 : 0;
    const actionsPart = syncStatus.actions === 'done' ? actionsWeight : syncStatus.actions === 'loading' ? 15 : 0;
    return Math.min(100, corePart + actionsPart);
  }, [syncStatus.actions, syncStatus.core]);

  const scrollToRow = useCallback((rowId: string) => {
    const node = document.getElementById(rowId);
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedRowId(rowId);
    window.setTimeout(() => setHighlightedRowId((prev) => (prev === rowId ? null : prev)), 2200);
    return true;
  }, []);

  const handleNavigateIssue = useCallback(async (issue: AdIssue) => {
    setShowErrorCenter(false);
    const campaign = campaigns.find((c) => c.id === issue.campaignId);
    if (!campaign) {
      const section = document.getElementById('ads-errors-center');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (!expandedCampaigns.has(issue.campaignId)) {
      toggleExpandCampaign(issue.campaignId);
      const hasAdSets = (campaign.adSets || []).length > 0;
      if (!hasAdSets) {
        await loadAdSetsForCampaign(issue.campaignId);
      }
    }

    if (issue.level === 'campaign') {
      scrollToRow(`campaign-row-${issue.campaignId}`);
      return;
    }

    if (issue.adSetId && !expandedAdSets.has(issue.adSetId)) {
      toggleExpandAdSet(issue.adSetId);
      if (issue.level === 'ad') {
        const adSet = (campaign.adSets || []).find((as) => as.id === issue.adSetId);
        if (!adSet || !adSet.ads || adSet.ads.length === 0) {
          await loadAdsForAdSet(issue.adSetId);
        }
      }
    }

    const rowId =
      issue.level === 'ad'
        ? `ad-row-${issue.adId}`
        : issue.level === 'adset'
        ? `adset-row-${issue.adSetId}`
        : `campaign-row-${issue.campaignId}`;

    if (!scrollToRow(rowId)) {
      window.setTimeout(() => scrollToRow(rowId), 450);
    }
  }, [campaigns, expandedAdSets, expandedCampaigns, loadAdSetsForCampaign, loadAdsForAdSet, scrollToRow, toggleExpandAdSet, toggleExpandCampaign]);

  return (
    <div className="space-y-4">
      <AdsManagerToolbar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        campaignCount={filteredCampaigns.length}
        showErrorCenter={showErrorCenter}
        onToggleErrorCenter={() => {
          setShowErrorCenter((v) => !v);
          setFocusedIssueId(null);
        }}
        errorCounts={errorCounts}
        syncStatus={syncStatus}
        syncPercent={syncPercent}
        attributionCoverage={attributionCoverage}
      />

      {showErrorCenter && (
        <AdsIssuesPanel
          campaigns={campaigns}
          onCampaignStatusChange={handleCampaignStatusChange}
          onAdSetStatusChange={handleAdSetStatusChange}
          onAdStatusChange={handleAdStatusChange}
          onAdSetBudgetChange={handleAdSetBudgetChange}
          onNavigateIssue={handleNavigateIssue}
          prefetchedIssues={mergedIssues}
          issuesLoading={issuesLoading}
          focusedIssueId={focusedIssueId}
        />
      )}

      {/* Table container */}
      {!showErrorCenter && <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto rounded-lg border border-border bg-surface-elevated shadow-sm">
          <table className="w-full min-w-[1200px] border-collapse">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-border bg-surface">
                <th className="w-10 whitespace-nowrap px-3 py-3 text-left">
                  <Checkbox
                    checked={allSelected}
                    onChange={handleSelectAll}
                    indeterminate={someSelected}
                  />
                </th>
                <th className="w-12 whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  On/Off
                </th>
                <SortableFixedHeader label="Name" sortKeyName="name" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                <SortableFixedHeader label="Status" sortKeyName="status" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                <SortableFixedHeader label="Budget" sortKeyName="budget" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  Bid Strategy
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-muted">
                  Performance
                </th>
                <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
                  <div className="flex items-center gap-2">
                    <span>Latest Actions</span>
                    {!activitiesFullyLoaded && (
                      <button
                        onClick={loadFullActivityHistory}
                        disabled={activitiesFullLoading}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors normal-case tracking-normal"
                        title="Load full 90-day activity history (initial load shows last 7 days only)"
                      >
                        {activitiesFullLoading ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <History className="h-3 w-3" />
                            Full history
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </th>
                {/* Dynamic metric columns with drag-to-reorder */}
                <SortableContext
                  items={columnOrder}
                  strategy={horizontalListSortingStrategy}
                >
                  {columnOrder.map((key) => (
                    <DraggableColumnHeader
                      key={key}
                      metricKey={key}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  ))}
                </SortableContext>
              </tr>
            </thead>
            <tbody>
              {sortedCampaigns.length === 0 ? (
                <tr>
                  <td colSpan={totalColumns} className="px-6 py-12 text-center text-sm text-text-muted">
                    No campaigns found.
                  </td>
                </tr>
              ) : (
                sortedCampaigns.map((campaign) => {
                  const campaignExpanded = expandedCampaigns.has(campaign.id);
                  return (
                    <CampaignGroup
                      key={campaign.id}
                      campaign={campaign}
                      isExpanded={campaignExpanded}
                      expandedAdSets={expandedAdSets}
                      selectedIds={selectedIds}
                      columnOrder={columnOrder}
                      loadingAdSets={loadingAdSets.has(campaign.id)}
                      loadingAds={loadingAds}
                      errorAdSets={errorAdSets.has(campaign.id)}
                      errorAds={errorAds}
                      totalColumns={totalColumns}
                      sparklineData={sparklineData}
                      setSparklineData={setSparklineData}
                      activityData={activityData}
                      setActivityData={setActivityData}
                      activitiesFullyLoaded={activitiesFullyLoaded}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      compareEntities={compareEntities}
                      onToggleExpandCampaign={() => handleToggleExpandCampaign(campaign.id)}
                      onToggleExpandAdSet={(id) => handleToggleExpandAdSet(id)}
                      onToggleSelection={toggleSelection}
                      onCampaignStatusChange={handleCampaignStatusChange}
                      onAdSetStatusChange={handleAdSetStatusChange}
                      onAdStatusChange={handleAdStatusChange}
                      onAdNameChange={handleAdNameChange}
                      onCampaignBudgetChange={handleCampaignBudgetChange}
                      onAdSetBudgetChange={handleAdSetBudgetChange}
                      onAdSetBidChange={handleAdSetBidChange}
                      onRetryAdSets={() => handleRetryAdSets(campaign.id)}
                      onRetryAds={(adSetId) => handleRetryAds(adSetId)}
                      issueCount={campaignIssueCounts.get(campaign.id) || 0}
                      highlightedRowId={highlightedRowId}
                      campaignIssues={campaignIssuesById.get(campaign.id) || []}
                      adSetIssuesById={adSetIssuesById}
                      adIssuesById={adIssuesById}
                      onIssueClick={(issue) => {
                        setFocusedIssueId(issue.id);
                        setShowErrorCenter(true);
                        const section = document.getElementById('ads-errors-center');
                        if (section) {
                          window.setTimeout(() => {
                            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 80);
                        }
                      }}
                    />
                  );
                })
              )}
            </tbody>
            {sortedCampaigns.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-primary/30 bg-surface-hover/70">
                  <td className="w-10 whitespace-nowrap px-3 py-3" />
                  <td className="w-12 whitespace-nowrap px-3 py-3" />
                  <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold text-text-primary">
                    Totals ({totals.campaignCount} campaigns)
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-text-secondary">
                    {totals.activeCampaigns} active
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold text-text-primary">
                    &mdash;
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-text-dimmed">&mdash;</td>
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-text-dimmed">&mdash;</td>
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-text-dimmed">&mdash;</td>
                  {columnOrder.map((key) => (
                    <MetricCell
                      key={`totals-${key}`}
                      metricKey={key}
                      value={getMetricValue(totals.metrics, key)}
                    />
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DndContext>}

      {/* Bulk action bar */}
      {!showErrorCenter && <BulkActionBar
        selectedCount={selectedCount}
        onPause={handleBulkPause}
        onEnable={handleBulkEnable}
        onClearSelection={clearSelection}
      />}

      {/* AI Recommendations */}
      {!showErrorCenter && <AIRecommendations
        campaigns={campaigns}
        hourlyData={hourlyPnLData}
        onCampaignStatusChange={handleCampaignStatusChange}
        onAdSetStatusChange={handleAdSetStatusChange}
        onAdStatusChange={handleAdStatusChange}
        onCampaignBudgetChange={handleCampaignBudgetChange}
        onAdSetBudgetChange={handleAdSetBudgetChange}
      />}
    </div>
  );
}

// --- Internal grouping component for campaign + adsets + ads ---
interface CampaignGroupProps {
  campaign: Campaign;
  isExpanded: boolean;
  expandedAdSets: Set<string>;
  selectedIds: Set<string>;
  columnOrder: MetricKey[];
  loadingAdSets: boolean;
  loadingAds: Set<string>;
  errorAdSets: boolean;
  errorAds: Set<string>;
  totalColumns: number;
  sparklineData: Record<string, SparklineDataPoint[]>;
  setSparklineData: Dispatch<SetStateAction<Record<string, SparklineDataPoint[]>>>;
  activityData: Record<string, EntityAction[]>;
  setActivityData: Dispatch<SetStateAction<Record<string, EntityAction[]>>>;
  activitiesFullyLoaded: boolean;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc' | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compareEntities: (a: any, b: any) => number;
  onToggleExpandCampaign: () => void;
  onToggleExpandAdSet: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onCampaignStatusChange: (id: string, status: EntityStatus) => void;
  onAdSetStatusChange: (id: string, status: EntityStatus) => void;
  onAdStatusChange: (id: string, status: EntityStatus) => void;
  onAdNameChange: (id: string, name: string) => void;
  onCampaignBudgetChange: (id: string, budget: number) => void;
  onAdSetBudgetChange: (id: string, budget: number) => void;
  onAdSetBidChange: (id: string, bid: number) => void;
  onRetryAdSets: () => void;
  onRetryAds: (adSetId: string) => void;
  issueCount: number;
  highlightedRowId: string | null;
  campaignIssues: AdIssue[];
  adSetIssuesById: Map<string, AdIssue[]>;
  adIssuesById: Map<string, AdIssue[]>;
  onIssueClick: (issue: AdIssue) => void;
}

function CampaignGroup({
  campaign,
  isExpanded,
  expandedAdSets,
  selectedIds,
  columnOrder,
  loadingAdSets,
  loadingAds,
  errorAdSets,
  errorAds,
  totalColumns,
  sparklineData,
  setSparklineData,
  activityData,
  setActivityData,
  activitiesFullyLoaded,
  sortKey,
  sortDirection,
  compareEntities,
  onToggleExpandCampaign,
  onToggleExpandAdSet,
  onToggleSelection,
  onCampaignStatusChange,
  onAdSetStatusChange,
  onAdStatusChange,
  onAdNameChange,
  onCampaignBudgetChange,
  onAdSetBudgetChange,
  onAdSetBidChange,
  onRetryAdSets,
  onRetryAds,
  issueCount,
  highlightedRowId,
  campaignIssues,
  adSetIssuesById,
  adIssuesById,
  onIssueClick,
}: CampaignGroupProps) {
  // Defensive: always ensure adSets is an array, then sort
  const adSetsRaw = campaign.adSets || [];
  const adSets = useMemo(() => {
    if (!sortKey || !sortDirection) return adSetsRaw;
    return [...adSetsRaw].sort(compareEntities);
  }, [adSetsRaw, sortKey, sortDirection, compareEntities]);

  // Determine if this campaign uses Campaign Budget Optimization (CBO)
  const isCBO = campaign.dailyBudget > 0 || (campaign.lifetimeBudget != null && campaign.lifetimeBudget > 0);
  const campaignBudget = campaign.dailyBudget > 0 ? campaign.dailyBudget : undefined;

  // Track which adset/ad groups have already had sparkline fetched
  const fetchedSparklineAdSets = useRef<Set<string>>(new Set());
  const fetchedSparklineAds = useRef<Set<string>>(new Set());

  // Fetch sparkline data for adsets when campaign is expanded and adsets are loaded
  useEffect(() => {
    if (!isExpanded || adSets.length === 0) return;
    const adSetIds = adSets.map((as) => as.id);
    const unfetched = adSetIds.filter((id) => !fetchedSparklineAdSets.current.has(id));
    if (unfetched.length === 0) return;
    unfetched.forEach((id) => fetchedSparklineAdSets.current.add(id));

    apiClient<{ data: Record<string, SparklineDataPoint[]> }>(
      '/api/meta/sparkline',
      { params: { entityIds: unfetched.join(',') } }
    ).then((res) => {
      setSparklineData((prev) => ({ ...prev, ...res.data }));
    }).catch(() => {
      // Allow retry on next expand
      unfetched.forEach((id) => fetchedSparklineAdSets.current.delete(id));
    });
  }, [isExpanded, adSets, setSparklineData]);

  // Fetch sparkline data for ads when adsets are expanded and ads are loaded
  useEffect(() => {
    if (!isExpanded) return;
    for (const adSet of adSets) {
      const ads = adSet.ads || [];
      if (!expandedAdSets.has(adSet.id) || ads.length === 0) continue;
      const adIds = ads.map((ad) => ad.id);
      const unfetched = adIds.filter((id) => !fetchedSparklineAds.current.has(id));
      if (unfetched.length === 0) continue;
      unfetched.forEach((id) => fetchedSparklineAds.current.add(id));

      apiClient<{ data: Record<string, SparklineDataPoint[]> }>(
        '/api/meta/sparkline',
        { params: { entityIds: unfetched.join(',') } }
      ).then((res) => {
        setSparklineData((prev) => ({ ...prev, ...res.data }));
      }).catch(() => {
        unfetched.forEach((id) => fetchedSparklineAds.current.delete(id));
      });
    }
  }, [isExpanded, adSets, expandedAdSets, setSparklineData]);

  // Track which adset/ad groups have already had activity data fetched
  const fetchedActivityAdSets = useRef<Set<string>>(new Set());
  const fetchedActivityAds = useRef<Set<string>>(new Set());

  // Activity data for adsets is already fetched at the top level (all account
  // activities). The initial batch fetch returns activities keyed by object_id,
  // which includes adset-level activities. No per-adset fetch needed.
  // We keep the ref to avoid future unnecessary re-fetches if we later add
  // incremental fetching.
  useEffect(() => {
    if (!isExpanded || adSets.length === 0) return;
    adSets.forEach((as) => fetchedActivityAdSets.current.add(as.id));
  }, [isExpanded, adSets]);

  // Activity data for ads is already fetched at the top level (all account
  // activities). The initial batch fetch returns activities keyed by object_id,
  // which includes ad-level activities. No per-ad fetch needed.
  useEffect(() => {
    if (!isExpanded) return;
    for (const adSet of adSets) {
      const ads = adSet.ads || [];
      if (!expandedAdSets.has(adSet.id) || ads.length === 0) continue;
      ads.forEach((ad) => fetchedActivityAds.current.add(ad.id));
    }
  }, [isExpanded, adSets, expandedAdSets]);

  return (
    <>
      <CampaignRow
        campaign={campaign}
        rowId={`campaign-row-${campaign.id}`}
        isHighlighted={highlightedRowId === `campaign-row-${campaign.id}`}
        issueCount={issueCount}
        onIssueClick={() => {
          if (campaignIssues.length > 0) onIssueClick(campaignIssues[0]);
        }}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpandCampaign}
        isSelected={selectedIds.has(campaign.id)}
        onToggleSelect={() => onToggleSelection(campaign.id)}
        onStatusChange={(status) => onCampaignStatusChange(campaign.id, status)}
        onBudgetChange={(budget) => onCampaignBudgetChange(campaign.id, budget)}
        columnOrder={columnOrder}
        sparklineData={sparklineData}
        activityData={activityData}
        activitiesFullyLoaded={activitiesFullyLoaded}
      />
      {isExpanded && loadingAdSets && (
        <tr className="border-b border-border bg-surface">
          <td colSpan={totalColumns} className="px-6 py-4 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading ad sets...
            </div>
          </td>
        </tr>
      )}
      {isExpanded && !loadingAdSets && errorAdSets && (
        <tr className="border-b border-border bg-surface">
          <td colSpan={totalColumns} className="px-6 py-4 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span>Could not load ad sets — Meta may be rate limiting requests.</span>
              <button
                onClick={onRetryAdSets}
                className="ml-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          </td>
        </tr>
      )}
      {isExpanded &&
        !loadingAdSets &&
        !errorAdSets &&
        adSets.length === 0 && (
          <tr className="border-b border-border bg-surface">
            <td colSpan={totalColumns} className="px-6 py-4 text-center text-sm text-text-dimmed">
              No ad sets found for this campaign.
            </td>
          </tr>
        )}
      {isExpanded &&
        adSets.map((adSet) => {
          const adSetExpanded = expandedAdSets.has(adSet.id);
          return (
            <AdSetGroup
              key={adSet.id}
              adSet={adSet}
              isExpanded={adSetExpanded}
              selectedIds={selectedIds}
              columnOrder={columnOrder}
              loadingAds={loadingAds.has(adSet.id)}
              errorAds={errorAds.has(adSet.id)}
              totalColumns={totalColumns}
              isCBO={isCBO}
              campaignBudget={campaignBudget}
              sparklineData={sparklineData}
              activityData={activityData}
              activitiesFullyLoaded={activitiesFullyLoaded}
              sortKey={sortKey}
              sortDirection={sortDirection}
              compareEntities={compareEntities}
              onToggleExpand={() => onToggleExpandAdSet(adSet.id)}
              onToggleSelection={onToggleSelection}
              onAdSetStatusChange={onAdSetStatusChange}
              onAdStatusChange={onAdStatusChange}
              onAdNameChange={onAdNameChange}
              onAdSetBudgetChange={onAdSetBudgetChange}
              onAdSetBidChange={onAdSetBidChange}
              onRetryAds={() => onRetryAds(adSet.id)}
              highlightedRowId={highlightedRowId}
              adSetIssues={adSetIssuesById.get(adSet.id) || []}
              adIssuesById={adIssuesById}
              onIssueClick={onIssueClick}
            />
          );
        })}
    </>
  );
}

// --- Internal grouping component for adset + ads ---
interface AdSetGroupProps {
  adSet: Campaign['adSets'][number];
  isExpanded: boolean;
  selectedIds: Set<string>;
  columnOrder: MetricKey[];
  loadingAds: boolean;
  errorAds: boolean;
  totalColumns: number;
  isCBO: boolean;
  campaignBudget?: number;
  sparklineData: Record<string, SparklineDataPoint[]>;
  activityData: Record<string, EntityAction[]>;
  activitiesFullyLoaded: boolean;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc' | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compareEntities: (a: any, b: any) => number;
  onToggleExpand: () => void;
  onToggleSelection: (id: string) => void;
  onAdSetStatusChange: (id: string, status: EntityStatus) => void;
  onAdStatusChange: (id: string, status: EntityStatus) => void;
  onAdNameChange: (id: string, name: string) => void;
  onAdSetBudgetChange: (id: string, budget: number) => void;
  onAdSetBidChange: (id: string, bid: number) => void;
  onRetryAds: () => void;
  highlightedRowId: string | null;
  adSetIssues: AdIssue[];
  adIssuesById: Map<string, AdIssue[]>;
  onIssueClick: (issue: AdIssue) => void;
}

function AdSetGroup({
  adSet,
  isExpanded,
  selectedIds,
  columnOrder,
  loadingAds,
  errorAds,
  totalColumns,
  isCBO,
  campaignBudget,
  sparklineData,
  activityData,
  activitiesFullyLoaded,
  sortKey,
  sortDirection,
  compareEntities,
  onToggleExpand,
  onToggleSelection,
  onAdSetStatusChange,
  onAdStatusChange,
  onAdNameChange,
  onAdSetBudgetChange,
  onAdSetBidChange,
  onRetryAds,
  highlightedRowId,
  adSetIssues,
  adIssuesById,
  onIssueClick,
}: AdSetGroupProps) {
  // Defensive: always ensure ads is an array, then sort
  const adsRaw = adSet.ads || [];
  const ads = useMemo(() => {
    if (!sortKey || !sortDirection) return adsRaw;
    return [...adsRaw].sort(compareEntities);
  }, [adsRaw, sortKey, sortDirection, compareEntities]);

  return (
    <>
      <AdSetRow
        adSet={adSet}
        rowId={`adset-row-${adSet.id}`}
        isHighlighted={highlightedRowId === `adset-row-${adSet.id}`}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
        isSelected={selectedIds.has(adSet.id)}
        onToggleSelect={() => onToggleSelection(adSet.id)}
        onStatusChange={(status) => onAdSetStatusChange(adSet.id, status)}
        onBudgetChange={(budget) => onAdSetBudgetChange(adSet.id, budget)}
        onBidChange={(bid) => onAdSetBidChange(adSet.id, bid)}
        columnOrder={columnOrder}
        isCBO={isCBO}
        campaignBudget={campaignBudget}
        sparklineData={sparklineData}
        activityData={activityData}
        activitiesFullyLoaded={activitiesFullyLoaded}
        issues={adSetIssues}
        onIssueClick={onIssueClick}
      />
      {isExpanded && loadingAds && (
        <tr className="border-b border-border bg-surface">
          <td colSpan={totalColumns} className="px-6 py-4 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading ads...
            </div>
          </td>
        </tr>
      )}
      {isExpanded && !loadingAds && errorAds && (
        <tr className="border-b border-border bg-surface">
          <td colSpan={totalColumns} className="px-6 py-4 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span>Could not load ads — Meta may be rate limiting requests.</span>
              <button
                onClick={onRetryAds}
                className="ml-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          </td>
        </tr>
      )}
      {isExpanded &&
        !loadingAds &&
        !errorAds &&
        ads.length === 0 && (
          <tr className="border-b border-border bg-surface">
            <td colSpan={totalColumns} className="px-6 py-4 text-center text-sm text-text-dimmed">
              No ads found for this ad set.
            </td>
          </tr>
        )}
      {isExpanded &&
        ads.map((ad) => (
          <AdRow
            key={ad.id}
            ad={ad}
            rowId={`ad-row-${ad.id}`}
            isHighlighted={highlightedRowId === `ad-row-${ad.id}`}
            isSelected={selectedIds.has(ad.id)}
            onToggleSelect={() => onToggleSelection(ad.id)}
            onStatusChange={(status) => onAdStatusChange(ad.id, status)}
            onNameChange={(name) => onAdNameChange(ad.id, name)}
            columnOrder={columnOrder}
            sparklineData={sparklineData}
            activityData={activityData}
            activitiesFullyLoaded={activitiesFullyLoaded}
            issues={adIssuesById.get(ad.id) || []}
            onIssueClick={onIssueClick}
          />
        ))}
    </>
  );
}
