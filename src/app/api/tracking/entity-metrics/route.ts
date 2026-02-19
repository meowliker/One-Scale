import { NextRequest, NextResponse } from 'next/server';
import { fromZonedTime, format as formatTz } from 'date-fns-tz';
import { getStoreAdAccounts, getTrackingEntityMetrics } from '@/app/api/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const DEFAULT_TZ = 'America/New_York';

interface EntityMetricSummary {
  results: number;
  purchases: number;
  purchaseValue: number;
}

function toDateBounds(
  sinceRaw: string | null,
  untilRaw: string | null,
  timezone: string
): { sinceIso: string; untilIso: string; since: string; until: string; timezone: string } {
  const fallback = formatTz(new Date(), 'yyyy-MM-dd', { timeZone: timezone });
  const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw || '') ? (sinceRaw as string) : fallback;
  const parsedUntil = /^\d{4}-\d{2}-\d{2}$/.test(untilRaw || '') ? (untilRaw as string) : since;
  const until = parsedUntil < since ? since : parsedUntil;
  return {
    since,
    until,
    timezone,
    sinceIso: fromZonedTime(`${since}T00:00:00`, timezone).toISOString(),
    untilIso: fromZonedTime(`${until}T23:59:59.999`, timezone).toISOString(),
  };
}

function getStoreTimezone(storeId: string): string {
  const accounts = getStoreAdAccounts(storeId).filter((a) => a.platform === 'meta' && a.is_active === 1);
  return accounts.find((a) => a.timezone)?.timezone || accounts[0]?.timezone || DEFAULT_TZ;
}

function addMetric(
  bucket: Record<string, EntityMetricSummary>,
  id: string | null,
  row: EntityMetricSummary
): void {
  if (!id) return;
  const existing = bucket[id] || { results: 0, purchases: 0, purchaseValue: 0 };
  bucket[id] = {
    results: existing.results + Number(row.results || 0),
    purchases: existing.purchases + Number(row.purchases || 0),
    purchaseValue: existing.purchaseValue + Number(row.purchaseValue || 0),
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const timezone = getStoreTimezone(storeId);
  const bounds = toDateBounds(searchParams.get('since'), searchParams.get('until'), timezone);
  const rows = getTrackingEntityMetrics(storeId, bounds.sinceIso, bounds.untilIso);

  const campaigns: Record<string, EntityMetricSummary> = {};
  const adSets: Record<string, EntityMetricSummary> = {};
  const ads: Record<string, EntityMetricSummary> = {};

  for (const row of rows) {
    const summary: EntityMetricSummary = {
      results: Number(row.results || 0),
      purchases: Number(row.purchases || 0),
      purchaseValue: Number(row.purchase_value || 0),
    };
    addMetric(campaigns, row.campaign_id, summary);
    addMetric(adSets, row.adset_id, summary);
    addMetric(ads, row.ad_id, summary);
  }

  return NextResponse.json(
    {
      data: {
        since: bounds.since,
        until: bounds.until,
        timezone: bounds.timezone,
        campaigns,
        adSets,
        ads,
        fetchedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    }
  );
}
