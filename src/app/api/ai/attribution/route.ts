/**
 * AI-Powered Attribution Suggestion API
 *
 * POST /api/ai/attribution
 *
 * When campaign-level confidence is below 50%, this endpoint uses Claude AI
 * to analyze campaign context and historical patterns to suggest attribution.
 * Results are cached in the attribution_cache table with a 24-hour TTL.
 *
 * Auth: Middleware-protected (session cookie validated by middleware.ts).
 * No CRON_SECRET needed -- this is a user-facing API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { rest } from '@/app/api/lib/supabase-persistence';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';
import { toZonedTime } from 'date-fns-tz';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttributionRequest {
  storeId: string;
  orderId: string;
  campaignName?: string;
  creativeDescription?: string;
  productKeywords?: string[];
  historicalPatterns?: Array<{
    campaignId: string;
    campaignName: string;
    purchases: number;
    revenue: number;
    spend: number;
  }>;
}

interface CachedAttribution {
  id: string;
  store_id: string;
  campaign_id: string;
  ai_suggestion: AiSuggestion | null;
  confidence: number;
  cached_at: string;
}

interface AiSuggestion {
  suggestion: string;
  confidence: number;
  reasoning: string;
  suggestedCampaignId?: string;
  suggestedChannel?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function sha256(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/** Build a cache key from store + order + campaign context. */
function buildCacheKey(req: AttributionRequest): string {
  const raw = [
    req.storeId,
    req.orderId,
    req.campaignName || '',
    req.creativeDescription || '',
    (req.productKeywords || []).sort().join(','),
  ].join('|');
  return sha256(raw);
}

/** Get current time in the store timezone (or default). */
function nowInTz(timezone?: string): Date {
  return toZonedTime(new Date(), timezone || DEFAULT_TIMEZONE);
}

// ---------------------------------------------------------------------------
// Cache layer
// ---------------------------------------------------------------------------

async function getCachedResult(
  storeId: string,
  cacheKey: string,
): Promise<AiSuggestion | null> {
  try {
    const rows = await rest<CachedAttribution[]>(
      `/attribution_cache?store_id=eq.${encodeURIComponent(storeId)}&campaign_id=eq.${encodeURIComponent(cacheKey)}&select=ai_suggestion,confidence,cached_at&order=cached_at.desc&limit=1`,
    );

    const row = rows?.[0];
    if (!row?.ai_suggestion) return null;

    // Check TTL
    const cachedAt = Date.parse(row.cached_at);
    if (Date.now() - cachedAt > CACHE_TTL_MS) return null;

    return row.ai_suggestion;
  } catch {
    return null;
  }
}

async function setCachedResult(
  storeId: string,
  cacheKey: string,
  suggestion: AiSuggestion,
): Promise<void> {
  try {
    await rest('/attribution_cache', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        store_id: storeId,
        campaign_id: cacheKey,
        ai_suggestion: suggestion,
        confidence: suggestion.confidence,
        cached_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Cache write is best-effort
  }
}

// ---------------------------------------------------------------------------
// Claude AI call
// ---------------------------------------------------------------------------

async function callClaudeForAttribution(
  req: AttributionRequest,
): Promise<AiSuggestion> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      suggestion: 'AI attribution unavailable - API key not configured',
      confidence: 0,
      reasoning: 'ANTHROPIC_API_KEY environment variable is not set.',
    };
  }

  // Build context for Claude
  const historicalContext = req.historicalPatterns?.length
    ? req.historicalPatterns
        .map(
          (p) =>
            `- ${p.campaignName} (ID: ${p.campaignId}): ${p.purchases} purchases, $${p.revenue.toFixed(2)} revenue, $${p.spend.toFixed(2)} spend, ROAS: ${p.spend > 0 ? (p.revenue / p.spend).toFixed(2) : 'N/A'}`,
        )
        .join('\n')
    : 'No historical pattern data available.';

  const productContext = req.productKeywords?.length
    ? req.productKeywords.join(', ')
    : 'No product keywords provided.';

  const prompt = `You are an e-commerce attribution analyst. Analyze the following order and campaign context to suggest the most likely attribution source.

Order ID: ${req.orderId}
Campaign Name: ${req.campaignName || 'Unknown'}
Creative Description: ${req.creativeDescription || 'Not provided'}
Product Keywords: ${productContext}

Historical Campaign Performance (last 30 days):
${historicalContext}

Based on this context:
1. Which campaign most likely drove this purchase? Consider campaign naming patterns, creative-product alignment, and historical performance.
2. What is your confidence level (0.0 to 1.0)?
3. Explain your reasoning in 2-3 sentences.

Respond in strict JSON format:
{
  "suggestion": "Brief attribution suggestion (one sentence)",
  "confidence": 0.65,
  "reasoning": "2-3 sentence explanation",
  "suggestedCampaignId": "campaign_id_if_identified_or_null",
  "suggestedChannel": "facebook|google|tiktok|email|organic|unknown"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_ATTRIBUTION_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 512,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textContent = data.content?.find((c) => c.type === 'text')?.text;
  if (!textContent) {
    return {
      suggestion: 'AI could not generate attribution suggestion',
      confidence: 0,
      reasoning: 'Empty response from AI model.',
    };
  }

  try {
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]) as AiSuggestion;
    return {
      suggestion: parsed.suggestion || 'No suggestion available',
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reasoning: parsed.reasoning || 'No reasoning provided.',
      suggestedCampaignId: parsed.suggestedCampaignId || undefined,
      suggestedChannel: parsed.suggestedChannel || 'unknown',
    };
  } catch {
    // If JSON parsing fails, use the raw text as the suggestion
    return {
      suggestion: textContent.slice(0, 200),
      confidence: 0.3,
      reasoning: 'AI response could not be parsed as structured data.',
    };
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AttributionRequest;

    // Validate required fields
    if (!body.storeId || !body.orderId) {
      return NextResponse.json(
        { error: 'storeId and orderId are required' },
        { status: 400 },
      );
    }

    const cacheKey = buildCacheKey(body);

    // Check cache first (24h TTL)
    const cached = await getCachedResult(body.storeId, cacheKey);
    if (cached) {
      return NextResponse.json({
        suggestion: cached.suggestion,
        confidence: cached.confidence,
        reasoning: cached.reasoning,
        suggestedCampaignId: cached.suggestedCampaignId,
        suggestedChannel: cached.suggestedChannel,
        source: 'cache',
      });
    }

    // Call Claude for AI-powered attribution analysis
    const suggestion = await callClaudeForAttribution(body);

    // Cache the result
    await setCachedResult(body.storeId, cacheKey, suggestion);

    return NextResponse.json({
      suggestion: suggestion.suggestion,
      confidence: suggestion.confidence,
      reasoning: suggestion.reasoning,
      suggestedCampaignId: suggestion.suggestedCampaignId,
      suggestedChannel: suggestion.suggestedChannel,
      source: 'ai',
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate attribution suggestion';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
