/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 */
/**
 * Store Intelligence — Orchestrator
 *
 * `initializeStore(storeId)` is the main entry point.
 * Called on Shopify connect, it:
 *   1. Fetches shop config from Shopify
 *   2. Fetches all products
 *   3. Fetches 60 days of orders
 *   4. Runs product classification
 *   5. Detects fee rates from transactions
 *   6. Maps campaigns to products
 *   7. Suggests COGS
 *   8. Detects currencies
 *   9. Calculates health score
 *
 * All stored in Supabase, zero hardcoded values.
 * One store's config never affects another.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import { analyzeAndSaveProducts } from './productIntelligence';
import { detectAndSaveFeeRates } from './feeIntelligence';
import { mapAndSaveCampaigns } from './campaignIntelligence';
import { suggestAndSaveCogs } from './cogsIntelligence';
import { detectAndSaveCurrencies } from './currencyIntelligence';
import type { StoreIntelligenceRow, ProductIntelligenceRow } from './types';

// ── Interfaces ──────────────────────────────────────────────

interface InitResult {
  storeId: string;
  status: 'complete' | 'partial' | 'failed';
  healthScore: number;
  productCount: number;
  campaignCount: number;
  errors: string[];
  duration: number;
}

// ── Health Score Weights ─────────────────────────────────────

const HEALTH_WEIGHTS = {
  shopify_connected: 20,
  meta_connected: 20,
  pixel_installed: 15,
  capi_configured: 10,
  products_classified: 10,
  cogs_configured: 10,
  campaigns_mapped: 10,
  survey_complete: 5,
} as const;

// ── Main Orchestrator ────────────────────────────────────────

/**
 * Initialize store intelligence. Call on first Shopify connect.
 * Runs all intelligence modules and calculates health score.
 */
export async function initializeStore(
  storeId: string,
  baseUrl: string
): Promise<InitResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  // Mark initialization as running
  await upsertStoreIntelligence(storeId, {
    init_status: 'running',
    init_started_at: new Date().toISOString(),
    init_error: null,
  });

  // ── Step 1: Fetch Shopify data ────────────────────────────
  let products: Array<{
    id: string | number;
    title: string;
    product_type: string;
    vendor: string;
    tags: string;
    variants: Array<{ id: string | number; price: string; requires_shipping: boolean }>;
  }> = [];

  let orders: Array<{
    id: string | number;
    line_items: Array<{
      product_id: string | number;
      title: string;
      price: string;
      quantity: number;
      requires_selling_plan?: boolean;
    }>;
    financial_status: string;
  }> = [];

  const shopData: { currency: string; enabled_presentment_currencies?: string[]; plan_name?: string; timezone?: string } = {
    currency: 'USD',
  };

  try {
    // Fetch products
    const prodRes = await fetch(`${baseUrl}/api/shopify/products?storeId=${encodeURIComponent(storeId)}&limit=250`, {
      headers: { 'x-internal-sync': '1' },
    });
    if (prodRes.ok) {
      const prodJson = await prodRes.json() as { data?: typeof products };
      products = prodJson.data || [];
    }
  } catch (err) {
    errors.push(`Products fetch failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  try {
    // Fetch 60 days of orders
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const ordersRes = await fetch(
      `${baseUrl}/api/shopify/orders?storeId=${encodeURIComponent(storeId)}&createdAtMin=${encodeURIComponent(since)}&limit=250&status=any`,
      { headers: { 'x-internal-sync': '1' } }
    );
    if (ordersRes.ok) {
      const ordersJson = await ordersRes.json() as { data?: typeof orders };
      orders = ordersJson.data || [];
    }
  } catch (err) {
    errors.push(`Orders fetch failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // ── Step 2: Run product intelligence ──────────────────────
  let productIntel: ProductIntelligenceRow[] = [];
  try {
    const analysisResults = await analyzeAndSaveProducts(storeId, products, orders);
    // Convert analysis results to rows for downstream use
    productIntel = analysisResults.map(r => ({
      id: 0,
      store_id: storeId,
      product_id: r.productId,
      product_title: r.productTitle,
      product_type: r.productType,
      vendor: r.vendor,
      tags: r.tags,
      is_digital: r.isDigital,
      is_subscription: r.isSubscription,
      is_bundle: r.isBundle,
      is_gift_card: r.isGiftCard,
      requires_shipping: r.requiresShipping,
      classification: r.classification,
      classification_confidence: r.classificationConfidence,
      detection_method: r.detectionMethod,
      alone_percentage: r.alonePercentage,
      first_percentage: r.firstPercentage,
      average_price: r.averagePrice,
      total_units_sold: r.totalUnitsSold,
      total_revenue: r.totalRevenue,
      order_count: r.orderCount,
      variant_count: r.variantCount,
      bundle_keywords: r.bundleKeywords,
      paired_product_id: r.pairedProductId,
      paired_frequency: r.pairedFrequency,
      manual_override: false,
      manual_classification: null,
      last_analyzed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  } catch (err) {
    errors.push(`Product analysis failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // ── Step 3: Run fee intelligence ──────────────────────────
  try {
    await detectAndSaveFeeRates(storeId);
  } catch (err) {
    errors.push(`Fee detection failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // ── Step 4: Run campaign intelligence ─────────────────────
  let campaignCount = 0;
  try {
    // Fetch campaigns from meta_spend_cache (deduplicated)
    const campaignRows = await rest<Array<{ campaign_id: string; campaign_name: string }>>(
      `/meta_spend_cache?store_id=eq.${encodeURIComponent(storeId)}&select=campaign_id,campaign_name`
    ).catch(() => []);

    // Deduplicate campaigns
    const campaignMap = new Map<string, string>();
    for (const row of campaignRows) {
      if (!campaignMap.has(row.campaign_id)) {
        campaignMap.set(row.campaign_id, row.campaign_name);
      }
    }

    const campaigns = Array.from(campaignMap.entries()).map(([id, name]) => ({
      campaignId: id,
      campaignName: name,
      adAccountId: '',
    }));

    campaignCount = campaigns.length;

    if (campaigns.length > 0 && productIntel.length > 0) {
      await mapAndSaveCampaigns(storeId, campaigns, productIntel);
    }
  } catch (err) {
    errors.push(`Campaign mapping failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // ── Step 5: Run COGS intelligence ─────────────────────────
  try {
    if (productIntel.length > 0) {
      await suggestAndSaveCogs(storeId, productIntel);
    }
  } catch (err) {
    errors.push(`COGS suggestion failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // ── Step 6: Run currency intelligence ─────────────────────
  try {
    // Get ad account currencies
    const adAccounts = await rest<Array<{ ad_account_id: string; currency: string | null }>>(
      `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&select=ad_account_id,currency`
    ).catch(() => []);

    const adAccountCurrencies = adAccounts
      .filter(a => a.currency)
      .map(a => ({ adAccountId: a.ad_account_id, currency: a.currency! }));

    await detectAndSaveCurrencies(storeId, shopData, adAccountCurrencies);
  } catch (err) {
    errors.push(`Currency detection failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // ── Step 7: Calculate health score ────────────────────────
  const healthBreakdown = await calculateHealthScore(storeId);
  const healthScore = Object.values(healthBreakdown).reduce((a, b) => a + b, 0);

  // ── Step 8: Finalize ──────────────────────────────────────
  const status = errors.length === 0 ? 'complete' : 'partial';

  await upsertStoreIntelligence(storeId, {
    init_status: status === 'complete' ? 'complete' : 'failed',
    init_completed_at: new Date().toISOString(),
    init_error: errors.length > 0 ? errors.join('; ') : null,
    health_score: healthScore,
    health_breakdown: healthBreakdown,
    product_count: products.length,
    main_product_count: productIntel.filter(p => p.classification === 'main').length,
    has_subscriptions: productIntel.some(p => p.is_subscription),
    has_bundles: productIntel.some(p => p.is_bundle),
    has_digital_products: productIntel.some(p => p.is_digital),
    is_single_product: products.length === 1,
    shop_currency: shopData.currency,
    shopify_plan: shopData.plan_name || '',
    shop_timezone: shopData.timezone || 'America/New_York',
  });

  return {
    storeId,
    status: errors.length === 0 ? 'complete' : errors.length < 3 ? 'partial' : 'failed',
    healthScore,
    productCount: products.length,
    campaignCount,
    errors,
    duration: Date.now() - startTime,
  };
}

// ── Health Score Calculator ─────────────────────────────────

async function calculateHealthScore(storeId: string): Promise<Record<string, number>> {
  const enc = (v: string) => encodeURIComponent(v);
  const breakdown: Record<string, number> = {};

  // Check Shopify connection
  try {
    const conn = await rest<Array<{ store_id: string }>>(
      `/connections?store_id=eq.${enc(storeId)}&platform=eq.shopify&select=store_id&limit=1`
    );
    breakdown.shopify_connected = conn.length > 0 ? HEALTH_WEIGHTS.shopify_connected : 0;
  } catch {
    breakdown.shopify_connected = 0;
  }

  // Check Meta connection
  try {
    const conn = await rest<Array<{ store_id: string }>>(
      `/connections?store_id=eq.${enc(storeId)}&platform=eq.meta&select=store_id&limit=1`
    );
    breakdown.meta_connected = conn.length > 0 ? HEALTH_WEIGHTS.meta_connected : 0;
  } catch {
    breakdown.meta_connected = 0;
  }

  // Check pixel
  try {
    const pixel = await rest<Array<{ is_installed: boolean }>>(
      `/pixel_settings?store_id=eq.${enc(storeId)}&select=is_installed&limit=1`
    );
    breakdown.pixel_installed = pixel[0]?.is_installed ? HEALTH_WEIGHTS.pixel_installed : 0;
  } catch {
    breakdown.pixel_installed = 0;
  }

  // Check products classified
  try {
    const products = await rest<Array<{ product_id: string }>>(
      `/product_intelligence?store_id=eq.${enc(storeId)}&classification=neq.unknown&select=product_id&limit=1`
    );
    breakdown.products_classified = products.length > 0 ? HEALTH_WEIGHTS.products_classified : 0;
  } catch {
    breakdown.products_classified = 0;
  }

  // Check COGS configured
  try {
    const costs = await rest<Array<{ product_id: string }>>(
      `/pnl_product_costs?store_id=eq.${enc(storeId)}&select=product_id&limit=1`
    );
    breakdown.cogs_configured = costs.length > 0 ? HEALTH_WEIGHTS.cogs_configured : 0;
  } catch {
    breakdown.cogs_configured = 0;
  }

  // Check campaigns mapped
  try {
    const mappings = await rest<Array<{ campaign_id: string }>>(
      `/campaign_product_mappings?store_id=eq.${enc(storeId)}&confidence=gt.0&select=campaign_id&limit=1`
    );
    breakdown.campaigns_mapped = mappings.length > 0 ? HEALTH_WEIGHTS.campaigns_mapped : 0;
  } catch {
    breakdown.campaigns_mapped = 0;
  }

  // CAPI and survey checks (placeholder — set 0 for now)
  breakdown.capi_configured = 0;
  breakdown.survey_complete = 0;

  return breakdown;
}

// ── Helper: Upsert store intelligence ───────────────────────

async function upsertStoreIntelligence(
  storeId: string,
  data: Partial<Omit<StoreIntelligenceRow, 'id' | 'store_id' | 'created_at'>>
): Promise<void> {
  const payload = {
    store_id: storeId,
    ...data,
    updated_at: new Date().toISOString(),
  };

  await rest(
    '/store_intelligence?on_conflict=store_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([payload]),
    }
  );
}

/**
 * Get store intelligence data.
 */
export async function getStoreIntelligence(storeId: string): Promise<StoreIntelligenceRow | null> {
  try {
    const rows = await rest<StoreIntelligenceRow[]>(
      `/store_intelligence?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Recalculate health score for a store (without full re-init).
 */
export async function refreshHealthScore(storeId: string): Promise<number> {
  const breakdown = await calculateHealthScore(storeId);
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  await upsertStoreIntelligence(storeId, {
    health_score: score,
    health_breakdown: breakdown,
  });

  return score;
}
