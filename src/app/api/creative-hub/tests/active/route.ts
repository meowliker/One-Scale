import { NextRequest, NextResponse } from 'next/server';
import { getCreativeTests, getFatigueAlerts } from '@/app/api/lib/creative-hub-db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const statusFilter = searchParams.get('status');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    // If a specific status is requested (e.g. completed), fetch only that status
    if (statusFilter) {
      const tests = await getCreativeTests(storeId, statusFilter);
      return NextResponse.json({ tests });
    }

    // Default: fetch tests with active-like statuses: active, launching, partial
    const [activeTests, launchingTests, partialTests, fatigueAlerts] = await Promise.all([
      getCreativeTests(storeId, 'active'),
      getCreativeTests(storeId, 'launching'),
      getCreativeTests(storeId, 'partial'),
      getFatigueAlerts(storeId),
    ]);

    const tests = [...launchingTests, ...activeTests, ...partialTests];

    return NextResponse.json({ tests, fatigueAlerts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch active tests';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
