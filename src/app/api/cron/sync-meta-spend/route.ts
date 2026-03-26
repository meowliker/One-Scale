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

interface MetaSpendUpsertRow {
  store_id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  adset_id: string;
  adset_name: string;
  ad_id: string;
  ad_name: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchase_value: number;
  purchases_7d_click: number;
  purchase_value_7d_click: number;
  purchases_1d_view: number;
  purchase_value_1d_view: number;
  updated_at: string;
}

type StoreLike = {
  id: string;
  adAccounts?: Array<{
    platform?: string;
    is_active: number | boolean;
  }>;
};

type ActiveAccount = {
  ad_account_id: string;
  is_active: number | boolean;
  timezone?: string | null;
};

const UPSERT_CHUNK_SIZE = 250;
const AUTO_ACCOUNT_BATCH_SIZE = 5;
const SLOT_MS = 10 * 60 * 1000; // 10 minutes

function currentSlot(): number {
  return Math.floor(Date.now() / SLOT_MS);
}

function parseDaysParam(raw: string | null, fallback: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(7, parsed));
}

function normalizeActiveMetaAccounts(rows: ActiveAccount[]): ActiveAccount[] {
  return rows
    .filter((row) => Number(row.is_active) === 1)
    .sort((a, b) => a.ad_account_id.localeCompare(b.ad_account_id));
}

function isStoreMetaActive(store: StoreLike): boolean {
  return (store.adAccounts || []).some((a) => (a.platform || 'meta') === 'meta' && Number(a.is_active) === 1);
}

function pickRoundRobinStoreId(storeIds: string[]): string | null {
  if (storeIds.length === 0) return null;
  return storeIds[currentSlot() % storeIds.length] || null;
}

function pickAccountBatch(accounts: ActiveAccount[], batchSize: number): ActiveAccount[] {
  if (accounts.length <= batchSize) return accounts;
  const batchCount = Math.ceil(accounts.length / batchSize);
  const batchIndex = currentSlot() % batchCount;
  const start = batchIndex * batchSize;
  return accounts.slice(start, start + batchSize);
}

function extractPurchases(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arr: any[] | undefined
): number {
  if (!arr) return 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = arr.find((a: any) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
  return entry ? parseFloat(entry.value) || 0 : 0;
}

async function upsertMetaSpendRows(
  storeId: string,
  adAccountId: string,
  rows: MetaInsightRow[],
  dateForRow: string
): Promise<number> {
  if (rows.length === 0) return 0;

  const payload: MetaSpendUpsertRow[] = rows.map((row) => {
    const purchases = extractPurchases(row.actions);
    const purchaseValue = extractPurchases(row.action_values);
    const purchases7dClick = extractPurchases(row.actions_7d_click);
    const purchaseValue7dClick = extractPurchases(row.action_values_7d_click);
    const purchases1dView = extractPurchases(row.actions_1d_view);
    const purchaseValue1dView = extractPurchases(row.action_values_1d_view);
    return {
      store_id: storeId,
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
    };
  });

  for (let i = 0; i < payload.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + UPSERT_CHUNK_SIZE);
    await rest('/meta_spend_cache?on_conflict=store_id,ad_id,date', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
  }

  return payload.length;
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
  const params = req.nextUrl.searchParams;
  const requestedStoreId = (params.get('store_id') || '').trim();
  const forceAll = params.get('full') === '1';
  const explicitAuto = params.get('auto') === '1';
  const isVercelCron = (req.headers.get('x-vercel-cron') || '').length > 0;
  const autoMode = !forceAll && (explicitAuto || (isVercelCron && requestedStoreId.length === 0));
  const days = parseDaysParam(params.get('days'), autoMode ? 1 : 7);

  let targetStores: StoreLike[] = requestedStoreId
    ? stores.filter((store) => store.id === requestedStoreId)
    : stores;

  if (autoMode) {
    const eligible = targetStores
      .filter((store) => isStoreMetaActive(store))
      .map((store) => store.id)
      .sort();
    const pickedStoreId = pickRoundRobinStoreId(eligible);
    targetStores = pickedStoreId ? targetStores.filter((store) => store.id === pickedStoreId) : [];
  }

  const results: Array<{
    storeId: string;
    status: string;
    rows?: number;
    accountsProcessed?: number;
    accountsTotal?: number;
    error?: string;
  }> = [];

  for (const store of targetStores) {
    const start = Date.now();
    try {
      // Get Meta connection for this store
      const metaConn = await getPersistentConnection(store.id, 'meta');
      if (!metaConn || !metaConn.access_token) {
        results.push({ storeId: store.id, status: 'skipped', error: 'No Meta connection' });
        continue;
      }

      // Get ad accounts for this store
      const adAccounts = await listPersistentStoreAdAccounts(store.id) as ActiveAccount[];
      const activeAccounts = normalizeActiveMetaAccounts(adAccounts);
      const accountsToProcess = autoMode
        ? pickAccountBatch(activeAccounts, AUTO_ACCOUNT_BATCH_SIZE)
        : activeAccounts;

      if (accountsToProcess.length === 0) {
        results.push({ storeId: store.id, status: 'skipped', error: 'No active ad accounts' });
        continue;
      }

      let totalRows = 0;

      for (const account of accountsToProcess) {
        const adAccountId = account.ad_account_id.startsWith('act_')
          ? account.ad_account_id
          : `act_${account.ad_account_id}`;
        const tz = account.timezone || 'America/New_York';
        const today = todayInTimezone(tz);

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

        totalRows += await upsertMetaSpendRows(store.id, adAccountId, todayData?.data || [], today);

        // ---- Pass 2: Re-fetch previous days to capture retroactive Meta attribution updates ----
        // Meta attribution data can change for up to 7 days after the click/view event.
        for (let i = 1; i < days; i++) {
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

            totalRows += await upsertMetaSpendRows(store.id, adAccountId, historicalData?.data || [], dayStr);
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
      results.push({
        storeId: store.id,
        status: 'success',
        rows: totalRows,
        accountsProcessed: accountsToProcess.length,
        accountsTotal: activeAccounts.length,
      });
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
    mode: autoMode ? 'single_store_auto' : requestedStoreId ? 'single_store_manual' : 'all_stores',
    days,
    storesTargeted: targetStores.length,
    storesTotal: stores.length,
    runAt: new Date().toISOString(),
    results,
  });
}
