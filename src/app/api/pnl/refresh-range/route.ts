import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type CronResult = {
  ok?: boolean;
  error?: string;
  results?: Array<{
    storeId?: string;
    status?: string;
    rows?: number;
    error?: string;
    date?: string;
    revenue?: number;
    orders?: number;
  }>;
  daysProcessed?: number;
};

function isIsoDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function daysBetweenInclusive(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text || response.statusText } as T;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    storeId?: string;
    from?: string;
    to?: string;
    feeMode?: 'exact' | 'estimate';
  };

  const storeId = body.storeId?.trim();
  const from = body.from?.trim() ?? null;
  const to = body.to?.trim() ?? null;
  const feeMode = body.feeMode === 'exact' ? 'exact' : 'estimate';

  if (!storeId || !isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json({ ok: false, error: 'storeId, from, and to are required' }, { status: 400 });
  }

  const days = daysBetweenInclusive(from, to);
  if (days < 1) {
    return NextResponse.json({ ok: false, error: 'from must be before or equal to to' }, { status: 400 });
  }
  if (days > 92) {
    return NextResponse.json({ ok: false, error: 'Manual refresh is limited to 92 days at a time' }, { status: 400 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const headers = { Authorization: `Bearer ${secret}` };

  const syncUrl = new URL('/api/cron/sync-shopify-orders', origin);
  syncUrl.searchParams.set('store_id', storeId);
  syncUrl.searchParams.set('from', from);
  syncUrl.searchParams.set('to', to);

  const syncResponse = await fetch(syncUrl, { headers, cache: 'no-store' });
  const syncJson = await readJson<CronResult>(syncResponse);
  const syncErrors = (syncJson.results ?? []).filter((result) => result.status === 'error' || result.error);

  if (!syncResponse.ok || syncErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        step: 'sync-shopify-orders',
        error: syncJson.error || syncErrors[0]?.error || 'Shopify order sync failed',
        sync: syncJson,
      },
      { status: syncResponse.ok ? 500 : syncResponse.status }
    );
  }

  const backfillUrl = new URL('/api/cron/backfill-pnl', origin);
  backfillUrl.searchParams.set('storeId', storeId);
  backfillUrl.searchParams.set('from', from);
  backfillUrl.searchParams.set('to', to);
  backfillUrl.searchParams.set('feeMode', feeMode);

  const backfillResponse = await fetch(backfillUrl, { headers, cache: 'no-store' });
  const backfillJson = await readJson<CronResult>(backfillResponse);
  const backfillErrors = (backfillJson.results ?? []).filter((result) => result.status?.startsWith('error'));

  if (!backfillResponse.ok || backfillErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        step: 'backfill-pnl',
        error: backfillJson.error || backfillErrors[0]?.status || 'P&L backfill failed',
        sync: syncJson,
        backfill: backfillJson,
      },
      { status: backfillResponse.ok ? 500 : backfillResponse.status }
    );
  }

  const revenue = (backfillJson.results ?? []).reduce((sum, result) => sum + (Number(result.revenue) || 0), 0);
  const orders = (backfillJson.results ?? []).reduce((sum, result) => sum + (Number(result.orders) || 0), 0);
  const rows = (syncJson.results ?? []).reduce((sum, result) => sum + (Number(result.rows) || 0), 0);

  return NextResponse.json({
    ok: true,
    storeId,
    from,
    to,
    days,
    feeMode,
    syncedOrderRows: rows,
    revenue: Math.round(revenue * 100) / 100,
    orders,
    sync: syncJson,
    backfill: backfillJson,
    refreshedAt: new Date().toISOString(),
  });
}
