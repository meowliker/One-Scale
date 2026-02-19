import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaAds, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { getLatestMetaEndpointSnapshot, getMetaEndpointSnapshot, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import type { Ad } from '@/types/campaign';

const adCache = new Map<string, { at: number; data: Ad[] }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFallbackCache(prefix: string): { at: number; data: Ad[] } | null {
  let best: { at: number; data: Ad[] } | null = null;
  for (const [key, value] of adCache.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (!best || value.at > best.at) best = value;
  }
  return best;
}

function hasAdSignal(rows: Ad[]): boolean {
  return rows.some((row) =>
    (row.metrics?.spend || 0) > 0 ||
    (row.metrics?.impressions || 0) > 0 ||
    (row.metrics?.conversions || 0) > 0
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const adsetId = searchParams.get('adsetId');
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  const strictDate = searchParams.get('strictDate') === '1';
  const mode = searchParams.get('mode') || 'fast';
  const preferCache = searchParams.get('preferCache') === '1';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (!adsetId) {
    return NextResponse.json({ error: 'adsetId is required' }, { status: 400 });
  }

  const dateRange = since && until ? { since, until } : undefined;
  const cacheKey = [storeId, adsetId, since || '', until || '', strictDate ? 'strict' : 'flex', mode].join('|');
  const exactVariant = `mode:${mode}|since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;
  const cached = adCache.get(cacheKey);
  const cachedByAdSet = findFallbackCache(`${storeId}|${adsetId}|`);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ data: cached.data, cached: true });
  }

  if (preferCache) {
    const exactSnapshot = getMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adsetId, exactVariant);
    if (exactSnapshot && exactSnapshot.data.length > 0) {
      return NextResponse.json({
        data: exactSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: exactSnapshot.updatedAt,
        staleReason: 'snapshot_exact_fast',
      });
    }
    const modeSnapshot = getMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adsetId, `mode:${mode}`);
    if (modeSnapshot && modeSnapshot.data.length > 0) {
      return NextResponse.json({
        data: modeSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: modeSnapshot.updatedAt,
        staleReason: 'snapshot_mode_fast',
      });
    }
    const latestSnapshot = getLatestMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adsetId);
    if (latestSnapshot && latestSnapshot.data.length > 0) {
      return NextResponse.json({
        data: latestSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: latestSnapshot.updatedAt,
        staleReason: 'snapshot_latest_fast',
      });
    }
  }

  const token = getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    const preferLightweight = mode === 'basic' || mode === 'audit';
    const basicOnly = mode === 'basic';

    let ads: Ad[] | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fetchTask = fetchMetaAds(token.accessToken, adsetId, dateRange, {
          disableDateFallback: strictDate,
          preferLightweight,
          basicOnly,
        });
        ads = mode === 'audit'
          ? await Promise.race([
              fetchTask,
              new Promise<Ad[]>((_, reject) =>
                setTimeout(() => reject(new Error('Ads audit timeout')), 18_000)
              ),
            ])
          : await fetchTask;
        break;
      } catch (err) {
        if (err instanceof MetaRateLimitError && attempt === 0) {
          await sleep(600);
          continue;
        }
        throw err;
      }
    }

    if (!ads) throw new Error('Failed to fetch ads');
    adCache.set(cacheKey, { at: Date.now(), data: ads });
    upsertMetaEndpointSnapshot(storeId, 'ads', adsetId, exactVariant, ads);
    upsertMetaEndpointSnapshot(storeId, 'ads', adsetId, 'latest', ads);
    if (hasAdSignal(ads)) {
      upsertMetaEndpointSnapshot(storeId, 'ads', adsetId, `mode:${mode}`, ads);
    }
    return NextResponse.json({ data: ads });
  } catch (err) {
    if (cached || cachedByAdSet) {
      const fallback = cached || cachedByAdSet!;
      return NextResponse.json({ data: fallback.data, cached: true, stale: true });
    }

    const exactSnapshot = getMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adsetId, exactVariant);
    if (exactSnapshot && exactSnapshot.data.length > 0) {
      adCache.set(cacheKey, { at: Date.now(), data: exactSnapshot.data });
      return NextResponse.json({
        data: exactSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: exactSnapshot.updatedAt,
      });
    }

    const snapshot = getLatestMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adsetId);
    if (snapshot && snapshot.data.length > 0) {
      adCache.set(cacheKey, { at: Date.now(), data: snapshot.data });
      return NextResponse.json({
        data: snapshot.data,
        cached: true,
        stale: true,
        snapshotAt: snapshot.updatedAt,
      });
    }

    if (mode !== 'audit') {
      try {
        const basicAds = await fetchMetaAds(token.accessToken, adsetId, dateRange, {
          disableDateFallback: strictDate,
          preferLightweight: true,
          basicOnly: true,
        });
        adCache.set(cacheKey, { at: Date.now(), data: basicAds });
        return NextResponse.json({ data: basicAds, fallbackMode: 'basic' });
      } catch {
        // continue
      }
    }
    // Return 429 for rate limit errors so client can show a specific message
    if (err instanceof MetaRateLimitError) {
      return NextResponse.json(
        { error: 'Rate limited by Meta. Please wait a minute and try again.', rateLimited: true },
        { status: 429 }
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch ads';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
