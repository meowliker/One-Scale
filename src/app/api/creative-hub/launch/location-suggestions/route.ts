import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, rest } from '@/app/api/lib/supabase-persistence';
import {
  WORLDWIDE_COUNTRY_VALUE,
  dedupeCountryCodes,
  getCountryLabel,
} from '@/lib/countryOptions';

export const dynamic = 'force-dynamic';

type AdsetLocationRow = {
  adset_id: string;
  adset_name: string | null;
  campaign_id: string | null;
  ad_account_id: string | null;
  status: string | null;
  targeting_locations: unknown[] | null;
  targeting_json: Record<string, unknown> | null;
  source_synced_at: string | null;
  meta_updated_time: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : ''))
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMetaAccountId(value?: string | null): string {
  return String(value || '').trim().replace(/^act_/i, '');
}

function encodePostgrestIn(values: string[]): string {
  return values
    .filter(Boolean)
    .map((value) => `"${value.replace(/"/g, '""')}"`)
    .join(',');
}

function countryCodeFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  return String(
    record.country_code ||
      record.countryCode ||
      record.code ||
      record.key ||
      record.id ||
      '',
  );
}

function extractCountryCodeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(countryCodeFromUnknown).filter(Boolean);
}

function incrementCounts(map: Map<string, number>, countryCodes: string[]) {
  for (const countryCode of countryCodes) {
    map.set(countryCode, (map.get(countryCode) || 0) + 1);
  }
}

function sortCountryCodes(countryCodes: string[], counts: Map<string, number>): string[] {
  return [...countryCodes].sort((a, b) => {
    const countDiff = (counts.get(b) || 0) - (counts.get(a) || 0);
    if (countDiff !== 0) return countDiff;
    return getCountryLabel(a).localeCompare(getCountryLabel(b));
  });
}

function extractTargetingCountries(row: AdsetLocationRow): {
  includedCountries: string[];
  excludedCountries: string[];
} {
  const targeting = asRecord(row.targeting_json);
  const geoLocations = asRecord(targeting.geo_locations);
  const excludedGeoLocations = asRecord(targeting.excluded_geo_locations);
  const hasWorldwideGroup =
    asStringArray(geoLocations.country_groups).some((group) => group.toLowerCase() === 'worldwide') ||
    asStringArray(targeting.countryGroups).some((group) => group.toLowerCase() === 'worldwide');

  const includedCountries = dedupeCountryCodes([
    ...extractCountryCodeArray(row.targeting_locations),
    ...extractCountryCodeArray(targeting.locations),
    ...extractCountryCodeArray(targeting.countries),
    ...extractCountryCodeArray(geoLocations.countries),
    ...(hasWorldwideGroup ? [WORLDWIDE_COUNTRY_VALUE] : []),
  ]);

  const excludedCountries = dedupeCountryCodes([
    ...extractCountryCodeArray(targeting.excludedLocations),
    ...extractCountryCodeArray(targeting.excluded_locations),
    ...extractCountryCodeArray(excludedGeoLocations.countries),
  ]).filter((countryCode) => countryCode !== WORLDWIDE_COUNTRY_VALUE);

  return {
    includedCountries,
    excludedCountries,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId')?.trim();
  const adAccountId = searchParams.get('adAccountId')?.trim();

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({
      includedCountries: [],
      excludedCountries: [],
      sourceAdsetCount: 0,
      sources: [],
    });
  }

  const normalizedAdAccountId = normalizeMetaAccountId(adAccountId);
  const accountFilterValues = Array.from(
    new Set(
      [
        adAccountId || '',
        normalizedAdAccountId,
        normalizedAdAccountId ? `act_${normalizedAdAccountId}` : '',
      ].filter(Boolean),
    ),
  );
  const query =
    `/meta_adset_entities?store_id=eq.${encodeURIComponent(storeId)}` +
    (accountFilterValues.length > 0
      ? `&ad_account_id=in.(${encodeURIComponent(encodePostgrestIn(accountFilterValues))})`
      : '') +
    '&select=adset_id,adset_name,campaign_id,ad_account_id,status,targeting_locations,targeting_json,source_synced_at,meta_updated_time' +
    '&order=source_synced_at.desc.nullslast&limit=1000';

  const rows = await rest<AdsetLocationRow[]>(query).catch((error) => {
    console.warn('[launch-location-suggestions] Failed to read adset warehouse:', error);
    return [] as AdsetLocationRow[];
  });

  const includedCounts = new Map<string, number>();
  const excludedCounts = new Map<string, number>();
  const sources: Array<{
    adsetId: string;
    adsetName: string | null;
    campaignId: string | null;
    includedCountries: string[];
    excludedCountries: string[];
  }> = [];

  let latestSyncedAt: string | null = null;

  for (const row of rows) {
    const status = String(row.status || '').toUpperCase();
    if (status === 'DELETED' || status === 'ARCHIVED') continue;

    const { includedCountries, excludedCountries } = extractTargetingCountries(row);
    if (includedCountries.length === 0 && excludedCountries.length === 0) continue;

    incrementCounts(includedCounts, includedCountries);
    incrementCounts(excludedCounts, excludedCountries);
    sources.push({
      adsetId: row.adset_id,
      adsetName: row.adset_name,
      campaignId: row.campaign_id,
      includedCountries,
      excludedCountries,
    });

    const syncedAt = row.source_synced_at || row.meta_updated_time;
    if (syncedAt && (!latestSyncedAt || syncedAt > latestSyncedAt)) {
      latestSyncedAt = syncedAt;
    }
  }

  const includedCountries = sortCountryCodes(Array.from(includedCounts.keys()), includedCounts);
  const rawExcludedCountries = sortCountryCodes(Array.from(excludedCounts.keys()), excludedCounts);
  const excludedCountries = includedCountries.includes(WORLDWIDE_COUNTRY_VALUE)
    ? rawExcludedCountries
    : rawExcludedCountries.filter((countryCode) => !includedCountries.includes(countryCode));

  return NextResponse.json({
    includedCountries,
    excludedCountries,
    sourceAdsetCount: sources.length,
    sources,
    latestSyncedAt,
  });
}
