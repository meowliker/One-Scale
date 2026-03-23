import { NextRequest, NextResponse } from 'next/server';
import { getCreativeTest, updateCreativeTestItem } from '@/app/api/lib/creative-hub-db';
import type { AIRecommendation } from '@/types/creativeHub';

/**
 * POST /api/creative-hub/tests/[testId]/ai-evaluate
 *
 * Placeholder AI evaluation endpoint.
 * Generates mock recommendations based on spend/ROAS thresholds.
 * Real Claude AI integration will be added in Task 18.
 */
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

  const test = getCreativeTest(testId);
  if (!test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }
  if (test.storeId !== storeId) {
    return NextResponse.json({ error: 'Test does not belong to this store' }, { status: 403 });
  }

  try {
    const items = test.items.map((item) => {
      let recommendation: AIRecommendation;
      let reasoning: string;

      // Mock evaluation logic based on basic thresholds
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

      // Persist recommendation to DB
      updateCreativeTestItem(item.id, {
        aiRecommendation: recommendation,
        aiReasoning: reasoning,
      });

      return {
        id: item.id,
        recommendation,
        reasoning,
      };
    });

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to evaluate test';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
