'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  MousePointer,
  ShoppingCart,
  CreditCard,
  Package,
  Globe,
  FileText,
  Blend,
  ArrowDown,
  ChevronDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  GitCompare,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import type { DateRangePreset, ShopifyFunnelData, BlendedFunnelData } from '@/types/analytics';

type FunnelSource = 'facebook' | 'shopify' | 'blended';

export interface ConversionFunnelProps {
  metrics: Record<string, number>;
  shopifyFunnel?: ShopifyFunnelData;
  blendedFunnel?: BlendedFunnelData;
  datePreset?: DateRangePreset;
}

interface FunnelStage {
  label: string;
  value: number;
  icon: React.ReactNode;
  gradientFrom: string;
  gradientTo: string;
  textColor: string;
}

/** Rate metric displayed between two funnel stages in Blended view */
interface BlendedRateInfo {
  primaryLabel: string;
  primaryRate: number;
  secondaryLabel?: string;
  secondaryRate?: number;
  thresholds: { green: number; amber: number }; // primaryRate thresholds: >= green = green, >= amber = amber, else red
}

// ── Date multipliers & presets ─────────────────────────────────────────────
const dateMultiplier: Record<string, number> = {
  today: 0.033,
  yesterday: 0.033,
  last7: 0.233,
  last14: 0.467,
  last30: 1.0,
  thisMonth: 1.0,
  lastMonth: 0.95,
};

const quickPeriods: { label: string; preset: string }[] = [
  { label: 'Day', preset: 'today' },
  { label: 'Week', preset: 'last7' },
  { label: 'Month', preset: 'last30' },
];

const datePresetLabels: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  last14: 'Last 14 Days',
  last30: 'Last 30 Days',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
};

const allPresets = ['today', 'yesterday', 'last7', 'last14', 'last30', 'thisMonth', 'lastMonth'];

// ── Helpers ────────────────────────────────────────────────────────────────
function getRateColor(rate: number, thresholds: { green: number; amber: number }): string {
  if (rate >= thresholds.green) return 'text-emerald-400';
  if (rate >= thresholds.amber) return 'text-amber-400';
  return 'text-red-400';
}

function getRateBgColor(rate: number, thresholds: { green: number; amber: number }): string {
  if (rate >= thresholds.green) return 'bg-emerald-500/10 border-emerald-500/20';
  if (rate >= thresholds.amber) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

/** Simple seeded pseudo-random for deterministic previous-period simulation */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/** Generate a previous-period value with ±5-15% seeded random variance */
function previousValue(current: number, seed: number): number {
  const rand = seededRandom(seed);
  return Math.round(current * (0.85 + rand * 0.3));
}

// ── Component ──────────────────────────────────────────────────────────────
export function ConversionFunnel({
  metrics,
  shopifyFunnel,
  blendedFunnel,
  datePreset = 'last30',
}: ConversionFunnelProps) {
  const [source, setSource] = useState<FunnelSource>('facebook');
  const [localPreset, setLocalPreset] = useState<string>(datePreset);
  const [showCompare, setShowCompare] = useState(false);
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync local preset when parent datePreset changes
  useEffect(() => {
    setLocalPreset(datePreset);
  }, [datePreset]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDateDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // The multiplier to apply based on the LOCAL date preset
  const multiplier = dateMultiplier[localPreset] ?? 1.0;

  /** Apply the date multiplier to a raw value */
  const applyMultiplier = useCallback(
    (raw: number): number => Math.round(raw * multiplier),
    [multiplier]
  );

  // ── Facebook Ads stages ──────────────────────────────────────────────
  const fbStages: FunnelStage[] = useMemo(() => {
    const impressions = applyMultiplier(metrics.totalImpressions ?? 0);
    const clicks = applyMultiplier(metrics.totalClicks ?? 0);
    const conversions = applyMultiplier(metrics.totalConversions ?? 0);
    const addToCart = Math.round(clicks * 0.12);
    const checkout = Math.round(addToCart * 0.58);

    return [
      {
        label: 'Impressions',
        value: impressions,
        icon: <Eye className="h-4 w-4" />,
        gradientFrom: 'from-blue-500',
        gradientTo: 'to-blue-600',
        textColor: 'text-blue-400',
      },
      {
        label: 'Clicks',
        value: clicks,
        icon: <MousePointer className="h-4 w-4" />,
        gradientFrom: 'from-indigo-500',
        gradientTo: 'to-indigo-600',
        textColor: 'text-indigo-400',
      },
      {
        label: 'Add to Cart',
        value: addToCart,
        icon: <ShoppingCart className="h-4 w-4" />,
        gradientFrom: 'from-violet-500',
        gradientTo: 'to-violet-600',
        textColor: 'text-violet-400',
      },
      {
        label: 'Checkout',
        value: checkout,
        icon: <CreditCard className="h-4 w-4" />,
        gradientFrom: 'from-purple-500',
        gradientTo: 'to-purple-600',
        textColor: 'text-purple-400',
      },
      {
        label: 'Purchases',
        value: conversions,
        icon: <Package className="h-4 w-4" />,
        gradientFrom: 'from-emerald-500',
        gradientTo: 'to-emerald-600',
        textColor: 'text-emerald-400',
      },
    ];
  }, [metrics, applyMultiplier]);

  // ── Shopify Website stages ───────────────────────────────────────────
  const shopifyStages: FunnelStage[] = useMemo(() => {
    if (!shopifyFunnel) return [];
    return [
      {
        label: 'Sessions',
        value: applyMultiplier(shopifyFunnel.sessions),
        icon: <Globe className="h-4 w-4" />,
        gradientFrom: 'from-emerald-400',
        gradientTo: 'to-emerald-500',
        textColor: 'text-emerald-400',
      },
      {
        label: 'Product Views',
        value: applyMultiplier(shopifyFunnel.productPageViews),
        icon: <FileText className="h-4 w-4" />,
        gradientFrom: 'from-emerald-500',
        gradientTo: 'to-teal-500',
        textColor: 'text-emerald-400',
      },
      {
        label: 'Add to Cart',
        value: applyMultiplier(shopifyFunnel.addToCart),
        icon: <ShoppingCart className="h-4 w-4" />,
        gradientFrom: 'from-teal-500',
        gradientTo: 'to-teal-600',
        textColor: 'text-teal-400',
      },
      {
        label: 'Checkout',
        value: applyMultiplier(shopifyFunnel.reachedCheckout),
        icon: <CreditCard className="h-4 w-4" />,
        gradientFrom: 'from-teal-600',
        gradientTo: 'to-cyan-600',
        textColor: 'text-teal-400',
      },
      {
        label: 'Purchase',
        value: applyMultiplier(shopifyFunnel.completedPurchase),
        icon: <Package className="h-4 w-4" />,
        gradientFrom: 'from-cyan-500',
        gradientTo: 'to-cyan-600',
        textColor: 'text-cyan-400',
      },
    ];
  }, [shopifyFunnel, applyMultiplier]);

  // ── Blended stages (FB clicks → Shopify purchases) ──────────────────
  const blendedStages: FunnelStage[] = useMemo(() => {
    if (!blendedFunnel) return [];
    return [
      {
        label: 'FB Link Clicks',
        value: applyMultiplier(blendedFunnel.linkClicks),
        icon: <MousePointer className="h-4 w-4" />,
        gradientFrom: 'from-blue-500',
        gradientTo: 'to-blue-600',
        textColor: 'text-blue-400',
      },
      {
        label: 'Landing Page Views',
        value: applyMultiplier(blendedFunnel.landingPageViews),
        icon: <Globe className="h-4 w-4" />,
        gradientFrom: 'from-blue-600',
        gradientTo: 'to-indigo-500',
        textColor: 'text-indigo-400',
      },
      {
        label: 'Add to Cart',
        value: applyMultiplier(blendedFunnel.addToCart),
        icon: <ShoppingCart className="h-4 w-4" />,
        gradientFrom: 'from-indigo-500',
        gradientTo: 'to-violet-500',
        textColor: 'text-violet-400',
      },
      {
        label: 'Checkout Initiated',
        value: applyMultiplier(blendedFunnel.checkoutInitiated),
        icon: <CreditCard className="h-4 w-4" />,
        gradientFrom: 'from-violet-500',
        gradientTo: 'to-purple-500',
        textColor: 'text-purple-400',
      },
      {
        label: 'Purchases',
        value: applyMultiplier(blendedFunnel.purchases),
        icon: <Package className="h-4 w-4" />,
        gradientFrom: 'from-emerald-500',
        gradientTo: 'to-emerald-600',
        textColor: 'text-emerald-400',
      },
    ];
  }, [blendedFunnel, applyMultiplier]);

  // ── Blended rate info between each pair of stages ────────────────────
  const blendedRates: BlendedRateInfo[] = useMemo(() => {
    if (!blendedFunnel) return [];

    const linkClicks = applyMultiplier(blendedFunnel.linkClicks) || 1;
    const landingPageViews = applyMultiplier(blendedFunnel.landingPageViews) || 0;
    const atc = applyMultiplier(blendedFunnel.addToCart) || 0;
    const checkout = applyMultiplier(blendedFunnel.checkoutInitiated) || 0;
    const purchases = applyMultiplier(blendedFunnel.purchases) || 0;

    const lpvRate = (landingPageViews / linkClicks) * 100;
    const atcRate = landingPageViews > 0 ? (atc / landingPageViews) * 100 : 0;
    const checkoutRate = atc > 0 ? (checkout / atc) * 100 : 0;
    const purchaseRate = checkout > 0 ? (purchases / checkout) * 100 : 0;

    return [
      {
        primaryLabel: 'Landing Page View Rate',
        primaryRate: lpvRate,
        secondaryLabel: 'Bounce Rate',
        secondaryRate: 100 - lpvRate,
        thresholds: { green: 65, amber: 50 },
      },
      {
        primaryLabel: 'ATC Rate',
        primaryRate: atcRate,
        thresholds: { green: 10, amber: 5 },
      },
      {
        primaryLabel: 'Checkout Rate',
        primaryRate: checkoutRate,
        secondaryLabel: 'Cart Abandonment',
        secondaryRate: 100 - checkoutRate,
        thresholds: { green: 50, amber: 30 },
      },
      {
        primaryLabel: 'Conversion Rate',
        primaryRate: purchaseRate,
        thresholds: { green: 60, amber: 40 },
      },
    ];
  }, [blendedFunnel, applyMultiplier]);

  // ── Resolve active stages ────────────────────────────────────────────
  const stages =
    source === 'facebook'
      ? fbStages
      : source === 'shopify'
        ? shopifyStages
        : blendedStages;

  const maxValue = stages[0]?.value || 1;

  // ── Previous period data for comparison ──────────────────────────────
  const previousStages: FunnelStage[] = useMemo(() => {
    if (!showCompare) return [];
    return stages.map((stage, i) => ({
      ...stage,
      value: previousValue(stage.value, i + source.length),
    }));
  }, [stages, showCompare, source]);

  // ── Overall conversion rate ──────────────────────────────────────────
  const overallConversion = useMemo(() => {
    if (stages.length < 2) return null;

    const firstValue = stages[0].value;
    const lastValue = stages[stages.length - 1].value;

    let fromLabel: string;
    let toLabel: string;

    if (source === 'facebook') {
      fromLabel = 'Impressions';
      toLabel = 'Purchases';
    } else if (source === 'shopify') {
      fromLabel = 'Sessions';
      toLabel = 'Purchase';
    } else {
      fromLabel = 'Link Clicks';
      toLabel = 'Purchases';
    }

    const rate = firstValue > 0 ? (lastValue / firstValue) * 100 : 0;

    // Previous period overall conversion
    let prevRate: number | null = null;
    if (showCompare && previousStages.length >= 2) {
      const prevFirst = previousStages[0].value;
      const prevLast = previousStages[previousStages.length - 1].value;
      prevRate = prevFirst > 0 ? (prevLast / prevFirst) * 100 : 0;
    }

    return { fromLabel, toLabel, rate, prevRate };
  }, [stages, previousStages, source, showCompare]);

  // ── Bottom summary metrics ───────────────────────────────────────────
  const bottomMetrics = useMemo(() => {
    if (source === 'facebook') {
      const impressions = stages[0]?.value ?? 0;
      const clicks = stages[1]?.value ?? 0;
      const conversions = stages[4]?.value ?? 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const convRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
      const overallFunnel = impressions > 0 ? (conversions / impressions) * 100 : 0;
      return [
        { label: 'Click-through Rate', value: `${ctr.toFixed(2)}%` },
        { label: 'Conversion Rate', value: `${convRate.toFixed(2)}%` },
        { label: 'Overall Funnel', value: `${overallFunnel.toFixed(3)}%` },
      ];
    }

    if (source === 'shopify') {
      if (stages.length === 0) return [];
      const sessions = stages[0]?.value ?? 0;
      const atcVal = stages[2]?.value ?? 0;
      const checkoutVal = stages[3]?.value ?? 0;
      const purchaseVal = stages[4]?.value ?? 0;
      const browseToAtc = sessions > 0 ? (atcVal / sessions) * 100 : 0;
      const cartToCheckout = atcVal > 0 ? (checkoutVal / atcVal) * 100 : 0;
      const checkoutConversion = checkoutVal > 0 ? (purchaseVal / checkoutVal) * 100 : 0;
      return [
        { label: 'Browse-to-ATC Rate', value: `${browseToAtc.toFixed(2)}%` },
        { label: 'Cart-to-Checkout Rate', value: `${cartToCheckout.toFixed(2)}%` },
        { label: 'Checkout Conversion', value: `${checkoutConversion.toFixed(2)}%` },
      ];
    }

    // Blended metrics
    if (stages.length === 0) return [];
    const linkClicks = stages[0]?.value || 1;
    const landingPageViews = stages[1]?.value || 1;
    const atcVal = stages[2]?.value || 0;
    const checkout = stages[3]?.value || 1;
    const purchases = stages[4]?.value || 0;

    const overallConv = (purchases / linkClicks) * 100;
    const avgBounce = 100 - (landingPageViews / linkClicks) * 100;
    const cartAbandonment = atcVal > 0 ? 100 - ((checkout / atcVal) * 100) : 0;
    const checkoutCompletion = checkout > 0 ? (purchases / checkout) * 100 : 0;

    return [
      { label: 'Overall Conversion Rate', value: `${overallConv.toFixed(2)}%` },
      { label: 'Avg Bounce Rate', value: `${avgBounce.toFixed(1)}%` },
      { label: 'Cart Abandonment Rate', value: `${cartAbandonment.toFixed(1)}%` },
      { label: 'Checkout Completion', value: `${checkoutCompletion.toFixed(1)}%` },
    ];
  }, [source, stages]);

  // ── Subtitle per mode ────────────────────────────────────────────────
  const subtitle =
    source === 'facebook'
      ? 'Facebook Ads journey from impression to purchase'
      : source === 'shopify'
        ? 'Shopify website journey from session to purchase'
        : 'Blended FB + Shopify journey from link click to purchase';

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
      {/* Header with toggle */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            Conversion Funnel
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
        </div>

        {/* Source toggle — 3 buttons */}
        <div className="flex rounded-md border border-border bg-surface">
          {/* Facebook Ads */}
          <button
            type="button"
            onClick={() => setSource('facebook')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-l-md px-3 py-1.5 text-xs font-medium transition-colors',
              source === 'facebook'
                ? 'bg-blue-500/15 text-blue-400'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Facebook Ads</span>
            <span className="rounded bg-blue-500/15 px-1 text-[9px] font-semibold text-blue-400">
              FB
            </span>
          </button>

          {/* Shopify Website */}
          <button
            type="button"
            onClick={() => setSource('shopify')}
            className={cn(
              'inline-flex items-center gap-1.5 border-l border-border px-3 py-1.5 text-xs font-medium transition-colors',
              source === 'shopify'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.337 3.415c-.026-.018-.06-.027-.095-.027-.035 0-.148.018-.148.018s-.32-.32-.45-.45c-.13-.13-.386-.095-.486-.068-.013 0-.25.078-.61.19A3.7 3.7 0 0 0 13.2 2.3c-.26-.37-.64-.56-1.06-.56h-.05c-.02-.02-.04-.04-.05-.06C11.74 1.34 11.34 1.2 10.98 1.2c-1.04.02-2.08.78-2.93 2.14-.6 .96-.98 2.16-1.1 3.1-.98.3-1.66.51-1.68.52-.5.15-.51.17-.58.64C4.64 8.05 3 20.47 3 20.47l9.97 1.73V3.44c-.2 0-.39-.02-.63-.02v-.003zm-1.53.47c-.56.17-1.18.37-1.8.55.17-.67.5-1.33.92-1.77.15-.16.37-.34.62-.45.25.52.28 1.25.26 1.67zm-1.08-2.16c.2 0 .37.04.52.13-.23.12-.46.3-.67.53-.56.6-.98 1.52-1.15 2.41-.52.16-1.03.32-1.5.46.3-1.32 1.42-3.5 2.8-3.53zM10.4 11.64c.06.97 2.62 1.18 2.76 3.45.11 1.78-1.05 3-2.74 3.1-2.03.11-3.15-1.07-3.15-1.07l.43-1.83s1.12.84 2.02.79c.59-.04.8-.52.78-.85-.08-1.27-2.16-1.19-2.29-3.27-.11-1.75 1.04-3.52 3.57-3.68.98-.06 1.48.19 1.48.19l-.64 2.38s-.65-.29-1.42-.24c-1.13.07-1.14.78-1.13.88l.33-.85z" />
            </svg>
            <span>Shopify Website</span>
            <span className="rounded bg-emerald-500/15 px-1 text-[9px] font-semibold text-emerald-400">
              WEB
            </span>
          </button>

          {/* Blended */}
          <button
            type="button"
            onClick={() => setSource('blended')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-r-md border-l border-border px-3 py-1.5 text-xs font-medium transition-colors',
              source === 'blended'
                ? 'bg-gradient-to-r from-blue-500/15 to-emerald-500/15 text-transparent bg-clip-text'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            <Blend
              className={cn(
                'h-3.5 w-3.5',
                source === 'blended' ? 'text-blue-400' : 'text-current'
              )}
            />
            <span
              className={cn(
                source === 'blended'
                  ? 'bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent'
                  : ''
              )}
            >
              Blended
            </span>
            <span
              className={cn(
                'rounded px-1 text-[9px] font-semibold',
                source === 'blended'
                  ? 'bg-gradient-to-r from-blue-500/15 to-emerald-500/15 text-blue-400'
                  : 'bg-surface text-text-muted'
              )}
            >
              MIX
            </span>
          </button>
        </div>
      </div>

      {/* Date selector row + Compare toggle */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Quick period pills + dropdown */}
        <div className="flex items-center gap-2">
          {/* Quick period pills */}
          <div className="flex rounded-md border border-border bg-surface">
            {quickPeriods.map((qp, idx) => (
              <button
                key={qp.preset}
                type="button"
                onClick={() => setLocalPreset(qp.preset)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  idx === 0 && 'rounded-l-md',
                  idx === quickPeriods.length - 1 && 'rounded-r-md',
                  idx > 0 && 'border-l border-border',
                  localPreset === qp.preset
                    ? 'bg-primary/15 text-primary-light'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Full date preset dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              <Calendar className="h-3.5 w-3.5 text-text-muted" />
              <span>{datePresetLabels[localPreset] ?? 'Last 30 Days'}</span>
              <ChevronDown className="h-3 w-3 text-text-muted" />
            </button>

            {isDateDropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-border bg-surface-elevated py-1 shadow-lg">
                {allPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setLocalPreset(preset);
                      setIsDateDropdownOpen(false);
                    }}
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-xs transition-colors',
                      localPreset === preset
                        ? 'bg-primary/10 font-medium text-primary-light'
                        : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                    )}
                  >
                    {datePresetLabels[preset]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Compare toggle */}
        <button
          type="button"
          onClick={() => setShowCompare(!showCompare)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
            showCompare
              ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
              : 'border-border bg-surface text-text-muted hover:text-text-secondary'
          )}
        >
          <GitCompare className="h-3.5 w-3.5" />
          <span>Compare</span>
        </button>
      </div>

      {/* Funnel stages */}
      <div className="flex flex-col items-center space-y-1">
        {stages.map((stage, index) => {
          const widthPercent = Math.max(
            (stage.value / maxValue) * 100,
            18
          );

          // Simple conversion rate badge for Facebook / Shopify
          const simpleConversionRate =
            source !== 'blended' && index > 0 && stages[index - 1].value > 0
              ? ((stage.value / stages[index - 1].value) * 100).toFixed(1)
              : null;

          // Rich rate info for Blended view
          const rateInfo =
            source === 'blended' && index > 0
              ? blendedRates[index - 1] ?? null
              : null;

          // Comparison data for this stage
          const prevStage = showCompare && previousStages[index] ? previousStages[index] : null;
          const delta =
            prevStage && prevStage.value > 0
              ? ((stage.value - prevStage.value) / prevStage.value) * 100
              : null;

          return (
            <div key={stage.label} className="w-full">
              {/* ── Rate badge between stages ─────────────────────── */}
              {/* Simple badge for Facebook / Shopify */}
              {simpleConversionRate !== null && (
                <div className="flex items-center justify-center py-1">
                  <div className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-0.5">
                    <svg className="h-3 w-3 text-text-dimmed" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M6 2v8M3 7l3 3 3-3"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span
                      className={cn(
                        'text-[10px] font-semibold',
                        source === 'shopify' ? 'text-emerald-400' : 'text-text-secondary'
                      )}
                    >
                      {simpleConversionRate}%
                    </span>
                  </div>
                </div>
              )}

              {/* Rich badge for Blended view */}
              {rateInfo !== null && (
                <div className="flex items-center justify-center py-1.5">
                  <div
                    className={cn(
                      'flex flex-col items-center gap-0.5 rounded-lg border px-4 py-1.5',
                      getRateBgColor(rateInfo.primaryRate, rateInfo.thresholds)
                    )}
                  >
                    {/* Primary rate */}
                    <div className="flex items-center gap-1.5">
                      <ArrowDown className="h-3 w-3 text-text-dimmed" />
                      <span
                        className={cn(
                          'text-[11px] font-bold',
                          getRateColor(rateInfo.primaryRate, rateInfo.thresholds)
                        )}
                      >
                        {rateInfo.primaryRate.toFixed(1)}%
                      </span>
                      <span className="text-[10px] font-medium text-text-muted">
                        {rateInfo.primaryLabel}
                      </span>
                    </div>
                    {/* Secondary rate (e.g. Bounce Rate, Cart Abandonment) */}
                    {rateInfo.secondaryLabel != null && rateInfo.secondaryRate != null && (
                      <div className="flex items-center gap-1.5 pl-4">
                        <span className="text-[10px] font-semibold text-red-400/80">
                          {rateInfo.secondaryRate.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-text-dimmed">
                          {rateInfo.secondaryLabel}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Funnel bar */}
              <div className="flex items-center justify-center">
                <div
                  className="relative overflow-hidden rounded-lg transition-all duration-700 ease-out"
                  style={{ width: `${widthPercent}%`, minHeight: showCompare ? '72px' : '48px' }}
                >
                  {/* Gradient background */}
                  <div
                    className={cn(
                      'absolute inset-0 bg-gradient-to-r opacity-90',
                      stage.gradientFrom,
                      stage.gradientTo
                    )}
                  />
                  {/* Animated shimmer overlay */}
                  <div className="absolute inset-0 animate-shimmer opacity-30" />

                  {/* Content */}
                  <div className="relative flex flex-col px-4 py-2.5">
                    {/* Current period row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-white/80">{stage.icon}</div>
                        <span className="text-xs font-semibold text-white">
                          {stage.label}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-white">
                        {formatNumber(stage.value)}
                      </span>
                    </div>

                    {/* Comparison row (previous period) */}
                    {showCompare && prevStage && (
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10px] font-medium text-white/50">
                          Previous period
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-white/50">
                            {formatNumber(prevStage.value)}
                          </span>
                          {delta !== null && (
                            <span
                              className={cn(
                                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                                delta >= 0
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-red-500/20 text-red-300'
                              )}
                            >
                              {delta >= 0 ? (
                                <ArrowUpRight className="h-2.5 w-2.5" />
                              ) : (
                                <ArrowDownRight className="h-2.5 w-2.5" />
                              )}
                              {delta >= 0 ? '+' : ''}
                              {delta.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall Conversion Rate card */}
      {overallConversion && (
        <div className="mx-auto mt-5 max-w-md">
          <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 p-4">
            <div className="text-center">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
                Overall Conversion Rate
              </p>
              <p className="mt-0.5 text-[10px] text-text-dimmed">
                {overallConversion.fromLabel} &rarr; {overallConversion.toLabel}
              </p>
              <p className="mt-2 text-3xl font-bold text-text-primary">
                {overallConversion.rate.toFixed(3)}%
              </p>

              {/* Comparison for overall conversion */}
              {showCompare && overallConversion.prevRate !== null && (
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="text-xs text-text-muted">
                    Prev: {overallConversion.prevRate.toFixed(3)}%
                  </span>
                  {(() => {
                    const prevR = overallConversion.prevRate;
                    if (prevR === null || prevR === 0) return null;
                    const d = ((overallConversion.rate - prevR) / prevR) * 100;
                    return (
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold',
                          d >= 0
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                        )}
                      >
                        {d >= 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {d >= 0 ? '+' : ''}
                        {d.toFixed(1)}%
                      </span>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom summary metrics */}
      <div
        className={cn(
          'mt-6 grid gap-4 border-t border-border pt-4',
          bottomMetrics.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
        )}
      >
        {bottomMetrics.map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-xs text-text-muted">{m.label}</p>
            <p className="mt-0.5 text-lg font-semibold text-text-primary">
              {m.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
