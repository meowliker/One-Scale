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

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

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
  });
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
  // Attribution window fields
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

// ---- Main Handler ----

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
      // Get Meta connection for this store
      const metaConn = await getPersistentConnection(store.id, 'meta');
      if (!metaConn || !metaConn.access_token) {
        results.push({ storeId: store.id, status: 'skipped', error: 'No Meta connection' });
        continue;
      }

      // Get ad accounts for this store
      const adAccounts = await listPersistentStoreAdAccounts(store.id);
      const activeAccounts = adAccounts.filter((a) => a.is_active);
      if (activeAccounts.length === 0) {
        results.push({ storeId: store.id, status: 'skipped', error: 'No active ad accounts' });
        continue;
      }

      let totalRows = 0;

      for (const account of activeAccounts) {
        const adAccountId = account.ad_account_id.startsWith('act_')
          ? account.ad_account_id
          : `act_${account.ad_account_id}`;
        const tz = account.timezone || 'America/New_York';
        const today = todayInTimezone(tz);

        // Check if we already have a recent cache entry (less than 2 hours old)
        const existingCache = await rest<Array<{ updated_at: string }>>(
          `/meta_spend_cache?store_id=eq.${encodeURIComponent(store.id)}&ad_account_id=eq.${encodeURIComponent(adAccountId)}&date=eq.${today}&select=updated_at&limit=1`
        );

        if (existingCache && existingCache.length > 0) {
          const lastUpdate = new Date(existingCache[0].updated_at).getTime();
          const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
          // For today's data, always refresh. For historical, only if older than 2 hours.
          // Since we're fetching today's spend, we always refresh.
        }

        // Helper: extract purchase count/value from an actions/action_values array
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const extractPurchases = (arr: any[] | undefined): number => {
          if (!arr) return 0;
          const entry = arr.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase'
          );
          return entry ? parseFloat(entry.value) || 0 : 0;
        };

        // Helper: upsert a batch of insight rows into meta_spend_cache
        const upsertRows = async (rows: MetaInsightRow[], dateForRow: string) => {
          for (const row of rows) {
            const purchases = extractPurchases(row.actions);
            const purchaseValue = extractPurchases(row.action_values);
            const purchases7dClick = extractPurchases(row.actions_7d_click);
            const purchaseValue7dClick = extractPurchases(row.action_values_7d_click);
            const purchases1dView = extractPurchases(row.actions_1d_view);
            const purchaseValue1dView = extractPurchases(row.action_values_1d_view);

            // Upsert into meta_spend_cache (idempotent: store_id + ad_account_id + ad_id + date is unique)
            await rest('/meta_spend_cache', {
              method: 'POST',
              headers: {
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify({
                store_id: store.id,
                ad_account_id: adAccountId,
                campaign_id: row.campaign_id,
                campaign_name: row.campaign_name,
                adset_id: row.adset_id,
                adset_name: row.adset_name,
                ad_id: row.ad_id,
                ad_name: row.ad_name,
                date: row.date_start || dateForRow,
                spend: parseFloat(row.spend) || 0,
                impressions: parseInt(row.impressions) || 0,
                clicks: parseInt(row.clicks) || 0,
                purchases: parseInt(String(purchases)) || 0,
                purchase_value: parseFloat(String(purchaseValue)) || 0,
                purchases_7d_click: parseInt(String(purchases7dClick)) || 0,
                purchase_value_7d_click: parseFloat(String(purchaseValue7dClick)) || 0,
                purchases_1d_view: parseInt(String(purchases1dView)) || 0,
                purchase_value_1d_view: parseFloat(String(purchaseValue1dView)) || 0,
                updated_at: new Date().toISOString(),
              }),
            });

            totalRows++;
          }
        };

        // ---- Pass 1: Fetch today's ad-level insights with attribution windows ----
        const todayData = await fetchFromMeta<{
          data: MetaInsightRow[];
          paging?: { next?: string };
        }>(metaConn.access_token, `/${adAccountId}/insights`, {
          date_preset: 'today',
          time_increment: '1',
          fields:
            'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values',
          level: 'ad',
          limit: '500',
          action_attribution_windows: '7d_click,1d_view',
        });

        await upsertRows(todayData?.data || [], today);

        // ---- Pass 2: Re-fetch last 6 days (1–6 days ago) to capture retroactive Meta attribution updates ----
        // Meta attribution data can change for up to 7 days after the click/view event.
        for (let i = 1; i <= 6; i++) {
          const dayStr = daysAgoInTimezone(i, tz);
          try {
            const historicalData = await fetchFromMeta<{
              data: MetaInsightRow[];
              paging?: { next?: string };
            }>(metaConn.access_token, `/${adAccountId}/insights`, {
              time_range: JSON.stringify({ since: dayStr, until: dayStr }),
              time_increment: '1',
              fields:
                'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values',
              level: 'ad',
              limit: '500',
              action_attribution_windows: '7d_click,1d_view',
            });

            await upsertRows(historicalData?.data || [], dayStr);
          } catch (histErr) {
            // Log but don't fail the whole sync for a single historical day
            console.warn(
              `[sync-meta-spend] Failed to fetch historical day ${dayStr} for ${adAccountId}:`,
              histErr instanceof Error ? histErr.message : histErr
            );
          }
        }
      }

      const elapsed = Date.now() - start;
      await logCron('sync-meta-spend', store.id, 'success', totalRows, null, elapsed);
      results.push({ storeId: store.id, status: 'success', rows: totalRows });
    } catch (err) {
      const elapsed = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      await logCron('sync-meta-spend', store.id, 'error', 0, message, elapsed).catch(() => {});
      await logStoreError(store.id, 'cron_sync_meta_spend', message, 'Check Meta connection and ad account access');
      results.push({ storeId: store.id, status: 'error', error: message });
      // Continue processing other stores
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'sync-meta-spend',
    runAt: new Date().toISOString(),
    results,
  });
}
