'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Film,
  Image,
  Images,
  Loader2,
  Rocket,
  Shuffle,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';

import { HealthCheckPanel } from '@/components/creative-hub/launch/HealthCheckPanel';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type {
  BatchStrategy,
  CopyItem,
  LaunchConfig,
  WinningAdsData,
} from '@/types/creativeHub';
import { BatchList } from './BatchList';
import { LaunchConfigPanel } from './LaunchConfigPanel';

interface QuickLaunchTabProps {
  storeId: string;
}

type CopyKey = 'primaryTexts' | 'headlines' | 'descriptions';
type SuggestionItem = { text: string; metric?: string };

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
}> = [
  {
    key: 'primaryTexts',
    title: 'Primary text',
    empty: 'Top winning primary text will show here once history loads.',
  },
  {
    key: 'headlines',
    title: 'Headlines',
    empty: 'Headline winners will show here once history loads.',
  },
  {
    key: 'descriptions',
    title: 'Descriptions',
    empty: 'Description winners will show here once history loads.',
  },
];

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

function formatMetric(value?: number, prefix = ''): string | undefined {
  if (!Number.isFinite(value)) return undefined;
  return `${prefix}${Number(value).toFixed(prefix ? 2 : 0)}`;
}

function formatSpend(value?: number): string | undefined {
  if (!Number.isFinite(value)) return undefined;
  return `$${Number(value).toFixed(0)} spend`;
}

function normalizeTextSuggestions(
  items: Array<{ text?: string; combinedRoas?: number; combinedSpend?: number; blendedScore?: number }> | undefined,
): SuggestionItem[] {
  if (!items?.length) return [];
  return items
    .map((item) => {
      const text = item.text?.trim();
      if (!text) return null;
      const metric =
        formatMetric(item.combinedRoas, 'ROAS ') ||
        formatSpend(item.combinedSpend) ||
        formatMetric(item.blendedScore, 'Score ');
      return { text, metric };
    })
    .filter((item): item is { text: string; metric: string | undefined } => !!item);
}

function fallbackSuggestions(items: string[] | undefined): SuggestionItem[] {
  return (items || [])
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text }));
}

function getCopySuggestions(winningAds: WinningAdsData | null, key: CopyKey): SuggestionItem[] {
  if (!winningAds) return [];

  if (key === 'primaryTexts') {
    const ranked = normalizeTextSuggestions(
      winningAds.copyIntelligence?.primaryTexts ||
        winningAds.winningPrimaryTexts ||
        winningAds.uniquePTs,
    );
    return ranked.length > 0 ? ranked : fallbackSuggestions(winningAds.autoFill?.primaryTexts);
  }

  if (key === 'headlines') {
    const ranked = normalizeTextSuggestions(
      winningAds.copyIntelligence?.headlines ||
        winningAds.winningHeadlines ||
        winningAds.uniqueHeadlines,
    );
    return ranked.length > 0 ? ranked : fallbackSuggestions(winningAds.autoFill?.headlines);
  }

  const ranked = normalizeTextSuggestions(
    winningAds.copyIntelligence?.descriptions || winningAds.winningDescriptions,
  );
  return ranked.length > 0 ? ranked : fallbackSuggestions(winningAds.autoFill?.descriptions);
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
  const healthCheckReport = useCreativeHubStore((state) => state.healthCheckReport);
  const autoBatch = useCreativeHubStore((state) => state.autoBatch);
  const removeBatch = useCreativeHubStore((state) => state.removeBatch);
  const removeCreativeFromBatch = useCreativeHubStore((state) => state.removeCreativeFromBatch);
  const executeLaunch = useCreativeHubStore((state) => state.executeLaunch);
  const launchConfig = useCreativeHubStore((state) => state.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((state) => state.updateLaunchConfig);
  const fetchWinningAds = useCreativeHubStore((state) => state.fetchWinningAds);
  const runHealthCheck = useCreativeHubStore((state) => state.runHealthCheck);

  const [selectedPreset, setSelectedPreset] = useState<BatchStrategy>('one_per_adset');
  const [launching, setLaunching] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showChecks, setShowChecks] = useState(false);

  const selectedCreatives = useMemo(
    () => inboxCreatives.filter((creative) => selectedCreativeIds.has(creative.id)),
    [inboxCreatives, selectedCreativeIds],
  );

  const selectedProductIds = useMemo(
    () => Array.from(new Set(selectedCreatives.map((creative) => creative.productProfileId).filter(Boolean))),
    [selectedCreatives],
  );

  useEffect(() => {
    if (!launchConfig.productProfileId && selectedProductIds.length === 1) {
      updateLaunchConfig({ productProfileId: selectedProductIds[0] });
    }
  }, [launchConfig.productProfileId, selectedProductIds, updateLaunchConfig]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === launchConfig.productProfileId),
    [launchConfig.productProfileId, profiles],
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
  const totalSelected = selectedCreatives.length;
  const totalAds = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.creativeIds.length, 0),
    [batches],
  );

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
    (key: CopyKey, text: string) => {
      const next = dedupeCopyItems([
        ...((launchConfig[key] || []) as CopyItem[]),
        createCopyItem(text, 'winner'),
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

  const handleRunChecks = useCallback(async () => {
    setChecking(true);
    try {
      await runHealthCheck(storeId);
      setShowChecks(true);
    } finally {
      setChecking(false);
    }
  }, [runHealthCheck, storeId]);

  const handleLaunch = useCallback(async () => {
    if (batches.length === 0) return;
    setLaunching(true);
    try {
      updateLaunchConfig({ batches, batchStrategy: preset.strategy });
      await executeLaunch(storeId);
    } finally {
      setLaunching(false);
    }
  }, [batches, executeLaunch, preset.strategy, storeId, updateLaunchConfig]);

  const checksStatusLabel = useMemo(() => {
    if (!healthCheckReport) return 'Run checks before launch';
    if (healthCheckReport.failures > 0) {
      return `${healthCheckReport.failures} blocking issue${healthCheckReport.failures > 1 ? 's' : ''}`;
    }
    if (healthCheckReport.warnings > 0) {
      return `${healthCheckReport.warnings} warning${healthCheckReport.warnings > 1 ? 's' : ''}`;
    }
    return 'All checks passed';
  }, [healthCheckReport]);

  const passedChecks = useMemo(() => {
    if (!healthCheckReport) return 0;
    return healthCheckReport.checks.filter((check) => check.status === 'ok').length;
  }, [healthCheckReport]);

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Quick Launch
            </p>
            <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
              Clean batching, copy picks, and Meta setup in one place.
            </h3>
            <p className="max-w-2xl text-sm text-slate-600">
              Keep the light Creative Inbox launch feel, but wire in the newer copy and launch structure controls here.
            </p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-3">
            <SummaryChip label="Creatives" value={totalSelected} />
            <SummaryChip label="Ad sets" value={batches.length} />
            <SummaryChip label="Ads" value={totalAds} />
            <SummaryChip label="PT" value={(launchConfig.primaryTexts || []).length} />
            <SummaryChip label="Headlines" value={(launchConfig.headlines || []).length} />
            <SummaryChip label="Descriptions" value={(launchConfig.descriptions || []).length} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FormatPill icon={Image} label={`${formatCounts.image} images`} visible={formatCounts.image > 0} />
          <FormatPill icon={Film} label={`${formatCounts.video} videos`} visible={formatCounts.video > 0} />
          <FormatPill icon={Images} label={`${formatCounts.carousel} carousels`} visible={formatCounts.carousel > 0} />
          {selectedProfile && (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {selectedProfile.productName}
            </span>
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.95fr)]">
        <div className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
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

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
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

            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {COPY_SECTIONS.map((section) => {
                const selectedItems = (launchConfig[section.key] || []) as CopyItem[];
                const suggestions = getCopySuggestions(winningAds, section.key).slice(0, 3);
                return (
                  <div
                    key={section.key}
                    className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{section.title}</p>
                        <p className="text-xs text-slate-500">{selectedItems.length} selected</p>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {selectedItems.length}
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {selectedItems.length > 0 ? (
                        selectedItems.slice(0, 3).map((item) => (
                          <div key={item.id} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-3 text-sm text-slate-700">{item.text}</p>
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
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-5 text-sm text-slate-500">
                          {section.empty}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        Suggested winners
                      </p>
                      {suggestions.length > 0 ? (
                        suggestions.map((item) => {
                          const alreadySelected = selectedItems.some(
                            (selected) =>
                              selected.text.trim().toLowerCase() === item.text.trim().toLowerCase(),
                          );
                          return (
                            <button
                              key={`${section.key}-${item.text}`}
                              onClick={() => addCopyItem(section.key, item.text)}
                              disabled={alreadySelected}
                              className={cn(
                                'w-full rounded-2xl border px-3 py-3 text-left transition',
                                alreadySelected
                                  ? 'cursor-default border-emerald-200 bg-emerald-50'
                                  : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50',
                              )}
                            >
                              <p className="line-clamp-3 text-sm text-slate-700">{item.text}</p>
                              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] font-medium">
                                <span className="text-slate-400">
                                  {item.metric || 'Winning signal'}
                                </span>
                                <span className={alreadySelected ? 'text-emerald-600' : 'text-blue-600'}>
                                  {alreadySelected ? 'Selected' : 'Use'}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                          No ranked suggestions yet.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Lane Preview
                </p>
                <h4 className="mt-1 text-lg font-semibold text-slate-950">
                  Keep the batching surface light, but editable
                </h4>
              </div>
              {batches.length > 0 && (
                <button
                  onClick={() => useCreativeHubStore.getState().shuffleBatches()}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <Shuffle className="h-4 w-4" />
                  Shuffle lanes
                </button>
              )}
            </div>

            <div className="mt-4">
              <BatchList
                batches={batches}
                creatives={selectedCreatives}
                onRemoveBatch={removeBatch}
                onRemoveCreative={removeCreativeFromBatch}
              />
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <LaunchConfigPanel batches={batches} productProfileId={launchConfig.productProfileId} />

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Checks + Launch
                </p>
                <h4 className="mt-1 text-lg font-semibold text-slate-950">
                  Verify the build, then push it
                </h4>
              </div>
              <button
                onClick={handleRunChecks}
                disabled={checking || batches.length === 0}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Run checks
              </button>
            </div>

            <button
              onClick={() => setShowChecks((current) => !current)}
              className={cn(
                'mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition',
                healthCheckReport
                  ? healthCheckReport.failures > 0
                    ? 'border-red-200 bg-red-50'
                    : healthCheckReport.warnings > 0
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50',
              )}
            >
              <div className="flex items-center gap-3">
                {healthCheckReport ? (
                  healthCheckReport.failures > 0 ? (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )
                ) : (
                  <AlertCircle className="h-4 w-4 text-slate-400" />
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-900">{checksStatusLabel}</p>
                  <p className="text-xs text-slate-500">
                    {healthCheckReport
                      ? `${passedChecks} passed • ${healthCheckReport.warnings} warnings • ${healthCheckReport.failures} failures`
                      : 'Collapsed by default so the launch area stays compact.'}
                  </p>
                </div>
              </div>
              {showChecks ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </button>

            {showChecks && healthCheckReport ? (
              <div className="mt-4">
                <HealthCheckPanel report={healthCheckReport} />
              </div>
            ) : null}

            <button
              onClick={handleLaunch}
              disabled={launching || batches.length === 0}
              className={cn(
                'mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[20px] px-5 py-4 text-base font-semibold transition',
                launching || batches.length === 0
                  ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                  : 'bg-blue-600 text-white shadow-[0_18px_30px_-18px_rgba(37,99,235,0.8)] hover:bg-blue-700',
              )}
            >
              {launching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
              {launching
                ? 'Launching...'
                : `Launch ${totalAds || totalSelected} creative${(totalAds || totalSelected) !== 1 ? 's' : ''}`}
            </button>
          </section>
        </div>
      </div>
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
