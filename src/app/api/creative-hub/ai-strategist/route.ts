import { NextRequest, NextResponse } from 'next/server';
import { getCreativeTests, getProductProfile, getProductCampaignLinks } from '@/app/api/lib/creative-hub-db';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { isAccountOnlyCampaignLink } from '@/lib/creative-hub/account-links';
import type { CreativeTest } from '@/types/creativeHub';

export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategistRequestBody {
  storeId: string;
  productProfileId: string;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  selectedCreativeIds?: string[];
  context?: {
    creatives?: Array<Record<string, unknown>>;
    selectedCreatives?: Array<Record<string, unknown>>;
    winningAds?: Array<Record<string, unknown>>;
  };
}

interface AnthropicConfig {
  apiKey: string;
  apiKeySource: string;
  model: string;
  modelSource: string;
}

interface CreativeSignal {
  id: string;
  creativeName: string;
  creativeFormat: string;
  hook: string | null;
  angle: string | null;
  uploadStatus: string | null;
  testStatus: string | null;
  roas: number | null;
  spend: number | null;
  purchases: number | null;
  createdAt: string | null;
  campaignName: string | null;
  driveUrl: string | null;
  thumbnailUrl: string | null;
}

interface CreativeContextSummary {
  totalTests: number;
  totalItems: number;
  winnerCount: number;
  testedCount: number;
  selectedCount: number;
  formatCounts: Record<string, number>;
  topHooks: Array<{ value: string; count: number; avgRoas: number }>;
  topAngles: Array<{ value: string; count: number; avgRoas: number }>;
  recentSignals: CreativeSignal[];
  selectedSignals: CreativeSignal[];
}

interface SelectedCreativePlan {
  selectedCount: number;
  testedCount: number;
  winnerCount: number;
  untestedCount: number;
  uniqueAngles: number;
  uniqueHooks: number;
  uniqueCreators: number;
  uniqueFolders: number;
  uniqueFormats: number;
  recommendedStrategy: 'smart_mix' | 'one_per_adset' | 'by_format' | 'by_folder';
  recommendedSize: number;
  title: string;
  reason: string;
  strengths: string[];
  cautions: string[];
  nextMoves: string[];
}

// Claude API types
interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage: { input_tokens: number; output_tokens: number };
}

// Meta API response shapes (loosely typed for flexibility)
interface MetaInsightsRow {
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  purchase_roas?: Array<{ action_type: string; value: string }>;
  date_start?: string;
  date_stop?: string;
  // breakdown fields
  age?: string;
  gender?: string;
  publisher_platform?: string;
}

interface MetaInsightsResponse {
  data: MetaInsightsRow[];
}

interface MetaAdNode {
  id: string;
  name: string;
  creative?: {
    id: string;
    thumbnail_url?: string;
    body?: string;
    title?: string;
    link_description?: string;
    call_to_action_type?: string;
    object_story_spec?: Record<string, unknown>;
  };
  insights?: { data: MetaInsightsRow[] };
}

interface MetaAdsResponse {
  data: MetaAdNode[];
  paging?: { next?: string };
}

const ANTHROPIC_API_KEY_ALIASES = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'ANTHROPIC_CLOUD_API_KEY',
];

const ANTHROPIC_MODEL_ALIASES = [
  'ANTHROPIC_STRATEGY_MODEL',
  'ANTHROPIC_CREATIVE_MODEL',
  'ANTHROPIC_MODEL',
];

// ---------------------------------------------------------------------------
// Tool definitions for Claude
// ---------------------------------------------------------------------------

const TOOLS: ClaudeTool[] = [
  {
    name: 'get_campaign_insights',
    description:
      'Get performance metrics for campaigns linked to this product over the last N days. Returns spend, impressions, clicks, purchases, ROAS, CPP per campaign.',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days to look back (default 30, max 90)',
          default: 30,
        },
      },
      required: [],
    },
  },
  {
    name: 'get_ad_performance',
    description:
      'Get performance of individual ads in linked campaigns, sorted by ROAS. Shows which specific ads are performing best.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: {
          type: 'string',
          description:
            'Specific campaign ID to pull ads from. If omitted, pulls from all linked campaigns.',
        },
        limit: {
          type: 'number',
          description: 'Max number of ads to return (default 20)',
          default: 20,
        },
      },
      required: [],
    },
  },
  {
    name: 'get_creative_details',
    description:
      'Get creative details including headline, body text, CTA, and media type for specific ads.',
    input_schema: {
      type: 'object',
      properties: {
        ad_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of ad IDs to get creative details for',
        },
      },
      required: ['ad_ids'],
    },
  },
  {
    name: 'get_audience_breakdown',
    description:
      'Get performance breakdown by age, gender, or placement for a campaign.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: {
          type: 'string',
          description: 'Campaign ID to analyze',
        },
        breakdown: {
          type: 'string',
          enum: ['age', 'gender', 'publisher_platform'],
          description: 'Dimension to break down by',
        },
      },
      required: ['campaign_id', 'breakdown'],
    },
  },
];

// ---------------------------------------------------------------------------
// Helper: build date range string for Meta API
// ---------------------------------------------------------------------------

function buildTimeRange(days: number): string {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days);
  return JSON.stringify({
    since: since.toISOString().split('T')[0],
    until: until.toISOString().split('T')[0],
  });
}

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

function truncateText(value: string, maxLength = 120): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function shortNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function buildSelectedCreativePlan(
  selectedCreatives: Array<Record<string, unknown>> = [],
): SelectedCreativePlan | null {
  if (selectedCreatives.length === 0) return null;

  const readString = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  const winnerCount = selectedCreatives.filter(
    (creative) =>
      typeof creative.pastTestResult === 'object' &&
      creative.pastTestResult !== null &&
      readString((creative.pastTestResult as { status?: unknown }).status) === 'winner',
  ).length;
  const testedCount = selectedCreatives.filter(
    (creative) =>
      Boolean(creative.alreadyTested) ||
      (typeof creative.pastTestResult === 'object' && creative.pastTestResult !== null),
  ).length;
  const untestedCount = Math.max(selectedCreatives.length - testedCount, 0);
  const uniqueFormats = new Set(
    selectedCreatives.map((creative) => readString(creative.creativeFormat) || 'image'),
  ).size;
  const uniqueHooks = new Set(selectedCreatives.map((creative) => readString(creative.hook)).filter(Boolean)).size;
  const uniqueAngles = new Set(selectedCreatives.map((creative) => readString(creative.angle)).filter(Boolean)).size;
  const uniqueCreators = new Set(selectedCreatives.map((creative) => readString(creative.creator)).filter(Boolean)).size;
  const uniqueFolders = new Set(
    selectedCreatives.map((creative) => readString(creative.driveParentFolderName)).filter(Boolean),
  ).size;

  let recommendedStrategy: SelectedCreativePlan['recommendedStrategy'] = 'smart_mix';
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
    reason = 'Separate videos and statics before you judge hook quality so format does not hide the message signal.';
  } else if (uniqueFolders > 1 && selectedCreatives.length >= 4) {
    recommendedStrategy = 'by_folder';
    recommendedSize = Math.min(Math.max(selectedCreatives.length, 2), 3);
    title = 'Concept cluster test';
    reason = 'The selection spans multiple folders or concepts, so keep each cluster intact for the cleanest read.';
  }

  const strengths: string[] = [];
  const cautions: string[] = [];
  if (winnerCount > 0) {
    strengths.push(`${winnerCount} proven winner${winnerCount > 1 ? 's' : ''} can act as a control.`);
  }
  if (untestedCount > 0) {
    strengths.push(`${untestedCount} untested creative${untestedCount > 1 ? 's are' : ' is'} ready for a fresh read.`);
  }
  if (uniqueHooks > 1 || uniqueAngles > 1) {
    strengths.push('The set has enough hook or angle diversity for a meaningful comparison.');
  }
  if (uniqueAngles <= 1 && selectedCreatives.length > 2) {
    cautions.push('Most selected assets share the same angle, so learnings may cluster too tightly.');
  }
  if (uniqueFormats === 1 && selectedCreatives.length > 3) {
    cautions.push('Everything is the same format right now, so this batch mostly answers message questions.');
  }
  if (selectedCreatives.length > 8) {
    cautions.push('This is a wide set, so control lane count carefully or budget gets diluted.');
  }

  const nextMoves = [
    recommendedStrategy === 'one_per_adset'
      ? 'Start with one creative per ad set for the first read.'
      : `Apply a ${recommendedStrategy.replaceAll('_', ' ')} structure before launch.`,
    winnerCount > 0
      ? 'Keep the winner isolated as control and challenge it with one new variable at a time.'
      : 'Choose one clear control creative before mixing several new ideas together.',
    uniqueHooks > 1
      ? 'Use the hook spread to make each lane answer one obvious question.'
      : 'Add at least one hook challenger before spending heavily on this set.',
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

function buildCreativeContextSummary(
  tests: CreativeTest[],
  selectedCreativeIds: string[] = [],
): CreativeContextSummary {
  const formatCounts: Record<string, number> = {};
  const hookMap = new Map<string, { count: number; roasTotal: number; roasCount: number }>();
  const angleMap = new Map<string, { count: number; roasTotal: number; roasCount: number }>();
  const allSignals: CreativeSignal[] = [];
  const selectedIdSet = new Set(selectedCreativeIds);

  let winnerCount = 0;
  let testedCount = 0;

  for (const test of tests) {
    for (const item of test.items) {
      const format = item.creativeFormat || 'unknown';
      formatCounts[format] = (formatCounts[format] || 0) + 1;

      const hook = item.hook?.trim() || null;
      if (hook) {
        const existing = hookMap.get(hook) || { count: 0, roasTotal: 0, roasCount: 0 };
        existing.count += 1;
        if (typeof item.roas === 'number' && item.roas > 0) {
          existing.roasTotal += item.roas;
          existing.roasCount += 1;
        }
        hookMap.set(hook, existing);
      }

      const angle = item.angle?.trim() || null;
      if (angle) {
        const existing = angleMap.get(angle) || { count: 0, roasTotal: 0, roasCount: 0 };
        existing.count += 1;
        if (typeof item.roas === 'number' && item.roas > 0) {
          existing.roasTotal += item.roas;
          existing.roasCount += 1;
        }
        angleMap.set(angle, existing);
      }

      if (item.testStatus && item.testStatus !== 'testing') {
        testedCount += 1;
      }
      if (item.testStatus === 'winner') {
        winnerCount += 1;
      }

      allSignals.push({
        id: item.id,
        creativeName: item.creativeName,
        creativeFormat: item.creativeFormat || 'unknown',
        hook,
        angle,
        uploadStatus: item.uploadStatus || null,
        testStatus: item.testStatus || null,
        roas: typeof item.roas === 'number' ? item.roas : null,
        spend: typeof item.spend === 'number' ? item.spend : null,
        purchases: typeof item.purchases === 'number' ? item.purchases : null,
        createdAt: test.launchedAt || test.completedAt || null,
        campaignName: test.campaignName || null,
        driveUrl: item.driveUrl || null,
        thumbnailUrl: item.thumbnailUrl || null,
      });
    }
  }

  const buildTopSignals = (
    map: Map<string, { count: number; roasTotal: number; roasCount: number }>,
  ) => Array.from(map.entries())
    .map(([value, data]) => ({
      value,
      count: data.count,
      avgRoas: data.roasCount > 0 ? data.roasTotal / data.roasCount : 0,
    }))
    .sort((a, b) => b.count - a.count || b.avgRoas - a.avgRoas)
    .slice(0, 5);

  const recentSignals = [...allSignals]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 12);

  const selectedSignals = selectedCreativeIds.length > 0
    ? allSignals.filter((signal) => selectedIdSet.has(signal.id))
    : [];

  return {
    totalTests: tests.length,
    totalItems: allSignals.length,
    winnerCount,
    testedCount,
    selectedCount: selectedSignals.length,
    formatCounts,
    topHooks: buildTopSignals(hookMap),
    topAngles: buildTopSignals(angleMap),
    recentSignals,
    selectedSignals,
  };
}

function formatCreativeContext(summary: CreativeContextSummary): string {
  const formatLine = Object.entries(summary.formatCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([format, count]) => `${format}: ${count}`)
    .join(', ');

  const formatTopSignals = (items: Array<{ value: string; count: number; avgRoas: number }>) =>
    items.length > 0
      ? items.map((item) => `- ${truncateText(item.value, 100)} (${item.count}x, avg ROAS ${shortNumber(item.avgRoas)}x)`).join('\n')
      : '- None yet';

  const recentLines = summary.recentSignals.length > 0
    ? summary.recentSignals.map((signal) => {
      const parts = [
        signal.creativeName,
        signal.creativeFormat,
        signal.testStatus || 'testing',
        signal.hook ? `hook: ${truncateText(signal.hook, 70)}` : null,
        signal.angle ? `angle: ${truncateText(signal.angle, 70)}` : null,
        signal.roas != null ? `ROAS: ${shortNumber(signal.roas)}x` : null,
        signal.spend != null ? `spend: $${shortNumber(signal.spend)}` : null,
        signal.campaignName ? `campaign: ${truncateText(signal.campaignName, 50)}` : null,
      ].filter(Boolean).join(' | ');
      return `- ${parts}`;
    }).join('\n')
    : '- No creative history available yet';

  const selectedLines = summary.selectedSignals.length > 0
    ? summary.selectedSignals.map((signal) => `- ${signal.creativeName} (${signal.creativeFormat}${signal.roas != null ? `, ${shortNumber(signal.roas)}x ROAS` : ''})`).join('\n')
    : '- No selected creative IDs provided';

  return [
    `- Total tests: ${summary.totalTests}`,
    `- Total creatives tracked: ${summary.totalItems}`,
    `- Winners: ${summary.winnerCount}`,
    `- Tested creatives: ${summary.testedCount}`,
    `- Selected creatives: ${summary.selectedCount}`,
    `- Format mix: ${formatLine || 'none'}`,
    `- Top hooks:\n${formatTopSignals(summary.topHooks)}`,
    `- Top angles:\n${formatTopSignals(summary.topAngles)}`,
    `- Selected creatives list:\n${selectedLines}`,
    `- Recent creatives:\n${recentLines}`,
  ].join('\n');
}

function buildFallbackStrategistResponse(
  profileName: string,
  campaignLinks: Array<{ campaignName?: string | null; campaignType?: string | null; isActive: boolean }>,
  summary: CreativeContextSummary,
  selectedPlan: SelectedCreativePlan | null,
): { response: string; actionItems: string[] } {
  const topHook = summary.topHooks[0];
  const topAngle = summary.topAngles[0];
  const activeCampaigns = campaignLinks.filter((link) => link.isActive);
  const formatMix = Object.entries(summary.formatCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([format, count]) => `${format} (${count})`)
    .slice(0, 3)
    .join(', ') || 'No formats tracked yet';

  const selectionActionItems = selectedPlan?.nextMoves || [];
  const actionItems = [
    ...selectionActionItems,
    topHook
      ? `Build 3 variations around "${truncateText(topHook.value, 70)}" and keep the format constant for the first test.`
      : 'Start with one clean winner-vs-challenger test using the strongest asset you have.',
    topAngle
      ? `Run a second batch that keeps the angle "${truncateText(topAngle.value, 70)}" but changes the first frame or hook.`
      : 'Create a batch that changes only the hook while keeping offer and format fixed.',
    summary.recentSignals.length > 0
      ? `Keep the top ${Math.min(3, summary.recentSignals.length)} recent creatives in a winner stack and do not mix them with brand-new angles.`
      : 'Do not mix multiple new variables in the same test until you have a reliable baseline.',
  ]
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((candidate) => candidate === item) === index)
    .slice(0, 5);

  const responseLines = [
    `I reviewed the creative history for ${profileName}.`,
    selectedPlan
      ? `For the ${selectedPlan.selectedCount} creatives you selected right now, I would run a ${selectedPlan.recommendedStrategy.replaceAll('_', ' ')} setup. ${selectedPlan.reason}`
      : null,
    `You have ${summary.totalItems} creatives across ${summary.totalTests} test runs. The mix is currently ${formatMix}.`,
    topHook
      ? `The most repeated hook is "${truncateText(topHook.value, 100)}" with ${topHook.count} instance(s) and an average ROAS of ${shortNumber(topHook.avgRoas)}x.`
      : 'There is not enough hook history yet to call a clear winner.',
    topAngle
      ? `The most repeated angle is "${truncateText(topAngle.value, 100)}" with ${topAngle.count} instance(s) and an average ROAS of ${shortNumber(topAngle.avgRoas)}x.`
      : 'There is not enough angle history yet to call a clear winner.',
    activeCampaigns.length > 0
      ? `There are ${activeCampaigns.length} active linked campaign(s), so I would keep testing winners against a single new variable at a time.`
      : 'There are no active linked campaigns available, so I would bias toward creative-first testing and avoid overcomplicating the batch structure.',
    '',
    'Action Items:',
    ...actionItems,
  ].filter((line): line is string => Boolean(line));

  return {
    response: responseLines.join('\n'),
    actionItems,
  };
}

function formatSelectedCreativeContext(selectedCreatives: Array<Record<string, unknown>> = []): string {
  if (selectedCreatives.length === 0) {
    return '- No current browser selection provided';
  }

  return selectedCreatives
    .slice(0, 12)
    .map((creative, index) => {
      const bits = [
        typeof creative.creativeName === 'string' ? creative.creativeName : `Creative ${index + 1}`,
        typeof creative.creativeFormat === 'string' ? creative.creativeFormat : null,
        typeof creative.hook === 'string' && creative.hook.trim() ? `hook: ${truncateText(creative.hook, 70)}` : null,
        typeof creative.angle === 'string' && creative.angle.trim() ? `angle: ${truncateText(creative.angle, 70)}` : null,
        typeof creative.creator === 'string' && creative.creator.trim() ? `creator: ${creative.creator}` : null,
        typeof creative.driveParentFolderName === 'string' && creative.driveParentFolderName.trim()
          ? `folder: ${truncateText(creative.driveParentFolderName, 50)}`
          : null,
        typeof creative.sourceType === 'string' ? `source: ${creative.sourceType}` : null,
      ].filter(Boolean);
      return `- ${bits.join(' | ')}`;
    })
    .join('\n');
}

function formatSelectedCreativePlan(selectedPlan: SelectedCreativePlan | null): string {
  if (!selectedPlan) {
    return '- No current browser selection provided';
  }

  return [
    `- Selected creatives: ${selectedPlan.selectedCount}`,
    `- Recommended first structure: ${selectedPlan.recommendedStrategy.replaceAll('_', ' ')} (${selectedPlan.recommendedSize} per set when relevant)`,
    `- Reason: ${selectedPlan.reason}`,
    `- Hook diversity: ${selectedPlan.uniqueHooks}`,
    `- Angle diversity: ${selectedPlan.uniqueAngles}`,
    `- Format diversity: ${selectedPlan.uniqueFormats}`,
    `- Winner controls available: ${selectedPlan.winnerCount}`,
    `- Untested creatives: ${selectedPlan.untestedCount}`,
    `- Strengths:\n${selectedPlan.strengths.length > 0 ? selectedPlan.strengths.map((item) => `  - ${item}`).join('\n') : '  - None called out yet'}`,
    `- Cautions:\n${selectedPlan.cautions.length > 0 ? selectedPlan.cautions.map((item) => `  - ${item}`).join('\n') : '  - None called out yet'}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  accessToken: string | null,
  campaignLinks: Array<{ campaignId: string; campaignName?: string | null; adAccountId: string }>,
): Promise<string> {
  try {
    if (!accessToken) {
      return JSON.stringify({ error: 'Meta access token unavailable for tool execution' });
    }
    switch (toolName) {
      case 'get_campaign_insights':
        return await toolGetCampaignInsights(
          accessToken,
          campaignLinks,
          (input.days as number) || 30,
        );
      case 'get_ad_performance':
        return await toolGetAdPerformance(
          accessToken,
          campaignLinks,
          input.campaign_id as string | undefined,
          (input.limit as number) || 20,
        );
      case 'get_creative_details':
        return await toolGetCreativeDetails(
          accessToken,
          input.ad_ids as string[],
        );
      case 'get_audience_breakdown':
        return await toolGetAudienceBreakdown(
          accessToken,
          input.campaign_id as string,
          input.breakdown as 'age' | 'gender' | 'publisher_platform',
        );
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[AI Strategist] Tool ${toolName} error:`, message);
    return JSON.stringify({ error: message });
  }
}

// Helper to extract action values
function getActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  actionType: string,
): number {
  if (!actions) return 0;
  const action = actions.find((a) => a.action_type === actionType);
  return action ? parseFloat(action.value) : 0;
}

// Tool 1: Campaign insights
async function toolGetCampaignInsights(
  token: string,
  campaignLinks: Array<{ campaignId: string; campaignName?: string | null }>,
  days: number,
): Promise<string> {
  const clampedDays = Math.min(Math.max(days, 1), 90);
  const timeRange = buildTimeRange(clampedDays);
  const results: Record<string, unknown>[] = [];

  for (const link of campaignLinks) {
    try {
      const data = await fetchFromMeta<MetaInsightsResponse>(
        token,
        `/${link.campaignId}/insights`,
        {
          fields:
            'spend,impressions,clicks,actions,cost_per_action_type,purchase_roas',
          time_range: timeRange,
        },
        10000,
        1,
      );
      const row = data.data?.[0];
      if (row) {
        results.push({
          campaignId: link.campaignId,
          campaignName: link.campaignName,
          spend: parseFloat(row.spend || '0'),
          impressions: parseInt(row.impressions || '0', 10),
          clicks: parseInt(row.clicks || '0', 10),
          purchases: getActionValue(row.actions, 'purchase'),
          costPerPurchase: getActionValue(
            row.cost_per_action_type,
            'purchase',
          ),
          roas: getActionValue(row.purchase_roas, 'omni_purchase'),
          dateRange: `last ${clampedDays} days`,
        });
      } else {
        results.push({
          campaignId: link.campaignId,
          campaignName: link.campaignName,
          note: 'No data for this period',
        });
      }
    } catch (err) {
      results.push({
        campaignId: link.campaignId,
        campaignName: link.campaignName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return JSON.stringify(results, null, 2);
}

// Tool 2: Ad performance
async function toolGetAdPerformance(
  token: string,
  campaignLinks: Array<{ campaignId: string; campaignName?: string | null }>,
  campaignId: string | undefined,
  limit: number,
): Promise<string> {
  const targetCampaigns = campaignId
    ? campaignLinks.filter((l) => l.campaignId === campaignId)
    : campaignLinks;

  if (targetCampaigns.length === 0) {
    return JSON.stringify({ error: 'No matching campaigns found' });
  }

  const allAds: Record<string, unknown>[] = [];

  for (const link of targetCampaigns) {
    try {
      const data = await fetchFromMeta<MetaAdsResponse>(
        token,
        `/${link.campaignId}/ads`,
        {
          fields:
            'id,name,creative{id,thumbnail_url},insights.date_preset(last_30d){spend,impressions,clicks,actions,purchase_roas,ctr,cpm}',
          limit: '50',
        },
        10000,
        1,
      );

      for (const ad of data.data || []) {
        const insights = ad.insights?.data?.[0];
        const roas = insights
          ? getActionValue(insights.purchase_roas, 'omni_purchase')
          : 0;
        const purchases = insights
          ? getActionValue(insights.actions, 'purchase')
          : 0;

        allAds.push({
          adId: ad.id,
          adName: ad.name,
          campaignName: link.campaignName,
          thumbnailUrl: ad.creative?.thumbnail_url,
          spend: parseFloat(insights?.spend || '0'),
          impressions: parseInt(insights?.impressions || '0', 10),
          clicks: parseInt(insights?.clicks || '0', 10),
          ctr: parseFloat(insights?.ctr || '0'),
          cpm: parseFloat(insights?.cpm || '0'),
          purchases,
          roas,
        });
      }
    } catch (err) {
      allAds.push({
        campaignName: link.campaignName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Sort by ROAS descending
  allAds.sort(
    (a, b) => ((b.roas as number) || 0) - ((a.roas as number) || 0),
  );

  return JSON.stringify(allAds.slice(0, Math.min(limit, 50)), null, 2);
}

// Tool 3: Creative details
async function toolGetCreativeDetails(
  token: string,
  adIds: string[],
): Promise<string> {
  const clamped = adIds.slice(0, 20); // Cap at 20 to avoid too many calls
  const results: Record<string, unknown>[] = [];

  for (const adId of clamped) {
    try {
      const data = await fetchFromMeta<MetaAdNode>(
        token,
        `/${adId}`,
        {
          fields:
            'id,name,creative{id,body,title,link_description,call_to_action_type,object_story_spec}',
        },
        10000,
        1,
      );
      results.push({
        adId: data.id,
        adName: data.name,
        body: data.creative?.body,
        title: data.creative?.title,
        linkDescription: data.creative?.link_description,
        callToAction: data.creative?.call_to_action_type,
        hasVideo: !!(data.creative?.object_story_spec as Record<string, unknown> | undefined)?.video_data,
        hasImage:
          !!(
            (data.creative?.object_story_spec as Record<string, unknown> | undefined)?.link_data ||
            (data.creative?.object_story_spec as Record<string, unknown> | undefined)?.photo_data
          ),
      });
    } catch (err) {
      results.push({
        adId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return JSON.stringify(results, null, 2);
}

// Tool 4: Audience breakdown
async function toolGetAudienceBreakdown(
  token: string,
  campaignId: string,
  breakdown: 'age' | 'gender' | 'publisher_platform',
): Promise<string> {
  try {
    const data = await fetchFromMeta<MetaInsightsResponse>(
      token,
      `/${campaignId}/insights`,
      {
        fields: 'spend,impressions,actions,purchase_roas',
        breakdowns: breakdown,
        time_range: buildTimeRange(30),
      },
      10000,
      1,
    );

    const rows = (data.data || []).map((row) => ({
      [breakdown]: row[breakdown] || 'unknown',
      spend: parseFloat(row.spend || '0'),
      impressions: parseInt(row.impressions || '0', 10),
      purchases: getActionValue(row.actions, 'purchase'),
      roas: getActionValue(row.purchase_roas, 'omni_purchase'),
    }));

    return JSON.stringify(rows, null, 2);
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Claude API caller with tool loop
// ---------------------------------------------------------------------------

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOOL_ITERATIONS = 5;

class ClaudeApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ClaudeApiError';
    this.status = status;
  }
}

async function callClaudeWithTools(
  anthropic: AnthropicConfig,
  systemPrompt: string,
  messages: ClaudeMessage[],
  tools: ClaudeTool[],
  accessToken: string | null,
  campaignLinks: Array<{ campaignId: string; campaignName?: string | null; adAccountId: string }>,
  abortSignal: AbortSignal,
): Promise<{ text: string; toolCalls: number }> {
  const { apiKey, model } = anthropic;
  const currentMessages = [...messages];
  let totalToolCalls = 0;

  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY, CLAUDE_API_KEY, or ANTHROPIC_CLOUD_API_KEY.');
  }

  if (tools.length === 0) {
    const body = {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: currentMessages,
    };

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new ClaudeApiError(res.status, `Claude API error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const response: ClaudeResponse = await res.json();
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const finalText = textBlocks.map((b) => b.text || '').join('\n').trim();
    return { text: finalText, toolCalls: 0 };
  }

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const body = {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages: currentMessages,
    };

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: abortSignal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new ClaudeApiError(res.status, `Claude API error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const response: ClaudeResponse = await res.json();

    // Extract tool_use blocks
    const toolUseBlocks = response.content.filter(
      (b): b is ClaudeContentBlock & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use',
    );

    // If no tool calls, extract final text and return
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter((b) => b.type === 'text');
      const finalText = textBlocks.map((b) => b.text || '').join('\n');
      return { text: finalText, toolCalls: totalToolCalls };
    }

    // Process tool calls
    totalToolCalls += toolUseBlocks.length;

    // Add assistant message with tool_use blocks
    currentMessages.push({
      role: 'assistant',
      content: response.content,
    });

    // Execute tools and build tool_result blocks
    const toolResults: ClaudeContentBlock[] = [];
    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(
        toolUse.name,
        toolUse.input,
        accessToken,
        campaignLinks,
      );
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    // Add tool results as user message
    currentMessages.push({
      role: 'user',
      content: toolResults,
    });
  }

  // If we hit max iterations, get final response without tools
  const finalBody = {
    model,
    max_tokens: 4096,
    system:
      systemPrompt +
      '\n\nYou have reached the maximum number of tool calls. Summarize your findings with the data you have.',
    messages: currentMessages,
  };

  const finalRes = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(finalBody),
    signal: abortSignal,
  });

  if (!finalRes.ok) {
    const errText = await finalRes.text().catch(() => '');
    throw new ClaudeApiError(
      finalRes.status,
      `Claude API final call error ${finalRes.status}: ${errText.slice(0, 300)}`,
    );
  }

  const finalResponse: ClaudeResponse = await finalRes.json();
  const text = finalResponse.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n');

  return { text, toolCalls: totalToolCalls };
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const abortController = new AbortController();
  const globalTimeout = setTimeout(() => abortController.abort(), 110_000);

  try {
    const body = (await request.json()) as StrategistRequestBody;
    const { storeId, productProfileId, message, history, selectedCreativeIds, context } = body;

    if (!storeId || !productProfileId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: storeId, productProfileId, message' },
        { status: 400 },
      );
    }

    const anthropic = getAnthropicConfig('claude-sonnet-4-20250514');
    const metaToken = await getMetaToken(storeId);

    // 1. Get product profile, campaign links, and creative history
    const [profile, rawCampaignLinks, tests] = await Promise.all([
      getProductProfile(productProfileId),
      getProductCampaignLinks(productProfileId),
      getCreativeTests(storeId),
    ]);
    const campaignLinks = rawCampaignLinks.filter((link) => !isAccountOnlyCampaignLink(link));

    if (!profile) {
      return NextResponse.json(
        { error: 'Product profile not found' },
        { status: 404 },
      );
    }

    const productTests = tests.filter((test) => test.productProfileId === productProfileId);
    const creativeSummary = buildCreativeContextSummary(
      productTests,
      selectedCreativeIds || [],
    );
    const selectedPlan = buildSelectedCreativePlan(context?.selectedCreatives || []);
    const creativeContextText = formatCreativeContext(creativeSummary);
    const selectedCreativeContextText = formatSelectedCreativeContext(context?.selectedCreatives || []);
    const selectedPlanText = formatSelectedCreativePlan(selectedPlan);
    const campaignContextText = campaignLinks.length > 0
      ? campaignLinks
          .map((link) => `- ${link.campaignName || link.campaignId} (${link.campaignType}, ${link.isActive ? 'active' : 'paused'})`)
          .join('\n')
      : '- No linked campaigns yet';
    const canUseMetaTools = Boolean(metaToken?.accessToken && campaignLinks.length > 0);

    if (!anthropic) {
      const fallback = buildFallbackStrategistResponse(
        profile.productName,
        campaignLinks,
        creativeSummary,
        selectedPlan,
      );
      return NextResponse.json({
        response: fallback.response,
        actionItems: fallback.actionItems,
        meta: {
          toolCalls: 0,
          mode: canUseMetaTools ? 'meta-disabled-fallback' : 'creative-fallback',
          campaignCount: campaignLinks.length,
          creativeCount: creativeSummary.totalItems,
          apiKeySource: 'fallback',
          model: 'rule-based',
          selectionAware: Boolean(selectedPlan),
        },
      });
    }

    const systemPrompt = `You are a senior media buyer and creative strategist with 10+ years of experience managing $100M+ in annual ad spend.
You think like a performance marketer reviewing creative inventory, test structure, and account health.

When the user asks about performance, creative strategy, or what to test next:
1. Use real campaign tools when available.
2. If campaign tools are unavailable, use the creative inventory and product context below.
3. Analyze the actual numbers and historical patterns whenever present.
4. Give specific, actionable recommendations based on the data.
5. Think in terms of media-buyer decisions: hook, angle, format, offer, first frame, testing order, and batch structure.

Product: ${profile.productName}
Linked campaigns:
${campaignContextText}

Creative inventory:
${creativeContextText}

Current browser selection:
${selectedCreativeContextText}

Selected-set planning brief:
${selectedPlanText}

If there is no Meta access or no linked campaign data, be honest about that limitation and focus your answer on creative testing strategy and next steps. Never invent performance numbers.

Format your response as clear, readable text. Use bullet points and bold where helpful. At the end of your response, include a section called "Action Items:" with 2-5 specific next steps the advertiser should take.`;

    // 2. Build messages array
    const messages: ClaudeMessage[] = [];

    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: message });

    // 3. Call Claude with tool loop when Meta access is available
    const simplifiedLinks = campaignLinks.map((l) => ({
      campaignId: l.campaignId,
      campaignName: l.campaignName,
      adAccountId: l.adAccountId,
    }));

    const fallback = buildFallbackStrategistResponse(
      profile.productName,
      campaignLinks,
      creativeSummary,
      selectedPlan,
    );
    let text = '';
    let toolCalls = 0;

    try {
      const result = await callClaudeWithTools(
        anthropic,
        systemPrompt,
        messages,
        canUseMetaTools ? TOOLS : [],
        metaToken?.accessToken || null,
        simplifiedLinks,
        abortController.signal,
      );
      text = result.text;
      toolCalls = result.toolCalls;
    } catch (err) {
      if (
        err instanceof ClaudeApiError &&
        (err.status === 429 || err.status === 529 || err.status >= 500)
      ) {
        return NextResponse.json({
          response: [
            'Claude is temporarily overloaded, so I switched to the built-in media-buyer planner for this selection.',
            '',
            fallback.response,
          ].join('\n'),
          actionItems: fallback.actionItems,
          meta: {
            toolCalls: 0,
            mode: canUseMetaTools ? 'meta-fallback-after-error' : 'creative-fallback-after-error',
            campaignCount: campaignLinks.length,
            creativeCount: creativeSummary.totalItems,
            apiKeySource: anthropic.apiKeySource,
            model: 'rule-based',
            degradedReason: err.message,
            selectionAware: Boolean(selectedPlan),
          },
        });
      }

      if (err instanceof Error && err.name === 'AbortError') {
        return NextResponse.json({
          response: [
            'Claude took too long to respond, so I switched to the built-in launch planner.',
            '',
            fallback.response,
          ].join('\n'),
          actionItems: fallback.actionItems,
          meta: {
            toolCalls: 0,
            mode: canUseMetaTools ? 'meta-fallback-after-timeout' : 'creative-fallback-after-timeout',
            campaignCount: campaignLinks.length,
            creativeCount: creativeSummary.totalItems,
            apiKeySource: anthropic.apiKeySource,
            model: 'rule-based',
            degradedReason: 'Claude request timed out',
            selectionAware: Boolean(selectedPlan),
          },
        });
      }

      throw err;
    }

    // 4. Extract action items from the response
    const responseText = text || fallback.response;
    const actionItems = extractActionItems(responseText);

    console.log(
      `[AI Strategist] Completed: ${toolCalls} tool calls, product=${profile.productName}`,
    );

    return NextResponse.json({
      response: responseText,
      actionItems: actionItems.length > 0 ? actionItems : fallback.actionItems,
      meta: {
        toolCalls,
        mode: canUseMetaTools ? 'meta-plus-creative' : 'creative-only',
        campaignCount: campaignLinks.length,
        creativeCount: creativeSummary.totalItems,
        apiKeySource: anthropic.apiKeySource,
        model: anthropic.model,
        modelSource: anthropic.modelSource,
        selectionAware: Boolean(selectedPlan),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out. The AI took too long to analyze your data.' },
        { status: 504 },
      );
    }
    const message = err instanceof Error
      ? err.message
      : 'An unexpected error occurred';
    console.error('[AI Strategist] Error:', message);
    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  } finally {
    clearTimeout(globalTimeout);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractActionItems(text: string): string[] {
  // Look for "Action Items:" section and extract bullet points
  const actionSection = text.match(
    /action\s*items?:?\s*\n([\s\S]*?)(?:\n\n|\n(?=[A-Z])|$)/i,
  );
  if (!actionSection) return [];

  const lines = actionSection[1]
    .split('\n')
    .map((l) => l.replace(/^[\s\-*\d.]+/, '').trim())
    .filter((l) => l.length > 5);

  return lines.slice(0, 10);
}
