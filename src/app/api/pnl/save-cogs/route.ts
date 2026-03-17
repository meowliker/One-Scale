import { NextRequest, NextResponse } from 'next/server';
import { upsertPersistentProductCost } from '@/app/api/lib/supabase-persistence';

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    const body = await request.json() as { updates: Record<string, { cost_per_unit: number; title: string }> };

    if (!body.updates || typeof body.updates !== 'object') {
      return NextResponse.json({ error: 'updates object is required' }, { status: 400 });
    }

    const promises = Object.entries(body.updates).map(([productId, data]) =>
      upsertPersistentProductCost({
        storeId,
        productId,
        productName: data.title || 'Unknown',
        costPerUnit: data.cost_per_unit,
      })
    );

    await Promise.all(promises);

    return NextResponse.json({ ok: true, updated: Object.keys(body.updates).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
