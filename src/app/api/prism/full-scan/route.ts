import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, rest } from '@/app/api/lib/supabase-persistence';
import { scanProductFamilies } from '@/lib/pnl/familyScanner';
import { runAutoSync } from '@/lib/pnl/autoProductConfig';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  if (!storeId) {
    return NextResponse.json({ error: 'store_id required' }, { status: 400 });
  }

  const start = Date.now();
  const report: Record<string, unknown> = { storeId, startedAt: new Date().toISOString() };

  try {
    // Step 1: Auto-detect products + classify
    console.log(`[full-scan] Step 1: AutoSync for ${storeId}`);
    const syncResult = await runAutoSync(storeId);
    report.autoSync = syncResult;

    // Step 2: Scan families
    console.log(`[full-scan] Step 2: Family scan for ${storeId}`);
    const familyResult = await scanProductFamilies(storeId);
    report.families = familyResult;

    // Step 3: Load ad account mappings
    const adMappings = await rest<Array<{ ad_account_id: string; product_id: string }>>(
      `/meta_ad_account_mappings?store_id=eq.${enc(storeId)}&select=ad_account_id,product_id`
    ).catch(() => []);
    report.adAccountMappings = adMappings.length;

    // Step 4: Load product_config (main products)
    const mainProducts = await rest<Array<{ product_id: string; product_name: string }>>(
      `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name`
    ).catch(() => []);
    report.mainProducts = mainProducts.map(p => ({ id: p.product_id, name: p.product_name }));

    // Step 5: Load all family relationships and group by parent
    const families = await rest<Array<{
      child_product_id: string; child_title: string;
      parent_product_id: string; parent_title: string;
      relationship: string; co_occurrence: number; window_order_count: number;
    }>>(
      `/product_families?store_id=eq.${enc(storeId)}&select=*&order=parent_product_id,co_occurrence.desc`
    ).catch(() => []);

    const familyTree: Record<string, { parent: string; children: Array<Record<string, unknown>> }> = {};
    for (const f of families) {
      if (!familyTree[f.parent_product_id]) {
        familyTree[f.parent_product_id] = { parent: f.parent_title || f.parent_product_id, children: [] };
      }
      familyTree[f.parent_product_id].children.push({
        id: f.child_product_id,
        title: f.child_title,
        relationship: f.relationship,
        coOccurrence: f.co_occurrence,
        ordersInWindow: f.window_order_count,
      });
    }
    report.familyTree = familyTree;
    report.paidVariants = familyResult.paidVariants || [];

    const elapsed = Date.now() - start;
    report.durationMs = elapsed;
    report.completedAt = new Date().toISOString();
    report.status = 'success';

    return NextResponse.json(report);
  } catch (err) {
    const elapsed = Date.now() - start;
    report.durationMs = elapsed;
    report.status = 'error';
    report.error = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(report, { status: 500 });
  }
}
