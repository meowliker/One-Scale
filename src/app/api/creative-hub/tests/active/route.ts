import { NextRequest, NextResponse } from 'next/server';
import { getCreativeTests } from '@/app/api/lib/creative-hub-db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    // Fetch tests with active-like statuses: active, launching, partial
    const activeTests = getCreativeTests(storeId, 'active');
    const launchingTests = getCreativeTests(storeId, 'launching');
    const partialTests = getCreativeTests(storeId, 'partial');

    const tests = [...launchingTests, ...activeTests, ...partialTests];

    return NextResponse.json({ tests });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch active tests';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
