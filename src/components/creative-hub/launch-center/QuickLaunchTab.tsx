'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Film,
  Image,
  Images,
  Loader2,
  Rocket,
  Shuffle,
  Sparkles,
  Type,
  Zap,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type {
  AIInsightsData,
  BatchStrategy,
  CopyItem,
  LaunchConfig,
  WinningCopyRankedItem,
} from '@/types/creativeHub';
import { BatchList } from './BatchList';
import { LaunchConfigPanel } from './LaunchConfigPanel';

interface QuickLaunchTabProps {
  storeId: string;
}

type CopyKey = 'primaryTexts' | 'headlines' | 'descriptions';
type SectionTone = 'blue' | 'amber' | 'emerald';
type AISuggestedCopyItem = {
  text: string;
  reasoning: string;
};
type AISuggestedCopyGroups = Record<CopyKey, AISuggestedCopyItem[]>;

const BUILD_PRESETS: Array<{
  label: string;
  helper: string;
  size: number;
  strategy: BatchStrategy;
}> = [
  {
    label: '1 / ad set',
    helper: 'Winner vs challenger',
    size: 1,
    strategy: 'one_per_adset',
  },
  {
    label: '3 / ad set',
    helper: 'Balanced batch test',
    size: 3,
    strategy: 'sequential',
  },
  {
    label: 'Smart mix',
    helper: 'Angle-aware lanes',
    size: 3,
    strategy: 'smart_mix',
  },
  {
    label: 'Folder split',
    helper: 'Keep concept families together',
    size: 3,
    strategy: 'by_folder',
  },
];

const COPY_SECTIONS: Array<{
  key: CopyKey;
  title: string;
  empty: string;
  tone: SectionTone;
}> = [
  {
    key: 'primaryTexts',
    title: 'Primary text',
    empty: 'Top winning primary text will show here once history loads.',
    tone: 'blue',
  },
  {
    key: 'headlines',
    title: 'Headlines',
    empty: 'Headline winners will show here once history loads.',
    tone: 'amber',
  },
  {
    key: 'descriptions',
    title: 'Descriptions',
    empty: 'Description winners will show here once history loads.',
    tone: 'emerald',
  },
];

// Facebook quick-launch flow: description fields are intentionally hidden to keep UX focused.
const SHOW_DESCRIPTION_SECTION_IN_FACEBOOK = false;

function createCopyItem(
  text: string,
  source: CopyItem['source'],
  extras?: Partial<CopyItem>,
): CopyItem {
  return {
    id: `${source}-${text.slice(0, 24).replace(/\s+/g, '-').toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    source,
    sourceCopyId: extras?.sourceCopyId,
    sourceRoas: extras?.sourceRoas,
  };
}

function dedupeCopyItems(items: CopyItem[]): CopyItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatCurrency(value?: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  return `$${Number(value).toFixed(2)}`;
}

function formatRoas(value?: number): string {
  if (!Number.isFinite(value)) return '0.00x';
  return `${Number(value).toFixed(2)}x`;
}

function formatCtr(value?: number): string {
  if (!Number.isFinite(value)) return '0.00%';
  const normalized = Number(value) <= 1 ? Number(value) * 100 : Number(value);
  return `${normalized.toFixed(2)}%`;
}

function formatPercent(value?: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${Number(value).toFixed(0)}%`;
}

function normalizeCopyText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeRankedItems(items: WinningCopyRankedItem[], limit = 5): WinningCopyRankedItem[] {
  const unique: WinningCopyRankedItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = normalizeCopyText(item.text || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= limit) break;
  }
  return unique;
}

function getToneClasses(tone: SectionTone): {
  card: string;
  header: string;
  title: string;
  icon: string;
  count: string;
  row: string;
  rank: string;
} {
  if (tone === 'amber') {
    return {
      card: 'border-amber-200 bg-amber-50/35 shadow-[0_10px_24px_-20px_rgba(217,119,6,0.45)]',
      header: 'border-amber-200 bg-amber-50/70',
      title: 'text-amber-900',
      icon: 'text-amber-600',
      count: 'border-amber-200 bg-amber-100/70 text-amber-800',
      row: 'border-amber-200 bg-white',
      rank: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  }

  if (tone === 'emerald') {
    return {
      card: 'border-emerald-200 bg-emerald-50/35 shadow-[0_10px_24px_-20px_rgba(5,150,105,0.4)]',
      header: 'border-emerald-200 bg-emerald-50/70',
      title: 'text-emerald-900',
      icon: 'text-emerald-600',
      count: 'border-emerald-200 bg-emerald-100/70 text-emerald-800',
      row: 'border-emerald-200 bg-white',
      rank: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }

  return {
    card: 'border-blue-200 bg-blue-50/35 shadow-[0_10px_24px_-20px_rgba(37,99,235,0.45)]',
    header: 'border-blue-200 bg-blue-50/70',
    title: 'text-blue-900',
    icon: 'text-blue-600',
    count: 'border-blue-200 bg-blue-100/70 text-blue-800',
    row: 'border-blue-200 bg-white',
    rank: 'border-blue-200 bg-blue-50 text-blue-800',
  };
}

function fallbackSuggestions(items: string[] | undefined): Array<{ text: string }> {
  return (items || [])
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function getBatchStrategyLabel(strategy?: BatchStrategy): string {
  switch (strategy) {
    case 'one_per_adset':
      return '1 / ad set';
    case 'smart_mix':
      return 'Smart mix';
    case 'by_folder':
      return 'Folder split';
    case 'by_format':
      return 'Format split';
    case 'shuffle':
      return 'Shuffle';
    case 'sequential':
      return 'Sequential';
    case 'manual':
      return 'Manual';
    default:
      return 'Smart mix';
  }
}

function buildDedupedSuggestionItems(
  preferred: Array<{ text?: string; reasoning?: string }>,
  fallbackTexts: string[],
  fallbackReasoning: string,
  limit = 5,
  blockedTextKeys?: Set<string>,
): AISuggestedCopyItem[] {
  const out: AISuggestedCopyItem[] = [];
  const seen = new Set<string>();

  for (const item of preferred) {
    const text = (item.text || '').trim();
    if (!text) continue;
    const key = normalizeCopyText(text);
    if (blockedTextKeys?.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text,
      reasoning: (item.reasoning || '').trim() || fallbackReasoning,
    });
    if (out.length >= limit) return out;
  }

  for (const textValue of fallbackTexts) {
    const text = (textValue || '').trim();
    if (!text) continue;
    const key = normalizeCopyText(text);
    if (blockedTextKeys?.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text,
      reasoning: fallbackReasoning,
    });
    if (out.length >= limit) break;
  }

  return out;
}

function getSourceBadge(source: CopyItem['source']): string {
  if (source === 'winner') return 'Winner';
  if (source === 'ai_generated') return 'AI';
  return 'Manual';
}

export function QuickLaunchTab({ storeId }: QuickLaunchTabProps) {
  const inboxCreatives = useCreativeHubStore((state) => state.inboxCreatives);
  const profiles = useCreativeHubStore((state) => state.profiles);
  const selectedCreativeIds = useCreativeHubStore((state) => state.selectedCreativeIds);
  const batches = useCreativeHubStore((state) => state.batches);
  const winningAds = useCreativeHubStore((state) => state.winningAds);
  const winningAdsLoading = useCreativeHubStore((state) => state.winningAdsLoading);
  const aiInsights = useCreativeHubStore((state) => state.aiInsights);
  const aiInsightsLoading = useCreativeHubStore((state) => state.aiInsightsLoading);
  const autoBatch = useCreativeHubStore((state) => state.autoBatch);
  const removeBatch = useCreativeHubStore((state) => state.removeBatch);
  const removeCreativeFromBatch = useCreativeHubStore((state) => state.removeCreativeFromBatch);
  const executeLaunch = useCreativeHubStore((state) => state.executeLaunch);
  const launchConfig = useCreativeHubStore((state) => state.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((state) => state.updateLaunchConfig);
  const fetchWinningAds = useCreativeHubStore((state) => state.fetchWinningAds);
  const fetchAIInsights = useCreativeHubStore((state) => state.fetchAIInsights);

  const [selectedPreset, setSelectedPreset] = useState<BatchStrategy>('one_per_adset');
  const [launching, setLaunching] = useState(false);
  const [lanePreviewCollapsed, setLanePreviewCollapsed] = useState(false);
  const [launchFlowWindow, setLaunchFlowWindow] = useState<'closed' | 'config' | 'overview'>(
    'closed',
  );
  const [customTextModal, setCustomTextModal] = useState<{
    sectionKey: CopyKey | null;
    text: string;
  }>({
    sectionKey: null,
    text: '',
  });
  const aiInsightProductIdRef = useRef<string | null>(null);

  const selectedCreatives = useMemo(
    () => inboxCreatives.filter((creative) => selectedCreativeIds.has(creative.id)),
    [inboxCreatives, selectedCreativeIds],
  );

  const selectedProductIds = useMemo(
    () => Array.from(new Set(selectedCreatives.map((creative) => creative.productProfileId).filter(Boolean))),
    [selectedCreatives],
  );

  const aiFocusProductId = launchConfig.productProfileId || (selectedProductIds.length === 1 ? selectedProductIds[0] : null);

  useEffect(() => {
    if (!launchConfig.productProfileId && selectedProductIds.length === 1) {
      updateLaunchConfig({ productProfileId: selectedProductIds[0] });
    }
  }, [launchConfig.productProfileId, selectedProductIds, updateLaunchConfig]);

  useEffect(() => {
    if (!aiFocusProductId) {
      aiInsightProductIdRef.current = null;
      return;
    }
    if (aiInsightProductIdRef.current === aiFocusProductId) {
      return;
    }
    aiInsightProductIdRef.current = aiFocusProductId;
    void fetchAIInsights(storeId, aiFocusProductId, { refresh: true });
  }, [aiFocusProductId, fetchAIInsights, storeId]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === launchConfig.productProfileId),
    [launchConfig.productProfileId, profiles],
  );
  const selectedCampaignSummary = useMemo(
    () =>
      selectedProfile?.campaignLinks?.find(
        (campaign) => campaign.campaignId === launchConfig.existingCampaignId,
      ),
    [launchConfig.existingCampaignId, selectedProfile],
  );

  useEffect(() => {
    if (!launchConfig.productProfileId) return;
    void fetchWinningAds(storeId, launchConfig.productProfileId);
  }, [fetchWinningAds, launchConfig.productProfileId, storeId]);

  useEffect(() => {
    if (!selectedProfile) return;
    const patch: Partial<LaunchConfig> = {};

    if (!launchConfig.adAccountId && selectedProfile.adAccountId) {
      patch.adAccountId = selectedProfile.adAccountId;
    }
    if (!launchConfig.pageId && selectedProfile.pageId) {
      patch.pageId = selectedProfile.pageId;
    }
    if (!launchConfig.instagramActorId && selectedProfile.instagramActorId) {
      patch.instagramActorId = selectedProfile.instagramActorId;
    }
    if (!launchConfig.pixelId && selectedProfile.pixelId) {
      patch.pixelId = selectedProfile.pixelId;
    }
    if (!launchConfig.destinationUrl && selectedProfile.destinationUrl) {
      patch.destinationUrl = selectedProfile.destinationUrl;
    }
    if (!launchConfig.conversionEvent && selectedProfile.conversionEvent) {
      patch.conversionEvent = selectedProfile.conversionEvent;
    }
    if (launchConfig.dailyBudget == null) {
      patch.dailyBudget = selectedProfile.defaultBudget ?? 20;
    }
    if (launchConfig.testDuration == null) {
      patch.testDuration = selectedProfile.defaultDuration ?? 3;
    }
    if (!launchConfig.structure) {
      patch.structure = selectedProfile.defaultStructure ?? 'ABO';
    }
    if (!launchConfig.launchStatus) {
      patch.launchStatus = selectedProfile.defaultLaunchStatus ?? 'PAUSED';
    }
    if (!launchConfig.bidStrategy) {
      patch.bidStrategy = selectedProfile.defaultBidStrategy ?? 'LOWEST_COST_WITHOUT_CAP';
    }
    if (!launchConfig.existingCampaignId) {
      const existingCampaignId = selectedProfile.campaignLinks?.[0]?.campaignId;
      if (existingCampaignId) {
        patch.existingCampaignId = existingCampaignId;
      }
    }

    if (Object.keys(patch).length > 0) {
      updateLaunchConfig(patch);
    }
  }, [launchConfig, selectedProfile, updateLaunchConfig]);

  useEffect(() => {
    if (!winningAds) return;
    const patch: Partial<LaunchConfig> = {};

    if ((launchConfig.primaryTexts || []).length === 0) {
      const items = fallbackSuggestions(winningAds.autoFill?.primaryTexts)
        .slice(0, 2)
        .map((item) => createCopyItem(item.text, 'winner'));
      if (items.length > 0) patch.primaryTexts = items;
    }

    if ((launchConfig.headlines || []).length === 0) {
      const items = fallbackSuggestions(winningAds.autoFill?.headlines)
        .slice(0, 2)
        .map((item) => createCopyItem(item.text, 'winner'));
      if (items.length > 0) patch.headlines = items;
    }

    if ((launchConfig.descriptions || []).length === 0) {
      const items = fallbackSuggestions(winningAds.autoFill?.descriptions)
        .slice(0, 1)
        .map((item) => createCopyItem(item.text, 'winner'));
      if (items.length > 0) patch.descriptions = items;
    }

    if (!launchConfig.ctaType && winningAds.autoFill?.cta) {
      patch.ctaType = winningAds.autoFill.cta;
    }

    if (Object.keys(patch).length > 0) {
      updateLaunchConfig(patch);
    }
  }, [
    launchConfig.ctaType,
    launchConfig.descriptions,
    launchConfig.headlines,
    launchConfig.primaryTexts,
    updateLaunchConfig,
    winningAds,
  ]);

  const formatCounts = useMemo(() => {
    const counts = { image: 0, video: 0, carousel: 0 };
    for (const creative of selectedCreatives) {
      counts[creative.creativeFormat] += 1;
    }
    return counts;
  }, [selectedCreatives]);

  const preset = BUILD_PRESETS.find((item) => item.strategy === selectedPreset) || BUILD_PRESETS[0];
  const showDescriptionSection = SHOW_DESCRIPTION_SECTION_IN_FACEBOOK;
  const totalSelected = selectedCreatives.length;
  const topPrimaryTexts = useMemo(
    () => dedupeRankedItems(
      (winningAds?.copyIntelligence?.primaryTexts || winningAds?.winningPrimaryTexts || []),
      5,
    ),
    [winningAds],
  );
  const topHeadlines = useMemo(
    () => dedupeRankedItems(
      (winningAds?.copyIntelligence?.headlines || winningAds?.winningHeadlines || []),
      5,
    ),
    [winningAds],
  );
  const topDescriptions = useMemo(
    () => dedupeRankedItems(
      (winningAds?.copyIntelligence?.descriptions || winningAds?.winningDescriptions || []),
      5,
    ),
    [winningAds],
  );
  const selectedCopyCount = useMemo(
    () =>
      (launchConfig.primaryTexts || []).length +
      (launchConfig.headlines || []).length +
      (showDescriptionSection ? (launchConfig.descriptions || []).length : 0),
    [launchConfig.descriptions, launchConfig.headlines, launchConfig.primaryTexts, showDescriptionSection],
  );
  const winnerPrimaryTextKeys = useMemo(
    () => new Set(topPrimaryTexts.map((item) => normalizeCopyText(item.text || '')).filter(Boolean)),
    [topPrimaryTexts],
  );
  const winnerHeadlineKeys = useMemo(
    () => new Set(topHeadlines.map((item) => normalizeCopyText(item.text || '')).filter(Boolean)),
    [topHeadlines],
  );
  const winnerDescriptionKeys = useMemo(
    () => new Set(topDescriptions.map((item) => normalizeCopyText(item.text || '')).filter(Boolean)),
    [topDescriptions],
  );
  const totalAds = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.creativeIds.length, 0),
    [batches],
  );
  const aiSuggestedGroups = useMemo<AISuggestedCopyGroups>(() => {
    if (!aiInsights) {
      return {
        primaryTexts: [],
        headlines: [],
        descriptions: [],
      };
    }

    const primaryTexts = buildDedupedSuggestionItems(
      [
        ...(aiInsights.insights.suggestedPTs || []).map((item) => ({
          text: item.text,
          reasoning: item.reasoning,
        })),
        ...(aiInsights.launchDraft?.copyPlan.primaryTexts || []).map((text) => ({
          text,
          reasoning: 'AI launch draft generated this from winner-history copy signals.',
        })),
      ],
      [],
      'AI-generated from winner primary text patterns.',
      5,
      winnerPrimaryTextKeys,
    );

    const headlines = buildDedupedSuggestionItems(
      [
        ...(aiInsights.insights.suggestedHeadlines || []).map((item) => ({
          text: item.text,
          reasoning: item.reasoning,
        })),
        ...(aiInsights.launchDraft?.copyPlan.headlines || []).map((text) => ({
          text,
          reasoning: 'AI launch draft generated this from winner headline patterns.',
        })),
      ],
      [],
      'AI-generated from winner headline patterns.',
      5,
      winnerHeadlineKeys,
    );

    const descriptions = buildDedupedSuggestionItems(
      [
        ...((aiInsights.insights.suggestedDescriptions || []).map((item) => ({
          text: item.text,
          reasoning: item.reasoning,
        })) || []),
        ...(aiInsights.launchDraft?.copyPlan.descriptions || []).map((text) => ({
          text,
          reasoning: 'AI launch draft generated this from winner description/body patterns.',
        })),
      ],
      [],
      'AI-generated from winner description patterns.',
      5,
      winnerDescriptionKeys,
    );

    return {
      primaryTexts,
      headlines,
      descriptions: showDescriptionSection ? descriptions : [],
    };
  }, [aiInsights, showDescriptionSection, winnerDescriptionKeys, winnerHeadlineKeys, winnerPrimaryTextKeys]);
  const aiBestCombo = useMemo(() => {
    if (!aiInsights) return null;
    const topPrimary = topPrimaryTexts[0];
    const topHeadline = topHeadlines[0];
    const topDescription = topDescriptions[0];
    return {
      primaryText: topPrimary?.text || aiInsights.launchDraft?.copyPlan.primaryTexts?.[0] || '',
      headline: topHeadline?.text || aiInsights.launchDraft?.copyPlan.headlines?.[0] || '',
      description:
        topDescription?.text ||
        aiInsights.insights.suggestedDescriptions?.[0]?.text ||
        aiInsights.launchDraft?.copyPlan.descriptions?.[0] ||
        '',
      primaryRoas: topPrimary?.metrics?.roas,
      headlineRoas: topHeadline?.metrics?.roas,
      descriptionRoas: topDescription?.metrics?.roas,
      strategy:
        aiInsights.selectionPlan?.recommendedStrategy ||
        launchConfig.batchStrategy ||
        'smart_mix',
      laneSize:
        aiInsights.selectionPlan?.recommendedSize ||
        launchConfig.creativesPerBatch ||
        3,
    };
  }, [
    aiInsights,
    launchConfig.batchStrategy,
    launchConfig.creativesPerBatch,
    topDescriptions,
    topHeadlines,
    topPrimaryTexts,
  ]);

  const handleAutoBatch = useCallback(
    (strategy = selectedPreset) => {
      const nextPreset = BUILD_PRESETS.find((item) => item.strategy === strategy) || BUILD_PRESETS[0];
      setSelectedPreset(nextPreset.strategy);
      autoBatch(nextPreset.strategy, nextPreset.size);
      updateLaunchConfig({
        batchStrategy: nextPreset.strategy,
        creativesPerBatch: nextPreset.size,
        adsetDistribution:
          nextPreset.strategy === 'one_per_adset' ? 'one_per_adset' : 'distribute',
      });
    },
    [autoBatch, selectedPreset, updateLaunchConfig],
  );

  const addCopyItem = useCallback(
    (key: CopyKey, text: string, source: CopyItem['source'] = 'winner') => {
      const next = dedupeCopyItems([
        ...((launchConfig[key] || []) as CopyItem[]),
        createCopyItem(text, source),
      ]);
      updateLaunchConfig({ [key]: next } as Partial<LaunchConfig>);
    },
    [launchConfig, updateLaunchConfig],
  );

  const removeCopyItem = useCallback(
    (key: CopyKey, id: string) => {
      const next = ((launchConfig[key] || []) as CopyItem[]).filter((item) => item.id !== id);
      updateLaunchConfig({ [key]: next } as Partial<LaunchConfig>);
    },
    [launchConfig, updateLaunchConfig],
  );

  const removeCopyItemByText = useCallback(
    (key: CopyKey, text: string) => {
      const textKey = normalizeCopyText(text);
      const next = ((launchConfig[key] || []) as CopyItem[]).filter(
        (item) => normalizeCopyText(item.text) !== textKey,
      );
      updateLaunchConfig({ [key]: next } as Partial<LaunchConfig>);
    },
    [launchConfig, updateLaunchConfig],
  );

  const openCustomTextModal = useCallback((key: CopyKey) => {
    setCustomTextModal({ sectionKey: key, text: '' });
  }, []);

  const closeCustomTextModal = useCallback(() => {
    setCustomTextModal({ sectionKey: null, text: '' });
  }, []);

  const confirmCustomTextModal = useCallback(() => {
    if (!customTextModal.sectionKey) return;
    const text = customTextModal.text.trim();
    if (!text) return;
    addCopyItem(customTextModal.sectionKey, text, 'manual');
    closeCustomTextModal();
  }, [addCopyItem, closeCustomTextModal, customTextModal.sectionKey, customTextModal.text]);

  const handleLaunch = useCallback(async () => {
    if (batches.length === 0) return;
    setLaunching(true);
    try {
      updateLaunchConfig({ batches, batchStrategy: preset.strategy });
      await executeLaunch(storeId);
      setLaunchFlowWindow('closed');
    } finally {
      setLaunching(false);
    }
  }, [batches, executeLaunch, preset.strategy, storeId, updateLaunchConfig]);
  const selectedAdsetCount = useMemo(
    () =>
      Object.values(launchConfig.existingAdsetAssignments || {}).filter(
        (assignedIds) => Array.isArray(assignedIds) && assignedIds.length > 0,
      ).length,
    [launchConfig.existingAdsetAssignments],
  );
  const effectiveStructure = launchConfig.structure ?? selectedProfile?.defaultStructure ?? 'ABO';
  const effectiveDailyBudget = launchConfig.dailyBudget ?? selectedProfile?.defaultBudget ?? 0;
  const effectiveDuration = launchConfig.testDuration ?? selectedProfile?.defaultDuration ?? 0;
  const launchStatus = launchConfig.launchStatus ?? selectedProfile?.defaultLaunchStatus ?? 'PAUSED';
  const campaignSummaryLabel =
    launchConfig.campaignMode === 'new'
      ? launchConfig.newCampaignName || 'New campaign (name pending)'
      : selectedCampaignSummary?.campaignName ||
        launchConfig.existingCampaignId ||
        'Existing campaign not selected';
  const customTextSectionLabel = customTextModal.sectionKey
    ? COPY_SECTIONS.find((section) => section.key === customTextModal.sectionKey)?.title || 'Text'
    : 'Text';

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)]">
        <div className="flex flex-col gap-5">
          <section className="order-2 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Batch Build
                </p>
                <h4 className="mt-1 text-lg font-semibold text-slate-950">
                  Choose the lane structure first
                </h4>
              </div>
              <button
                onClick={() => handleAutoBatch()}
                disabled={totalSelected === 0}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <Zap className="h-4 w-4" />
                Build lanes
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {BUILD_PRESETS.map((option) => {
                const active = selectedPreset === option.strategy;
                return (
                  <button
                    key={option.strategy}
                    onClick={() => setSelectedPreset(option.strategy)}
                    className={cn(
                      'rounded-2xl border px-4 py-4 text-left transition',
                      active
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{option.label}</p>
                      {active && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{option.helper}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{preset.label}</span>
              {' '}will create a compact lane plan using{' '}
              <span className="font-semibold text-slate-900">{preset.helper.toLowerCase()}</span>.
            </div>
          </section>

          <section className="order-1 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Copy Picks
                </p>
                <h4 className="mt-1 text-lg font-semibold text-slate-950">
                  Pull winning copy into the launch flow
                </h4>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {winningAdsLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading history
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                    {winningAds?.stats.totalAds || 0} winning ads scanned
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border-2 border-slate-300 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Top Performing Texts
                  </p>
                  <h5 className="mt-1 text-sm font-semibold text-slate-900">
                    Winner copy with ROAS, CPC, CPM and CTR
                  </h5>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600">
                  <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                  Showing top {showDescriptionSection
                    ? Math.max(topPrimaryTexts.length, topHeadlines.length, topDescriptions.length, 0)
                    : Math.max(topPrimaryTexts.length, topHeadlines.length, 0)} ranked entries
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <TopPerformingCopyList
                  title="Primary Texts"
                  icon={AlignLeft}
                  rows={topPrimaryTexts}
                  emptyLabel="No winning primary texts found yet."
                  tone="blue"
                  addLabel="Add"
                  removeLabel="Remove"
                  onAdd={(text) => addCopyItem('primaryTexts', text)}
                  onRemove={(text) => removeCopyItemByText('primaryTexts', text)}
                  selectedItems={(launchConfig.primaryTexts || []) as CopyItem[]}
                />
                <TopPerformingCopyList
                  title="Headlines"
                  icon={Type}
                  rows={topHeadlines}
                  emptyLabel="No winning headlines found yet."
                  tone="amber"
                  addLabel="Add"
                  removeLabel="Remove"
                  onAdd={(text) => addCopyItem('headlines', text)}
                  onRemove={(text) => removeCopyItemByText('headlines', text)}
                  selectedItems={(launchConfig.headlines || []) as CopyItem[]}
                />
                {showDescriptionSection ? (
                  <TopPerformingCopyList
                    title="Descriptions"
                    icon={FileText}
                    rows={topDescriptions}
                    emptyLabel="No winning descriptions found yet."
                    tone="emerald"
                    addLabel="Add"
                    removeLabel="Remove"
                    onAdd={(text) => addCopyItem('descriptions', text)}
                    onRemove={(text) => removeCopyItemByText('descriptions', text)}
                    selectedItems={(launchConfig.descriptions || []) as CopyItem[]}
                  />
                ) : null}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {COPY_SECTIONS.filter((section) => showDescriptionSection || section.key !== 'descriptions').map((section) => {
                const selectedItems = (launchConfig[section.key] || []) as CopyItem[];
                const tone = getToneClasses(section.tone);
                return (
                  <div
                    key={section.key}
                    className={cn('rounded-[24px] border-2 p-4', tone.card)}
                  >
                    <div className={cn('flex items-center justify-between gap-3 rounded-xl border px-3 py-2', tone.header)}>
                      <div>
                        <p className={cn('text-sm font-semibold', tone.title)}>{section.title}</p>
                        <p className="text-xs text-slate-500">{selectedItems.length} selected</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold', tone.count)}>
                          {selectedItems.length}
                        </div>
                        <button
                          type="button"
                          onClick={() => openCustomTextModal(section.key)}
                          className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                        >
                          Custom text
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {selectedItems.length > 0 ? (
                        selectedItems.slice(0, 3).map((item) => (
                          <div key={item.id} className={cn('rounded-2xl border px-3 py-3', tone.row)}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <SelectedCopyText text={item.text} />
                                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  {getSourceBadge(item.source)}
                                </p>
                              </div>
                              <button
                                onClick={() => removeCopyItem(section.key, item.id)}
                                className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={cn('rounded-2xl border border-dashed px-3 py-5 text-sm text-slate-500', tone.row)}>
                          {section.empty}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="order-3 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Lane Preview
                </p>
                <h4 className="mt-1 text-lg font-semibold text-slate-950">
                  Keep the batching surface light, but editable
                </h4>
              </div>
              <div className="inline-flex items-center gap-2">
                {batches.length > 0 && (
                  <button
                    onClick={() => useCreativeHubStore.getState().shuffleBatches()}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Shuffle className="h-4 w-4" />
                    Shuffle lanes
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLanePreviewCollapsed((current) => !current)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                  aria-label={lanePreviewCollapsed ? 'Expand lane preview' : 'Collapse lane preview'}
                  title={lanePreviewCollapsed ? 'Expand lane preview' : 'Collapse lane preview'}
                >
                  {lanePreviewCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {!lanePreviewCollapsed ? (
              <div className="mt-4">
                <BatchList
                  batches={batches}
                  creatives={selectedCreatives}
                  onRemoveBatch={removeBatch}
                  onRemoveCreative={removeCreativeFromBatch}
                />
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-5">
          <section className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-3 shadow-[0_14px_30px_-30px_rgba(15,23,42,0.45)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Quick Launch
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {totalSelected} creative{totalSelected !== 1 ? 's' : ''} selected
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              {selectedProfile && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium">
                  {selectedProfile.productName}
                </span>
              )}
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                {batches.length} ad set{batches.length !== 1 ? 's' : ''}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                {totalAds} ad{totalAds !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <FormatPill icon={Image} label={`${formatCounts.image} images`} visible={formatCounts.image > 0} />
              <FormatPill icon={Film} label={`${formatCounts.video} videos`} visible={formatCounts.video > 0} />
              <FormatPill icon={Images} label={`${formatCounts.carousel} carousels`} visible={formatCounts.carousel > 0} />
            </div>
          </section>

          <AIStrategyPanel
            aiInsights={aiInsights}
            aiInsightsLoading={aiInsightsLoading}
            hasProductContext={Boolean(aiFocusProductId)}
            productName={selectedProfile?.productName || null}
            bestCombo={aiBestCombo}
            suggestions={aiSuggestedGroups}
            launchConfig={launchConfig}
            showDescriptionSection={showDescriptionSection}
            onAdd={(key, text) => addCopyItem(key, text, 'ai_generated')}
            onRemove={removeCopyItemByText}
          />

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Launch Config
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <p className="mt-1">
                {batches.length} ad set{batches.length !== 1 ? 's' : ''} • {totalAds} ad
                {totalAds !== 1 ? 's' : ''} • {selectedCopyCount} copy text
                {selectedCopyCount !== 1 ? 's' : ''} selected
              </p>
            </div>

            <button
              type="button"
              onClick={() => setLaunchFlowWindow('config')}
              className="mt-4 inline-flex w-full items-center justify-center rounded-[18px] bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Configure launch
            </button>
          </section>
        </div>
      </div>

      {launchFlowWindow === 'config' && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => setLaunchFlowWindow('closed')}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-[#111a2f] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Launch Config
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">
                  Configure campaign, ad sets, and launch details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLaunchFlowWindow('closed')}
                className="rounded-full border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#111a2f] p-5">
              <div className="dark">
                <LaunchConfigPanel
                  batches={batches}
                  productProfileId={launchConfig.productProfileId}
                  showOverviewButton
                  onOverviewLaunch={() => setLaunchFlowWindow('overview')}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {launchFlowWindow === 'overview' && (
        <div
          className="fixed inset-0 z-[91] flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => setLaunchFlowWindow('closed')}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-[#111a2f] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-700 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Overview Launch
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-100">
                Review all launch settings before publishing
              </h3>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-[#111a2f] p-5">
              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Campaign Plan</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Product Profile" value={selectedProfile?.productName || 'Not selected'} />
                  <OverviewMeta
                    label="Campaign Mode"
                    value={launchConfig.campaignMode === 'new' ? 'Create New Campaign' : 'Use Existing Campaign'}
                  />
                  <OverviewMeta label="Campaign" value={campaignSummaryLabel} />
                  <OverviewMeta
                    label="Ad Set Mode"
                    value={
                      launchConfig.adsetMode === 'existing_adsets'
                        ? `Use Existing Ad Sets (${selectedAdsetCount} selected)`
                        : 'Create New Ad Sets'
                    }
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Budget + Timing</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Structure" value={effectiveStructure} />
                  <OverviewMeta label="Launch As" value={launchStatus} />
                  <OverviewMeta
                    label={effectiveStructure === 'CBO' ? 'Campaign Budget' : 'Daily / Ad Set'}
                    value={`${formatCurrency(effectiveDailyBudget)} / day`}
                  />
                  <OverviewMeta label="Duration" value={`${effectiveDuration} day${effectiveDuration !== 1 ? 's' : ''}`} />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Assets + Copy</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Ad Sets" value={`${batches.length}`} />
                  <OverviewMeta label="Ads" value={`${totalAds}`} />
                  <OverviewMeta label="Primary Texts" value={`${(launchConfig.primaryTexts || []).length}`} />
                  <OverviewMeta label="Headlines" value={`${(launchConfig.headlines || []).length}`} />
                </div>
              </section>

              {batches.length > 0 && (
                <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Lane Snapshot</p>
                  <div className="mt-2 space-y-2">
                    {batches.map((batch) => (
                      <div
                        key={batch.id}
                        className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2"
                      >
                        <p className="truncate text-sm font-medium text-slate-100">{batch.name}</p>
                        <span className="rounded-full border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-xs text-slate-300">
                          {batch.creativeIds.length} ad{batch.creativeIds.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {batches.length > 0 && selectedCopyCount === 0 && (
                <p className="text-xs text-amber-700">
                  Select at least one copy text (Primary / Headline) to enable launch.
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-700 px-5 py-4">
              <button
                type="button"
                onClick={() => setLaunchFlowWindow('config')}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Back to config
              </button>
              <button
                type="button"
                onClick={handleLaunch}
                disabled={launching || batches.length === 0 || selectedCopyCount === 0}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
                  launching || batches.length === 0 || selectedCopyCount === 0
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                )}
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {launching
                  ? 'Launching...'
                  : `Launch ${totalAds || totalSelected} creative${(totalAds || totalSelected) !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {customTextModal.sectionKey && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/45 p-4"
          onClick={closeCustomTextModal}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Custom Text • {customTextSectionLabel}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Write a custom entry for this category.
            </p>

            <textarea
              value={customTextModal.text}
              onChange={(event) =>
                setCustomTextModal((current) => ({ ...current, text: event.target.value }))
              }
              placeholder={`Type custom ${customTextSectionLabel.toLowerCase()}...`}
              className="mt-3 min-h-[140px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-200/50"
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCustomTextModal}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCustomTextModal}
                disabled={!customTextModal.text.trim()}
                className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function AIStrategyPanel({
  aiInsights,
  aiInsightsLoading,
  hasProductContext,
  productName,
  bestCombo,
  suggestions,
  launchConfig,
  showDescriptionSection,
  onAdd,
  onRemove,
}: {
  aiInsights: AIInsightsData | null;
  aiInsightsLoading: boolean;
  hasProductContext: boolean;
  productName: string | null;
  bestCombo: {
    primaryText: string;
    headline: string;
    description: string;
    primaryRoas?: number;
    headlineRoas?: number;
    descriptionRoas?: number;
    strategy: BatchStrategy;
    laneSize: number;
  } | null;
  suggestions: AISuggestedCopyGroups;
  launchConfig: Partial<LaunchConfig>;
  showDescriptionSection: boolean;
  onAdd: (key: CopyKey, text: string) => void;
  onRemove: (key: CopyKey, text: string) => void;
}) {
  const cta = aiInsights?.insights.bestCTA;
  const bestAngle = aiInsights?.insights.bestAngle;
  const totalSuggestions =
    suggestions.primaryTexts.length +
    suggestions.headlines.length +
    (showDescriptionSection ? suggestions.descriptions.length : 0);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            AI Strategy
          </p>
          <h4 className="mt-1 text-lg font-semibold text-slate-950">
            Best combo + similar text suggestions
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            {productName
              ? `Powered by winning history for ${productName}.`
              : 'Select a single product to load strategy insights.'}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          {aiInsightsLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading AI
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              {aiInsights ? `${aiInsights.analyzedAds} ads analyzed` : 'Awaiting context'}
            </>
          )}
        </div>
      </div>

      {aiInsightsLoading ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          AI is building your strategy, best combo, and similar text picks...
        </div>
      ) : !hasProductContext ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-5 text-sm text-slate-600">
          Pick creatives from one product or choose a product profile to unlock AI strategy here.
        </div>
      ) : !aiInsights ? (
        <div className="mt-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-5 text-sm text-amber-800">
          We could not load AI strategy right now. Try switching product context and opening Quick Launch again.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
              Best Combo
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-800">{aiInsights.insights.summary}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StrategyMeta label="Best angle" value={bestAngle?.name || 'N/A'} />
              <StrategyMeta label="Expected ROAS" value={formatRoas(bestAngle?.avgRoas)} />
              <StrategyMeta
                label="Best CTA"
                value={cta ? `${cta.type} (${formatPercent(cta.usagePercent)})` : 'N/A'}
              />
              <StrategyMeta
                label="Lane setup"
                value={`${getBatchStrategyLabel(bestCombo?.strategy)} • ${bestCombo?.laneSize || 3}/lane`}
              />
            </div>
            <p className="mt-3 text-xs text-blue-700">
              Combo is selected from your top winner texts first, then AI fills gaps if a winner slot is missing.
            </p>
            <div className="mt-3 space-y-2">
              {bestCombo?.primaryText && (
                <ComboLine
                  label="Primary text"
                  text={bestCombo.primaryText}
                  helper={bestCombo.primaryRoas != null ? `Winner ROAS ${formatRoas(bestCombo.primaryRoas)}` : 'Winner-led pick'}
                />
              )}
              {bestCombo?.headline && (
                <ComboLine
                  label="Headline"
                  text={bestCombo.headline}
                  helper={bestCombo.headlineRoas != null ? `Winner ROAS ${formatRoas(bestCombo.headlineRoas)}` : 'Winner-led pick'}
                />
              )}
              {showDescriptionSection && bestCombo?.description && (
                <ComboLine
                  label="Description"
                  text={bestCombo.description}
                  helper={bestCombo.descriptionRoas != null ? `Winner ROAS ${formatRoas(bestCombo.descriptionRoas)}` : 'Winner-led pick'}
                />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Similar Texts
              </p>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                {totalSuggestions} suggestions
              </span>
            </div>

            {totalSuggestions === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                No similar text suggestions available yet.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <AISuggestionList
                  sectionKey="primaryTexts"
                  label="Primary Texts"
                  chip="PT"
                  items={suggestions.primaryTexts}
                  launchConfig={launchConfig}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
                <AISuggestionList
                  sectionKey="headlines"
                  label="Headlines"
                  chip="HL"
                  items={suggestions.headlines}
                  launchConfig={launchConfig}
                  onAdd={onAdd}
                  onRemove={onRemove}
                />
                {showDescriptionSection ? (
                  <AISuggestionList
                    sectionKey="descriptions"
                    label="Descriptions"
                    chip="DESC"
                    items={suggestions.descriptions}
                    launchConfig={launchConfig}
                    onAdd={onAdd}
                    onRemove={onRemove}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function AISuggestionList({
  sectionKey,
  label,
  chip,
  items,
  launchConfig,
  onAdd,
  onRemove,
}: {
  sectionKey: CopyKey;
  label: string;
  chip: 'PT' | 'HL' | 'DESC';
  items: AISuggestedCopyItem[];
  launchConfig: Partial<LaunchConfig>;
  onAdd: (key: CopyKey, text: string) => void;
  onRemove: (key: CopyKey, text: string) => void;
}) {
  if (items.length === 0) return null;

  const selectedItems = (launchConfig[sectionKey] || []) as CopyItem[];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {items.length}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => {
          const alreadySelected = selectedItems.some(
            (selected) => normalizeCopyText(selected.text) === normalizeCopyText(item.text),
          );
          return (
            <div
              key={`${sectionKey}-${index}-${item.text}`}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  {chip}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-5 text-slate-800 break-words">{item.text}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{item.reasoning}</p>
                </div>
                <button
                  onClick={() => (alreadySelected ? onRemove(sectionKey, item.text) : onAdd(sectionKey, item.text))}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition',
                    alreadySelected
                      ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100'
                      : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100',
                  )}
                >
                  {alreadySelected ? 'Remove' : 'Add'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StrategyMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ComboLine({ label, text, helper }: { label: string; text: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-blue-200/80 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">{label}</p>
      <p className="mt-1 text-sm leading-5 text-slate-800 break-words">{text}</p>
      {helper ? <p className="mt-1 text-[11px] text-blue-700">{helper}</p> : null}
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function FormatPill({
  icon: Icon,
  label,
  visible,
}: {
  icon: typeof Image;
  label: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      {label}
    </span>
  );
}

function TopPerformingCopyList({
  title,
  icon: Icon,
  rows,
  emptyLabel,
  tone,
  addLabel,
  removeLabel,
  onAdd,
  onRemove,
  selectedItems,
}: {
  title: string;
  icon: typeof AlignLeft;
  rows: WinningCopyRankedItem[];
  emptyLabel: string;
  tone: SectionTone;
  addLabel: string;
  removeLabel: string;
  onAdd: (text: string) => void;
  onRemove: (text: string) => void;
  selectedItems: CopyItem[];
}) {
  const toneClasses = getToneClasses(tone);
  // Use a clear cyan selection surface so selected rows stand out from the existing blue section backgrounds.
  const selectedRowHighlightClass =
    'border-cyan-500 bg-cyan-100 ring-2 ring-cyan-200 shadow-[0_12px_26px_-18px_rgba(14,116,144,0.85)]';
  const [expandedRow, setExpandedRow] = useState<WinningCopyRankedItem | null>(null);
  const expandedAlreadySelected = expandedRow
    ? selectedItems.some(
        (selected) => normalizeCopyText(selected.text) === normalizeCopyText(expandedRow.text),
      )
    : false;

  return (
    <>
      <div className={cn('rounded-2xl border-2 p-3', toneClasses.card)}>
      <div className={cn('mb-3 flex items-center gap-2 rounded-lg border px-2.5 py-2', toneClasses.header)}>
        <Icon className={cn('h-4 w-4', toneClasses.icon)} />
        <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', toneClasses.title)}>{title}</p>
      </div>

      {rows.length === 0 ? (
        <div className={cn('rounded-xl border border-dashed px-3 py-5 text-center text-xs text-slate-500', toneClasses.row)}>
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const alreadySelected = selectedItems.some(
              (selected) => normalizeCopyText(selected.text) === normalizeCopyText(row.text),
            );
            return (
              <div
                key={`${title}-${row.rank}-${row.text}`}
                className={cn(
                  'rounded-xl border px-3 py-2 transition-all',
                  toneClasses.row,
                  alreadySelected && selectedRowHighlightClass,
                )}
              >
                <div className="flex min-h-[108px] flex-col justify-between gap-2">
                  <div className="min-w-0 flex items-start gap-2.5">
                    <div className={cn('inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1', toneClasses.rank)}>
                      {row.rank}
                    </div>
                    <ExpandableCopyPreview
                      text={row.text}
                      onSeeMore={() => setExpandedRow(row)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
                      <MetricStat label="ROAS" value={formatRoas(row.metrics?.roas)} tone="emerald" />
                      <MetricStat label="CPC" value={formatCurrency(row.metrics?.cpc)} />
                      <MetricStat label="CPM" value={formatCurrency(row.metrics?.cpm)} />
                      <MetricStat label="CTR" value={formatCtr(row.metrics?.ctr)} />
                      <MetricStat label="Spend" value={formatCurrency(row.totalSpend)} />
                    </div>
                    <button
                      onClick={() => (alreadySelected ? onRemove(row.text) : onAdd(row.text))}
                      className={cn(
                        'inline-flex h-7 items-center rounded-lg border px-2.5 text-[11px] font-semibold transition',
                        alreadySelected
                          ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100'
                          : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100',
                      )}
                    >
                      {alreadySelected ? removeLabel : addLabel}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {expandedRow && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4"
          onClick={() => setExpandedRow(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {title} • Rank {expandedRow.rank}
              </p>
            </div>

            <p className="mt-3 max-h-[55vh] overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
              {expandedRow.text}
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpandedRow(null)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (expandedAlreadySelected) {
                    onRemove(expandedRow.text);
                  } else {
                    onAdd(expandedRow.text);
                  }
                  setExpandedRow(null);
                }}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-semibold transition',
                  expandedAlreadySelected
                    ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100'
                    : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100',
                )}
              >
                {expandedAlreadySelected ? removeLabel : addLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ExpandableCopyPreview({
  text,
  onSeeMore,
}: {
  text: string;
  onSeeMore: () => void;
}) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    const element = textRef.current;
    if (!element) {
      setIsTruncated(false);
      return;
    }
    setIsTruncated(element.scrollHeight > element.clientHeight + 1);
  }, []);

  useEffect(() => {
    checkTruncation();
  }, [checkTruncation, text]);

  useEffect(() => {
    const element = textRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      checkTruncation();
    });
    observer.observe(element);

    const handleResize = () => checkTruncation();
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [checkTruncation, text]);

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-2">
        <div className="group relative min-w-0 flex-1">
          <p ref={textRef} className="line-clamp-2 text-xs leading-4 text-slate-800 break-words">
            {text}
          </p>
          {isTruncated && (
            <div className="invisible absolute left-0 top-full z-30 w-[min(560px,90vw)] rounded-xl border border-slate-200 bg-white p-3 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
              <p className="text-xs leading-5 text-slate-700 whitespace-pre-wrap break-words">{text}</p>
            </div>
          )}
        </div>

        {isTruncated && (
          <button
            type="button"
            onClick={onSeeMore}
            className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
          >
            See more
          </button>
        )}
      </div>
    </div>
  );
}

function SelectedCopyText({ text }: { text: string }) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    const element = textRef.current;
    if (!element) {
      setIsTruncated(false);
      return;
    }
    if (expanded) return;
    setIsTruncated(element.scrollHeight > element.clientHeight + 1);
  }, [expanded]);

  useEffect(() => {
    checkTruncation();
  }, [checkTruncation, text]);

  useEffect(() => {
    const element = textRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      checkTruncation();
    });
    observer.observe(element);

    const handleResize = () => checkTruncation();
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [checkTruncation, text]);

  return (
    <div className="min-w-0">
      <div className="group relative min-w-0">
        <p
          ref={textRef}
          className={cn(
            'text-xs leading-4 text-slate-700 break-words',
            expanded ? 'whitespace-pre-wrap' : 'line-clamp-2',
          )}
          title={expanded ? undefined : text}
        >
          {text}
        </p>
        {isTruncated && !expanded && (
          <div className="invisible absolute left-0 top-full z-30 w-[min(560px,90vw)] rounded-xl border border-slate-200 bg-white p-3 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
            <p className="text-xs leading-5 text-slate-700 whitespace-pre-wrap break-words">{text}</p>
          </div>
        )}
      </div>
      {isTruncated && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 text-[11px] font-semibold text-blue-600 underline-offset-2 hover:underline"
        >
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
    </div>
  );
}

function MetricStat({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'emerald';
}) {
  return (
    <div
      className={cn(
        'min-w-[60px] rounded-lg border px-2 py-1 text-center',
        tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-slate-200 bg-white',
      )}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-[11px] font-semibold',
          tone === 'emerald' ? 'text-emerald-700' : 'text-slate-700',
        )}
      >
        {value}
      </p>
    </div>
  );
}
