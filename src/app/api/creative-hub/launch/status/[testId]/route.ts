import { NextRequest, NextResponse } from 'next/server';
import { getCreativeTest } from '@/app/api/lib/creative-hub-db';

/**
 * GET /api/creative-hub/launch/status/[testId]
 *
 * Returns the current creative test with all items and their statuses.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ testId: string }> }
) {
  try {
    const { testId } = await params;

    const test = getCreativeTest(testId);
    if (!test) {
      return NextResponse.json({ error: 'Creative test not found' }, { status: 404 });
    }

    // Optionally verify storeId from query params
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    if (storeId && test.storeId !== storeId) {
      return NextResponse.json({ error: 'Test does not belong to this store' }, { status: 403 });
    }

    return NextResponse.json({
      testId: test.id,
      status: test.status,
      campaignId: test.campaignId,
      campaignName: test.campaignName,
      productName: test.productName,
      structure: test.structure,
      dailyBudget: test.dailyBudget,
      testDuration: test.testDuration,
      launchStatus: test.launchStatus,
      launchedBy: test.launchedBy,
      launchedAt: test.launchedAt,
      completedAt: test.completedAt,
      totalSpend: test.totalSpend,
      winnerCreativeId: test.winnerCreativeId,
      items: test.items,
      adCopy: test.adCopy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get test status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
