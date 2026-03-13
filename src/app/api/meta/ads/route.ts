import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaAds, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { getLatestMetaEndpointSnapshot, getMetaEndpointSnapshot, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import {
  getPersistentMetaEndpointSnapshot,
  getLatestPersistentMetaEndpointSnapshot,
  upsertPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';
import { enqueueMetaSyncTask, isMetaCallBlocked, markMetaRateLimited } from '@/app/api/lib/meta-sync-queue';
import type { Ad } from '@/types/campaign';

const adCache = new Map<string, { at: number; data: Ad[] }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const BACKGROUND_REFRESH_MS = 90 * 1000;

function detectSingleDayPreset(since: string | null, until: string | null): 'today' | 'yesterday' | undefined {
  if (!since || !until || since !== until) return undefined;
  const target = new Date(`${since}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return undefined;
  const todayUtc = new Date();
  const todayUtcStr = todayUtc.toISOString().split('T')[0];
  const todayStart = new Date(`${todayUtcStr}T00:00:00Z`);
  const diffDays = Math.round((todayStart.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1 || diffDays === 2) return 'yesterday';
  return undefined;
}

function hasAdSignal(rows: Ad[]): boolean {
  return rows.some((row) =>
    (row.metrics?.spend || 0) > 0 ||
    (row.metrics?.impressions || 0) > 0 ||
    (row.metrics?.conversions || 0) > 0
  );
}

function findFallbackCache(prefix: string): { at: number; data: Ad[] } | null {
  let best: { at: number; data: Ad[] } | null = null;
  for (const [key, value] of adCache.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (!best || value.at > best.at) best = value;
  }
  return best;
}

async function persistAds(
  useSupabase: boolean,
  storeId: string,
  adSetId: string,
  exactVariant: string,
  mode: string,
  ads: Ad[]
) {
  if (useSupabase) {
    await Promise.all([
      upsertPersistentMetaEndpointSnapshot(storeId, 'ads', adSetId, exactVariant, ads),
      upsertPersistentMetaEndpointSnapshot(storeId, 'ads', adSetId, 'latest', ads),
      hasAdSignal(ads)
        ? upsertPersistentMetaEndpointSnapshot(storeId, 'ads', adSetId, `mode:${mode}`, ads)
        : Promise.resolve(),
    ]);
    return;
  }

  upsertMetaEndpointSnapshot(storeId, 'ads', adSetId, exactVariant, ads);
  upsertMetaEndpointSnapshot(storeId, 'ads', adSetId, 'latest', ads);
  if (hasAdSignal(ads)) {
    upsertMetaEndpointSnapshot(storeId, 'ads', adSetId, `mode:${mode}`, ads);
  }
}

async function readCachedSnapshot(
  useSupabase: boolean,
  storeId: string,
  adSetId: string,
  exactVariant: string,
  mode: string
): Promise<{ data: Ad[]; updatedAt?: string } | null> {
  // First try exact variant match
  const exactSnapshot = useSupabase
    ? await getPersistentMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSetId, exactVariant)
    : getMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSetId, exactVariant);
  if (exactSnapshot && exactSnapshot.data.length > 0) {
    return { data: exactSnapshot.data, updatedAt: exactSnapshot.updatedAt };
  }

  // Always check 'latest' variant (populated by cron sync)
  const latestSnapshot = useSupabase
    ? await getPersistentMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSetId, 'latest')
    : getMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSetId, 'latest');
  if (latestSnapshot && latestSnapshot.data.length > 0) {
    return { data: latestSnapshot.data, updatedAt: latestSnapshot.updatedAt };
  }

  // Try mode-specific snapshot
  const modeSnapshot = useSupabase
    ? await getPersistentMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSetId, `mode:${mode}`)
    : getMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSetId, `mode:${mode}`);
  if (modeSnapshot && modeSnapshot.data.length > 0) {
    return { data: modeSnapshot.data, updatedAt: modeSnapshot.updatedAt };
  }

  // Try any available snapshot
  const anySnapshot = useSupabase
    ? await getLatestPersistentMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSetId)
    : getLatestMetaEndpointSnapshot<Ad[]>(storeId, 'ads', adSetId);
  if (anySnapshot && anySnapshot.data.length > 0) {
    return { data: anySnapshot.data, updatedAt: anySnapshot.updatedAt };
  }

  return null;
}

function queueAdsRefresh(args: {
  storeId: string;
  adSetId: string;
  since: string | null;
  until: string | null;
  strictDate: boolean;
  mode: string;
  useSupabase: boolean;
  minIntervalMs: number;
}) {
  const { storeId, adSetId, since, until, strictDate, mode, useSupabase, minIntervalMs } = args;
  const taskKey = `ads:${storeId}:${adSetId}:${since || ''}:${until || ''}:${strictDate ? '1' : '0'}:${mode}`;

  enqueueMetaSyncTask(taskKey, minIntervalMs, async () => {
    if (isMetaCallBlocked(storeId)) return;

    const token = await getMetaToken(storeId);
    if (!token) return;

    const bgDetectedDatePreset = detectSingleDayPreset(since, until);
    const dateRange = !bgDetectedDatePreset && since && until ? { since, until } : undefined;
    const exactVariant = `mode:${mode}|since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;

    try {
      const ads = await fetchMetaAds(token.accessToken, adSetId, dateRange, {
        disableDateFallback: strictDate,
        preferLightweight: true,
        basicOnly: mode === 'basic',
        datePreset: bgDetectedDatePreset,
      });
      const cacheKey = [storeId, adSetId, since || '', until || '', strictDate ? 'strict' : 'flex', mode].join('|');
      adCache.set(cacheKey, { at: Date.now(), data: ads });
      await persistAds(useSupabase, storeId, adSetId, exactVariant, mode, ads);
    } catch (err) {
      if (err instanceof MetaRateLimitError) {
        markMetaRateLimited(storeId, 60);
      }
    }
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const adsetId = searchParams.get('adsetId');
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  const strictDate = searchParams.get('strictDate') === '1';
  const mode = searchParams.get('mode') || 'fast';
  const preferCache = searchParams.get('preferCache') !== '0';
  const forceLive = searchParams.get('forceLive') === '1';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (!adsetId) {
    return NextResponse.json({ error: 'adsetId is required' }, { status: 400 });
  }

  const useSupabase = isSupabasePersistenceEnabled();
  const detectedDatePreset = detectSingleDayPreset(since, until);
  const dateRange = !detectedDatePreset && since && until ? { since, until } : undefined;
  const cacheKey = [storeId, adsetId, since || '', until || '', strictDate ? 'strict' : 'flex', mode].join('|');
  const exactVariant = `mode:${mode}|since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;
  const cached = adCache.get(cacheKey);
  const cachedByAdSet = findFallbackCache(`${storeId}|${adsetId}|`);

  if (!forceLive && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    queueAdsRefresh({
      storeId,
      adSetId: adsetId,
      since,
      until,
      strictDate,
      mode,
      useSupabase,
      minIntervalMs: BACKGROUND_REFRESH_MS,
    });
    return NextResponse.json({ data: cached.data, cached: true });
  }

  if (preferCache && !forceLive) {
    const snap = await readCachedSnapshot(useSupabase, storeId, adsetId, exactVariant, mode);
    if (snap && snap.data.length > 0 && (!strictDate || hasAdSignal(snap.data))) {
      adCache.set(cacheKey, { at: Date.now(), data: snap.data });
      queueAdsRefresh({
        storeId,
        adSetId: adsetId,
        since,
        until,
        strictDate,
        mode,
        useSupabase,
        minIntervalMs: BACKGROUND_REFRESH_MS,
      });
      return NextResponse.json({
        data: snap.data,
        cached: true,
        stale: true,
        snapshotAt: snap.updatedAt,
      });
    }
  }

  // No cache available - fetch live data (user is actively expanding this ad set)

  if (isMetaCallBlocked(storeId)) {
    if (cached || cachedByAdSet) {
      const fallback = cached || cachedByAdSet!;
      return NextResponse.json({ data: fallback.data, cached: true, stale: true });
    }
    return NextResponse.json(
      { error: 'Rate limited by Meta. Cooling down and retrying in background.', rateLimited: true },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    const ads = await fetchMetaAds(token.accessToken, adsetId, dateRange, {
      disableDateFallback: strictDate,
      preferLightweight: mode === 'basic' || mode === 'audit',
      basicOnly: mode === 'basic',
      datePreset: detectedDatePreset,
    });

    adCache.set(cacheKey, { at: Date.now(), data: ads });
    await persistAds(useSupabase, storeId, adsetId, exactVariant, mode, ads);
    return NextResponse.json({ data: ads });
  } catch (err) {
    if (err instanceof MetaRateLimitError) {
      markMetaRateLimited(storeId, 60);
    }

    if (cached || cachedByAdSet) {
      const fallback = cached || cachedByAdSet!;
      return NextResponse.json({ data: fallback.data, cached: true, stale: true });
    }

    const snap = await readCachedSnapshot(useSupabase, storeId, adsetId, exactVariant, mode);
    if (snap && snap.data.length > 0) {
      adCache.set(cacheKey, { at: Date.now(), data: snap.data });
      return NextResponse.json({
        data: snap.data,
        cached: true,
        stale: true,
        snapshotAt: snap.updatedAt,
      });
    }

    if (mode !== 'audit') {
      try {
        const basicAds = await fetchMetaAds(token.accessToken, adsetId, dateRange, {
          disableDateFallback: strictDate,
          preferLightweight: true,
          basicOnly: true,
          datePreset: detectedDatePreset,
        });
        adCache.set(cacheKey, { at: Date.now(), data: basicAds });
        return NextResponse.json({ data: basicAds, fallbackMode: 'basic' });
      } catch {
        // continue
      }
    }

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
