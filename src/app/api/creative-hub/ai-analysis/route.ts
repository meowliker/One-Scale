export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import {
  getProductProfile,
  getProductCampaignLinks,
} from '@/app/api/lib/creative-hub-db';
import { isAccountOnlyCampaignLink } from '@/lib/creative-hub/account-links';

/**
 * GET /api/creative-hub/ai-analysis?storeId=...&productProfileId=...
 *
 * Fetches 30-day creative performance data for a product profile, calls
 * Claude for structured analysis, and returns performance insights,
 * recommendations, and quick actions. Falls back to rule-based analysis
 * when the API key is missing or the call fails.
 */

// ---------------------------------------------------------------------------
// Supabase REST helper
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function supabaseRest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SnapshotAd {
  id: string;
  name?: string;
  campaign_id?: string;
  campaignId?: string;
  status?: string;
  creative?: {
    headline?: string;
    title?: string;
    body?: string;
    ctaType?: string;
    thumbnailUrl?: string;
    type?: string;
  };
  metrics?: {
    spend?: number;
    revenue?: number;
    roas?: number;
    cpa?: number;
    cpm?: number;
    cpc?: number;
    ctr?: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
  };
}

interface AdsSnapshotRow {
  scope_id: string;
  payload_json: string;
}

interface TopCreativeType {
  type: string;
  avgRoas: number;
  spend: number;
}

interface BestHook {
  hook: string;
  avgCtr: number;
  example: string;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface AnalysisResponse {
  performanceInsights: {
    topCreativeTypes: TopCreativeType[];
    bestHooks: BestHook[];
    roasTrend: 'improving' | 'declining' | 'stable';
    summary: string;
  };
  recommendations: {
    whatToTest: string[];
    suggestedStructure: string;
    copySuggestions: string[];
    budgetAdvice: string;
  };
  quickActions: QuickAction[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an elite Meta Ads creative strategist with 10+ years managing $10M+/month across 20+ ad accounts. You analyze 30-day creative performance data and produce structured recommendations for media buyers.

You identify winning patterns, spot fatigue, and know exactly what to test next. Your analysis is data-driven, actionable, and concise.

IMPORTANT: Return your analysis as valid JSON matching the exact schema below. No markdown, no explanation outside the JSON.`;

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaudeForAnalysis(
  productName: string,
  ads: SnapshotAd[],
  campaignCount: number,
): Promise<AnalysisResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_CREATIVE_MODEL || 'claude-sonnet-4-20250514';

  // Summarize ad data for the prompt
  const topAds = ads
    .sort((a, b) => (b.metrics?.roas ?? 0) - (a.metrics?.roas ?? 0))
    .slice(0, 20);

  const totalSpend = ads.reduce((s, ad) => s + (ad.metrics?.spend ?? 0), 0);
  const totalRevenue = ads.reduce((s, ad) => s + (ad.metrics?.revenue ?? 0), 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  const adsContext = topAds
    .map((ad, i) => {
      const m = ad.metrics || {};
      const c = ad.creative || {};
      const type = c.type || 'unknown';
      const hook = (c.body || '').split(/[.!?\n]/)[0]?.trim().slice(0, 80) || '';
      return `${i + 1}. "${ad.name || 'Unnamed'}" | Type: ${type} | Hook: "${hook}" | ROAS: ${(m.roas ?? 0).toFixed(2)}x | CPA: $${(m.cpa ?? 0).toFixed(2)} | CTR: ${((m.ctr ?? 0) * 100).toFixed(2)}% | Spend: $${(m.spend ?? 0).toFixed(2)} | Conversions: ${m.conversions ?? 0}`;
    })
    .join('\n');

  // Aggregate by creative type
  const typeMap: Record<string, { totalRoas: number; count: number; spend: number }> = {};
  for (const ad of ads) {
    const type = ad.creative?.type || 'unknown';
    if (!typeMap[type]) typeMap[type] = { totalRoas: 0, count: 0, spend: 0 };
    typeMap[type].totalRoas += ad.metrics?.roas ?? 0;
    typeMap[type].count += 1;
    typeMap[type].spend += ad.metrics?.spend ?? 0;
  }
  const typeBreakdown = Object.entries(typeMap)
    .map(([type, data]) => `${type}: avgROAS ${(data.totalRoas / data.count).toFixed(2)}x, spend $${data.spend.toFixed(2)}, ${data.count} ads`)
    .join('\n');

  const userMessage = `Analyze the following 30-day creative performance data for "${productName}".

SUMMARY:
- Total ads analyzed: ${ads.length}
- Linked campaigns: ${campaignCount}
- Total spend: $${totalSpend.toFixed(2)}
- Total revenue: $${totalRevenue.toFixed(2)}
- Overall ROAS: ${avgRoas.toFixed(2)}x

TYPE BREAKDOWN:
${typeBreakdown}

TOP 20 ADS BY ROAS:
${adsContext}

Return your analysis as a JSON object with this exact schema:
{
  "performanceInsights": {
    "topCreativeTypes": [{ "type": "string", "avgRoas": number, "spend": number }],
    "bestHooks": [{ "hook": "string (first line of winning ad copy)", "avgCtr": number, "example": "string (ad name)" }],
    "roasTrend": "improving" | "declining" | "stable",
    "summary": "2-3 sentence executive summary of the 30-day performance"
  },
  "recommendations": {
    "whatToTest": ["string array of 3-5 specific things to test next"],
    "suggestedStructure": "ABO or CBO recommendation with reasoning",
    "copySuggestions": ["string array of 2-3 copy angle suggestions based on what's working"],
    "budgetAdvice": "Specific budget recommendation based on the data"
  },
  "quickActions": [
    {
      "id": "unique-id",
      "label": "Short action label",
      "description": "What to do and why",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Include 3-5 quick actions ordered by priority. Make them specific and actionable.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
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
      throw new Error(`Claude API failed (${response.status}): ${errorBody}`);
    }

    const result = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textContent = result.content?.find((c) => c.type === 'text')?.text;
    if (!textContent) return null;

    // Extract JSON from response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as AnalysisResponse;

    // Basic validation
    if (!parsed.performanceInsights || !parsed.recommendations || !parsed.quickActions) {
      return null;
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Fallback rule-based analysis
// ---------------------------------------------------------------------------

function buildFallbackAnalysis(
  productName: string,
  ads: SnapshotAd[],
  campaignCount: number,
): AnalysisResponse {
  const totalSpend = ads.reduce((s, ad) => s + (ad.metrics?.spend ?? 0), 0);
  const totalRevenue = ads.reduce((s, ad) => s + (ad.metrics?.revenue ?? 0), 0);
  const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  // Aggregate by type
  const typeMap: Record<string, { totalRevenue: number; totalSpend: number; count: number }> = {};
  for (const ad of ads) {
    const type = ad.creative?.type || 'unknown';
    if (!typeMap[type]) typeMap[type] = { totalRevenue: 0, totalSpend: 0, count: 0 };
    typeMap[type].totalRevenue += ad.metrics?.revenue ?? 0;
    typeMap[type].totalSpend += ad.metrics?.spend ?? 0;
    typeMap[type].count += 1;
  }

  const topCreativeTypes: TopCreativeType[] = Object.entries(typeMap)
    .map(([type, data]) => ({
      type,
      avgRoas: data.totalSpend > 0 ? data.totalRevenue / data.totalSpend : 0,
      spend: data.totalSpend,
    }))
    .sort((a, b) => b.avgRoas - a.avgRoas)
    .slice(0, 5);

  // Extract hooks (first sentence of body)
  const hookMap: Record<string, { totalCtr: number; count: number; example: string }> = {};
  for (const ad of ads) {
    const body = ad.creative?.body || '';
    const hook = body.split(/[.!?\n]/)[0]?.trim().slice(0, 80);
    if (!hook) continue;
    if (!hookMap[hook]) hookMap[hook] = { totalCtr: 0, count: 0, example: ad.name || 'Unknown' };
    hookMap[hook].totalCtr += ad.metrics?.ctr ?? 0;
    hookMap[hook].count += 1;
  }

  const bestHooks: BestHook[] = Object.entries(hookMap)
    .map(([hook, data]) => ({
      hook,
      avgCtr: data.count > 0 ? data.totalCtr / data.count : 0,
      example: data.example,
    }))
    .sort((a, b) => b.avgCtr - a.avgCtr)
    .slice(0, 5);

  const quickActions: QuickAction[] = [];

  if (ads.length < 5) {
    quickActions.push({
      id: 'launch-more-creatives',
      label: 'Launch more creatives',
      description: `Only ${ads.length} ads found. Launch at least 5-10 creatives to gather meaningful data.`,
      priority: 'high',
    });
  }

  if (avgRoas > 0 && topCreativeTypes.length > 1) {
    const best = topCreativeTypes[0];
    quickActions.push({
      id: 'double-down-format',
      label: `Double down on ${best.type} creatives`,
      description: `${best.type} format has ${best.avgRoas.toFixed(2)}x ROAS. Create more variations in this format.`,
      priority: 'high',
    });
  }

  if (bestHooks.length > 0) {
    quickActions.push({
      id: 'test-hook-variations',
      label: 'Test hook variations',
      description: `Your best hook has ${(bestHooks[0].avgCtr * 100).toFixed(2)}% CTR. Create 3-4 variations of this opening line.`,
      priority: 'medium',
    });
  }

  quickActions.push({
    id: 'review-spend-allocation',
    label: 'Review budget allocation',
    description: `Total spend across ${campaignCount} campaign(s) is $${totalSpend.toFixed(2)}. Ensure budget is concentrated on winning angles.`,
    priority: 'medium',
  });

  quickActions.push({
    id: 'check-fatigue',
    label: 'Check for creative fatigue',
    description: 'Review ads running 7+ days for declining CTR or increasing CPA.',
    priority: 'low',
  });

  return {
    performanceInsights: {
      topCreativeTypes,
      bestHooks,
      roasTrend: 'stable',
      summary: `Rule-based analysis of ${ads.length} ads for ${productName} over the last 30 days. Overall ROAS is ${avgRoas.toFixed(2)}x across $${totalSpend.toFixed(2)} in spend. ${topCreativeTypes.length > 0 ? `Top format: ${topCreativeTypes[0].type} at ${topCreativeTypes[0].avgRoas.toFixed(2)}x ROAS.` : ''}`,
    },
    recommendations: {
      whatToTest: [
        'Test new hook variations based on your top performing opening lines',
        'Try different creative formats to find new winners',
        'Test broad vs interest-based targeting with your best creatives',
        'Create UGC-style versions of your top static ads',
      ],
      suggestedStructure: ads.length > 10
        ? 'CBO recommended — you have enough data for Meta to optimize delivery across adsets.'
        : 'ABO recommended — with fewer ads, manual budget control gives you more reliable data per creative.',
      copySuggestions: bestHooks.length > 0
        ? [
            `Riff on your best hook: "${bestHooks[0].hook}"`,
            'Test a problem-agitate-solve angle',
            'Try a social proof / testimonial hook',
          ]
        : [
            'Test benefit-led primary text',
            'Try a problem-agitate-solve angle',
            'Test a social proof / testimonial hook',
          ],
      budgetAdvice: totalSpend > 0
        ? `Current total spend is $${totalSpend.toFixed(2)}. Allocate at least $20-30/day per creative for statistically significant results within 3-5 days.`
        : 'No spend data available. Start with $20-30/day per creative to gather initial data.',
    },
    quickActions,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const storeId = searchParams.get('storeId');
    const productProfileId = searchParams.get('productProfileId');

    if (!storeId || !productProfileId) {
      return NextResponse.json(
        { error: 'storeId and productProfileId are required' },
        { status: 400 },
      );
    }

    // 1. Get product profile
    const profile = await getProductProfile(productProfileId);
    if (!profile) {
      return NextResponse.json(
        { error: 'Product profile not found' },
        { status: 404 },
      );
    }

    // 2. Get linked campaigns
    const campaignLinks = await getProductCampaignLinks(productProfileId);
    if (campaignLinks.length === 0) {
      // Return empty analysis with helpful guidance
      const emptyAnalysis: AnalysisResponse = {
        performanceInsights: {
          topCreativeTypes: [],
          bestHooks: [],
          roasTrend: 'stable',
          summary: `No campaigns are linked to ${profile.productName}. Link campaigns to get performance analysis.`,
        },
        recommendations: {
          whatToTest: ['Link your testing campaigns to this product profile first'],
          suggestedStructure: 'ABO — start with manual budget control for initial testing.',
          copySuggestions: ['Set up your first test with 3-5 creative variations'],
          budgetAdvice: 'Start with $20-30/day per creative for initial testing.',
        },
        quickActions: [
          {
            id: 'link-campaigns',
            label: 'Link campaigns',
            description: 'Go to product profiles and link your Meta campaigns to start tracking.',
            priority: 'high',
          },
        ],
      };
      return NextResponse.json({
        analysis: emptyAnalysis,
        source: 'empty' as const,
        productName: profile.productName,
        adsAnalyzed: 0,
        campaignCount: 0,
      });
    }

    const linkedCampaignIds = new Set(
      campaignLinks
        .filter((link) => !isAccountOnlyCampaignLink(link))
        .map((l) => l.campaignId),
    );

    // 3. Fetch ads from Supabase snapshots
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return NextResponse.json(
        { error: 'Supabase not configured' },
        { status: 500 },
      );
    }

    const adsSnapshots = await supabaseRest<AdsSnapshotRow[]>(
      `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.ads&variant_key=eq.latest&select=scope_id,payload_json`,
    );

    // 4. Parse and filter ads by linked campaigns
    const matchedAds: SnapshotAd[] = [];

    for (const snap of adsSnapshots) {
      let ads: SnapshotAd[];
      try {
        ads = JSON.parse(snap.payload_json);
      } catch {
        continue;
      }

      for (const ad of ads) {
        const campId = ad.campaign_id || ad.campaignId || '';
        if (linkedCampaignIds.has(campId)) {
          matchedAds.push(ad);
        }
      }
    }

    // 5. Call Claude or fallback
    let analysis: AnalysisResponse | null = null;
    let source: 'ai' | 'fallback' = 'fallback';

    try {
      console.log(
        '[ai-analysis] Calling Claude with',
        matchedAds.length,
        'ads for',
        profile.productName,
      );
      analysis = await callClaudeForAnalysis(
        profile.productName,
        matchedAds,
        linkedCampaignIds.size,
      );
      if (analysis) {
        source = 'ai';
        console.log('[ai-analysis] Claude returned analysis successfully');
      }
    } catch (err) {
      console.error('[ai-analysis] Claude API call failed:', err);
    }

    if (!analysis) {
      analysis = buildFallbackAnalysis(
        profile.productName,
        matchedAds,
        linkedCampaignIds.size,
      );
      source = 'fallback';
    }

    return NextResponse.json({
      analysis,
      source,
      productName: profile.productName,
      adsAnalyzed: matchedAds.length,
      campaignCount: linkedCampaignIds.size,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate creative analysis';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
