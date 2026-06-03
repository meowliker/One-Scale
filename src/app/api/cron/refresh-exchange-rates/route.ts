import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
} from '@/app/api/lib/supabase-persistence';
import { fetchLiveExchangeRate } from '@/app/api/lib/live-exchange-rate';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// ---- Cron Log ----

async function logCron(
  cronName: string,
  storeId: string | null,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number
) {
  await rest('/cron_logs', {
    method: 'POST',
    body: JSON.stringify({
      cron_name: cronName,
      store_id: storeId,
      status,
      rows_processed: rowsProcessed,
      error,
      duration_ms: durationMs,
    }),
  });
}

// ---- Types ----

interface StoreConfigRow {
  store_id: string;
  reporting_currency: string;
  meta_currencies: Record<string, string> | null;
}

// ---- Main Handler ----

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const start = Date.now();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // 1. Get all unique currencies used across stores
    const storeConfigs = await rest<StoreConfigRow[]>(
      '/store_config?select=store_id,reporting_currency,meta_currencies'
    );

    const currencies = new Set<string>();
    currencies.add('USD'); // Always include USD as base

    for (const config of storeConfigs) {
      if (config.reporting_currency) currencies.add(config.reporting_currency);
      if (config.meta_currencies && typeof config.meta_currencies === 'object') {
        for (const curr of Object.values(config.meta_currencies)) {
          if (typeof curr === 'string' && curr.length === 3) currencies.add(curr);
        }
      }
    }

    // If only USD, nothing to convert
    if (currencies.size <= 1) {
      const elapsed = Date.now() - start;
      await logCron('refresh-exchange-rates', null, 'success', 0, null, elapsed);
      return NextResponse.json({
        ok: true,
        cron: 'refresh-exchange-rates',
        runAt: new Date().toISOString(),
        message: 'Only USD found, no exchange rates needed',
        pairs: 0,
      });
    }

    // 2. Fetch rates from Google Finance first, with API fallbacks in the shared helper.
    const targets = Array.from(currencies).filter((c) => c !== 'USD');
    const liveRates = await Promise.all(
      targets.map(async (targetCurrency) => ({
        targetCurrency,
        liveRate: await fetchLiveExchangeRate('USD', targetCurrency),
      })),
    );

    // 3. Upsert rates into exchange_rates table
    let upserted = 0;
    const sources: Record<string, string> = {};

    for (const { targetCurrency, liveRate } of liveRates) {
      const rate = liveRate?.rate;
      if (!liveRate || typeof rate !== 'number' || rate <= 0) continue;
      sources[targetCurrency] = liveRate.source;

      // Forward: USD -> target
      await rest('/exchange_rates', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          base_currency: 'USD',
          target_currency: targetCurrency,
          rate,
          date: today,
        }),
      });
      upserted++;

      // Inverse: target -> USD
      await rest('/exchange_rates', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          base_currency: targetCurrency,
          target_currency: 'USD',
          rate: parseFloat((1 / rate).toFixed(6)),
          date: today,
        }),
      });
      upserted++;
    }

    if (upserted === 0) {
      throw new Error('No live exchange rates could be fetched');
    }

    const elapsed = Date.now() - start;
    await logCron('refresh-exchange-rates', null, 'success', upserted, null, elapsed);

    return NextResponse.json({
      ok: true,
      cron: 'refresh-exchange-rates',
      runAt: new Date().toISOString(),
      date: today,
      pairs: upserted,
      currencies: Array.from(currencies),
      sources,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logCron('refresh-exchange-rates', null, 'error', 0, message, elapsed).catch(() => {});

    return NextResponse.json(
      { ok: false, cron: 'refresh-exchange-rates', error: message },
      { status: 500 }
    );
  }
}
