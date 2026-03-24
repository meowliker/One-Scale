import { NextRequest, NextResponse } from 'next/server';

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

interface WinningAdsResponse {
  ads: WinningAd[];
  productName: string;
  topPrimaryTexts: Array<{
    text: string;
    adCount: number;
    avgRoas: number;
    totalSpend: number;
    totalPurchases: number;
  }>;
  topHeadlines: Array<{
    text: string;
    adCount: number;
    avgRoas: number;
    totalSpend: number;
    totalPurchases: number;
  }>;
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

interface AiInsights {
  winningPatterns: WinningPattern[];
  bestAngle: { name: string; avgRoas: number; description: string };
  worstAngle: { name: string; avgRoas: number; description: string };
  suggestedPTs: SuggestedPT[];
  suggestedHeadlines: SuggestedHeadline[];
  bestCTA: { type: string; usagePercent: number; reasoning: string };
  summary: string;
  actionItems: string[];
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
): Promise<AiInsights | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

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

Return your analysis as a JSON object with this exact schema:
{
  "winningPatterns": [{ "pattern": "string", "avgRoas": number, "example": "string", "reasoning": "string" }],
  "bestAngle": { "name": "string", "avgRoas": number, "description": "string" },
  "worstAngle": { "name": "string", "avgRoas": number, "description": "string" },
  "suggestedPTs": [{ "text": "string", "reasoning": "string", "expectedRoas": "string" }],
  "suggestedHeadlines": [{ "text": "string", "reasoning": "string" }],
  "bestCTA": { "type": "string", "usagePercent": number, "reasoning": "string" },
  "summary": "2-3 sentence executive summary",
  "actionItems": ["string array of top 3 things to do next"]
}`;

  const model = process.env.ANTHROPIC_CREATIVE_MODEL || 'claude-opus-4-6';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

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

    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as AiInsights;

    // Basic validation
    if (!parsed.winningPatterns || !parsed.summary) return null;

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Fallback rule-based analysis
// ---------------------------------------------------------------------------

function buildFallbackInsights(data: WinningAdsResponse): AiInsights {
  const ads = data.ads.slice(0, 20);
  const pts = data.topPrimaryTexts.slice(0, 10);
  const headlines = data.topHeadlines.slice(0, 5);

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
    suggestedPTs: bestPT
      ? [
          {
            text: `Variation of: ${bestPT.text.slice(0, 80)}`,
            reasoning:
              'Based on your top-performing primary text. Test a variation with a different hook.',
            expectedRoas: `${(bestPT.avgRoas * 0.9).toFixed(2)}x - ${(bestPT.avgRoas * 1.1).toFixed(2)}x`,
          },
        ]
      : [],
    suggestedHeadlines: headlines.length > 0
      ? [
          {
            text: `Variation of: ${headlines[0].text.slice(0, 80)}`,
            reasoning: `Your top headline achieves ${headlines[0].avgRoas.toFixed(2)}x ROAS. Test variations.`,
          },
        ]
      : [],
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

    const winningAdsData = (await winningAdsRes.json()) as WinningAdsResponse;
    const productName = winningAdsData.productName || 'Unknown Product';
    const analyzedAds = Math.min(winningAdsData.ads?.length ?? 0, 20);

    // Try Claude AI analysis first
    let insights: AiInsights | null = null;
    let source: 'ai' | 'fallback' = 'fallback';
    let model = process.env.ANTHROPIC_CREATIVE_MODEL || 'claude-opus-4-6';

    try {
      insights = await callClaudeForInsights(winningAdsData);
      if (insights) {
        source = 'ai';
      }
    } catch {
      // Claude API call failed — fall through to fallback
    }

    // Fallback to rule-based analysis
    if (!insights) {
      insights = buildFallbackInsights(winningAdsData);
      source = 'fallback';
      model = 'rule-based';
    }

    return NextResponse.json({
      insights,
      source,
      model,
      analyzedAds,
      productName,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate AI insights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
