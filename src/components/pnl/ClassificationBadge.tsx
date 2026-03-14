'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, Loader2, ExternalLink, ChevronDown, Zap, Tag, Check } from 'lucide-react';
import { REVIEW_CONFIDENCE_THRESHOLD } from '@/lib/intelligence/constants';
import type { ProductCategory } from '@/types/productPnl';

interface ClassificationBadgeProps {
  productId: string;
  storeId: string;
  classification: ProductCategory;
  confidence?: number;
  method?: string;
  signals?: Record<string, number> | null;
  behavioralSignals?: string[];
  parentProduct?: string | null;
  needsReview?: boolean;
  manualOverride?: boolean;
  lastAnalyzed?: string;
  shopifyUrl?: string | null;
  onClassificationChange?: (productId: string, newClassification: ProductCategory) => void;
}

const BADGE_CONFIG: Record<string, { color: string; dotClass: string; label: string }> = {
  main: { color: 'text-emerald-600', dotClass: 'bg-emerald-500', label: 'MAIN' },
  upsell: { color: 'text-blue-600', dotClass: 'bg-blue-500', label: 'UPSELL' },
  downsell: { color: 'text-orange-600', dotClass: 'bg-orange-500', label: 'DOWNSELL' },
  bundle: { color: 'text-violet-600', dotClass: 'bg-violet-500', label: 'BUNDLE' },
  excluded: { color: 'text-zinc-400', dotClass: 'bg-zinc-300 border border-zinc-400', label: 'EXCLUDED' },
  pending: { color: 'text-zinc-400', dotClass: '', label: 'PENDING' },
  unknown: { color: 'text-amber-600', dotClass: 'bg-amber-500', label: 'AUTO' },
};

const DROPDOWN_OPTIONS: { key: ProductCategory; label: string; dotClass: string }[] = [
  { key: 'main', label: 'MAIN', dotClass: 'bg-emerald-500' },
  { key: 'upsell', label: 'UPSELL', dotClass: 'bg-blue-500' },
  { key: 'downsell', label: 'DOWNSELL', dotClass: 'bg-orange-500' },
  { key: 'bundle', label: 'BUNDLE', dotClass: 'bg-violet-500' },
  { key: 'excluded', label: 'EXCLUDE', dotClass: 'bg-zinc-300 border border-zinc-400' },
];

const SIGNAL_LABELS: Record<string, string> = {
  alone_pct_score: 'Alone in orders', position_score: 'First item position',
  revenue_score: 'Revenue share', tag_score: 'Shopify tags',
  type_score: 'Product type', title_score: 'Title keywords',
  price_score: 'Price analysis', app_score: 'App detection',
  subscription_score: 'Subscription',
};

export function ClassificationBadge({
  productId, storeId, classification, confidence = 0, method, signals,
  behavioralSignals, parentProduct, needsReview, manualOverride, lastAnalyzed,
  shopifyUrl, onClassificationChange,
}: ClassificationBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowWhy(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isPending = classification === 'pending';
  const isLowConfidence = !isPending && !manualOverride && confidence < REVIEW_CONFIDENCE_THRESHOLD && confidence > 0;
  const effectiveClassification = classification === 'addon' ? 'upsell' : classification;
  const config = BADGE_CONFIG[effectiveClassification] || BADGE_CONFIG.unknown;

  if (isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        PENDING
      </span>
    );
  }

  const showAsAuto = isLowConfidence || effectiveClassification === 'unknown';

  async function handleSelect(newClassification: ProductCategory) {
    setIsOpen(false);
    setShowWhy(false);
    const previousClassification = classification;
    onClassificationChange?.(productId, newClassification);
    await fetch(`/api/intelligence/classifications?storeId=${encodeURIComponent(storeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        classification: newClassification,
        previousClassification,
        signals: signals || {},
      }),
    }).catch(err => console.error('[Classification] Update failed:', err));
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer',
          showAsAuto
            ? 'text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100'
            : `${config.color} hover:opacity-80`,
        )}
      >
        {showAsAuto ? (
          <>
            <AlertTriangle className="h-3 w-3" />
            AUTO
            <ChevronDown className="h-2.5 w-2.5" />
          </>
        ) : (
          <>
            <span className={cn('h-[6px] w-[6px] rounded-full flex-shrink-0', config.dotClass)} />
            {config.label}
            {manualOverride && <span title="Manually set" className="text-[9px] opacity-60">✎</span>}
          </>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-56 bg-surface-elevated border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {DROPDOWN_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSelect(opt.key)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs transition-colors hover:bg-surface-hover',
                effectiveClassification === opt.key && 'font-semibold',
              )}
            >
              <span className={cn('h-[6px] w-[6px] rounded-full flex-shrink-0', opt.dotClass)} />
              <span className="flex-1 text-left text-text-primary">{opt.label}</span>
              {effectiveClassification === opt.key && (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              )}
            </button>
          ))}
          <div className="border-t border-border" />
          <button
            onClick={() => setShowWhy(!showWhy)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Zap className="h-3 w-3" />
            <span>Why auto-detected</span>
          </button>
          {showWhy && (
            <div className="px-3.5 pb-3 space-y-1.5">
              {/* Behavioral signals (from relative classifier) */}
              {behavioralSignals && behavioralSignals.length > 0 ? (
                <>
                  {behavioralSignals.map((signal, i) => {
                    const isMain = signal.toLowerCase().includes('main signal') || signal.toLowerCase().includes('decision: main');
                    const isUpsell = signal.toLowerCase().includes('upsell signal') || signal.toLowerCase().includes('decision: upsell');
                    const isDownsell = signal.toLowerCase().includes('downsell signal') || signal.toLowerCase().includes('decision: downsell');
                    const isNeutral = signal.toLowerCase().includes('neutral') || signal.toLowerCase().includes('decision: unknown');
                    return (
                      <div key={i} className="text-[10px] leading-relaxed">
                        <span className={cn(
                          isMain ? 'text-emerald-600' : isDownsell ? 'text-orange-600' : isUpsell ? 'text-blue-600' : 'text-text-secondary',
                        )}>
                          {signal}
                        </span>
                      </div>
                    );
                  })}
                  {parentProduct && (
                    <div className="text-[10px] text-text-muted pt-1 border-t border-border">
                      Parent product: <strong className="text-text-primary">{parentProduct}</strong>
                    </div>
                  )}
                </>
              ) : signals ? (
                /* Legacy signal scores */
                Object.entries(signals).map(([key, score]) => {
                  if (key === 'main_score' || key === 'upsell_score' || key === 'confidence') return null;
                  if (score === 0) return null;
                  const isMainSignal = score > 0;
                  return (
                    <div key={key} className="flex items-center justify-between text-[10px]">
                      <span className="text-text-secondary">{SIGNAL_LABELS[key] || key}</span>
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-medium',
                        isMainSignal ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600',
                      )}>
                        {isMainSignal ? 'MAIN' : 'UPSELL'}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="text-[10px] text-text-muted">No signal data available</div>
              )}
              <div className="flex gap-3 pt-1.5 mt-1.5 border-t border-border text-[10px] text-text-muted">
                <span>Confidence: <strong className={confidence >= REVIEW_CONFIDENCE_THRESHOLD ? 'text-emerald-500' : 'text-amber-500'}>{confidence}%</strong></span>
                <span>Method: <strong>{method === 'relative_signals' ? 'Behavioral' : method === 'downsell_detection' ? 'Downsell Detection' : method === 'store_structure' ? 'Store Type' : method === 'manual_override' ? 'Manual' : method === 'shopify_tag' ? 'Shopify Tag' : method || 'Auto'}</strong></span>
              </div>
              {lastAnalyzed && (
                <div className="text-[10px] text-text-muted">
                  Last analyzed: {new Date(lastAnalyzed).toLocaleString()}
                </div>
              )}
            </div>
          )}
          {shopifyUrl && (
            <a href={shopifyUrl} target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-text-secondary hover:bg-surface-hover transition-colors border-t border-border">
              <Tag className="h-3 w-3" />
              <span>Set tag in Shopify</span>
              <ExternalLink className="h-2.5 w-2.5 ml-auto" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
