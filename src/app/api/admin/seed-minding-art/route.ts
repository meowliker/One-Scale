import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const STORE_ID = 'store-b8eea935d87e';

export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const results: string[] = [];

  // Seed product_config
  const products = [
    {
      store_id: STORE_ID,
      product_id: '7645091135571',
      product_name: 'Big Mystery Box',
      main_keywords: [['big mystery box'], ['mystery box']],
      upsell_keywords: ['mystery box upsell', 'mystery box bump'],
      is_active: true,
    },
    {
      store_id: STORE_ID,
      product_id: '7748916576339',
      product_name: 'Textured Art Mystery Box',
      main_keywords: [['texture'], ['textured art']],
      upsell_keywords: ['texture upsell', 'texture bump'],
      is_active: true,
    },
    {
      store_id: STORE_ID,
      product_id: '7644075589715',
      product_name: 'Big Art Therapy Mystery Box',
      main_keywords: [['art therapy']],
      upsell_keywords: ['art therapy upsell'],
      is_active: true,
    },
    {
      store_id: STORE_ID,
      product_id: '7767103209555',
      product_name: 'Reading Comprehension Pack',
      main_keywords: [['reading comprehension'], ['phonics']],
      upsell_keywords: ['phonics upsell', 'reading bump'],
      is_active: true,
    },
    {
      store_id: STORE_ID,
      product_id: '7645092020307',
      product_name: 'Kids Stress Response Emotional Educational Bundle',
      main_keywords: [['kids stress'], ['life skills'], ['kid life skill']],
      upsell_keywords: ['life skills upsell'],
      is_active: true,
    },
  ];

  try {
    await rest('/product_config?on_conflict=store_id,product_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(products),
    });
    results.push(`product_config: ${products.length} products seeded`);
  } catch (err) {
    results.push(`product_config ERROR: ${err instanceof Error ? err.message : err}`);
  }

  // Seed meta_ad_account_mappings
  const adMappings = [
    {
      store_id: STORE_ID,
      ad_account_id: 'act_1219652880085083',
      product_id: '7748916576339',
      product_keywords: ['texture', 'textured art'],
    },
    {
      store_id: STORE_ID,
      ad_account_id: 'act_24525926703729170',
      product_id: '7644075589715',
      product_keywords: ['art therapy'],
    },
    {
      store_id: STORE_ID,
      ad_account_id: 'act_1348275523279511',
      product_id: '7767103209555',
      product_keywords: ['phonics', 'reading'],
    },
    {
      store_id: STORE_ID,
      ad_account_id: 'act_1429897215591061',
      product_id: '7645092020307',
      product_keywords: ['kids life', 'life skills', 'kid life'],
    },
    {
      store_id: STORE_ID,
      ad_account_id: 'act_3394934320664352',
      product_id: '7645091135571',
      product_keywords: ['mystery box', 'smw'],
    },
  ];

  try {
    await rest('/meta_ad_account_mappings?on_conflict=store_id,ad_account_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(adMappings),
    });
    results.push(`meta_ad_account_mappings: ${adMappings.length} mappings seeded`);
  } catch (err) {
    results.push(`meta_ad_account_mappings ERROR: ${err instanceof Error ? err.message : err}`);
  }

  // Verify
  try {
    const configCount = await rest<Array<{ count: number }>>(`/product_config?store_id=eq.${STORE_ID}&select=count`);
    const mappingCount = await rest<Array<{ count: number }>>(`/meta_ad_account_mappings?store_id=eq.${STORE_ID}&select=count`);
    results.push(`Verify: ${JSON.stringify(configCount)} product_config rows, ${JSON.stringify(mappingCount)} mapping rows`);
  } catch (err) {
    results.push(`Verify ERROR: ${err instanceof Error ? err.message : err}`);
  }

  return NextResponse.json({ success: true, results });
}
