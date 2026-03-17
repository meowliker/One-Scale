import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

interface StoreConfig {
  store_id: string;
  currency: string;
  reporting_currency: string;
  iana_timezone: string;
  money_format: string | null;
  taxes_included: boolean;
  config_version: number;
  config_synced_at: string | null;
}

/**
 * GET /api/settings/store-config?storeId=xxx
 *
 * Returns the store's config (currency, timezone, etc.) from the store_config table.
 * Used by the frontend to format currency values and handle timezone display.
 */
export async function GET(request: NextRequest) {
  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  if (!isSupabasePersistenceEnabled()) {
    // Fallback defaults when Supabase is not configured
    return NextResponse.json({
      ok: true,
      config: {
        store_id: storeId,
        currency: 'USD',
        reporting_currency: 'USD',
        iana_timezone: 'America/New_York',
        money_format: null,
        taxes_included: false,
        config_version: 1,
        config_synced_at: null,
      },
    });
  }

  try {
    const rows = await rest<StoreConfig[]>(
      `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=store_id,currency,reporting_currency,iana_timezone,money_format,taxes_included,config_version,config_synced_at&limit=1`
    );

    if (!rows || rows.length === 0) {
      // No config yet — return defaults
      return NextResponse.json({
        ok: true,
        config: {
          store_id: storeId,
          currency: 'USD',
          reporting_currency: 'USD',
          iana_timezone: 'America/New_York',
          money_format: null,
          taxes_included: false,
          config_version: 1,
          config_synced_at: null,
        },
      });
    }

    return NextResponse.json({ ok: true, config: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load store config';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
