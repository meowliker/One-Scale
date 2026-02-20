import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta, fetchMetaInsights, fetchMetaHourlyInsights, mapInsightsToMetrics } from '@/app/api/lib/meta-client';
import { getMetaEndpointSnapshot, getLatestMetaEndpointSnapshot, getStoreAdAccounts, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import {
  getPersistentMetaEndpointSnapshot,
  getLatestPersistentMetaEndpointSnapshot,
  upsertPersistentMetaEndpointSnapshot,
} from '@/app/api/lib/supabase-tracking';

type MetricMap = Record<string, number>;

function accumulateMetrics(target: MetricMap, incoming: MetricMap) {
  target.spend += incoming.spend;
  target.revenue += incoming.revenue;
  target.impressions += incoming.impressions;
  target.reach += incoming.reach;
  target.clicks += incoming.clicks;
  target.conversions += incoming.conversions;
  target.addToCart += incoming.addToCart;
  target.addToCartValue += incoming.addToCartValue;
  target.initiateCheckout += incoming.initiateCheckout;
  target.leads += incoming.leads;
  target.linkClicks += incoming.linkClicks;
  target.postEngagement += incoming.postEngagement;
  target.postReactions += incoming.postReactions;
  target.postComments += incoming.postComments;
  target.postShares += incoming.postShares;
  target.pageLikes += incoming.pageLikes;
  target.videoViews += incoming.videoViews;
  target.videoThruPlays += incoming.videoThruPlays;
  target.uniqueClicks += incoming.uniqueClicks;
  target.landingPageViews += incoming.landingPageViews;
  target.purchases += incoming.purchases;
  target.purchaseValue += incoming.purchaseValue;
  target.results += incoming.results;
}

function finalizeDerivedMetrics(m: MetricMap) {
  m.roas = m.spend > 0 ? m.revenue / m.spend : 0;
  m.ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
  m.cpc = m.clicks > 0 ? m.spend / m.clicks : 0;
  m.cpm = m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0;
  m.aov = m.conversions > 0 ? m.revenue / m.conversions : 0;
  m.frequency = m.reach > 0 ? m.impressions / m.reach : 0;
  m.cvr = m.clicks > 0 ? (m.conversions / m.clicks) * 100 : 0;
  m.cpa = m.conversions > 0 ? m.spend / m.conversions : 0;
  m.costPerResult = m.conversions > 0 ? m.spend / m.conversions : 0;
  m.costPerLead = m.leads > 0 ? m.spend / m.leads : 0;
  m.linkCTR = m.impressions > 0 ? (m.linkClicks / m.impressions) * 100 : 0;
  m.costPerLinkClick = m.linkClicks > 0 ? m.spend / m.linkClicks : 0;
  m.uniqueCTR = m.reach > 0 ? (m.uniqueClicks / m.reach) * 100 : 0;
  m.costPerLandingPageView = m.landingPageViews > 0 ? m.spend / m.landingPageViews : 0;
  m.costPerThruPlay = m.videoThruPlays > 0 ? m.spend / m.videoThruPlays : 0;
}

function normalizeBreakdownKey(value: string | null): string {
  if (!value) return '';
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .sort()
    .join(',');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const objectId = searchParams.get('objectId');
  const accountIds = searchParams.get('accountIds');
  const datePreset = searchParams.get('datePreset') || 'last_30d';
  const breakdowns = searchParams.get('breakdowns');
  const preferCache = searchParams.get('preferCache') === '1';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const useSupabase = isSupabasePersistenceEnabled();

  // Determine which accounts to fetch insights for
  let targetIds: string[] = [];
  if (objectId) {
    targetIds = [objectId];
  } else if (accountIds) {
    targetIds = accountIds.split(',').filter(Boolean);
  } else {
    const mapped = useSupabase
      ? await listPersistentStoreAdAccounts(storeId)
      : getStoreAdAccounts(storeId);
    targetIds = mapped
      .filter((a) => a.platform === 'meta' && a.is_active === 1)
      .map((a) => a.ad_account_id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ error: 'No ad accounts to fetch insights for' }, { status: 400 });
  }

  const sortedTargetIds = [...new Set(targetIds)].sort();
  const scopeId = objectId ? `object:${objectId}` : `accounts:${sortedTargetIds.join(',')}`;
  const normalizedBreakdowns = normalizeBreakdownKey(breakdowns);
  const variantKind = normalizedBreakdowns === 'hourly_stats_aggregated_by_advertiser_time_zone'
    ? 'hourly'
    : (normalizedBreakdowns ? `breakdown:${normalizedBreakdowns}` : 'daily');
  const exactVariant = `${variantKind}|preset:${datePreset}`;
  const last30Variant = `${variantKind}|preset:last_30d`;
  const latestVariant = `latest:${variantKind}`;
  const isStrictPresetRequest = datePreset !== 'last_30d';

  if (preferCache) {
    const exactSnapshot = useSupabase
      ? await getPersistentMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, exactVariant)
      : getMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, exactVariant);
    if (exactSnapshot && exactSnapshot.data.length > 0) {
      return NextResponse.json({
        data: exactSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: exactSnapshot.updatedAt,
        staleReason: 'snapshot_exact_fast',
      });
    }
    if (!isStrictPresetRequest) {
      const last30Snapshot = useSupabase
        ? await getPersistentMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, last30Variant)
        : getMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, last30Variant);
      if (last30Snapshot && last30Snapshot.data.length > 0) {
        return NextResponse.json({
          data: last30Snapshot.data,
          cached: true,
          stale: true,
          snapshotAt: last30Snapshot.updatedAt,
          staleReason: 'snapshot_last_30d_fast',
        });
      }
    }
    if (!isStrictPresetRequest) {
      const latestExact = useSupabase
        ? await getPersistentMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, latestVariant)
        : getMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, latestVariant);
      const latestSnapshot = latestExact
        || (useSupabase
          ? await getLatestPersistentMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId)
          : getLatestMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId));
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
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {

    // --- Hourly breakdown path ---
    if (breakdowns === 'hourly_stats_aggregated_by_advertiser_time_zone') {
      const allHourlyInsights = await Promise.all(
        sortedTargetIds.map((id) =>
          fetchMetaHourlyInsights(token.accessToken, id, datePreset).catch(() => [])
        )
      );

      // Aggregate hourly insights across all accounts
      // Key: "date|hour", Value: aggregated metrics
      const hourlyMap = new Map<string, Record<string, number>>();

      for (const accountInsights of allHourlyInsights) {
        for (const row of accountInsights) {
          const date = row.date_start;
          // Parse hour from "hourly_stats_aggregated_by_advertiser_time_zone" e.g. "08:00:00-07:00"
          const hourStr = row.hourly_stats_aggregated_by_advertiser_time_zone || '00:00:00';
          const hour = parseInt(hourStr.split(':')[0], 10);
          const key = `${date}|${hour}`;

          const metrics = mapInsightsToMetrics(row) as unknown as MetricMap;

          if (!hourlyMap.has(key)) {
            hourlyMap.set(key, { ...metrics });
          } else {
            const existing = hourlyMap.get(key)! as MetricMap;
            accumulateMetrics(existing, metrics);
          }
        }
      }

      // Recalculate derived metrics and build response
      const hourlyInsights = Array.from(hourlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, m]) => {
          const [date, hourStr] = key.split('|');
          const hour = parseInt(hourStr, 10);

          finalizeDerivedMetrics(m as MetricMap);

          return { date, hour, metrics: m };
        });

      if (useSupabase) {
        await Promise.all([
          upsertPersistentMetaEndpointSnapshot(storeId, 'insights', scopeId, exactVariant, hourlyInsights),
          upsertPersistentMetaEndpointSnapshot(storeId, 'insights', scopeId, latestVariant, hourlyInsights),
        ]);
      } else {
        upsertMetaEndpointSnapshot(storeId, 'insights', scopeId, exactVariant, hourlyInsights);
        upsertMetaEndpointSnapshot(storeId, 'insights', scopeId, latestVariant, hourlyInsights);
      }
      return NextResponse.json({ data: hourlyInsights });
    }

    // --- Generic breakdown path (e.g. age,gender) ---
    if (breakdowns) {
      const breakdownKeys = breakdowns
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (breakdownKeys.length === 0) {
        return NextResponse.json({ error: 'Invalid breakdowns parameter' }, { status: 400 });
      }

      const insightFields = [
        'date_start',
        'date_stop',
        'spend',
        'impressions',
        'reach',
        'clicks',
        'actions',
        'action_values',
        'ctr',
        'cpc',
        'cpm',
      ].join(',');

      const allBreakdownRows = await Promise.all(
        sortedTargetIds.map(async (id) => {
          try {
            const response = await fetchFromMeta<{ data?: Record<string, unknown>[] }>(
              token.accessToken,
              `/${id}/insights`,
              {
                fields: insightFields,
                date_preset: datePreset,
                breakdowns,
                limit: '500',
              },
              15_000,
              1
            );
            return response.data || [];
          } catch {
            return [] as Record<string, unknown>[];
          }
        })
      );

      const breakdownMap = new Map<string, { dims: Record<string, string>; metrics: MetricMap }>();
      for (const accountRows of allBreakdownRows) {
        for (const row of accountRows) {
          const dims: Record<string, string> = {};
          const key = breakdownKeys.map((dimKey) => {
            const rawValue = row[dimKey];
            const textValue = (typeof rawValue === 'string' ? rawValue.trim() : '') || 'unknown';
            dims[dimKey] = textValue;
            return `${dimKey}:${textValue.toLowerCase()}`;
          }).join('|');

          const metrics = mapInsightsToMetrics(row) as unknown as MetricMap;
          if (!breakdownMap.has(key)) {
            breakdownMap.set(key, { dims, metrics: { ...metrics } });
          } else {
            accumulateMetrics(breakdownMap.get(key)!.metrics, metrics);
          }
        }
      }

      const breakdownInsights = Array.from(breakdownMap.values())
        .map((entry) => {
          finalizeDerivedMetrics(entry.metrics);
          return {
            ...entry.dims,
            metrics: entry.metrics,
          };
        })
        .sort((a, b) => (b.metrics?.spend || 0) - (a.metrics?.spend || 0));

      if (useSupabase) {
        await Promise.all([
          upsertPersistentMetaEndpointSnapshot(storeId, 'insights', scopeId, exactVariant, breakdownInsights),
          upsertPersistentMetaEndpointSnapshot(storeId, 'insights', scopeId, latestVariant, breakdownInsights),
          datePreset === 'last_30d'
            ? upsertPersistentMetaEndpointSnapshot(storeId, 'insights', scopeId, last30Variant, breakdownInsights)
            : Promise.resolve(),
        ]);
      } else {
        upsertMetaEndpointSnapshot(storeId, 'insights', scopeId, exactVariant, breakdownInsights);
        upsertMetaEndpointSnapshot(storeId, 'insights', scopeId, latestVariant, breakdownInsights);
        if (datePreset === 'last_30d') {
          upsertMetaEndpointSnapshot(storeId, 'insights', scopeId, last30Variant, breakdownInsights);
        }
      }
      return NextResponse.json({ data: breakdownInsights });
    }

    // --- Daily insights path (existing behavior) ---

    // Fetch insights from all accounts in parallel
    const allInsights = await Promise.all(
      sortedTargetIds.map((id) =>
        fetchMetaInsights(token.accessToken, id, datePreset).catch(() => [])
      )
    );

    // Aggregate daily insights across all accounts
    // Key: date string, Value: aggregated metrics
    const dateMap = new Map<string, Record<string, number>>();

    for (const accountInsights of allInsights) {
      for (const day of accountInsights) {
        const date = day.date_start;
        const metrics = mapInsightsToMetrics(day) as unknown as MetricMap;

        if (!dateMap.has(date)) {
          dateMap.set(date, { ...metrics });
        } else {
          const existing = dateMap.get(date)! as MetricMap;
          accumulateMetrics(existing, metrics);
        }
      }
    }

    // Recalculate derived metrics for each date
    const insights = Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => {
        finalizeDerivedMetrics(m as MetricMap);

        return {
          date,
          dateEnd: date,
          metrics: m,
        };
      });

    if (useSupabase) {
      await Promise.all([
        upsertPersistentMetaEndpointSnapshot(storeId, 'insights', scopeId, exactVariant, insights),
        upsertPersistentMetaEndpointSnapshot(storeId, 'insights', scopeId, latestVariant, insights),
        datePreset === 'last_30d'
          ? upsertPersistentMetaEndpointSnapshot(storeId, 'insights', scopeId, last30Variant, insights)
          : Promise.resolve(),
      ]);
    } else {
      upsertMetaEndpointSnapshot(storeId, 'insights', scopeId, exactVariant, insights);
      upsertMetaEndpointSnapshot(storeId, 'insights', scopeId, latestVariant, insights);
      if (datePreset === 'last_30d') {
        upsertMetaEndpointSnapshot(storeId, 'insights', scopeId, last30Variant, insights);
      }
    }
    return NextResponse.json({ data: insights });
  } catch (err) {
    const errExactSnapshot = useSupabase
      ? await getPersistentMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, exactVariant)
      : getMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, exactVariant);
    if (errExactSnapshot && errExactSnapshot.data.length > 0) {
      return NextResponse.json({
        data: errExactSnapshot.data,
        cached: true,
        stale: true,
        snapshotAt: errExactSnapshot.updatedAt,
        staleReason: 'live_error_exact',
      });
    }
    if (!isStrictPresetRequest) {
      const last30Snapshot = useSupabase
        ? await getPersistentMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, last30Variant)
        : getMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, last30Variant);
      if (last30Snapshot && last30Snapshot.data.length > 0) {
        return NextResponse.json({
          data: last30Snapshot.data,
          cached: true,
          stale: true,
          snapshotAt: last30Snapshot.updatedAt,
          staleReason: 'live_error_last_30d',
        });
      }
    }
    if (!isStrictPresetRequest) {
      const errLatestExact = useSupabase
        ? await getPersistentMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, latestVariant)
        : getMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId, latestVariant);
      const latestSnapshot = errLatestExact
        || (useSupabase
          ? await getLatestPersistentMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId)
          : getLatestMetaEndpointSnapshot<unknown[]>(storeId, 'insights', scopeId));
      if (latestSnapshot && latestSnapshot.data.length > 0) {
        return NextResponse.json({
          data: latestSnapshot.data,
          cached: true,
          stale: true,
          snapshotAt: latestSnapshot.updatedAt,
          staleReason: 'live_error_latest',
        });
      }
    }

    const message = err instanceof Error ? err.message : 'Failed to fetch insights';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
