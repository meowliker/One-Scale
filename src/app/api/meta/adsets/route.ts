import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaAdSets, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { getLatestMetaEndpointSnapshot, getMetaEndpointSnapshot, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import {
  getPersistentMetaEndpointSnapshot,
  getLatestPersistentMetaEndpointSnapshot,
  upsertPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';
import { enqueueMetaSyncTask, isMetaCallBlocked, markMetaRateLimited } from '@/app/api/lib/meta-sync-queue';
import type { AdSet } from '@/types/campaign';

const adSetCache = new Map<string, { at: number; data: AdSet[] }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const BACKGROUND_REFRESH_MS = 90 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isYesterdayRange(since: string | null, until: string | null): boolean {
  if (!since || !until || since !== until) return false;
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yStr = yesterday.toISOString().split('T')[0];
  return since === yStr;
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

async function persistAdSets(
  useSupabase: boolean,
  storeId: string,
  campaignId: string,
  exactVariant: string,
  mode: string,
  adSets: AdSet[]
) {
  if (useSupabase) {
    await Promise.all([
      upsertPersistentMetaEndpointSnapshot(storeId, 'adsets', campaignId, exactVariant, adSets),
      upsertPersistentMetaEndpointSnapshot(storeId, 'adsets', campaignId, 'latest', adSets),
      hasAdSetSignal(adSets)
        ? upsertPersistentMetaEndpointSnapshot(storeId, 'adsets', campaignId, `mode:${mode}`, adSets)
        : Promise.resolve(),
    ]);
    return;
  }

  upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, exactVariant, adSets);
  upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, 'latest', adSets);
  if (hasAdSetSignal(adSets)) {
    upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, `mode:${mode}`, adSets);
  }
}

async function readCachedSnapshot(
  useSupabase: boolean,
  storeId: string,
  campaignId: string,
  exactVariant: string,
  mode: string
): Promise<{ data: AdSet[]; updatedAt?: string } | null> {
  const exactSnapshot = useSupabase
    ? await getPersistentMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId, exactVariant)
    : getMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId, exactVariant);
  if (exactSnapshot && exactSnapshot.data.length > 0) {
    return { data: exactSnapshot.data, updatedAt: exactSnapshot.updatedAt };
  }

  const modeSnapshot = useSupabase
    ? await getPersistentMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId, `mode:${mode}`)
    : getMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId, `mode:${mode}`);
  if (modeSnapshot && modeSnapshot.data.length > 0) {
    return { data: modeSnapshot.data, updatedAt: modeSnapshot.updatedAt };
  }

  const latestSnapshot = useSupabase
    ? await getLatestPersistentMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId)
    : getLatestMetaEndpointSnapshot<AdSet[]>(storeId, 'adsets', campaignId);
  if (latestSnapshot && latestSnapshot.data.length > 0) {
    return { data: latestSnapshot.data, updatedAt: latestSnapshot.updatedAt };
  }

  return null;
}

function queueAdSetRefresh(args: {
  storeId: string;
  campaignId: string;
  since: string | null;
  until: string | null;
  strictDate: boolean;
  mode: string;
  useSupabase: boolean;
  minIntervalMs: number;
}) {
  const { storeId, campaignId, since, until, strictDate, mode, useSupabase, minIntervalMs } = args;
  const taskKey = `adsets:${storeId}:${campaignId}:${since || ''}:${until || ''}:${strictDate ? '1' : '0'}:${mode}`;

  enqueueMetaSyncTask(taskKey, minIntervalMs, async () => {
    if (isMetaCallBlocked(storeId)) return;

    const token = await getMetaToken(storeId);
    if (!token) return;

    const detectedDatePreset = isYesterdayRange(since, until) ? 'yesterday' : undefined;
    const dateRange = !detectedDatePreset && since && until ? { since, until } : undefined;
    const exactVariant = `mode:${mode}|since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;

    try {
      const adSets = await fetchMetaAdSets(token.accessToken, campaignId, dateRange, {
        disableDateFallback: strictDate,
        preferLightweight: mode === 'basic' || mode === 'audit',
        basicOnly: mode === 'basic',
        datePreset: detectedDatePreset,
      });
      const cacheKey = [storeId, campaignId, since || '', until || '', strictDate ? 'strict' : 'flex', mode].join('|');
      adSetCache.set(cacheKey, { at: Date.now(), data: adSets });
      await persistAdSets(useSupabase, storeId, campaignId, exactVariant, mode, adSets);
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
  const campaignId = searchParams.get('campaignId');
  const campaignIds = searchParams.get('campaignIds'); // comma-separated batch
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  const strictDate = searchParams.get('strictDate') === '1';
  const mode = searchParams.get('mode') || 'fast';
  const preferCache = searchParams.get('preferCache') !== '0';
  const forceLive = searchParams.get('forceLive') === '1';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const useSupabase = isSupabasePersistenceEnabled();

  // Batch mode: fetch adsets for multiple campaigns in one request
  if (campaignIds) {
    const ids = campaignIds.split(',').filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'campaignIds must contain at least one ID' }, { status: 400 });
    }

    const results: Record<string, AdSet[]> = {};
    const missing: string[] = [];

    for (const id of ids) {
      const cacheKey = [storeId, id, since || '', until || '', strictDate ? 'strict' : 'flex', mode].join('|');
      const cached = adSetCache.get(cacheKey);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS && !forceLive) {
        results[id] = cached.data;
        continue;
      }

      if (preferCache && !forceLive) {
        const exactVariant = `mode:${mode}|since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;
        const snap = await readCachedSnapshot(useSupabase, storeId, id, exactVariant, mode);
        if (snap && snap.data.length > 0) {
          results[id] = snap.data;
          adSetCache.set(cacheKey, { at: Date.now(), data: snap.data });
          queueAdSetRefresh({
            storeId,
            campaignId: id,
            since,
            until,
            strictDate,
            mode,
            useSupabase,
            minIntervalMs: BACKGROUND_REFRESH_MS,
          });
          continue;
        }
      }

      missing.push(id);
    }

    if (missing.length === 0) {
      return NextResponse.json({ data: results, cached: true });
    }

    if (isMetaCallBlocked(storeId)) {
      return NextResponse.json(
        { data: results, partial: true, rateLimited: true, error: 'Meta sync cooling down' },
        { status: Object.keys(results).length > 0 ? 200 : 429, headers: { 'Retry-After': '60' } }
      );
    }

    const token = await getMetaToken(storeId);
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
    }

    const batchDetectedDatePreset = isYesterdayRange(since, until) ? 'yesterday' : undefined;
    const dateRange = !batchDetectedDatePreset && since && until ? { since, until } : undefined;

    try {
      for (const id of missing) {
        const adSets = await fetchMetaAdSets(token.accessToken, id, dateRange, {
          disableDateFallback: strictDate,
          preferLightweight: mode === 'basic' || mode === 'audit',
          basicOnly: mode === 'basic',
          datePreset: batchDetectedDatePreset,
        });
        results[id] = adSets;

        const exactVariant = `mode:${mode}|since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;
        const cacheKey = [storeId, id, since || '', until || '', strictDate ? 'strict' : 'flex', mode].join('|');
        adSetCache.set(cacheKey, { at: Date.now(), data: adSets });
        await persistAdSets(useSupabase, storeId, id, exactVariant, mode, adSets);
        await sleep(200);
      }
      return NextResponse.json({ data: results });
    } catch (err) {
      if (err instanceof MetaRateLimitError) {
        markMetaRateLimited(storeId, 60);
        return NextResponse.json(
          { data: results, partial: true, rateLimited: true, error: 'Rate limited by Meta' },
          { status: Object.keys(results).length > 0 ? 200 : 429, headers: { 'Retry-After': '60' } }
        );
      }
      const message = err instanceof Error ? err.message : 'Failed to fetch ad sets';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
  }

  const singleDetectedDatePreset = isYesterdayRange(since, until) ? 'yesterday' : undefined;
  const dateRange = !singleDetectedDatePreset && since && until ? { since, until } : undefined;
  const cacheKey = [storeId, campaignId, since || '', until || '', strictDate ? 'strict' : 'flex', mode].join('|');
  const exactVariant = `mode:${mode}|since:${since || ''}|until:${until || ''}|strict:${strictDate ? '1' : '0'}`;
  const cached = adSetCache.get(cacheKey);
  const prefix = `${storeId}|${campaignId}|`;
  const cachedByCampaign = findFallbackCache(prefix);

  if (!forceLive && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    queueAdSetRefresh({
      storeId,
      campaignId,
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
    const snap = await readCachedSnapshot(useSupabase, storeId, campaignId, exactVariant, mode);
    if (snap && snap.data.length > 0) {
      adSetCache.set(cacheKey, { at: Date.now(), data: snap.data });
      queueAdSetRefresh({
        storeId,
        campaignId,
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

  if (isMetaCallBlocked(storeId)) {
    if (cached || cachedByCampaign) {
      const fallback = cached || cachedByCampaign!;
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
    const adSets = await fetchMetaAdSets(token.accessToken, campaignId, dateRange, {
      disableDateFallback: strictDate,
      preferLightweight: mode === 'basic' || mode === 'audit',
      basicOnly: mode === 'basic',
      datePreset: singleDetectedDatePreset,
    });

    adSetCache.set(cacheKey, { at: Date.now(), data: adSets });
    await persistAdSets(useSupabase, storeId, campaignId, exactVariant, mode, adSets);
    return NextResponse.json({ data: adSets });
  } catch (err) {
    if (err instanceof MetaRateLimitError) {
      markMetaRateLimited(storeId, 60);
    }

    if (cached || cachedByCampaign) {
      const fallback = cached || cachedByCampaign!;
      return NextResponse.json({ data: fallback.data, cached: true, stale: true });
    }

    const snap = await readCachedSnapshot(useSupabase, storeId, campaignId, exactVariant, mode);
    if (snap && snap.data.length > 0) {
      adSetCache.set(cacheKey, { at: Date.now(), data: snap.data });
      return NextResponse.json({
        data: snap.data,
        cached: true,
        stale: true,
        snapshotAt: snap.updatedAt,
      });
    }

    if (mode !== 'audit') {
      try {
        const basicAdSets = await fetchMetaAdSets(token.accessToken, campaignId, dateRange, {
          disableDateFallback: strictDate,
          preferLightweight: true,
          basicOnly: true,
          datePreset: singleDetectedDatePreset,
        });
        adSetCache.set(cacheKey, { at: Date.now(), data: basicAdSets });
        return NextResponse.json({ data: basicAdSets, fallbackMode: 'basic' });
      } catch {
        // continue to error response below
      }
    }

    if (err instanceof MetaRateLimitError) {
      return NextResponse.json(
        { error: 'Rate limited by Meta. Please wait a minute and try again.', rateLimited: true },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const message = err instanceof Error ? err.message : 'Failed to fetch ad sets';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
