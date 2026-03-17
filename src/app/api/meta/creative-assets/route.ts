import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getPersistentCreativeAssets } from '@/app/api/lib/supabase-tracking';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const adIdsParam = searchParams.get('adIds');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (!adIdsParam) {
    return NextResponse.json({ error: 'adIds is required' }, { status: 400 });
  }

  const adIds = adIdsParam.split(',').filter(Boolean);
  if (adIds.length === 0) {
    return NextResponse.json({ data: {} });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ data: {}, message: 'Supabase persistence not enabled' });
  }

  try {
    const assetsMap = await getPersistentCreativeAssets(storeId, adIds);
    
    // Convert Map to plain object for JSON response
    const data: Record<string, {
      adId: string;
      creativeType: 'image' | 'video';
      mediaUrl: string | null;
      thumbnailUrl: string | null;
      videoId: string | null;
      headline: string | null;
      body: string | null;
      ctaType: string | null;
      destinationUrl: string | null;
      cachedAt: string;
    }> = {};

    for (const [adId, asset] of assetsMap) {
      data[adId] = asset;
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error('[creative-assets] Error fetching cached assets:', err);
    return NextResponse.json({ error: 'Failed to fetch cached assets' }, { status: 500 });
  }
}
