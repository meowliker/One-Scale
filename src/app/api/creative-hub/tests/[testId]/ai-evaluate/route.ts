import { NextRequest, NextResponse } from 'next/server';
import { getCreativeTest, updateCreativeTestItem, getProductProfile } from '@/app/api/lib/creative-hub-db';
import type { AIRecommendation, CreativeTestItem } from '@/types/creativeHub';

/**
 * POST /api/creative-hub/tests/[testId]/ai-evaluate
 *
 * Uses Claude AI to evaluate creative test performance and generate
 * kill/scale/wait/graduate recommendations for each creative.
 * Falls back to threshold-based mock logic when ANTHROPIC_API_KEY is not set.
 */

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

interface EvalItem {
  id: string;
  recommendation: AIRecommendation;
  reasoning: string;
}

async function callClaudeForEvaluation(
  testData: {
    productName: string;
    aov: number;
    currentDay: number;
    totalDays: number;
    minSpend: number;
    items: Array<{
      id: string;
      name: string;
      spend: number;
      roas: number;
      cpa: number | undefined;
      ctr: number | undefined;
      purchases: number;
      impressions: number;
      learningPhase: string | undefined;
    }>;
  },
): Promise<EvalItem[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const itemsContext = testData.items
    .map(
      (item) =>
        `- ${item.name} (ID: ${item.id}): Spend $${item.spend.toFixed(2)}, ROAS ${item.roas.toFixed(2)}x, CPA ${item.cpa != null ? `$${item.cpa.toFixed(2)}` : 'N/A'}, CTR ${item.ctr != null ? `${(item.ctr * 100).toFixed(2)}%` : 'N/A'}, Purchases ${item.purchases}, Impressions ${item.impressions}, Learning Phase: ${item.learningPhase || 'UNKNOWN'}`,
    )
    .join('\n');

  const prompt = `You are an expert media buyer analyzing creative test performance.

Product: ${testData.productName} (AOV: $${testData.aov.toFixed(2)})
Test Duration: Day ${testData.currentDay} of ${testData.totalDays}
Min Spend Threshold: $${testData.minSpend.toFixed(2)}

Creative Performance:
${itemsContext}

For each creative, recommend one of:
- KILL: if metrics are clearly bad (high CPA, low CTR, no purchases after sufficient spend)
- SCALE: if metrics are strong (good ROAS, consistent purchases, healthy CTR)
- WAIT: if not enough data yet (still in learning, below min spend)
- GRADUATE: if it's a clear winner ready to move to scaling campaign

Consider learning phase — don't kill ads in LEARNING unless metrics are catastrophically bad.
Consider AOV — for $${testData.aov.toFixed(2)} products, need at least $${testData.minSpend.toFixed(2)} spend before confident kill decisions.

Return JSON only: { "items": [{ "id": "...", "recommendation": "kill|scale|wait|graduate", "reasoning": "..." }] }`;

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

  const parsed = JSON.parse(jsonMatch[0]) as { items?: EvalItem[] };
  if (!Array.isArray(parsed.items)) return null;

  // Validate and normalize recommendations
  const validRecs = new Set<string>(['kill', 'scale', 'wait', 'graduate']);
  return parsed.items.map((item) => ({
    id: item.id,
    recommendation: (validRecs.has(item.recommendation) ? item.recommendation : 'wait') as AIRecommendation,
    reasoning: item.reasoning || 'No reasoning provided.',
  }));
}

// ---------------------------------------------------------------------------
// Fallback mock evaluation
// ---------------------------------------------------------------------------

function mockEvaluation(items: NonNullable<Awaited<ReturnType<typeof getCreativeTest>>>['items']): EvalItem[] {
  return items.map((item) => {
    let recommendation: AIRecommendation;
    let reasoning: string;

    if (item.spend < 5) {
      recommendation = 'wait';
      reasoning = 'Insufficient spend data to make a reliable recommendation. Continue testing.';
    } else if (item.roas >= 2.0 && item.purchases >= 2) {
      recommendation = 'scale';
      reasoning = `Strong performance with ${item.roas.toFixed(2)}x ROAS and ${item.purchases} purchases. Consider scaling budget.`;
    } else if (item.spend >= 20 && item.roas < 0.5) {
      recommendation = 'kill';
      reasoning = `Low ROAS of ${item.roas.toFixed(2)}x after $${item.spend.toFixed(2)} spend. Recommend pausing to save budget.`;
    } else if (item.spend >= 10 && item.purchases === 0) {
      recommendation = 'kill';
      reasoning = `No purchases after $${item.spend.toFixed(2)} spend. Unlikely to become profitable.`;
    } else {
      recommendation = 'wait';
      reasoning = `Mixed signals with ${item.roas.toFixed(2)}x ROAS. Need more data before deciding.`;
    }

    return { id: item.id, recommendation, reasoning };
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  const { testId } = await params;
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const test = await getCreativeTest(testId);
  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }
  if (test.storeId !== storeId) {
    return NextResponse.json({ error: 'Test does not belong to this store' }, { status: 403 });
  }

  try {
    // Gather context for AI evaluation
    const profile = await getProductProfile(test.productProfileId);
    const aov = profile?.averageOrderValue ?? 50;
    const minSpend = profile?.aiMinSpend ?? aov * 2;
    const launchedAt = new Date(test.launchedAt);
    const currentDay = Math.max(1, Math.ceil((Date.now() - launchedAt.getTime()) / (1000 * 60 * 60 * 24)));

    // Try Claude AI evaluation first
    let evaluatedItems: EvalItem[] | null = null;
    try {
      evaluatedItems = await callClaudeForEvaluation({
        productName: test.productName || profile?.productName || 'Unknown Product',
        aov,
        currentDay,
        totalDays: test.testDuration,
        minSpend,
        items: test.items.map((item) => ({
          id: item.id,
          name: item.creativeName,
          spend: item.spend,
          roas: item.roas,
          cpa: item.cpa,
          ctr: item.ctr,
          purchases: item.purchases,
          impressions: item.impressions,
          learningPhase: item.learningPhase,
        })),
      });
    } catch {
      // Claude API call failed — fall back to mock
    }

    // Fall back to mock evaluation if Claude didn't return results
    const items = evaluatedItems ?? mockEvaluation(test.items);

    // Persist recommendations to DB
    for (const evalItem of items) {
      await updateCreativeTestItem(evalItem.id, {
        aiRecommendation: evalItem.recommendation,
        aiReasoning: evalItem.reasoning,
      });
    }

    return NextResponse.json({
      items,
      source: evaluatedItems ? 'ai' : 'fallback',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to evaluate test';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
