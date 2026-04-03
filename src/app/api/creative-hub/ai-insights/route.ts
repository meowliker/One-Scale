export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { getProductProfile } from '@/app/api/lib/creative-hub-db';
import { generateCreativeCopy } from '../copy-library/copy-generation';

interface AnthropicConfig {
  apiKey: string;
  apiKeySource: string;
  model: string;
  modelSource: string;
}

/**
 * POST /api/creative-hub/ai-insights
 *
 * Sends ad performance data to Claude for analysis and returns structured
 * creative strategy insights. Falls back to rule-based analysis when
 * ANTHROPIC_API_KEY is not set or the API call fails.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WinningAd {
  adId: string;
  adName: string;
  primaryText: string;
  headline: string;
  callToAction: string;
  roas: number;
  cpa: number;
  cpm: number;
  ctr: number;
  spend: number;
  impressions: number;
  purchases: number;
}

interface RankedWinningCopy {
  rank: number;
  text: string;
  label?: string;
  usageCount: number;
  adCount: number;
  totalSpend: number;
  totalRevenue: number;
  totalPurchases: number;
  totalImpressions: number;
  totalClicks: number;
  blendedScore: number;
  metrics: {
    spend: number;
    revenue: number;
    roas: number;
    ctr: number;
    cpc: number;
    cpm: number;
    cpa: number;
    purchases: number;
    impressions: number;
    clicks: number;
  };
  examples?: string[];
}

interface WinningAdsResponse {
  ads: WinningAd[];
  productName: string;
  topPrimaryTexts: Array<{
    text: string;
    adCount: number;
    avgRoas: number;
    totalSpend: number;
    totalPurchases: number;
    usageCount?: number;
    totalImpressions?: number;
    totalClicks?: number;
    avgCtr?: number;
    avgCpa?: number;
    avgCpc?: number;
    avgCpm?: number;
    blendedScore?: number;
    label?: string;
  }>;
  topHeadlines: Array<{
    text: string;
    adCount: number;
    avgRoas: number;
    totalSpend: number;
    totalPurchases: number;
    usageCount?: number;
    totalImpressions?: number;
    totalClicks?: number;
    avgCtr?: number;
    avgCpa?: number;
    avgCpc?: number;
    avgCpm?: number;
    blendedScore?: number;
    label?: string;
  }>;
  topDescriptions?: Array<{
    text: string;
    adCount: number;
    avgRoas: number;
    totalSpend: number;
    totalPurchases: number;
    usageCount?: number;
    totalImpressions?: number;
    totalClicks?: number;
    avgCtr?: number;
    avgCpa?: number;
    avgCpc?: number;
    avgCpm?: number;
    blendedScore?: number;
    label?: string;
  }>;
  topCTAs?: Array<{
    text: string;
    adCount: number;
    avgRoas: number;
    totalSpend: number;
    totalPurchases: number;
    usageCount?: number;
    totalImpressions?: number;
    totalClicks?: number;
    avgCtr?: number;
    avgCpa?: number;
    avgCpc?: number;
    avgCpm?: number;
    blendedScore?: number;
    label?: string;
    ctaType?: string;
  }>;
  copyIntelligence?: {
    primaryTexts: RankedWinningCopy[];
    headlines: RankedWinningCopy[];
    descriptions: RankedWinningCopy[];
    ctas: Array<RankedWinningCopy & { ctaType: string }>;
    defaultRanking: 'blended_score' | 'roas' | 'spend';
  };
}

interface WinningPattern {
  pattern: string;
  avgRoas: number;
  example: string;
  reasoning: string;
}

interface SuggestedPT {
  text: string;
  reasoning: string;
  expectedRoas: string;
}

interface SuggestedHeadline {
  text: string;
  reasoning: string;
}

interface SuggestedDescription {
  text: string;
  reasoning: string;
}

interface AiInsights {
  winningPatterns: WinningPattern[];
  bestAngle: { name: string; avgRoas: number; description: string };
  worstAngle: { name: string; avgRoas: number; description: string };
  suggestedPTs: SuggestedPT[];
  suggestedHeadlines: SuggestedHeadline[];
  suggestedDescriptions: SuggestedDescription[];
  bestCTA: { type: string; usagePercent: number; reasoning: string };
  summary: string;
  actionItems: string[];
}

interface SelectionCreativeInput {
  clickupTaskName?: string;
  clickupListName?: string;
  clickupDescription?: string;
  clickupTags?: string[];
  clickupCustomFields?: Array<{ name: string; value: string }>;
  creativeName: string;
  creativeFormat: string;
  hook?: string;
  angle?: string;
  creator?: string;
  driveParentFolderName?: string;
  uploadedAt?: string;
  alreadyTested?: boolean;
  pastTestResult?: { status?: string };
}

interface SelectionPlanSummary {
  selectedCount: number;
  testedCount: number;
  winnerCount: number;
  untestedCount: number;
  uniqueAngles: number;
  uniqueHooks: number;
  uniqueCreators: number;
  uniqueFolders: number;
  uniqueFormats: number;
  recommendedStrategy:
    | 'smart_mix'
    | 'one_per_adset'
    | 'by_format'
    | 'by_folder';
  recommendedSize: number;
  title: string;
  reason: string;
  strengths: string[];
  cautions: string[];
  nextMoves: string[];
}

interface LaunchActionCardSummary {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  testGoal: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  hypothesis: string;
  expectedOutcome: string;
  strategy:
    | 'smart_mix'
    | 'one_per_adset'
    | 'by_format'
    | 'by_folder';
  recommendedSize: number;
  campaignMode: 'existing' | 'new';
  structure: 'ABO' | 'CBO';
  budget: number;
  durationDays: number;
  setup: {
    campaignMode: 'existing' | 'new';
    structure: 'ABO' | 'CBO';
    budget: number;
    durationDays: number;
    recommendedSize: number;
  };
  signals: string[];
  watchouts: string[];
  successMetrics: string[];
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  bestFor: string[];
}

interface LaunchDraftSummary {
  summary: string;
  profitabilityFloor: number;
  recommendedCampaignMode: 'existing' | 'new';
  recommendedStructure: 'ABO' | 'CBO';
  recommendedBudget: number;
  recommendedDurationDays: number;
  recommendedCampaignName?: string;
  actionCards: LaunchActionCardSummary[];
  copyPlan: {
    source: 'winner_history' | 'selection_history' | 'hybrid' | 'fallback';
    primaryTexts: string[];
    headlines: string[];
    descriptions: string[];
  };
}

interface GeneratedCopyDraft {
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  source: 'ai' | 'fallback';
}

const ANTHROPIC_API_KEY_ALIASES = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'ANTHROPIC_CLOUD_API_KEY',
];

const ANTHROPIC_MODEL_ALIASES = [
  'ANTHROPIC_INSIGHTS_MODEL',
  'ANTHROPIC_CREATIVE_MODEL',
  'ANTHROPIC_MODEL',
];

function firstEnvValue(keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }
  return null;
}

function getAnthropicConfig(defaultModel: string): AnthropicConfig | null {
  const apiKey = firstEnvValue(ANTHROPIC_API_KEY_ALIASES);
  if (!apiKey) return null;

  const model = firstEnvValue(ANTHROPIC_MODEL_ALIASES);
  return {
    apiKey: apiKey.value,
    apiKeySource: apiKey.key,
    model: model?.value || defaultModel,
    modelSource: model?.key || 'default',
  };
}

function extractClaudeText(content?: Array<{ type: string; text?: string }>): string {
  return (content || [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text || '')
    .join('\n')
    .trim();
}

function extractJsonObject(text: string): string | null {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) return jsonMatch[0].trim();

  return null;
}

function normalizeSelectedCreatives(
  rawCreatives: Array<Record<string, unknown>> = [],
): SelectionCreativeInput[] {
  return rawCreatives
    .map((creative) => ({
      creativeName:
        typeof creative.creativeName === 'string' && creative.creativeName.trim()
          ? creative.creativeName
          : 'Untitled creative',
      clickupTaskName:
        typeof creative.clickupTaskName === 'string' ? creative.clickupTaskName.trim() : undefined,
      clickupListName:
        typeof creative.clickupListName === 'string' ? creative.clickupListName.trim() : undefined,
      clickupDescription:
        typeof creative.clickupDescription === 'string'
          ? creative.clickupDescription.trim()
          : undefined,
      clickupTags: Array.isArray(creative.clickupTags)
        ? creative.clickupTags
            .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
            .map((tag) => tag.trim())
        : undefined,
      clickupCustomFields: Array.isArray(creative.clickupCustomFields)
        ? creative.clickupCustomFields
            .map((field) => {
              if (!field || typeof field !== 'object') return null;
              const typedField = field as { name?: unknown; value?: unknown };
              if (typeof typedField.name !== 'string' || typeof typedField.value !== 'string') {
                return null;
              }
              if (!typedField.name.trim() || !typedField.value.trim()) return null;
              return {
                name: typedField.name.trim(),
                value: typedField.value.trim(),
              };
            })
            .filter(
              (
                field,
              ): field is {
                name: string;
                value: string;
              } => Boolean(field),
            )
        : undefined,
      creativeFormat:
        typeof creative.creativeFormat === 'string' && creative.creativeFormat.trim()
          ? creative.creativeFormat
          : 'image',
      hook: typeof creative.hook === 'string' ? creative.hook.trim() : undefined,
      angle: typeof creative.angle === 'string' ? creative.angle.trim() : undefined,
      creator: typeof creative.creator === 'string' ? creative.creator.trim() : undefined,
      driveParentFolderName:
        typeof creative.driveParentFolderName === 'string'
          ? creative.driveParentFolderName.trim()
          : undefined,
      uploadedAt:
        typeof creative.uploadedAt === 'string'
          ? creative.uploadedAt.trim()
          : typeof creative.driveCreatedAt === 'string'
            ? creative.driveCreatedAt.trim()
            : typeof creative.clickupCreatedAt === 'string'
              ? creative.clickupCreatedAt.trim()
              : undefined,
      alreadyTested: Boolean(creative.alreadyTested),
      pastTestResult:
        creative.pastTestResult && typeof creative.pastTestResult === 'object'
          ? {
              status:
                typeof (creative.pastTestResult as { status?: unknown }).status === 'string'
                  ? (creative.pastTestResult as { status: string }).status
                  : undefined,
            }
          : undefined,
    }))
    .filter((creative) => creative.creativeName);
}

function buildSelectionPlan(selectedCreatives: SelectionCreativeInput[]): SelectionPlanSummary | null {
  if (selectedCreatives.length === 0) {
    return null;
  }

  const uniqueAngles = new Set(selectedCreatives.map((creative) => creative.angle).filter(Boolean)).size;
  const uniqueHooks = new Set(selectedCreatives.map((creative) => creative.hook).filter(Boolean)).size;
  const uniqueCreators = new Set(selectedCreatives.map((creative) => creative.creator).filter(Boolean)).size;
  const uniqueFolders = new Set(
    selectedCreatives.map((creative) => creative.driveParentFolderName).filter(Boolean),
  ).size;
  const uniqueFormats = new Set(selectedCreatives.map((creative) => creative.creativeFormat)).size;

  const winnerCount = selectedCreatives.filter(
    (creative) => creative.pastTestResult?.status === 'winner',
  ).length;
  const testedCount = selectedCreatives.filter(
    (creative) => creative.alreadyTested || Boolean(creative.pastTestResult?.status),
  ).length;
  const untestedCount = Math.max(selectedCreatives.length - testedCount, 0);

  let recommendedStrategy: SelectionPlanSummary['recommendedStrategy'] = 'smart_mix';
  let recommendedSize = Math.min(Math.max(selectedCreatives.length, 1), 3);
  let title = 'Balanced challenger test';
  let reason = 'Mix the current set so each lane learns one clear thing without muddying the read.';

  if (selectedCreatives.length <= 1 || untestedCount >= Math.max(2, selectedCreatives.length - 1)) {
    recommendedStrategy = 'one_per_adset';
    recommendedSize = 1;
    title = 'Clean first read';
    reason = 'Most of this set is still untested, so one creative per ad set gives the fastest honest read.';
  } else if (uniqueFormats > 1 && selectedCreatives.length >= 4) {
    recommendedStrategy = 'by_format';
    recommendedSize = Math.min(Math.max(selectedCreatives.length, 2), 3);
    title = 'Format split';
    reason = 'Keep videos and statics apart first so format effects do not hide the real hook signal.';
  } else if (uniqueFolders > 1 && selectedCreatives.length >= 4) {
    recommendedStrategy = 'by_folder';
    recommendedSize = Math.min(Math.max(selectedCreatives.length, 2), 3);
    title = 'Concept cluster test';
    reason = 'Your set spans multiple Drive folders or concepts, so keep each cluster intact for a cleaner comparison.';
  }

  const strengths: string[] = [];
  const cautions: string[] = [];

  if (winnerCount > 0) {
    strengths.push(`${winnerCount} proven winner${winnerCount > 1 ? 's' : ''} can anchor the first round as control.`);
  }
  if (untestedCount > 0) {
    strengths.push(`${untestedCount} untested creative${untestedCount > 1 ? 's are' : ' is'} ready for fresh signal.`);
  }
  if (uniqueHooks > 1 || uniqueAngles > 1) {
    strengths.push('The set has enough hook or angle diversity for a useful first test.');
  }

  if (uniqueAngles <= 1 && selectedCreatives.length > 2) {
    cautions.push('Most selected assets share the same angle, so learnings may cluster too tightly.');
  }
  if (uniqueFormats === 1 && selectedCreatives.length > 3) {
    cautions.push('Everything is the same format right now, so this launch will mostly answer message questions, not format questions.');
  }
  if (selectedCreatives.length > 8) {
    cautions.push('This is a wide set, so be disciplined on lane count or the budget will get diluted.');
  }

  const nextMoves = [
    recommendedStrategy === 'one_per_adset'
      ? 'Start with one creative per ad set to get a clean read before combining anything.'
      : `Apply a ${recommendedStrategy.replaceAll('_', ' ')} structure for the first scheduled test.`,
    winnerCount > 0
      ? 'Keep winners isolated as controls and pit only one new variable against them at a time.'
      : 'Pick one clear control asset before mixing multiple new angles together.',
    uniqueHooks > 1
      ? 'Review the first-frame and hook mix so each lane challenges the control with one obvious idea.'
      : 'Create at least one new hook challenger before you spend heavily on this batch.',
  ];

  return {
    selectedCount: selectedCreatives.length,
    testedCount,
    winnerCount,
    untestedCount,
    uniqueAngles,
    uniqueHooks,
    uniqueCreators,
    uniqueFolders,
    uniqueFormats,
    recommendedStrategy,
    recommendedSize,
    title,
    reason,
    strengths,
    cautions,
    nextMoves,
  };
}

function mergeSelectionPlanIntoInsights(
  insights: AiInsights,
  selectionPlan: SelectionPlanSummary | null,
  analyzedAds: number,
): AiInsights {
  if (!selectionPlan) {
    return insights;
  }

  const prefix =
    analyzedAds > 0
      ? `${selectionPlan.title}. ${selectionPlan.reason}`
      : `${selectionPlan.title}. ${selectionPlan.reason} No product-level winner history was available, so this brief is driven by the current creative selection.`;

  const actionItems = [...selectionPlan.nextMoves, ...insights.actionItems]
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((candidate) => candidate === item) === index)
    .slice(0, 5);

  return {
    ...insights,
    summary: `${prefix} ${insights.summary}`.trim(),
    actionItems,
  };
}

function uniqueTexts(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of values) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
    if (cleaned.length >= limit) break;
  }
  return cleaned;
}

function normalizeTextKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function enforceSuggestionDiversity(
  insights: AiInsights,
  data: WinningAdsResponse,
  generatedCopy: GeneratedCopyDraft | null,
  profitabilityFloor: number,
): AiInsights {
  const winnerPrimarySet = new Set((data.topPrimaryTexts || []).map((item) => normalizeTextKey(item.text || '')));
  const winnerHeadlineSet = new Set((data.topHeadlines || []).map((item) => normalizeTextKey(item.text || '')));
  const winnerDescriptionSet = new Set(((data.topDescriptions || []).map((item) => normalizeTextKey(item.text || ''))));

  const winnerRoasHint = (data.topPrimaryTexts || [])[0]?.avgRoas || profitabilityFloor;
  const expectedRoasHint = `${Math.max(profitabilityFloor, winnerRoasHint * 0.9).toFixed(2)}x+`;

  const primaryPool: SuggestedPT[] = [
    ...(generatedCopy?.primaryTexts || []).map((text) => ({
      text,
      reasoning: 'AI-generated from winner primary text patterns.',
      expectedRoas: expectedRoasHint,
    })),
    ...(insights.suggestedPTs || []),
  ];
  const headlinePool: SuggestedHeadline[] = [
    ...(generatedCopy?.headlines || []).map((text) => ({
      text,
      reasoning: 'AI-generated from winner headline patterns.',
    })),
    ...(insights.suggestedHeadlines || []),
  ];
  const descriptionPool: SuggestedDescription[] = [
    ...(generatedCopy?.descriptions || []).map((text) => ({
      text,
      reasoning: 'AI-generated from winner description patterns.',
    })),
    ...(insights.suggestedDescriptions || []),
  ];

  const pickPrimary = (): SuggestedPT[] => {
    const seen = new Set<string>();
    const picked: SuggestedPT[] = [];
    for (const item of primaryPool) {
      const text = (item.text || '').trim();
      if (!text) continue;
      const key = normalizeTextKey(text);
      if (winnerPrimarySet.has(key) || seen.has(key)) continue;
      seen.add(key);
      picked.push({
        text,
        reasoning: item.reasoning || 'AI-generated from winner primary text patterns.',
        expectedRoas: item.expectedRoas || expectedRoasHint,
      });
      if (picked.length >= 5) break;
    }
    if (picked.length === 0) {
      const fallback = uniqueTexts([
        `${data.productName} gives families a simple daily reading flow they can use tonight.`,
        `Make reading practice easier this week with ${data.productName} and a clear step-by-step path.`,
        `Parents are switching to ${data.productName} for faster, calmer reading sessions at home.`,
      ], 3);
      fallback.forEach((text) => picked.push({
        text,
        reasoning: 'Fallback template generated from winner history context (non-LLM).',
        expectedRoas: expectedRoasHint,
      }));
    }
    return picked.slice(0, 5);
  };

  const pickHeadlines = (): SuggestedHeadline[] => {
    const seen = new Set<string>();
    const picked: SuggestedHeadline[] = [];
    for (const item of headlinePool) {
      const text = (item.text || '').trim();
      if (!text) continue;
      const key = normalizeTextKey(text);
      if (winnerHeadlineSet.has(key) || seen.has(key)) continue;
      seen.add(key);
      picked.push({
        text,
        reasoning: item.reasoning || 'AI-generated from winner headline patterns.',
      });
      if (picked.length >= 5) break;
    }
    if (picked.length === 0) {
      const fallback = uniqueTexts([
        `Start ${data.productName} Today`,
        'A Simpler Daily Reading Routine',
        'Make Practice Time Actually Work',
      ], 3);
      fallback.forEach((text) => picked.push({
        text,
        reasoning: 'Fallback template generated from winner headline context (non-LLM).',
      }));
    }
    return picked.slice(0, 5);
  };

  const pickDescriptions = (): SuggestedDescription[] => {
    const seen = new Set<string>();
    const picked: SuggestedDescription[] = [];
    for (const item of descriptionPool) {
      const text = (item.text || '').trim();
      if (!text) continue;
      const key = normalizeTextKey(text);
      if (winnerDescriptionSet.has(key) || seen.has(key)) continue;
      seen.add(key);
      picked.push({
        text,
        reasoning: item.reasoning || 'AI-generated from winner description patterns.',
      });
      if (picked.length >= 5) break;
    }
    if (picked.length === 0) {
      const fallback = uniqueTexts([
        'Short daily sessions, clear structure, and confidence-building progress.',
        'Designed for busy families who need practical reading support fast.',
        'Instant digital access so you can test and start today.',
      ], 3);
      fallback.forEach((text) => picked.push({
        text,
        reasoning: 'Fallback template generated from winner description context (non-LLM).',
      }));
    }
    return picked.slice(0, 5);
  };

  return {
    ...insights,
    suggestedPTs: pickPrimary(),
    suggestedHeadlines: pickHeadlines(),
    suggestedDescriptions: pickDescriptions(),
  };
}

function normalizeAiInsights(raw: AiInsights): AiInsights {
  const normalizeReasoned = <T extends { text: string; reasoning: string }>(
    values: unknown,
  ): T[] => {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => {
        if (!value || typeof value !== 'object') return null;
        const text = typeof (value as { text?: unknown }).text === 'string'
          ? (value as { text?: string }).text!.trim()
          : '';
        if (!text) return null;
        const reasoning = typeof (value as { reasoning?: unknown }).reasoning === 'string'
          ? (value as { reasoning?: string }).reasoning!.trim()
          : '';
        return {
          text,
          reasoning: reasoning || 'Generated from winner-history patterns.',
        } as T;
      })
      .filter((value): value is T => Boolean(value));
  };

  const suggestedPTs = normalizeReasoned<SuggestedPT>(raw.suggestedPTs).map((item) => ({
    ...item,
    expectedRoas:
      typeof item.expectedRoas === 'string' && item.expectedRoas.trim()
        ? item.expectedRoas
        : 'Derived from winner-history benchmarks.',
  }));

  return {
    winningPatterns: Array.isArray(raw.winningPatterns) ? raw.winningPatterns : [],
    bestAngle: raw.bestAngle || { name: 'N/A', avgRoas: 0, description: 'Not enough data.' },
    worstAngle: raw.worstAngle || { name: 'N/A', avgRoas: 0, description: 'Not enough data.' },
    suggestedPTs,
    suggestedHeadlines: normalizeReasoned<SuggestedHeadline>(raw.suggestedHeadlines),
    suggestedDescriptions: normalizeReasoned<SuggestedDescription>(raw.suggestedDescriptions),
    bestCTA: raw.bestCTA || { type: 'SHOP_NOW', usagePercent: 0, reasoning: 'Not enough data.' },
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    actionItems: Array.isArray(raw.actionItems)
      ? raw.actionItems.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
  };
}

function buildSuggestedCampaignName(productName: string): string {
  return `${productName} | Creative Test ${new Date().toISOString().slice(0, 10)}`;
}

function confidencePriority(confidence: number): 'low' | 'medium' | 'high' {
  if (confidence >= 85) return 'high';
  if (confidence >= 70) return 'medium';
  return 'low';
}

function formatSelectionContext(
  selectedCreatives: SelectionCreativeInput[],
  options?: {
    profitabilityFloor?: number;
    destinationUrl?: string;
    utmTemplate?: string;
  },
): string {
  if (selectedCreatives.length === 0) {
    return 'No current creative browser selection was provided.';
  }

  const lines = selectedCreatives.slice(0, 12).map((creative, index) => {
    const customFieldSummary = (creative.clickupCustomFields || [])
      .slice(0, 4)
      .map((field) => `${field.name}: ${field.value}`)
      .join(' | ');

    return [
      `${index + 1}. ${creative.creativeName}`,
      creative.clickupTaskName ? `task: ${creative.clickupTaskName}` : null,
      creative.clickupListName ? `list: ${creative.clickupListName}` : null,
      creative.creativeFormat ? `format: ${creative.creativeFormat}` : null,
      creative.hook ? `hook: ${creative.hook}` : null,
      creative.angle ? `angle: ${creative.angle}` : null,
      creative.creator ? `creator: ${creative.creator}` : null,
      creative.driveParentFolderName ? `folder: ${creative.driveParentFolderName}` : null,
      creative.uploadedAt ? `uploaded: ${creative.uploadedAt}` : null,
      creative.clickupTags?.length ? `tags: ${creative.clickupTags.join(', ')}` : null,
      customFieldSummary ? `fields: ${customFieldSummary}` : null,
      creative.clickupDescription ? `description: ${creative.clickupDescription}` : null,
    ]
      .filter(Boolean)
      .join(' | ');
  });

  if (options?.destinationUrl) {
    lines.push(`Destination URL: ${options.destinationUrl}`);
  }
  if (options?.utmTemplate) {
    lines.push(`UTM template: ${options.utmTemplate}`);
  }
  lines.push(
    `Profitability floor: ${(options?.profitabilityFloor ?? 1.2).toFixed(1)}x ROAS for this digital product.`,
  );

  return lines.join('\n');
}

function buildLaunchDraft(
  data: WinningAdsResponse,
  insights: AiInsights,
  selectionPlan: SelectionPlanSummary | null,
  profitabilityFloor = 1.2,
  generatedCopy: GeneratedCopyDraft | null = null,
): LaunchDraftSummary {
  const copySource = data.copyIntelligence;
  const winnerPrimarySource = copySource?.primaryTexts?.length ? copySource.primaryTexts : data.topPrimaryTexts;
  const winnerHeadlineSource = copySource?.headlines?.length ? copySource.headlines : data.topHeadlines;
  const winnerDescriptionSource = copySource?.descriptions?.length
    ? copySource.descriptions
    : (data.topDescriptions || []);
  const winnerCtaSource = copySource?.ctas?.length ? copySource.ctas : (data.topCTAs || []);
  const winnerPrimaryTexts = winnerPrimarySource.slice(0, 3).map((item) => item.text);
  const winnerHeadlines = winnerHeadlineSource.slice(0, 3).map((item) => item.text);
  const winnerDescriptions = winnerDescriptionSource.slice(0, 3).map((item) => item.text);
  const winnerCTAs = winnerCtaSource.slice(0, 3).map((item) => item.text);
  const aiPrimaryTexts = insights.suggestedPTs.slice(0, 3).map((item) => item.text);
  const aiHeadlines = insights.suggestedHeadlines.slice(0, 3).map((item) => item.text);
  const aiDescriptionSource = insights.suggestedDescriptions || [];
  const aiDescriptions = [
    ...aiDescriptionSource.slice(0, 3).map((item) => item.text),
    ...winnerDescriptions.slice(0, 2),
    insights.winningPatterns[0]?.reasoning,
    insights.bestAngle?.description,
  ].filter(Boolean) as string[];
  const winningBody = data.ads.find((ad) => ad.primaryText.trim())?.primaryText;
  const bestHeadline = data.ads.find((ad) => ad.headline.trim())?.headline;
  const bestCta = winnerCTAs[0] || copySource?.ctas?.[0]?.text || data.topCTAs?.[0]?.text || data.ads.find((ad) => ad.callToAction.trim())?.callToAction;

  const primaryTexts = uniqueTexts(
    [...(generatedCopy?.primaryTexts || []), ...winnerPrimaryTexts, ...aiPrimaryTexts, winningBody],
    5,
  );
  const headlines = uniqueTexts(
    [...(generatedCopy?.headlines || []), ...winnerHeadlines, ...aiHeadlines, bestHeadline],
    5,
  );
  const descriptions = uniqueTexts(
    [
      ...(generatedCopy?.descriptions || []),
      ...winnerDescriptions,
      ...aiDescriptions,
      data.ads.find((ad) => ad.headline.trim())?.headline
        ? `Route traffic to the proven "${data.ads.find((ad) => ad.headline.trim())?.headline}" offer path first.`
        : null,
      bestCta ? `Keep the CTA directional cue as "${bestCta}" when the inventory supports it.` : null,
      `${data.productName} is a digital product, so treat ${profitabilityFloor.toFixed(1)}x ROAS as the profitable floor, not the ceiling.`,
    ],
    3,
  );

  const selectionCount = selectionPlan?.selectedCount ?? 0;
  const hasWinners = (selectionPlan?.winnerCount ?? 0) > 0 || data.ads.length > 0;
  const recommendedCampaignMode: 'existing' | 'new' = hasWinners ? 'existing' : 'new';
  const recommendedStructure: 'ABO' | 'CBO' =
    selectionCount >= 6 || (selectionPlan?.recommendedStrategy === 'by_format' && selectionCount >= 4)
      ? 'CBO'
      : 'ABO';
  const recommendedBudget =
    recommendedStructure === 'ABO'
      ? Math.max(20, Math.min(60, (selectionPlan?.recommendedSize ?? 3) * 10))
      : Math.max(40, Math.min(120, Math.max(selectionCount, 3) * 12));
  const recommendedDurationDays =
    selectionPlan?.recommendedStrategy === 'one_per_adset' ? 3 : 4;
  const baseCopySource =
    generatedCopy?.source === 'ai'
      ? selectionPlan
        ? 'selection_history'
        : 'fallback'
      : winnerPrimaryTexts.length > 0 && aiPrimaryTexts.length > 0
      ? 'hybrid'
      : winnerPrimaryTexts.length > 0
        ? 'winner_history'
        : aiPrimaryTexts.length > 0
          ? 'selection_history'
          : 'fallback';

  const actionCards: LaunchActionCardSummary[] = [];
  const pushAction = (card: LaunchActionCardSummary | null) => {
    if (!card) return;
    if (actionCards.some((item) => item.id === card.id)) return;
    actionCards.push(card);
  };

  if (hasWinners) {
    const confidence = 92;
    pushAction({
      id: 'winner-challengers',
      title: 'Winner + challengers',
      summary: 'Use one control and let the new ideas fight for the second slot.',
      rationale: 'Best when you already have product-level winner history and want a clean benchmark.',
      testGoal: 'Protect control signal while measuring fresh challenger lift.',
      confidence,
      priority: confidencePriority(confidence),
      hypothesis: 'A proven winner paired with a few challengers will preserve signal while exposing the next scalable copy variation.',
      expectedOutcome: 'One clear control plus challenger deltas that the launch team can read quickly.',
      strategy: selectionPlan?.recommendedStrategy === 'one_per_adset' ? 'smart_mix' : (selectionPlan?.recommendedStrategy ?? 'smart_mix'),
      recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 2, 2),
      campaignMode: 'existing',
      structure: recommendedStructure,
      budget: recommendedBudget,
      durationDays: recommendedDurationDays,
      setup: {
        campaignMode: 'existing',
        structure: recommendedStructure,
        budget: recommendedBudget,
        durationDays: recommendedDurationDays,
        recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 2, 2),
      },
      signals: ['Existing winner history', 'Need to preserve benchmark clarity', 'Control-vs-challenger read'],
      watchouts: ['Do not over-fragment the budget', 'Keep challenger count tight enough for a clean read'],
      successMetrics: ['ROAS lift vs control', 'CPA stability', 'CTR delta', 'Spend concentration on the winner'],
      primaryTexts,
      headlines,
      descriptions,
      bestFor: ['Control vs challenger read', 'Fast digital-product iteration'],
    });
  }

  if ((selectionPlan?.uniqueHooks ?? 0) > 1 || (selectionPlan?.uniqueAngles ?? 0) > 1) {
    const confidence = 80;
    pushAction({
      id: 'hook-diversity',
      title: 'Hook diversity',
      summary: 'Keep the offer stable and compare the first-frame or opening idea.',
      rationale: 'Your current selection has enough angle or hook spread to make this a high-signal first batch.',
      testGoal: 'Find the hook family worth scaling into more copy and spend.',
      confidence,
      priority: confidencePriority(confidence),
      hypothesis: 'Different opening ideas will reveal whether the market is responding to the angle or the delivery.',
      expectedOutcome: 'One hook family emerges as the clearest launch direction for future iterations.',
      strategy: selectionPlan?.recommendedStrategy === 'by_format' ? 'smart_mix' : (selectionPlan?.recommendedStrategy ?? 'smart_mix'),
      recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 3, 3),
      campaignMode: recommendedCampaignMode,
      structure: 'ABO',
      budget: Math.max(20, recommendedBudget - 10),
      durationDays: 3,
      setup: {
        campaignMode: recommendedCampaignMode,
        structure: 'ABO',
        budget: Math.max(20, recommendedBudget - 10),
        durationDays: 3,
        recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 3, 3),
      },
      signals: ['Multiple hooks', 'Multiple angles', 'Good exploration breadth'],
      watchouts: ['Avoid changing the offer while testing hook shape', 'Keep naming consistent for analysis'],
      successMetrics: ['CTR improvement', 'Thumb-stop / hook quality read', 'Early CPA trend', 'Engagement lift'],
      primaryTexts,
      headlines,
      descriptions,
      bestFor: ['Angle testing', 'Message discovery'],
    });
  }

  if ((selectionPlan?.uniqueFormats ?? 0) > 1) {
    const confidence = 74;
    pushAction({
      id: 'format-split',
      title: 'Format split',
      summary: 'Separate videos and statics before reading the hook quality.',
      rationale: 'Format is a strong variable here and should not hide the creative message read.',
      testGoal: 'Learn whether the performance gap comes from format or concept.',
      confidence,
      priority: confidencePriority(confidence),
      hypothesis: 'Format differences are masking message quality, so splitting formats will sharpen the read.',
      expectedOutcome: 'A clean format-level winner and a more accurate view of the underlying copy signal.',
      strategy: 'by_format',
      recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 3, 2),
      campaignMode: recommendedCampaignMode,
      structure: 'CBO',
      budget: Math.max(recommendedBudget, 48),
      durationDays: 4,
      setup: {
        campaignMode: recommendedCampaignMode,
        structure: 'CBO',
        budget: Math.max(recommendedBudget, 48),
        durationDays: 4,
        recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 3, 2),
      },
      signals: ['Mixed media formats', 'Potential format-driven skew', 'Need for cleaner read'],
      watchouts: ['Do not compare unlike formats in the same bucket', 'Watch for budget imbalance across formats'],
      successMetrics: ['Format-level ROAS', 'CTR by format', 'CPC by format', 'Spend share by format'],
      primaryTexts,
      headlines,
      descriptions,
      bestFor: ['Mixed media sets', 'Thumb-stop testing'],
    });
  }

  if ((selectionPlan?.untestedCount ?? 0) > 0) {
    const confidence = 66;
    pushAction({
      id: 'fresh-untested',
      title: 'Fresh untested set',
      summary: 'Take the newest untested assets and give them a clean first read.',
      rationale: 'Great for this workflow because the product is digital and can profit on relatively modest ROAS.',
      testGoal: 'Identify new controls quickly without over-building the campaign tree.',
      confidence,
      priority: confidencePriority(confidence),
      hypothesis: 'Untested creatives can find a new control if they get a clean, low-friction first exposure.',
      expectedOutcome: 'A fast answer on whether the new assets deserve scale or recycling.',
      strategy: 'one_per_adset',
      recommendedSize: 1,
      campaignMode: 'new',
      structure: 'ABO',
      budget: 20,
      durationDays: 3,
      setup: {
        campaignMode: 'new',
        structure: 'ABO',
        budget: 20,
        durationDays: 3,
        recommendedSize: 1,
      },
      signals: ['Untested assets available', 'Low-friction first read is valuable', 'Good for quick directional signal'],
      watchouts: ['Do not over-invest before the first read', 'Keep the test simple enough to interpret'],
      successMetrics: ['First-pass CTR', 'Early CPA', 'ROAS floor check', 'Creative holdout response'],
      primaryTexts,
      headlines,
      descriptions,
      bestFor: ['New concepts', 'Fresh upload sweeps'],
    });
  }

  if ((selectionPlan?.uniqueFolders ?? 0) > 1) {
    const confidence = 70;
    pushAction({
      id: 'folder-pack',
      title: 'Folder pack',
      summary: 'Keep concept families intact so each folder gets a fair first test.',
      rationale: 'Useful when the Drive folders already represent creative concepts or production shoots.',
      testGoal: 'Compare concept clusters, not just individual files.',
      confidence,
      priority: confidencePriority(confidence),
      hypothesis: 'Folder-level grouping preserves creative context and surfaces concept families faster.',
      expectedOutcome: 'A folder or concept cluster that is clearly worth expanding into a larger launch.',
      strategy: 'by_folder',
      recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 3, 2),
      campaignMode: recommendedCampaignMode,
      structure: recommendedStructure,
      budget: recommendedBudget,
      durationDays: 4,
      setup: {
        campaignMode: recommendedCampaignMode,
        structure: recommendedStructure,
        budget: recommendedBudget,
        durationDays: 4,
        recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 3, 2),
      },
      signals: ['Multiple production folders', 'Concept families are already organized', 'Good for cluster testing'],
      watchouts: ['Do not split a single concept family across too many ad sets', 'Keep folders semantically clean'],
      successMetrics: ['Folder-level ROAS', 'CPA by concept', 'CTR by concept', 'Winning folder adoption'],
      primaryTexts,
      headlines,
      descriptions,
      bestFor: ['Folder-led testing', 'Concept pack launches'],
    });
  }

  const scaleConfidence = hasWinners ? 90 : 78;
  pushAction({
    id: 'scale-winner-angle',
    title: 'Scale existing winner angle',
    summary: 'Use the best winning angle as the control copy spine and let creatives rotate underneath it.',
    rationale: 'Best when you want a commercial-ready plan, not just a research batch.',
    testGoal: 'Turn proven copy into a structured launch path for the selected creatives.',
    confidence: scaleConfidence,
    priority: confidencePriority(scaleConfidence),
    hypothesis: 'The strongest winner angle can act as the control spine for a broader, commercial-ready launch.',
    expectedOutcome: 'A launch path that is ready to scale because the copy is already anchored in proven behavior.',
    strategy: hasWinners ? 'smart_mix' : (selectionPlan?.recommendedStrategy ?? 'smart_mix'),
    recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 3, 2),
    campaignMode: hasWinners ? 'existing' : 'new',
    structure: recommendedStructure,
    budget: recommendedBudget,
    durationDays: recommendedDurationDays,
    setup: {
      campaignMode: hasWinners ? 'existing' : 'new',
      structure: recommendedStructure,
      budget: recommendedBudget,
      durationDays: recommendedDurationDays,
      recommendedSize: Math.max(selectionPlan?.recommendedSize ?? 3, 2),
    },
    signals: ['Winner history exists', 'Copy spine can be reused', 'Commercial launch is realistic'],
    watchouts: ['Do not dilute the control angle too early', 'Keep challenger copy meaningfully different'],
    successMetrics: ['ROAS on the winner angle', 'Incremental CPA stability', 'Scale efficiency', 'Creative fatigue resistance'],
    primaryTexts,
    headlines,
    descriptions,
    bestFor: ['Commercial launch prep', 'Copy-led digital product scale'],
  });

  return {
    summary: hasWinners
      ? `Claude should bias toward structured control-vs-challenger testing and treat ${profitabilityFloor.toFixed(1)}x ROAS as profitable for this digital product.`
      : `Claude should bias toward fresh-read testing, compact ABO setups, and a ${profitabilityFloor.toFixed(1)}x ROAS profitability floor for this digital product.`,
    profitabilityFloor,
    recommendedCampaignMode,
    recommendedStructure,
    recommendedBudget,
    recommendedDurationDays,
    recommendedCampaignName: buildSuggestedCampaignName(data.productName),
    actionCards: actionCards.slice(0, 6),
    copyPlan: {
      source: baseCopySource,
      primaryTexts,
      headlines,
      descriptions,
    },
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an elite Meta Ads strategist with 10+ years managing $10M+/month across 20+ ad accounts. You know every Meta optimization lever — creative testing frameworks, bid strategies, audience segmentation, funnel architecture, and the latest 2025-2026 algorithm changes.

You've personally scaled hundreds of e-commerce brands from $0 to $1M+/month using data-driven creative iteration. You understand hook rates, thumb-stop ratios, copy psychology, urgency triggers, social proof mechanics, and direct response principles used by top DTC brands worldwide.

When analyzing ad data, you think like a senior media buyer who has to justify every dollar to the brand owner. You identify winning patterns others miss, spot creative fatigue before it hurts, and know exactly which copy angles to test next based on what's working.

IMPORTANT: Return your analysis as valid JSON matching the exact schema below. No markdown, no explanation outside the JSON.`;

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaudeForInsights(
  data: WinningAdsResponse,
  anthropic: AnthropicConfig | null,
  selectionContextText?: string,
  profitabilityFloor = 1.2,
): Promise<AiInsights | null> {
  if (!anthropic) return null;

  const top20Ads = data.ads.slice(0, 20);
  const top10PTs = data.topPrimaryTexts.slice(0, 10);
  const top5Headlines = data.topHeadlines.slice(0, 5);

  const adsContext = top20Ads
    .map(
      (ad, i) =>
        `${i + 1}. PT: "${ad.primaryText}" | Headline: "${ad.headline}" | CTA: ${ad.callToAction} | ROAS: ${ad.roas.toFixed(2)}x | CPA: $${ad.cpa.toFixed(2)} | CPM: $${ad.cpm.toFixed(2)} | CTR: ${(ad.ctr * 100).toFixed(2)}% | Spend: $${ad.spend.toFixed(2)} | Impressions: ${ad.impressions} | Purchases: ${ad.purchases}`,
    )
    .join('\n');

  const ptsContext = top10PTs
    .map(
      (pt, i) =>
        `${i + 1}. "${pt.text}" — Ads: ${pt.adCount}, Avg ROAS: ${pt.avgRoas.toFixed(2)}x, Spend: $${pt.totalSpend.toFixed(2)}, Purchases: ${pt.totalPurchases}`,
    )
    .join('\n');

  const headlinesContext = top5Headlines
    .map(
      (h, i) =>
        `${i + 1}. "${h.text}" — Ads: ${h.adCount}, Avg ROAS: ${h.avgRoas.toFixed(2)}x, Spend: $${h.totalSpend.toFixed(2)}, Purchases: ${h.totalPurchases}`,
    )
    .join('\n');

  const userMessage = `Analyze the following Meta Ads performance data for the product "${data.productName}".

TOP 20 ADS BY ROAS:
${adsContext}

TOP 10 UNIQUE PRIMARY TEXTS (aggregated across ads):
${ptsContext}

TOP 5 UNIQUE HEADLINES (aggregated across ads):
${headlinesContext}

CURRENT CREATIVE BROWSER SELECTION:
${selectionContextText || 'No current creative browser selection was provided.'}

BUSINESS CONTEXT:
- This is a digital product.
- Treat ${profitabilityFloor.toFixed(1)}x ROAS as the profitable floor, not the ceiling.

Return your analysis as a JSON object with this exact schema:
{
  "winningPatterns": [{ "pattern": "string", "avgRoas": number, "example": "string", "reasoning": "string" }],
  "bestAngle": { "name": "string", "avgRoas": number, "description": "string" },
  "worstAngle": { "name": "string", "avgRoas": number, "description": "string" },
  "suggestedPTs": [{ "text": "string", "reasoning": "string", "expectedRoas": "string" }],
  "suggestedHeadlines": [{ "text": "string", "reasoning": "string" }],
  "suggestedDescriptions": [{ "text": "string", "reasoning": "string" }],
  "bestCTA": { "type": "string", "usagePercent": number, "reasoning": "string" },
  "summary": "2-3 sentence executive summary",
  "actionItems": ["string array of top 3 things to do next"]
}`;

  const model = anthropic.model;

  const controller = new AbortController();
  // Bound the Claude leg so the route can still return fallback launch cards quickly.
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropic.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API failed (${response.status}) using ${anthropic.apiKeySource}/${anthropic.modelSource}: ${errorBody.slice(0, 500)}`);
    }

    const result = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textContent = extractClaudeText(result.content);
    if (!textContent) return null;

    const jsonText = extractJsonObject(textContent);
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as AiInsights;
    const normalized = normalizeAiInsights(parsed);

    // Basic validation
    if (!normalized.winningPatterns || !normalized.summary) return null;

    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Fallback rule-based analysis
// ---------------------------------------------------------------------------

function buildFallbackInsights(
  data: WinningAdsResponse,
  selectedCreatives: SelectionCreativeInput[] = [],
  profitabilityFloor = 1.2,
  generatedCopy: GeneratedCopyDraft | null = null,
): AiInsights {
  const ads = data.ads.slice(0, 20);
  const pts = data.topPrimaryTexts.slice(0, 10);
  const headlines = data.topHeadlines.slice(0, 5);
  const descriptions = (data.topDescriptions || []).slice(0, 5);
  const hasWinnerCopyHistory = pts.length > 0 || headlines.length > 0 || descriptions.length > 0;

  // Best PT by ROAS
  const bestPT = pts.length > 0
    ? pts.reduce((a, b) => (b.avgRoas > a.avgRoas ? b : a), pts[0])
    : null;

  // Worst PT by ROAS
  const worstPT = pts.length > 1
    ? pts.reduce((a, b) => (b.avgRoas < a.avgRoas ? b : a), pts[0])
    : null;

  // Most common CTA
  const ctaCounts: Record<string, number> = {};
  for (const ad of ads) {
    const cta = ad.callToAction || 'UNKNOWN';
    ctaCounts[cta] = (ctaCounts[cta] || 0) + 1;
  }
  const topCTA = Object.entries(ctaCounts).sort((a, b) => b[1] - a[1])[0];
  const ctaType = topCTA?.[0] ?? 'SHOP_NOW';
  const ctaPercent = topCTA ? (topCTA[1] / ads.length) * 100 : 0;

  // Top ad for winning pattern
  const topAd = ads.length > 0
    ? ads.reduce((a, b) => (b.roas > a.roas ? b : a), ads[0])
    : null;

  const avgRoas = ads.length > 0
    ? ads.reduce((sum, ad) => sum + ad.roas, 0) / ads.length
    : 0;

  if (ads.length === 0 && !hasWinnerCopyHistory) {
    const hooks = uniqueTexts(selectedCreatives.map((creative) => creative.hook), 3);
    const angles = uniqueTexts(selectedCreatives.map((creative) => creative.angle), 3);
    const creators = uniqueTexts(selectedCreatives.map((creative) => creative.creator), 2);
    const folders = uniqueTexts(selectedCreatives.map((creative) => creative.driveParentFolderName), 2);
    const taskNames = uniqueTexts(selectedCreatives.map((creative) => creative.clickupTaskName), 3);
    const generatedPrimaryTexts = generatedCopy?.primaryTexts || [];
    const generatedHeadlines = generatedCopy?.headlines || [];
    const generatedDescriptions = generatedCopy?.descriptions || [];
    const descriptionLead = generatedDescriptions[0] || `${data.productName} supporting description`;
    const leadAngle = angles[0] || hooks[0] || taskNames[0] || generatedPrimaryTexts[0] || data.productName;
    const supportAngle = angles[1] || hooks[1] || folders[0] || generatedHeadlines[1] || 'fresh creative angle';
    const creatorNote = creators[0] ? ` inspired by ${creators[0]}` : '';
    const baseReasoning = selectedCreatives.length > 0
      ? 'No stored winner history was available, so the fallback brief was built from the current creative selection, ClickUp context, and digital-product profitability floor.'
      : generatedCopy?.source === 'ai'
        ? 'No stored winner history was available, so Claude drafted a selection-aware fallback brief from the product and creative context.'
        : 'No stored winner history was available, so the fallback brief uses a digital-product-first default test plan.';

    return {
      winningPatterns: [
        {
          pattern: selectedCreatives.length > 0
            ? `Selection-led ${leadAngle} concept pack`
            : `${data.productName} selection-aware launch pack`,
          avgRoas: profitabilityFloor,
          example: taskNames[0] || hooks[0] || generatedPrimaryTexts[0] || leadAngle,
          reasoning: baseReasoning,
        },
      ],
      bestAngle: {
        name: leadAngle,
        avgRoas: profitabilityFloor,
        description: selectedCreatives.length > 0
          ? `This is the strongest angle surfaced from the selected creatives${creatorNote}.`
          : generatedCopy?.source === 'ai'
            ? `Claude generated this selection-aware primary text for ${data.productName}.`
            : `This is the default challenger angle for ${data.productName}.`,
      },
      worstAngle: {
        name: supportAngle,
        avgRoas: Math.max(profitabilityFloor - 0.15, 0),
        description: selectedCreatives.length > 0
          ? 'This is a weaker fallback read only because there is no product-level outcome history yet. Treat it as a challenger, not a losing angle.'
          : 'No product-level outcome history is available yet, so treat this as a challenger concept rather than a losing angle.',
      },
      suggestedPTs: uniqueTexts(
        generatedPrimaryTexts.length > 0
          ? generatedPrimaryTexts
          : [
              `Parents are grabbing ${data.productName} because ${leadAngle.toLowerCase()} matters more than another toy. Get instant access today.`,
              `If ${supportAngle.toLowerCase()} is the blocker, ${data.productName} gives families a simple digital solution they can start today.`,
              `${data.productName} helps families move faster with practical routines, printable tools, and a clear next step. Try it now.`,
            ],
        5,
      ).map((text) => ({
        text,
        reasoning: generatedCopy?.source === 'ai'
          ? 'Claude generated this variation from the current product and creative context.'
          : 'Generated from the active selection, ClickUp notes, and the product profitability floor.',
        expectedRoas: `Aim for ${profitabilityFloor.toFixed(1)}x+ ROAS to stay profitable.`,
      })),
      suggestedHeadlines: uniqueTexts(
        generatedHeadlines.length > 0
          ? generatedHeadlines
          : [
              `${data.productName} for Real-Life Skills`,
              `Start ${leadAngle} Today`,
              `Digital Tools Parents Use Fast`,
            ],
        5,
      ).map((text) => ({
        text,
        reasoning: generatedCopy?.source === 'ai'
          ? 'Claude drafted this headline to pair with the current selection-aware primary texts.'
          : 'Built from the selected creative concepts because no winner-history headline set was available.',
      })),
      suggestedDescriptions: uniqueTexts(
        generatedDescriptions.length > 0
          ? generatedDescriptions
          : [
              descriptionLead,
              `${data.productName} helps families act on ${leadAngle.toLowerCase()} without extra prep work.`,
              `Use this line as support copy while you test the ${supportAngle.toLowerCase()} angle.`,
            ],
        5,
      ).map((text) => ({
        text,
        reasoning: generatedCopy?.source === 'ai'
          ? 'Claude drafted this support description from selection context and product constraints.'
          : 'Generated from selected creative context and the digital-product profitability floor.',
      })),
      bestCTA: {
        type: 'SHOP_NOW',
        usagePercent: 100,
        reasoning:
          'Defaulting to SHOP_NOW because this is a digital-product test flow and no winner CTA distribution was available.',
      },
      summary: selectedCreatives.length > 0
        ? `No stored winning-ad history was available for ${data.productName}, so this brief is built from ${selectedCreatives.length} selected creatives and uses ${profitabilityFloor.toFixed(1)}x ROAS as the profitability floor.`
        : generatedCopy?.source === 'ai'
          ? `No stored winning-ad history was available for ${data.productName}, so Claude drafted a selection-aware copy plan with a ${profitabilityFloor.toFixed(1)}x ROAS floor.`
          : `No stored winning-ad history was available for ${data.productName}, so this brief uses a ${profitabilityFloor.toFixed(1)}x ROAS profitability floor.`,
      actionItems: selectedCreatives.length > 0
        ? [
            `Launch the strongest ${leadAngle.toLowerCase()} concept first with a clean control-vs-challenger setup.`,
            'Use fresh primary-text and headline variations generated from the selected creatives before broadening the batch.',
            'Watch for 1.2x+ ROAS early because this digital product can stay profitable below typical physical-product thresholds.',
          ]
        : generatedCopy?.source === 'ai'
          ? [
              `Apply Claude's generated primary texts for ${data.productName}`,
              `Use the generated headlines and descriptions as a one-click autofill bundle (${descriptionLead})`,
              `Keep the first launch disciplined around a ${profitabilityFloor.toFixed(1)}x ROAS floor.`,
            ]
          : [
              `Launch the strongest ${leadAngle.toLowerCase()} concept first with a clean control-vs-challenger setup.`,
              'Use fresh primary-text and headline variations generated from the selected creatives before broadening the batch.',
              'Watch for 1.2x+ ROAS early because this digital product can stay profitable below typical physical-product thresholds.',
            ],
    };
  }

  if (ads.length === 0 && hasWinnerCopyHistory) {
    const winnerRoasValues = [
      ...pts.map((item) => item.avgRoas).filter((value) => Number.isFinite(value)),
      ...headlines.map((item) => item.avgRoas).filter((value) => Number.isFinite(value)),
      ...descriptions.map((item) => item.avgRoas).filter((value) => Number.isFinite(value)),
    ];
    const avgWinnerRoas = winnerRoasValues.length > 0
      ? winnerRoasValues.reduce((sum, value) => sum + value, 0) / winnerRoasValues.length
      : profitabilityFloor;

    const topHeadline = headlines[0];
    const topDescription = descriptions[0];
    const topCtaEntry = (data.topCTAs || [])[0];
    const ctaTotalUsage = (data.topCTAs || []).reduce(
      (sum, item) => sum + (item.usageCount || item.adCount || 0),
      0,
    );
    const ctaTopUsage = topCtaEntry ? (topCtaEntry.usageCount || topCtaEntry.adCount || 0) : 0;
    const ctaUsagePercent = ctaTotalUsage > 0 ? (ctaTopUsage / ctaTotalUsage) * 100 : topCtaEntry ? 100 : 0;
    const ctaType = topCtaEntry?.text || 'SHOP_NOW';

    return {
      winningPatterns: bestPT
        ? [
            {
              pattern: `Winner text cluster led by "${bestPT.text.slice(0, 42)}..."`,
              avgRoas: bestPT.avgRoas,
              example: bestPT.text.slice(0, 120),
              reasoning:
                'Built from stored winner-text aggregates (primary texts/headlines/descriptions) even without ad-level winner rows.',
            },
          ]
        : [],
      bestAngle: bestPT
        ? {
            name: bestPT.text.slice(0, 50),
            avgRoas: bestPT.avgRoas,
            description: `Top winner primary text cluster at ${bestPT.avgRoas.toFixed(2)}x average ROAS.`,
          }
        : topHeadline
          ? {
              name: topHeadline.text.slice(0, 50),
              avgRoas: topHeadline.avgRoas,
              description: `Top winner headline cluster at ${topHeadline.avgRoas.toFixed(2)}x average ROAS.`,
            }
          : { name: data.productName, avgRoas: avgWinnerRoas, description: 'Winner text history is available and should be used as control.' },
      worstAngle: worstPT
        ? {
            name: worstPT.text.slice(0, 50),
            avgRoas: worstPT.avgRoas,
            description: `Lowest-performing winner-text cluster at ${worstPT.avgRoas.toFixed(2)}x average ROAS.`,
          }
        : { name: 'Secondary winner angle', avgRoas: Math.max(avgWinnerRoas * 0.85, 0), description: 'Treat secondary winner clusters as challengers against the top control.' },
      suggestedPTs: uniqueTexts(pts.slice(0, 4).map((item) => item.text), 4).map((text) => {
        const match = pts.find((item) => item.text.toLowerCase() === text.toLowerCase());
        return {
          text,
          reasoning: match
            ? `Using winner primary text history (${match.avgRoas.toFixed(2)}x avg ROAS, ${match.adCount} ad${match.adCount === 1 ? '' : 's'}).`
            : 'Using winner primary text history.',
          expectedRoas: match
            ? `${(match.avgRoas * 0.9).toFixed(2)}x - ${(match.avgRoas * 1.1).toFixed(2)}x`
            : `${Math.max(profitabilityFloor, avgWinnerRoas * 0.9).toFixed(2)}x+`,
        };
      }),
      suggestedHeadlines: uniqueTexts(headlines.slice(0, 4).map((item) => item.text), 4).map((text) => {
        const match = headlines.find((item) => item.text.toLowerCase() === text.toLowerCase());
        return {
          text,
          reasoning: match
            ? `Using winner headline history (${match.avgRoas.toFixed(2)}x avg ROAS).`
            : 'Using winner headline history.',
        };
      }),
      suggestedDescriptions: uniqueTexts(
        [
          ...descriptions.slice(0, 4).map((item) => item.text),
          topDescription ? topDescription.text : null,
          bestPT ? `Support the winning angle: ${bestPT.text.slice(0, 60)}...` : null,
        ],
        4,
      ).map((text) => {
        const match = descriptions.find((item) => item.text.toLowerCase() === text.toLowerCase());
        return {
          text,
          reasoning: match
            ? `Using winner description history (${match.avgRoas.toFixed(2)}x avg ROAS).`
            : 'Generated to support the winning primary-text angle.',
        };
      }),
      bestCTA: {
        type: ctaType,
        usagePercent: Math.round(ctaUsagePercent),
        reasoning: topCtaEntry
          ? `${ctaType} is the top CTA in winner-copy history (${Math.round(ctaUsagePercent)}% share).`
          : 'No CTA distribution available, defaulting to SHOP_NOW for digital-product tests.',
      },
      summary: `Using stored winner text history for ${data.productName} (${pts.length} primary text${pts.length === 1 ? '' : 's'}, ${headlines.length} headline${headlines.length === 1 ? '' : 's'}, ${descriptions.length} description${descriptions.length === 1 ? '' : 's'}). Top winner angle is ${bestPT ? `${bestPT.avgRoas.toFixed(2)}x` : `${avgWinnerRoas.toFixed(2)}x`} average ROAS.`,
      actionItems: [
        'Use the top winner text as control in the first lane.',
        'Add 2-3 challenger variants derived from winner headline and description clusters.',
        `Keep the profitability guardrail at ${profitabilityFloor.toFixed(1)}x+ ROAS.`,
      ],
    };
  }

  return {
    winningPatterns: topAd
      ? [
          {
            pattern: `Top performing primary text with ${topAd.roas.toFixed(2)}x ROAS`,
            avgRoas: topAd.roas,
            example: topAd.primaryText.slice(0, 100),
            reasoning:
              'This ad has the highest ROAS in your account. Consider creating variations of this primary text angle.',
          },
        ]
      : [],
    bestAngle: bestPT
      ? {
          name: bestPT.text.slice(0, 50),
          avgRoas: bestPT.avgRoas,
          description: `This primary text angle achieves ${bestPT.avgRoas.toFixed(2)}x ROAS across ${bestPT.adCount} ad(s).`,
        }
      : { name: 'N/A', avgRoas: 0, description: 'Not enough data.' },
    worstAngle: worstPT
      ? {
          name: worstPT.text.slice(0, 50),
          avgRoas: worstPT.avgRoas,
          description: `This primary text angle only achieves ${worstPT.avgRoas.toFixed(2)}x ROAS. Consider pausing or reworking.`,
        }
      : { name: 'N/A', avgRoas: 0, description: 'Not enough data.' },
    suggestedPTs: uniqueTexts(pts.slice(0, 4).map((item) => item.text), 4).map((text, index) => {
      const match = pts.find((item) => item.text.toLowerCase() === text.toLowerCase());
      return {
        text,
        reasoning: match
          ? `Grounded in winner history (${match.avgRoas.toFixed(2)}x avg ROAS across ${match.adCount} ad${match.adCount === 1 ? '' : 's'}).`
          : 'Grounded in winner-history primary text patterns.',
        expectedRoas: match
          ? `${(match.avgRoas * 0.9).toFixed(2)}x - ${(match.avgRoas * 1.1).toFixed(2)}x`
          : index === 0
            ? `${Math.max(profitabilityFloor, avgRoas * 0.9).toFixed(2)}x+`
            : `${Math.max(profitabilityFloor * 0.9, 0.8).toFixed(2)}x+`,
      };
    }),
    suggestedHeadlines: uniqueTexts(headlines.slice(0, 4).map((item) => item.text), 4).map((text) => {
      const match = headlines.find((item) => item.text.toLowerCase() === text.toLowerCase());
      return {
        text,
        reasoning: match
          ? `Derived from winning headline history (${match.avgRoas.toFixed(2)}x avg ROAS).`
          : 'Derived from winner-history headline patterns.',
      };
    }),
    suggestedDescriptions: uniqueTexts(
      [
        ...descriptions.slice(0, 4).map((item) => item.text),
        bestPT ? `Use the winning "${bestPT.text.slice(0, 50)}..." angle as support copy.` : null,
      ],
      4,
    ).map((text) => {
      const match = descriptions.find((item) => item.text.toLowerCase() === text.toLowerCase());
      return {
        text,
        reasoning: match
          ? `Taken from description winners (${match.avgRoas.toFixed(2)}x avg ROAS).`
          : 'Built from winner text angles so the body/headline pairing stays consistent.',
      };
    }),
    bestCTA: {
      type: ctaType,
      usagePercent: Math.round(ctaPercent),
      reasoning: `${ctaType} is used in ${Math.round(ctaPercent)}% of your top ads. This is your most common CTA.`,
    },
    summary: `Based on rule-based analysis of ${ads.length} ads, your average ROAS is ${avgRoas.toFixed(2)}x. ${bestPT ? `Your best-performing copy angle achieves ${bestPT.avgRoas.toFixed(2)}x ROAS.` : ''} Consider testing variations of your top performers.`,
    actionItems: [
      bestPT
        ? `Create 3 variations of your best primary text (${bestPT.avgRoas.toFixed(2)}x ROAS)`
        : 'Launch more ads to gather performance data',
      worstPT
        ? `Pause or rework your lowest-performing angle (${worstPT.avgRoas.toFixed(2)}x ROAS)`
        : 'Test different creative angles',
      'Test new headline variations with your winning primary texts',
    ],
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      storeId?: string;
      productProfileId?: string;
      refresh?: boolean;
      selectedCreativeIds?: string[];
      selectedCreatives?: Array<Record<string, unknown>>;
    };

    const { storeId, productProfileId } = body;

    if (!storeId || !productProfileId) {
      return NextResponse.json(
        { error: 'storeId and productProfileId are required' },
        { status: 400 },
      );
    }

    // Fetch winning ads data from internal API
    const baseUrl = new URL(request.url).origin;
    const cookie = request.headers.get('cookie') ?? '';

    const winningAdsRes = await fetch(
      `${baseUrl}/api/creative-hub/winning-ads?storeId=${encodeURIComponent(storeId)}&productProfileId=${encodeURIComponent(productProfileId)}`,
      { headers: { cookie } },
    );

    if (!winningAdsRes.ok) {
      const errorText = await winningAdsRes.text();
      return NextResponse.json(
        { error: `Failed to fetch winning ads: ${errorText}` },
        { status: winningAdsRes.status },
      );
    }

    const rawData = await winningAdsRes.json();

    // Map winning-ads API response to the expected WinningAdsResponse shape
    const mapRankedCopyItem = (item: Record<string, unknown>, fallbackLabel?: string) => ({
      rank: (item as { rank?: number }).rank || 0,
      text: (item as { text?: string }).text || '',
      label: (item as { label?: string }).label || fallbackLabel,
      usageCount: (item as { usageCount?: number }).usageCount || (item as { adCount?: number }).adCount || 0,
      adCount: (item as { adCount?: number }).adCount || 0,
      totalSpend: (item as { totalSpend?: number }).totalSpend || (item as { combinedSpend?: number }).combinedSpend || 0,
      totalRevenue: (item as { totalRevenue?: number }).totalRevenue || 0,
      totalPurchases: (item as { totalPurchases?: number }).totalPurchases || (item as { purchases?: number }).purchases || 0,
      totalImpressions: (item as { totalImpressions?: number }).totalImpressions || 0,
      totalClicks: (item as { totalClicks?: number }).totalClicks || 0,
      blendedScore: (item as { blendedScore?: number }).blendedScore || 0,
      metrics: (item as { metrics?: RankedWinningCopy['metrics'] }).metrics || {
        spend: (item as { totalSpend?: number }).totalSpend || (item as { combinedSpend?: number }).combinedSpend || 0,
        revenue: (item as { totalRevenue?: number }).totalRevenue || 0,
        roas: (item as { avgRoas?: number }).avgRoas || (item as { combinedRoas?: number }).combinedRoas || 0,
        ctr: (item as { avgCtr?: number }).avgCtr || 0,
        cpc: (item as { avgCpc?: number }).avgCpc || 0,
        cpm: (item as { avgCpm?: number }).avgCpm || 0,
        cpa: (item as { avgCpa?: number }).avgCpa || 0,
        purchases: (item as { totalPurchases?: number }).totalPurchases || (item as { purchases?: number }).purchases || 0,
        impressions: (item as { totalImpressions?: number }).totalImpressions || 0,
        clicks: (item as { totalClicks?: number }).totalClicks || 0,
      },
      examples: Array.isArray((item as { examples?: string[] }).examples)
        ? ((item as { examples?: string[] }).examples || []).filter((value): value is string => typeof value === 'string')
        : undefined,
    });
    const copyIntelligence = rawData.copyIntelligence || {};
    const primaryTextSource = Array.isArray(copyIntelligence.primaryTexts) && copyIntelligence.primaryTexts.length > 0
      ? copyIntelligence.primaryTexts
      : (rawData.winningPrimaryTexts || rawData.uniquePTs || []);
    const headlineSource = Array.isArray(copyIntelligence.headlines) && copyIntelligence.headlines.length > 0
      ? copyIntelligence.headlines
      : (rawData.winningHeadlines || rawData.uniqueHeadlines || []);
    const descriptionSource = Array.isArray(copyIntelligence.descriptions) && copyIntelligence.descriptions.length > 0
      ? copyIntelligence.descriptions
      : (rawData.winningDescriptions || []);
    const ctaSource = Array.isArray(copyIntelligence.ctas) && copyIntelligence.ctas.length > 0
      ? copyIntelligence.ctas
      : (rawData.winningCTAs || []);
    const winningAdsData: WinningAdsResponse = {
      ads: (rawData.winningAds || []).map((ad: Record<string, unknown>) => ({
        adId: (ad as { id?: string }).id || '',
        adName: (ad as { name?: string }).name || '',
        primaryText: ((ad as { creative?: { body?: string } }).creative?.body) || '',
        headline: ((ad as { creative?: { headline?: string } }).creative?.headline) || '',
        callToAction: ((ad as { creative?: { ctaType?: string } }).creative?.ctaType) || '',
        roas: ((ad as { metrics?: { roas?: number } }).metrics?.roas) || 0,
        cpa: ((ad as { metrics?: { cpa?: number } }).metrics?.cpa) || 0,
        cpm: ((ad as { metrics?: { cpm?: number } }).metrics?.cpm) || 0,
        ctr: ((ad as { metrics?: { ctr?: number } }).metrics?.ctr) || 0,
        spend: ((ad as { metrics?: { spend?: number } }).metrics?.spend) || 0,
        impressions: ((ad as { metrics?: { impressions?: number } }).metrics?.impressions) || 0,
        purchases: ((ad as { metrics?: { conversions?: number } }).metrics?.conversions) || 0,
      })),
      productName:
        (typeof rawData.productName === 'string' && rawData.productName.trim()) ||
        '',
      topPrimaryTexts: (primaryTextSource as Record<string, unknown>[]).map((pt: Record<string, unknown>) => ({
        text: (pt as { text?: string }).text || '',
        adCount: (pt as { adCount?: number }).adCount || 0,
        avgRoas: (pt as { avgRoas?: number }).avgRoas || (pt as { combinedRoas?: number }).combinedRoas || (pt as { metrics?: { roas?: number } }).metrics?.roas || 0,
        totalSpend: (pt as { totalSpend?: number }).totalSpend || (pt as { combinedSpend?: number }).combinedSpend || 0,
        totalPurchases: (pt as { totalPurchases?: number }).totalPurchases || (pt as { purchases?: number }).purchases || 0,
        usageCount: (pt as { usageCount?: number }).usageCount || (pt as { adCount?: number }).adCount || 0,
        totalImpressions: (pt as { totalImpressions?: number }).totalImpressions || 0,
        totalClicks: (pt as { totalClicks?: number }).totalClicks || 0,
        avgCtr: (pt as { avgCtr?: number }).avgCtr || 0,
        avgCpa: (pt as { avgCpa?: number }).avgCpa || 0,
        avgCpc: (pt as { avgCpc?: number }).avgCpc || 0,
        avgCpm: (pt as { avgCpm?: number }).avgCpm || 0,
        blendedScore: (pt as { blendedScore?: number }).blendedScore || 0,
        label: (pt as { label?: string }).label || 'Primary text',
      })),
      topHeadlines: (headlineSource as Record<string, unknown>[]).map((hl: Record<string, unknown>) => ({
        text: (hl as { text?: string }).text || '',
        adCount: (hl as { adCount?: number }).adCount || 0,
        avgRoas: (hl as { avgRoas?: number }).avgRoas || (hl as { combinedRoas?: number }).combinedRoas || 0,
        totalSpend: (hl as { totalSpend?: number }).totalSpend || (hl as { combinedSpend?: number }).combinedSpend || 0,
        totalPurchases: (hl as { totalPurchases?: number }).totalPurchases || (hl as { purchases?: number }).purchases || 0,
        usageCount: (hl as { usageCount?: number }).usageCount || (hl as { adCount?: number }).adCount || 0,
        totalImpressions: (hl as { totalImpressions?: number }).totalImpressions || 0,
        totalClicks: (hl as { totalClicks?: number }).totalClicks || 0,
        avgCtr: (hl as { avgCtr?: number }).avgCtr || 0,
        avgCpa: (hl as { avgCpa?: number }).avgCpa || 0,
        avgCpc: (hl as { avgCpc?: number }).avgCpc || 0,
        avgCpm: (hl as { avgCpm?: number }).avgCpm || 0,
        blendedScore: (hl as { blendedScore?: number }).blendedScore || 0,
        label: (hl as { label?: string }).label || 'Headline',
      })),
      topDescriptions: (descriptionSource as Record<string, unknown>[]).map((item: Record<string, unknown>) => ({
        text: (item as { text?: string }).text || '',
        adCount: (item as { adCount?: number }).adCount || 0,
        avgRoas: (item as { avgRoas?: number }).avgRoas || 0,
        totalSpend: (item as { totalSpend?: number }).totalSpend || 0,
        totalPurchases: (item as { totalPurchases?: number }).totalPurchases || 0,
        usageCount: (item as { usageCount?: number }).usageCount || 0,
        totalImpressions: (item as { totalImpressions?: number }).totalImpressions || 0,
        totalClicks: (item as { totalClicks?: number }).totalClicks || 0,
        avgCtr: (item as { avgCtr?: number }).avgCtr || 0,
        avgCpa: (item as { avgCpa?: number }).avgCpa || 0,
        avgCpc: (item as { avgCpc?: number }).avgCpc || 0,
        avgCpm: (item as { avgCpm?: number }).avgCpm || 0,
        blendedScore: (item as { blendedScore?: number }).blendedScore || 0,
        label: (item as { label?: string }).label || 'Description',
      })),
      topCTAs: (ctaSource as Record<string, unknown>[]).map((item: Record<string, unknown>) => ({
        text: (item as { text?: string }).text || '',
        adCount: (item as { adCount?: number }).adCount || 0,
        avgRoas: (item as { avgRoas?: number }).avgRoas || 0,
        totalSpend: (item as { totalSpend?: number }).totalSpend || 0,
        totalPurchases: (item as { totalPurchases?: number }).totalPurchases || 0,
        usageCount: (item as { usageCount?: number }).usageCount || 0,
        totalImpressions: (item as { totalImpressions?: number }).totalImpressions || 0,
        totalClicks: (item as { totalClicks?: number }).totalClicks || 0,
        avgCtr: (item as { avgCtr?: number }).avgCtr || 0,
        avgCpa: (item as { avgCpa?: number }).avgCpa || 0,
        avgCpc: (item as { avgCpc?: number }).avgCpc || 0,
        avgCpm: (item as { avgCpm?: number }).avgCpm || 0,
        blendedScore: (item as { blendedScore?: number }).blendedScore || 0,
        label: (item as { label?: string }).label || 'CTA',
        ctaType: (item as { ctaType?: string }).ctaType || (item as { text?: string }).text || '',
      })),
      copyIntelligence: primaryTextSource.length > 0 || headlineSource.length > 0 || descriptionSource.length > 0 || ctaSource.length > 0
        ? {
            primaryTexts: (primaryTextSource as Record<string, unknown>[]).map((item: Record<string, unknown>) => mapRankedCopyItem(item, 'Primary text')),
            headlines: (headlineSource as Record<string, unknown>[]).map((item: Record<string, unknown>) => mapRankedCopyItem(item, 'Headline')),
            descriptions: (descriptionSource as Record<string, unknown>[]).map((item: Record<string, unknown>) => mapRankedCopyItem(item, 'Description')),
            ctas: (ctaSource as Record<string, unknown>[]).map((item: Record<string, unknown>) => ({
              ...mapRankedCopyItem(item, 'CTA'),
              ctaType: (item as { ctaType?: string }).ctaType || (item as { text?: string }).text || '',
            })),
            defaultRanking: copyIntelligence.defaultRanking || 'blended_score',
          }
        : undefined,
    };
    const profile = await getProductProfile(productProfileId).catch(() => null);
    const profitabilityFloor = profile?.defaultRoasFloor ?? 1.2;
    const productName =
      winningAdsData.productName?.trim() || profile?.productName || 'Unknown Product';
    winningAdsData.productName = productName;
    const analyzedAds = Math.min(winningAdsData.ads?.length ?? 0, 20);
    const anthropic = getAnthropicConfig('claude-opus-4-6');
    const normalizedSelection = normalizeSelectedCreatives(body.selectedCreatives || []);
    const selectionPlan = buildSelectionPlan(normalizedSelection);
    const selectionContextText = formatSelectionContext(normalizedSelection, {
      profitabilityFloor,
      destinationUrl: profile?.destinationUrl,
      utmTemplate: profile?.utmTemplate,
    });
    const selectionKey = [...(body.selectedCreativeIds || [])].sort().join('|');
    const hasSelectionContext = normalizedSelection.length > 0 || selectionKey.length > 0;
    const hasWinnerCopyHistory =
      winningAdsData.topPrimaryTexts.length > 0
      || winningAdsData.topHeadlines.length > 0
      || (winningAdsData.topDescriptions?.length || 0) > 0;
    const shouldGenerateCopy =
      winningAdsData.ads.length === 0
      || winningAdsData.topPrimaryTexts.length === 0
      || winningAdsData.topHeadlines.length === 0
      || (winningAdsData.topDescriptions?.length || 0) === 0;
    let generatedCopy: GeneratedCopyDraft | null = null;

    // --- CACHING: Check Supabase for cached insights (< 24h old) ---
    const forceRefresh = body.refresh === true;
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

    if (!forceRefresh && !hasSelectionContext) {
      try {
        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (SUPABASE_URL && SUPABASE_KEY) {
      const cacheRes = await fetch(
            `${SUPABASE_URL}/rest/v1/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.ai_insights&scope_id=eq.${encodeURIComponent(productProfileId)}&variant_key=eq.latest&select=payload_json,updated_at&limit=1`,
            { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
          );
          if (cacheRes.ok) {
            const cached = await cacheRes.json();
            if (cached.length > 0) {
              const age = Date.now() - new Date(cached[0].updated_at).getTime();
              if (age < CACHE_TTL_MS) {
                const cachedData = JSON.parse(cached[0].payload_json);
                const cachedCopyPlan = cachedData?.launchDraft?.copyPlan;
                const cachedHasCopy =
                  (cachedCopyPlan?.primaryTexts?.length ?? 0) > 0 ||
                  (cachedCopyPlan?.headlines?.length ?? 0) > 0 ||
                  (cachedCopyPlan?.descriptions?.length ?? 0) > 0;
                const cachedSummary = String(cachedData?.insights?.summary || '');
                const cachedClaimsNoHistory = /no stored winning-ad history was available|no product-level winner history was available/i.test(
                  cachedSummary,
                );
                if (shouldGenerateCopy && !cachedHasCopy) {
                  console.log('[ai-insights] Skipping cached copy-empty response so Claude can regenerate draft copy');
                } else if (hasWinnerCopyHistory && cachedClaimsNoHistory) {
                  console.log('[ai-insights] Skipping stale no-history cache because winner text history now exists');
                } else {
                console.log('[ai-insights] Returning cached insights (age:', Math.round(age / 60000), 'min)');
                return NextResponse.json({ ...cachedData, cached: true, cacheAge: Math.round(age / 60000) });
                }
              }
            }
          }
        }
      } catch { /* cache miss, continue to fresh call */ }
    }

    const generatedCopyPromise = shouldGenerateCopy
      ? generateCreativeCopy({
          productName,
          selectionContext: selectionContextText,
          profitabilityFloor,
          existingWinners:
            winningAdsData.ads.length > 0
              ? winningAdsData.ads.slice(0, 10).map((ad) => ({
                  primaryText: ad.primaryText,
                  headline: ad.headline,
                  roas: ad.roas,
                  cpa: ad.cpa,
                  ctr: ad.ctr,
                }))
              : (() => {
                  const primary = winningAdsData.topPrimaryTexts.slice(0, 6);
                  const headline = winningAdsData.topHeadlines.slice(0, 6);
                  const description = (winningAdsData.topDescriptions || []).slice(0, 6);
                  const size = Math.min(6, Math.max(primary.length, headline.length, description.length));
                  const rows: Array<{
                    primaryText: string;
                    headline?: string;
                    description?: string;
                    roas?: number;
                    cpa?: number;
                    ctr?: number;
                  }> = [];
                  for (let index = 0; index < size; index += 1) {
                    const pt = primary[index] || primary[0];
                    if (!pt?.text) continue;
                    const hl = headline[index] || headline[0];
                    const ds = description[index] || description[0];
                    rows.push({
                      primaryText: pt.text,
                      headline: hl?.text,
                      description: ds?.text,
                      roas: pt.avgRoas || hl?.avgRoas || ds?.avgRoas,
                      cpa: pt.avgCpa || hl?.avgCpa || ds?.avgCpa,
                      ctr: pt.avgCtr || hl?.avgCtr || ds?.avgCtr,
                    });
                  }
                  return rows;
                })(),
          selectedPrimaryTexts: winningAdsData.topPrimaryTexts.slice(0, 5).map((item) => item.text),
          selectedHeadlines: winningAdsData.topHeadlines.slice(0, 5).map((item) => item.text),
          selectedDescriptions: (winningAdsData.topDescriptions || []).slice(0, 5).map((item) => item.text),
        })
      : Promise.resolve(null);

    let insightsFallbackReason: 'timeout' | 'error' | null = null;
    const insightsPromise =
      winningAdsData.ads.length > 0
        ? (async () => {
            try {
              console.log('[ai-insights] Calling Claude with', winningAdsData.ads.length, 'ads');
              const result = await callClaudeForInsights(
                winningAdsData,
                anthropic,
                selectionContextText,
                profitabilityFloor,
              );
              if (result) {
                console.log('[ai-insights] Claude returned insights successfully');
              }
              return result;
            } catch (err) {
              insightsFallbackReason =
                err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'error';
              console.error('[ai-insights] Claude API call failed:', err instanceof Error ? err.message : err);
              return null;
            }
          })()
        : Promise.resolve<AiInsights | null>(null);

    const [generatedCopyResult, insightResult] = await Promise.all([
      generatedCopyPromise,
      insightsPromise,
    ]);

    generatedCopy = generatedCopyResult;

    // --- FRESH CALL: Claude AI or fallback ---
    let insights: AiInsights | null = insightResult;
    let source: 'ai' | 'fallback' = 'fallback';
    let model = anthropic?.model || 'claude-opus-4-6';

    if (insights) {
      source = 'ai';
    }

    if (!insights) {
      insights = buildFallbackInsights(
        winningAdsData,
        normalizedSelection,
        profitabilityFloor,
        generatedCopy,
      );
      if (generatedCopy?.source === 'ai') {
        source = 'ai';
        model = anthropic?.model || 'claude-opus-4-6';
      } else {
        source = 'fallback';
        model = 'rule-based';
      }
    }

    insights = enforceSuggestionDiversity(
      insights,
      winningAdsData,
      generatedCopy,
      profitabilityFloor,
    );

    insights = mergeSelectionPlanIntoInsights(insights, selectionPlan, analyzedAds);

    const responseMode =
      source === 'fallback' && insightsFallbackReason === 'timeout'
        ? analyzedAds > 0
          ? 'meta-fallback-after-timeout'
          : 'creative-fallback-after-timeout'
        : source === 'fallback' && insightsFallbackReason === 'error'
          ? analyzedAds > 0
            ? 'meta-fallback-after-error'
            : 'creative-fallback-after-error'
          : analyzedAds > 0
            ? hasSelectionContext
              ? 'history-plus-selection'
              : 'product-history'
            : hasSelectionContext
              ? 'selection-only'
              : 'history-fallback';

    const responseData = {
      insights,
      selectionPlan: selectionPlan || undefined,
      launchDraft: buildLaunchDraft(
        winningAdsData,
        insights,
        selectionPlan,
        profitabilityFloor,
        generatedCopy,
      ),
      source,
      model,
      analyzedAds,
      productName,
      meta: {
        apiKeySource: anthropic?.apiKeySource || 'fallback',
        modelSource: anthropic?.modelSource || 'default',
        mode: responseMode,
        selectionAware: hasSelectionContext,
        selectionKey,
        fallbackReason: source === 'fallback' ? insightsFallbackReason || undefined : undefined,
      },
    };

    // --- SAVE TO CACHE ---
    try {
      const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (SUPABASE_URL && SUPABASE_KEY && source === 'ai' && !hasSelectionContext) {
        await fetch(
          `${SUPABASE_URL}/rest/v1/meta_endpoint_snapshots?on_conflict=store_id,endpoint,scope_id,variant_key`,
          {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              store_id: storeId,
              endpoint: 'ai_insights',
              scope_id: productProfileId,
              variant_key: 'latest',
              row_count: analyzedAds,
              payload_json: JSON.stringify(responseData),
              updated_at: new Date().toISOString(),
            }),
          }
        );
        console.log('[ai-insights] Cached to Supabase');
      }
    } catch { /* cache write failed, non-critical */ }

    return NextResponse.json(responseData);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate AI insights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
