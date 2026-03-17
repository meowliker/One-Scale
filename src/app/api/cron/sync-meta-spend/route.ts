import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
  getPersistentConnection,
  listPersistentStoreAdAccounts,
  logStoreError,
} from '@/app/api/lib/supabase-persistence';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { todayInTimezone, daysAgoInTimezone } from '@/lib/timezone';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ---- Cron Log ----

async function logCron(
  cronName: string,
  storeId: string,
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
  }).catch(() => {});
}

// ---- Types ----

interface MetaInsightRow {
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  spend: string;
  impressions: string;
  clicks: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action_values: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions_7d_click?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions_1d_view?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action_values_7d_click?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action_values_1d_view?: any[];
  date_start: string;
  date_stop: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractPurchases(arr: any[] | undefined): number {
  if (!arr) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = arr.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
  return entry ? parseFloat(entry.value) || 0 : 0;
}

function mapRowToUpsert(storeId: string, adAccountId: string, row: MetaInsightRow, fallbackDate: string) {
  return {
    store_id: storeId,
    ad_account_id: adAccountId,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    adset_id: row.adset_id,
    adset_name: row.adset_name,
    ad_id: row.ad_id,
    ad_name: row.ad_name,
    date: row.date_start || fallbackDate,
    spend: parseFloat(row.spend) || 0,
    impressions: parseInt(row.impressions) || 0,
    clicks: parseInt(row.clicks) || 0,
    purchases: parseInt(String(extractPurchases(row.actions))) || 0,
    purchase_value: parseFloat(String(extractPurchases(row.action_values))) || 0,
    purchases_7d_click: parseInt(String(extractPurchases(row.actions_7d_click))) || 0,
    purchase_value_7d_click: parseFloat(String(extractPurchases(row.action_values_7d_click))) || 0,
    purchases_1d_view: parseInt(String(extractPurchases(row.actions_1d_view))) || 0,
    purchase_value_1d_view: parseFloat(String(extractPurchases(row.action_values_1d_view))) || 0,
    updated_at: new Date().toISOString(),
  };
}

// ---- Main Handler ----

// pg_cron uses net.http_post — accept both GET and POST
export async function POST(req: NextRequest) { return GET(req); }

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; status: string; rows?: number; error?: string }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      const metaConn = await getPersistentConnection(store.id, 'meta');
      if (!metaConn || !metaConn.access_token) {
        results.push({ storeId: store.id, status: 'skipped', error: 'No Meta connection' });
        continue;
      }

      const adAccounts = await listPersistentStoreAdAccounts(store.id);
      const activeAccounts = adAccounts.filter((a) => a.is_active);
      if (activeAccounts.length === 0) {
        results.push({ storeId: store.id, status: 'skipped', error: 'No active ad accounts' });
        continue;
      }

      // ── Process ALL ad accounts in PARALLEL (not sequential) ──
      // Single Meta API call per account covering last 7 days, then batch upsert.
      const accountResults = await Promise.allSettled(
        activeAccounts.map(async (account) => {
          const adAccountId = account.ad_account_id.startsWith('act_')
            ? account.ad_account_id
            : `act_${account.ad_account_id}`;
          const tz = account.timezone || 'America/New_York';
          const today = todayInTimezone(tz);
          const sevenDaysAgo = daysAgoInTimezone(6, tz);

          // ONE Meta API call for all 7 days with full pagination (handles >500 ads)
          const allInsightRows: MetaInsightRow[] = [];
          let pageData = await fetchFromMeta<{
            data: MetaInsightRow[];
            paging?: { next?: string };
          }>(metaConn.access_token, `/${adAccountId}/insights`, {
            time_range: JSON.stringify({ since: sevenDaysAgo, until: today }),
            time_increment: '1',
            fields: 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values',
            level: 'ad',
            limit: '500',
            action_attribution_windows: '7d_click,1d_view',
          });
          allInsightRows.push(...(pageData?.data || []));

          // Follow pagination — accounts with >500 ads need multiple pages
          let nextUrl = pageData?.paging?.next;
          let pageCount = 1;
          while (nextUrl && pageCount < 20) {
            try {
              const nextRes = await fetch(nextUrl);
              if (!nextRes.ok) break;
              const nextData = await nextRes.json() as { data: MetaInsightRow[]; paging?: { next?: string } };
              allInsightRows.push(...(nextData?.data || []));
              nextUrl = nextData?.paging?.next;
              pageCount++;
            } catch { break; }
          }

          const rows = allInsightRows.map(row => mapRowToUpsert(store.id, adAccountId, row, today));
          if (rows.length === 0) return 0;

          // ── BATCH upsert ALL rows at once (not one-by-one) ──
          // PostgREST accepts arrays — single HTTP request instead of hundreds
          const BATCH_SIZE = 200;
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            await rest('/meta_spend_cache?on_conflict=store_id,ad_account_id,ad_id,date', {
              method: 'POST',
              headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
              body: JSON.stringify(batch),
            });
          }

          return rows.length;
        })
      );

      let totalRows = 0;
      const accountErrors: string[] = [];
      for (let i = 0; i < accountResults.length; i++) {
        const r = accountResults[i];
        if (r.status === 'fulfilled') {
          totalRows += r.value;
        } else {
          const accId = activeAccounts[i].ad_account_id;
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          accountErrors.push(`${accId}: ${msg}`);
          console.warn(`[sync-meta-spend] Account ${accId} failed:`, msg);
        }
      }

      const elapsed = Date.now() - start;
      const status = accountErrors.length === activeAccounts.length ? 'error' : 'success';
      await logCron('sync-meta-spend', store.id, status, totalRows, accountErrors.length > 0 ? accountErrors.join('; ') : null, elapsed);
      results.push({
        storeId: store.id,
        status,
        rows: totalRows,
        error: accountErrors.length > 0 ? `${accountErrors.length}/${activeAccounts.length} accounts failed` : undefined,
      });
    } catch (err) {
      const elapsed = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      await logCron('sync-meta-spend', store.id, 'error', 0, message, elapsed).catch(() => {});
      await logStoreError(store.id, 'cron_sync_meta_spend', message, 'Check Meta connection and ad account access');
      results.push({ storeId: store.id, status: 'error', error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'sync-meta-spend',
    runAt: new Date().toISOString(),
    results,
  });
}
