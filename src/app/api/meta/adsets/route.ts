import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaAdSets, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { getLatestMetaEndpointSnapshot, getMetaEndpointSnapshot, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import type { AdSet } from '@/types/campaign';

const adSetCache = new Map<string, { at: number; data: AdSet[] }>();
const CACHE_TTL_MS = 30 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFallbackCache(prefix: string): { at: number; data: AdSet[] } | null {
  let best: { at: number; data: AdSet[] } | null = null;
  for (const [key, value] of adSetCache.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (!best || value.at > best.at) best = value;
  }
  return best;
}

function hasAdSetSignal(rows: AdSet[]): boolean {
  return rows.some((row) =>
    (row.metrics?.spend || 0) > 0 ||
    (row.metrics?.impressions || 0) > 0 ||
    (row.metrics?.conversions || 0) > 0
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const campaignId = searchParams.get('campaignId');
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  const strictDate = searchParams.get('strictDate') === '1';
  const mode = searchParams.get('mode') || 'fast';
  const preferCache = searchParams.get('preferCache') === '1';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }

  const dateRange = since && until ? { since, until } : undefined;
  const cacheKey = [storeId, campaignId, since || '', until || '', strictDate ? 'strict' : 'flex', mode].join('|');
  const exactVariant = `mode:${mode}|since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;
  const cached = adSetCache.get(cacheKey);
  const prefix = `${storeId}|${campaignId}|`;
  const cachedByCampaign = findFallbackCache(prefix);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ data: cached.data, cached: true });
  }

  if (preferCache) {
    const exactSnapshot = getMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId, exactVariant);
    if (exactSnapshot && exactSnapshot.data.length > 0) {
      return NextResponse.json({
        data: exactSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: exactSnapshot.updatedAt,
        staleReason: 'snapshot_exact_fast',
      });
    }
    const modeSnapshot = getMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId, `mode:${mode}`);
    if (modeSnapshot && modeSnapshot.data.length > 0) {
      return NextResponse.json({
        data: modeSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: modeSnapshot.updatedAt,
        staleReason: 'snapshot_mode_fast',
      });
    }
    const latestSnapshot = getLatestMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId);
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
    let adSets: AdSet[] | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fetchTask = fetchMetaAdSets(token.accessToken, campaignId, dateRange, {
          disableDateFallback: strictDate,
          preferLightweight,
          basicOnly,
        });
        adSets = mode === 'audit'
          ? await Promise.race([
              fetchTask,
              new Promise<AdSet[]>((_, reject) =>
                setTimeout(() => reject(new Error('Adsets audit timeout')), 18_000)
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

    if (!adSets) {
      throw new Error('Failed to fetch ad sets');
    }
    adSetCache.set(cacheKey, { at: Date.now(), data: adSets });
    upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, exactVariant, adSets);
    upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, 'latest', adSets);
    if (hasAdSetSignal(adSets)) {
      upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, `mode:${mode}`, adSets);
    }
    return NextResponse.json({ data: adSets });
  } catch (err) {
    // Fallback to stale cache when Meta is unavailable/rate-limited.
    if (cached || cachedByCampaign) {
      const fallback = cached || cachedByCampaign!;
      return NextResponse.json({ data: fallback.data, cached: true, stale: true });
    }

    const exactSnapshot = getMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId, exactVariant);
    if (exactSnapshot && exactSnapshot.data.length > 0) {
      adSetCache.set(cacheKey, { at: Date.now(), data: exactSnapshot.data });
      return NextResponse.json({
        data: exactSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: exactSnapshot.updatedAt,
      });
    }

    const snapshot = getLatestMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId);
    if (snapshot && snapshot.data.length > 0) {
      adSetCache.set(cacheKey, { at: Date.now(), data: snapshot.data });
      return NextResponse.json({
        data: snapshot.data,
        cached: true,
        stale: true,
        snapshotAt: snapshot.updatedAt,
      });
    }

    // Final fallback: return basic ad sets for non-audit modes only.
    if (mode !== 'audit') {
      try {
        const basicAdSets = await fetchMetaAdSets(token.accessToken, campaignId, dateRange, {
          disableDateFallback: strictDate,
          preferLightweight: true,
          basicOnly: true,
        });
        adSetCache.set(cacheKey, { at: Date.now(), data: basicAdSets });
        return NextResponse.json({ data: basicAdSets, fallbackMode: 'basic' });
      } catch {
        // continue to error response below
      }
    }

    // Return 429 for rate limit errors so client can show a specific message
    if (err instanceof MetaRateLimitError) {
      return NextResponse.json(
        { error: 'Rate limited by Meta. Please wait a minute and try again.', rateLimited: true },
        { status: 429 }
      );
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch ad sets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
