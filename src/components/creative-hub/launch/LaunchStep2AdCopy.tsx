'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  X,
  Sparkles,
  Trophy,
  Link2,
  Info,
  Type,
  AlignLeft,
  FileText,
  Copy,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import type { CopyItem } from '@/types/creativeHub';

const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'BUY_NOW', label: 'Buy Now' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'ORDER_NOW', label: 'Order Now' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'CONTACT_US', label: 'Contact Us' },
];

function generateId() {
  return `copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Types for winning ads API response ──

interface WinningAd {
  adId: string;
  adName: string;
  roas: number;
  spend: number;
  purchases: number;
  ctr: number;
  primaryTexts: string[];
  headlines: string[];
  cta: string;
}

interface UniqueText {
  text: string;
  roas: number;
  spend: number;
  purchases: number;
  ctr: number;
  adCount: number;
}

interface AutoFill {
  primaryTexts: string[];
  headlines: string[];
  cta: string;
}

interface WinnerData {
  winningAds: WinningAd[];
  uniquePrimaryTexts: UniqueText[];
  uniqueHeadlines: UniqueText[];
  autoFill: AutoFill;
}

interface AiInsight {
  winningPatterns: string[];
  bestAngles: string[];
  worstAngles: string[];
  actionItems: string[];
  suggestedPrimaryTexts: string[];
  suggestedHeadlines: string[];
}

function roasColor(roas: number) {
  if (roas >= 2) return 'text-emerald-700 bg-emerald-100';
  if (roas >= 1) return 'text-amber-700 bg-amber-100';
  return 'text-red-700 bg-red-100';
}

function roasBorderColor(roas: number) {
  if (roas >= 2) return 'border-emerald-200';
  if (roas >= 1) return 'border-amber-200';
  return 'border-red-200';
}

export function LaunchStep2AdCopy() {
  const { launchConfig, updateLaunchConfig, copyLibrary, fetchCopyLibrary, generateAICopy, inboxCreatives, selectedCreativeIds, profiles } =
    useCreativeHubStore();
  const { activeStoreId } = useStoreStore();

  const productProfileId = launchConfig.productProfileId;
  const storeId = activeStoreId || '';

  // ── Winning ads data ──
  const [winnerData, setWinnerData] = useState<WinnerData | null>(null);
  const [winnerLoading, setWinnerLoading] = useState(false);

  // ── AI insights data ──
  const [aiInsights, setAiInsights] = useState<AiInsight | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsOpen, setAiInsightsOpen] = useState(false);

  // ── Clone dropdown ──
  const [cloneDropdownOpen, setCloneDropdownOpen] = useState(false);
  const [selectedCloneAd, setSelectedCloneAd] = useState<WinningAd | null>(null);

  // Fetch copy library
  useEffect(() => {
    if (productProfileId) {
      fetchCopyLibrary(productProfileId);
    }
  }, [productProfileId, fetchCopyLibrary]);

  // Fetch winning ads
  useEffect(() => {
    if (!productProfileId || !storeId) return;
    setWinnerLoading(true);
    fetch(`/api/creative-hub/winning-ads?storeId=${encodeURIComponent(storeId)}&productProfileId=${encodeURIComponent(productProfileId)}`)
      .then((r) => r.json())
      .then((data) => setWinnerData(data))
      .catch(() => setWinnerData(null))
      .finally(() => setWinnerLoading(false));
  }, [productProfileId, storeId]);

  const primaryTexts = launchConfig.primaryTexts || [];
  const headlines = launchConfig.headlines || [];
  const descriptions = launchConfig.descriptions || [];
  const ctaType = launchConfig.ctaType || 'SHOP_NOW';
  const advantageCreative = launchConfig.advantageCreative ?? true;
  const usePerCreativeUrls = launchConfig.usePerCreativeUrls ?? false;
  const perCreativeUrls = launchConfig.perCreativeUrls || {};

  const selectedCreatives = inboxCreatives.filter((c) => selectedCreativeIds.has(c.id));

  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiCopyResults, setAiCopyResults] = useState<
    { type: 'primary' | 'headline' | 'description'; text: string }[]
  >([]);
  const [showUrlOverrides, setShowUrlOverrides] = useState(usePerCreativeUrls);

  // ── Copy list helpers ──

  const addPrimaryText = useCallback((item: CopyItem) => {
    const current = useCreativeHubStore.getState().launchConfig.primaryTexts || [];
    if (current.length >= 5) return;
    // Duplicate check
    if (current.some((t) => t.text === item.text)) return;
    updateLaunchConfig({ primaryTexts: [...current, item] });
  }, [updateLaunchConfig]);

  const removePrimaryText = (id: string) => {
    updateLaunchConfig({ primaryTexts: primaryTexts.filter((t) => t.id !== id) });
  };

  const addHeadline = useCallback((item: CopyItem) => {
    const current = useCreativeHubStore.getState().launchConfig.headlines || [];
    if (current.length >= 5) return;
    if (current.some((h) => h.text === item.text)) return;
    updateLaunchConfig({ headlines: [...current, item] });
  }, [updateLaunchConfig]);

  const removeHeadline = (id: string) => {
    updateLaunchConfig({ headlines: headlines.filter((h) => h.id !== id) });
  };

  const addDescription = (item: CopyItem) => {
    if (descriptions.length >= 5) return;
    updateLaunchConfig({ descriptions: [...descriptions, item] });
  };

  const removeDescription = (id: string) => {
    updateLaunchConfig({ descriptions: descriptions.filter((d) => d.id !== id) });
  };

  // ── Auto-Fill Winners ──
  const handleAutoFill = () => {
    if (!winnerData?.autoFill) return;
    const newPTs: CopyItem[] = winnerData.autoFill.primaryTexts.map((text) => ({
      id: generateId(),
      text,
      source: 'winner' as const,
    }));
    const newHLs: CopyItem[] = winnerData.autoFill.headlines.map((text) => ({
      id: generateId(),
      text,
      source: 'winner' as const,
    }));
    updateLaunchConfig({
      primaryTexts: newPTs,
      headlines: newHLs,
      ctaType: winnerData.autoFill.cta || ctaType,
    });
  };

  // ── Clone from Ad ──
  const handleCloneAd = (ad: WinningAd) => {
    const newPTs: CopyItem[] = ad.primaryTexts.map((text) => ({
      id: generateId(),
      text,
      source: 'winner' as const,
      sourceRoas: ad.roas,
    }));
    const newHLs: CopyItem[] = ad.headlines.map((text) => ({
      id: generateId(),
      text,
      source: 'winner' as const,
      sourceRoas: ad.roas,
    }));
    updateLaunchConfig({
      primaryTexts: newPTs,
      headlines: newHLs,
      ctaType: ad.cta || ctaType,
    });
  };

  // ── Fetch AI Insights ──
  const fetchAiInsights = useCallback(async () => {
    if (!productProfileId || !storeId) return;
    setAiInsightsLoading(true);
    try {
      const res = await fetch(
        `/api/creative-hub/ai-insights?storeId=${encodeURIComponent(storeId)}&productProfileId=${encodeURIComponent(productProfileId)}`
      );
      const data = await res.json();
      setAiInsights(data);
    } catch {
      setAiInsights(null);
    } finally {
      setAiInsightsLoading(false);
    }
  }, [productProfileId, storeId]);

  // ── AI generation (existing) ──
  const handleGenerateAICopy = async () => {
    if (!productProfileId) return;
    setAiGenerating(true);
    try {
      const context = [
        primaryTexts.length > 0 ? `Existing primary texts: ${primaryTexts.map((t) => t.text).join(' | ')}` : '',
        headlines.length > 0 ? `Existing headlines: ${headlines.map((h) => h.text).join(' | ')}` : '',
      ].filter(Boolean).join('. ');

      const latestProfiles = useCreativeHubStore.getState().profiles;
      const selectedProfile = latestProfiles.find((p) => p.id === productProfileId);
      const productName = selectedProfile?.productName || 'Product';
      await generateAICopy(productProfileId, productName, context || 'Generate fresh ad copy suggestions');

      const { copyLibrary: updatedLibrary } = useCreativeHubStore.getState();
      const aiCopies = updatedLibrary.filter((c) => c.isAiGenerated).slice(0, 6);

      const results: { type: 'primary' | 'headline' | 'description'; text: string }[] = [];
      for (const copy of aiCopies) {
        if (copy.primaryText) results.push({ type: 'primary', text: copy.primaryText });
        if (copy.headline) results.push({ type: 'headline', text: copy.headline });
        if (copy.description) results.push({ type: 'description', text: copy.description });
      }

      if (results.length > 0) {
        setAiCopyResults(results);
      } else {
        setAiCopyResults([]);
      }
    } catch {
      // Silent fail
    } finally {
      setAiGenerating(false);
    }
  };

  const totalCombinations = Math.max(primaryTexts.length, 1) * Math.max(headlines.length, 1) * Math.max(descriptions.length, 1);

  const topAds = winnerData?.winningAds?.slice(0, 5) || [];
  const uniquePTs = winnerData?.uniquePrimaryTexts?.slice(0, 8) || [];
  const uniqueHLs = winnerData?.uniqueHeadlines?.slice(0, 5) || [];

  return (
    <div className="space-y-8">
      {/* ══════════════════════════════════════════════
          Section 1: Winner Copy Library — Action Buttons
          ══════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900">Winner Copy Library</h3>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Auto-Fill Winners */}
          <button
            onClick={handleAutoFill}
            disabled={winnerLoading || !winnerData?.autoFill}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
              'bg-blue-600 text-white hover:bg-blue-700',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            <Zap className="h-4 w-4" />
            Auto-Fill Winners
          </button>

          {/* Clone from Ad Dropdown */}
          <div className="relative">
            <button
              onClick={() => setCloneDropdownOpen(!cloneDropdownOpen)}
              disabled={winnerLoading || topAds.length === 0}
              className={cn(
                'flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              <Copy className="h-4 w-4" />
              Clone from Ad
              <ChevronDown className={cn('h-4 w-4 transition-transform', cloneDropdownOpen && 'rotate-180')} />
            </button>
            {cloneDropdownOpen && topAds.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="max-h-60 overflow-y-auto p-1">
                  {topAds.map((ad) => (
                    <button
                      key={ad.adId}
                      onClick={() => {
                        setSelectedCloneAd(ad);
                        setCloneDropdownOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <span className={cn('flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold', roasColor(ad.roas))}>
                        {ad.roas.toFixed(1)}x
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-800">{ad.adName}</p>
                        <p className="text-[10px] text-slate-500">
                          ${ad.spend.toFixed(0)} spent
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          Section 2: Top Performing Primary Texts
          ══════════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlignLeft className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-900">Top Performing Primary Texts</h3>
          {uniquePTs.length > 0 && (
            <span className="text-xs text-slate-400">({uniquePTs.length} unique, ranked by ROAS)</span>
          )}
        </div>

        {winnerLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
            ))}
          </div>
        ) : uniquePTs.length > 0 ? (
          <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
            {uniquePTs.map((pt, idx) => (
              <div
                key={idx}
                className={cn('rounded-xl border bg-white p-3', roasBorderColor(pt.roas))}
              >
                <p className="mb-2 line-clamp-3 text-xs text-slate-700">{pt.text}</p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', roasColor(pt.combinedRoas ?? pt.roas ?? 0))}>
                      ROAS: {(pt.combinedRoas ?? pt.roas ?? 0).toFixed(1)}x
                    </span>
                    <span className="text-[10px] text-slate-500">${(pt.combinedSpend ?? pt.spend ?? 0).toFixed(0)} spend</span>
                    <span className="text-[10px] text-slate-500">{pt.purchases ?? 0} purchases</span>
                    {(pt.avgCtr ?? pt.ctr) != null && <span className="text-[10px] text-slate-500">CTR: {(pt.avgCtr ?? pt.ctr ?? 0).toFixed(1)}%</span>}
                    <span className="text-[10px] text-slate-400">Used in {pt.adCount ?? 0} ads</span>
                  </div>
                  <button
                    onClick={() =>
                      addPrimaryText({
                        id: generateId(),
                        text: pt.text,
                        source: 'winner',
                        sourceRoas: pt.roas,
                      })
                    }
                    disabled={primaryTexts.length >= 5}
                    className="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + Use PT
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <AlignLeft className="mx-auto h-5 w-5 text-slate-400" />
            <p className="mt-2 text-sm text-slate-500">No winning primary texts found.</p>
            <p className="text-xs text-slate-400">Run creative tests to discover top-performing copy.</p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          Section 3: Top Performing Headlines
          ══════════════════════════════════════════════ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-slate-900">Top Performing Headlines</h3>
          {uniqueHLs.length > 0 && (
            <span className="text-xs text-slate-400">({uniqueHLs.length} unique)</span>
          )}
        </div>

        {winnerLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
            ))}
          </div>
        ) : uniqueHLs.length > 0 ? (
          <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
            {uniqueHLs.map((hl, idx) => (
              <div
                key={idx}
                className={cn('rounded-xl border bg-white p-3', roasBorderColor(hl.roas))}
              >
                <p className="mb-2 text-xs font-semibold text-slate-700">{hl.text}</p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', roasColor(hl.combinedRoas ?? hl.roas ?? 0))}>
                      ROAS: {(hl.combinedRoas ?? hl.roas ?? 0).toFixed(1)}x
                    </span>
                    <span className="text-[10px] text-slate-500">${(hl.combinedSpend ?? hl.spend ?? 0).toFixed(0)} spend</span>
                    <span className="text-[10px] text-slate-500">{hl.purchases ?? 0} purchases</span>
                    {(hl.avgCtr ?? hl.ctr) != null && <span className="text-[10px] text-slate-500">CTR: {(hl.avgCtr ?? hl.ctr ?? 0).toFixed(1)}%</span>}
                    <span className="text-[10px] text-slate-400">Used in {hl.adCount ?? 0} ads</span>
                  </div>
                  <button
                    onClick={() =>
                      addHeadline({
                        id: generateId(),
                        text: hl.text,
                        source: 'winner',
                        sourceRoas: hl.roas,
                      })
                    }
                    disabled={headlines.length >= 5}
                    className="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + Use HL
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <Type className="mx-auto h-5 w-5 text-slate-400" />
            <p className="mt-2 text-sm text-slate-500">No winning headlines found.</p>
            <p className="text-xs text-slate-400">Headlines will appear here once tests produce data.</p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          Section 4: Clone from Winning Ad (preview)
          ══════════════════════════════════════════════ */}
      {selectedCloneAd && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">Clone from Winning Ad</h3>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">
                  {selectedCloneAd.adName}
                </span>
                <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', roasColor(selectedCloneAd.roas))}>
                  ROAS {selectedCloneAd.roas.toFixed(1)}x
                </span>
              </div>
              <button
                onClick={() => setSelectedCloneAd(null)}
                className="rounded p-1 text-slate-400 transition-colors hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs text-slate-700">
              {selectedCloneAd.primaryTexts.map((pt, i) => (
                <p key={i}>
                  <span className="font-semibold text-slate-500">PT{i + 1}:</span>{' '}
                  <span className="line-clamp-1">{pt}</span>
                </p>
              ))}
              {selectedCloneAd.headlines.map((hl, i) => (
                <p key={i}>
                  <span className="font-semibold text-slate-500">HL{i + 1}:</span> {hl}
                </p>
              ))}
              <p>
                <span className="font-semibold text-slate-500">CTA:</span>{' '}
                {CTA_OPTIONS.find((c) => c.value === selectedCloneAd.cta)?.label || selectedCloneAd.cta}
              </p>
            </div>

            <button
              onClick={() => handleCloneAd(selectedCloneAd)}
              className="mt-3 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Copy className="h-3.5 w-3.5" />
              Clone All to New Ad
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          Section 5: AI Insights (collapsible)
          ══════════════════════════════════════════════ */}
      <div className="rounded-xl border border-violet-200 bg-violet-50/30">
        <button
          onClick={() => {
            const nextOpen = !aiInsightsOpen;
            setAiInsightsOpen(nextOpen);
            if (nextOpen && !aiInsights && !aiInsightsLoading) {
              fetchAiInsights();
            }
          }}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900">AI Analysis</h3>
            {aiInsightsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-500" />}
          </div>
          <ChevronRight className={cn('h-4 w-4 text-slate-400 transition-transform', aiInsightsOpen && 'rotate-90')} />
        </button>

        {aiInsightsOpen && (
          <div className="border-t border-violet-200 px-4 pb-4 pt-3">
            {aiInsightsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 w-3/4 animate-pulse rounded bg-violet-100" />
                ))}
              </div>
            ) : aiInsights ? (
              <div className="space-y-4">
                {/* Winning Patterns */}
                {aiInsights.winningPatterns?.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold text-slate-700">Winning Patterns</h4>
                    <ul className="space-y-1">
                      {aiInsights.winningPatterns.map((p, i) => (
                        <li key={i} className="text-xs text-slate-600">- {p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Best Angles */}
                {aiInsights.bestAngles?.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold text-emerald-700">Best Angles</h4>
                    <ul className="space-y-1">
                      {aiInsights.bestAngles.map((a, i) => (
                        <li key={i} className="text-xs text-slate-600">- {a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Worst Angles */}
                {aiInsights.worstAngles?.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold text-red-700">Worst Angles</h4>
                    <ul className="space-y-1">
                      {aiInsights.worstAngles.map((a, i) => (
                        <li key={i} className="text-xs text-slate-600">- {a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action Items */}
                {aiInsights.actionItems?.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold text-slate-700">Action Items</h4>
                    <ul className="space-y-1">
                      {aiInsights.actionItems.map((a, i) => (
                        <li key={i} className="text-xs text-slate-600">- {a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggested PTs */}
                {aiInsights.suggestedPrimaryTexts?.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold text-blue-700">Suggested Primary Texts</h4>
                    <div className="space-y-1.5">
                      {aiInsights.suggestedPrimaryTexts.map((text, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2">
                          <p className="flex-1 text-xs text-slate-700">{text}</p>
                          <button
                            onClick={() =>
                              addPrimaryText({
                                id: generateId(),
                                text,
                                source: 'ai_generated',
                              })
                            }
                            disabled={primaryTexts.length >= 5}
                            className="flex-shrink-0 rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            + Add
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested Headlines */}
                {aiInsights.suggestedHeadlines?.length > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-xs font-semibold text-amber-700">Suggested Headlines</h4>
                    <div className="space-y-1.5">
                      {aiInsights.suggestedHeadlines.map((text, i) => (
                        <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2">
                          <p className="flex-1 text-xs font-medium text-slate-700">{text}</p>
                          <button
                            onClick={() =>
                              addHeadline({
                                id: generateId(),
                                text,
                                source: 'ai_generated',
                              })
                            }
                            disabled={headlines.length >= 5}
                            className="flex-shrink-0 rounded-lg border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            + Add
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Regenerate button */}
                <button
                  onClick={fetchAiInsights}
                  disabled={aiInsightsLoading}
                  className="flex items-center gap-2 rounded-xl border border-violet-200 px-3 py-2 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', aiInsightsLoading && 'animate-spin')} />
                  Regenerate
                </button>
              </div>
            ) : (
              <div className="text-center">
                <Sparkles className="mx-auto h-5 w-5 text-violet-300" />
                <p className="mt-2 text-xs text-slate-500">No AI insights available.</p>
                <button
                  onClick={fetchAiInsights}
                  className="mt-2 text-xs font-medium text-violet-600 hover:text-violet-800"
                >
                  Try loading insights
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          Section 6: Your Ad Copy (existing inputs)
          ══════════════════════════════════════════════ */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-t border-slate-200 pt-6">
          <FileText className="h-5 w-5 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Your Ad Copy</h3>
        </div>

        {/* AI Copy Generator */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900">AI Copy Generator</h3>
          </div>

          <button
            onClick={handleGenerateAICopy}
            disabled={aiGenerating}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100',
              aiGenerating && 'cursor-not-allowed opacity-60'
            )}
          >
            <Sparkles className="h-4 w-4" />
            {aiGenerating ? 'Generating...' : 'Generate AI Copy Suggestions'}
          </button>

          <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {aiCopyResults.map((result, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <span
                  className={cn(
                    'mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                    result.type === 'primary' && 'bg-blue-100 text-blue-700',
                    result.type === 'headline' && 'bg-amber-100 text-amber-700',
                    result.type === 'description' && 'bg-emerald-100 text-emerald-700'
                  )}
                >
                  {result.type === 'primary' ? 'PT' : result.type === 'headline' ? 'HL' : 'DESC'}
                </span>
                <p className="flex-1 text-xs text-slate-700">{result.text}</p>
                <button
                  onClick={() => {
                    const item: CopyItem = {
                      id: generateId(),
                      text: result.text,
                      source: 'ai_generated',
                    };
                    if (result.type === 'primary') addPrimaryText(item);
                    else if (result.type === 'headline') addHeadline(item);
                    else addDescription(item);
                  }}
                  disabled={
                    (result.type === 'primary' && primaryTexts.length >= 5) ||
                    (result.type === 'headline' && headlines.length >= 5) ||
                    (result.type === 'description' && descriptions.length >= 5)
                  }
                  className="flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Primary Texts */}
        <CopyListSection
          icon={AlignLeft}
          title="Primary Texts"
          items={primaryTexts}
          max={5}
          onRemove={removePrimaryText}
          onAdd={(text) => addPrimaryText({ id: generateId(), text, source: 'manual' })}
        />

        {/* Headlines */}
        <CopyListSection
          icon={Type}
          title="Headlines"
          items={headlines}
          max={5}
          onRemove={removeHeadline}
          onAdd={(text) => addHeadline({ id: generateId(), text, source: 'manual' })}
        />

        {/* Descriptions */}
        <CopyListSection
          icon={FileText}
          title="Descriptions"
          items={descriptions}
          max={5}
          onRemove={removeDescription}
          onAdd={(text) => addDescription({ id: generateId(), text, source: 'manual' })}
        />
      </div>

      {/* Per-creative URL Override */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Per-Creative URL Overrides</span>
          </label>
          <button
            onClick={() => {
              const next = !showUrlOverrides;
              setShowUrlOverrides(next);
              updateLaunchConfig({ usePerCreativeUrls: next });
            }}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              showUrlOverrides ? 'bg-blue-600' : 'bg-slate-200'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                showUrlOverrides ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {showUrlOverrides && selectedCreatives.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            {selectedCreatives.map((creative) => (
              <div key={creative.id} className="flex items-center gap-3">
                <span className="w-40 truncate text-xs font-medium text-slate-600">
                  {creative.creativeName}
                </span>
                <input
                  type="url"
                  value={perCreativeUrls[creative.id] || ''}
                  onChange={(e) =>
                    updateLaunchConfig({
                      perCreativeUrls: { ...perCreativeUrls, [creative.id]: e.target.value },
                    })
                  }
                  placeholder="https://yourstore.com/product"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA + Advantage+ Creative */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Call to Action</label>
          <select
            value={ctaType}
            onChange={(e) => updateLaunchConfig({ ctaType: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CTA_OPTIONS.map((cta) => (
              <option key={cta.value} value={cta.value}>
                {cta.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Advantage+ Creative
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const next = !advantageCreative;
                updateLaunchConfig({ advantageCreative: next });
              }}
              className={cn(
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                advantageCreative ? 'bg-blue-600' : 'bg-slate-200'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                  advantageCreative ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
            <span className="text-sm text-slate-600">
              {advantageCreative ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Let Meta optimize creative elements automatically.
          </p>
        </div>
      </div>

      {/* Combination Info Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
        <p className="text-sm text-blue-800">
          <span className="font-semibold">{primaryTexts.length}</span> PT{primaryTexts.length !== 1 ? 's' : ''}{' '}
          &times; <span className="font-semibold">{headlines.length}</span> HL{headlines.length !== 1 ? 's' : ''}{' '}
          &times; <span className="font-semibold">{descriptions.length}</span> Desc{descriptions.length !== 1 ? 's' : ''}{' '}
          = <span className="font-bold">{totalCombinations}</span> combination{totalCombinations !== 1 ? 's' : ''} per creative
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ──

function CopyListSection({
  icon: Icon,
  title,
  items,
  max,
  onRemove,
  onAdd,
}: {
  icon: React.ElementType;
  title: string;
  items: CopyItem[];
  max: number;
  onRemove: (id: string) => void;
  onAdd: (text: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState('');

  const handleAdd = () => {
    if (newText.trim()) {
      onAdd(newText.trim());
      setNewText('');
      setIsAdding(false);
    }
  };

  const sourceLabel = (source: CopyItem['source']) => {
    switch (source) {
      case 'winner':
        return 'Winner';
      case 'ai_generated':
        return 'AI';
      case 'manual':
        return 'Manual';
    }
  };

  const sourceBadgeClass = (source: CopyItem['source']) => {
    switch (source) {
      case 'winner':
        return 'bg-emerald-100 text-emerald-700';
      case 'ai_generated':
        return 'bg-violet-100 text-violet-700';
      case 'manual':
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <span className="text-xs text-slate-400">
            {items.length}/{max}
          </span>
        </div>
        {items.length < max && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" />
            Add Manual
          </button>
        )}
      </div>

      {items.map((item, idx) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
        >
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
            {idx + 1}
          </span>
          <p className="flex-1 text-xs text-slate-700">{item.text}</p>
          <span
            className={cn(
              'mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold',
              sourceBadgeClass(item.source)
            )}
          >
            {sourceLabel(item.source)}
            {item.sourceRoas != null && ` ${item.sourceRoas.toFixed(1)}x`}
          </span>
          <button
            onClick={() => onRemove(item.id)}
            className="flex-shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {isAdding && (
        <div className="flex items-start gap-2">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={`Enter ${title.toLowerCase().replace(/s$/, '')} text...`}
            rows={2}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewText('');
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !isAdding && (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-center text-xs text-slate-400">
          No {title.toLowerCase()} added yet. Add from winners, AI suggestions, or manually.
        </p>
      )}
    </div>
  );
}
