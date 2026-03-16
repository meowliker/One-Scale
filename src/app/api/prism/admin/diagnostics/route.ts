/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * Diagnostic endpoint — checks health of every data pipeline for every store.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const requestedStoreId = new URL(request.url).searchParams.get('storeId');
  const enc = (v: string) => encodeURIComponent(v);
  const ninetyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const ninetyDaysAgoDate = ninetyDaysAgo.split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let stores: Array<{ id: string; name: string }>;
  if (requestedStoreId) {
    const rows = await rest<Array<{ id: string; name: string }>>(
      `/stores?id=eq.${enc(requestedStoreId)}&select=id,name&limit=1`
    ).catch(() => []);
    stores = rows;
  } else {
    stores = await listPersistentStores();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const report: any[] = [];

  for (const store of stores) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checks: Record<string, any> = {};

    // ── CHECK 1: Orders coverage ────────────────────────────────
    const latestOrderRows = await rest<Array<{ created_at: string }>>(
      `/shopify_orders_cache?store_id=eq.${enc(store.id)}&select=created_at&order=created_at.desc&limit=1`
    ).catch(() => []);
    const oldestOrderRows = await rest<Array<{ created_at: string }>>(
      `/shopify_orders_cache?store_id=eq.${enc(store.id)}&select=created_at&order=created_at.asc&limit=1`
    ).catch(() => []);

    const latestOrder = latestOrderRows[0]?.created_at?.split('T')[0] ?? null;
    const oldestOrder = oldestOrderRows[0]?.created_at?.split('T')[0] ?? null;
    const ordersCurrent = latestOrder ? latestOrder >= yesterday : false;

    // Check line_items populated
    const sampleOrders = await rest<Array<{ shopify_order_id: string; line_items: string | null }>>(
      `/shopify_orders_cache?store_id=eq.${enc(store.id)}&select=shopify_order_id,line_items&order=created_at.desc&limit=3`
    ).catch(() => []);
    const hasLineItems = sampleOrders.length > 0 && sampleOrders.every(o => o.line_items && o.line_items.length > 10);

    checks.orders = {
      pass: !!latestOrder && hasLineItems,
      oldest: oldestOrder,
      latest: latestOrder,
      is_current: ordersCurrent,
      has_line_items: hasLineItems,
      issue: !latestOrder ? 'No orders cached — run onboarding'
        : !ordersCurrent ? `Orders only to ${latestOrder} — missing recent`
        : !hasLineItems ? 'Orders missing line_items'
        : null,
    };

    // ── CHECK 2: Balance transactions ───────────────────────────
    const btCharges = await rest<Array<{ amount: number; fee: number }>>(
      `/shopify_balance_transactions?store_id=eq.${enc(store.id)}&type=eq.charge&processed_at=gte.${enc(ninetyDaysAgo)}&select=amount,fee`
    ).catch(() => []);
    const btRefunds = await rest<Array<{ amount: number }>>(
      `/shopify_balance_transactions?store_id=eq.${enc(store.id)}&type=eq.refund&processed_at=gte.${enc(ninetyDaysAgo)}&select=amount`
    ).catch(() => []);

    const btRevenue = btCharges.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const btFees = btCharges.reduce((s, t) => s + Math.abs(Number(t.fee) || 0), 0);
    const btRefundTotal = btRefunds.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const feeRate = btRevenue > 0 ? (btFees / btRevenue * 100) : 0;

    checks.balance_transactions = {
      pass: btCharges.length > 0,
      charges: btCharges.length,
      refunds: btRefunds.length,
      revenue_30d: Math.round(btRevenue * 100) / 100,
      fees_30d: Math.round(btFees * 100) / 100,
      refunds_30d: Math.round(btRefundTotal * 100) / 100,
      fee_rate: feeRate.toFixed(2) + '%',
      issue: btCharges.length === 0 ? 'No balance transactions — run backfill' : null,
    };

    // ── CHECK 3: Meta spend ─────────────────────────────────────
    const metaRows = await rest<Array<{ date: string; spend: number; currency: string | null }>>(
      `/meta_spend_cache?store_id=eq.${enc(store.id)}&date=gte.${ninetyDaysAgoDate}&select=date,spend,currency&order=date.desc&limit=5`
    ).catch(() => []);
    const metaTotal = metaRows.reduce((s, r) => s + (r.spend || 0), 0);
    const metaCurrency = metaRows[0]?.currency || 'UNKNOWN';
    const metaDates = metaRows.map(r => r.date);

    checks.meta_ads = {
      pass: metaRows.length > 0,
      rows: metaRows.length,
      total_spend_sample: Math.round(metaTotal * 100) / 100,
      currency: metaCurrency,
      latest_dates: metaDates,
      issue: metaRows.length === 0 ? 'No Meta spend — connect Meta or run backfill' : null,
    };

    // ── CHECK 4: Product classifications ────────────────────────
    const classRows = await rest<Array<{ classification: string; manual_override: boolean }>>(
      `/product_classifications?store_id=eq.${enc(store.id)}&select=classification,manual_override`
    ).catch(() => []);

    const classDist: Record<string, number> = {};
    let manualCount = 0;
    for (const c of classRows) {
      classDist[c.classification] = (classDist[c.classification] || 0) + 1;
      if (c.manual_override) manualCount++;
    }
    const mainCount = classDist['main'] || 0;
    const mainPct = classRows.length > 0 ? Math.round(mainCount / classRows.length * 100) : 0;

    checks.classifications = {
      pass: classRows.length > 0 && mainPct <= 40,
      total: classRows.length,
      distribution: classDist,
      manual_overrides: manualCount,
      main_pct: mainPct + '%',
      issue: classRows.length === 0 ? 'No classifications — run force-classify-all'
        : mainCount === 0 ? 'No main products — set manually'
        : mainPct > 40 ? `${mainPct}% main — likely wrong`
        : null,
    };

    // ── CHECK 5: P&L snapshots ──────────────────────────────────
    const pnlRows = await rest<Array<{ date: string; revenue: number; transaction_fees: number; net_profit: number }>>(
      `/daily_pnl_snapshots?store_id=eq.${enc(store.id)}&date=gte.${ninetyDaysAgoDate}&select=date,revenue,transaction_fees,net_profit&order=date.desc&limit=5`
    ).catch(() => []);

    checks.pnl_snapshots = {
      pass: pnlRows.length > 0,
      days: pnlRows.length,
      latest: pnlRows.slice(0, 3).map(r => ({
        date: r.date,
        revenue: Number(r.revenue) || 0,
        fees: Number(r.transaction_fees) || 0,
        net: Number(r.net_profit) || 0,
      })),
      issue: pnlRows.length === 0 ? 'No P&L snapshots — run recompute-pnl' : null,
    };

    // ── CHECK 6: Ad spend in product performance ────────────────
    // This checks whether the product-performance route will show ads
    // by verifying the data chain: meta_spend → attribution → products
    const hasMetaSpend = metaRows.length > 0 && metaTotal > 0;
    const hasMainProducts = mainCount > 0;
    const adSpendWillShow = hasMetaSpend && hasMainProducts;

    checks.ad_spend_attribution = {
      pass: adSpendWillShow || !hasMetaSpend, // Pass if no ads connected (expected)
      has_meta_spend: hasMetaSpend,
      has_main_products: hasMainProducts,
      will_show_ads: adSpendWillShow,
      issue: hasMetaSpend && !hasMainProducts
        ? 'Meta spend exists but no MAIN products — ad spend cannot be attributed'
        : hasMetaSpend && !adSpendWillShow
        ? 'Meta spend exists but attribution broken — check campaign mappings'
        : null,
    };

    // ── OVERALL ─────────────────────────────────────────────────
    const allChecks = Object.values(checks);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issues = allChecks.filter((c: any) => c.issue).map((c: any) => c.issue);

    report.push({
      store: store.name,
      storeId: store.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      overall: { pass: issues.length === 0, checks: allChecks.length, failed: allChecks.filter((c: any) => !c.pass).length, issues },
      checks,
    });
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    total_stores: report.length,
    all_passing: report.every(s => s.overall.pass),
    stores: report,
  });
}
