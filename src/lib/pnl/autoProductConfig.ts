/**
 * Auto Sync Engine — Unified daily auto-detection pipeline
 *
 * Runs during daily cron for every store. All steps are interconnected:
 *
 *   1. autoSyncAdAccounts     — discover new Meta ad accounts, add to store_ad_accounts
 *   2. autoDetectProductConfig — detect main products from order data
 *   3. autoSyncAdMappings     — map ad accounts → products via campaign name analysis
 *
 * Each step feeds the next. Never overwrites manual config. Handles new accounts,
 * new campaigns, and new products automatically.
 *
 * Entry point: runAutoSync(storeId) — runs all 3 steps in order.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import { scanProductFamilies } from './familyScanner';

const enc = (v: string) => encodeURIComponent(v);

// ── Types ────────────────────────────────────────────────

interface OrderRow {
  line_items: string;
  created_at: string;
}

interface ProductStats {
  title: string;
  productId: string;
  orderCount: number;
  aloneCount: number;
  totalPrice: number;
  avgPrice: number;
  totalRevenue: number;
}

interface SpendRow {
  ad_account_id: string;
  campaign_name: string;
  spend: number;
}

interface AdAccountRow {
  ad_account_id: string;
  is_active: number | boolean;
}

interface ConnectionRow {
  access_token: string;
}

interface MetaAdAccount {
  id: string;
  name: string;
  account_id: string;
  currency: string;
  timezone_name: string;
  account_status: number;
}

interface ProductConfigRow {
  product_id: string;
  product_name: string;
  main_keywords: string[][];
}

export interface AutoSyncResult {
  storeId: string;
  adAccountsDiscovered: number;
  productsDetected: number;
  adMappingsSynced: number;
  familiesScanned: number;
  errors: string[];
}

// ── Entry Point ──────────────────────────────────────────

/**
 * Run the full auto-sync pipeline for a store.
 * Safe to call daily — only writes when new data is detected.
 */
export async function runAutoSync(storeId: string): Promise<AutoSyncResult> {
  const result: AutoSyncResult = {
    storeId,
    adAccountsDiscovered: 0,
    productsDetected: 0,
    adMappingsSynced: 0,
    familiesScanned: 0,
    errors: [],
  };

  // Step 1: Discover new Meta ad accounts
  try {
    result.adAccountsDiscovered = await autoSyncAdAccounts(storeId);
  } catch (err) {
    result.errors.push(`ad_accounts: ${err instanceof Error ? err.message : err}`);
  }

  // Step 2: Auto-detect main products
  try {
    result.productsDetected = await autoDetectProductConfig(storeId);
  } catch (err) {
    result.errors.push(`product_config: ${err instanceof Error ? err.message : err}`);
  }

  // Step 3: Map ad accounts → products (handles new accounts + new campaigns)
  try {
    result.adMappingsSynced = await autoSyncAdMappings(storeId);
  } catch (err) {
    result.errors.push(`ad_mappings: ${err instanceof Error ? err.message : err}`);
  }

  // Step 4: PRISM self-learning — compare product_config vs behavioral classification
  try {
    const { autoLearnFromProductConfig, updateProductActivityDates } = await import('@/lib/intelligence/classificationV2');
    const corrections = await autoLearnFromProductConfig(storeId);
    if (corrections > 0) console.log(`[AutoSync] ${storeId}: PRISM learned ${corrections} corrections`);

    // Step 5: Track product activity dates (first/last order, active status)
    await updateProductActivityDates(storeId);
  } catch { /* non-critical */ }

  // Step 6: PRISM Intelligence — anomaly detection + weight guardrails + cross-store learning
  try {
    const { runPrismIntelligence } = await import('@/lib/intelligence/prismIntelligence');
    const today = new Date().toISOString().slice(0, 10);
    const intel = await runPrismIntelligence(storeId, today);
    if (intel.anomalies.length > 0) {
      console.log(`[AutoSync] ${storeId}: ${intel.anomalies.length} anomalies detected`);
    }
  } catch { /* non-critical */ }

  // Step 7: Scan orders to build/refresh product family relationships
  let familiesScanned = 0;
  try {
    const familyResult = await scanProductFamilies(storeId);
    familiesScanned = familyResult.familiesFound;
    if (familiesScanned > 0) {
      console.log(`[autoSync] Family scan ${storeId}: ${familyResult.familiesFound} families, ${familyResult.childrenMapped} children, ${familyResult.orphanProducts} orphans from ${familyResult.totalOrdersScanned} orders`);
    }
  } catch (err) {
    console.warn(`[autoSync] Family scan failed for ${storeId}:`, err instanceof Error ? err.message : err);
  }
  result.familiesScanned = familiesScanned;

  if (result.adAccountsDiscovered > 0 || result.productsDetected > 0 || result.adMappingsSynced > 0) {
    console.log(
      `[AutoSync] ${storeId}: +${result.adAccountsDiscovered} accounts, +${result.productsDetected} products, +${result.adMappingsSynced} mappings` +
      (result.errors.length > 0 ? ` (${result.errors.length} errors)` : '')
    );
  }

  return result;
}

// ── Step 1: Auto-discover Meta ad accounts ───────────────

/**
 * Fetch all active ad accounts from Meta and add any new ones to store_ad_accounts.
 * Returns count of newly discovered accounts.
 */
async function autoSyncAdAccounts(storeId: string): Promise<number> {
  // Get Meta connection token
  const conn = await rest<Array<ConnectionRow>>(
    `/connections?store_id=eq.${enc(storeId)}&platform=eq.meta&select=access_token&limit=1`
  ).catch(() => []);

  if (!conn[0]?.access_token) return 0; // no Meta connection

  // Get currently stored accounts
  const storedAccounts = await rest<AdAccountRow[]>(
    `/store_ad_accounts?store_id=eq.${enc(storeId)}&select=ad_account_id,is_active`
  ).catch(() => []);
  const storedIds = new Set(storedAccounts.map(a => a.ad_account_id));

  // Fetch all active ad accounts from Meta
  let metaAccounts: MetaAdAccount[];
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/me/adaccounts?` +
      `fields=id,name,account_id,currency,timezone_name,account_status&limit=100&` +
      `access_token=${conn[0].access_token}`
    );
    if (!resp.ok) return 0;
    const data = await resp.json() as { data?: MetaAdAccount[] };
    metaAccounts = (data.data ?? []).filter(a => a.account_status === 1);
  } catch {
    return 0; // Meta API unavailable
  }

  // Find new accounts not yet in store_ad_accounts
  const newAccounts = metaAccounts.filter(a => !storedIds.has(a.id));
  if (newAccounts.length === 0) return 0;

  // Add new accounts
  const rows = newAccounts.map(a => ({
    store_id: storeId,
    ad_account_id: a.id,
    ad_account_name: a.name,
    platform: 'meta',
    currency: a.currency,
    timezone: a.timezone_name,
    is_active: true,
  }));

  await rest('/store_ad_accounts?on_conflict=store_id,ad_account_id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });

  console.log(`[AutoSync] ${storeId}: discovered ${newAccounts.length} new ad accounts: ${newAccounts.map(a => a.id).join(', ')}`);
  return newAccounts.length;
}

// ── Step 2: Auto-detect product_config ───────────────────

// Known upsell title patterns to exclude from MAIN
const UPSELL_PATTERNS = [
  /upgrade/i, /upsell/i, /bump/i, /one.?time.?offer/i, /oto/i,
  /lifetime.?access/i, /bundle.?deal/i, /impulse/i,
];

const isLikelyUpsellTitle = (title: string) =>
  UPSELL_PATTERNS.some(p => p.test(title));

const cleanTitle = (title: string) =>
  title.replace(/\s*\(free today\)\s*/gi, '')
    .replace(/\s*\(free\)\s*/gi, '')
    .replace(/\s*free today\s*/gi, '')
    .trim();

const extractKeywords = (title: string): string[][] => {
  const clean = cleanTitle(title).toLowerCase();
  const words = clean.split(/\s+/).filter(w => w.length > 2 && !['the', 'for', 'and', 'with'].includes(w));
  if (words.length >= 2) return [words.slice(0, 3)];
  return [[clean]];
};

/**
 * Auto-detect main products from order data and seed product_config.
 * Skips if product_config already exists (never overwrites).
 * Returns count of products seeded.
 */
async function autoDetectProductConfig(storeId: string): Promise<number> {
  // Check if product_config already exists
  const existing = await rest<Array<{ product_id: string }>>(
    `/product_config?store_id=eq.${enc(storeId)}&select=product_id&limit=1`
  ).catch(() => []);

  if (existing.length > 0) return 0; // already configured

  // Analyze orders
  const orders = await rest<OrderRow[]>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=line_items,created_at&limit=500&order=created_at.desc`
  ).catch(() => []);

  if (orders.length < 10) return 0; // not enough data

  // Build product stats
  const stats = new Map<string, ProductStats>();
  let totalOrders = 0;
  let freeItemOrders = 0;

  for (const order of orders) {
    let items: Array<{ product_id?: string | number; title?: string; price?: string; quantity?: number }>;
    try {
      items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
    } catch { continue; }

    totalOrders++;
    const isAlone = items.filter(i => i.product_id).length === 1;

    for (const item of items) {
      const pid = item.product_id ? String(item.product_id) : '';
      if (!pid || pid === 'null' || pid === '0') continue;

      const price = parseFloat(item.price || '0');
      const qty = item.quantity || 1;
      if (price === 0) freeItemOrders++;

      const s = stats.get(pid) ?? {
        title: item.title || '', productId: pid,
        orderCount: 0, aloneCount: 0, totalPrice: 0, avgPrice: 0, totalRevenue: 0,
      };
      s.orderCount++;
      if (isAlone) s.aloneCount++;
      s.totalPrice += price;
      s.totalRevenue += price * qty;
      if (!s.title && item.title) s.title = item.title;
      stats.set(pid, s);
    }
  }

  for (const s of Array.from(stats.values())) {
    s.avgPrice = s.orderCount > 0 ? s.totalPrice / s.orderCount : 0;
  }

  // Detect store model & find main products
  const freeRate = freeItemOrders / totalOrders;
  const isFunnel = freeRate > 0.25;

  let mainProducts: ProductStats[];

  if (isFunnel) {
    mainProducts = Array.from(stats.values())
      .filter(s => s.avgPrice === 0 && s.orderCount >= 5 && !isLikelyUpsellTitle(s.title))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10);
  } else {
    const totalRevenue = Array.from(stats.values()).reduce((s, p) => s + p.totalRevenue, 0);
    mainProducts = Array.from(stats.values())
      .filter(s => s.orderCount >= 5 && !isLikelyUpsellTitle(s.title))
      .map(s => ({
        ...s,
        score:
          (s.aloneCount / Math.max(s.orderCount, 1)) * 40 +
          (totalRevenue > 0 ? (s.totalRevenue / totalRevenue) * 30 : 0) +
          Math.min(s.orderCount / totalOrders, 1) * 20 +
          (s.avgPrice > 0 ? 10 : 0),
      }))
      .sort((a, b) => (b as ProductStats & { score: number }).score - (a as ProductStats & { score: number }).score)
      .slice(0, 8);
  }

  if (mainProducts.length === 0) return 0;

  // Seed product_config
  const configRows = mainProducts.map(p => ({
    store_id: storeId,
    product_id: p.productId,
    product_name: cleanTitle(p.title),
    main_keywords: extractKeywords(p.title),
    upsell_keywords: [] as string[],
    is_active: true,
  }));

  await rest('/product_config?on_conflict=store_id,product_id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(configRows),
  });

  console.log(`[AutoSync] ${storeId}: detected ${configRows.length} main products (${isFunnel ? 'funnel' : 'standard'})`);
  return configRows.length;
}

// ── Step 3: Auto-sync ad account → product mappings ──────

/**
 * Map ad accounts to products using campaign name analysis.
 * INCREMENTAL — only maps accounts that don't have a mapping yet.
 * This handles: new ad accounts, new campaigns, first-time setup.
 * Returns count of new mappings created.
 */
async function autoSyncAdMappings(storeId: string): Promise<number> {
  // Load product_config (needed for keyword matching)
  const configs = await rest<ProductConfigRow[]>(
    `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name,main_keywords`
  ).catch(() => []);

  if (configs.length === 0) return 0; // no products configured, nothing to map

  // Get all active ad accounts
  const adAccounts = await rest<Array<{ ad_account_id: string }>>(
    `/store_ad_accounts?store_id=eq.${enc(storeId)}&is_active=eq.true&select=ad_account_id`
  ).catch(() => []);

  if (adAccounts.length === 0) return 0;

  // Get existing mappings
  const existingMappings = await rest<Array<{ ad_account_id: string }>>(
    `/meta_ad_account_mappings?store_id=eq.${enc(storeId)}&select=ad_account_id`
  ).catch(() => []);
  const mappedIds = new Set(existingMappings.map(m => m.ad_account_id));

  // Find unmapped accounts
  const unmappedAccounts = adAccounts.filter(a => !mappedIds.has(a.ad_account_id));
  if (unmappedAccounts.length === 0) return 0;

  // Get recent campaign spend for unmapped accounts
  const unmappedIds = unmappedAccounts.map(a => a.ad_account_id);
  const spendRows = await rest<SpendRow[]>(
    `/meta_spend_cache?store_id=eq.${enc(storeId)}&ad_account_id=in.(${unmappedIds.map(enc).join(',')})&select=ad_account_id,campaign_name,spend&order=spend.desc&limit=500`
  ).catch(() => []);

  if (spendRows.length === 0) {
    // No spend data yet — create placeholder mappings with keyword-only matching
    // These will be refined once spend data arrives
    return 0;
  }

  // Group campaigns by ad account
  const accountCampaigns = new Map<string, string[]>();
  for (const row of spendRows) {
    if (!row.ad_account_id || !row.campaign_name) continue;
    const names = accountCampaigns.get(row.ad_account_id) ?? [];
    names.push(row.campaign_name.toLowerCase());
    accountCampaigns.set(row.ad_account_id, names);
  }

  // Match each unmapped ad account to a product by keyword overlap
  const newMappings: Array<{
    store_id: string;
    ad_account_id: string;
    product_id: string | null;
    product_keywords: string[];
  }> = [];

  for (const [accountId, campaignNames] of Array.from(accountCampaigns)) {
    const allNames = campaignNames.join(' ');
    let bestMatch: { productId: string; score: number; keywords: string[] } | null = null;

    for (const config of configs) {
      const productWords = config.product_name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
      let score = 0;

      // Check keyword groups (exact phrase match = strongest signal)
      for (const keywordGroup of config.main_keywords) {
        if (keywordGroup.every(kw => allNames.includes(kw.toLowerCase()))) score += 10;
      }

      // Check individual product name words
      for (const word of productWords) {
        if (allNames.includes(word)) score += 2;
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { productId: config.product_id, score, keywords: productWords };
      }
    }

    if (bestMatch) {
      newMappings.push({
        store_id: storeId,
        ad_account_id: accountId,
        product_id: bestMatch.productId,
        product_keywords: bestMatch.keywords,
      });
    }
  }

  if (newMappings.length === 0) return 0;

  await rest('/meta_ad_account_mappings?on_conflict=store_id,ad_account_id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(newMappings),
  });

  console.log(`[AutoSync] ${storeId}: mapped ${newMappings.length} ad accounts to products`);
  return newMappings.length;
}
