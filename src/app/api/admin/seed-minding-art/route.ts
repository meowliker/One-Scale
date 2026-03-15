import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const STORE_ID = 'store-b8eea935d87e';
const enc = (v: string) => encodeURIComponent(v);

export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const results: string[] = [];

  // Step 0: Delete old wrong product_config entries
  try {
    await rest(`/product_config?store_id=eq.${enc(STORE_ID)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    results.push('Deleted old product_config entries');
  } catch (err) {
    results.push(`Delete old config: ${err instanceof Error ? err.message : err}`);
  }

  // Step 1: Find the actual FREE ($0) main products from order data
  // These are the funnel lead magnets — the REAL main products
  // We need their product_ids from the line items
  let freeProducts: Array<{ product_id: string; title: string; order_count: number }> = [];
  try {
    // Query orders to find $0 products with high order counts
    const orders = await rest<Array<{ line_items: string }>>(
      `/shopify_orders_cache?store_id=eq.${enc(STORE_ID)}&select=line_items&limit=500&order=created_at.desc`
    );

    const productStats = new Map<string, { title: string; count: number; totalPrice: number }>();
    for (const order of orders ?? []) {
      let items: Array<{ product_id?: string | number; title?: string; price?: string }>;
      try {
        items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
      } catch { continue; }

      for (const item of items) {
        const pid = item.product_id ? String(item.product_id) : '';
        if (!pid) continue;
        const price = parseFloat(item.price || '0');
        const existing = productStats.get(pid) ?? { title: item.title || '', count: 0, totalPrice: 0 };
        existing.count++;
        existing.totalPrice += price;
        if (!existing.title && item.title) existing.title = item.title;
        productStats.set(pid, existing);
      }
    }

    // Find FREE products (avg price = 0) with significant order count
    freeProducts = [...productStats.entries()]
      .filter(([, stats]) => stats.totalPrice === 0 && stats.count >= 5)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([pid, stats]) => ({ product_id: pid, title: stats.title, order_count: stats.count }));

    results.push(`Found ${freeProducts.length} free ($0) products from ${orders?.length ?? 0} orders`);
  } catch (err) {
    results.push(`Free product scan ERROR: ${err instanceof Error ? err.message : err}`);
  }

  // Step 2: Seed product_config with the FREE main products
  // Clean title: strip "(Free Today)", "(FREE TODAY)", etc.
  function cleanName(title: string): string {
    return title
      .replace(/\s*\(free today\)\s*/gi, '')
      .replace(/\s*\(free\)\s*/gi, '')
      .replace(/\s*free today\s*/gi, '')
      .trim();
  }

  // Map of known products → keywords (based on campaign name analysis)
  const keywordMap: Record<string, string[][]> = {
    'art therapy': [['art therapy']],
    'life skills': [['life skills'], ['kids life']],
    'phonics': [['phonics']],
    'morning work': [['morning work'], ['structured morning']],
    'texture': [['texture art'], ['texture']],
  };

  function guessKeywords(title: string): string[][] {
    const lower = title.toLowerCase();
    for (const [key, keywords] of Object.entries(keywordMap)) {
      if (lower.includes(key)) return keywords;
    }
    // Fallback: use significant words from title
    const words = cleanName(title).toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length >= 2) return [words.slice(0, 3)];
    return [[cleanName(title).toLowerCase()]];
  }

  const productConfigs = freeProducts.map(p => ({
    store_id: STORE_ID,
    product_id: p.product_id,
    product_name: cleanName(p.title),
    main_keywords: guessKeywords(p.title),
    upsell_keywords: [] as string[],
    is_active: true,
  }));

  if (productConfigs.length > 0) {
    try {
      await rest('/product_config?on_conflict=store_id,product_id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(productConfigs),
      });
      results.push(`product_config: ${productConfigs.length} FREE main products seeded`);
      for (const p of productConfigs) {
        results.push(`  → ${p.product_name} (${p.product_id}) keywords=${JSON.stringify(p.main_keywords)}`);
      }
    } catch (err) {
      results.push(`product_config ERROR: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    results.push('WARNING: No free products found — cannot seed product_config');
  }

  // Step 3: Seed meta_ad_account_mappings
  // Map ad accounts to products by campaign keywords
  const adMappings = [
    {
      store_id: STORE_ID,
      ad_account_id: 'act_1219652880085083',
      product_id: null as string | null,
      product_keywords: ['texture', 'texture art'],
    },
    {
      store_id: STORE_ID,
      ad_account_id: 'act_24525926703729170',
      product_id: null as string | null,
      product_keywords: ['art therapy'],
    },
    {
      store_id: STORE_ID,
      ad_account_id: 'act_1348275523279511',
      product_id: null as string | null,
      product_keywords: ['phonics'],
    },
    {
      store_id: STORE_ID,
      ad_account_id: 'act_1429897215591061',
      product_id: null as string | null,
      product_keywords: ['kids life', 'life skills', 'kid life'],
    },
    {
      store_id: STORE_ID,
      ad_account_id: 'act_3394934320664352',
      product_id: null as string | null,
      product_keywords: ['morning work', 'smw'],
    },
  ];

  // Try to resolve product_id from the seeded configs
  for (const mapping of adMappings) {
    for (const config of productConfigs) {
      const configName = config.product_name.toLowerCase();
      if (mapping.product_keywords.some(kw => configName.includes(kw.toLowerCase()))) {
        mapping.product_id = config.product_id;
        break;
      }
    }
  }

  try {
    await rest(`/meta_ad_account_mappings?store_id=eq.${enc(STORE_ID)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    await rest('/meta_ad_account_mappings?on_conflict=store_id,ad_account_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(adMappings),
    });
    results.push(`meta_ad_account_mappings: ${adMappings.length} mappings seeded`);
    for (const m of adMappings) {
      results.push(`  → ${m.ad_account_id} → product=${m.product_id ?? 'keyword-match'} keywords=${JSON.stringify(m.product_keywords)}`);
    }
  } catch (err) {
    results.push(`meta_ad_account_mappings ERROR: ${err instanceof Error ? err.message : err}`);
  }

  return NextResponse.json({ success: true, freeProducts, results });
}
