import { NextRequest, NextResponse } from 'next/server';
import { getCopyLibrary, getProductProfile, getProductCampaignLinks } from '@/app/api/lib/creative-hub-db';
import { autoPopulateCopyLibrary } from '@/app/api/creative-hub/copy-library/auto-populate/route';

/**
 * POST /api/creative-hub/copy-library/ai-analyze
 *
 * Uses Claude AI to analyze existing copy library data and campaign links
 * for a product profile, ranking the best-performing copy with reasoning.
 * Falls back to mock analysis when ANTHROPIC_API_KEY is not set.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RankedCopy {
  primaryText: string;
  headline: string;
  roas: number;
  spend: number;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaudeForAnalysis(context: {
  productName: string;
  aov?: number;
  copies: Array<{
    primaryText: string;
    headline?: string;
    roas: number;
    cpa?: number;
    ctr?: number;
    totalSpend: number;
    totalRevenue: number;
    totalPurchases: number;
  }>;
  campaigns: Array<{
    campaignName: string;
    campaignType: string;
  }>;
}): Promise<RankedCopy[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  if (context.copies.length === 0) return null;

  const copiesContext = context.copies
    .map(
      (c, i) =>
        `  ${i + 1}. Primary: "${c.primaryText}"${c.headline ? ` | Headline: "${c.headline}"` : ''}\n     ROAS: ${c.roas.toFixed(2)}x, CPA: ${c.cpa != null ? `$${c.cpa.toFixed(2)}` : 'N/A'}, CTR: ${c.ctr != null ? `${(c.ctr * 100).toFixed(2)}%` : 'N/A'}, Spend: $${c.totalSpend.toFixed(2)}, Revenue: $${c.totalRevenue.toFixed(2)}, Purchases: ${c.totalPurchases}`,
    )
    .join('\n');

  const campaignContext = context.campaigns.length
    ? context.campaigns.map((c) => `  - ${c.campaignName} (${c.campaignType})`).join('\n')
    : 'No linked campaigns.';

  const prompt = `You are an expert e-commerce ad copy analyst. Analyze the following ad copy performance data and rank the copies from best to worst, explaining why each performs well or poorly.

Product: ${context.productName}${context.aov ? ` (AOV: $${context.aov.toFixed(2)})` : ''}

Linked Campaigns:
${campaignContext}

Copy Performance Data:
${copiesContext}

Rank the top copies (up to 10) from best to worst based on overall performance. Consider:
- ROAS as the primary metric
- Statistical significance (higher spend = more reliable data)
- CPA relative to AOV
- CTR as an engagement indicator
- Purchase volume for consistency

For each ranked copy, explain in 1-2 sentences WHY it performs well or what copy angle/technique drives the result.

Return strict JSON only:
{
  "rankedCopies": [
    {
      "primaryText": "...",
      "headline": "...",
      "roas": 4.2,
      "spend": 1250.00,
      "reasoning": "..."
    }
  ]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_CREATIVE_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
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
  if (!textContent) return null;

  // Extract JSON from response (handle potential markdown wrapping)
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as { rankedCopies?: RankedCopy[] };
  if (!Array.isArray(parsed.rankedCopies)) return null;

  return parsed.rankedCopies
    .filter((c) => c.primaryText && typeof c.primaryText === 'string')
    .slice(0, 10)
    .map((c) => ({
      primaryText: c.primaryText,
      headline: c.headline || '',
      roas: Number(c.roas) || 0,
      spend: Number(c.spend) || 0,
      reasoning: c.reasoning || 'No reasoning provided.',
    }));
}

// ---------------------------------------------------------------------------
// Fallback mock analysis
// ---------------------------------------------------------------------------

function mockAnalysis(): RankedCopy[] {
  return [
    {
      primaryText:
        'Transform your routine with our best-selling product. Thousands of 5-star reviews speak for themselves.',
      headline: 'Best Seller — Shop Now',
      roas: 4.2,
      spend: 1250.0,
      reasoning:
        'High ROAS with consistent spend indicates strong product-market fit. The social proof angle performs well.',
    },
    {
      primaryText:
        'Limited time offer — get yours before they sell out again. Free shipping on all orders.',
      headline: 'Free Shipping Today',
      roas: 3.8,
      spend: 980.0,
      reasoning:
        'Urgency + free shipping combo drives solid conversion rates. Good secondary copy option.',
    },
    {
      primaryText:
        'Why pay more? Premium quality at an unbeatable price. Join 10,000+ happy customers.',
      headline: 'Premium Quality, Fair Price',
      roas: 3.1,
      spend: 750.0,
      reasoning:
        'Value proposition resonates with price-sensitive audiences. Steady performer across demographics.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.productProfileId || !body.storeId) {
      return NextResponse.json(
        { error: 'productProfileId and storeId are required' },
        { status: 400 }
      );
    }

    const { productProfileId, storeId } = body;

    // Load product profile and existing copy library data from DB
    const profile = await getProductProfile(productProfileId);
    if (!profile || profile.storeId !== storeId) {
      return NextResponse.json(
        { error: 'Product profile not found or does not belong to this store' },
        { status: 404 }
      );
    }

    // Auto-populate copy library from Supabase ad snapshots before analysis
    // so the AI has real performance data to work with
    try {
      const populateResult = await autoPopulateCopyLibrary(storeId, productProfileId);
      if (populateResult.saved > 0) {
        console.log(`[ai-analyze] Auto-populated ${populateResult.saved} copies from ad snapshots`);
      }
    } catch (err) {
      // Non-fatal: continue with whatever copies already exist
      console.warn('[ai-analyze] Auto-populate failed, continuing with existing data:', err);
    }

    const copies = await getCopyLibrary(productProfileId);
    const campaignLinks = await getProductCampaignLinks(productProfileId);

    // Try Claude AI analysis first
    let rankedCopies: RankedCopy[] | null = null;
    try {
      rankedCopies = await callClaudeForAnalysis({
        productName: profile.productName,
        aov: profile.averageOrderValue,
        copies: copies.map((c) => ({
          primaryText: c.primaryText,
          headline: c.headline,
          roas: c.roas,
          cpa: c.cpa,
          ctr: c.ctr,
          totalSpend: c.totalSpend,
          totalRevenue: c.totalRevenue,
          totalPurchases: c.totalPurchases,
        })),
        campaigns: campaignLinks.map((l) => ({
          campaignName: l.campaignName,
          campaignType: l.campaignType,
        })),
      });
    } catch {
      // Claude API call failed — fall back to mock
    }

    // Fall back to mock analysis if Claude didn't return results
    const result = rankedCopies ?? mockAnalysis();

    return NextResponse.json({
      rankedCopies: result,
      source: rankedCopies ? 'ai' : 'fallback',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyze copy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
