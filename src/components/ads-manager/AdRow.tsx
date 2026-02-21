'use client';

import { useState, useRef, useEffect } from 'react';

import {
  Play,
  Image as ImageIcon,
  X,
  ExternalLink,
  Eye,
  MousePointer,
  DollarSign,
  BarChart3,
  TrendingUp,
  AlertCircle,
  Copy,
} from 'lucide-react';
import type { Ad, EntityStatus } from '@/types/campaign';
import type { MetricKey } from '@/types/metrics';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import type { EntityAction } from '@/types/latestActions';
import type { AdIssue } from './AdsIssuesPanel';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { getMetricValue, formatMetric } from '@/lib/metrics';
import { useStoreStore } from '@/stores/storeStore';
import { Checkbox } from '@/components/ui/Checkbox';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { MetricCell } from './MetricCell';
import { PerformanceSparkline } from './PerformanceSparkline';
import { LatestActionsCell } from './LatestActionsCell';

export interface AdRowProps {
  ad: Ad;
  rowId?: string;
  isHighlighted?: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onStatusChange: (status: EntityStatus) => void;
  onNameChange?: (name: string) => void;
  columnOrder: MetricKey[];
  sparklineData?: Record<string, SparklineDataPoint[]>;
  activityData?: Record<string, EntityAction[]>;
  activitiesFullyLoaded?: boolean;
  issues?: AdIssue[];
  onIssueClick?: (issue: AdIssue) => void;
  nameColWidth?: number;
}

const creativeTypeVariant: Record<string, 'info' | 'warning' | 'default'> = {
  image: 'info',
  video: 'warning',
  carousel: 'default',
};

export function AdRow({
  ad,
  rowId,
  isHighlighted = false,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onNameChange,
  columnOrder,
  sparklineData,
  activityData,
  activitiesFullyLoaded,
  issues = [],
  onIssueClick,
  nameColWidth,
}: AdRowProps) {
  const isActive = ad.status === 'ACTIVE';
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showIssueDetails, setShowIssueDetails] = useState(false);
  const hasMedia = !!ad.creative.mediaUrl || !!ad.creative.thumbnailUrl;
  const isVideo = ad.creative.type === 'video';
  const hasVideoId = isVideo && !!ad.creative.videoId;
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  // Build the video proxy URL when we have a videoId
  const videoProxyUrl = hasVideoId
    ? `/api/meta/video-proxy?storeId=${encodeURIComponent(activeStoreId)}&videoId=${encodeURIComponent(ad.creative.videoId!)}`
    : ad.creative.mediaUrl || '';
  const primaryIssue = issues.length > 0 ? [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))[0] : null;
  const hasRejected = issues.some((i) => i.kind === 'ad_policy_rejected' || i.reason.toLowerCase().includes('reject'));
  const effectiveStatus = (ad.policyInfo?.effectiveStatus || '').toUpperCase();
  const deliveryBlocked =
    hasRejected ||
    effectiveStatus.includes('DISAPPROVED') ||
    effectiveStatus.includes('REJECTED') ||
    effectiveStatus.includes('WITH_ISSUES') ||
    effectiveStatus.includes('PENDING');
  const statusLabel = !isActive ? ad.status : deliveryBlocked ? 'NOT DELIVERING' : 'ACTIVE';
  const statusVariant: 'success' | 'default' | 'danger' = !isActive ? 'default' : deliveryBlocked ? 'danger' : 'success';

  return (
    <>
      <tr
        id={rowId}
        className={cn(
          'group border-b border-[rgba(0,0,0,0.03)] bg-white transition-colors duration-150',
          'hover:bg-[#f5f5f7]',
          isSelected && 'bg-[#e8f0fe]',
          isHighlighted && 'bg-[#fff8e1]'
        )}
      >
        {/* Checkbox */}
        <td className="w-10 whitespace-nowrap py-2.5 pl-16 pr-4 sticky left-0 z-10 bg-white group-hover:bg-[#f5f5f7] transition-colors duration-150">
          <Checkbox checked={isSelected} onChange={onToggleSelect} />
        </td>

        {/* Toggle */}
        <td className="w-12 whitespace-nowrap px-3 py-1.5 sticky left-[40px] z-10 bg-white group-hover:bg-[#f5f5f7] transition-colors duration-150">
          <Toggle
            checked={isActive}
            onChange={(checked) => onStatusChange(checked ? 'ACTIVE' : 'PAUSED')}
            size="sm"
          />
        </td>

        {/* Name + Creative Thumbnail */}
        <td
          className="whitespace-nowrap px-3 py-1.5 sticky left-[96px] z-10 bg-white group-hover:bg-[#f5f5f7] transition-colors duration-150 border-r border-[rgba(0,0,0,0.04)]"
          style={nameColWidth ? { width: nameColWidth, minWidth: nameColWidth } : undefined}
        >
          <div className="flex items-center gap-3 pl-8">
            {/* Creative thumbnail — clickable to open preview */}
            <button
              onClick={() => setPreviewOpen(true)}
              className={cn(
                'relative h-12 w-12 flex-shrink-0 rounded-lg bg-surface-hover flex items-center justify-center overflow-hidden border border-border-light',
                'cursor-pointer hover:ring-2 hover:ring-primary hover:border-primary transition-all'
              )}
            >
              {hasMedia || hasVideoId ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ad.creative.thumbnailUrl || ad.creative.mediaUrl}
                    alt={ad.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const fallback = (e.target as HTMLImageElement).parentElement?.querySelector('.fallback-icon');
                      if (fallback) (fallback as HTMLElement).classList.remove('hidden');
                    }}
                  />
                  <div className="fallback-icon hidden flex items-center justify-center">
                    {isVideo ? <Play className="h-5 w-5 text-text-dimmed" /> : <ImageIcon className="h-5 w-5 text-text-dimmed" />}
                  </div>
                  {isVideo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-elevated/90">
                        <Play className="h-3 w-3 text-text-primary fill-text-primary ml-0.5" />
                      </div>
                    </div>
                  )}
                  {/* Hover preview overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 hover:opacity-100 transition-opacity rounded-lg">
                    <Eye className="h-4 w-4 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-0.5">
                  {isVideo ? <Play className="h-4 w-4 text-text-dimmed" /> : <ImageIcon className="h-4 w-4 text-text-dimmed" />}
                  <span className="text-[8px] font-medium text-text-dimmed uppercase">{ad.creative.type}</span>
                </div>
              )}
            </button>

            <div className="group flex flex-col gap-0.5">
              {/* Editable ad name */}
              <div className="relative group/tooltip">
                {onNameChange ? (
                  <div className="truncate max-w-[220px] block">
                    <InlineEdit
                      value={ad.name}
                      onSave={onNameChange}
                      type="text"
                    />
                  </div>
                ) : (
                  <span className="truncate max-w-[220px] block text-sm font-medium text-text-primary">{ad.name}</span>
                )}
                <div className="absolute left-0 top-full mt-1 z-50 pointer-events-none opacity-0 group-hover/tooltip:opacity-100 translate-y-1 group-hover/tooltip:translate-y-0 transition-all duration-150 ease-out">
                  <div className="rounded-lg bg-[#1d1d1f] px-3 py-1.5 text-xs text-white shadow-lg whitespace-nowrap max-w-xs">
                    {ad.name}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant={creativeTypeVariant[ad.creative.type] ?? 'default'}>
                  {ad.creative.type}
                </Badge>
                {ad.creative.ctaType && (
                  <span className="text-[10px] font-medium text-text-dimmed px-1.5 py-0.5 rounded bg-surface-hover">
                    {ad.creative.ctaType.replace(/_/g, ' ')}
                  </span>
                )}
                {ad.creative.headline && (
                  <span className="text-xs text-text-dimmed max-w-[180px] truncate">
                    {ad.creative.headline}
                  </span>
                )}
              </div>
              {/* Quick Actions - visible on hover */}
              <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Preview button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:text-primary-light hover:bg-primary/10 transition-colors"
                  title="Preview ad creative"
                >
                  <Eye className="h-3 w-3" />
                  <span>Preview</span>
                </button>
                {/* View on Facebook button */}
                <a
                  href={`https://www.facebook.com/ads/manager/creation/creatives?act=${ad.adSetId}&selected_ad_ids=${ad.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                  title="View on Facebook"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>Facebook</span>
                </a>
                {/* Copy ad ID */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(ad.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-text-muted hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  title="Copy ad ID"
                >
                  <Copy className="h-3 w-3" />
                  <span>Copy ID</span>
                </button>
              </div>
            </div>
          </div>
        </td>

        {/* Status */}
        <td className="whitespace-nowrap px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-semibold',
              isActive && !deliveryBlocked ? 'apple-status-active' : 'apple-status-paused'
            )}>
              {isActive && !deliveryBlocked && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
              {statusLabel}
            </span>
            {issues.length > 0 && (
              <button
                onClick={() => setShowIssueDetails(true)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  hasRejected
                    ? 'border-red-400/60 bg-red-500/20 text-red-300'
                    : 'border-amber-400/50 bg-amber-500/20 text-amber-300'
                )}
              >
                {hasRejected ? 'Rejected' : `Issues ${issues.length}`}
              </button>
            )}
          </div>
        </td>

        {/* Budget — N/A for ads */}
        <td className="whitespace-nowrap px-3 py-1.5 text-sm text-text-dimmed">
          &mdash;
        </td>

        {/* Bid Strategy — N/A for ads */}
        <td className="whitespace-nowrap px-3 py-1.5 text-sm text-text-dimmed">
          &mdash;
        </td>

        {/* Performance Sparkline */}
        <PerformanceSparkline entityId={ad.id} data={sparklineData?.[ad.id]} currentRoas={ad.metrics.roas} />

        {/* Latest Actions */}
        <LatestActionsCell entityId={ad.id} actions={activityData?.[ad.id]} activitiesFullyLoaded={activitiesFullyLoaded} />

        {/* Dynamic Metrics */}
        {columnOrder.map((key) => (
          <MetricCell
            key={key}
            metricKey={key}
            value={getMetricValue(ad.metrics as unknown as Record<string, number>, key)}
          />
        ))}
      </tr>

      {/* Creative Preview Modal */}
      {previewOpen && (
        <tr>
          <td colSpan={8 + columnOrder.length}>
            <CreativePreviewModal
              ad={ad}
              isVideo={isVideo}
              hasMedia={hasMedia}
              hasVideoId={hasVideoId}
              videoProxyUrl={videoProxyUrl}
              isActive={isActive}
              statusLabel={statusLabel}
              statusVariant={statusVariant}
              onClose={() => setPreviewOpen(false)}
            />
          </td>
        </tr>
      )}

      {showIssueDetails && primaryIssue && (
        <tr>
          <td colSpan={8 + columnOrder.length}>
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-lg rounded-xl border border-border-light bg-surface-elevated p-4 shadow-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-text-primary">Ad Issue Details</h4>
                  <button
                    onClick={() => setShowIssueDetails(false)}
                    className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-hover hover:text-text-primary"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-2 text-xs">
                  <p className="text-text-secondary"><span className="text-text-muted">Ad:</span> {ad.name}</p>
                  <p className="text-text-secondary"><span className="text-text-muted">Issue:</span> {primaryIssue.reason}</p>
                  <p className="text-text-secondary"><span className="text-text-muted">Details:</span> {primaryIssue.details || 'No details from Meta'}</p>
                  <p className="text-text-secondary"><span className="text-text-muted">Suggested Fix:</span> {primaryIssue.suggestion}</p>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      setShowIssueDetails(false);
                      onIssueClick?.(primaryIssue);
                    }}
                    className="rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                  >
                    View in Error Center
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// --- Creative Preview Modal ---

function CreativePreviewModal({
  ad,
  isVideo,
  hasMedia,
  hasVideoId,
  videoProxyUrl,
  isActive,
  statusLabel,
  statusVariant,
  onClose,
}: {
  ad: Ad;
  isVideo: boolean;
  hasMedia: boolean;
  hasVideoId: boolean;
  videoProxyUrl: string;
  isActive: boolean;
  statusLabel: string;
  statusVariant: 'success' | 'default' | 'danger';
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoError, setVideoError] = useState(false);
  const [videoLoading, setVideoLoading] = useState(isVideo);
  const [iframePreviewSrc, setIframePreviewSrc] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  // Handle video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => setVideoLoading(false);
    const handleError = () => {
      setVideoError(true);
      setVideoLoading(false);
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
    };
  }, []);

  // When video proxy fails, fetch an iframe preview from Meta
  useEffect(() => {
    if (videoError && isVideo && !iframePreviewSrc && !iframeLoading) {
      setIframeLoading(true);
      fetch(`/api/meta/ad-preview?storeId=${encodeURIComponent(activeStoreId)}&adId=${encodeURIComponent(ad.id)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.iframeSrc) {
            setIframePreviewSrc(data.iframeSrc);
          }
        })
        .catch(() => {
          // Iframe preview also failed
        })
        .finally(() => setIframeLoading(false));
    }
  }, [videoError, isVideo, iframePreviewSrc, iframeLoading, activeStoreId, ad.id]);

  const canPlayVideo = (isVideo && (hasVideoId || !!ad.creative.mediaUrl)) && !videoError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl bg-surface-elevated shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — prominent */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 transition-colors"
        >
          <X className="h-5 w-5 text-white" />
        </button>

        {/* Header — compact */}
        <div className="flex-shrink-0 border-b border-border px-5 py-3 flex items-center gap-3">
          <Badge variant={creativeTypeVariant[ad.creative.type] ?? 'default'}>
            {ad.creative.type}
          </Badge>
          <Badge variant={statusVariant}>
            {statusLabel}
          </Badge>
          <div className="ml-2 min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary truncate">{ad.name}</h2>
          </div>
          <span className="text-[10px] text-text-dimmed flex-shrink-0 font-mono">{ad.id}</span>
        </div>

        {/* Body — Media + Details side by side */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
          {/* Media Preview — clean, bounded container */}
          <div className="bg-black flex flex-col items-center justify-center overflow-hidden max-h-[60vh] lg:max-h-none">
            {/* Ad body text overlay */}
            {ad.creative.body && (
              <div className="w-full flex-shrink-0 bg-surface-elevated/95 px-4 py-2 border-b border-border">
                <p className="text-xs text-text-secondary line-clamp-2">{ad.creative.body}</p>
              </div>
            )}

            {/* Media area — fills available space, no aspect-square */}
            <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden min-h-[200px]">
              {canPlayVideo ? (
                <>
                  {videoLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-8 w-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-white font-medium">Loading video...</span>
                      </div>
                    </div>
                  )}
                  <video
                    ref={videoRef}
                    src={videoProxyUrl}
                    poster={ad.creative.thumbnailUrl || undefined}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  >
                    Your browser does not support video playback.
                  </video>
                </>
              ) : isVideo && videoError ? (
                iframePreviewSrc ? (
                  <iframe
                    src={iframePreviewSrc}
                    className="w-full h-full border-0"
                    style={{ minHeight: 300 }}
                    allow="autoplay; encrypted-media"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                ) : iframeLoading ? (
                  <div className="flex flex-col items-center gap-2 p-4">
                    <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-text-muted">Loading preview...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-text-dimmed p-6">
                    <AlertCircle className="h-10 w-10 text-amber-400" />
                    <span className="text-sm font-medium text-text-secondary">Video unavailable</span>
                    <span className="text-xs text-text-dimmed text-center max-w-[240px]">
                      The video source could not be loaded. This can happen with older or restricted creatives.
                    </span>
                    {ad.creative.thumbnailUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ad.creative.thumbnailUrl}
                          alt={ad.name}
                          className="max-h-32 object-contain"
                        />
                      </div>
                    )}
                  </div>
                )
              ) : hasMedia ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ad.creative.mediaUrl || ad.creative.thumbnailUrl}
                  alt={ad.name}
                  className="max-w-full max-h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-text-dimmed">
                  {isVideo ? <Play className="h-10 w-10" /> : <ImageIcon className="h-10 w-10" />}
                  <span className="text-sm">No preview available</span>
                </div>
              )}
            </div>

            {/* Headline + CTA bar */}
            {(ad.creative.headline || ad.creative.ctaType) && (
              <div className="w-full flex-shrink-0 flex items-center justify-between px-4 py-2 bg-surface-elevated border-t border-border">
                <div className="flex-1 min-w-0 mr-3">
                  {ad.creative.headline && (
                    <p className="text-xs font-semibold text-text-primary truncate">{ad.creative.headline}</p>
                  )}
                </div>
                {ad.creative.ctaType && (
                  <span className="flex-shrink-0 rounded bg-primary px-3 py-1 text-[10px] font-bold uppercase text-white">
                    {ad.creative.ctaType.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Performance Details — scrollable if needed */}
          <div className="overflow-y-auto max-h-[60vh] lg:max-h-none p-4 space-y-4 border-l border-border">
            {/* Key Metrics */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-dimmed mb-2">Performance</h4>
              <div className="grid grid-cols-2 gap-2">
                <MetricTile
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  label="Spend"
                  value={formatCurrency(ad.metrics.spend)}
                  color="text-primary-light"
                />
                <MetricTile
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="Revenue"
                  value={formatCurrency(ad.metrics.revenue)}
                  color="text-emerald-600"
                />
                <MetricTile
                  icon={<BarChart3 className="h-3.5 w-3.5" />}
                  label="ROAS"
                  value={formatMetric('roas', ad.metrics.roas)}
                  color="text-purple-600"
                />
                <MetricTile
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  label="CPA"
                  value={formatCurrency(ad.metrics.cpa)}
                  color="text-orange-600"
                />
              </div>
            </div>

            {/* Delivery Metrics */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-dimmed mb-2">Delivery</h4>
              <div className="space-y-2">
                <MetricRow
                  icon={<Eye className="h-3.5 w-3.5 text-text-dimmed" />}
                  label="Impressions"
                  value={formatNumber(ad.metrics.impressions)}
                />
                <MetricRow
                  icon={<MousePointer className="h-3.5 w-3.5 text-text-dimmed" />}
                  label="Clicks"
                  value={formatNumber(ad.metrics.clicks)}
                />
                <MetricRow
                  icon={<TrendingUp className="h-3.5 w-3.5 text-text-dimmed" />}
                  label="CTR"
                  value={formatMetric('ctr', ad.metrics.ctr)}
                />
                <MetricRow
                  icon={<DollarSign className="h-3.5 w-3.5 text-text-dimmed" />}
                  label="CPC"
                  value={formatCurrency(ad.metrics.cpc)}
                />
                <MetricRow
                  icon={<DollarSign className="h-3.5 w-3.5 text-text-dimmed" />}
                  label="CPM"
                  value={formatCurrency(ad.metrics.cpm)}
                />
                <MetricRow
                  icon={<ExternalLink className="h-3.5 w-3.5 text-text-dimmed" />}
                  label="Conversions"
                  value={formatNumber(ad.metrics.conversions)}
                />
              </div>
            </div>

            {/* Creative Info */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-dimmed mb-2">Creative Info</h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Type</span>
                  <Badge variant={creativeTypeVariant[ad.creative.type] ?? 'default'}>
                    {ad.creative.type}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">CTA</span>
                  <span className="font-medium text-text-primary">{(ad.creative.ctaType || '').replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">Creative ID</span>
                  <span className="font-mono text-text-muted text-[10px]">{ad.creative.id}</span>
                </div>
                {ad.creative.videoId && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Video ID</span>
                    <span className="font-mono text-text-muted text-[10px]">{ad.creative.videoId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Small helper components for the preview modal ---

function MetricTile({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5">
      <div className={cn('flex items-center gap-1.5 mb-1', color)}>
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-bold text-text-primary">{value}</p>
    </div>
  );
}

function MetricRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <span className="text-xs font-semibold text-text-primary">{value}</span>
    </div>
  );
}
