'use client';

import { useState, useEffect } from 'react';
import { useStoreStore } from '@/stores/storeStore';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Zap,
} from 'lucide-react';

interface HealthData {
  healthScore: number;
  healthBreakdown: Record<string, number>;
  initStatus: string;
  cogsCoverage: {
    total: number;
    configured: number;
    missing: number;
    missingProducts: Array<{ productId: string; productTitle: string }>;
  };
  productCount: number;
  isInitialized: boolean;
}

const HEALTH_ITEMS: Array<{
  key: string;
  label: string;
  maxPoints: number;
  fixUrl: string;
  fixLabel: string;
}> = [
  { key: 'shopify_connected', label: 'Shopify Connected', maxPoints: 20, fixUrl: '/dashboard/settings', fixLabel: 'Connect Shopify' },
  { key: 'meta_connected', label: 'Meta Ads Connected', maxPoints: 20, fixUrl: '/dashboard/settings', fixLabel: 'Connect Meta' },
  { key: 'pixel_installed', label: 'Tracking Pixel Installed', maxPoints: 15, fixUrl: '/dashboard/tracking', fixLabel: 'Install Pixel' },
  { key: 'capi_configured', label: 'CAPI Configured', maxPoints: 10, fixUrl: '/dashboard/tracking', fixLabel: 'Set Up CAPI' },
  { key: 'products_classified', label: 'Products Classified', maxPoints: 10, fixUrl: '/dashboard/settings/pnl', fixLabel: 'Classify Products' },
  { key: 'cogs_configured', label: 'COGS Configured', maxPoints: 10, fixUrl: '/dashboard/settings/pnl', fixLabel: 'Set Up COGS' },
  { key: 'campaigns_mapped', label: 'Campaigns Mapped', maxPoints: 10, fixUrl: '/dashboard/settings/pnl', fixLabel: 'Map Campaigns' },
  { key: 'survey_complete', label: 'Setup Survey Complete', maxPoints: 5, fixUrl: '/dashboard/settings', fixLabel: 'Complete Survey' },
];

export function HealthBanner() {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStoreId) return;

    // Check if previously dismissed for this store
    const dismissKey = `health-banner-dismissed-${activeStoreId}`;
    if (sessionStorage.getItem(dismissKey)) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/intelligence/health?storeId=${encodeURIComponent(activeStoreId)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setHealth(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeStoreId]);

  // Only show after intelligence system is initialized — don't show if tables don't exist yet
  if (loading || dismissed || !health || !health.isInitialized || health.healthScore >= 100) return null;

  const score = health.healthScore;
  const isLow = score < 50;
  const isMedium = score >= 50 && score < 80;

  const bgColor = isLow
    ? 'bg-red-500/10 border-red-500/20'
    : isMedium
      ? 'bg-amber-500/10 border-amber-500/20'
      : 'bg-emerald-500/10 border-emerald-500/20';

  const textColor = isLow
    ? 'text-red-400'
    : isMedium
      ? 'text-amber-400'
      : 'text-emerald-400';

  const Icon = isLow ? AlertTriangle : isMedium ? Zap : CheckCircle2;

  const handleDismiss = () => {
    if (activeStoreId) {
      sessionStorage.setItem(`health-banner-dismissed-${activeStoreId}`, '1');
    }
    setDismissed(true);
  };

  return (
    <div className={`rounded-xl border ${bgColor} mb-4 overflow-hidden`}>
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${textColor}`} />
          <div>
            <span className={`text-sm font-semibold ${textColor}`}>
              Setup {score}% complete
            </span>
            <span className="text-xs text-text-secondary ml-2">
              {score < 100
                ? `${100 - score} points to go — complete setup for accurate P&L`
                : 'All set!'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Progress bar */}
          <div className="w-24 h-2 rounded-full bg-surface-hover overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isLow ? 'bg-red-500' : isMedium ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-md hover:bg-surface-hover transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-text-secondary" />
            ) : (
              <ChevronDown className="h-4 w-4 text-text-secondary" />
            )}
          </button>
          <button
            onClick={handleDismiss}
            className="text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Expanded checklist */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            {HEALTH_ITEMS.map(item => {
              const points = health.healthBreakdown[item.key] || 0;
              const isComplete = points >= item.maxPoints;

              return (
                <div
                  key={item.key}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    isComplete ? 'bg-emerald-500/5' : 'bg-surface-hover/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-text-secondary/30" />
                    )}
                    <span className={isComplete ? 'text-text-secondary' : 'text-text-primary'}>
                      {item.label}
                    </span>
                    <span className="text-xs text-text-secondary/50">
                      +{item.maxPoints}pts
                    </span>
                  </div>
                  {!isComplete && (
                    <a
                      href={item.fixUrl}
                      className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      {item.fixLabel}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* COGS coverage warning */}
          {health.cogsCoverage.missing > 0 && (
            <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2">
              <p className="text-xs text-amber-400">
                <AlertTriangle className="inline h-3 w-3 mr-1" />
                {health.cogsCoverage.missing} product{health.cogsCoverage.missing > 1 ? 's' : ''} showing $0 COGS —{' '}
                <a href="/dashboard/settings/pnl" className="underline hover:text-amber-300">
                  configure costs
                </a>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
