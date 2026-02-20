import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // 5 minutes for cron

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

export async function GET(request: NextRequest) {
  // Verify cron authorization
  const authHeader = request.headers.get('authorization') || '';
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // List all stores from Supabase
  const storesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/stores?select=id,domain&platform=eq.shopify`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      cache: 'no-store',
    }
  );

  if (!storesRes.ok) {
    return NextResponse.json({ error: 'Failed to list stores' }, { status: 500 });
  }

  const stores = (await storesRes.json()) as Array<{ id: string; domain: string }>;

  // Resolve base URL for internal API calls
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`;

  const results: Array<{
    storeId: string;
    domain: string;
    status: string;
    orders?: number;
    attributed?: number;
    error?: string;
  }> = [];

  for (const store of stores) {
    try {
      const backfillRes = await fetch(
        new URL(
          `/api/tracking/backfill-orders?storeId=${encodeURIComponent(store.id)}&cronSecret=${encodeURIComponent(CRON_SECRET)}`,
          baseUrl
        ),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: store.id, days: 1, fast: true }),
        }
      );

      const data = await backfillRes.json();

      if (data.ok) {
        results.push({
          storeId: store.id,
          domain: store.domain,
          status: 'success',
          orders: data.data?.scannedOrders || 0,
          attributed: data.data?.effectiveMappedPurchases || 0,
        });
      } else {
        results.push({
          storeId: store.id,
          domain: store.domain,
          status: 'error',
          error: data.error || 'Unknown error',
        });
      }
    } catch (err) {
      results.push({
        storeId: store.id,
        domain: store.domain,
        status: 'error',
        error: err instanceof Error ? err.message : 'Fetch failed',
      });
    }
  }

  const succeeded = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'error').length;

  return NextResponse.json({
    ok: true,
    summary: {
      totalStores: stores.length,
      succeeded,
      failed,
      runAt: new Date().toISOString(),
    },
    results,
  });
}
