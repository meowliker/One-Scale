'use client';

import { useMemo, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency, formatRoas, formatPercentage, formatNumber } from '@/lib/utils';
import type { CreativeCatalogItem, CreativeInsightsResult } from '@/services/metaAudit';
import type { Ad } from '@/types/campaign';
import { Modal } from '@/components/ui/Modal';
import { useStoreStore } from '@/stores/storeStore';
import toast from 'react-hot-toast';
import { Image, LayoutGrid, Ruler, Play, RefreshCw, AlertTriangle, Clock, Gauge, Zap, TrendingUp, RotateCcw, Eye, ArrowUpDown, Loader2 } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-surface-elevated border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-primary-light" />
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function roasClass(roas: number) {
  return roas >= 3.0 ? 'text-success' : roas >= 1.5 ? 'text-warning' : 'text-danger';
}

function fatigueColor(score: number) {
  if (score <= 30) return '#10b981';
  if (score <= 60) return '#f59e0b';
  return '#ef4444';
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    top_performer: 'bg-success/15 text-success border-success/20',
    average: 'bg-info/15 text-info border-info/20',
    underperformer: 'bg-danger/15 text-danger border-danger/20',
    fatigued: 'bg-warning/15 text-warning border-warning/20',
  };
  const labels: Record<string, string> = {
    top_performer: 'Top',
    average: 'Avg',
    underperformer: 'Low',
    fatigued: 'Fatigued',
  };
  return (
    <span className={cn('inline-block px-2 py-0.5 rounded border text-[10px] font-semibold uppercase', styles[status] || '')}>
      {labels[status] || status}
    </span>
  );
}

function deliveryBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes('delivering') || normalized === 'active') return 'bg-success/15 text-success border-success/20';
  if (normalized.includes('paused')) return 'bg-warning/15 text-warning border-warning/20';
  if (normalized.includes('review') || normalized.includes('issue')) return 'bg-info/15 text-info border-info/20';
  if (normalized.includes('delete') || normalized.includes('archive')) return 'bg-danger/15 text-danger border-danger/20';
  return 'bg-surface-hover text-text-secondary border-border';
}

const thumbnailColors = [
  '#7c5cfc', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
];

// ── Filter Badge ─────────────────────────────────────────────────────

function FilterBadge({ filterPreset }: { filterPreset?: string }) {
  if (!filterPreset || filterPreset === 'all') return null;
  const label = filterPreset === 'active' ? 'Active campaigns only' : 'Spending campaigns only';
  const color = filterPreset === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20';
  return (
    <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium', color)}>
      <div className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
      <span className="text-text-muted font-normal ml-1">(applied in production)</span>
    </div>
  );
}

function RefreshMetricCard({
  icon: Icon,
  label,
  value,
  subLabel,
  valueClassName,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subLabel: string;
  valueClassName?: string;
  hint: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative rounded-lg border border-border p-4 text-center transition-all',
        onClick ? 'cursor-pointer hover:border-cyan-300/40 hover:bg-cyan-500/5 hover:shadow-[0_0_22px_rgba(56,189,248,0.16)]' : 'cursor-default'
      )}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 z-20 w-60 -translate-x-1/2 -translate-y-2 opacity-0 transition-all duration-300 group-hover:-translate-y-[105%] group-hover:opacity-100">
        <div className="rounded-lg border border-cyan-300/40 bg-[#060b1f]/95 p-2 text-left shadow-[0_0_20px_rgba(34,211,238,0.18)]">
          <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200 mb-1">Jarvis Note</p>
          <p className="text-[11px] leading-relaxed text-cyan-100/90">{hint}</p>
        </div>
      </div>
      <Icon className="h-5 w-5 text-primary-light mx-auto mb-2" />
      <p className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={cn('text-2xl font-bold text-text-primary', valueClassName)}>{value}</p>
      <p className="text-xs text-text-secondary">{subLabel}</p>
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────

interface CreativeInsightsTabProps {
  data: CreativeInsightsResult;
  filterPreset?: string;
}

type SortKey = 'spend' | 'roas' | 'cpa' | 'ctr' | 'fatigueScore' | 'last7DayRoas' | 'daysActive';
type SortDirection = 'asc' | 'desc';
type RefreshFocus = 'refreshNow' | 'scaleReady' | 'killNow' | null;
type StatusControlItem = {
  adId: string;
  adName: string;
  adSetId?: string;
  adSetName?: string;
  canManageStatus?: boolean;
  canManageAdSetStatus?: boolean;
  manageEntity?: 'ad' | 'adset';
  metaConfiguredStatus?: string;
  metaDeliveryStatus?: string;
};

type AdSetReviewContext = {
  adSetId: string;
  adSetName: string;
  campaignName?: string;
  sourceLabel?: string;
};

type AdSetReviewRow = {
  adId: string;
  adName: string;
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  conversions: number;
  metaConfiguredStatus?: string;
  metaDeliveryStatus?: string;
  canManageStatus: boolean;
};

type AdSetReviewSortKey = 'adName' | 'spend' | 'roas' | 'cpa' | 'ctr' | 'conversions';

export function CreativeInsightsTab({ data, filterPreset }: CreativeInsightsTabProps) {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [showActionPlan, setShowActionPlan] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | 'Video' | 'Single Image'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'top_performer' | 'average' | 'underperformer' | 'fatigued'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedCreative, setSelectedCreative] = useState<CreativeCatalogItem | null>(null);
  const [previewIframeSrc, setPreviewIframeSrc] = useState<string | null>(null);
  const [previewFormatUsed, setPreviewFormatUsed] = useState<string | null>(null);
  const [previewSourceAd, setPreviewSourceAd] = useState<{ id: string; name: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [brokenMatrixThumbs, setBrokenMatrixThumbs] = useState<Record<string, boolean>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, { configured: string; delivery: string }>>({});
  const [statusActionLoading, setStatusActionLoading] = useState<Record<string, boolean>>({});
  const [refreshFocus, setRefreshFocus] = useState<RefreshFocus>(null);
  const [selectedAdSetReview, setSelectedAdSetReview] = useState<AdSetReviewContext | null>(null);
  const [adSetReviewRows, setAdSetReviewRows] = useState<AdSetReviewRow[]>([]);
  const [adSetReviewLoading, setAdSetReviewLoading] = useState(false);
  const [adSetReviewError, setAdSetReviewError] = useState<string | null>(null);
  const [adSetReviewSortKey, setAdSetReviewSortKey] = useState<AdSetReviewSortKey>('spend');
  const [adSetReviewSortDirection, setAdSetReviewSortDirection] = useState<SortDirection>('desc');
  const [selectedAdReviewIds, setSelectedAdReviewIds] = useState<Record<string, boolean>>({});
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const adFormatBreakdown = data.adFormatBreakdown ?? [];
  const creativePerformanceMatrix = data.creativePerformanceMatrix ?? [];
  const creativeCatalog = data.creativeCatalog ?? creativePerformanceMatrix.map((row) => ({
    adId: row.adId,
    adName: row.adName,
    campaignId: undefined,
    campaignName: undefined,
    adSetId: undefined,
    adSetName: undefined,
    format: row.format === 'Video' ? 'Video' : 'Single Image',
    thumbnail: row.thumbnail,
    spend: row.spend,
    roas: row.roas,
    cpa: row.cpa,
    ctr: row.ctr,
    conversions: Math.max(0, Math.round(row.cpa > 0 ? row.spend / row.cpa : 0)),
    frequency: row.frequency,
    fatigueScore: row.fatigueScore,
    status: row.status,
    daysActive: 0,
    last7DaySpend: 0,
    last7DayRoas: 0,
    metaConfiguredStatus: undefined,
    metaEffectiveStatus: undefined,
    metaDeliveryStatus: 'Unknown',
    canManageStatus: !row.adId.startsWith('adset_'),
    canManageAdSetStatus: false,
  }));
  const creativeSizeBreakdown = data.creativeSizeBreakdown ?? [];
  const hookRateByFormat = data.hookRateByFormat ?? [];
  const videoLengthPerformance = data.videoLengthPerformance ?? [];
  const underperformingCreatives = data.underperformingCreatives ?? [];
  const creativeRefreshData = data.creativeRefreshData ?? {
    avgCreativeAge: 0,
    adsOverFrequencyThreshold: 0,
    fatigueIndex: 0,
    recommendedRefreshCount: 0,
    medianDaysToUnprofitable: undefined,
    medianSpendToUnprofitable: undefined,
    underperformingCount: 0,
    scaleReadyCount: 0,
    monitorCount: 0,
  };
  const actionPlan = data.actionPlan ?? {
    generatedAt: '',
    scaleReady: [],
    refreshNow: [],
    killNow: [],
    monitor: [],
  };
  const creativesById = useMemo(() => new Map(creativeCatalog.map((item) => [item.adId, item])), [creativeCatalog]);
  const filteredCreatives = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    return creativeCatalog
      .filter((creative) => {
        if (formatFilter !== 'all' && creative.format !== formatFilter) return false;
        if (statusFilter !== 'all' && creative.status !== statusFilter) return false;
        if (!normalizedQuery) return true;
        return (
          creative.adName.toLowerCase().includes(normalizedQuery) ||
          creative.adId.toLowerCase().includes(normalizedQuery) ||
          (creative.campaignName || '').toLowerCase().includes(normalizedQuery) ||
          (creative.adSetName || '').toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        const aValue = a[sortKey];
        const bValue = b[sortKey];
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortDirection === 'desc' ? bValue - aValue : aValue - bValue;
        }
        return 0;
      });
  }, [creativeCatalog, formatFilter, searchTerm, sortDirection, sortKey, statusFilter]);
  const selectedFormatTop = useMemo(() => {
    if (!selectedFormat) return [];
    return creativeCatalog
      .filter((creative) => creative.format === selectedFormat)
      .sort((a, b) => b.roas - a.roas || b.spend - a.spend)
      .slice(0, 10);
  }, [creativeCatalog, selectedFormat]);
  const resolveMatrixThumbnail = (adId: string, matrixThumb?: string): string => {
    if (brokenMatrixThumbs[adId]) return '';
    const normalizedMatrixThumb = typeof matrixThumb === 'string' ? matrixThumb.trim() : '';
    if (normalizedMatrixThumb) return normalizedMatrixThumb;
    const catalogThumb = creativesById.get(adId)?.thumbnail;
    return typeof catalogThumb === 'string' ? catalogThumb.trim() : '';
  };
  const focusedActionRows = useMemo(() => {
    if (!refreshFocus) return [];
    const source = refreshFocus === 'refreshNow'
      ? actionPlan.refreshNow
      : refreshFocus === 'scaleReady'
      ? actionPlan.scaleReady
      : actionPlan.killNow ?? [];
    return source.map((item) => {
      const creative = creativesById.get(item.adId);
      return {
        ...item,
        campaignName: item.campaignName || creative?.campaignName || 'Unknown campaign',
        adSetId: item.adSetId || creative?.adSetId,
        adSetName: item.adSetName || creative?.adSetName || '-',
        last7DayRoas: creative?.last7DayRoas ?? 0,
        metaConfiguredStatus: item.metaConfiguredStatus || creative?.metaConfiguredStatus,
        metaEffectiveStatus: item.metaEffectiveStatus || creative?.metaEffectiveStatus,
        metaDeliveryStatus: item.metaDeliveryStatus || creative?.metaDeliveryStatus || 'Unknown',
        canManageStatus: typeof item.canManageStatus === 'boolean'
          ? item.canManageStatus
          : (typeof creative?.canManageStatus === 'boolean' ? creative.canManageStatus : !item.adId.startsWith('adset_')),
        canManageAdSetStatus: typeof (item as { canManageAdSetStatus?: boolean }).canManageAdSetStatus === 'boolean'
          ? (item as { canManageAdSetStatus?: boolean }).canManageAdSetStatus
          : !!(item.adSetId || creative?.adSetId),
        manageEntity: (item as { manageEntity?: 'ad' | 'adset' }).manageEntity || 'ad',
      };
    });
  }, [actionPlan.killNow, actionPlan.refreshNow, actionPlan.scaleReady, creativesById, refreshFocus]);
  const refreshFocusMeta = refreshFocus === 'refreshNow'
    ? { title: 'Recommended Refresh (Top 12)', subtitle: 'Click any creative to preview. Sorted by refresh urgency.' }
    : refreshFocus === 'scaleReady'
    ? { title: 'Scale Candidates (7D ROAS >= 1.3)', subtitle: 'Strong creatives for budget increase based on last 7-day performance.' }
    : refreshFocus === 'killNow'
    ? { title: 'Kill Candidates (7D ROAS <= 1.0)', subtitle: 'Weak creatives that should be paused unless there is a strategic reason to keep testing.' }
    : null;
  const handleSortFromHeader = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(key);
    setSortDirection('desc');
  };
  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '↕';
    return sortDirection === 'desc' ? '↓' : '↑';
  };

  const resolvedMetaConfiguredStatus = (adId: string, fallback?: string) =>
    statusOverrides[adId]?.configured || fallback || 'UNKNOWN';

  const resolvedMetaDeliveryStatus = (adId: string, deliveryFallback?: string, configuredFallback?: string) => {
    const override = statusOverrides[adId]?.delivery;
    if (override) return override;
    if (deliveryFallback) return deliveryFallback;
    const configured = resolvedMetaConfiguredStatus(adId, configuredFallback).toUpperCase();
    if (configured === 'ACTIVE') return 'Active';
    if (configured === 'PAUSED') return 'Paused';
    return 'Unknown';
  };

  const getStatusActionKey = (item: Pick<StatusControlItem, 'adId' | 'adSetId' | 'manageEntity'>) =>
    `${item.manageEntity || 'ad'}:${item.adId || `adset_${item.adSetId || 'unknown'}`}`;

  const canAttemptStatusAction = (item: StatusControlItem) => {
    if (!activeStoreId) return false;
    const scope = item.manageEntity || 'ad';
    if (scope === 'adset') {
      return !!(item.adSetId || item.adId.replace(/^adset_/, '')) && item.canManageAdSetStatus !== false;
    }
    return !!item.adId && item.canManageStatus !== false;
  };

  const fetchAdsForAdSet = async (adSetId: string): Promise<Ad[]> => {
    if (!activeStoreId) {
      throw new Error('Connect a Meta store first.');
    }
    const response = await fetch(
      `/api/meta/ads?storeId=${encodeURIComponent(activeStoreId)}&adsetId=${encodeURIComponent(adSetId)}&mode=audit`
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error === 'string'
        ? payload.error
        : 'Failed to resolve ads from this ad set.';
      throw new Error(message);
    }
    return Array.isArray(payload?.data) ? payload.data as Ad[] : [];
  };

  const resolveTargetAdForStatusAction = async (item: Pick<StatusControlItem, 'adId' | 'adSetId' | 'adName'>) => {
    if (!activeStoreId) {
      throw new Error('Connect a Meta store first.');
    }

    const isDirectAd = !!item.adId && !item.adId.startsWith('adset_');
    if (isDirectAd) {
      return { id: item.adId, name: item.adName };
    }

    const adSetId = item.adSetId || item.adId.replace(/^adset_/, '');
    if (!adSetId) {
      throw new Error('No ad set context found for this row.');
    }

    const ads = await fetchAdsForAdSet(adSetId);
    const candidate = ads
      .filter((ad) => !!ad?.id)
      .sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0))[0];

    if (!candidate) {
      throw new Error('No active ad found in this ad set to update.');
    }
    return { id: candidate.id, name: candidate.name || item.adName };
  };

  const applyStatusAction = async (
    item: StatusControlItem,
    nextStatus: 'ACTIVE' | 'PAUSED',
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!canAttemptStatusAction(item)) {
      if (!options?.silent) toast.error('Status update is unavailable for this row.');
      return false;
    }
    if (!activeStoreId) {
      if (!options?.silent) toast.error('Connect a Meta store first.');
      return false;
    }

    const loadingKey = getStatusActionKey(item);
    setStatusActionLoading((prev) => ({ ...prev, [loadingKey]: true }));
    try {
      const scope = item.manageEntity || 'ad';
      if (scope === 'adset') {
        const adSetId = item.adSetId || item.adId.replace(/^adset_/, '');
        if (!adSetId) {
          throw new Error('No ad set id found for this action.');
        }
        const response = await fetch(`/api/meta/adset-status?storeId=${encodeURIComponent(activeStoreId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adSetId, status: nextStatus }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = typeof payload?.error === 'string' ? payload.error : 'Failed to update ad set status.';
          throw new Error(message);
        }
        const delivery = nextStatus === 'PAUSED' ? 'Paused' : 'Delivering';
        const adsetKey = `adset_${adSetId}`;
        setStatusOverrides((prev) => ({
          ...prev,
          [adsetKey]: { configured: nextStatus, delivery },
          [item.adId]: { configured: nextStatus, delivery },
        }));
        if (!options?.silent) toast.success(`${item.adSetName || item.adName}: ad set ${nextStatus === 'PAUSED' ? 'turned off' : 'turned on'}`);
      } else {
        const targetAd = await resolveTargetAdForStatusAction(item);
        const response = await fetch(`/api/meta/ad-status?storeId=${encodeURIComponent(activeStoreId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adId: targetAd.id, status: nextStatus }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = typeof payload?.error === 'string' ? payload.error : 'Failed to update ad status.';
          throw new Error(message);
        }

        const delivery = nextStatus === 'PAUSED' ? 'Paused' : 'Delivering';
        setStatusOverrides((prev) => ({
          ...prev,
          [item.adId]: { configured: nextStatus, delivery },
          [targetAd.id]: { configured: nextStatus, delivery },
        }));
        if (!options?.silent) toast.success(`${targetAd.name}: ${nextStatus === 'PAUSED' ? 'turned off' : 'turned on'}`);
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update ad status.';
      if (!options?.silent) toast.error(message);
      return false;
    } finally {
      setStatusActionLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const normalizedStatusText = (status?: string) => {
    const value = (status || 'Unknown').replaceAll('_', ' ').trim();
    return value.length > 0 ? value : 'Unknown';
  };

  const renderStatusPill = (adId: string, deliveryFallback?: string, configuredFallback?: string) => {
    const deliveryStatus = normalizedStatusText(
      resolvedMetaDeliveryStatus(adId, deliveryFallback, configuredFallback)
    );
    return (
      <span className={cn('inline-block rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', deliveryBadgeClass(deliveryStatus))}>
        {deliveryStatus}
      </span>
    );
  };

  const renderStatusActionButton = (item: StatusControlItem, compact = false) => {
    if (!canAttemptStatusAction(item)) {
      return (
        <button
          type="button"
          disabled
          className={cn(
            'inline-flex items-center rounded-full border border-border bg-surface-hover px-1.5 py-1 opacity-70',
            compact ? 'h-5 w-10' : 'h-6 w-12'
          )}
        >
          <span className="inline-flex h-3.5 w-3.5 rounded-full bg-text-muted/50" />
        </button>
      );
    }

    const statusKey = item.manageEntity === 'adset' && item.adSetId ? `adset_${item.adSetId}` : item.adId;
    const currentConfigured = resolvedMetaConfiguredStatus(statusKey, item.metaConfiguredStatus).toUpperCase();
    const isCurrentlyActive = currentConfigured === 'ACTIVE';
    const nextStatus: 'ACTIVE' | 'PAUSED' = isCurrentlyActive ? 'PAUSED' : 'ACTIVE';
    const loading = !!statusActionLoading[getStatusActionKey(item)];
    const scopeLabel = item.manageEntity === 'adset' ? 'Ad set' : 'Ad';
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isCurrentlyActive}
        aria-label={isCurrentlyActive ? `${scopeLabel} is on. Click to turn off.` : `${scopeLabel} is off. Click to turn on.`}
        disabled={loading}
        onClick={() => void applyStatusAction(item, nextStatus)}
        className={cn(
          'relative inline-flex items-center rounded-full border px-1.5 py-1 transition-all',
          compact ? 'h-5 w-10' : 'h-6 w-12',
          isCurrentlyActive
            ? 'border-success/45 bg-success/25'
            : 'border-border bg-surface-hover',
          loading ? 'cursor-not-allowed opacity-70' : 'hover:opacity-90'
        )}
      >
        {loading ? (
          <Loader2 className="mx-auto h-3 w-3 animate-spin text-text-primary" />
        ) : (
          <span
            className={cn(
              'inline-flex rounded-full bg-white shadow-sm transition-transform',
              compact ? 'h-3.5 w-3.5' : 'h-4 w-4',
              isCurrentlyActive
                ? (compact ? 'translate-x-4' : 'translate-x-5')
                : 'translate-x-0'
            )}
          />
        )}
      </button>
    );
  };

  const renderActionControls = (item: StatusControlItem, compact = false) => {
    const adControl = renderStatusActionButton({
      ...item,
      manageEntity: 'ad',
    }, compact);

    const showAdSetControl = !!item.adSetId;
    if (!showAdSetControl) return adControl;

    return (
      <div className="inline-flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">Ad</span>
        {adControl}
        <span className="text-[10px] uppercase tracking-wide text-text-muted">Set</span>
        {renderStatusActionButton({
          ...item,
          adId: `adset_${item.adSetId}`,
          manageEntity: 'adset',
          canManageStatus: false,
          canManageAdSetStatus: item.canManageAdSetStatus !== false,
          metaConfiguredStatus: item.metaConfiguredStatus,
          metaDeliveryStatus: item.metaDeliveryStatus,
        }, compact)}
      </div>
    );
  };

  const renderScenarioActionControl = (item: StatusControlItem, compact = false) => {
    if (item.manageEntity === 'adset') {
      return renderStatusActionButton({
        ...item,
        adId: item.adSetId ? `adset_${item.adSetId}` : item.adId,
        canManageStatus: false,
        canManageAdSetStatus: item.canManageAdSetStatus !== false,
        manageEntity: 'adset',
      }, compact);
    }
    return renderActionControls(item, compact);
  };

  const openAdSetReview = async (
    item: Pick<StatusControlItem, 'adSetId' | 'adSetName' | 'adName'> & { campaignName?: string; sourceLabel?: string }
  ) => {
    const adSetId = item.adSetId;
    if (!adSetId) {
      toast.error('No ad set context found for this row.');
      return;
    }
    setSelectedAdSetReview({
      adSetId,
      adSetName: item.adSetName || item.adName || `Ad Set ${adSetId}`,
      campaignName: item.campaignName,
      sourceLabel: item.sourceLabel,
    });
    setAdSetReviewRows([]);
    setAdSetReviewError(null);
    setAdSetReviewLoading(true);
    setAdSetReviewSortKey('spend');
    setAdSetReviewSortDirection('desc');
    setSelectedAdReviewIds({});
    try {
      const ads = await fetchAdsForAdSet(adSetId);
      const mappedRows: AdSetReviewRow[] = ads
        .filter((ad) => !!ad?.id)
        .map((ad) => ({
          adId: ad.id,
          adName: ad.name || ad.id,
          spend: ad.metrics?.spend || 0,
          roas: ad.metrics?.roas || 0,
          cpa: ad.metrics?.cpa || 0,
          ctr: ad.metrics?.ctr || 0,
          conversions: ad.metrics?.conversions || 0,
          metaConfiguredStatus: ad.policyInfo?.configuredStatus || ad.status,
          metaDeliveryStatus: ad.policyInfo?.effectiveStatus || ad.status || 'Unknown',
          canManageStatus: true,
        }))
        .sort((a, b) => b.spend - a.spend);
      setAdSetReviewRows(mappedRows);
      if (mappedRows.length === 0) {
        setAdSetReviewError('No ads found in this ad set for the current store/date snapshot.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load ad set ads.';
      setAdSetReviewError(message);
    } finally {
      setAdSetReviewLoading(false);
    }
  };

  const adSetReviewSummary = useMemo(() => {
    if (adSetReviewRows.length === 0) {
      return { totalSpend: 0, totalConversions: 0, blendedRoas: 0, blendedCpa: 0, activeAds: 0, lowRoasAds: 0, noSpendAds: 0 };
    }
    const totals = adSetReviewRows.reduce(
      (acc, row) => {
        const revenue = row.spend * row.roas;
        acc.totalSpend += row.spend;
        acc.totalRevenue += revenue;
        acc.totalConversions += row.conversions;
        const configuredStatus = (statusOverrides[row.adId]?.configured || row.metaConfiguredStatus || 'UNKNOWN').toUpperCase();
        if (configuredStatus === 'ACTIVE') acc.activeAds += 1;
        if (row.roas <= 1.0 && row.spend >= 20) acc.lowRoasAds += 1;
        if (row.spend < 5) acc.noSpendAds += 1;
        return acc;
      },
      { totalSpend: 0, totalRevenue: 0, totalConversions: 0, activeAds: 0, lowRoasAds: 0, noSpendAds: 0 }
    );
    return {
      totalSpend: totals.totalSpend,
      totalConversions: totals.totalConversions,
      blendedRoas: totals.totalSpend > 0 ? totals.totalRevenue / totals.totalSpend : 0,
      blendedCpa: totals.totalConversions > 0 ? totals.totalSpend / totals.totalConversions : 0,
      activeAds: totals.activeAds,
      lowRoasAds: totals.lowRoasAds,
      noSpendAds: totals.noSpendAds,
    };
  }, [adSetReviewRows, statusOverrides]);

  const sortedAdSetReviewRows = useMemo(() => {
    const rows = [...adSetReviewRows];
    rows.sort((a, b) => {
      if (adSetReviewSortKey === 'adName') {
        const compare = a.adName.localeCompare(b.adName);
        return adSetReviewSortDirection === 'asc' ? compare : -compare;
      }
      const aValue = a[adSetReviewSortKey];
      const bValue = b[adSetReviewSortKey];
      const diff = (aValue as number) - (bValue as number);
      return adSetReviewSortDirection === 'asc' ? diff : -diff;
    });
    return rows;
  }, [adSetReviewRows, adSetReviewSortDirection, adSetReviewSortKey]);

  const adSetSortIndicator = (key: AdSetReviewSortKey) => {
    if (adSetReviewSortKey !== key) return '↕';
    return adSetReviewSortDirection === 'desc' ? '↓' : '↑';
  };

  const handleAdSetSort = (key: AdSetReviewSortKey) => {
    if (adSetReviewSortKey === key) {
      setAdSetReviewSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setAdSetReviewSortKey(key);
    setAdSetReviewSortDirection(key === 'adName' ? 'asc' : 'desc');
  };

  const selectedAdReviewCount = useMemo(
    () => Object.values(selectedAdReviewIds).filter(Boolean).length,
    [selectedAdReviewIds]
  );

  const toggleAdReviewSelection = (adId: string, checked: boolean) => {
    setSelectedAdReviewIds((prev) => ({ ...prev, [adId]: checked }));
  };

  const toggleSelectAllAdReviews = (checked: boolean) => {
    if (!checked) {
      setSelectedAdReviewIds({});
      return;
    }
    const allSelected = sortedAdSetReviewRows.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.adId] = true;
      return acc;
    }, {});
    setSelectedAdReviewIds(allSelected);
  };

  const applyBulkAdReviewStatus = async (nextStatus: 'ACTIVE' | 'PAUSED') => {
    if (!selectedAdSetReview) return;
    const selectedRows = sortedAdSetReviewRows.filter((row) => selectedAdReviewIds[row.adId]);
    if (selectedRows.length === 0) {
      toast.error('Select at least one ad for bulk update.');
      return;
    }
    setBulkActionLoading(true);
    try {
      const results = await Promise.all(
        selectedRows.map((row) =>
          applyStatusAction({
            adId: row.adId,
            adName: row.adName,
            adSetId: selectedAdSetReview.adSetId,
            adSetName: selectedAdSetReview.adSetName,
            canManageStatus: row.canManageStatus,
            canManageAdSetStatus: true,
            manageEntity: 'ad',
            metaConfiguredStatus: row.metaConfiguredStatus,
            metaDeliveryStatus: row.metaDeliveryStatus,
          }, nextStatus, { silent: true })
        )
      );
      const successCount = results.filter(Boolean).length;
      const failCount = results.length - successCount;
      if (successCount > 0) {
        toast.success(`${successCount} ad${successCount > 1 ? 's' : ''} ${nextStatus === 'PAUSED' ? 'turned off' : 'turned on'}.`);
      }
      if (failCount > 0) {
        toast.error(`${failCount} update${failCount > 1 ? 's' : ''} failed. Try again.`);
      }
      setSelectedAdReviewIds({});
    } finally {
      setBulkActionLoading(false);
    }
  };

  const openCreativePreview = async (creative: CreativeCatalogItem) => {
    setSelectedCreative(creative);
    setPreviewIframeSrc(null);
    setPreviewFormatUsed(null);
    setPreviewSourceAd(null);
    setPreviewError(null);
    if (!activeStoreId) {
      setPreviewError('Connect a Meta store to load a live creative preview.');
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    try {
      let previewAdId = creative.adId;
      if (creative.adId.startsWith('adset_')) {
        const adsetId = creative.adSetId || creative.adId.replace(/^adset_/, '');
        const ads = await fetchAdsForAdSet(adsetId);
        const rankedAds = ads
          .filter((ad) => !!ad?.id)
          .sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0));
        const candidate = rankedAds[0];
        if (!candidate) {
          setPreviewError('No ads found in this ad set for live preview.');
          return;
        }
        previewAdId = candidate.id;
        setPreviewSourceAd({ id: candidate.id, name: candidate.name || 'Ad' });
        if (!creative.thumbnail && candidate.creative?.thumbnailUrl) {
          setSelectedCreative((prev) => prev ? { ...prev, thumbnail: candidate.creative.thumbnailUrl } : prev);
        }
      }

      const response = await fetch(
        `/api/meta/ad-preview?storeId=${encodeURIComponent(activeStoreId)}&adId=${encodeURIComponent(previewAdId)}&adFormat=MOBILE_FEED_STANDARD`
      );
      const payload = await response.json();
      if (!response.ok) {
        setPreviewError(typeof payload?.error === 'string' ? payload.error : 'Preview unavailable');
        return;
      }
      setPreviewIframeSrc(typeof payload?.iframeSrc === 'string' && payload.iframeSrc ? payload.iframeSrc : null);
      setPreviewFormatUsed(typeof payload?.adFormatUsed === 'string' && payload.adFormatUsed ? payload.adFormatUsed : null);
      if (!payload?.iframeSrc) {
        setPreviewError('Meta preview unavailable for this creative. Showing thumbnail when possible.');
      }
    } catch {
      setPreviewError('Failed to load creative preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const hasAnyCreativeData =
    adFormatBreakdown.length > 0 ||
    creativePerformanceMatrix.length > 0 ||
    creativeCatalog.length > 0 ||
    creativeSizeBreakdown.length > 0 ||
    hookRateByFormat.length > 0 ||
    videoLengthPerformance.length > 0 ||
    underperformingCreatives.length > 0;

  if (!hasAnyCreativeData) {
    return (
      <div className="space-y-4">
        <FilterBadge filterPreset={filterPreset} />
        <div className="rounded-xl border border-border bg-surface-elevated p-8 text-center">
          <p className="text-sm text-text-secondary">
            No creative-level data found for this date range/filter yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FilterBadge filterPreset={filterPreset} />
      {/* ── Ad Format Breakdown (Donut + Table) ─────────── */}
      <SectionCard title="Ad Format Breakdown" icon={Image}>
        <div className="flex flex-col lg:flex-row gap-6 items-center">
          <div className="w-56 h-56 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={adFormatBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="spend"
                  nameKey="format"
                  stroke="none"
                >
                  {adFormatBreakdown.map((entry) => (
                    <Cell key={entry.format} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-xl">
                        <p className="text-xs text-text-muted">{d.format}</p>
                        <p className="text-sm font-medium text-text-primary">{formatCurrency(d.spend)} ({d.spendPct}%)</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 overflow-x-auto w-full">
            <table className="dark-table w-full text-left">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs">Format</th>
                  <th className="px-3 py-2 text-right text-xs">Ads</th>
                  <th className="px-3 py-2 text-right text-xs">Spend</th>
                  <th className="px-3 py-2 text-right text-xs">ROAS</th>
                  <th className="px-3 py-2 text-right text-xs">CPA</th>
                  <th className="px-3 py-2 text-right text-xs">CTR</th>
                  <th className="px-3 py-2 text-right text-xs">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {adFormatBreakdown.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm text-text-muted text-center" colSpan={7}>
                      No ad format breakdown data available.
                    </td>
                  </tr>
                ) : adFormatBreakdown.map((f) => (
                  <tr
                    key={f.format}
                    onClick={() => setSelectedFormat((prev) => (prev === f.format ? null : f.format))}
                    className={cn('cursor-pointer', selectedFormat === f.format && 'bg-primary/5')}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: f.color }} />
                        <span className="text-sm font-medium text-text-primary">{f.format}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{f.ads}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium text-text-primary">{formatCurrency(f.spend)}</td>
                    <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(f.roas))}>{formatRoas(f.roas)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(f.cpa)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(f.ctr)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatNumber(f.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      {selectedFormat && (
        <SectionCard title={`${selectedFormat} Top Performers (Click to Preview)`} icon={Eye}>
          <div className="mb-3 text-xs text-text-muted">
            Showing top 10 by ROAS. Scroll for the full list.
          </div>
          <div className="max-h-[430px] overflow-y-auto rounded-lg border border-border">
            <table className="dark-table w-full text-left">
              <thead className="sticky top-0 bg-surface-elevated z-10">
                <tr>
                  <th className="px-3 py-2 text-xs">Creative</th>
                  <th className="px-3 py-2 text-right text-xs">Spend</th>
                  <th className="px-3 py-2 text-right text-xs">ROAS</th>
                  <th className="px-3 py-2 text-right text-xs">CPA</th>
                  <th className="px-3 py-2 text-right text-xs">CTR</th>
                  <th className="px-3 py-2 text-right text-xs">7D ROAS</th>
                  <th className="px-3 py-2 text-right text-xs">Fatigue</th>
                </tr>
              </thead>
              <tbody>
                {selectedFormatTop.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-sm text-text-muted" colSpan={7}>
                      No creatives found for this format.
                    </td>
                  </tr>
                ) : selectedFormatTop.map((item) => (
                  <tr key={item.adId} className="cursor-pointer hover:bg-surface-hover" onClick={() => void openCreativePreview(item)}>
                    <td className="px-3 py-2 text-sm text-text-primary max-w-[260px] truncate" title={item.adName}>
                      {item.adName}
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(item.spend)}</td>
                    <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(item.roas))}>{formatRoas(item.roas)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatCurrency(item.cpa)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(item.ctr)}</td>
                    <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(item.last7DayRoas))}>{formatRoas(item.last7DayRoas)}</td>
                    <td className="px-3 py-2 text-right text-sm" style={{ color: fatigueColor(item.fatigueScore) }}>{item.fatigueScore}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── Creative Performance Matrix (Card Grid) ─────── */}
      <SectionCard title="Creative Performance Matrix (Top 10)" icon={LayoutGrid}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {creativePerformanceMatrix.length === 0 ? (
            <div className="col-span-full rounded-lg border border-border p-6 text-sm text-text-muted text-center">
              No creative matrix data available.
            </div>
          ) : creativePerformanceMatrix.map((c, idx) => (
            <div
              key={c.adId}
              className="border border-border rounded-lg p-3 hover:border-border-light transition-colors cursor-pointer"
              onClick={() => {
                const resolved = creativesById.get(c.adId);
                if (resolved) {
                  void openCreativePreview(resolved);
                  return;
                }
                void openCreativePreview({
                  adId: c.adId,
                  adName: c.adName,
                  campaignId: undefined,
                  campaignName: undefined,
                  adSetId: undefined,
                  adSetName: undefined,
                  format: c.format === 'Video' ? 'Video' : 'Single Image',
                  thumbnail: c.thumbnail,
                  spend: c.spend,
                  roas: c.roas,
                  cpa: c.cpa,
                  ctr: c.ctr,
                  conversions: Math.max(0, Math.round(c.cpa > 0 ? c.spend / c.cpa : 0)),
                  frequency: c.frequency,
                  fatigueScore: c.fatigueScore,
                  status: c.status,
                  daysActive: 0,
                  last7DaySpend: 0,
                  last7DayRoas: 0,
                  metaConfiguredStatus: undefined,
                  metaEffectiveStatus: undefined,
                  metaDeliveryStatus: 'Unknown',
                  canManageStatus: !c.adId.startsWith('adset_'),
                });
              }}
            >
              {resolveMatrixThumbnail(c.adId, c.thumbnail) ? (
                <div className="relative w-full h-20 rounded-md mb-2 overflow-hidden border border-border/50 bg-black">
                  <img
                    src={resolveMatrixThumbnail(c.adId, c.thumbnail)}
                    alt={c.adName}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={() => {
                      setBrokenMatrixThumbs((prev) => (prev[c.adId] ? prev : { ...prev, [c.adId]: true }));
                    }}
                  />
                  {c.format === 'Video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                      <div className="rounded-full bg-black/60 p-1.5 border border-white/25">
                        <Play className="h-3.5 w-3.5 text-white fill-white" />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="w-full h-20 rounded-md mb-2 flex items-center justify-center"
                  style={{ background: `${thumbnailColors[idx % thumbnailColors.length]}22` }}
                >
                  <span className="text-xs font-medium" style={{ color: thumbnailColors[idx % thumbnailColors.length] }}>
                    {c.format}
                  </span>
                </div>
              )}

              <p className="text-xs font-medium text-text-primary truncate mb-1" title={c.adName}>{c.adName}</p>

              <div className="flex items-center justify-between mb-2">
                <span className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary-light text-[10px] font-medium">{c.format}</span>
                {statusBadge(c.status)}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mb-2">
                <div className="flex justify-between">
                  <span className="text-text-muted">Spend</span>
                  <span className="text-text-primary font-medium">{formatCurrency(c.spend)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">ROAS</span>
                  <span className={cn('font-semibold', roasClass(c.roas))}>{formatRoas(c.roas)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">CPA</span>
                  <span className="text-text-primary font-medium">{formatCurrency(c.cpa)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">CTR</span>
                  <span className="text-text-primary font-medium">{formatPercentage(c.ctr)}</span>
                </div>
              </div>

              {/* Fatigue bar */}
              <div>
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-text-muted">Fatigue</span>
                  <span className="font-medium" style={{ color: fatigueColor(c.fatigueScore) }}>{c.fatigueScore}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-border">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${c.fatigueScore}%`, background: fatigueColor(c.fatigueScore) }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Creative Library (Filter + Sort + Preview)" icon={ArrowUpDown}>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-4">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by creative, campaign, ad set, or ad id"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none ring-0 focus:border-primary/40"
          />
          <select
            value={formatFilter}
            onChange={(event) => setFormatFilter(event.target.value as 'all' | 'Video' | 'Single Image')}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none ring-0 focus:border-primary/40"
          >
            <option value="all">All Formats</option>
            <option value="Video">Video</option>
            <option value="Single Image">Single Image</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | 'top_performer' | 'average' | 'underperformer' | 'fatigued')}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none ring-0 focus:border-primary/40"
          >
            <option value="all">All Status</option>
            <option value="top_performer">Top Performer</option>
            <option value="average">Average</option>
            <option value="underperformer">Underperformer</option>
            <option value="fatigued">Fatigued</option>
          </select>
          <div className="flex gap-2">
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none ring-0 focus:border-primary/40"
            >
              <option value="spend">Sort: Spend</option>
              <option value="roas">Sort: ROAS</option>
              <option value="last7DayRoas">Sort: 7D ROAS</option>
              <option value="cpa">Sort: CPA</option>
              <option value="ctr">Sort: CTR</option>
              <option value="fatigueScore">Sort: Fatigue</option>
              <option value="daysActive">Sort: Days Active</option>
            </select>
            <button
              onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="rounded-md border border-border px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
            >
              {sortDirection === 'desc' ? 'Desc' : 'Asc'}
            </button>
          </div>
        </div>

        <div className="max-h-[460px] overflow-y-auto rounded-lg border border-border">
          <table className="dark-table w-full text-left">
            <thead className="sticky top-0 bg-surface-elevated z-10">
              <tr>
                <th className="px-3 py-2 text-xs">Creative</th>
                <th className="px-3 py-2 text-xs">Campaign</th>
                <th className="px-3 py-2 text-xs">Ad Set</th>
                <th className="px-3 py-2 text-xs">Format</th>
                <th className="px-3 py-2 text-right text-xs">
                  <button type="button" onClick={() => handleSortFromHeader('spend')} className="ml-auto inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                    Spend <span className="text-[10px]">{sortIndicator('spend')}</span>
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs">
                  <button type="button" onClick={() => handleSortFromHeader('roas')} className="ml-auto inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                    ROAS <span className="text-[10px]">{sortIndicator('roas')}</span>
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs">
                  <button type="button" onClick={() => handleSortFromHeader('last7DayRoas')} className="ml-auto inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                    7D ROAS <span className="text-[10px]">{sortIndicator('last7DayRoas')}</span>
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs">
                  <button type="button" onClick={() => handleSortFromHeader('cpa')} className="ml-auto inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                    CPA <span className="text-[10px]">{sortIndicator('cpa')}</span>
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs">
                  <button type="button" onClick={() => handleSortFromHeader('ctr')} className="ml-auto inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                    CTR <span className="text-[10px]">{sortIndicator('ctr')}</span>
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs">
                  <button type="button" onClick={() => handleSortFromHeader('daysActive')} className="ml-auto inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                    Days <span className="text-[10px]">{sortIndicator('daysActive')}</span>
                  </button>
                </th>
                <th className="px-3 py-2 text-right text-xs">
                  <button type="button" onClick={() => handleSortFromHeader('fatigueScore')} className="ml-auto inline-flex items-center gap-1 text-text-secondary hover:text-text-primary">
                    Fatigue <span className="text-[10px]">{sortIndicator('fatigueScore')}</span>
                  </button>
                </th>
                <th className="px-3 py-2 text-xs">Delivery</th>
                <th className="px-3 py-2 text-right text-xs">Action</th>
                <th className="px-3 py-2 text-right text-xs">Preview</th>
              </tr>
            </thead>
            <tbody>
              {filteredCreatives.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-text-muted" colSpan={14}>
                    No creatives match the selected filters.
                  </td>
                </tr>
              ) : filteredCreatives.map((creative) => (
                <tr key={`${creative.adId}_library`} className="hover:bg-surface-hover">
                  <td className="px-3 py-2 text-sm text-text-primary max-w-[320px] truncate" title={creative.adName}>
                    {creative.adName}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-secondary max-w-[240px] truncate" title={creative.campaignName || creative.adSetName || '-'}>
                    {creative.campaignName || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-secondary max-w-[220px] truncate" title={creative.adSetName || '-'}>
                    {creative.adSetName || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-secondary">{creative.format}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(creative.spend)}</td>
                  <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(creative.roas))}>{formatRoas(creative.roas)}</td>
                  <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(creative.last7DayRoas))}>{formatRoas(creative.last7DayRoas)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatCurrency(creative.cpa)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(creative.ctr)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{creative.daysActive}</td>
                  <td className="px-3 py-2 text-right text-sm" style={{ color: fatigueColor(creative.fatigueScore) }}>{creative.fatigueScore}%</td>
                  <td className="px-3 py-2 text-xs">
                    {renderStatusPill(creative.adId, creative.metaDeliveryStatus, creative.metaConfiguredStatus)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {creative.adSetId && (
                        <button
                          type="button"
                          onClick={() => void openAdSetReview({
                            adSetId: creative.adSetId,
                            adSetName: creative.adSetName,
                            campaignName: creative.campaignName,
                            sourceLabel: 'Creative Library',
                            adName: creative.adName,
                          })}
                          className="inline-flex items-center gap-1 rounded-md border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-400/10"
                        >
                          <LayoutGrid className="h-3 w-3" />
                          Review Set
                        </button>
                      )}
                      {renderActionControls({
                        adId: creative.adId,
                        adName: creative.adName,
                        adSetId: creative.adSetId,
                        adSetName: creative.adSetName,
                        canManageStatus: creative.canManageStatus,
                        canManageAdSetStatus: creative.canManageAdSetStatus,
                        metaConfiguredStatus: creative.metaConfiguredStatus,
                        metaDeliveryStatus: creative.metaDeliveryStatus,
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => void openCreativePreview(creative)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover"
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Creative Size Performance ───────────────────── */}
      <SectionCard title="Creative Size Performance" icon={Ruler}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3 text-right">Ads</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {creativeSizeBreakdown.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-text-muted text-center" colSpan={5}>
                    No creative size performance data available.
                  </td>
                </tr>
              ) : creativeSizeBreakdown.map((s) => (
                <tr key={s.size}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary font-mono">{s.size}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{s.ads}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(s.spend)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(s.roas))}>{formatRoas(s.roas)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatPercentage(s.ctr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Video Hook Rates ────────────────────────────── */}
      <SectionCard title="Video Hook / Hold / Completion Rates" icon={Play}>
        <div className="h-64 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hookRateByFormat} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232740" />
              <XAxis dataKey="format" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={45} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-xl">
                      <p className="text-xs text-text-muted mb-1">{label}</p>
                      {payload.map((p) => (
                        <p key={p.name} className="text-xs text-text-primary">
                          <span style={{ color: p.color }}>{p.name}</span>: {p.value}%
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#94a3b8' }}
              />
              <Bar dataKey="hookRate" name="Hook Rate" fill="#7c5cfc" radius={[2, 2, 0, 0]} />
              <Bar dataKey="holdRate" name="Hold Rate" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="completionRate" name="Completion" fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {hookRateByFormat.length === 0 && (
          <div className="text-sm text-text-muted text-center">
            No video hook-rate data available for this range.
          </div>
        )}
      </SectionCard>

      {/* ── Creative Refresh Health ─────────────────────── */}
      <SectionCard title="Creative Refresh Health" icon={RefreshCw}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <RefreshMetricCard
            icon={Clock}
            label="Avg Creative Age"
            value={creativeRefreshData.avgCreativeAge}
            subLabel="days"
            hint="Average number of active days for creatives in this view."
          />
          <RefreshMetricCard
            icon={AlertTriangle}
            label="Over Freq. Threshold"
            value={creativeRefreshData.adsOverFrequencyThreshold}
            valueClassName="text-warning"
            subLabel="ads"
            hint="Creatives with frequency above 4.0, which often signals fatigue risk."
          />
          <RefreshMetricCard
            icon={Gauge}
            label="Fatigue Index"
            value={creativeRefreshData.fatigueIndex}
            valueClassName="text-chart-purple"
            subLabel="0-100 score"
            hint="Composite fatigue score combining frequency pressure and weak efficiency trend."
          />
          <RefreshMetricCard
            icon={RefreshCw}
            label="Recommended Refreshes"
            value={creativeRefreshData.recommendedRefreshCount}
            valueClassName="text-success"
            subLabel="click to inspect"
            hint="Creatives needing refresh now due to fatigue or low ROAS trajectory."
            onClick={() => setRefreshFocus((prev) => (prev === 'refreshNow' ? null : 'refreshNow'))}
          />
          <RefreshMetricCard
            icon={AlertTriangle}
            label="Median Drop Day"
            value={creativeRefreshData.medianDaysToUnprofitable ?? '-'}
            valueClassName="text-danger"
            subLabel={`days to <${creativeRefreshData.targetRoas ?? 1.3} ROAS`}
            hint="Median day when creative performance drops below target ROAS."
          />
          <RefreshMetricCard
            icon={Gauge}
            label="Median Drop Spend"
            value={creativeRefreshData.medianSpendToUnprofitable != null ? formatCurrency(creativeRefreshData.medianSpendToUnprofitable) : '-'}
            valueClassName="text-warning"
            subLabel={`before <${creativeRefreshData.targetRoas ?? 1.3} ROAS`}
            hint="Median cumulative spend before a creative drops below target ROAS."
          />
          <RefreshMetricCard
            icon={Clock}
            label={`Avg Days >= ${creativeRefreshData.targetRoas ?? 1.3}`}
            value={creativeRefreshData.avgDaysAboveTargetRoas ?? '-'}
            valueClassName="text-info"
            subLabel="days"
            hint="Average number of days creatives stay at or above target ROAS."
          />
          <RefreshMetricCard
            icon={Gauge}
            label="Avg Spend Before Drop"
            value={creativeRefreshData.avgSpendBeforeDrop != null ? formatCurrency(creativeRefreshData.avgSpendBeforeDrop) : '-'}
            valueClassName="text-info"
            subLabel="account baseline"
            hint="Average spend level where creatives usually fall below target ROAS."
          />
          <RefreshMetricCard
            icon={TrendingUp}
            label="Scale Candidates"
            value={creativeRefreshData.scaleReadyCount ?? 0}
            valueClassName="text-success"
            subLabel="click to inspect"
            hint="Creatives with last 7-day ROAS >= 1.3 and stable fatigue/frequency."
            onClick={() => setRefreshFocus((prev) => (prev === 'scaleReady' ? null : 'scaleReady'))}
          />
          <RefreshMetricCard
            icon={RotateCcw}
            label="Kill Candidates"
            value={creativeRefreshData.killNowCount ?? 0}
            valueClassName="text-danger"
            subLabel="click to inspect"
            hint="Creatives with last 7-day ROAS <= 1.0 and meaningful spend."
            onClick={() => setRefreshFocus((prev) => (prev === 'killNow' ? null : 'killNow'))}
          />
        </div>

        {refreshFocus && (
          <div className="mt-4 rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-transparent p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">{refreshFocusMeta?.title}</p>
                <p className="text-xs text-cyan-100/80 mt-1">{refreshFocusMeta?.subtitle}</p>
              </div>
              <button
                onClick={() => setRefreshFocus(null)}
                className="rounded-md border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-300/10"
              >
                Close
              </button>
            </div>

            <div className="max-h-[280px] overflow-y-auto rounded-lg border border-border">
              <table className="dark-table w-full text-left">
                <thead className="sticky top-0 bg-surface-elevated z-10">
                  <tr>
                    <th className="px-3 py-2 text-xs">Creative</th>
                    <th className="px-3 py-2 text-xs">Campaign</th>
                    <th className="px-3 py-2 text-xs">Ad Set</th>
                    <th className="px-3 py-2 text-right text-xs">Spend</th>
                    <th className="px-3 py-2 text-right text-xs">ROAS</th>
                    <th className="px-3 py-2 text-right text-xs">7D ROAS</th>
                    <th className="px-3 py-2 text-right text-xs">Fatigue</th>
                    <th className="px-3 py-2 text-xs">Scope</th>
                    <th className="px-3 py-2 text-xs">Delivery</th>
                    <th className="px-3 py-2 text-right text-xs">Action</th>
                    <th className="px-3 py-2 text-right text-xs">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {focusedActionRows.length === 0 ? (
                    <tr>
                      <td className="px-3 py-6 text-center text-sm text-text-muted" colSpan={11}>
                        No creatives in this bucket right now.
                      </td>
                    </tr>
                  ) : focusedActionRows.slice(0, 12).map((row) => {
                    const creative = creativesById.get(row.adId);
                    return (
                      <tr key={`${refreshFocus}_${row.adId}`} className="hover:bg-surface-hover">
                        <td className="px-3 py-2 text-sm text-text-primary max-w-[280px] truncate" title={row.adName}>{row.adName}</td>
                        <td className="px-3 py-2 text-xs text-text-secondary max-w-[220px] truncate" title={row.campaignName}>{row.campaignName}</td>
                        <td className="px-3 py-2 text-xs text-text-secondary max-w-[220px] truncate" title={row.adSetName}>{row.adSetName}</td>
                        <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(row.spend)}</td>
                        <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(row.roas))}>{formatRoas(row.roas)}</td>
                        <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(row.last7DayRoas))}>{formatRoas(row.last7DayRoas)}</td>
                        <td className="px-3 py-2 text-right text-sm" style={{ color: fatigueColor(row.fatigueScore) }}>{row.fatigueScore}%</td>
                        <td className="px-3 py-2 text-xs text-text-secondary">
                          {((row as { manageEntity?: 'ad' | 'adset' }).manageEntity || 'ad') === 'adset' ? 'Ad Set' : 'Ad'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {renderStatusPill(row.adId, row.metaDeliveryStatus, row.metaConfiguredStatus)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {renderScenarioActionControl({
                            adId: row.adId,
                            adName: row.adName,
                            adSetId: row.adSetId,
                            adSetName: row.adSetName,
                            canManageStatus: row.canManageStatus,
                            canManageAdSetStatus: (row as { canManageAdSetStatus?: boolean }).canManageAdSetStatus,
                            manageEntity: (row as { manageEntity?: 'ad' | 'adset' }).manageEntity,
                            metaConfiguredStatus: row.metaConfiguredStatus,
                            metaDeliveryStatus: row.metaDeliveryStatus,
                          })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!creative ? (
                            <span className="text-xs text-text-muted">-</span>
                          ) : (
                            <button
                              onClick={() => void openCreativePreview(creative)}
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-hover"
                            >
                              <Eye className="h-3 w-3" />
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Video Length Performance" icon={Play}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Length</th>
                <th className="px-4 py-3 text-right">Creatives</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CTR</th>
                <th className="px-4 py-3 text-right">Conversions</th>
              </tr>
            </thead>
            <tbody>
              {videoLengthPerformance.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-text-muted text-center" colSpan={6}>
                    No video length data available.
                  </td>
                </tr>
              ) : videoLengthPerformance.map((row) => (
                <tr key={row.range}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.range}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{row.creatives}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(row.spend)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(row.roas))}>{formatRoas(row.roas)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatPercentage(row.ctr)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(row.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title={`ROAS Drop Analysis (<${creativeRefreshData.targetRoas ?? 1.3})`} icon={AlertTriangle}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs">Creative</th>
                <th className="px-3 py-2 text-right text-xs">Spend</th>
                <th className="px-3 py-2 text-right text-xs">ROAS</th>
                <th className="px-3 py-2 text-right text-xs">Days Active</th>
                <th className="px-3 py-2 text-right text-xs">Good Days</th>
                <th className="px-3 py-2 text-right text-xs">Drop Day</th>
                <th className="px-3 py-2 text-right text-xs">Spend @ Drop</th>
                <th className="px-3 py-2 text-right text-xs">Fatigue</th>
              </tr>
            </thead>
            <tbody>
              {underperformingCreatives.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-sm text-text-muted text-center" colSpan={8}>
                    No creatives below {creativeRefreshData.targetRoas ?? 1.3} ROAS in the current analyzed window.
                  </td>
                </tr>
              ) : underperformingCreatives.map((row) => (
                <tr key={row.adId}>
                  <td className="px-3 py-2 text-sm text-text-primary max-w-[280px] truncate" title={row.adName}>{row.adName}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(row.spend)}</td>
                  <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(row.roas))}>{formatRoas(row.roas)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{row.daysActive}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{row.goodDaysBeforeDrop}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{row.estimatedDropDay}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatCurrency(row.estimatedSpendAtDrop)}</td>
                  <td className="px-3 py-2 text-right text-sm text-warning">{row.fatigueScore}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Scale vs Refresh Decision Helper" icon={Zap}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-sm text-text-secondary">
            Thresholds tuned for digital products: <span className="text-text-primary font-medium">ROAS 1.2 = workable</span>, <span className="text-success font-medium">7D ROAS 1.3+ = scalable</span>, <span className="text-danger font-medium">7D ROAS ≤ 1.0 = kill candidate</span>.
          </p>
          <button
            onClick={() => setShowActionPlan((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-light hover:bg-primary/20 transition-colors"
          >
            {showActionPlan ? 'Hide Plan' : 'Generate Action Plan'}
          </button>
        </div>

        {showActionPlan ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-success/25 bg-success/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-success" />
                <h4 className="text-sm font-semibold text-success">Ready To Scale</h4>
              </div>
              <div className="space-y-2">
                {actionPlan.scaleReady.length === 0 ? (
                  <p className="text-xs text-text-muted">No strong scale candidates yet.</p>
                ) : actionPlan.scaleReady.map((c) => (
                  <div key={c.adId} className="rounded border border-success/20 bg-success/5 px-2 py-1.5">
                    <p className="text-xs text-text-primary truncate" title={c.adName}>{c.adName}</p>
                    <p className="text-[11px] text-text-muted truncate" title={c.campaignName || '-'}>
                      {c.campaignName || '-'}
                    </p>
                    <p className="text-[11px] text-text-muted truncate" title={c.adSetName || '-'}>
                      {c.adSetName || '-'}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {formatRoas(c.roas)} | {formatCurrency(c.spend)} | fatigue {c.fatigueScore}%
                    </p>
                    {c.manageEntity === 'adset' && (
                      <p className="text-[11px] text-text-muted">
                        {c.adSetCreativeCount || 0} ads | {c.adSetLowRoasCount || 0} low ROAS | {c.adSetNoSpendCount || 0} low spend
                      </p>
                    )}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {renderStatusPill(c.adId, c.metaDeliveryStatus, c.metaConfiguredStatus)}
                      <div className="flex items-center gap-1.5">
                        {c.adSetId && (
                          <button
                            type="button"
                            onClick={() => void openAdSetReview({
                              adSetId: c.adSetId,
                              adSetName: c.adSetName,
                              campaignName: c.campaignName,
                              sourceLabel: 'Action Plan',
                              adName: c.adName,
                            })}
                            className="inline-flex items-center gap-1 rounded-md border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-400/10"
                          >
                            <LayoutGrid className="h-3 w-3" />
                            Review
                          </button>
                        )}
                        {renderScenarioActionControl({
                          adId: c.adId,
                          adName: c.adName,
                          adSetId: c.adSetId,
                          adSetName: c.adSetName,
                          canManageStatus: c.canManageStatus,
                          canManageAdSetStatus: c.manageEntity === 'adset' ? true : !!c.adSetId,
                          manageEntity: c.manageEntity,
                          metaConfiguredStatus: c.metaConfiguredStatus,
                          metaDeliveryStatus: c.metaDeliveryStatus,
                        }, true)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-danger/25 bg-danger/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <RotateCcw className="h-4 w-4 text-danger" />
                <h4 className="text-sm font-semibold text-danger">Refresh Now</h4>
              </div>
              <div className="space-y-2">
                {actionPlan.refreshNow.length === 0 ? (
                  <p className="text-xs text-text-muted">No immediate refresh pressure.</p>
                ) : actionPlan.refreshNow.map((c) => (
                  <div key={c.adId} className="rounded border border-danger/20 bg-danger/5 px-2 py-1.5">
                    <p className="text-xs text-text-primary truncate" title={c.adName}>{c.adName}</p>
                    <p className="text-[11px] text-text-muted truncate" title={c.campaignName || '-'}>
                      {c.campaignName || '-'}
                    </p>
                    <p className="text-[11px] text-text-muted truncate" title={c.adSetName || '-'}>
                      {c.adSetName || '-'}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {formatRoas(c.roas)} | {formatCurrency(c.spend)} | fatigue {c.fatigueScore}%
                    </p>
                    {c.manageEntity === 'adset' && (
                      <p className="text-[11px] text-text-muted">
                        {c.adSetCreativeCount || 0} ads | {c.adSetLowRoasCount || 0} low ROAS | {c.adSetNoSpendCount || 0} low spend
                      </p>
                    )}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {renderStatusPill(c.adId, c.metaDeliveryStatus, c.metaConfiguredStatus)}
                      <div className="flex items-center gap-1.5">
                        {c.adSetId && (
                          <button
                            type="button"
                            onClick={() => void openAdSetReview({
                              adSetId: c.adSetId,
                              adSetName: c.adSetName,
                              campaignName: c.campaignName,
                              sourceLabel: 'Action Plan',
                              adName: c.adName,
                            })}
                            className="inline-flex items-center gap-1 rounded-md border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-400/10"
                          >
                            <LayoutGrid className="h-3 w-3" />
                            Review
                          </button>
                        )}
                        {renderScenarioActionControl({
                          adId: c.adId,
                          adName: c.adName,
                          adSetId: c.adSetId,
                          adSetName: c.adSetName,
                          canManageStatus: c.canManageStatus,
                          canManageAdSetStatus: c.manageEntity === 'adset' ? true : !!c.adSetId,
                          manageEntity: c.manageEntity,
                          metaConfiguredStatus: c.metaConfiguredStatus,
                          metaDeliveryStatus: c.metaDeliveryStatus,
                        }, true)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-danger/25 bg-danger/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-danger" />
                <h4 className="text-sm font-semibold text-danger">Kill Now (7D)</h4>
              </div>
              <div className="space-y-2">
                {(actionPlan.killNow ?? []).length === 0 ? (
                  <p className="text-xs text-text-muted">No immediate kill candidates.</p>
                ) : (actionPlan.killNow ?? []).map((c) => (
                  <div key={c.adId} className="rounded border border-danger/20 bg-danger/5 px-2 py-1.5">
                    <p className="text-xs text-text-primary truncate" title={c.adName}>{c.adName}</p>
                    <p className="text-[11px] text-text-muted truncate" title={c.campaignName || '-'}>
                      {c.campaignName || '-'}
                    </p>
                    <p className="text-[11px] text-text-muted truncate" title={c.adSetName || '-'}>
                      {c.adSetName || '-'}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {formatRoas(c.roas)} | {formatCurrency(c.spend)} | fatigue {c.fatigueScore}%
                    </p>
                    {c.manageEntity === 'adset' && (
                      <p className="text-[11px] text-text-muted">
                        {c.adSetCreativeCount || 0} ads | {c.adSetLowRoasCount || 0} low ROAS | {c.adSetNoSpendCount || 0} low spend
                      </p>
                    )}
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {renderStatusPill(c.adId, c.metaDeliveryStatus, c.metaConfiguredStatus)}
                      <div className="flex items-center gap-1.5">
                        {c.adSetId && (
                          <button
                            type="button"
                            onClick={() => void openAdSetReview({
                              adSetId: c.adSetId,
                              adSetName: c.adSetName,
                              campaignName: c.campaignName,
                              sourceLabel: 'Action Plan',
                              adName: c.adName,
                            })}
                            className="inline-flex items-center gap-1 rounded-md border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-400/10"
                          >
                            <LayoutGrid className="h-3 w-3" />
                            Review
                          </button>
                        )}
                        {renderScenarioActionControl({
                          adId: c.adId,
                          adName: c.adName,
                          adSetId: c.adSetId,
                          adSetName: c.adSetName,
                          canManageStatus: c.canManageStatus,
                          canManageAdSetStatus: c.manageEntity === 'adset' ? true : !!c.adSetId,
                          manageEntity: c.manageEntity,
                          metaConfiguredStatus: c.metaConfiguredStatus,
                          metaDeliveryStatus: c.metaDeliveryStatus,
                        }, true)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-info" />
                <h4 className="text-sm font-semibold text-info">Monitor</h4>
              </div>
              <div className="space-y-2">
                {actionPlan.monitor.length === 0 ? (
                  <p className="text-xs text-text-muted">No monitor list items.</p>
                ) : actionPlan.monitor.map((c) => (
                  <div key={c.adId} className="rounded border border-border px-2 py-1.5">
                    <p className="text-xs text-text-primary truncate" title={c.adName}>{c.adName}</p>
                    <p className="text-[11px] text-text-muted truncate" title={c.campaignName || '-'}>
                      {c.campaignName || '-'}
                    </p>
                    <p className="text-[11px] text-text-muted truncate" title={c.adSetName || '-'}>
                      {c.adSetName || '-'}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      {formatRoas(c.roas)} | {formatCurrency(c.spend)} | fatigue {c.fatigueScore}%
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {renderStatusPill(c.adId, c.metaDeliveryStatus, c.metaConfiguredStatus)}
                      <div className="flex items-center gap-1.5">
                        {c.adSetId && (
                          <button
                            type="button"
                            onClick={() => void openAdSetReview({
                              adSetId: c.adSetId,
                              adSetName: c.adSetName,
                              campaignName: c.campaignName,
                              sourceLabel: 'Action Plan',
                              adName: c.adName,
                            })}
                            className="inline-flex items-center gap-1 rounded-md border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-400/10"
                          >
                            <LayoutGrid className="h-3 w-3" />
                            Review
                          </button>
                        )}
                        {renderScenarioActionControl({
                          adId: c.adId,
                          adName: c.adName,
                          adSetId: c.adSetId,
                          adSetName: c.adSetName,
                          canManageStatus: c.canManageStatus,
                          canManageAdSetStatus: c.manageEntity === 'adset' ? true : !!c.adSetId,
                          manageEntity: c.manageEntity,
                          metaConfiguredStatus: c.metaConfiguredStatus,
                          metaDeliveryStatus: c.metaDeliveryStatus,
                        }, true)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Click “Generate Action Plan” to classify creatives for scaling, refresh, or monitoring.</p>
        )}
      </SectionCard>

      <Modal
        isOpen={!!selectedCreative}
        onClose={() => {
          setSelectedCreative(null);
          setPreviewIframeSrc(null);
          setPreviewFormatUsed(null);
          setPreviewSourceAd(null);
          setPreviewError(null);
        }}
        title={selectedCreative ? `Creative Preview: ${selectedCreative.adName}` : 'Creative Preview'}
        size="lg"
      >
        {!selectedCreative ? null : (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 max-h-[74vh] overflow-hidden">
            <div className="w-full lg:w-[340px]">
              <div className="relative rounded-xl border border-cyan-300/30 bg-black shadow-[0_0_22px_rgba(34,211,238,0.14)] overflow-hidden">
                <div className="relative aspect-[9/16] w-full max-h-[68vh] min-h-[420px] bg-black">
                  {previewLoading ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 bg-black">
                      <div className="h-8 w-8 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
                      <p className="text-[11px] text-cyan-200">Loading preview...</p>
                    </div>
                  ) : previewIframeSrc ? (
                    <iframe
                      src={previewIframeSrc}
                      title={`Meta creative preview ${selectedCreative.adName}`}
                      className="h-full w-full border-0 bg-black"
                      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    />
                  ) : selectedCreative.thumbnail ? (
                    <img
                      src={selectedCreative.thumbnail}
                      alt={selectedCreative.adName}
                      className="h-full w-full object-cover bg-black"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center">
                      <p className="text-sm text-text-muted">Preview not available for this creative.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-border p-2">
                  <p className="text-text-muted">Spend</p>
                  <p className="text-text-primary font-semibold">{formatCurrency(selectedCreative.spend)}</p>
                </div>
                <div className="rounded border border-border p-2">
                  <p className="text-text-muted">ROAS</p>
                  <p className={cn('font-semibold', roasClass(selectedCreative.roas))}>{formatRoas(selectedCreative.roas)}</p>
                </div>
                <div className="rounded border border-border p-2">
                  <p className="text-text-muted">7D ROAS</p>
                  <p className={cn('font-semibold', roasClass(selectedCreative.last7DayRoas))}>{formatRoas(selectedCreative.last7DayRoas)}</p>
                </div>
                <div className="rounded border border-border p-2">
                  <p className="text-text-muted">Fatigue</p>
                  <p className="font-semibold" style={{ color: fatigueColor(selectedCreative.fatigueScore) }}>{selectedCreative.fatigueScore}%</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface p-3">
                <p className="text-[11px] uppercase tracking-wider text-text-muted mb-2">Creative Control</p>
                <div className="space-y-1.5 text-xs text-text-secondary">
                  <p><span className="text-text-muted">Name:</span> <span className="text-text-primary">{selectedCreative.adName}</span></p>
                  <p><span className="text-text-muted">Ad ID:</span> <span className="font-mono text-text-primary">{selectedCreative.adId}</span></p>
                  {previewSourceAd && (
                    <p><span className="text-text-muted">Source Ad:</span> <span className="font-mono text-text-primary">{previewSourceAd.id}</span></p>
                  )}
                  <p><span className="text-text-muted">Campaign:</span> <span className="text-text-primary">{selectedCreative.campaignName || '-'}</span></p>
                  <p><span className="text-text-muted">Ad Set:</span> <span className="text-text-primary">{selectedCreative.adSetName || '-'}</span></p>
                  <p><span className="text-text-muted">Format:</span> <span className="text-text-primary">{selectedCreative.format}</span></p>
                  <p><span className="text-text-muted">Configured Status:</span> <span className="text-text-primary">{normalizedStatusText(resolvedMetaConfiguredStatus(selectedCreative.adId, selectedCreative.metaConfiguredStatus))}</span></p>
                  <p><span className="text-text-muted">Delivery Status:</span> <span className="text-text-primary">{normalizedStatusText(resolvedMetaDeliveryStatus(selectedCreative.adId, selectedCreative.metaDeliveryStatus))}</span></p>
                  <p><span className="text-text-muted">Preview Mode:</span> <span className="text-text-primary">{previewFormatUsed ? previewFormatUsed.replaceAll('_', ' ') : 'Fallback'}</span></p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border px-2 py-2">
                  {renderStatusPill(selectedCreative.adId, selectedCreative.metaDeliveryStatus, selectedCreative.metaConfiguredStatus)}
                  {renderActionControls({
                    adId: selectedCreative.adId,
                    adName: selectedCreative.adName,
                    adSetId: selectedCreative.adSetId,
                    adSetName: selectedCreative.adSetName,
                    canManageStatus: selectedCreative.canManageStatus,
                    canManageAdSetStatus: selectedCreative.canManageAdSetStatus,
                    metaConfiguredStatus: selectedCreative.metaConfiguredStatus,
                    metaDeliveryStatus: selectedCreative.metaDeliveryStatus,
                  })}
                </div>
              </div>

              {previewError && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                  <p className="text-xs text-warning">{previewError}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!selectedAdSetReview}
        onClose={() => {
          setSelectedAdSetReview(null);
          setAdSetReviewRows([]);
          setAdSetReviewError(null);
          setAdSetReviewLoading(false);
          setSelectedAdReviewIds({});
          setBulkActionLoading(false);
        }}
        title={selectedAdSetReview ? `Ad Set Review: ${selectedAdSetReview.adSetName}` : 'Ad Set Review'}
        size="lg"
      >
        {!selectedAdSetReview ? null : (
          <div className="space-y-4 max-h-[76vh] overflow-y-auto rounded-xl border border-white/10 bg-gradient-to-b from-[#1f2848] via-[#1c2340] to-[#171d34] p-4 pr-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {selectedAdSetReview.sourceLabel && (
                <span className="rounded-md border border-cyan-200/50 bg-cyan-300/20 px-2 py-1 text-cyan-100">
                  {selectedAdSetReview.sourceLabel}
                </span>
              )}
              <span className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-slate-200">
                Campaign: <span className="text-white">{selectedAdSetReview.campaignName || '-'}</span>
              </span>
              <span className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-slate-200">
                Ad Set ID: <span className="font-mono text-white">{selectedAdSetReview.adSetId}</span>
              </span>
              <div className="ml-auto inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-2 py-1">
                <span className="text-[11px] text-slate-300">Ad set status</span>
                {renderStatusActionButton({
                  adId: `adset_${selectedAdSetReview.adSetId}`,
                  adName: selectedAdSetReview.adSetName,
                  adSetId: selectedAdSetReview.adSetId,
                  adSetName: selectedAdSetReview.adSetName,
                  canManageStatus: false,
                  canManageAdSetStatus: true,
                  manageEntity: 'adset',
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 text-xs">
              <div className="rounded border border-white/15 bg-white/5 p-2"><p className="text-slate-300">Ads</p><p className="text-white font-semibold">{adSetReviewRows.length}</p></div>
              <div className="rounded border border-white/15 bg-white/5 p-2"><p className="text-slate-300">Active Ads</p><p className="text-white font-semibold">{adSetReviewSummary.activeAds}</p></div>
              <div className="rounded border border-white/15 bg-white/5 p-2"><p className="text-slate-300">Total Spend</p><p className="text-white font-semibold">{formatCurrency(adSetReviewSummary.totalSpend)}</p></div>
              <div className="rounded border border-white/15 bg-white/5 p-2"><p className="text-slate-300">Blended ROAS</p><p className={cn('font-semibold', roasClass(adSetReviewSummary.blendedRoas))}>{formatRoas(adSetReviewSummary.blendedRoas)}</p></div>
              <div className="rounded border border-white/15 bg-white/5 p-2"><p className="text-slate-300">Blended CPA</p><p className="text-white font-semibold">{formatCurrency(adSetReviewSummary.blendedCpa)}</p></div>
              <div className="rounded border border-danger/40 bg-danger/15 p-2"><p className="text-danger/90">Low ROAS Ads</p><p className="text-danger font-semibold">{adSetReviewSummary.lowRoasAds}</p></div>
              <div className="rounded border border-warning/40 bg-warning/15 p-2"><p className="text-warning/90">No Spend Ads</p><p className="text-warning font-semibold">{adSetReviewSummary.noSpendAds}</p></div>
            </div>

            {!adSetReviewLoading && !adSetReviewError && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2">
                <p className="text-xs text-slate-300">
                  Selected: <span className="font-semibold text-white">{selectedAdReviewCount}</span>
                </p>
                <button
                  type="button"
                  disabled={bulkActionLoading || selectedAdReviewCount === 0}
                  onClick={() => void applyBulkAdReviewStatus('ACTIVE')}
                  className="rounded-md border border-success/40 bg-success/20 px-2.5 py-1 text-[11px] text-success disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Turn ON Selected
                </button>
                <button
                  type="button"
                  disabled={bulkActionLoading || selectedAdReviewCount === 0}
                  onClick={() => void applyBulkAdReviewStatus('PAUSED')}
                  className="rounded-md border border-danger/40 bg-danger/20 px-2.5 py-1 text-[11px] text-danger disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Turn OFF Selected
                </button>
                <button
                  type="button"
                  disabled={bulkActionLoading || selectedAdReviewCount === 0}
                  onClick={() => setSelectedAdReviewIds({})}
                  className="rounded-md border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear
                </button>
                {bulkActionLoading && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-cyan-100">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Updating...
                  </span>
                )}
              </div>
            )}

            {adSetReviewLoading ? (
              <div className="rounded-lg border border-white/15 bg-white/5 p-6 text-center text-sm text-slate-200">
                Loading ads in this ad set...
              </div>
            ) : adSetReviewError ? (
              <div className="rounded-lg border border-warning/40 bg-warning/15 p-4">
                <p className="text-sm text-warning">{adSetReviewError}</p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto rounded-lg border border-white/15 bg-black/10">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-[#202948]/95 backdrop-blur">
                    <tr className="text-slate-300">
                      <th className="px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={sortedAdSetReviewRows.length > 0 && selectedAdReviewCount === sortedAdSetReviewRows.length}
                          onChange={(event) => toggleSelectAllAdReviews(event.target.checked)}
                          className="h-3.5 w-3.5 accent-cyan-400"
                        />
                      </th>
                      <th className="px-3 py-2 text-xs">
                        <button type="button" onClick={() => handleAdSetSort('adName')} className="inline-flex items-center gap-1 hover:text-white">
                          Ad <span className="text-[10px]">{adSetSortIndicator('adName')}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 text-right text-xs">
                        <button type="button" onClick={() => handleAdSetSort('spend')} className="ml-auto inline-flex items-center gap-1 hover:text-white">
                          Spend <span className="text-[10px]">{adSetSortIndicator('spend')}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 text-right text-xs">
                        <button type="button" onClick={() => handleAdSetSort('roas')} className="ml-auto inline-flex items-center gap-1 hover:text-white">
                          ROAS <span className="text-[10px]">{adSetSortIndicator('roas')}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 text-right text-xs">
                        <button type="button" onClick={() => handleAdSetSort('cpa')} className="ml-auto inline-flex items-center gap-1 hover:text-white">
                          CPA <span className="text-[10px]">{adSetSortIndicator('cpa')}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 text-right text-xs">
                        <button type="button" onClick={() => handleAdSetSort('ctr')} className="ml-auto inline-flex items-center gap-1 hover:text-white">
                          CTR <span className="text-[10px]">{adSetSortIndicator('ctr')}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 text-right text-xs">
                        <button type="button" onClick={() => handleAdSetSort('conversions')} className="ml-auto inline-flex items-center gap-1 hover:text-white">
                          Conv. <span className="text-[10px]">{adSetSortIndicator('conversions')}</span>
                        </button>
                      </th>
                      <th className="px-3 py-2 text-xs">Delivery</th>
                      <th className="px-3 py-2 text-right text-xs">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAdSetReviewRows.map((row) => (
                      <tr key={`${row.adId}_adset_review`} className="border-t border-white/10 hover:bg-white/5">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!selectedAdReviewIds[row.adId]}
                            onChange={(event) => toggleAdReviewSelection(row.adId, event.target.checked)}
                            className="h-3.5 w-3.5 accent-cyan-400"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm text-white max-w-[280px] truncate" title={row.adName}>{row.adName}</td>
                        <td className="px-3 py-2 text-right text-sm text-slate-100">{formatCurrency(row.spend)}</td>
                        <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(row.roas))}>{formatRoas(row.roas)}</td>
                        <td className="px-3 py-2 text-right text-sm text-slate-300">{formatCurrency(row.cpa)}</td>
                        <td className="px-3 py-2 text-right text-sm text-slate-300">{formatPercentage(row.ctr)}</td>
                        <td className="px-3 py-2 text-right text-sm text-slate-300">{formatNumber(row.conversions)}</td>
                        <td className="px-3 py-2 text-xs">
                          {renderStatusPill(row.adId, row.metaDeliveryStatus, row.metaConfiguredStatus)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {renderStatusActionButton({
                            adId: row.adId,
                            adName: row.adName,
                            adSetId: selectedAdSetReview.adSetId,
                            adSetName: selectedAdSetReview.adSetName,
                            canManageStatus: row.canManageStatus,
                            canManageAdSetStatus: true,
                            manageEntity: 'ad',
                            metaConfiguredStatus: row.metaConfiguredStatus,
                            metaDeliveryStatus: row.metaDeliveryStatus,
                          }, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
