/**
 * COGS Intelligence
 *
 * Auto-suggests Cost of Goods Sold based on product characteristics.
 * NEVER silently falls back to 30% or any other hardcoded rate.
 *
 * Rules:
 * - Digital products → suggest $0 COGS (no physical cost)
 * - Gift cards → suggest $0 COGS
 * - Physical products with no COGS → show warning banner
 * - Never use a silent fallback rate
 * - Show "X products showing $0 COGS" warning in P&L
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import type { ProductIntelligenceRow, CogsSuggestionRow, CogsSuggestionReason } from './types';

// ── Interfaces ──────────────────────────────────────────────

interface CogsSuggestion {
  productId: string;
  productTitle: string;
  suggestedCost: number;
  suggestedType: 'fixed' | 'percentage';
  confidence: number;
  reason: CogsSuggestionReason;
  reasoningDetail: string;
}

interface ProductCostRow {
  product_id: string;
  cost_per_unit: number;
}

// ── Main Function ───────────────────────────────────────────

/**
 * Analyze products and generate COGS suggestions.
 * Only suggests for products that don't already have configured COGS.
 */
export async function suggestCogs(
  storeId: string,
  products: ProductIntelligenceRow[]
): Promise<CogsSuggestion[]> {
  // Load existing COGS configurations
  let existingCogs: ProductCostRow[] = [];
  try {
    existingCogs = await rest<ProductCostRow[]>(
      `/pnl_product_costs?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,cost_per_unit`
    );
  } catch { /* table might not exist */ }

  const configuredProducts = new Set(existingCogs.map(c => c.product_id));
  const suggestions: CogsSuggestion[] = [];

  for (const product of products) {
    // Skip products that already have COGS configured
    if (configuredProducts.has(product.product_id)) continue;

    let suggestion: CogsSuggestion;

    // Digital products → $0 COGS
    if (product.is_digital) {
      suggestion = {
        productId: product.product_id,
        productTitle: product.product_title,
        suggestedCost: 0,
        suggestedType: 'fixed',
        confidence: 0.95,
        reason: 'digital_product',
        reasoningDetail: `"${product.product_title}" detected as digital product (no physical fulfillment cost)`,
      };
    }
    // Gift cards → $0 COGS
    else if (product.is_gift_card) {
      suggestion = {
        productId: product.product_id,
        productTitle: product.product_title,
        suggestedCost: 0,
        suggestedType: 'fixed',
        confidence: 0.95,
        reason: 'zero_cost',
        reasoningDetail: `"${product.product_title}" is a gift card (no COGS)`,
      };
    }
    // Physical products — we DON'T guess. Show warning.
    else {
      suggestion = {
        productId: product.product_id,
        productTitle: product.product_title,
        suggestedCost: 0,
        suggestedType: 'fixed',
        confidence: 0,
        reason: 'unknown',
        reasoningDetail: `"${product.product_title}" needs COGS configuration. Currently showing $0 — configure in Settings > P&L.`,
      };
    }

    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Generate COGS suggestions and save to cogs_suggestions table.
 */
export async function suggestAndSaveCogs(
  storeId: string,
  products: ProductIntelligenceRow[]
): Promise<CogsSuggestion[]> {
  const suggestions = await suggestCogs(storeId, products);

  if (suggestions.length > 0) {
    const now = new Date().toISOString();
    const payloads = suggestions.map(s => ({
      store_id: storeId,
      product_id: s.productId,
      product_title: s.productTitle,
      suggested_cost: s.suggestedCost,
      suggested_type: s.suggestedType,
      confidence: s.confidence,
      reason: s.reason,
      reasoning_detail: s.reasoningDetail,
      status: s.confidence >= 0.9 ? 'accepted' : 'pending',
      updated_at: now,
    }));

    // Upsert in chunks
    for (let i = 0; i < payloads.length; i += 50) {
      const chunk = payloads.slice(i, i + 50);
      await rest(
        '/cogs_suggestions?on_conflict=store_id,product_id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(chunk),
        }
      );
    }
  }

  // Update store_intelligence
  try {
    await rest(
      `/store_intelligence?store_id=eq.${encodeURIComponent(storeId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          cogs_suggested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } catch { /* ignore */ }

  return suggestions;
}

/**
 * Get COGS coverage summary for a store.
 * Returns how many products have COGS configured vs. needing attention.
 */
export async function getCogsCoverage(storeId: string): Promise<{
  total: number;
  configured: number;
  suggested: number;
  missing: number;
  missingProducts: Array<{ productId: string; productTitle: string }>;
}> {
  const enc = (v: string) => encodeURIComponent(v);

  const [products, costs, suggestions] = await Promise.all([
    rest<Array<{ product_id: string; product_title: string; is_digital: boolean; is_gift_card: boolean }>>(
      `/product_intelligence?store_id=eq.${enc(storeId)}&select=product_id,product_title,is_digital,is_gift_card`
    ).catch(() => [] as Array<{ product_id: string; product_title: string; is_digital: boolean; is_gift_card: boolean }>),
    rest<Array<{ product_id: string }>>(
      `/pnl_product_costs?store_id=eq.${enc(storeId)}&select=product_id`
    ).catch(() => [] as Array<{ product_id: string }>),
    rest<Array<{ product_id: string; status: string }>>(
      `/cogs_suggestions?store_id=eq.${enc(storeId)}&status=eq.accepted&select=product_id,status`
    ).catch(() => [] as Array<{ product_id: string; status: string }>),
  ]);

  const configuredSet = new Set(costs.map(c => c.product_id));
  const suggestedSet = new Set(suggestions.map(s => s.product_id));

  const missingProducts: Array<{ productId: string; productTitle: string }> = [];

  for (const p of products) {
    if (!configuredSet.has(p.product_id) && !suggestedSet.has(p.product_id)) {
      // Only count physical products as "missing" — digital/$0 is expected
      if (!p.is_digital && !p.is_gift_card) {
        missingProducts.push({ productId: p.product_id, productTitle: p.product_title });
      }
    }
  }

  return {
    total: products.length,
    configured: configuredSet.size,
    suggested: suggestedSet.size,
    missing: missingProducts.length,
    missingProducts,
  };
}
