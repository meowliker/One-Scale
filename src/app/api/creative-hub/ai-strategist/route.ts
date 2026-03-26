import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import {
  getProductProfile,
  getProductCampaignLinks,
} from '@/app/api/lib/creative-hub-db';

export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategistRequestBody {
  storeId: string;
  productProfileId: string;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
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

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  accessToken: string,
  campaignLinks: Array<{ campaignId: string; campaignName: string; adAccountId: string }>,
): Promise<string> {
  try {
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
  campaignLinks: Array<{ campaignId: string; campaignName: string }>,
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
  campaignLinks: Array<{ campaignId: string; campaignName: string }>,
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

async function callClaudeWithTools(
  systemPrompt: string,
  messages: ClaudeMessage[],
  tools: ClaudeTool[],
  accessToken: string,
  campaignLinks: Array<{ campaignId: string; campaignName: string; adAccountId: string }>,
  abortSignal: AbortSignal,
): Promise<{ text: string; toolCalls: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[AI Strategist] ANTHROPIC_API_KEY not found. Available env keys with ANTHRO:', Object.keys(process.env).filter(k => k.includes('ANTHRO')));
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const model = process.env.ANTHROPIC_CREATIVE_MODEL || 'claude-sonnet-4-20250514';
  let currentMessages = [...messages];
  let totalToolCalls = 0;

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
      throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 200)}`);
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
    throw new Error(`Claude API final call error: ${finalRes.status}`);
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
    const body: StrategistRequestBody = await request.json();
    const { storeId, productProfileId, message, history } = body;

    if (!storeId || !productProfileId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: storeId, productProfileId, message' },
        { status: 400 },
      );
    }

    // 1. Get Meta token
    const metaToken = await getMetaToken(storeId);
    if (!metaToken?.accessToken) {
      return NextResponse.json(
        {
          error:
            'Meta Ads account not connected. Connect your Meta account in Settings to use the AI Strategist.',
        },
        { status: 401 },
      );
    }

    // 2. Get product profile + campaign links
    const [profile, campaignLinks] = await Promise.all([
      getProductProfile(productProfileId),
      getProductCampaignLinks(productProfileId),
    ]);

    if (!profile) {
      return NextResponse.json(
        { error: 'Product profile not found' },
        { status: 404 },
      );
    }

    if (campaignLinks.length === 0) {
      return NextResponse.json(
        {
          error:
            'No campaigns linked to this product profile. Link campaigns in the Creative Hub to use the AI Strategist.',
        },
        { status: 400 },
      );
    }

    // 3. Build system prompt
    const campaignNames = campaignLinks
      .map((l) => `${l.campaignName} (${l.campaignType}, ${l.isActive ? 'active' : 'paused'})`)
      .join('\n  - ');

    const adAccountIds = [...new Set(campaignLinks.map((l) => l.adAccountId))].join(', ');

    const systemPrompt = `You are a senior media buyer and creative strategist with 10+ years of experience managing $100M+ in annual ad spend. You have direct access to this advertiser's Meta Ads data via tools.

When the user asks about performance, creative strategy, or what to test next:
1. Use your tools to fetch REAL data from their Meta Ads account
2. Analyze the actual numbers — don't guess
3. Give specific, actionable recommendations based on the data
4. Reference specific ad names, ROAS numbers, and spend figures

Product: ${profile.productName}
Ad Account: ${adAccountIds}
Linked campaigns:
  - ${campaignNames}

Always cite real data. Never make up numbers. If a tool call fails, say so honestly.

Format your response as clear, readable text. Use bullet points and bold where helpful. At the end of your response, include a section called "Action Items:" with 2-5 specific next steps the advertiser should take.`;

    // 4. Build messages array
    const messages: ClaudeMessage[] = [];

    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Add current user message
    messages.push({ role: 'user', content: message });

    // 5. Call Claude with tool loop
    const simplifiedLinks = campaignLinks.map((l) => ({
      campaignId: l.campaignId,
      campaignName: l.campaignName,
      adAccountId: l.adAccountId,
    }));

    const { text, toolCalls } = await callClaudeWithTools(
      systemPrompt,
      messages,
      TOOLS,
      metaToken.accessToken,
      simplifiedLinks,
      abortController.signal,
    );

    // 6. Extract action items from the response
    const actionItems = extractActionItems(text);

    console.log(
      `[AI Strategist] Completed: ${toolCalls} tool calls, product=${profile.productName}`,
    );

    return NextResponse.json({
      response: text,
      actionItems,
      meta: { toolCalls },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Request timed out. The AI took too long to analyze your data.' },
        { status: 504 },
      );
    }
    console.error('[AI Strategist] Error:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'An unexpected error occurred',
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
