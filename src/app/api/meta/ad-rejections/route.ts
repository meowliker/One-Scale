import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

interface MetaAd {
  id: string;
  name: string;
  effective_status: string;
  updated_time: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase persistence not enabled' }, { status: 500 });
  }

  const accounts = await rest<Array<{ ad_account_id: string }>>(
    `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.true&select=ad_account_id`
  );

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, rejectedAds: [] });
  }

  try {
    const cutoff = Date.now() - TWELVE_HOURS_MS;

    const results = await Promise.all(
      accounts.map(async ({ ad_account_id }) => {
        const metaRes = await fetch(
          `https://graph.facebook.com/v21.0/${ad_account_id}/ads?fields=id,name,effective_status,updated_time&effective_status=["DISAPPROVED","WITH_ISSUES"]&limit=100&access_token=${token.accessToken}`
        );

        if (!metaRes.ok) return [];

        const json = await metaRes.json();
        const ads: MetaAd[] = json.data ?? [];

        return ads
          .filter((ad) => new Date(ad.updated_time).getTime() >= cutoff)
          .map((ad) => ({
            id: ad.id,
            name: ad.name,
            status: ad.effective_status,
            updatedAt: ad.updated_time,
            adAccountId: ad_account_id,
          }));
      })
    );

    return NextResponse.json({ ok: true, rejectedAds: results.flat() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch ad rejections';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
