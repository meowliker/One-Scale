import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

interface SnapshotRow {
  endpoint: string;
  scope_id: string;
  variant_key: string;
  row_count: number;
  updated_at: string;
  payload_json: string;
}

/** Direct Supabase REST query to fetch snapshot rows for a store. */
async function querySnapshots(
  storeId: string,
  fields: string,
  extraFilters = '',
  limit = 200,
): Promise<SnapshotRow[]> {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];

  const url =
    `${SUPABASE_URL}/rest/v1/meta_endpoint_snapshots` +
    `?store_id=eq.${encodeURIComponent(storeId)}` +
    `&select=${encodeURIComponent(fields)}` +
    extraFilters +
    `&order=updated_at.desc&limit=${limit}`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) return [];
  return (await res.json()) as SnapshotRow[];
}

// Debug endpoint to check what data is in Supabase snapshots
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || 'store-b8eea935d87e';
  const endpoint = searchParams.get('endpoint'); // campaigns, ads, adsets, insights, creatives
  const full = searchParams.get('full') === '1';

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not enabled' });
  }

  try {
    const endpointFilter = endpoint
      ? `&endpoint=eq.${encodeURIComponent(endpoint)}`
      : '';

    if (!endpoint) {
      // Return summary of what endpoints exist (metadata only)
      const snapshots = await querySnapshots(
        storeId,
        'endpoint,scope_id,variant_key,row_count,updated_at',
        '',
        200,
      );

      const summary = new Map<string, { count: number; variants: string[]; lastUpdated: string }>();
      for (const snap of snapshots) {
        const key = snap.endpoint;
        const existing = summary.get(key) || { count: 0, variants: [], lastUpdated: '' };
        existing.count++;
        if (!existing.variants.includes(snap.variant_key) && existing.variants.length < 5) {
          existing.variants.push(snap.variant_key);
        }
        if (snap.updated_at > existing.lastUpdated) existing.lastUpdated = snap.updated_at;
        summary.set(key, existing);
      }
      return NextResponse.json({
        totalSnapshots: snapshots.length,
        endpoints: Object.fromEntries(summary),
      });
    }

    if (!full) {
      // Return metadata only for the given endpoint
      const snapshots = await querySnapshots(
        storeId,
        'scope_id,variant_key,row_count,updated_at,payload_json',
        endpointFilter,
        200,
      );

      return NextResponse.json({
        endpoint,
        count: snapshots.length,
        snapshots: snapshots.map((s) => ({
          scopeId: s.scope_id,
          variantKey: s.variant_key,
          rowCount: s.row_count,
          updatedAt: s.updated_at,
          payloadPreview: JSON.stringify(JSON.parse(s.payload_json)).substring(0, 200),
        })),
      });
    }

    // Return first snapshot's full data
    const snapshots = await querySnapshots(
      storeId,
      'scope_id,variant_key,row_count,updated_at,payload_json',
      endpointFilter,
      1,
    );

    const first = snapshots[0];
    if (!first) return NextResponse.json({ error: 'No snapshots for this endpoint' });

    const data = JSON.parse(first.payload_json);
    return NextResponse.json({
      endpoint,
      scopeId: first.scope_id,
      variantKey: first.variant_key,
      rowCount: first.row_count,
      updatedAt: first.updated_at,
      sampleData: Array.isArray(data) ? data.slice(0, 3) : data,
      totalRecords: Array.isArray(data) ? data.length : 1,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
