'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  BookOpen,
  RefreshCw,
  Download,
  Copy,
  Check,
  Rocket,
  Settings2,
  ChevronDown,
  ChevronUp,
  Bot,
  CircleAlert,
  CircleCheck,
  CircleX,
  Loader2,
  Plus,
  Trophy,
} from 'lucide-react';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { CopyCard } from '@/components/creative-hub/CopyCard';
import { cn, formatCurrency, formatRoas, formatPercentage, formatNumber } from '@/lib/utils';
import toast from 'react-hot-toast';

// ── Types ──

interface CopyLibraryTabProps {
  storeId: string;
}

type SortOption = 'roas' | 'cpa' | 'date' | 'spend';

interface WinnerMetrics {
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  cpm: number;
  cpc: number;
  ctr: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

interface WinnerCreative {
  headline: string;
  body: string;
  ctaType: string;
  thumbnailUrl: string;
  destinationUrl: string;
  type: string;
}

interface WinningAd {
  id: string;
  name: string;
  creative: WinnerCreative;
  metrics: WinnerMetrics;
  allPTs?: string[];
  allHeadlines?: string[];
}

interface UniquePT {
  text: string;
  combinedRoas: number;
  combinedSpend: number;
  combinedRevenue: number;
  purchases: number;
  adCount: number;
  avgCtr: number;
  avgCpa: number;
}

interface WinnerData {
  uniquePTs: UniquePT[];
  winningAds: WinningAd[];
  stats: { totalAds: number; totalLinkedCampaigns: number };
}

interface AIInsightPattern {
  type: 'winning' | 'best' | 'avoid';
  label: string;
  detail: string;
}

interface AISuggestedPT {
  text: string;
}

interface AIInsightsData {
  patterns: AIInsightPattern[];
  executiveSummary: string;
  actionItems: string[];
  suggestedPTs: AISuggestedPT[];
}

// ── Helpers ──

function roasColor(roas: number): string {
  if (roas >= 2) return 'text-emerald-600 dark:text-emerald-400';
  if (roas >= 1) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function roasBgColor(roas: number): string {
  if (roas >= 2) return 'bg-emerald-50 dark:bg-emerald-900/20';
  if (roas >= 1) return 'bg-amber-50 dark:bg-amber-900/20';
  return 'bg-red-50 dark:bg-red-900/20';
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

// ── Skeleton components ──

function WinnerCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="h-16 w-16 rounded-lg bg-surface-hover shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-surface-hover" />
          <div className="h-3 w-1/2 rounded bg-surface-hover" />
          <div className="h-3 w-1/3 rounded bg-surface-hover" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-surface-hover" />
        ))}
      </div>
    </div>
  );
}

function AIInsightsSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-4 w-full rounded bg-surface-hover" />
      ))}
      <div className="h-4 w-2/3 rounded bg-surface-hover" />
    </div>
  );
}

// ── Top Performer Card ──

function TopPerformerCard({ pt, index }: { pt: UniquePT; index: number }) {
  const [copied, setCopied] = useState(false);
  const openLaunchWizard = useCreativeHubStore((s) => s.openLaunchWizard);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pt.text);
      setCopied(true);
      toast.success('Copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleUseInTest = () => {
    openLaunchWizard();
    toast.success('Launch Wizard opened - paste the copied text');
  };

  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm overflow-hidden hover:border-border-hover transition-colors">
      {/* Rank badge + copy content */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Rank */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface font-semibold text-sm text-text-secondary border border-border">
            #{index + 1}
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="text-sm text-text-primary leading-relaxed">
              <span className="font-medium text-text-secondary">PT: </span>
              <span className="italic">&ldquo;{truncateText(pt.text, 120)}&rdquo;</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-border mx-4 rounded-lg overflow-hidden mb-3">
        <MetricCell
          label="ROAS"
          value={formatRoas(pt.combinedRoas)}
          className={roasColor(pt.combinedRoas)}
          bgClassName={roasBgColor(pt.combinedRoas)}
        />
        <MetricCell
          label="CPA"
          value={formatCurrency(pt.avgCpa)}
          className="text-text-primary"
        />
        <MetricCell
          label="CTR"
          value={formatPercentage(pt.avgCtr)}
          className="text-text-primary"
        />
        <MetricCell
          label="Spend"
          value={formatCurrency(pt.combinedSpend)}
          className="text-text-primary"
        />
        <MetricCell
          label="Revenue"
          value={formatCurrency(pt.combinedRevenue)}
          className="text-text-primary"
        />
        <MetricCell
          label="Purchases"
          value={formatNumber(pt.purchases)}
          className="text-text-primary"
        />
      </div>

      {/* Ad count */}
      <div className="px-4 pb-3">
        <span className="text-xs text-text-dimmed">
          Used in {pt.adCount} ad{pt.adCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            copied
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-text-secondary hover:bg-surface-hover',
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied!' : 'Copy Text'}
        </button>
        <button
          onClick={handleUseInTest}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          <Rocket className="h-3.5 w-3.5" />
          Use in New Test
        </button>
        <button
          onClick={() => {
            openLaunchWizard();
            toast.success('Launch Wizard opened with settings');
          }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Clone All Settings
        </button>
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  className,
  bgClassName,
}: {
  label: string;
  value: string;
  className?: string;
  bgClassName?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-2 px-1.5', bgClassName || 'bg-surface-elevated')}>
      <span className="text-[10px] font-medium text-text-dimmed uppercase tracking-wide">
        {label}
      </span>
      <span className={cn('text-sm font-semibold tabular-nums', className)}>
        {value}
      </span>
    </div>
  );
}

// ── AI Insights Panel ──

function AIInsightsPanel({
  insights,
  loading,
  onRegenerate,
  storeId,
  productFilter,
}: {
  insights: AIInsightsData | null;
  loading: boolean;
  onRegenerate: () => void;
  storeId: string;
  productFilter: string;
}) {
  const [expanded, setExpanded] = useState(true);

  const handleSaveToLibrary = async (text: string) => {
    try {
      const res = await fetch('/api/creative-hub/copy-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productProfileId: productFilter !== 'all' ? productFilter : undefined,
          primaryText: text,
          headline: '',
          description: '',
          cta: '',
          roas: 0,
          totalSpend: 0,
          totalRevenue: 0,
          totalPurchases: 0,
          isAiGenerated: true,
          source: 'ai_insight_suggestion',
        }),
      });
      if (res.ok) {
        toast.success('Saved to library!');
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    }
  };

  const patternIcon = (type: string) => {
    switch (type) {
      case 'winning':
      case 'best':
        return <CircleCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />;
      case 'avoid':
        return <CircleX className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
      default:
        return <CircleAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-800/50 bg-surface-elevated shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-purple-500" />
          <span className="text-sm font-semibold text-text-primary">AI Analysis</span>
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-text-dimmed" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-dimmed" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-purple-200 dark:border-purple-800/50 px-4 py-4">
          {loading && !insights ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              <p className="text-sm text-text-secondary">Analyzing your ad copy patterns...</p>
            </div>
          ) : insights ? (
            <div className="space-y-5">
              {/* Patterns */}
              {insights.patterns.length > 0 && (
                <div className="space-y-2">
                  {insights.patterns.map((p, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {patternIcon(p.type)}
                      <div className="text-sm">
                        <span className="font-medium text-text-primary">{p.label}: </span>
                        <span className="text-text-secondary">{p.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Executive Summary */}
              {insights.executiveSummary && (
                <div>
                  <h4 className="text-xs font-semibold text-text-dimmed uppercase tracking-wide mb-1.5">
                    Executive Summary
                  </h4>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {insights.executiveSummary}
                  </p>
                </div>
              )}

              {/* Action Items */}
              {insights.actionItems.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-text-dimmed uppercase tracking-wide mb-1.5">
                    Action Items
                  </h4>
                  <ol className="list-decimal list-inside space-y-1">
                    {insights.actionItems.map((item, i) => (
                      <li key={i} className="text-sm text-text-secondary">
                        {item}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Suggested PTs */}
              {insights.suggestedPTs.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-text-dimmed uppercase tracking-wide mb-1.5">
                    AI Suggested Primary Texts
                  </h4>
                  <div className="space-y-2">
                    {insights.suggestedPTs.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3"
                      >
                        <span className="text-xs font-medium text-text-dimmed mt-0.5">
                          {i + 1}.
                        </span>
                        <p className="flex-1 text-sm text-text-primary italic">
                          &ldquo;{s.text}&rdquo;
                        </p>
                        <button
                          onClick={() => handleSaveToLibrary(s.text)}
                          className="flex shrink-0 items-center gap-1 rounded-md bg-purple-50 dark:bg-purple-900/20 px-2 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                        >
                          <Plus className="h-3 w-3" />
                          Save to Library
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regenerate */}
              <div className="pt-2 border-t border-border">
                <button
                  onClick={onRegenerate}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                  Regenerate
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <Bot className="h-10 w-10 text-text-dimmed" />
              <p className="text-sm text-text-secondary text-center">
                Click &ldquo;AI Analysis&rdquo; in the header to analyze your top-performing copy patterns.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export function CopyLibraryTab({ storeId }: CopyLibraryTabProps) {
  const {
    copyLibrary,
    profiles,
    fetchCopyLibrary,
    fetchAllCopyLibrary,
    autoPopulateCopyLibrary,
    generateAICopy,
  } = useCreativeHubStore();

  const [productFilter, setProductFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('roas');
  const [generating, setGenerating] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [loading, setLoading] = useState(false);

  // Winner data (from /api/creative-hub/winning-ads)
  const [winnerData, setWinnerData] = useState<WinnerData | null>(null);
  const [winnersLoading, setWinnersLoading] = useState(false);

  // AI insights (loaded on demand)
  const [aiInsights, setAiInsights] = useState<AIInsightsData | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Fetch copy library on mount and when product filter changes
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (productFilter !== 'all') {
          await fetchCopyLibrary(productFilter);
        } else {
          await fetchAllCopyLibrary(storeId);
        }
      } finally {
        setLoading(false);
      }
    };
    if (profiles.length > 0) {
      load();
    }
  }, [productFilter, profiles, storeId, fetchCopyLibrary, fetchAllCopyLibrary]);

  // Fetch winning ads when product filter changes
  useEffect(() => {
    if (productFilter === 'all') {
      // For "all products", fetch for each profile and merge
      if (profiles.length === 0) return;
      setWinnersLoading(true);
      setWinnerData(null);

      const fetchAll = async () => {
        const allPTs: UniquePT[] = [];
        const allAds: WinningAd[] = [];
        let totalAds = 0;
        let totalCampaigns = 0;

        for (const profile of profiles) {
          try {
            const res = await fetch(
              `/api/creative-hub/winning-ads?storeId=${encodeURIComponent(storeId)}&productProfileId=${encodeURIComponent(profile.id)}`,
            );
            if (!res.ok) continue;
            const data = await res.json();
            if (data.uniquePTs) allPTs.push(...data.uniquePTs);
            if (data.winningAds) allAds.push(...data.winningAds);
            totalAds += data.stats?.totalAds ?? 0;
            totalCampaigns += data.stats?.totalLinkedCampaigns ?? 0;
          } catch {
            // Skip failed profiles
          }
        }

        // Deduplicate PTs by text (keep highest ROAS version)
        const ptMap = new Map<string, UniquePT>();
        for (const pt of allPTs) {
          const key = pt.text.trim().toLowerCase();
          if (!ptMap.has(key) || pt.combinedRoas > ptMap.get(key)!.combinedRoas) {
            ptMap.set(key, pt);
          }
        }

        const dedupedPTs = Array.from(ptMap.values())
          .sort((a, b) => b.combinedRoas - a.combinedRoas)
          .slice(0, 15);

        // Deduplicate ads by id
        const adMap = new Map<string, WinningAd>();
        for (const ad of allAds) {
          if (!adMap.has(ad.id)) adMap.set(ad.id, ad);
        }

        const dedupedAds = Array.from(adMap.values())
          .sort((a, b) => b.metrics.roas - a.metrics.roas)
          .slice(0, 20);

        setWinnerData({
          uniquePTs: dedupedPTs,
          winningAds: dedupedAds,
          stats: { totalAds, totalLinkedCampaigns: totalCampaigns },
        });
        setWinnersLoading(false);
      };

      fetchAll();
    } else {
      setWinnersLoading(true);
      setWinnerData(null);

      fetch(
        `/api/creative-hub/winning-ads?storeId=${encodeURIComponent(storeId)}&productProfileId=${encodeURIComponent(productFilter)}`,
      )
        .then((r) => r.json())
        .then((d) => {
          setWinnerData(d);
          setWinnersLoading(false);
        })
        .catch(() => {
          setWinnersLoading(false);
        });
    }

    // Clear AI insights when product changes
    setAiInsights(null);
  }, [productFilter, storeId, profiles]);

  const handleAIAnalysis = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/creative-hub/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productProfileId: productFilter !== 'all' ? productFilter : undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to fetch AI insights');
      }
      const data = await res.json();
      setAiInsights(data);
    } catch (err) {
      console.error('[CopyLibrary] AI insights error:', err);
      toast.error('Failed to load AI insights');
    } finally {
      setAiLoading(false);
    }
  }, [storeId, productFilter]);

  const handleGenerateAI = async () => {
    const targetProfile =
      productFilter !== 'all'
        ? profiles.find((p) => p.id === productFilter)
        : profiles[0];
    if (!targetProfile) return;
    setGenerating(true);
    try {
      await generateAICopy(
        targetProfile.id,
        targetProfile.productName,
        'Generate high-performing ad copy variations',
      );
      toast.success('AI copy generated!');
    } catch {
      toast.error('Failed to generate AI copy');
    } finally {
      setGenerating(false);
    }
  };

  const handleAutoPopulate = async () => {
    const targetProfiles =
      productFilter !== 'all'
        ? profiles.filter((p) => p.id === productFilter)
        : profiles;
    if (targetProfiles.length === 0) return;

    setPopulating(true);
    let totalSaved = 0;
    let totalSkipped = 0;
    let totalAds = 0;
    try {
      for (const profile of targetProfiles) {
        try {
          const result = await autoPopulateCopyLibrary(storeId, profile.id);
          totalSaved += result.saved;
          totalSkipped += result.skipped;
          totalAds += result.totalAdsFound;
        } catch (err) {
          console.error(
            `[CopyLibrary] Auto-populate failed for ${profile.productName}:`,
            err,
          );
        }
      }

      if (totalSaved > 0) {
        toast.success(`Saved ${totalSaved} winning copies from ${totalAds} ads`);
        if (productFilter !== 'all') {
          await fetchCopyLibrary(productFilter);
        } else {
          await fetchAllCopyLibrary(storeId);
        }
      } else if (totalSkipped > 0) {
        toast.success(`All ${totalSkipped} top copies already in library`);
      } else if (totalAds === 0) {
        toast('No ads with copy data found. Run auto-discover first.', {
          icon: '\u2139\uFE0F',
        });
      } else {
        toast('No new copies to add', { icon: '\u2139\uFE0F' });
      }
    } catch {
      toast.error('Failed to auto-populate copy library');
    } finally {
      setPopulating(false);
    }
  };

  const sorted = useMemo(() => {
    const result =
      productFilter !== 'all'
        ? copyLibrary.filter((c) => c.productProfileId === productFilter)
        : [...copyLibrary];

    switch (sortBy) {
      case 'roas':
        result.sort((a, b) => b.roas - a.roas);
        break;
      case 'cpa':
        result.sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
        break;
      case 'date':
        result.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case 'spend':
        result.sort((a, b) => b.totalSpend - a.totalSpend);
        break;
    }

    return result;
  }, [copyLibrary, productFilter, sortBy]);

  const topPerformers = winnerData?.uniquePTs ?? [];

  return (
    <div className="space-y-6">
      {/* ── Section 1: Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Copy Library</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoPopulate}
            disabled={populating || profiles.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {populating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {populating ? 'Populating...' : 'Auto-Populate from Ads'}
          </button>
          <button
            onClick={handleAIAnalysis}
            disabled={aiLoading || profiles.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {aiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            {aiLoading ? 'Analyzing...' : 'AI Analysis'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-text-dimmed">Product:</span>
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="all">All Products</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.productName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-text-dimmed">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="roas">ROAS</option>
            <option value="cpa">CPA</option>
            <option value="date">Date</option>
            <option value="spend">Spend</option>
          </select>
        </div>

        {(loading || winnersLoading) && (
          <RefreshCw className="h-4 w-4 animate-spin text-text-dimmed" />
        )}
      </div>

      {/* ── Section 2: Top Performers ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-text-primary">
            Top Performing Copy
          </h3>
          {winnerData && (
            <span className="text-xs text-text-dimmed">
              ({winnerData.stats.totalAds} ads analyzed across{' '}
              {winnerData.stats.totalLinkedCampaigns} campaigns)
            </span>
          )}
        </div>

        {winnersLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <WinnerCardSkeleton key={i} />
            ))}
          </div>
        ) : topPerformers.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {topPerformers.map((pt, i) => (
              <TopPerformerCard key={pt.text} pt={pt} index={i} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-elevated p-8 text-center">
            <Trophy className="mx-auto h-8 w-8 text-text-dimmed" />
            <p className="mt-2 text-sm text-text-secondary">
              No top performers found. Link campaigns to your product profiles and run
              ads to see winning copy here.
            </p>
          </div>
        )}
      </div>

      {/* ── Section 3: AI Insights (shown when loaded or loading) ── */}
      {(aiInsights || aiLoading) && (
        <AIInsightsPanel
          insights={aiInsights}
          loading={aiLoading}
          onRegenerate={handleAIAnalysis}
          storeId={storeId}
          productFilter={productFilter}
        />
      )}

      {/* ── Section 4: All Saved Copies ── */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">
          All Saved Copies
        </h3>

        {sorted.length === 0 && !loading ? (
          <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-text-dimmed" />
            <p className="mt-4 text-sm text-text-secondary">
              No winning copies saved yet. Click &quot;Auto-Populate from Ads&quot; to
              import top-performing ad copy, or complete creative tests to build your
              library.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sorted.map((copy) => (
              <CopyCard key={copy.id} copy={copy} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
