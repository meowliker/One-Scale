// src/lib/pnl/familyScanner.ts
import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

interface LineItem {
  product_id?: string | number;
  title?: string;
  price?: string;
  quantity?: number;
}

interface OrderRow {
  shopify_order_id: string;
  total_price: number;
  line_items: string | LineItem[];
  financial_status: string;
}

interface FamilyRelation {
  childId: string;
  childTitle: string;
  parentId: string;
  parentTitle: string;
  relationship: string;
}

interface PaidVariant {
  freeProductId: string;
  freeProductName: string;
  paidProductId: string;
  paidProductName: string;
  paidPrice: number;
  paidOrders: number;
  aloneRate: number; // % of orders where paid variant appears without the free version
  titleSimilarity: number; // 0-100
}

interface ScanResult {
  familiesFound: number;
  childrenMapped: number;
  orphanProducts: number;
  totalOrdersScanned: number;
  paidVariants: PaidVariant[]; // Free + paid version detection
  families: Array<{
    mainProduct: string;
    mainTitle: string;
    children: Array<{ id: string; title: string; relationship: string; coOccurrence: number }>;
  }>;
}

/**
 * Scan all orders in a 29-day window and build product family relationships.
 * Every line item in every order gets accounted for — nothing lost.
 */
export async function scanProductFamilies(storeId: string): Promise<ScanResult> {
  // 1. Load main products from product_config
  const mainProducts = await rest<Array<{ product_id: string; product_name: string }>>(
    `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name`
  ).catch(() => []);
  const mainIds = new Set(mainProducts.map(p => p.product_id));
  const mainNameMap = new Map(mainProducts.map(p => [p.product_id, p.product_name]));

  // 2. Load ALL orders from last 29 days (paginated)
  const since = new Date();
  since.setDate(since.getDate() - 29);
  const sinceISO = since.toISOString();

  const allOrders: OrderRow[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;

  while (hasMore) {
    const page = await rest<OrderRow[]>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(sinceISO)}&select=shopify_order_id,total_price,line_items,financial_status&order=created_at.asc&limit=${PAGE_SIZE}&offset=${offset}`
    ).catch(() => []);
    allOrders.push(...page);
    hasMore = page.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  // Filter to paid orders
  const paidOrders = allOrders.filter(o =>
    o.financial_status !== 'refunded' && o.financial_status !== 'voided'
  );

  // 3. Scan every order — build co-occurrence counts
  // Key: "childId::parentId" → { count, childTitle, parentTitle, relationship }
  const coMap = new Map<string, { count: number; childTitle: string; parentTitle: string; relationship: string }>();
  // Track total orders per child product
  const childOrderCount = new Map<string, number>();
  // Track all seen products
  const allProducts = new Map<string, string>(); // id → title

  for (const order of paidOrders) {
    let items: LineItem[];
    try {
      items = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items)
        : order.line_items || [];
    } catch { continue; }

    // Separate main vs non-main items in this order
    const mainItemsInOrder: Array<{ id: string; title: string; price: number }> = [];
    const childItemsInOrder: Array<{ id: string; title: string; price: number }> = [];

    for (const item of items) {
      const pid = item.product_id ? String(item.product_id) : '';
      if (!pid || pid === 'null' || pid === '0') continue;
      const title = item.title || '';
      const price = parseFloat(item.price ?? '0');
      allProducts.set(pid, title);

      if (mainIds.has(pid)) {
        mainItemsInOrder.push({ id: pid, title, price });
      } else {
        childItemsInOrder.push({ id: pid, title, price });
      }
    }

    // No children in this order → skip
    if (childItemsInOrder.length === 0) continue;

    // Track child order counts
    for (const child of childItemsInOrder) {
      childOrderCount.set(child.id, (childOrderCount.get(child.id) || 0) + 1);
    }

    // No main in this order → orphan, skip co-occurrence (handled later via keyword matching)
    if (mainItemsInOrder.length === 0) continue;

    // Pick the main product to assign children to
    // Multi-main: use highest priced main
    const primaryMain = mainItemsInOrder.sort((a, b) => b.price - a.price)[0];

    // Link each child to the main
    for (const child of childItemsInOrder) {
      const key = `${child.id}::${primaryMain.id}`;
      const existing = coMap.get(key);
      const relationship = classifyRelationship(child.title, child.price, primaryMain.price);

      if (existing) {
        existing.count++;
      } else {
        coMap.set(key, {
          count: 1,
          childTitle: child.title,
          parentTitle: primaryMain.title,
          relationship,
        });
      }
    }
  }

  // 4. Compute co-occurrence percentages
  const relations: FamilyRelation[] = [];
  const coOccurrenceScores = new Map<string, number>(); // "childId::parentId" → score

  for (const [key, data] of coMap.entries()) {
    const [childId, parentId] = key.split('::');
    const totalChildOrders = childOrderCount.get(childId) || 1;
    const score = Math.round((data.count / totalChildOrders) * 10000) / 100; // 2 decimal places

    coOccurrenceScores.set(key, score);
    relations.push({
      childId,
      childTitle: data.childTitle,
      parentId,
      parentTitle: data.parentTitle,
      relationship: data.relationship,
    });
  }

  // 5. Handle orphan products — keyword/title similarity matching
  const orphanSet = new Set<string>();
  for (const [pid, title] of allProducts.entries()) {
    if (mainIds.has(pid)) continue;
    const hasParent = [...coMap.keys()].some(k => k.startsWith(`${pid}::`));
    if (!hasParent) {
      // Try keyword match against main product names
      const bestMain = findBestMainByKeyword(pid, title, mainProducts);
      if (bestMain) {
        const key = `${pid}::${bestMain.product_id}`;
        coMap.set(key, {
          count: 0,
          childTitle: title,
          parentTitle: bestMain.product_name,
          relationship: 'addon',
        });
        coOccurrenceScores.set(key, 0);
        relations.push({
          childId: pid,
          childTitle: title,
          parentId: bestMain.product_id,
          parentTitle: bestMain.product_name,
          relationship: 'addon',
        });
      } else {
        orphanSet.add(pid);
      }
    }
  }

  // 6. Write to product_families table (upsert)
  for (const [key, data] of coMap.entries()) {
    const [childId, parentId] = key.split('::');
    const score = coOccurrenceScores.get(key) || 0;

    await rest('/product_families?on_conflict=store_id,child_product_id,parent_product_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        store_id: storeId,
        child_product_id: childId,
        parent_product_id: parentId,
        child_title: data.childTitle,
        parent_title: data.parentTitle,
        relationship: data.relationship,
        co_occurrence: score,
        detection_method: data.count > 0 ? 'order_cooccurrence' : 'keyword_match',
        window_order_count: data.count,
        last_scanned_at: new Date().toISOString(),
      }),
    }).catch(() => null);
  }

  // 7. Update parent_product on product_classifications for each child
  // Pick highest co-occurrence parent per child
  const bestParentPerChild = new Map<string, { parentId: string; score: number }>();
  for (const [key, score] of coOccurrenceScores.entries()) {
    const [childId, parentId] = key.split('::');
    const current = bestParentPerChild.get(childId);
    if (!current || score > current.score) {
      bestParentPerChild.set(childId, { parentId, score });
    }
  }

  for (const [childId, { parentId }] of bestParentPerChild.entries()) {
    await rest(
      `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(childId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ parent_product: parentId }),
      }
    ).catch(() => null);
  }

  // 8. Clean up stale relationships (not seen in this scan, older than 90 days with <5 orders)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  await rest(
    `/product_families?store_id=eq.${enc(storeId)}&last_scanned_at=lt.${enc(ninetyDaysAgo.toISOString())}&window_order_count=lt.5`,
    { method: 'DELETE' }
  ).catch(() => null);

  // 9. Build result summary
  const familyMap = new Map<string, Array<{ id: string; title: string; relationship: string; coOccurrence: number }>>();
  for (const [key, data] of coMap.entries()) {
    const [childId, parentId] = key.split('::');
    const score = coOccurrenceScores.get(key) || 0;
    if (!familyMap.has(parentId)) familyMap.set(parentId, []);
    familyMap.get(parentId)!.push({
      id: childId,
      title: data.childTitle,
      relationship: data.relationship,
      coOccurrence: score,
    });
  }

  const families = [...familyMap.entries()].map(([parentId, children]) => ({
    mainProduct: parentId,
    mainTitle: mainNameMap.get(parentId) || parentId,
    children: children.sort((a, b) => b.coOccurrence - a.coOccurrence),
  }));

  // suppress unused variable warning — relations array built for potential future use
  void (relations as unknown);

  // ── Detect paid variants of free main products ──────────────────────
  // Some stores have BOTH a free lead magnet AND a paid version of the same product.
  // e.g. "1000+ Medical Nursing Notes" (free) + "Medical Nursing Notes" ($29.99)
  // Detect by: similar title + one is free (in mainProducts) + other is paid (in allProducts)
  const paidVariants: PaidVariant[] = [];
  for (const main of mainProducts) {
    const mainWords = new Set(
      main.product_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/free|today|v2/gi, '').split(/\s+/).filter(w => w.length > 2)
    );
    if (mainWords.size === 0) continue;

    for (const [pid, title] of allProducts.entries()) {
      if (mainIds.has(pid)) continue; // skip other mains
      const childWords = new Set(
        title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
      );
      if (childWords.size === 0) continue;

      // Check title similarity
      let overlap = 0;
      for (const w of mainWords) { if (childWords.has(w)) overlap++; }
      const similarity = Math.round((overlap / Math.max(mainWords.size, 1)) * 100);
      if (similarity < 50) continue; // need 50%+ word match

      // Check if this product has a price > $5 (it's the paid version)
      // We need to check order data for this
      let paidPrice = 0;
      let paidTotal = 0;
      let paidAlone = 0;
      for (const order of paidOrders) {
        let items: LineItem[];
        try { items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || []; } catch { continue; }
        const hasThis = items.some(i => String(i.product_id) === pid);
        if (!hasThis) continue;
        paidTotal++;
        const thisItem = items.find(i => String(i.product_id) === pid);
        const price = parseFloat(thisItem?.price ?? '0');
        if (price > paidPrice) paidPrice = price;
        // Check if this order has the free main
        const hasFreeMain = items.some(i => String(i.product_id) === main.product_id);
        if (!hasFreeMain) paidAlone++;
      }

      if (paidPrice >= 5 && paidTotal >= 1) {
        const aloneRate = paidTotal > 0 ? Math.round((paidAlone / paidTotal) * 100) : 0;
        paidVariants.push({
          freeProductId: main.product_id,
          freeProductName: main.product_name,
          paidProductId: pid,
          paidProductName: title,
          paidPrice,
          paidOrders: paidTotal,
          aloneRate,
          titleSimilarity: similarity,
        });

        // Tag the relationship as 'paid_variant' in product_families
        const key = `${pid}::${main.product_id}`;
        const existing = coMap.get(key);
        if (existing) {
          existing.relationship = 'paid_variant';
        }

        // Update in DB
        await rest('/product_families?on_conflict=store_id,child_product_id,parent_product_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            store_id: storeId,
            child_product_id: pid,
            parent_product_id: main.product_id,
            child_title: title,
            parent_title: main.product_name,
            relationship: 'paid_variant',
            co_occurrence: coOccurrenceScores.get(key) || 0,
            detection_method: 'price_heuristic',
            window_order_count: paidTotal,
            last_scanned_at: new Date().toISOString(),
          }),
        }).catch(() => null);

        console.log(`[familyScanner] Paid variant detected: "${title}" ($${paidPrice}) → free main "${main.product_name}" | ${paidTotal} orders, ${aloneRate}% alone, ${similarity}% title match`);
      }
    }
  }

  // If a paid variant has high alone_rate (>50%), log warning — it might need its own main entry
  for (const pv of paidVariants) {
    if (pv.aloneRate > 50 && pv.paidOrders >= 5) {
      console.warn(`[familyScanner] ALERT: "${pv.paidProductName}" ($${pv.paidPrice}) has ${pv.aloneRate}% alone rate with ${pv.paidOrders} orders — consider adding as main product`);
    }
  }

  return {
    familiesFound: families.length,
    childrenMapped: coMap.size,
    orphanProducts: orphanSet.size,
    totalOrdersScanned: paidOrders.length,
    paidVariants,
    families,
  };
}

/** Classify the relationship type based on price and title */
function classifyRelationship(childTitle: string, childPrice: number, mainPrice: number): string {
  const lower = childTitle.toLowerCase();
  if (lower.includes('lifetime') || lower.includes('upgrade') || lower.includes('access')) return 'bump';
  if (lower.includes('mystery box') || lower.includes('bundle')) return 'upsell';
  if (childPrice === 0) return 'addon';
  if (childPrice > mainPrice) return 'upsell';
  return 'downsell';
}

/** Find the best main product match by keyword overlap in title */
function findBestMainByKeyword(
  _childId: string,
  childTitle: string,
  mainProducts: Array<{ product_id: string; product_name: string }>
): { product_id: string; product_name: string } | null {
  const childWords = new Set(childTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  let bestMatch: { product_id: string; product_name: string } | null = null;
  let bestScore = 0;

  for (const main of mainProducts) {
    const mainWords = new Set(main.product_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
    let overlap = 0;
    for (const w of childWords) {
      if (mainWords.has(w)) overlap++;
    }
    const score = mainWords.size > 0 ? overlap / mainWords.size : 0;
    if (score > bestScore && score >= 0.3) { // At least 30% word overlap
      bestScore = score;
      bestMatch = main;
    }
  }

  return bestMatch;
}
