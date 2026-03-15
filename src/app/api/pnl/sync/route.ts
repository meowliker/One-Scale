import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

const PNL_SYNC_SECRET = process.env.PNL_SYNC_SECRET ?? '';

/**
 * Get the store's timezone from the ad account settings.
 * Falls back to America/New_York if not found.
 */
async function getStoreTimezoneServer(storeId: string): Promise<string> {
  try {
    const accounts = await rest<Array<{ timezone: string | null }>>(
      `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.1&select=timezone&limit=1`
    );
    return accounts?.[0]?.timezone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/**
 * Get YYYY-MM-DD for "today" and "N days ago" in a specific timezone.
 * Uses Intl.DateTimeFormat to avoid importing date-fns-tz in server route.
 */
function formatDateInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Convert a date string + timezone to UTC ISO bounds for API queries.
 * E.g., "2026-03-12" in "America/New_York" → "2026-03-12T05:00:00Z" to "2026-03-13T04:59:59Z"
 */
function dateStrToUtcBounds(dateStr: string, tz: string): { min: string; max: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const startLocal = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  // Find timezone offset: compare midnight UTC with how it renders in the target TZ
  const utcDate = new Date(`${dateStr}T00:00:00Z`);
  const inTzStr = utcDate.toLocaleString('en-US', { timeZone: tz });
  const inTzDate = new Date(inTzStr);
  const offsetMs = utcDate.getTime() - inTzDate.getTime();

  // Midnight in target TZ as UTC
  const midnightUtc = new Date(startLocal.getTime() + offsetMs);
  const endUtc = new Date(midnightUtc.getTime() + 24 * 60 * 60 * 1000 - 1000); // 23:59:59

  return {
    min: midnightUtc.toISOString(),
    max: endUtc.toISOString(),
  };
}

/**
 * Read the store's currency from store_config. Falls back to 'USD'.
 */
async function getStoreCurrencyServer(storeId: string): Promise<string> {
  try {
    const rows = await rest<Array<{ currency: string }>>(
      `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=currency&limit=1`
    );
    return rows?.[0]?.currency || 'USD';
  } catch {
    return 'USD';
  }
}

// GET: Read pre-aggregated snapshots from DB (replaces live API calls)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const days = parseInt(searchParams.get('days') ?? '31', 10);

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Use store timezone to calculate the date range
  const now = new Date();
  const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // For the GET query we just need a YYYY-MM-DD string — use UTC as a safe approximation
  // since daily_pnl_snapshots dates are already stored in store timezone by the POST handler
  const sinceStr = sinceDate.toISOString().split('T')[0];

  try {
    const data = await rest<Array<{
      date: string;
      revenue: number;
      cogs: number;
      ad_spend: number;
      shipping_cost: number;
      transaction_fees: number;
      refunds: number;
      net_profit: number;
      margin: number;
      order_count: number;
      full_refund_count: number;
      partial_refund_count: number;
      full_refund_amount: number;
      partial_refund_amount: number;
      chargeback_loss: number;
      chargeback_won: number;
      gross_revenue: number;
      settled_revenue: number;
      revenue_source: string;
      synced_at: string;
    }>>(
      `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${sinceStr}&select=*&order=date.asc`
    );

    const entries = (data ?? []).map(row => ({
      date: row.date,
      revenue: Number(row.revenue),
      grossRevenue: row.gross_revenue ? Number(row.gross_revenue) : undefined,
      settledRevenue: row.settled_revenue ? Number(row.settled_revenue) : undefined,
      revenueSource: (row.revenue_source as 'settled' | 'orders_api') || undefined,
      cogs: Number(row.cogs),
      adSpend: Number(row.ad_spend),
      shipping: Number(row.shipping_cost),
      fees: Number(row.transaction_fees),
      refunds: Number(row.refunds),
      netProfit: Number(row.net_profit),
      margin: Number(row.margin),
      orderCount: row.order_count,
      fullRefundCount: row.full_refund_count,
      partialRefundCount: row.partial_refund_count,
      fullRefundAmount: Number(row.full_refund_amount),
      partialRefundAmount: Number(row.partial_refund_amount),
      chargebackLoss: Number(row.chargeback_loss),
      chargebackWon: Number(row.chargeback_won),
    }));

    const lastRow = data?.[data.length - 1];
    const staleSec = lastRow
      ? Math.round((Date.now() - new Date(lastRow.synced_at).getTime()) / 1000)
      : 999999;

    // Include the store's currency so the frontend knows how to format values
    const currency = await getStoreCurrencyServer(storeId);

    return NextResponse.json({
      data: entries,
      meta: {
        count: entries.length,
        staleSec,
        isStale: staleSec > 300,
        lastSyncedAt: lastRow?.synced_at ?? null,
        currency,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DB error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Compute P&L for date range and upsert into daily_pnl_snapshots
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    storeId: string;
    secret?: string;
    daysBack?: number;
  };

  if (body.secret && body.secret !== PNL_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { storeId, daysBack = 1 } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Use the store's timezone for date calculations
  const storeTz = await getStoreTimezoneServer(storeId);
  const now = new Date();

  const dates: string[] = [];
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(formatDateInTz(d, storeTz));
  }

  const results: Array<{ date: string; success: boolean; error?: string }> = [];
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  for (const dateStr of dates) {
    try {
      // Convert date string to proper UTC bounds using store timezone
      const utcBounds = dateStrToUtcBounds(dateStr, storeTz);

      // Fetch orders via existing internal route (already rate-limited)
      const ordersRes = await fetch(
        `${baseUrl}/api/shopify/orders?` + new URLSearchParams({
          storeId,
          created_at_min: utcBounds.min,
          created_at_max: utcBounds.max,
          status: 'any',
          limit: '250',
        }),
        { headers: { 'x-internal-sync': '1' } }
      );
      const ordersJson = await ordersRes.json() as {
        data?: Array<{
          id: number | string;
          totalPrice: string;
          financialStatus: string;
          lineItems: Array<{ quantity: number; productId: number | string; price: string }>;
          refunds?: Array<{ totalAmount: number; createdAt: string }>;
        }>;
      };
      const orders = ordersJson.data ?? [];

      // COGS settings
      let cogsRows: Array<{ product_id: string | null; cost_per_unit: number | null; cost_percentage: number | null }> = [];
      try {
        cogsRows = await rest<typeof cogsRows>(
          `/store_cogs_settings?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,cost_per_unit,cost_percentage`
        );
      } catch { /* no COGS table yet — use defaults */ }

      const defaultCogs = cogsRows?.find(r => !r.product_id);
      const defaultRate = defaultCogs?.cost_percentage
        ? Number(defaultCogs.cost_percentage) / 100
        : 0.30;

      // Real fees from webhook-stored data
      const orderIds = orders.map(o => String(o.id));
      let feeRows: Array<{ order_id: string; fee: number }> = [];
      if (orderIds.length > 0) {
        try {
          feeRows = await rest<typeof feeRows>(
            `/shopify_transaction_fees?store_id=eq.${encodeURIComponent(storeId)}&transaction_type=eq.payment&order_id=in.(${orderIds.map(id => encodeURIComponent(id)).join(',')})&select=order_id,fee`
          );
        } catch { /* no fee data yet */ }
      }

      const feeMap = new Map((feeRows ?? []).map(r => [r.order_id, Math.abs(Number(r.fee))]));

      // Chargebacks for this date (using timezone-aware UTC bounds)
      let cbRows: Array<{ amount: number; status: string }> = [];
      try {
        // Query by finalized_at (balance-synced) or created_at (webhook-synced with no finalized_at)
        const cbMin = encodeURIComponent(utcBounds.min);
        const cbMax = encodeURIComponent(utcBounds.max);
        const orFilter = `finalized_at.gte.${cbMin},finalized_at.lte.${cbMax}`;
        cbRows = await rest<typeof cbRows>(
          `/shopify_chargebacks?store_id=eq.${encodeURIComponent(storeId)}&or=(and(${orFilter}),and(finalized_at.is.null,created_at.gte.${cbMin},created_at.lte.${cbMax}))&select=amount,status`
        );
      } catch { /* no chargeback data yet */ }

      let chargebackLoss = (cbRows ?? [])
        .filter(c => c.status === 'lost')
        .reduce((s, c) => s + Number(c.amount), 0);
      let chargebackWon = (cbRows ?? [])
        .filter(c => c.status === 'won')
        .reduce((s, c) => s + Number(c.amount), 0);

      // Aggregate
      let revenue = 0, orderCount = 0, cogs = 0;
      let transactionFees = 0, refunds = 0;
      let fullRefundCount = 0, partialRefundCount = 0;
      let fullRefundAmount = 0, partialRefundAmount = 0;

      for (const order of orders) {
        const isFullRefund = order.financialStatus === 'refunded';
        const isPartial = order.financialStatus === 'partially_refunded';

        if (isFullRefund) {
          const amt = (order.refunds ?? []).reduce((s, r) => s + r.totalAmount, 0);
          refunds += amt; fullRefundCount++; fullRefundAmount += amt;
          continue;
        }

        const rev = parseFloat(order.totalPrice);
        revenue += rev; orderCount++;

        for (const item of order.lineItems) {
          const ps = cogsRows?.find(r => r.product_id === String(item.productId));
          const itemRev = parseFloat(item.price) * item.quantity;
          cogs += ps?.cost_per_unit ? Number(ps.cost_per_unit) * item.quantity : itemRev * defaultRate;
        }

        const fee = feeMap.get(String(order.id)) ?? 0;
        transactionFees += fee > 0 ? fee : rev * 0.03;

        if (isPartial) {
          for (const r of order.refunds ?? []) {
            // Convert refund timestamp to store timezone date for accurate bucketing
            const refundDate = r.createdAt ? formatDateInTz(new Date(r.createdAt), storeTz) : '';
            if (refundDate === dateStr) {
              refunds += r.totalAmount; partialRefundCount++; partialRefundAmount += r.totalAmount;
            }
          }
        }
      }

      // ── Balance transactions (settled revenue, real fees) ──────
      let settledRevenue = 0;
      let btFees = 0;
      let btRefunds = 0;
      let btChargebackLoss = 0;
      let btChargebackWon = 0;
      let hasBalanceTxns = false;
      try {
        const btRows = await rest<Array<{ type: string; amount: string; fee: string; net: string }>>(
          `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}&processed_at=gte.${encodeURIComponent(utcBounds.min)}&processed_at=lte.${encodeURIComponent(utcBounds.max)}&select=type,amount,fee,net`
        );
        if (btRows && btRows.length > 0) {
          hasBalanceTxns = true;
          for (const txn of btRows) {
            const amount = Math.abs(parseFloat(txn.amount || '0'));
            const fee = Math.abs(parseFloat(txn.fee || '0'));
            const net = parseFloat(txn.net || '0');
            switch (txn.type) {
              case 'charge': settledRevenue += amount; btFees += fee; break;
              case 'refund': btRefunds += amount; break;
              case 'dispute':
                if (net < 0) btChargebackLoss += Math.abs(net);
                else btChargebackWon += net;
                break;
              case 'adjustment': case 'debit': case 'credit':
                settledRevenue += parseFloat(txn.amount || '0');
                break;
            }
          }
        }
      } catch { /* balance txn table may not exist yet */ }

      // Override with balance txn data when available
      if (hasBalanceTxns) {
        transactionFees = btFees;
        refunds = btRefunds;
        chargebackLoss = btChargebackLoss;
        chargebackWon = btChargebackWon;
      }
      // ── End balance transactions ───────────────────────────────

      // Meta ad spend — read from meta_spend_cache (already synced by cron)
      let adSpend = 0;
      try {
        const spendRows = await rest<Array<{ spend: number }>>(
          `/meta_spend_cache?store_id=eq.${encodeURIComponent(storeId)}&date=eq.${dateStr}&select=spend`
        );
        adSpend = (spendRows ?? []).reduce((s, r) => s + (Number(r.spend) || 0), 0);
      } catch { /* meta_spend_cache unavailable — 0 until next sync */ }

      // Fallback: if no cached spend, try live Meta API
      if (adSpend === 0) {
        try {
          const mr = await fetch(
            `${baseUrl}/api/meta/insights?` + new URLSearchParams({ storeId, since: dateStr, until: dateStr })
          );
          if (mr.ok) {
            const mj = await mr.json() as { data?: Array<{ date: string; metrics?: { spend?: number }; spend?: number }> };
            for (const row of mj.data ?? []) {
              const spend = row.metrics?.spend ?? row.spend ?? 0;
              if (row.date === dateStr) adSpend += spend;
            }
          }
        } catch { /* Meta unavailable — 0 until next sync */ }
      }

      // Use settled revenue for P&L when balance txns available
      const revenueForPnL = hasBalanceTxns && settledRevenue > 0 ? settledRevenue : revenue;
      const netProfit = revenueForPnL - cogs - adSpend - transactionFees - refunds - chargebackLoss + chargebackWon;
      const margin = revenueForPnL > 0 ? (netProfit / revenueForPnL) * 100 : 0;

      // ── Attribution coverage ──────────────────────────────────────────
      // How many of today's orders have pixel attribution data?
      let attributionRate = 0;
      if (orderIds.length > 0) {
        try {
          const attributionRows = await rest<Array<{ order_id: string }>>(
            `/order_attributions?store_id=eq.${encodeURIComponent(storeId)}&order_id=in.(${orderIds.map(id => encodeURIComponent(id)).join(',')})&select=order_id`
          );
          const attributedCount = (attributionRows ?? []).length;
          attributionRate = orderCount > 0 ? Math.round((attributedCount / orderCount) * 100) : 0;
        } catch { /* order_attributions table may not exist yet */ }
      }
      // ── End attribution ───────────────────────────────────────────────

      await rest(
        '/daily_pnl_snapshots?on_conflict=store_id,date',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{
            store_id: storeId, date: dateStr,
            revenue: revenueForPnL, order_count: orderCount, cogs,
            ad_spend: adSpend, shipping_cost: 0,
            transaction_fees: transactionFees, refunds,
            full_refund_count: fullRefundCount, partial_refund_count: partialRefundCount,
            full_refund_amount: fullRefundAmount, partial_refund_amount: partialRefundAmount,
            chargeback_loss: chargebackLoss, chargeback_won: chargebackWon,
            net_profit: netProfit, margin,
            attribution_rate: attributionRate,
            synced_at: new Date().toISOString(),
            shopify_synced: orders.length > 0,
            meta_synced: adSpend > 0,
          }]),
        }
      );

      results.push({ date: dateStr, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      results.push({ date: dateStr, success: false, error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
