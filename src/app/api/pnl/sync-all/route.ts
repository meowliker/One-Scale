import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export async function POST(request: NextRequest) {
  const body = await request.json() as { secret?: string };
  if (body.secret !== process.env.PNL_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';

  // Query connections table — same table/columns used in supabase-persistence.ts
  const stores = await rest<Array<{ store_id: string }>>(
    '/connections?platform=eq.shopify&select=store_id'
  );

  if (!stores?.length) return NextResponse.json({ ok: true, synced: 0 });

  // Serial — 500ms gap to respect Shopify rate limits
  const results = [];
  for (const { store_id } of stores) {
    try {
      const res = await fetch(`${baseUrl}/api/pnl/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store_id, secret: process.env.PNL_SYNC_SECRET, daysBack: 3 }),
      });
      results.push({ store_id, ok: res.ok });
    } catch {
      results.push({ store_id, ok: false });
    }
    await new Promise(r => setTimeout(r, 500));
  }

  return NextResponse.json({ ok: true, synced: stores.length, results });
}
