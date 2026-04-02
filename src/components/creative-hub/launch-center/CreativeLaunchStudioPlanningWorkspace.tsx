'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Layers3,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';

import { HealthCheckPanel } from '@/components/creative-hub/launch/HealthCheckPanel';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import type { CampaignSetupOptions } from '@/types/campaignCreate';
import type {
  CreativeAiTagSet,
  AIInsightsData,
  BatchStrategy,
  CopyRewriteSuggestion,
  CopyItem,
  CreativeCopyGenerationResponse,
  CreativeBatch,
  ExistingCampaignOption,
  InboxCreative,
  LaunchConfig,
  PreLaunchReport,
  ProductProfile,
  WinningAd,
  WinningAdsData,
} from '@/types/creativeHub';
import type {
  LaunchStudioPlannerVariant,
  LaunchStudioTheme,
} from '@/stores/launchStudioPreferencesStore';

type PlannerMode = 'full' | 'batch' | 'schedule' | 'review';
type PlannerSurfaceTab = 'cloud' | 'manual';
type CopyTabId = 'primary' | 'headlines' | 'descriptions' | 'cta' | 'claude';
type CopySelectionMode = 'primaryTexts' | 'headlines' | 'descriptions';

interface ExecutionField {
  label: string;
  value: string;
  helper?: string;
}

interface SelectionDiagnostics {
  title: string;
  reason: string;
  recommendedStrategy: BatchStrategy;
  recommendedSize: number;
  laneCount: number;
  totalDailyBudget: number;
  uniqueAngles: number;
  uniqueHooks: number;
  uniqueCreators: number;
  uniqueFolders: number;
  uniqueFormats: number;
  warnings: string[];
  strengths: string[];
}

interface LaunchHealthState {
  loading: boolean;
  report: PreLaunchReport | null;
  error: string | null;
  requestKey?: string;
}

interface FetchedAdset {
  id: string;
  name: string;
  spend: number;
  status: string;
}

interface TextInsightItem {
  text: string;
  combinedRoas: number;
  combinedSpend: number;
  totalRevenue?: number;
  purchases: number;
  adCount: number;
  avgCtr?: number;
  avgCpa?: number;
  avgCpc?: number;
  avgCpm?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  usagePercent?: number;
  blendedScore?: number;
}

interface CtaInsightItem {
  type: string;
  label: string;
  combinedRoas: number;
  combinedSpend: number;
  totalRevenue?: number;
  purchases: number;
  adCount: number;
  usagePercent?: number;
  blendedScore?: number;
}

interface ActionCardWithMeta {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  testGoal?: string;
  strategy: BatchStrategy;
  recommendedSize: number;
  campaignMode: 'existing' | 'new';
  structure: 'ABO' | 'CBO';
  budget: number;
  durationDays: number;
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  bestFor: string[];
  confidence?: number;
  confidenceLabel?: string;
  confidenceReason?: string;
  recommendedCampaignName?: string;
}

const PLANNER_VARIANTS: Array<{
  id: LaunchStudioPlannerVariant;
  label: string;
  title: string;
  helper: string;
}> = [
  {
    id: 'option1',
    label: 'Option 1',
    title: 'Meta Console',
    helper: 'Dense manager-style rails and compact control bars.',
  },
  {
    id: 'option2',
    label: 'Option 2',
    title: 'Operator Board',
    helper: 'Bento tiles and KPI cards for faster campaign scanning.',
  },
  {
    id: 'option3',
    label: 'Option 3',
    title: 'Signal Canvas',
    helper: 'Editorial strips with visual hierarchy around the active plan.',
  },
];

type RankedCopyLike = {
  text?: string;
  label?: string;
  usageCount?: number;
  adCount?: number;
  totalSpend?: number;
  totalRevenue?: number;
  totalPurchases?: number;
  totalImpressions?: number;
  totalClicks?: number;
  blendedScore?: number;
  combinedRoas?: number;
  combinedSpend?: number;
  avgCtr?: number;
  avgCpa?: number;
  avgCpc?: number;
  avgCpm?: number;
  purchases?: number;
  usagePercent?: number;
  ctaType?: string;
  metrics?: {
    roas?: number;
    spend?: number;
    revenue?: number;
    purchases?: number;
    impressions?: number;
    clicks?: number;
    ctr?: number;
    cpa?: number;
    cpc?: number;
    cpm?: number;
  };
};

const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'APPLY_NOW', label: 'Apply Now' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'CONTACT_US', label: 'Contact Us' },
];

const DEFAULT_TEXT_PREVIEW_LINES = 3;

function sanitizeClaudeSignal(signal: string): string | null {
  const trimmed = signal.trim();
  if (!trimmed) return null;
  if (/drive\.google\.com|fields:|editor:|final video id:/i.test(trimmed)) return null;
  if (/^Creative selection context:/i.test(trimmed)) {
    return `Selection context: ${truncate(trimmed.replace(/^Creative selection context:\s*/i, ''), 120)}`;
  }
  return truncate(trimmed, 120);
}

function formatCurrencyMetric(value?: number): string {
  return `$${Number.isFinite(value) ? Number(value).toFixed(0) : '0'}`;
}

function formatCurrencyPrecise(value?: number): string {
  return `$${Number.isFinite(value) ? Number(value).toFixed(2) : '0.00'}`;
}

function formatRoasMetric(value?: number): string {
  return `${Number.isFinite(value) ? Number(value).toFixed(2) : '0.00'}x ROAS`;
}

function formatNumberMetric(value?: number, digits = 2): string {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '0.00';
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function formatScheduleLabel(config: Partial<LaunchConfig>): string {
  if (config.launchTime === 'scheduled') {
    const date = config.scheduledDate || 'Select date';
    const time = config.scheduledTime || '09:00';
    return `${date} • ${time}`;
  }

  return 'Draft ready';
}

function createCopyItems(
  texts: string[],
  source: CopyItem['source'],
  extras?: Partial<CopyItem>,
): CopyItem[] {
  return texts
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `${source}-${Date.now()}-${index}-${text.slice(0, 12).replace(/\s+/g, '-')}`,
      text,
      source,
      sourceRoas: extras?.sourceRoas,
      sourceCopyId: extras?.sourceCopyId,
    }));
}

function buildSuggestedCampaignName(productName?: string): string | undefined {
  if (!productName) return undefined;
  return `${productName} | Creative Test ${new Date().toISOString().slice(0, 10)}`;
}

function getStrategyLabel(strategy: BatchStrategy): string {
  switch (strategy) {
    case 'one_per_adset':
      return 'One per ad set';
    case 'by_folder':
      return 'Folder-level test';
    case 'by_format':
      return 'Format split';
    case 'smart_mix':
      return 'Smart mix';
    case 'sequential':
      return 'Sequential';
    case 'shuffle':
      return 'Shuffle';
    default:
      return 'Manual';
  }
}

function getProfileActiveCampaigns(profile?: ProductProfile): NonNullable<ProductProfile['campaignLinks']> {
  return (profile?.campaignLinks ?? []).filter(
    (campaign) => campaign.effectiveStatus === 'ACTIVE' || (!campaign.effectiveStatus && campaign.isActive),
  );
}

function getMostCommonText(values: Array<string | undefined>, fallback: string): string {
  const counts = new Map<string, number>();
  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    counts.set(text, (counts.get(text) || 0) + 1);
  }
  if (counts.size === 0) return fallback;
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

function readAudienceField(creative: InboxCreative, matcher: RegExp): string | undefined {
  const customFieldMatch = (creative.clickupCustomFields || []).find((field) => matcher.test(field.name));
  return customFieldMatch?.value?.trim() || undefined;
}

function isMeaningfulAudienceValue(value?: string): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^mixed\b/i.test(normalized)) return false;
  if (/^(not set|unknown|n\/a)$/i.test(normalized)) return false;
  return true;
}

function getCampaignExecutionMode(campaignMode: 'existing' | 'new', campaignName: string): string {
  return campaignMode === 'existing' ? `Existing campaign draft • ${campaignName}` : `New campaign draft • ${campaignName}`;
}

function getAdSetExecutionLabel(
  campaignMode: 'existing' | 'new',
  adsetMode: LaunchConfig['adsetMode'] | undefined,
  structure: 'ABO' | 'CBO',
  laneCount: number,
  selectedCampaignName: string,
): string {
  if (campaignMode === 'new') {
    return `Fresh ${structure} draft • ${laneCount} new ad sets`;
  }

  if (adsetMode === 'existing_adsets') {
    return `Assign into existing ad sets • ${selectedCampaignName}`;
  }

  return `New ad sets inside existing campaign • ${laneCount} planned lanes`;
}

function formatBidStrategyLabel(value: LaunchConfig['bidStrategy'] | undefined): string {
  switch (value) {
    case 'COST_CAP':
      return 'Cost cap';
    case 'LOWEST_COST_WITH_BID_CAP':
      return 'Bid cap';
    case 'LOWEST_COST_WITH_MIN_ROAS':
      return 'Minimum ROAS';
    case 'LOWEST_COST_WITHOUT_CAP':
    default:
      return 'Lowest cost';
  }
}

function normalizeMetaLabel(value?: string): string {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
}

function resolveSetupOptionIdByName<T extends { id: string }>(
  options: T[],
  savedId: string | undefined,
  labels: Array<string | undefined>,
  getLabel: (option: T) => string | undefined,
): string | undefined {
  const normalizedLabels = labels
    .map((label) => normalizeMetaLabel(label))
    .filter(Boolean);

  if (savedId) {
    const savedOption = options.find((option) => option.id === savedId);
    if (savedOption) {
      if (
        normalizedLabels.length === 0 ||
        normalizedLabels.includes(normalizeMetaLabel(getLabel(savedOption)))
      ) {
        return savedId;
      }
    }
  }

  if (normalizedLabels.length === 0) {
    return savedId;
  }

  const matchedOption = options.find((option) =>
    normalizedLabels.includes(normalizeMetaLabel(getLabel(option))),
  );

  return matchedOption?.id;
}

function summarizeCreativeTargeting(creatives: InboxCreative[]): {
  persona: string;
  age: string;
  gender: string;
  awareness: string;
  angle: string;
} {
  const tagValues = {
    persona: creatives.map(
      (creative) =>
        creative.aiTags?.persona || readAudienceField(creative, /persona|audience|avatar|customer/i),
    ),
    age: creatives.map(
      (creative) =>
        creative.aiTags?.targetAge || readAudienceField(creative, /age|demo|demographic/i),
    ),
    gender: creatives.map(
      (creative) =>
        creative.aiTags?.gender || readAudienceField(creative, /gender|male|female|women|men/i),
    ),
    awareness: creatives.map(
      (creative) =>
        creative.aiTags?.awarenessStage || readAudienceField(creative, /awareness|stage/i),
    ),
    angle: creatives.map((creative) => creative.aiTags?.angle || creative.angle || creative.hook),
  };

  return {
    persona: getMostCommonText(tagValues.persona, 'Mixed persona'),
    age: getMostCommonText(tagValues.age, 'Mixed age'),
    gender: getMostCommonText(tagValues.gender, 'Mixed gender'),
    awareness: getMostCommonText(tagValues.awareness, 'Mixed awareness'),
    angle: getMostCommonText(tagValues.angle, 'Mixed angle'),
  };
}

function buildBlendedScore({
  roas,
  spend,
  ctr,
  purchases,
  usageCount,
}: {
  roas: number;
  spend: number;
  ctr?: number;
  purchases?: number;
  usageCount?: number;
}): number {
  const spendSignal = Math.min(spend / 250, 1.5);
  const ctrSignal = Math.min((ctr || 0) / 2, 1.5);
  const purchaseSignal = Math.min((purchases || 0) / 6, 1.2);
  const usageSignal = Math.min((usageCount || 0) / 4, 1);
  return roas * 0.52 + spendSignal * 0.2 + ctrSignal * 0.12 + purchaseSignal * 0.1 + usageSignal * 0.06;
}

function aggregateTextInsights(
  ads: WinningAd[],
  resolver: (ad: WinningAd) => string | undefined,
): TextInsightItem[] {
  const map = new Map<string, {
    text: string;
    spend: number;
    revenue: number;
    clicks: number;
    impressions: number;
    conversions: number;
    cpmWeighted: Array<{ value: number; weight: number }>;
    ctrWeighted: Array<{ value: number; weight: number }>;
    cpcWeighted: Array<{ value: number; weight: number }>;
    cpaWeighted: Array<{ value: number; weight: number }>;
    adCount: number;
  }>();

  for (const ad of ads) {
    const text = resolver(ad)?.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    const spend = ad.metrics.spend || 0;
    const clicks = ad.metrics.clicks || 0;
    const impressions = ad.metrics.impressions || 0;
    const conversions = ad.metrics.conversions || 0;
    const revenue = ad.metrics.revenue || 0;

    if (!map.has(key)) {
      map.set(key, {
        text,
        spend: 0,
        revenue: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        cpmWeighted: [],
        ctrWeighted: [],
        cpcWeighted: [],
        cpaWeighted: [],
        adCount: 0,
      });
    }

    const current = map.get(key)!;
    current.spend += spend;
    current.revenue += revenue;
    current.clicks += clicks;
    current.impressions += impressions;
    current.conversions += conversions;
    current.adCount += 1;
    current.cpmWeighted.push({ value: ad.metrics.cpm || 0, weight: Math.max(spend, 1) });
    current.ctrWeighted.push({ value: ad.metrics.ctr || 0, weight: Math.max(spend, 1) });
    current.cpcWeighted.push({ value: ad.metrics.cpc || 0, weight: Math.max(spend, 1) });
    current.cpaWeighted.push({ value: ad.metrics.cpa || 0, weight: Math.max(spend, 1) });
  }

  const weighted = (entries: Array<{ value: number; weight: number }>) => {
    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) return 0;
    return entries.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
  };

  return Array.from(map.values())
    .map((item) => {
      const roas = item.spend > 0 ? item.revenue / item.spend : 0;
      const avgCtr = weighted(item.ctrWeighted);
      return {
        text: item.text,
        combinedRoas: roas,
        combinedSpend: item.spend,
        totalRevenue: item.revenue,
        purchases: item.conversions,
        adCount: item.adCount,
        avgCtr,
        avgCpa: weighted(item.cpaWeighted),
        avgCpc: weighted(item.cpcWeighted),
        avgCpm: weighted(item.cpmWeighted),
        impressions: item.impressions,
        clicks: item.clicks,
        conversions: item.conversions,
        blendedScore: buildBlendedScore({
          roas,
          spend: item.spend,
          ctr: avgCtr,
          purchases: item.conversions,
          usageCount: item.adCount,
        }),
      };
    })
    .sort((left, right) =>
      (right.blendedScore || 0) - (left.blendedScore || 0) ||
      right.combinedSpend - left.combinedSpend,
    );
}

function aggregateCtaInsights(ads: WinningAd[]): CtaInsightItem[] {
  const map = new Map<string, { type: string; spend: number; revenue: number; purchases: number; adCount: number }>();

  for (const ad of ads) {
    const type = ad.creative.ctaType?.trim();
    if (!type) continue;
    const key = type.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { type, spend: 0, revenue: 0, purchases: 0, adCount: 0 });
    }
    const current = map.get(key)!;
    current.spend += ad.metrics.spend || 0;
    current.revenue += ad.metrics.revenue || 0;
    current.purchases += ad.metrics.conversions || 0;
    current.adCount += 1;
  }

  const totalAds = Array.from(map.values()).reduce((sum, item) => sum + item.adCount, 0);

  return Array.from(map.values())
    .map((item) => {
      const label = CTA_OPTIONS.find((option) => option.value === item.type)?.label || item.type;
      const roas = item.spend > 0 ? item.revenue / item.spend : 0;
      return {
        type: item.type,
        label,
        combinedRoas: roas,
        combinedSpend: item.spend,
        totalRevenue: item.revenue,
        purchases: item.purchases,
        adCount: item.adCount,
        usagePercent: totalAds > 0 ? Math.round((item.adCount / totalAds) * 100) : 0,
        blendedScore: buildBlendedScore({
          roas,
          spend: item.spend,
          purchases: item.purchases,
          usageCount: item.adCount,
        }),
      };
    })
    .sort((left, right) =>
      (right.blendedScore || 0) - (left.blendedScore || 0) ||
      right.combinedSpend - left.combinedSpend,
    );
}

function normalizeTextInsightItem(item: RankedCopyLike): TextInsightItem {
  const metrics = item.metrics;
  return {
    text: item.text || '',
    combinedRoas: item.combinedRoas ?? metrics?.roas ?? 0,
    combinedSpend: item.combinedSpend ?? item.totalSpend ?? metrics?.spend ?? 0,
    totalRevenue: item.totalRevenue ?? metrics?.revenue ?? 0,
    purchases: item.totalPurchases ?? item.purchases ?? metrics?.purchases ?? 0,
    adCount: item.adCount ?? 0,
    avgCtr: item.avgCtr ?? metrics?.ctr ?? 0,
    avgCpa: item.avgCpa ?? metrics?.cpa ?? 0,
    avgCpc: item.avgCpc ?? metrics?.cpc ?? 0,
    avgCpm: item.avgCpm ?? metrics?.cpm ?? 0,
    impressions: item.totalImpressions ?? metrics?.impressions ?? 0,
    clicks: item.totalClicks ?? metrics?.clicks ?? 0,
    conversions: item.totalPurchases ?? item.purchases ?? metrics?.purchases ?? 0,
    usagePercent: item.usagePercent,
    blendedScore: item.blendedScore ?? 0,
  };
}

function normalizeCtaInsightItem(item: RankedCopyLike): CtaInsightItem {
  const metrics = item.metrics;
  const type = item.ctaType || item.text || '';
  return {
    type,
    label: item.label || CTA_OPTIONS.find((option) => option.value === type)?.label || humanizeCtaLabel(type),
    combinedRoas: item.combinedRoas ?? metrics?.roas ?? 0,
    combinedSpend: item.combinedSpend ?? item.totalSpend ?? metrics?.spend ?? 0,
    totalRevenue: item.totalRevenue ?? metrics?.revenue ?? 0,
    purchases: item.totalPurchases ?? item.purchases ?? metrics?.purchases ?? 0,
    adCount: item.adCount ?? 0,
    usagePercent: item.usagePercent ?? 0,
    blendedScore: item.blendedScore ?? 0,
  };
}

function humanizeCtaLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getAovMetric(
  item: RankedCopyLike | TextInsightItem | CtaInsightItem,
): number {
  const typedItem = item as RankedCopyLike & { totalRevenue?: number };
  const revenue = typedItem.metrics?.revenue ?? typedItem.totalRevenue ?? 0;
  const purchases = typedItem.metrics?.purchases ?? typedItem.totalPurchases ?? typedItem.purchases ?? 0;
  return purchases > 0 ? revenue / purchases : 0;
}

function ExpandableCopyText({
  text,
  expanded,
  onToggle,
  darkMode,
  className,
  lines = DEFAULT_TEXT_PREVIEW_LINES,
}: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
  darkMode: boolean;
  className?: string;
  lines?: number;
}) {
  return (
    <div className={className}>
      <p
        className={cn(
          'whitespace-pre-wrap break-words text-sm leading-7',
          !expanded && lines === 3 && 'line-clamp-3',
          darkMode ? 'text-slate-100' : 'text-slate-800',
        )}
        title={text}
      >
        {text}
      </p>
      {text.length > 140 ? (
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'mt-2 inline-flex items-center gap-1 text-xs font-semibold transition-colors',
            darkMode ? 'text-sky-300 hover:text-sky-200' : 'text-sky-700 hover:text-sky-900',
          )}
        >
          {expanded ? 'See less' : 'See more'}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

function LaunchDiagramNode({
  label,
  value,
  helper,
  darkMode,
}: {
  label: string;
  value: string;
  helper?: string;
  darkMode: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-[160px] flex-1 rounded-[20px] px-3 py-3',
        darkMode ? 'border border-white/10 bg-white/[0.04]' : 'border border-slate-200 bg-white',
      )}
    >
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
        {label}
      </p>
      <p className={cn('mt-2 text-sm font-semibold leading-6', darkMode ? 'text-slate-100' : 'text-slate-900')}>
        {value}
      </p>
      {helper ? (
        <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export function CreativeLaunchStudioPlanningWorkspace({
  storeId,
  profile,
  selectedCreatives,
  launchConfig,
  theme,
  plannerVariant,
  diagnostics,
  aiAnalysis,
  winningAds,
  existingCampaignOptions,
  batches,
  batchSize,
  activeStrategy,
  healthState,
  reviewDisabled,
  reviewHint,
  creativeLookup,
  setBatchSize,
  updateLaunchConfig,
  onReviewLaunch,
  onApplyStrategy,
  onApplyAiLaunchAction,
  onApplyRecommendedStrategy,
  onClearBatches,
  onPlannerVariantChange,
  plannerMode = 'full',
}: {
  storeId: string;
  profile?: ProductProfile;
  selectedCreatives: InboxCreative[];
  launchConfig: Partial<LaunchConfig>;
  theme: LaunchStudioTheme;
  plannerVariant: LaunchStudioPlannerVariant;
  diagnostics: SelectionDiagnostics;
  aiAnalysis: { loading: boolean; data: AIInsightsData | null; error: string | null };
  winningAds: WinningAdsData | null;
  existingCampaignOptions: ExistingCampaignOption[];
  batches: CreativeBatch[];
  batchSize: number;
  activeStrategy: BatchStrategy;
  healthState: LaunchHealthState;
  reviewDisabled: boolean;
  reviewHint?: string | null;
  creativeLookup: Map<string, InboxCreative>;
  setBatchSize: (value: number) => void;
  updateLaunchConfig: (partial: Partial<LaunchConfig>) => void;
  onRefreshHealthCheck: () => void;
  onRefreshAiDraft: () => void;
  onReviewLaunch: () => void;
  onApplyStrategy: (strategy: BatchStrategy, size: number) => void;
  onApplyAiLaunchAction: (actionId: string) => void;
  onApplyRecommendedStrategy: () => void;
  onClearBatches: () => void;
  onPlannerVariantChange: (variant: LaunchStudioPlannerVariant) => void;
  plannerMode?: PlannerMode;
}) {
  const darkMode = theme === 'dark';
  const structure = launchConfig.structure ?? profile?.defaultStructure ?? 'ABO';
  const budget = launchConfig.dailyBudget ?? profile?.defaultBudget ?? 20;
  const duration = launchConfig.testDuration ?? profile?.defaultDuration ?? 3;
  const campaignMode = launchConfig.campaignMode ?? 'existing';
  const activeCampaigns = getProfileActiveCampaigns(profile);
  const selectedCampaignName =
    activeCampaigns.find((campaign) => campaign.campaignId === launchConfig.existingCampaignId)?.campaignName ||
    (campaignMode === 'existing'
      ? activeCampaigns[0]?.campaignName || 'Choose campaign in launch setup'
      : launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || 'New campaign draft');
  const launchDraft = aiAnalysis.data?.launchDraft;
  const actionCards = ((launchDraft?.actionCards || []) as ActionCardWithMeta[]);
  const copyPlan = launchDraft?.copyPlan;
  const primaryTexts = launchConfig.primaryTexts || [];
  const headlines = launchConfig.headlines || [];
  const descriptions = launchConfig.descriptions || [];
  const plannerPanelClass = darkMode
    ? 'rounded-[24px] border border-white/10 bg-slate-950/88 shadow-[0_18px_40px_rgba(0,0,0,0.22)]'
    : 'rounded-[24px] border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]';
  const plannerInsetClass = darkMode
    ? 'rounded-[20px] border border-white/10 bg-slate-900/90'
    : 'rounded-[20px] border border-slate-200 bg-white';
  const plannerSoftClass = darkMode
    ? 'rounded-[22px] border border-white/8 bg-white/[0.03]'
    : 'rounded-[22px] border border-slate-200 bg-slate-50/80';
  const plannerChipClass = darkMode
    ? 'rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-slate-200'
    : 'rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700';
  const plannerButtonSecondary = darkMode
    ? 'rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]'
    : 'rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50';
  const plannerVariantConfig = PLANNER_VARIANTS.find((variant) => variant.id === plannerVariant) || PLANNER_VARIANTS[0];
  const plannerWorkspaceShellClass = cn(plannerPanelClass, 'p-4');
  const plannerVariantButtonClass = (active: boolean) =>
    cn(
      plannerVariant === 'option1'
        ? 'rounded-[10px] px-3 py-2 text-xs font-semibold transition-all'
        : 'rounded-full px-3 py-2 text-xs font-semibold transition-all',
      active
        ? darkMode
          ? plannerVariant === 'option2'
            ? 'bg-sky-100 text-slate-950 shadow-[0_10px_22px_rgba(56,189,248,0.14)]'
            : 'bg-white text-slate-950 shadow-[0_10px_22px_rgba(255,255,255,0.08)]'
          : plannerVariant === 'option1'
            ? 'bg-slate-900 text-white'
            : 'bg-slate-900 text-white'
        : darkMode
          ? plannerVariant === 'option1'
            ? 'bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]'
            : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
          : plannerVariant === 'option2'
            ? 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            : 'bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:bg-white',
    );
  const summaryMetricCardClass = cn(
    'min-w-[112px] rounded-[20px] px-3 py-2.5',
    darkMode ? 'border border-white/10 bg-white/[0.05]' : 'border border-slate-200 bg-white',
  );
  const batchHeroShellClass = 'space-y-4';
  const launchControlShellClass = 'mt-3 grid gap-2 md:grid-cols-3';
  const [campaignAdsets, setCampaignAdsets] = useState<FetchedAdset[]>([]);
  const [adsetsLoading, setAdsetsLoading] = useState(false);
  const [copyAutofillLoading, setCopyAutofillLoading] = useState(false);
  const [copyAutofillError, setCopyAutofillError] = useState<string | null>(null);
  const [plannerSurfaceTab, setPlannerSurfaceTab] = useState<PlannerSurfaceTab>('cloud');
  const [claudeRewriteData, setClaudeRewriteData] = useState<CreativeCopyGenerationResponse | null>(null);
  const [copyLibraryTab, setCopyLibraryTab] = useState<CopyTabId>('primary');
  const [expandedCopyKeys, setExpandedCopyKeys] = useState<Record<string, boolean>>({});
  const [expandedCloudActionId, setExpandedCloudActionId] = useState<string | null>(null);
  const [appliedCloudActionIds, setAppliedCloudActionIds] = useState<string[]>([]);
  const [setupOptions, setSetupOptions] = useState<CampaignSetupOptions | null>(null);
  const [setupOptionsLoading, setSetupOptionsLoading] = useState(false);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [launchReviewOpen, setLaunchReviewOpen] = useState(false);
  const [launchMetaExpanded, setLaunchMetaExpanded] = useState(false);
  const [claudeModalOpen, setClaudeModalOpen] = useState(false);
  const [activeClaudeSuggestionId, setActiveClaudeSuggestionId] = useState<string | null>(null);
  const selectedCampaignId = launchConfig.existingCampaignId;
  const selectedAdsetAssignments = launchConfig.existingAdsetAssignments || {};
  const selectedCampaignOption =
    existingCampaignOptions.find((campaign) => campaign.campaignId === selectedCampaignId) ||
    existingCampaignOptions[0] ||
    null;
  const selectedAssignedAdsetId = Object.keys(selectedAdsetAssignments)[0] || '';
  const selectedAssignedAdset =
    campaignAdsets.find((adset) => adset.id === selectedAssignedAdsetId) || null;

  useEffect(() => {
    const fetchAdsets = async () => {
      if (!storeId || campaignMode !== 'existing' || !selectedCampaignId) {
        setCampaignAdsets([]);
        setAdsetsLoading(false);
        return;
      }

      setAdsetsLoading(true);
      try {
        const params = new URLSearchParams({ storeId, campaignId: selectedCampaignId });
        const response = await fetch(`/api/meta/adsets?${params.toString()}`);
        const data = await response.json();
        const rows = data.data ?? data.adsets ?? [];
        setCampaignAdsets(
          rows.map((adset: Record<string, unknown>) => ({
            id: String(adset.id ?? ''),
            name: String(adset.name || 'Untitled ad set'),
            spend:
              typeof (adset.metrics as { spend?: unknown } | undefined)?.spend === 'number'
                ? Number((adset.metrics as { spend?: number }).spend || 0)
                : parseFloat(String((adset.metrics as { spend?: string } | undefined)?.spend || '0')) || 0,
            status: String(adset.status || 'UNKNOWN'),
          })),
        );
      } catch {
        setCampaignAdsets([]);
      } finally {
        setAdsetsLoading(false);
      }
    };

    void fetchAdsets();
  }, [campaignMode, selectedCampaignId, storeId]);

  useEffect(() => {
    let cancelled = false;

    const fetchSetupOptions = async () => {
      if (!storeId) {
        setSetupOptions(null);
        setSetupOptionsLoading(false);
        return;
      }

      setSetupOptionsLoading(true);
      try {
        const params = new URLSearchParams({ storeId });
        if (launchConfig.adAccountId) {
          params.set('accountId', launchConfig.adAccountId);
        }
        const response = await fetch(`/api/meta/campaign-setup/options?${params.toString()}`);
        const data = await response.json();
        if (cancelled || !response.ok) return;
        setSetupOptions(data as CampaignSetupOptions);
      } catch {
        if (!cancelled) {
          setSetupOptions(null);
        }
      } finally {
        if (!cancelled) {
          setSetupOptionsLoading(false);
        }
      }
    };

    void fetchSetupOptions();

    return () => {
      cancelled = true;
    };
  }, [launchConfig.adAccountId, storeId]);

  const primaryTextInsights = useMemo(() => {
    const source =
      (winningAds?.copyIntelligence?.primaryTexts?.length ? winningAds.copyIntelligence.primaryTexts : null) ||
      (winningAds?.winningPrimaryTexts?.length ? winningAds.winningPrimaryTexts : null) ||
      winningAds?.uniquePTs ||
      [];
    return source.map((item) => normalizeTextInsightItem(item as RankedCopyLike)).filter((item) => item.text);
  }, [winningAds]);

  const headlineInsights = useMemo(() => {
    const source =
      (winningAds?.copyIntelligence?.headlines?.length ? winningAds.copyIntelligence.headlines : null) ||
      (winningAds?.winningHeadlines?.length ? winningAds.winningHeadlines : null) ||
      winningAds?.uniqueHeadlines ||
      [];
    return source.map((item) => normalizeTextInsightItem(item as RankedCopyLike)).filter((item) => item.text);
  }, [winningAds]);

  const descriptionInsights = useMemo(() => {
    const structured = winningAds?.copyIntelligence?.descriptions;
    if (structured?.length) {
      return structured.map((item) => normalizeTextInsightItem(item as RankedCopyLike)).filter((item) => item.text);
    }
    const enriched = winningAds as (WinningAdsData & { uniqueDescriptions?: TextInsightItem[] }) | null;
    if (enriched?.uniqueDescriptions?.length) {
      return enriched.uniqueDescriptions;
    }
    if (winningAds?.winningDescriptions?.length) {
      return winningAds.winningDescriptions.map((item) => normalizeTextInsightItem(item as RankedCopyLike)).filter((item) => item.text);
    }
    return aggregateTextInsights(winningAds?.winningAds || [], (ad) => ad.creative.description);
  }, [winningAds]);

  const ctaInsights = useMemo(() => {
    const structured = winningAds?.copyIntelligence?.ctas;
    if (structured?.length) {
      return structured.map((item) => normalizeCtaInsightItem(item as RankedCopyLike)).filter((item) => item.type);
    }
    const enriched = winningAds as (WinningAdsData & { ctaInsights?: CtaInsightItem[]; uniqueCTAs?: CtaInsightItem[] }) | null;
    if (enriched?.ctaInsights?.length) {
      return enriched.ctaInsights;
    }
    if (enriched?.uniqueCTAs?.length) {
      return enriched.uniqueCTAs;
    }
    if (winningAds?.winningCTAs?.length) {
      return winningAds.winningCTAs.map((item) => normalizeCtaInsightItem(item as RankedCopyLike)).filter((item) => item.type);
    }
    return aggregateCtaInsights(winningAds?.winningAds || []);
  }, [winningAds]);

  const selectedAudienceSummary = useMemo(
    () => summarizeCreativeTargeting(selectedCreatives),
    [selectedCreatives],
  );

  const topWinningBundle = useMemo(() => ({
    primaryTexts: primaryTextInsights.slice(0, 3).map((item) => item.text),
    headlines: headlineInsights.slice(0, 3).map((item) => item.text),
    descriptions: descriptionInsights.slice(0, 2).map((item) => item.text),
    ctaType: ctaInsights[0]?.type || winningAds?.bestCTA?.type || winningAds?.autoFill?.cta || 'SHOP_NOW',
  }), [ctaInsights, descriptionInsights, headlineInsights, primaryTextInsights, winningAds]);

  const claudeSuggestionBundle = useMemo<CreativeCopyGenerationResponse | null>(() => {
    if (claudeRewriteData) return claudeRewriteData;
    if (!copyPlan) return null;

    const fallbackSuggestion: CopyRewriteSuggestion = {
      id: 'selection-review-bundle',
      title: 'Review-first selection bundle',
      summary: 'Use this as a starting point only after checking the targeting read and creative fit.',
      confidence: 72,
      intent: 'control_plus_challenger',
      targeting: {
        persona: selectedAudienceSummary.persona,
        ageGroup: selectedAudienceSummary.age,
        gender: selectedAudienceSummary.gender,
        awarenessStage: selectedAudienceSummary.awareness,
        angle: selectedAudienceSummary.angle,
        rationale: 'Built from the current selection because a fresh Claude rewrite has not been run yet.',
      },
      primaryTexts: copyPlan.primaryTexts || [],
      headlines: copyPlan.headlines || [],
      descriptions: copyPlan.descriptions || [],
      bestFor: ['Quick operator review', 'Selection-aware rewrite starting point'],
      watchouts: ['Run Claude rewrite again if you need audience-specific options.'],
      winningSignals: [`Selection angle: ${selectedAudienceSummary.angle}`],
    };

    return {
      source: 'fallback',
      workflowMode: 'review_first',
      productName: profile?.productName || 'Selected product',
      profitabilityFloor: launchConfig.roasFloor ?? profile?.defaultRoasFloor ?? 1.2,
      analysis: {
        winningAudience: {
          persona: selectedAudienceSummary.persona,
          ageGroup: selectedAudienceSummary.age,
          gender: selectedAudienceSummary.gender,
          awarenessStage: selectedAudienceSummary.awareness,
          angle: selectedAudienceSummary.angle,
          rationale: 'Built from the selected creative set because no Claude rewrite pass has been run yet.',
        },
        winningSignals: [`Selection angle: ${selectedAudienceSummary.angle}`],
        notes: ['Run Claude rewrite to generate review-first copy options before applying any bundle.'],
      },
      suggestions:
        fallbackSuggestion.primaryTexts.length ||
        fallbackSuggestion.headlines.length ||
        fallbackSuggestion.descriptions.length
          ? [fallbackSuggestion]
          : [],
      primaryTexts: copyPlan.primaryTexts || [],
      headlines: copyPlan.headlines || [],
      descriptions: copyPlan.descriptions || [],
    };
  }, [
    claudeRewriteData,
    copyPlan,
    launchConfig.roasFloor,
    profile?.defaultRoasFloor,
    profile?.productName,
    selectedAudienceSummary.age,
    selectedAudienceSummary.angle,
    selectedAudienceSummary.awareness,
    selectedAudienceSummary.gender,
    selectedAudienceSummary.persona,
  ]);

  const claudeRewriteSuggestions = useMemo(
    () => claudeSuggestionBundle?.suggestions || [],
    [claudeSuggestionBundle],
  );

  const cleanedClaudeSignals = useMemo(
    () =>
      (claudeSuggestionBundle?.analysis.winningSignals || [])
        .map((signal) => sanitizeClaudeSignal(signal))
        .filter((signal): signal is string => Boolean(signal))
        .slice(0, 4),
    [claudeSuggestionBundle?.analysis.winningSignals],
  );

  const selectedCopyLookup = useMemo(
    () => ({
      primaryTexts: new Set(primaryTexts.map((item) => item.text.trim().toLowerCase())),
      headlines: new Set(headlines.map((item) => item.text.trim().toLowerCase())),
      descriptions: new Set(descriptions.map((item) => item.text.trim().toLowerCase())),
    }),
    [descriptions, headlines, primaryTexts],
  );

  const textLibraryConfigs = useMemo(
    () => [
      {
        id: 'primary' as const,
        label: 'Primary text',
        selectionKey: 'primaryTexts' as const,
        items: primaryTextInsights,
        empty: 'No winning primary text found yet.',
      },
      {
        id: 'headlines' as const,
        label: 'Headline',
        selectionKey: 'headlines' as const,
        items: headlineInsights,
        empty: 'No winning headlines found yet.',
      },
      {
        id: 'descriptions' as const,
        label: 'Description',
        selectionKey: 'descriptions' as const,
        items: descriptionInsights,
        empty: 'No ranked descriptions found yet.',
      },
    ],
    [descriptionInsights, headlineInsights, primaryTextInsights],
  );

  const activeTextLibrary = useMemo(
    () => textLibraryConfigs.find((config) => config.id === copyLibraryTab) || null,
    [copyLibraryTab, textLibraryConfigs],
  );

  const activeClaudeSuggestion = useMemo(
    () => claudeRewriteSuggestions.find((suggestion) => suggestion.id === activeClaudeSuggestionId) || claudeRewriteSuggestions[0] || null,
    [activeClaudeSuggestionId, claudeRewriteSuggestions],
  );

  const activeCtaLabel =
    CTA_OPTIONS.find((option) => option.value === (launchConfig.ctaType || topWinningBundle.ctaType))?.label ||
    launchConfig.ctaType ||
    topWinningBundle.ctaType;

  const selectedCopyGroups = [
    { key: 'primaryTexts' as const, label: 'Primary Texts', items: primaryTexts },
    { key: 'headlines' as const, label: 'Headlines', items: headlines },
    { key: 'descriptions' as const, label: 'Descriptions', items: descriptions },
  ];
  const launchStructureSummary = useMemo(() => {
    const campaignLabel =
      campaignMode === 'existing'
        ? selectedCampaignName
        : launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || 'New campaign draft';
    const adSetLabel = getAdSetExecutionLabel(
      campaignMode,
      launchConfig.adsetMode,
      structure,
      batches.length > 0 ? batches.length : diagnostics.laneCount,
      selectedCampaignName,
    );
    const creativeSplitLabel = batches.length > 0
      ? `${batches.length} planned lanes • ${selectedCreatives.length} creatives`
      : `${diagnostics.laneCount} lanes • ${selectedCreatives.length} creatives`;

    return [
      { label: 'Campaign', value: campaignLabel, helper: getCampaignExecutionMode(campaignMode, campaignLabel) },
      { label: 'Ad sets', value: adSetLabel, helper: `${structure} • ${formatCurrencyMetric(budget)} per day` },
      { label: 'Creative map', value: creativeSplitLabel, helper: `${primaryTexts.length} PT • ${headlines.length} headlines • ${descriptions.length} descriptions` },
      { label: 'Targeting read', value: selectedAudienceSummary.persona, helper: `${selectedAudienceSummary.age} • ${selectedAudienceSummary.gender} • ${selectedAudienceSummary.awareness}` },
    ] satisfies ExecutionField[];
  }, [
    batches.length,
    budget,
    campaignMode,
    descriptions.length,
    diagnostics.laneCount,
    headlines.length,
    launchConfig.newCampaignName,
    launchConfig.adsetMode,
    primaryTexts.length,
    profile?.productName,
    selectedAudienceSummary.age,
    selectedAudienceSummary.awareness,
    selectedAudienceSummary.gender,
    selectedAudienceSummary.persona,
    selectedCampaignName,
    selectedCreatives.length,
    structure,
  ]);
  const accountOptions = setupOptions?.accounts || [];
  const pageOptions = setupOptions?.pages || [];
  const instagramOptions = setupOptions?.instagramAccounts || [];
  const pixelOptions = setupOptions?.pixels || [];
  const conversionEventOptions = setupOptions?.conversionEvents || [];
  const preferredPageLabels = [
    campaignMode === 'existing' ? selectedCampaignOption?.pageName : undefined,
    profile?.pageName,
  ];
  const preferredPixelLabels = [
    campaignMode === 'existing' ? selectedCampaignOption?.pixelName : undefined,
    profile?.pixelName,
  ];
  const preferredInstagramLabels = [profile?.instagramUsername];
  const selectedAccountId = launchConfig.adAccountId || setupOptions?.defaultAccountId || profile?.adAccountId || '';
  const resolvedPageId = resolveSetupOptionIdByName(
    pageOptions,
    launchConfig.pageId || profile?.pageId,
    preferredPageLabels,
    (option) => option.name,
  );
  const resolvedPixelId = resolveSetupOptionIdByName(
    pixelOptions,
    launchConfig.pixelId || profile?.pixelId,
    preferredPixelLabels,
    (option) => option.name,
  );
  const resolvedInstagramId =
    resolveSetupOptionIdByName(
      instagramOptions,
      launchConfig.instagramActorId || profile?.instagramActorId,
      preferredInstagramLabels,
      (option) => option.username,
    ) ||
    pageOptions.find((page) => page.id === resolvedPageId)?.instagramAccountId;
  const unresolvedSavedPageLabel = !resolvedPageId ? preferredPageLabels.find(Boolean) : undefined;
  const unresolvedSavedPixelLabel = !resolvedPixelId ? preferredPixelLabels.find(Boolean) : undefined;
  const unresolvedSavedInstagramLabel =
    !resolvedInstagramId && !pageOptions.find((page) => page.id === resolvedPageId)?.instagramAccountId
      ? preferredInstagramLabels.find(Boolean)
      : undefined;
  const selectedPageId = resolvedPageId || (!unresolvedSavedPageLabel ? pageOptions[0]?.id || '' : '');
  const selectedPixelId = resolvedPixelId || (!unresolvedSavedPixelLabel ? pixelOptions[0]?.id || '' : '');
  const selectedInstagramId =
    resolvedInstagramId ||
    pageOptions.find((page) => page.id === selectedPageId)?.instagramAccountId ||
    (!unresolvedSavedInstagramLabel ? instagramOptions[0]?.id : undefined) ||
    '';
  const selectedPageLabel =
    (selectedPageId
      ? pageOptions.find((page) => page.id === selectedPageId)?.name || selectedPageId
      : unresolvedSavedPageLabel) || 'No page';
  const selectedInstagramLabel =
    (selectedInstagramId
      ? instagramOptions.find((account) => account.id === selectedInstagramId)?.username || selectedInstagramId
      : unresolvedSavedInstagramLabel) || 'No IG actor';
  const destinationUrl = launchConfig.destinationUrl || profile?.destinationUrl || '';
  const selectedCampaignCount = campaignMode === 'existing' ? 1 : Math.max(appliedCloudActionIds.length, 1);
  const laneCount = Math.max(batches.length || diagnostics.laneCount, 0);
  const newAdSetCount =
    campaignMode === 'existing' && launchConfig.adsetMode === 'existing_adsets'
      ? 0
      : laneCount;
  const selectedCampaignStructure = selectedCampaignOption?.structure || structure;
  const existingBudgetLocked = campaignMode === 'existing' && selectedCampaignStructure === 'CBO';
  const bidStrategyLabel = formatBidStrategyLabel(launchConfig.bidStrategy);
  const showBidAmount =
    launchConfig.bidStrategy === 'COST_CAP' || launchConfig.bidStrategy === 'LOWEST_COST_WITH_BID_CAP';
  const showRoasFloor = launchConfig.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS';
  const healthSummaryLabel = healthState.loading
    ? 'Running launch checks'
    : healthState.error
      ? 'Launch checks need attention'
      : healthState.report
        ? `${healthState.report.failures} fail • ${healthState.report.warnings} warn`
        : 'Checks not run yet';
  const launchSummaryChips = [
    `${selectedCreatives.length} creatives`,
    `${selectedCampaignCount} campaign${selectedCampaignCount === 1 ? '' : 's'}`,
    launchConfig.adsetMode === 'existing_adsets' ? 'Existing ad set path' : `${newAdSetCount} new ad sets`,
    `${primaryTexts.length} PT`,
    `${headlines.length} headlines`,
    `${descriptions.length} descriptions`,
  ];

  useEffect(() => {
    if (claudeRewriteSuggestions.length > 0 && !activeClaudeSuggestionId) {
      setActiveClaudeSuggestionId(claudeRewriteSuggestions[0].id);
    }
  }, [activeClaudeSuggestionId, claudeRewriteSuggestions]);

  useEffect(() => {
    if (!setupOptions) return;

    const nextAccountId = launchConfig.adAccountId || setupOptions.defaultAccountId || setupOptions.accounts[0]?.id;
    const nextPageId =
      resolveSetupOptionIdByName(
        setupOptions.pages,
        launchConfig.pageId || profile?.pageId,
        preferredPageLabels,
        (option) => option.name,
      ) ||
      (!preferredPageLabels.some(Boolean) ? setupOptions.pages[0]?.id : undefined);
    const nextPixelId =
      resolveSetupOptionIdByName(
        setupOptions.pixels,
        launchConfig.pixelId || profile?.pixelId,
        preferredPixelLabels,
        (option) => option.name,
      ) ||
      (!preferredPixelLabels.some(Boolean) ? setupOptions.pixels[0]?.id : undefined);
    const nextInstagramId =
      resolveSetupOptionIdByName(
        setupOptions.instagramAccounts,
        launchConfig.instagramActorId || profile?.instagramActorId,
        preferredInstagramLabels,
        (option) => option.username,
      ) ||
      setupOptions.pages.find((page) => page.id === nextPageId)?.instagramAccountId ||
      (!preferredInstagramLabels.some(Boolean) ? setupOptions.instagramAccounts[0]?.id : undefined);
    const nextConversionEvent =
      launchConfig.conversionEvent ||
      profile?.conversionEvent ||
      setupOptions.conversionEvents[0];

    if (
      nextAccountId !== launchConfig.adAccountId ||
      nextPageId !== launchConfig.pageId ||
      nextPixelId !== launchConfig.pixelId ||
      nextInstagramId !== launchConfig.instagramActorId ||
      nextConversionEvent !== launchConfig.conversionEvent
    ) {
      updateLaunchConfig({
        adAccountId: nextAccountId,
        pageId: nextPageId,
        pixelId: nextPixelId,
        instagramActorId: nextInstagramId,
        conversionEvent: nextConversionEvent,
      });
    }
  }, [
    launchConfig.adAccountId,
    launchConfig.conversionEvent,
    launchConfig.instagramActorId,
    launchConfig.pageId,
    launchConfig.pixelId,
    profile?.conversionEvent,
    profile?.instagramActorId,
    profile?.instagramUsername,
    profile?.pageId,
    profile?.pageName,
    profile?.pixelId,
    profile?.pixelName,
    selectedCampaignOption?.pageName,
    selectedCampaignOption?.pixelName,
    setupOptions,
    updateLaunchConfig,
  ]);

  const plannerTabButtonClass = useCallback(
    (active: boolean) =>
      cn(
        'rounded-full px-4 py-2 text-sm font-semibold transition-all',
        active
          ? darkMode
            ? 'bg-white text-slate-950 shadow-[0_10px_22px_rgba(255,255,255,0.12)]'
            : 'bg-slate-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.10)]'
          : darkMode
            ? 'bg-white/[0.05] text-slate-300 ring-1 ring-white/10 hover:bg-white/[0.08]'
            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
      ),
    [darkMode],
  );

  const manualPlanCards = useMemo(() => {
    const linked = (id: string) => actionCards.find((card) => card.id === id)?.id;
    return [
      {
        id: 'fresh-creative-test',
        title: 'Fresh creative test',
        description: 'Give mostly new creatives a clean first read with one obvious variable per lane.',
        bestFor: ['Untested batch', 'Fast first signal'],
        executionFields: [
          { label: 'Campaign', value: getCampaignExecutionMode(campaignMode, selectedCampaignName) },
          { label: 'Ad sets', value: '1 creative per ad set', helper: 'New ad sets inside the current draft' },
          { label: 'Copy map', value: `${batchSize} lanes`, helper: 'One obvious variable per lane' },
          { label: 'Write behavior', value: 'Draft-only', helper: 'No direct live overwrite' },
        ],
        strategy: 'one_per_adset' as BatchStrategy,
        size: 1,
        structure: 'ABO' as const,
        budget: 20,
        durationDays: 3,
        linkedActionId: linked('fresh-untested'),
      },
      {
        id: 'hook-diversity-test',
        title: 'Hook diversity test',
        description: 'Hold the offer steady and compare the opening idea or first-frame promise.',
        bestFor: ['Hook spread', 'Message discovery'],
        executionFields: [
          { label: 'Campaign', value: getCampaignExecutionMode(campaignMode, selectedCampaignName) },
          { label: 'Ad sets', value: 'One per hook', helper: 'Separate ad sets for each opening idea' },
          { label: 'Copy map', value: `${batchSize} lanes`, helper: 'Compare first-frame or hook only' },
          { label: 'Write behavior', value: 'Draft-only', helper: 'Keep the source campaign untouched' },
        ],
        strategy: 'one_per_adset' as BatchStrategy,
        size: 1,
        structure: 'ABO' as const,
        budget: 20,
        durationDays: 3,
        linkedActionId: linked('hook-diversity'),
      },
      {
        id: 'angle-test',
        title: 'Angle test',
        description: 'Split by awareness level, pain point, or promise so each lane answers one question.',
        bestFor: ['Awareness testing', 'Angle validation'],
        executionFields: [
          { label: 'Campaign', value: getCampaignExecutionMode(campaignMode, selectedCampaignName) },
          { label: 'Ad sets', value: 'Grouped by angle', helper: 'One angle question per ad set' },
          { label: 'Copy map', value: `${batchSize} lanes`, helper: 'Use the strongest angle per lane' },
          { label: 'Write behavior', value: 'Draft-only', helper: 'Keep current live structure intact' },
        ],
        strategy: 'smart_mix' as BatchStrategy,
        size: Math.max(2, batchSize),
        structure: 'ABO' as const,
        budget: Math.max(20, budget),
        durationDays: 3,
      },
      {
        id: 'folder-level-testing',
        title: 'Folder-level testing',
        description: 'Keep concept folders intact when the source folders already represent real creative families.',
        bestFor: ['Concept pack launch', 'Folder-led testing'],
        executionFields: [
          { label: 'Campaign', value: getCampaignExecutionMode(campaignMode, selectedCampaignName) },
          { label: 'Ad sets', value: 'Folder split', helper: 'Keep concept families together' },
          { label: 'Copy map', value: `${batchSize} lanes`, helper: 'Respect the source folder grouping' },
          { label: 'Write behavior', value: 'Draft-only', helper: 'Create lanes without changing live ads' },
        ],
        strategy: 'by_folder' as BatchStrategy,
        size: Math.max(2, batchSize),
        structure: structure,
        budget: Math.max(20, budget),
        durationDays: 4,
        linkedActionId: linked('folder-pack'),
      },
      {
        id: 'winner-iteration',
        title: 'Winner iteration',
        description: 'Use one proven angle as the control and rotate close challengers around it.',
        bestFor: ['Control vs challenger', 'Copy iteration'],
        executionFields: [
          { label: 'Campaign', value: getCampaignExecutionMode(campaignMode, selectedCampaignName) },
          { label: 'Ad sets', value: 'Control + challengers', helper: 'One control lane and challenger lanes' },
          { label: 'Copy map', value: `${batchSize} lanes`, helper: 'Control first, challengers second' },
          { label: 'Write behavior', value: 'Draft-only', helper: 'Apply as a planned scenario first' },
        ],
        strategy: 'smart_mix' as BatchStrategy,
        size: Math.max(2, batchSize),
        structure: 'ABO' as const,
        budget: Math.max(20, budget),
        durationDays: 3,
        linkedActionId: linked('winner-challengers'),
      },
      {
        id: 'scale-winner-expansion',
        title: 'Scale winner expansion',
        description: 'Support a live winner with stronger commercial copy and a broader budget model.',
        bestFor: ['Scale support', 'Existing campaign expansion'],
        executionFields: [
          { label: 'Campaign', value: getCampaignExecutionMode(campaignMode, selectedCampaignName) },
          { label: 'Ad sets', value: 'Expand inside winner path', helper: 'Broader budget model with stronger copy' },
          { label: 'Copy map', value: `${batchSize} lanes`, helper: 'Support the strongest commercial angle' },
          { label: 'Write behavior', value: 'Draft-only', helper: 'Prepare the scale move before review' },
        ],
        strategy: 'smart_mix' as BatchStrategy,
        size: Math.max(2, batchSize),
        structure: 'CBO' as const,
        budget: Math.max(40, budget),
        durationDays: Math.max(3, duration),
        linkedActionId: linked('scale-winner-angle'),
      },
    ];
  }, [actionCards, batchSize, budget, campaignMode, duration, selectedCampaignName, structure]);

  const cloudActionFields = useCallback(
    (card: ActionCardWithMeta): ExecutionField[] => {
      const recommendedCampaignName =
        card.recommendedCampaignName ||
        (card.campaignMode === 'existing'
          ? selectedCampaignName
          : launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || 'New campaign draft');

      return [
        {
          label: 'Campaign',
          value: card.campaignMode === 'existing' ? 'Existing campaign draft' : 'New campaign draft',
          helper: recommendedCampaignName,
        },
        {
          label: 'Ad sets',
          value:
            card.campaignMode === 'existing' && launchConfig.adsetMode === 'existing_adsets'
              ? 'Existing ad sets'
              : card.structure === 'CBO'
                ? 'Broader campaign-level control'
                : `${card.recommendedSize} planned lanes`,
          helper:
            card.strategy === 'one_per_adset'
              ? 'One creative per ad set'
              : card.strategy === 'by_folder'
                ? 'Folder families stay together'
                : card.strategy === 'smart_mix'
                  ? 'Control vs challenger mix'
                  : 'Draft structure only',
        },
        {
          label: 'Creative split',
          value: `${card.primaryTexts.length} PT • ${card.headlines.length} headlines • ${card.descriptions.length} descriptions`,
          helper: card.bestFor[0] || 'Creative split preview',
        },
        {
          label: 'Write behavior',
          value: card.campaignMode === 'existing' ? 'Draft-only existing campaign change' : 'New campaign draft',
          helper: card.structure === 'CBO' ? 'Use the strongest control lane' : 'One lane per question',
        },
      ];
    },
    [launchConfig.adsetMode, launchConfig.newCampaignName, profile?.productName, selectedCampaignName],
  );

  const addCopyVariant = useCallback(
    (
      key: 'primaryTexts' | 'headlines' | 'descriptions',
      text: string,
      source: CopyItem['source'],
      extras?: Partial<CopyItem>,
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const current = (launchConfig[key] as CopyItem[] | undefined) || [];
      if (current.some((item) => item.text.trim().toLowerCase() === trimmed.toLowerCase())) return;

      updateLaunchConfig({
        [key]: [
          ...current,
          {
            id: `${key}-${source}-${Date.now()}-${trimmed.slice(0, 16).replace(/\s+/g, '-')}`,
            text: trimmed,
            source,
            sourceRoas: extras?.sourceRoas,
            sourceCopyId: extras?.sourceCopyId,
          },
        ],
      } as Partial<LaunchConfig>);
    },
    [launchConfig, updateLaunchConfig],
  );

  const replaceCopyVariants = useCallback(
    (key: 'primaryTexts' | 'headlines' | 'descriptions', items: CopyItem[]) => {
      updateLaunchConfig({ [key]: items } as Partial<LaunchConfig>);
    },
    [updateLaunchConfig],
  );

  const removeCopyVariant = useCallback(
    (key: 'primaryTexts' | 'headlines' | 'descriptions', id: string) => {
      const current = (launchConfig[key] as CopyItem[] | undefined) || [];
      updateLaunchConfig({
        [key]: current.filter((item) => item.id !== id),
      } as Partial<LaunchConfig>);
    },
    [launchConfig, updateLaunchConfig],
  );

  const handleClaudeCopyAutofill = useCallback(async () => {
    if (!profile?.id || !profile.productName) {
      setCopyAutofillError('Product details are missing, so Claude could not build the copy set.');
      return;
    }

    setCopyAutofillLoading(true);
    setCopyAutofillError(null);

    try {
      const creativeBrief = selectedCreatives
        .slice(0, 12)
        .map((creative, index) => {
          const customFieldSummary = (creative.clickupCustomFields || [])
            .slice(0, 5)
            .map((field) => `${field.name}: ${field.value}`)
            .join(' | ');

          return [
            `${index + 1}. ${creative.creativeName}`,
            creative.clickupTaskName ? `task: ${creative.clickupTaskName}` : null,
            creative.hook ? `hook: ${creative.hook}` : null,
            creative.angle ? `angle: ${creative.angle}` : null,
            creative.creator ? `creator: ${creative.creator}` : null,
            creative.driveParentFolderName ? `folder: ${creative.driveParentFolderName}` : null,
            creative.clickupDescription ? `description: ${creative.clickupDescription}` : null,
            customFieldSummary ? `fields: ${customFieldSummary}` : null,
          ]
            .filter(Boolean)
            .join(' | ');
        })
        .join('\n');

      const response = await fetch('/api/creative-hub/copy-library/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productProfileId: profile.id,
          productName: profile.productName,
          productDescription:
            selectedCreatives
              .map((creative) => creative.clickupDescription?.trim())
              .find(Boolean) || '',
          offer:
            (launchConfig.primaryTexts || [])[0]?.text ||
            headlineInsights[0]?.text ||
            selectedCreatives.map((creative) => creative.hook?.trim()).find(Boolean) ||
            '',
          targetAudience:
            [selectedAudienceSummary.persona, selectedAudienceSummary.age, selectedAudienceSummary.gender]
              .filter(isMeaningfulAudienceValue)
              .join(' • ') ||
            selectedCreatives
              .flatMap((creative) => creative.clickupCustomFields || [])
              .find((field) => /audience|avatar|customer|persona/i.test(field.name))?.value ||
            '',
          selectionContext: [
            creativeBrief,
            `Audience summary: ${
              [selectedAudienceSummary.persona, selectedAudienceSummary.age, selectedAudienceSummary.gender, selectedAudienceSummary.awareness]
                .filter(isMeaningfulAudienceValue)
                .join(' | ') || 'Not tagged clearly yet'
            }`,
            `Angle summary: ${selectedAudienceSummary.angle}`,
          ].join('\n'),
          profitabilityFloor: launchConfig.roasFloor ?? profile.defaultRoasFloor ?? 1.2,
          existingWinners: (winningAds?.winningAds || []).slice(0, 10).map((ad) => ({
            primaryText: ad.creative.body,
            headline: ad.creative.headline,
            description: ad.creative.description,
            cta: ad.creative.ctaType,
            roas: ad.metrics.roas,
            cpa: ad.metrics.cpa,
            ctr: ad.metrics.ctr,
          })),
          selectedPrimaryTexts: primaryTexts.map((item) => item.text),
          selectedHeadlines: headlines.map((item) => item.text),
          selectedDescriptions: descriptions.map((item) => item.text),
        }),
      });

      const data = (await response.json()) as CreativeCopyGenerationResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Claude copy regeneration failed');
      }

      setClaudeRewriteData(data);
      setCopyLibraryTab('claude');
      setActiveClaudeSuggestionId(data.suggestions?.[0]?.id || null);
      setClaudeModalOpen(true);
    } catch (error) {
      setCopyAutofillError(
        error instanceof Error ? error.message : 'Claude copy regeneration failed.',
      );
    } finally {
      setCopyAutofillLoading(false);
    }
  }, [
    launchConfig.roasFloor,
    primaryTexts,
    profile?.defaultRoasFloor,
    profile?.id,
    profile?.productName,
    selectedCreatives,
    selectedAudienceSummary.age,
    selectedAudienceSummary.angle,
    selectedAudienceSummary.awareness,
    selectedAudienceSummary.gender,
    selectedAudienceSummary.persona,
    headlineInsights,
    winningAds?.winningAds,
  ]);

  const applyClaudeSuggestion = useCallback(
    (
      suggestion: CopyRewriteSuggestion,
      mode: 'bundle' | 'primaryTexts' | 'headlines' | 'descriptions' = 'bundle',
    ) => {
      if (mode === 'bundle' || mode === 'primaryTexts') {
        replaceCopyVariants(
          'primaryTexts',
          createCopyItems(suggestion.primaryTexts, 'ai_generated'),
        );
      }
      if (mode === 'bundle' || mode === 'headlines') {
        replaceCopyVariants(
          'headlines',
          createCopyItems(suggestion.headlines, 'ai_generated'),
        );
      }
      if (mode === 'bundle' || mode === 'descriptions') {
        replaceCopyVariants(
          'descriptions',
          createCopyItems(suggestion.descriptions, 'ai_generated'),
        );
      }
    },
    [replaceCopyVariants],
  );

  const applyTopWinningBundle = useCallback(() => {
    updateLaunchConfig({
      primaryTexts: createCopyItems(topWinningBundle.primaryTexts, 'winner'),
      headlines: createCopyItems(topWinningBundle.headlines, 'winner'),
      descriptions: createCopyItems(topWinningBundle.descriptions, 'winner'),
      ctaType: topWinningBundle.ctaType,
      utmTemplate: launchConfig.utmTemplate || profile?.utmTemplate || '',
    });
  }, [launchConfig.utmTemplate, profile?.utmTemplate, topWinningBundle, updateLaunchConfig]);

  const applyAllCloudActions = useCallback(() => {
    if (actionCards.length === 0) return;
    const primary = Array.from(new Set(actionCards.flatMap((card) => card.primaryTexts))).slice(0, 12);
    const nextHeadlines = Array.from(new Set(actionCards.flatMap((card) => card.headlines))).slice(0, 12);
    const nextDescriptions = Array.from(new Set(actionCards.flatMap((card) => card.descriptions))).slice(0, 12);
    const leadCard = actionCards[0];

    onApplyStrategy(leadCard.strategy, leadCard.recommendedSize);
    updateLaunchConfig({
      campaignMode: leadCard.campaignMode,
      structure: leadCard.structure,
      dailyBudget: Math.max(...actionCards.map((card) => card.budget)),
      testDuration: Math.max(...actionCards.map((card) => card.durationDays)),
      newCampaignName:
        leadCard.campaignMode === 'new'
          ? launchConfig.newCampaignName || leadCard.recommendedCampaignName || buildSuggestedCampaignName(profile?.productName)
          : launchConfig.newCampaignName,
      primaryTexts: createCopyItems(primary, 'ai_generated'),
      headlines: createCopyItems(nextHeadlines, 'ai_generated'),
      descriptions: createCopyItems(nextDescriptions, 'ai_generated'),
      ctaType: topWinningBundle.ctaType,
      aiAutopilotEnabled: true,
      aiAutopilotRequiresConfirmation: true,
    });
    setAppliedCloudActionIds(actionCards.map((card) => card.id));
    setExpandedCloudActionId(leadCard.id);
  }, [actionCards, launchConfig.newCampaignName, onApplyStrategy, profile?.productName, topWinningBundle.ctaType, updateLaunchConfig]);

  const applyManualPlan = useCallback((planId: string) => {
    const plan = manualPlanCards.find((item) => item.id === planId);
    if (!plan) return;

    if (plan.linkedActionId) {
      onApplyAiLaunchAction(plan.linkedActionId);
      return;
    }

    onApplyStrategy(plan.strategy, plan.size);
    updateLaunchConfig({
      structure: plan.structure,
      dailyBudget: plan.budget,
      testDuration: plan.durationDays,
      campaignMode:
        plan.id === 'scale-winner-expansion' || plan.id === 'winner-iteration'
          ? activeCampaigns.length > 0
            ? 'existing'
            : 'new'
          : launchConfig.campaignMode || (activeCampaigns.length > 0 ? 'existing' : 'new'),
      roasFloor: launchConfig.roasFloor ?? profile?.defaultRoasFloor ?? 1.2,
    });
  }, [activeCampaigns.length, launchConfig.campaignMode, launchConfig.roasFloor, manualPlanCards, onApplyAiLaunchAction, onApplyStrategy, profile?.defaultRoasFloor, updateLaunchConfig]);

  const toggleCopyExpansion = useCallback((key: string) => {
    setExpandedCopyKeys((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  return (
    <div className="space-y-4">
      <div className={plannerWorkspaceShellClass}>
        <div className="space-y-4">
          <div>
            <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
              Batch + launch
            </p>
            <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
              Keep batching and launch setup as simple as the inbox selection panel.
            </p>
          </div>

          <div className={cn(plannerSoftClass, 'p-3')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPlannerSurfaceTab('cloud')}
                  className={plannerTabButtonClass(plannerSurfaceTab === 'cloud')}
                >
                  AI-generated launch actions
                </button>
                <button
                  type="button"
                  onClick={() => setPlannerSurfaceTab('manual')}
                  className={plannerTabButtonClass(plannerSurfaceTab === 'manual')}
                >
                  Manual launch actions
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {launchSummaryChips.map((chip) => (
                  <span key={chip} className={plannerChipClass}>
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

        {(plannerMode === 'full' || plannerMode === 'batch') && (
          <>
            {plannerSurfaceTab === 'cloud' ? (
              <div
                className={cn(
                  'grid gap-4',
                  'xl:grid-cols-[minmax(0,1fr)_360px]',
                )}
              >
              <div className={cn(plannerPanelClass, plannerVariant === 'option2' ? 'p-5' : 'p-4')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      Winning copy intelligence
                    </p>
                    <p className={cn('mt-1.5 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                      Browse the top PT, headline, description, and CTA winners before you apply or rewrite them.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={applyTopWinningBundle}
                      className={cn(
                        'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                        darkMode ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-800',
                      )}
                    >
                      Quick apply winners
                    </button>
                    <button
                      onClick={handleClaudeCopyAutofill}
                      disabled={copyAutofillLoading || selectedCreatives.length === 0}
                      className={cn(
                        'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                        copyAutofillLoading || selectedCreatives.length === 0
                          ? darkMode
                            ? 'bg-sky-500/10 text-sky-300/50'
                            : 'bg-blue-50 text-blue-300'
                          : 'bg-blue-600 text-white hover:bg-blue-500',
                      )}
                    >
                      <Wand2 className="mr-1 inline h-3.5 w-3.5" />
                      {copyAutofillLoading ? 'Writing…' : 'Claude rewrite'}
                    </button>
                  </div>
                </div>

                {copyAutofillError ? (
                  <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                    {copyAutofillError}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
                  <div className={cn(plannerSoftClass, 'p-3')}>
                    <div className="flex flex-wrap gap-2">
                      <span className={plannerChipClass}>Audience {selectedAudienceSummary.persona}</span>
                      <span className={plannerChipClass}>Awareness {selectedAudienceSummary.awareness}</span>
                      <span className={plannerChipClass}>Angle {selectedAudienceSummary.angle}</span>
                      <span className={plannerChipClass}>Blended ranking</span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        { id: 'primary' as const, label: `Primary text ${primaryTextInsights.length}` },
                        { id: 'headlines' as const, label: `Headlines ${headlineInsights.length}` },
                        { id: 'descriptions' as const, label: `Descriptions ${descriptionInsights.length}` },
                        { id: 'cta' as const, label: `CTA ${ctaInsights.length}` },
                        { id: 'claude' as const, label: 'Claude suggestions' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setCopyLibraryTab(tab.id)}
                          className={cn(
                            'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                            copyLibraryTab === tab.id
                              ? darkMode
                                ? 'bg-white text-slate-950'
                                : 'bg-slate-900 text-white'
                              : darkMode
                                ? 'bg-white/[0.04] text-slate-300 ring-1 ring-white/10 hover:bg-white/[0.08]'
                                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 max-h-[620px] space-y-3 overflow-y-auto pr-1">
                      {activeTextLibrary ? (
                        activeTextLibrary.items.length > 0 ? (
                          activeTextLibrary.items.map((item, index) => {
                            const expansionKey = `${activeTextLibrary.selectionKey}-${index}-${item.text}`;
                            const added = selectedCopyLookup[activeTextLibrary.selectionKey].has(item.text.trim().toLowerCase());
                            return (
                              <div key={expansionKey} className={cn(plannerInsetClass, 'p-3')}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                      Rank #{index + 1} {activeTextLibrary.label}
                                    </p>
                                    <ExpandableCopyText
                                      text={item.text}
                                      expanded={Boolean(expandedCopyKeys[expansionKey])}
                                      onToggle={() => toggleCopyExpansion(expansionKey)}
                                      darkMode={darkMode}
                                      className="mt-2"
                                    />
                                  </div>
                                  <button
                                    onClick={() => addCopyVariant(activeTextLibrary.selectionKey, item.text, 'winner', { sourceRoas: item.combinedRoas, sourceCopyId: item.text })}
                                    className={cn(
                                      'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                      added
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : darkMode
                                          ? 'bg-white text-slate-950 hover:bg-slate-100'
                                          : 'bg-slate-900 text-white hover:bg-slate-800',
                                    )}
                                  >
                                    {added ? 'Selected' : 'Select'}
                                  </button>
                                </div>
                                <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                                  <span className={plannerChipClass}>{formatRoasMetric(item.combinedRoas)}</span>
                                  <span className={plannerChipClass}>{formatCurrencyMetric(item.combinedSpend)} spend</span>
                                  <span className={plannerChipClass}>CTR {formatNumberMetric(item.avgCtr)}%</span>
                                  <span className={plannerChipClass}>CPC {formatCurrencyPrecise(item.avgCpc)}</span>
                                  <span className={plannerChipClass}>CPM {formatCurrencyPrecise(item.avgCpm)}</span>
                                  <span className={plannerChipClass}>AOV {formatCurrencyPrecise(getAovMetric(item as RankedCopyLike))}</span>
                                </div>
                                <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
                                  <span className={plannerChipClass}>{item.adCount} ads</span>
                                  <span className={plannerChipClass}>{item.purchases} purchases</span>
                                  <span className={plannerChipClass}>{item.clicks || 0} clicks</span>
                                  <span className={plannerChipClass}>Score {formatNumberMetric(item.blendedScore, 1)}</span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className={cn(plannerInsetClass, 'px-3 py-3 text-sm', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            {activeTextLibrary.empty}
                          </div>
                        )
                      ) : null}

                      {copyLibraryTab === 'cta' && (
                        ctaInsights.length > 0 ? (
                          ctaInsights.map((item, index) => (
                            <div key={`${item.type}-${index}`} className={cn(plannerInsetClass, 'p-3')}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                    Rank #{index + 1}
                                  </p>
                                  <p className={cn('mt-2 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                    {item.label}
                                  </p>
                                </div>
                                <button
                                  onClick={() => updateLaunchConfig({ ctaType: item.type })}
                                  className={cn(
                                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                    (launchConfig.ctaType || topWinningBundle.ctaType) === item.type
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : darkMode
                                        ? 'bg-white text-slate-950 hover:bg-slate-100'
                                        : 'bg-slate-900 text-white hover:bg-slate-800',
                                  )}
                                >
                                  {(launchConfig.ctaType || topWinningBundle.ctaType) === item.type ? 'Selected' : 'Use CTA'}
                                </button>
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
                                <span className={plannerChipClass}>{formatRoasMetric(item.combinedRoas)}</span>
                                <span className={plannerChipClass}>{item.usagePercent || 0}% usage</span>
                                <span className={plannerChipClass}>{formatCurrencyMetric(item.combinedSpend)} spend</span>
                                <span className={plannerChipClass}>AOV {formatCurrencyPrecise(getAovMetric(item as RankedCopyLike))}</span>
                                <span className={plannerChipClass}>{item.adCount} ads</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className={cn(plannerInsetClass, 'px-3 py-3 text-sm', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            No CTA leaderboard found yet.
                          </div>
                        )
                      )}

                      {copyLibraryTab === 'claude' && (
                        <div className="space-y-3">
                          <div className={cn(plannerInsetClass, 'p-3')}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                  Claude rewrite review
                                </p>
                                <p className={cn('mt-2 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                  Open a larger review surface to inspect targeting, read every option properly, and select only what you want.
                                </p>
                              </div>
                              <button
                                onClick={() => setClaudeModalOpen(true)}
                                disabled={!claudeSuggestionBundle}
                                className={cn(
                                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                  !claudeSuggestionBundle
                                    ? darkMode
                                      ? 'bg-white/10 text-slate-500'
                                      : 'bg-slate-100 text-slate-400'
                                    : darkMode
                                      ? 'bg-white text-slate-950 hover:bg-slate-100'
                                      : 'bg-slate-900 text-white hover:bg-slate-800',
                                )}
                              >
                                Open review panel
                              </button>
                            </div>

                            {claudeSuggestionBundle ? (
                              <>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                  <div className={cn(plannerSoftClass, 'px-3 py-2.5')}>
                                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Winning audience</p>
                                    <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                      {claudeSuggestionBundle.analysis.winningAudience.persona}
                                    </p>
                                    <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                                      {claudeSuggestionBundle.analysis.winningAudience.ageGroup} • {claudeSuggestionBundle.analysis.winningAudience.gender}
                                    </p>
                                  </div>
                                  <div className={cn(plannerSoftClass, 'px-3 py-2.5')}>
                                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Awareness</p>
                                    <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                      {claudeSuggestionBundle.analysis.winningAudience.awarenessStage}
                                    </p>
                                    <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                                      {claudeSuggestionBundle.analysis.winningAudience.angle}
                                    </p>
                                  </div>
                                  <div className={cn(plannerSoftClass, 'px-3 py-2.5')}>
                                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Winner inputs</p>
                                    <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                      {primaryTextInsights.length} PT • {headlineInsights.length} headlines • {descriptionInsights.length} descriptions
                                    </p>
                                    <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                                      {claudeRewriteSuggestions.length} rewrite bundle{claudeRewriteSuggestions.length === 1 ? '' : 's'} ready to inspect
                                    </p>
                                  </div>
                                  <div className={cn(plannerSoftClass, 'px-3 py-2.5')}>
                                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>Selected now</p>
                                    <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                      {primaryTexts.length} PT • {headlines.length} headlines • {descriptions.length} descriptions
                                    </p>
                                    <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                                      {claudeSuggestionBundle.source === 'ai' ? 'Claude-generated' : 'Fallback'} review-first suggestions
                                    </p>
                                  </div>
                                </div>

                                {cleanedClaudeSignals.length > 0 ? (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {cleanedClaudeSignals.map((signal) => (
                                      <span key={signal} className={plannerChipClass}>
                                        {signal}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {claudeRewriteSuggestions.map((suggestion) => (
                                    <button
                                      key={suggestion.id}
                                      type="button"
                                      onClick={() => {
                                        setActiveClaudeSuggestionId(suggestion.id);
                                        setClaudeModalOpen(true);
                                      }}
                                      className={cn(
                                        'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                        activeClaudeSuggestion?.id === suggestion.id
                                          ? darkMode
                                            ? 'bg-white text-slate-950'
                                            : 'bg-slate-900 text-white'
                                          : darkMode
                                            ? 'bg-white/[0.04] text-slate-300 ring-1 ring-white/10 hover:bg-white/[0.08]'
                                            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                                      )}
                                    >
                                      {suggestion.title}
                                    </button>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div className={cn('mt-3 rounded-2xl px-3 py-3 text-sm', darkMode ? 'bg-white/[0.04] text-slate-500' : 'bg-white text-slate-500')}>
                                Run Claude rewrite to generate audience-aware copy options.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn(plannerSoftClass, 'p-3')}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          CTA
                        </span>
                        <select
                          value={launchConfig.ctaType || topWinningBundle.ctaType}
                          onChange={(event) => updateLaunchConfig({ ctaType: event.target.value })}
                          className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                        >
                          {CTA_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          UTM
                        </span>
                        <input
                          value={launchConfig.utmTemplate || profile?.utmTemplate || ''}
                          onChange={(event) => updateLaunchConfig({ utmTemplate: event.target.value })}
                          placeholder="utm_source=facebook&utm_campaign={{campaign.name}}"
                          className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400')}
                        />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={plannerChipClass}>{activeCtaLabel}</span>
                      <span className={plannerChipClass}>{launchConfig.utmTemplate ? 'Custom UTM mapped' : 'Using profile UTM'}</span>
                      <span className={plannerChipClass}>{primaryTexts.length + headlines.length + descriptions.length} copy items selected</span>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {selectedCopyGroups.map((group) => (
                        <div key={group.key} className={cn(plannerInsetClass, 'p-3')}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                Selected {group.label}
                              </p>
                              <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                {group.items.length} chosen
                              </p>
                            </div>
                            <span className={plannerChipClass}>{group.items.length}</span>
                          </div>
                          <div className="mt-3 max-h-[168px] space-y-1.5 overflow-y-auto pr-1">
                            {group.items.length > 0 ? (
                              group.items.map((item) => {
                                const expansionKey = `selected-${group.key}-${item.id}`;
                                return (
                                  <div key={item.id} className={cn('flex items-start justify-between gap-2 rounded-2xl px-3 py-2', darkMode ? 'bg-white/[0.04]' : 'bg-white')}>
                                    <div className="min-w-0 flex-1">
                                      <ExpandableCopyText
                                        text={item.text}
                                        expanded={Boolean(expandedCopyKeys[expansionKey])}
                                        onToggle={() => toggleCopyExpansion(expansionKey)}
                                        darkMode={darkMode}
                                      />
                                      <p className={cn('mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em]', darkMode ? 'text-slate-500' : 'text-slate-500')}>
                                        {item.source.replace('_', ' ')}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => removeCopyVariant(group.key, item.id)}
                                      className={cn('rounded-full p-1 ring-1 transition', darkMode ? 'bg-white/[0.04] text-slate-400 ring-white/10 hover:bg-white/[0.08]' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-100')}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                );
                              })
                            ) : (
                              <div className={cn('rounded-2xl px-3 py-2.5 text-sm', darkMode ? 'bg-white/[0.04] text-slate-500' : 'bg-white text-slate-500')}>
                                Nothing selected yet.
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <Modal isOpen={claudeModalOpen} onClose={() => setClaudeModalOpen(false)} title="Claude rewrite review" size="lg">
                  <div className="space-y-4">
                    {claudeSuggestionBundle ? (
                      <>
                        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                          <div className="space-y-3">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Audience read
                              </p>
                              <p className="mt-2 text-base font-semibold text-slate-900">
                                {claudeSuggestionBundle.analysis.winningAudience.persona}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-slate-600">
                                {claudeSuggestionBundle.analysis.winningAudience.ageGroup} • {claudeSuggestionBundle.analysis.winningAudience.gender}
                              </p>
                              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                Awareness + angle
                              </p>
                              <p className="mt-2 text-sm font-semibold text-slate-900">
                                {claudeSuggestionBundle.analysis.winningAudience.awarenessStage}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-slate-600">
                                {claudeSuggestionBundle.analysis.winningAudience.angle}
                              </p>
                              {claudeSuggestionBundle.analysis.winningAudience.rationale ? (
                                <p className="mt-3 text-sm leading-6 text-slate-600">
                                  {claudeSuggestionBundle.analysis.winningAudience.rationale}
                                </p>
                              ) : null}
                            </div>

                            {cleanedClaudeSignals.length > 0 ? (
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  Clean signals
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {cleanedClaudeSignals.map((signal) => (
                                    <span key={signal} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                      {signal}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {claudeSuggestionBundle.analysis.notes.length > 0 ? (
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  Notes
                                </p>
                                <div className="mt-3 space-y-2">
                                  {claudeSuggestionBundle.analysis.notes.map((note) => (
                                    <div key={note} className="rounded-2xl bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-600">
                                      {note}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {claudeRewriteSuggestions.map((suggestion) => (
                                <button
                                  key={suggestion.id}
                                  type="button"
                                  onClick={() => setActiveClaudeSuggestionId(suggestion.id)}
                                  className={cn(
                                    'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                    activeClaudeSuggestion?.id === suggestion.id
                                      ? 'bg-slate-900 text-white'
                                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                                  )}
                                >
                                  {suggestion.title}
                                </button>
                              ))}
                            </div>

                            {activeClaudeSuggestion ? (
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap gap-2">
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                        {Math.round(activeClaudeSuggestion.confidence)}% confidence
                                      </span>
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                        {activeClaudeSuggestion.intent.replace(/_/g, ' ')}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-lg font-semibold text-slate-900">
                                      {activeClaudeSuggestion.title}
                                    </p>
                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                      {activeClaudeSuggestion.summary}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => applyClaudeSuggestion(activeClaudeSuggestion, 'bundle')}
                                    className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                                  >
                                    Apply full bundle
                                  </button>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    Persona {activeClaudeSuggestion.targeting.persona}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    Age {activeClaudeSuggestion.targeting.ageGroup}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    Awareness {activeClaudeSuggestion.targeting.awarenessStage}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                    Angle {activeClaudeSuggestion.targeting.angle}
                                  </span>
                                </div>

                                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                                  {[
                                    { label: 'Primary text', items: activeClaudeSuggestion.primaryTexts, mode: 'primaryTexts' as const },
                                    { label: 'Headlines', items: activeClaudeSuggestion.headlines, mode: 'headlines' as const },
                                    { label: 'Descriptions', items: activeClaudeSuggestion.descriptions, mode: 'descriptions' as const },
                                  ].map((group) => (
                                    <div key={group.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                            {group.label}
                                          </p>
                                          <p className="mt-1 text-xs text-slate-500">
                                            {group.items.length} option{group.items.length === 1 ? '' : 's'}
                                          </p>
                                        </div>
                                        <button
                                          onClick={() => applyClaudeSuggestion(activeClaudeSuggestion, group.mode)}
                                          disabled={group.items.length === 0}
                                          className={cn(
                                            'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                            group.items.length === 0
                                              ? 'bg-slate-200 text-slate-400'
                                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
                                          )}
                                        >
                                          Replace all
                                        </button>
                                      </div>

                                      <div className="mt-3 space-y-2">
                                        {group.items.length > 0 ? (
                                          group.items.map((item, index) => {
                                            const expansionKey = `claude-modal-${group.mode}-${index}-${item}`;
                                            const selected = selectedCopyLookup[group.mode].has(item.trim().toLowerCase());
                                            return (
                                              <div key={`${group.label}-${index}`} className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                                                <div className="flex items-start justify-between gap-3">
                                                  <ExpandableCopyText
                                                    text={item}
                                                    expanded={Boolean(expandedCopyKeys[expansionKey])}
                                                    onToggle={() => toggleCopyExpansion(expansionKey)}
                                                    darkMode={false}
                                                    className="min-w-0 flex-1"
                                                  />
                                                  <button
                                                    onClick={() => addCopyVariant(group.mode, item, 'ai_generated')}
                                                    className={cn(
                                                      'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                                      selected
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-slate-900 text-white hover:bg-slate-800',
                                                    )}
                                                  >
                                                    {selected ? 'Selected' : 'Select'}
                                                  </button>
                                                </div>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div className="rounded-2xl bg-white px-3 py-2.5 text-sm text-slate-500">
                                            No {group.label.toLowerCase()} generated in this suggestion.
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                      Best for
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {activeClaudeSuggestion.bestFor.map((item) => (
                                        <span key={item} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                          {item}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                      Watchouts
                                    </p>
                                    <div className="mt-2 space-y-1.5">
                                      {activeClaudeSuggestion.watchouts.length > 0 ? (
                                        activeClaudeSuggestion.watchouts.map((watchout) => (
                                          <p key={watchout} className="text-xs leading-5 text-slate-600">
                                            {watchout}
                                          </p>
                                        ))
                                      ) : (
                                        <p className="text-xs leading-5 text-slate-600">
                                          No major watchouts flagged in this rewrite bundle.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                                Run Claude rewrite to populate the review panel.
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                        Run Claude rewrite to generate review-first PT, headline, and description options grounded in winning audience data.
                      </div>
                    )}
                  </div>
                </Modal>
              </div>

              <div className={cn(plannerPanelClass, 'p-4')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      Cloud launch actions
                    </p>
                    <p className={cn('mt-1.5 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                      Cloud should return executable scenarios, not passive notes.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={applyAllCloudActions}
                      disabled={actionCards.length === 0}
                      className={cn(
                        'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                        actionCards.length === 0
                          ? darkMode
                            ? 'bg-white/10 text-slate-500'
                            : 'bg-slate-100 text-slate-400'
                          : darkMode
                            ? 'bg-white text-slate-950 hover:bg-slate-100'
                            : 'bg-slate-900 text-white hover:bg-slate-800',
                      )}
                    >
                      Apply all cloud actions
                    </button>
                    <button
                      onClick={onApplyRecommendedStrategy}
                      disabled={selectedCreatives.length === 0}
                      className={plannerButtonSecondary}
                    >
                      Quick apply draft
                    </button>
                  </div>
                </div>

                {aiAnalysis.loading && actionCards.length === 0 ? (
                  <div className={cn('mt-4 flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm', darkMode ? 'border border-white/8 bg-white/[0.04] text-slate-300' : 'bg-slate-50 text-slate-600')}>
                    <Loader2 className={cn('h-4 w-4 animate-spin', darkMode ? 'text-slate-400' : 'text-slate-500')} />
                    Cloud is analyzing Meta history, selected creatives, and winning copy for a launch recommendation...
                  </div>
                ) : actionCards.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {aiAnalysis.error ? (
                      <div className={cn('rounded-[18px] px-4 py-3 text-sm', darkMode ? 'border border-amber-400/20 bg-amber-400/10 text-amber-100' : 'border border-amber-200 bg-amber-50 text-amber-800')}>
                        {aiAnalysis.error} Keeping the last successful Cloud recommendations available below.
                      </div>
                    ) : null}
                    {aiAnalysis.loading ? (
                      <div className={cn('flex items-center gap-3 rounded-[18px] px-4 py-3 text-sm', darkMode ? 'border border-white/8 bg-white/[0.04] text-slate-300' : 'bg-slate-50 text-slate-600')}>
                        <Loader2 className={cn('h-4 w-4 animate-spin', darkMode ? 'text-slate-400' : 'text-slate-500')} />
                        Refreshing Cloud recommendations. Existing action cards stay available while the new pass completes.
                      </div>
                    ) : null}
                    {appliedCloudActionIds.length > 0 ? (
                      <div className={cn(plannerSoftClass, 'p-3')}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                              Loaded into launch builder
                            </p>
                            <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                              {appliedCloudActionIds.length} Cloud scenario{appliedCloudActionIds.length === 1 ? '' : 's'} ready for review
                            </p>
                          </div>
                          <span className={plannerChipClass}>Continue launch below</span>
                        </div>
                      </div>
                    ) : null}
                    {actionCards.map((card, index) => {
                      const confidenceValue =
                        typeof card.confidence === 'number'
                          ? Math.round(card.confidence <= 1 ? card.confidence * 100 : card.confidence)
                          : null;
                      const confidenceLabel =
                        card.confidenceLabel ||
                        (confidenceValue !== null
                          ? `${confidenceValue}% confidence`
                          : index === 0
                            ? 'Primary recommendation'
                            : 'Supporting recommendation');
                      const executionFields = cloudActionFields(card);
                      const expanded = expandedCloudActionId === card.id;
                      const applied = appliedCloudActionIds.includes(card.id);
                      const laneCount = Math.max(card.recommendedSize, diagnostics.laneCount, 1);

                      return (
                        <div
                          key={card.id}
                          className={cn(
                            plannerInsetClass,
                            plannerVariant === 'option2'
                              ? 'p-4'
                              : plannerVariant === 'option3'
                                ? 'border-l-[3px] p-3.5'
                                : 'p-3.5',
                            plannerVariant === 'option3' &&
                              (darkMode ? 'border-l-sky-400/70' : 'border-l-sky-500'),
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap gap-2">
                                <span className={plannerChipClass}>{confidenceLabel}</span>
                                <span className={plannerChipClass}>
                                  {card.campaignMode === 'existing' ? 'Existing campaign draft' : 'New campaign draft'}
                                </span>
                                {applied ? <span className={plannerChipClass}>Selected</span> : null}
                              </div>
                              <p className={cn('mt-2 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                {card.title}
                              </p>
                              <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                                {card.summary}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className={plannerChipClass}>{card.structure}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  onApplyAiLaunchAction(card.id);
                                  setAppliedCloudActionIds((current) => Array.from(new Set([...current, card.id])));
                                }}
                                className={cn(
                                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                  darkMode
                                    ? 'bg-white text-slate-950 hover:bg-slate-100'
                                    : 'bg-slate-900 text-white hover:bg-slate-800',
                                )}
                              >
                                {applied ? 'Selected campaign' : 'Select campaign'}
                              </button>
                              {applied ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setAppliedCloudActionIds((current) => current.filter((id) => id !== card.id))
                                  }
                                  className={plannerButtonSecondary}
                                >
                                  Deselect
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => setExpandedCloudActionId(expanded ? null : card.id)}
                                className={plannerButtonSecondary}
                              >
                                {expanded ? 'Hide details' : 'Show details'}
                              </button>
                            </div>
                          </div>

                          {plannerVariant === 'option2' ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-4">
                              {[
                                ['Pattern', getStrategyLabel(card.strategy)],
                                ['Budget', formatCurrencyMetric(card.budget)],
                                ['Window', `${card.durationDays} days`],
                                ['Lanes', `${laneCount}`],
                                ['PT', `${card.primaryTexts.length}`],
                                ['Headlines', `${card.headlines.length}`],
                                ['Descriptions', `${card.descriptions.length}`],
                              ].map(([label, value]) => (
                                <div key={label} className={cn(plannerSoftClass, 'px-3 py-2')}>
                                  <p className={cn('text-[10px] font-semibold uppercase tracking-[0.16em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                    {label}
                                  </p>
                                  <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                    {value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className={plannerChipClass}>{getStrategyLabel(card.strategy)}</span>
                              <span className={plannerChipClass}>{formatCurrencyMetric(card.budget)} budget</span>
                              <span className={plannerChipClass}>{card.durationDays} day window</span>
                              <span className={plannerChipClass}>{laneCount} lanes</span>
                              <span className={plannerChipClass}>{card.primaryTexts.length} PT</span>
                              <span className={plannerChipClass}>{card.headlines.length} headlines</span>
                              <span className={plannerChipClass}>{card.descriptions.length} descriptions</span>
                            </div>
                          )}

                          {expanded ? (
                            <div className="mt-4 space-y-3">
                              <div className={cn(plannerSoftClass, 'p-3')}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <LaunchDiagramNode
                                    label="Campaign"
                                    value={card.campaignMode === 'existing' ? 'Existing campaign draft' : 'New campaign draft'}
                                    helper={card.recommendedCampaignName || selectedCampaignName}
                                    darkMode={darkMode}
                                  />
                                  <ArrowRight className={cn('hidden h-4 w-4 shrink-0 lg:block', darkMode ? 'text-slate-500' : 'text-slate-400')} />
                                  <LaunchDiagramNode
                                    label="Ad sets"
                                    value={executionFields[1]?.value || `${laneCount} planned lanes`}
                                    helper={executionFields[1]?.helper}
                                    darkMode={darkMode}
                                  />
                                  <ArrowRight className={cn('hidden h-4 w-4 shrink-0 lg:block', darkMode ? 'text-slate-500' : 'text-slate-400')} />
                                  <LaunchDiagramNode
                                    label="Creatives"
                                    value={`${selectedCreatives.length} selected creatives`}
                                    helper={`${laneCount} scenario lane${laneCount === 1 ? '' : 's'}`}
                                    darkMode={darkMode}
                                  />
                                  <ArrowRight className={cn('hidden h-4 w-4 shrink-0 lg:block', darkMode ? 'text-slate-500' : 'text-slate-400')} />
                                  <LaunchDiagramNode
                                    label="Write behavior"
                                    value={executionFields[3]?.value || 'Draft-only'}
                                    helper={`${card.primaryTexts.length} PT • ${card.headlines.length} headlines • ${card.descriptions.length} descriptions`}
                                    darkMode={darkMode}
                                  />
                                </div>
                              </div>

                              <div className={cn(plannerSoftClass, 'p-3')}>
                                <div className="flex flex-wrap gap-2">
                                  {executionFields.map((field) => (
                                    <span key={field.label} className={plannerChipClass}>
                                      {field.label}: {field.value}
                                    </span>
                                  ))}
                                </div>
                                <p className={cn('mt-2 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                                  {card.rationale}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => {
                                    if (card.primaryTexts.length > 0) {
                                      replaceCopyVariants('primaryTexts', createCopyItems(card.primaryTexts, 'ai_generated'));
                                    }
                                    if (card.headlines.length > 0) {
                                      replaceCopyVariants('headlines', createCopyItems(card.headlines, 'ai_generated'));
                                    }
                                    if (card.descriptions.length > 0) {
                                      replaceCopyVariants('descriptions', createCopyItems(card.descriptions, 'ai_generated'));
                                    }
                                    updateLaunchConfig({ ctaType: topWinningBundle.ctaType });
                                  }}
                                  className={plannerButtonSecondary}
                                >
                                  Apply copy only
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : aiAnalysis.error ? (
                  <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {aiAnalysis.error}
                  </div>
                ) : !aiAnalysis.loading ? (
                  <div className={cn('mt-4 rounded-[22px] px-4 py-4 text-sm', darkMode ? 'border border-white/8 bg-white/[0.04] text-slate-400' : 'bg-slate-50 text-slate-500')}>
                    Select creatives to unlock Cloud launch actions.
                  </div>
                ) : null}
              </div>
            </div>
            ) : null}

            {plannerSurfaceTab === 'manual' ? (
            <div className="grid gap-4 2xl:grid-cols-[0.92fr_minmax(0,1.08fr)]">
              <div className={cn(plannerPanelClass, 'p-4')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      Manual plans
                    </p>
                    <p className={cn('mt-1.5 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                      Structured operator-controlled plans for when you want to decide the test directly.
                    </p>
                  </div>
                  {batches.length > 0 ? (
                    <button onClick={onClearBatches} className={plannerButtonSecondary}>
                      Clear lanes
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                    Set size
                  </span>
                  {[1, 2, 3, 4, 5].map((size) => (
                    <button
                      key={size}
                      onClick={() => setBatchSize(size)}
                      className={cn(
                        'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                        batchSize === size
                          ? 'bg-blue-600 text-white'
                          : darkMode
                            ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {size}/set
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {manualPlanCards.map((plan) => (
                    <div key={plan.id} className={cn(plannerInsetClass, 'p-3')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={cn('text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                            {plan.title}
                          </p>
                          <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                            {plan.description}
                          </p>
                        </div>
                        <span className={plannerChipClass}>{plan.structure}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={plannerChipClass}>{getStrategyLabel(plan.strategy)}</span>
                        <span className={plannerChipClass}>{formatCurrencyMetric(plan.budget)}</span>
                        <span className={plannerChipClass}>{plan.durationDays} days</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {plan.executionFields.map((field) => (
                          <div key={field.label} className={cn(plannerSoftClass, 'px-3 py-2.5')}>
                            <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                              {field.label}
                            </p>
                            <p className={cn('mt-1 text-sm font-semibold leading-6', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                              {field.value}
                            </p>
                            <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                              {field.helper}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {plan.bestFor.map((item) => (
                          <span key={item} className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', darkMode ? 'bg-sky-500/12 text-sky-200' : 'bg-sky-50 text-sky-700')}>
                            {item}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => applyManualPlan(plan.id)}
                        className={cn(
                          'mt-3 rounded-full px-3.5 py-2 text-xs font-semibold transition-all',
                          darkMode ? 'bg-white text-slate-950 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-slate-800',
                        )}
                      >
                        Apply plan
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className={cn(plannerPanelClass, 'p-4')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      Launch structure map
                    </p>
                    <p className={cn('mt-1.5 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                      Campaign, ad set, creative, and copy mapping before review.
                    </p>
                  </div>
                  <span className={plannerChipClass}>{activeStrategy}</span>
                </div>

                <div
                  className={cn(
                    'mt-4 grid gap-3',
                    plannerVariant === 'option1'
                      ? 'sm:grid-cols-2 xl:grid-cols-4'
                      : plannerVariant === 'option2'
                        ? 'md:grid-cols-2 xl:grid-cols-2'
                        : 'md:grid-cols-2 xl:grid-cols-4',
                  )}
                >
                  {launchStructureSummary.map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        plannerInsetClass,
                        plannerVariant === 'option2' ? 'px-4 py-3.5' : 'px-3 py-3',
                        plannerVariant === 'option3' &&
                          (darkMode ? 'border-l-[3px] border-l-sky-400/60' : 'border-l-[3px] border-l-sky-500'),
                      )}
                    >
                      <p className={cn('text-[11px] uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        {item.label}
                      </p>
                      <p className={cn('mt-2 text-base font-semibold leading-6', darkMode ? 'text-slate-50' : 'text-slate-900')}>
                        {item.value}
                      </p>
                      <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                        {item.helper}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  <div className={cn(plannerSoftClass, 'p-3')}>
                    <div className="flex items-center justify-between gap-3">
                      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        Campaign destination
                      </p>
                      <span className={plannerChipClass}>
                        {campaignMode === 'existing' ? 'Existing draft' : 'New draft'}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() =>
                            updateLaunchConfig({
                              campaignMode: 'existing',
                              adsetMode: launchConfig.adsetMode || 'new_adsets',
                            })
                          }
                          className={cn(
                            'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                            campaignMode === 'existing'
                              ? 'bg-slate-900 text-white'
                              : darkMode
                                ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                          )}
                        >
                          Existing draft
                        </button>
                        <button
                          onClick={() =>
                            updateLaunchConfig({
                              campaignMode: 'new',
                              adsetMode: 'new_adsets',
                              existingAdsetAssignments: undefined,
                              newCampaignName:
                                launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName),
                            })
                          }
                          className={cn(
                            'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                            campaignMode === 'new'
                              ? 'bg-slate-900 text-white'
                              : darkMode
                                ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                          )}
                        >
                          New draft
                        </button>
                      </div>
                      {campaignMode === 'existing' ? (
                        existingCampaignOptions.length > 0 ? (
                          <label className={cn(plannerInsetClass, 'block px-3 py-3')}>
                            <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                              Campaign
                            </span>
                            <select
                              value={selectedCampaignOption?.campaignId || ''}
                              onChange={(event) =>
                                updateLaunchConfig({
                                  existingCampaignId: event.target.value || undefined,
                                  existingAdsetAssignments: undefined,
                                })
                              }
                              className={cn('mt-2 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                            >
                              {existingCampaignOptions.map((campaign) => (
                                <option key={campaign.campaignId} value={campaign.campaignId}>
                                  {campaign.campaignName} • {campaign.structure} • {campaign.effectiveStatus}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <div className={cn(plannerInsetClass, 'px-3 py-3 text-sm', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            No linked campaign options found yet. Use a new draft for this plan.
                          </div>
                        )
                      ) : (
                        <label className={cn(plannerInsetClass, 'block px-3 py-3')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Campaign name
                          </span>
                          <input
                            value={launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || ''}
                            onChange={(event) => updateLaunchConfig({ newCampaignName: event.target.value })}
                            className={cn('mt-2 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                          />
                        </label>
                      )}
                      <div className={cn(plannerInsetClass, 'px-3 py-3')}>
                        <p className={cn('text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                          {structure} • {formatCurrencyMetric(budget)} • {duration} days
                        </p>
                        <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                          {formatScheduleLabel(launchConfig)} • CTA {activeCtaLabel}
                        </p>
                      </div>
                      <div className={cn(plannerInsetClass, 'px-3 py-3')}>
                        <p className={cn('text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                          {getAdSetExecutionLabel(
                            campaignMode,
                            launchConfig.adsetMode,
                            structure,
                            batches.length > 0 ? batches.length : diagnostics.laneCount,
                            selectedCampaignName,
                          )}
                        </p>
                        <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                          {campaignMode === 'existing' && launchConfig.adsetMode === 'existing_adsets' && selectedAssignedAdset
                            ? `Mapped into existing ad set ${selectedAssignedAdset.name}.`
                            : 'Draft lanes create the ad set map before anything goes live.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={cn(plannerSoftClass, 'p-3')}>
                    <div className="flex items-center justify-between gap-3">
                      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        Current lane preview
                      </p>
                      <span className={plannerChipClass}>
                        {diagnostics.laneCount} lane{diagnostics.laneCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    {batches.length === 0 ? (
                      <p className={cn('mt-3 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        Apply a manual plan or a Cloud action to build the first lane draft.
                      </p>
                    ) : (
                      <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto pr-1">
                        {batches.map((batch) => (
                          <div key={batch.id} className={cn(plannerInsetClass, 'px-3 py-3')}>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className={cn('text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                  {batch.name}
                                </p>
                                <p className={cn('mt-1 text-xs', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                  {batch.creativeIds.length} asset{batch.creativeIds.length === 1 ? '' : 's'}
                                </p>
                              </div>
                              <span className={plannerChipClass}>#{batch.id.replace('batch-', '').replace('draft-', '')}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {batch.creativeIds.map((creativeId) => (
                                <span key={creativeId} className={plannerChipClass}>
                                  {truncate(creativeLookup.get(creativeId)?.creativeName || creativeId, 24)}
                                </span>
                              ))}
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div className={cn(plannerSoftClass, 'px-3 py-2.5')}>
                                <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                  Destination
                                </p>
                                <p className={cn('mt-1 text-sm font-semibold leading-6', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                  {campaignMode === 'existing' ? selectedCampaignName : launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || 'New campaign draft'}
                                </p>
                                <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                                  {campaignMode === 'existing' && launchConfig.adsetMode === 'existing_adsets' && selectedAssignedAdset
                                    ? `Existing ad set: ${selectedAssignedAdset.name}`
                                    : `${structure} draft lane creates a new ad set for this group.`}
                                </p>
                              </div>
                              <div className={cn(plannerSoftClass, 'px-3 py-2.5')}>
                                <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                                  Copy payload
                                </p>
                                <p className={cn('mt-1 text-sm font-semibold leading-6', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                                  {primaryTexts.length} PT • {headlines.length} headlines • {descriptions.length} descriptions
                                </p>
                                <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                                  CTA {activeCtaLabel} • UTM profile mapping stays attached to this lane.
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

        {(plannerMode === 'full' || plannerMode === 'schedule' || plannerMode === 'review') && (
          <>
            <div
              className={cn(
                'grid gap-4',
                'xl:grid-cols-[minmax(0,1fr)_360px]',
              )}
            >
              <div className={cn(plannerPanelClass, plannerVariant === 'option2' ? 'p-5' : 'p-4')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                      Launch
                    </p>
                    <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                      Destination, structure, Meta mapping, and final paused review.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <div className={cn(plannerSoftClass, 'p-3')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          Launch summary
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {launchSummaryChips.map((chip) => (
                            <span key={chip} className={plannerChipClass}>
                              {chip}
                            </span>
                          ))}
                          <span className={plannerChipClass}>
                            {structure} • {existingBudgetLocked ? 'Budget locked' : 'Budget editable'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLaunchMetaExpanded((current) => !current)}
                        className={plannerButtonSecondary}
                      >
                        {launchMetaExpanded ? 'Hide Meta mapping' : 'Meta mapping'}
                      </button>
                    </div>

                    <div className={launchControlShellClass}>
                      <div className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                        <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          Campaign path
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            onClick={() =>
                              updateLaunchConfig({
                                campaignMode: 'existing',
                                adsetMode: launchConfig.adsetMode || 'new_adsets',
                              })
                            }
                            className={cn(
                              'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                              campaignMode === 'existing'
                                ? 'bg-slate-900 text-white'
                                : darkMode
                                  ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                          >
                            Existing
                          </button>
                          <button
                            onClick={() =>
                              updateLaunchConfig({
                                campaignMode: 'new',
                                adsetMode: 'new_adsets',
                                existingCampaignId: undefined,
                                existingAdsetAssignments: undefined,
                                newCampaignName:
                                  launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName),
                              })
                            }
                            className={cn(
                              'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                              campaignMode === 'new'
                                ? 'bg-slate-900 text-white'
                                : darkMode
                                  ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                          >
                            New
                          </button>
                        </div>
                        <p className={cn('mt-2 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                          {campaignMode === 'existing'
                            ? selectedCampaignName
                            : launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || 'New campaign draft'}
                        </p>
                      </div>

                      <div className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                        <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          Structure
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            onClick={() => updateLaunchConfig({ structure: 'ABO' })}
                            className={cn(
                              'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                              structure === 'ABO'
                                ? 'bg-slate-900 text-white'
                                : darkMode
                                  ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                          >
                            ABO
                          </button>
                          <button
                            onClick={() => updateLaunchConfig({ structure: 'CBO' })}
                            className={cn(
                              'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                              structure === 'CBO'
                                ? 'bg-slate-900 text-white'
                                : darkMode
                                  ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                          >
                            CBO
                          </button>
                        </div>
                        <p className={cn('mt-2 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                          {structure === 'ABO' ? 'Budget and bidding run at ad set level.' : 'Campaign budget stays at CBO level.'}
                        </p>
                      </div>

                      <div className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                        <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          Ad set path
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            onClick={() =>
                              updateLaunchConfig({
                                adsetMode: 'new_adsets',
                                existingAdsetAssignments: undefined,
                              })
                            }
                            className={cn(
                              'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                              (launchConfig.adsetMode || 'new_adsets') === 'new_adsets'
                                ? 'bg-slate-900 text-white'
                                : darkMode
                                  ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                            )}
                          >
                            New ad sets
                          </button>
                          <button
                            onClick={() => updateLaunchConfig({ adsetMode: 'existing_adsets' })}
                            disabled={campaignMode === 'new'}
                            className={cn(
                              'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                              launchConfig.adsetMode === 'existing_adsets'
                                ? 'bg-slate-900 text-white'
                                : darkMode
                                  ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                              campaignMode === 'new' ? 'cursor-not-allowed opacity-50' : '',
                            )}
                          >
                            Existing ad sets
                          </button>
                        </div>
                        <p className={cn('mt-2 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                          {launchConfig.adsetMode === 'existing_adsets'
                            ? `${Math.max(Object.keys(selectedAdsetAssignments).length, 1)} mapped ad set`
                            : `${newAdSetCount} new ad sets planned`}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={cn(plannerSoftClass, 'p-3')}>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {campaignMode === 'existing' ? (
                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Campaign
                          </span>
                          <select
                            value={selectedCampaignOption?.campaignId || ''}
                            onChange={(event) =>
                              updateLaunchConfig({
                                existingCampaignId: event.target.value || undefined,
                                existingAdsetAssignments: undefined,
                              })
                            }
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                          >
                            {existingCampaignOptions.map((campaign) => (
                              <option key={campaign.campaignId} value={campaign.campaignId}>
                                {campaign.campaignName} • {campaign.structure} • {campaign.effectiveStatus}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Campaign name
                          </span>
                          <input
                            value={launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || ''}
                            onChange={(event) => updateLaunchConfig({ newCampaignName: event.target.value })}
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                          />
                        </label>
                      )}

                      <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          Ad account
                        </span>
                        <select
                          value={selectedAccountId}
                          onChange={(event) => updateLaunchConfig({ adAccountId: event.target.value || undefined })}
                          className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                        >
                          {accountOptions.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name} {account.businessName ? `• ${account.businessName}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                        <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          Existing ad set
                        </span>
                        <select
                          disabled={(launchConfig.adsetMode || 'new_adsets') !== 'existing_adsets'}
                          value={selectedAssignedAdsetId}
                          onChange={(event) =>
                            updateLaunchConfig({
                              existingAdsetAssignments: event.target.value
                                ? { [event.target.value]: selectedCreatives.map((creative) => creative.id) }
                                : undefined,
                            })
                          }
                          className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                        >
                          <option value="">
                            {(launchConfig.adsetMode || 'new_adsets') === 'existing_adsets'
                              ? adsetsLoading
                                ? 'Loading ad sets'
                                : 'Choose an ad set'
                              : 'Using new ad sets'}
                          </option>
                          {campaignAdsets.map((adset) => (
                            <option key={adset.id} value={adset.id}>
                              {adset.name} • {adset.status}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {!launchMetaExpanded ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={plannerChipClass}>Page {selectedPageLabel}</span>
                        <span className={plannerChipClass}>
                          Pixel {selectedPixelId ? pixelOptions.find((pixel) => pixel.id === selectedPixelId)?.name || selectedPixelId : unresolvedSavedPixelLabel || 'Not set'}
                        </span>
                        <span className={plannerChipClass}>IG {selectedInstagramLabel}</span>
                        <span className={plannerChipClass}>
                          {destinationUrl ? 'Destination mapped' : 'Missing destination URL'}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-3 border-t border-slate-200/70 pt-3 md:grid-cols-2 xl:grid-cols-3">
                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Page
                          </span>
                          <select
                            value={selectedPageId}
                            onChange={(event) =>
                              updateLaunchConfig({
                                pageId: event.target.value || undefined,
                                instagramActorId:
                                  pageOptions.find((page) => page.id === event.target.value)?.instagramAccountId ||
                                  launchConfig.instagramActorId,
                              })
                            }
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                          >
                            {unresolvedSavedPageLabel && !selectedPageId ? (
                              <option value="">
                                {unresolvedSavedPageLabel} • saved mapping unavailable
                              </option>
                            ) : null}
                            {pageOptions.map((page) => (
                              <option key={page.id} value={page.id}>
                                {page.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Instagram actor
                          </span>
                          <select
                            value={selectedInstagramId}
                            onChange={(event) => updateLaunchConfig({ instagramActorId: event.target.value || undefined })}
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                          >
                            {unresolvedSavedInstagramLabel && !selectedInstagramId ? (
                              <option value="">
                                @{unresolvedSavedInstagramLabel} • saved mapping unavailable
                              </option>
                            ) : null}
                            <option value="">No Instagram actor</option>
                            {instagramOptions.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.username}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Pixel
                          </span>
                          <select
                            value={selectedPixelId}
                            onChange={(event) => updateLaunchConfig({ pixelId: event.target.value || undefined })}
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                          >
                            {unresolvedSavedPixelLabel && !selectedPixelId ? (
                              <option value="">
                                {unresolvedSavedPixelLabel} • saved mapping unavailable
                              </option>
                            ) : null}
                            {pixelOptions.map((pixel) => (
                              <option key={pixel.id} value={pixel.id}>
                                {pixel.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Conversion
                          </span>
                          <select
                            value={launchConfig.conversionEvent || conversionEventOptions[0] || 'PURCHASE'}
                            onChange={(event) => updateLaunchConfig({ conversionEvent: event.target.value || undefined })}
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                          >
                            {conversionEventOptions.map((eventName) => (
                              <option key={eventName} value={eventName}>
                                {eventName}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Destination URL
                          </span>
                          <input
                            value={destinationUrl}
                            onChange={(event) => updateLaunchConfig({ destinationUrl: event.target.value })}
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400')}
                            placeholder="https://..."
                          />
                        </label>

                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            UTM
                          </span>
                          <input
                            value={launchConfig.utmTemplate || profile?.utmTemplate || ''}
                            onChange={(event) => updateLaunchConfig({ utmTemplate: event.target.value })}
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400')}
                            placeholder="utm_source=facebook&utm_campaign={{campaign.name}}"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4 self-start xl:sticky xl:top-6">
                <div className={cn(plannerPanelClass, 'p-4')}>
                  <div className="grid gap-3">
                    <div className={cn(plannerSoftClass, 'p-3')}>
                      <div className="flex flex-wrap items-center gap-2">
                        <LaunchDiagramNode
                          label="Campaign"
                          value={campaignMode === 'existing' ? 'Existing campaign' : 'New campaign'}
                          helper={campaignMode === 'existing' ? selectedCampaignName : launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || 'New draft'}
                          darkMode={darkMode}
                        />
                        <ArrowRight className={cn('hidden h-4 w-4 shrink-0 lg:block', darkMode ? 'text-slate-500' : 'text-slate-400')} />
                        <LaunchDiagramNode
                          label="Ad sets"
                          value={launchConfig.adsetMode === 'existing_adsets' ? 'Existing ad sets' : `${newAdSetCount} new ad sets`}
                          helper={structure === 'ABO' ? 'ABO ad set budgets' : 'CBO campaign budget'}
                          darkMode={darkMode}
                        />
                        <ArrowRight className={cn('hidden h-4 w-4 shrink-0 lg:block', darkMode ? 'text-slate-500' : 'text-slate-400')} />
                        <LaunchDiagramNode
                          label="Creatives"
                          value={`${selectedCreatives.length} selected creatives`}
                          helper={`${laneCount} lane${laneCount === 1 ? '' : 's'} in scope`}
                          darkMode={darkMode}
                        />
                        <ArrowRight className={cn('hidden h-4 w-4 shrink-0 lg:block', darkMode ? 'text-slate-500' : 'text-slate-400')} />
                        <LaunchDiagramNode
                          label="Copy"
                          value={`${primaryTexts.length} PT • ${headlines.length} headlines`}
                          helper={`${descriptions.length} descriptions • CTA ${activeCtaLabel}`}
                          darkMode={darkMode}
                        />
                      </div>
                    </div>

                    <div className={cn(plannerSoftClass, 'p-3')}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            {structure === 'CBO' ? 'Campaign budget' : 'Ad set budget'}
                          </span>
                          <div className="mt-1.5 flex items-center gap-1">
                            <span className={cn('text-sm font-semibold', darkMode ? 'text-slate-400' : 'text-slate-500')}>$</span>
                            <input
                              type="number"
                              min={1}
                              value={budget}
                              disabled={existingBudgetLocked}
                              onChange={(event) => updateLaunchConfig({ dailyBudget: Number(event.target.value) || 0 })}
                              className={cn('w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                            />
                          </div>
                          <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                            {existingBudgetLocked
                              ? 'Existing CBO campaigns keep the campaign-level budget already set in Meta.'
                              : structure === 'ABO'
                                ? 'Each new ad set uses this budget.'
                                : 'Campaign-level budget for the whole CBO draft.'}
                          </p>
                        </label>

                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Bid strategy
                          </span>
                          <select
                            value={launchConfig.bidStrategy || 'LOWEST_COST_WITHOUT_CAP'}
                            onChange={(event) =>
                              updateLaunchConfig({
                                bidStrategy: event.target.value as LaunchConfig['bidStrategy'],
                                bidAmount:
                                  event.target.value === 'COST_CAP' || event.target.value === 'LOWEST_COST_WITH_BID_CAP'
                                    ? launchConfig.bidAmount || 0
                                    : undefined,
                              })
                            }
                            className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                          >
                            <option value="LOWEST_COST_WITHOUT_CAP">Lowest cost</option>
                            <option value="COST_CAP">Cost cap</option>
                            <option value="LOWEST_COST_WITH_BID_CAP">Bid cap</option>
                            <option value="LOWEST_COST_WITH_MIN_ROAS">Minimum ROAS</option>
                          </select>
                          <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                            {structure === 'ABO'
                              ? 'ABO applies bidding at the ad set level.'
                              : 'CBO still sends bid strategy through the ad set path, while budget stays at campaign level.'}
                          </p>
                        </label>

                        {(showBidAmount || showRoasFloor) ? (
                          <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                            <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                              {showRoasFloor ? 'ROAS floor' : bidStrategyLabel}
                            </span>
                            <input
                              type="number"
                              min={0}
                              step={showRoasFloor ? 0.1 : 0.01}
                              value={showRoasFloor ? launchConfig.roasFloor || 0 : launchConfig.bidAmount || 0}
                              onChange={(event) =>
                                updateLaunchConfig(
                                  showRoasFloor
                                    ? { roasFloor: Number(event.target.value) || 0 }
                                    : { bidAmount: Number(event.target.value) || 0 },
                                )
                              }
                              className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                            />
                          </label>
                        ) : null}

                        <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            Duration
                          </span>
                          <div className="mt-1.5 flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={30}
                              value={duration}
                              onChange={(event) => updateLaunchConfig({ testDuration: Number(event.target.value) || 0 })}
                              className={cn('w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                            />
                            <span className={cn('text-xs', darkMode ? 'text-slate-500' : 'text-slate-500')}>days</span>
                          </div>
                        </label>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => updateLaunchConfig({ launchTime: 'immediately', scheduledDate: undefined })}
                          className={cn(
                            'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                            (launchConfig.launchTime || 'immediately') === 'immediately'
                              ? 'bg-slate-900 text-white'
                              : darkMode
                                ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                          )}
                        >
                          Launch paused now
                        </button>
                        <button
                          onClick={() =>
                            updateLaunchConfig({
                              launchTime: 'scheduled',
                              scheduledDate: launchConfig.scheduledDate || new Date().toISOString().slice(0, 10),
                              scheduledTime: launchConfig.scheduledTime || '09:00',
                            })
                          }
                          className={cn(
                            'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                            launchConfig.launchTime === 'scheduled'
                              ? 'bg-slate-900 text-white'
                              : darkMode
                                ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                          )}
                        >
                          Schedule paused launch
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={cn(plannerPanelClass, 'p-4')}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        Checks
                      </p>
                      <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                        {healthSummaryLabel}
                      </p>
                    </div>
                    <button
                      onClick={() => setHealthExpanded((current) => !current)}
                      className={plannerButtonSecondary}
                    >
                      {healthExpanded ? 'Hide details' : 'See details'}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={plannerChipClass}>{setupOptionsLoading ? 'Loading Meta setup' : 'Meta setup mapped'}</span>
                    <span className={plannerChipClass}>{formatScheduleLabel(launchConfig)}</span>
                    <span className={plannerChipClass}>{selectedInstagramId || unresolvedSavedInstagramLabel ? 'Instagram actor linked' : 'No Instagram actor'}</span>
                    <span className={plannerChipClass}>{destinationUrl ? 'Destination mapped' : 'Missing destination URL'}</span>
                  </div>

                  {healthState.error ? (
                    <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {healthState.error}
                    </div>
                  ) : null}

                  {reviewHint ? (
                    <div className={cn('mt-3 rounded-2xl px-3 py-2 text-xs', darkMode ? 'bg-white/[0.04] text-slate-300' : 'bg-slate-50 text-slate-600')}>
                      {reviewHint}
                    </div>
                  ) : null}

                  {healthExpanded && healthState.report ? (
                    <div className="mt-3">
                      <HealthCheckPanel report={healthState.report} />
                    </div>
                  ) : null}

                  <div className={cn(plannerInsetClass, 'mt-4 p-4')}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className={cn('text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                          Final launch review
                        </p>
                        <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                          Review the exact campaign path, counts, and Meta mapping before the paused launch is sent.
                        </p>
                      </div>
                      <button
                        onClick={() => setLaunchReviewOpen(true)}
                        disabled={reviewDisabled}
                        className={cn(
                          'rounded-full px-4 py-2 text-sm font-semibold transition-all',
                          reviewDisabled
                            ? darkMode
                              ? 'bg-white/10 text-slate-500'
                              : 'bg-slate-100 text-slate-400'
                            : darkMode
                              ? 'bg-white text-slate-950 hover:bg-slate-100'
                              : 'bg-slate-900 text-white hover:bg-slate-800',
                        )}
                      >
                        Continue launch
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <Modal
              isOpen={launchReviewOpen}
              onClose={() => setLaunchReviewOpen(false)}
              title="Final launch review"
              size="lg"
            >
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Campaign path</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {campaignMode === 'existing' ? selectedCampaignName : launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || 'New campaign'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {campaignMode === 'existing' ? 'Existing campaign selection' : 'New campaign draft'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">What gets created</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {launchConfig.adsetMode === 'existing_adsets' ? 'Existing ad set mapping' : `${newAdSetCount} new ad sets`}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {selectedCreatives.length} creatives • {laneCount} lanes
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Copy payload</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {primaryTexts.length} PT • {headlines.length} headlines
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {descriptions.length} descriptions • CTA {activeCtaLabel}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Meta mapping</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {selectedAccountId || 'No ad account'} • {selectedPixelId || 'No pixel'}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {selectedPageLabel} • {selectedInstagramLabel}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Launch state
                      </span>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => updateLaunchConfig({ launchStatus: 'PAUSED' })}
                          className={cn(
                            'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                            (launchConfig.launchStatus || 'PAUSED') === 'PAUSED'
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100',
                          )}
                        >
                          Paused
                        </button>
                        <button
                          type="button"
                          onClick={() => updateLaunchConfig({ launchStatus: 'ACTIVE' })}
                          className={cn(
                            'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                            launchConfig.launchStatus === 'ACTIVE'
                              ? 'bg-slate-900 text-white'
                              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100',
                          )}
                        >
                          Go live
                        </button>
                      </div>
                    </label>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Review note
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        The current launch execution already creates and uploads assets through the Creative Hub Meta path. Keep this on paused while we finish the richer launch-status UI.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLaunchReviewOpen(false)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLaunchReviewOpen(false);
                      onReviewLaunch();
                    }}
                    disabled={reviewDisabled}
                    className={cn(
                      'rounded-full px-4 py-2 text-sm font-semibold transition-all',
                      reviewDisabled
                        ? 'bg-slate-100 text-slate-400'
                        : 'bg-slate-900 text-white hover:bg-slate-800',
                    )}
                  >
                    Continue launch
                  </button>
                </div>
              </div>
            </Modal>
          </>
        )}
    </div>
  );
}
