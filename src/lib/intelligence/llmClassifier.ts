/**
 * PRISM — LLM Product Classifier (Tier 2, 90-95% confidence)
 *
 * Uses Claude API to classify products based on title, description,
 * price, tags, and product type. Catches patterns that behavioral
 * analysis misses — like "Fast Track Upgrade" being an upsell
 * or descriptions saying "only available as an add-on".
 *
 * Run ONCE per product on first classification. Cache result.
 * Only re-run if product changes. Cost: ~$0.001 per product.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

interface LLMClassificationResult {
  classification: string;
  confidence: number;
  reasoning: string;
}

interface ProductForLLM {
  product_id: string;
  title: string;
  description?: string;
  price: number;
  product_type?: string;
  tags?: string;
  variants_count?: number;
  requires_shipping?: boolean;
}

/**
 * Classify a single product using Claude API.
 */
async function classifySingleProduct(
  product: ProductForLLM,
  storeContext: string,
): Promise<LLMClassificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { classification: 'unknown', confidence: 0, reasoning: 'No API key configured' };
  }

  const descSnippet = (product.description || '')
    .replace(/<[^>]*>/g, ' ')  // Strip HTML
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  const prompt = `You are analyzing a Shopify store product to determine its role in the sales funnel.

Store context: ${storeContext}
Product title: ${product.title}
Product type: ${product.product_type || 'N/A'}
Product tags: ${product.tags || 'N/A'}
Price: $${product.price}
Description: ${descSnippet || 'N/A'}
Has variants: ${(product.variants_count || 1) > 1 ? 'Yes' : 'No'}
Requires shipping: ${product.requires_shipping !== false ? 'Yes' : 'No (digital)'}

Classify this product's role as:
- MAIN: The core offer being advertised, what customers come to buy
- UPSELL: An add-on, upgrade, or bonus offered after/during the main purchase
- DOWNSELL: A cheaper alternative offered when customer declines the main offer
- BUNDLE: A group of products sold together at a combined price
- UNKNOWN: Cannot determine with reasonable confidence

Key patterns to look for:
- Words like "upgrade", "add-on", "rush", "fast track", "priority", "warranty", "protection" → UPSELL
- Words like "complete", "full program", "masterclass", "course", "system" → MAIN
- Words like "lite", "basic", "starter" when a "pro/premium" version exists → DOWNSELL
- Descriptions mentioning "only available with purchase" or "limited time offer" → UPSELL
- Very low price relative to typical e-commerce products ($1-$15) with no shipping → UPSELL
- Bundle/kit/pack in title → BUNDLE

Respond with JSON only, no markdown:
{"classification":"main","confidence":85,"reasoning":"brief explanation"}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_CLASSIFICATION_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: prompt,
        }],
      }),
    });

    if (!res.ok) {
      console.warn(`[PRISM:LLM] API error: ${res.status}`);
      return { classification: 'unknown', confidence: 0, reasoning: `API error: ${res.status}` };
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '{}';

    // Parse JSON response (handle potential markdown wrapping)
    const cleaned = text.replace(/```json\s*|```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      classification: (parsed.classification || 'unknown').toLowerCase(),
      confidence: Math.min(95, Math.max(0, parsed.confidence || 0)),
      reasoning: parsed.reasoning || '',
    };
  } catch (err) {
    console.warn(`[PRISM:LLM] Classification failed:`, err instanceof Error ? err.message : 'Unknown error');
    return { classification: 'unknown', confidence: 0, reasoning: 'Parse/fetch error' };
  }
}

/**
 * Classify all unclassified products in a store using Claude API.
 * Skips products that already have LLM classifications cached.
 * Returns the number of products classified.
 */
export async function classifyProductsWithLLM(storeId: string): Promise<{
  classified: number;
  skipped: number;
  results: Array<{ product_id: string; product_title: string; classification: string; confidence: number; reasoning: string }>;
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[PRISM:LLM] No ANTHROPIC_API_KEY — skipping LLM classification');
    return { classified: 0, skipped: 0, results: [] };
  }

  // Get products that don't have LLM classification yet
  const products = await rest<Array<{
    product_id: string; product_title: string; product_type: string;
    classification: string; confidence: number; manual_override: boolean;
    llm_classified_at: string | null;
  }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}` +
    `&llm_classified_at=is.null` +
    `&manual_override=eq.false` +
    `&select=product_id,product_title,product_type,classification,confidence,manual_override,llm_classified_at`
  ).catch(() => []);

  if (products.length === 0) {
    return { classified: 0, skipped: 0, results: [] };
  }

  // Get store context for better classification
  const storeInfo = await rest<Array<{ name: string }>>(
    `/stores?id=eq.${enc(storeId)}&select=name&limit=1`
  ).catch(() => []);
  const storeName = storeInfo[0]?.name || 'Unknown store';

  // Get product data from orders (for price info)
  const orderItems = await rest<Array<{ line_items: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}` +
    `&order_status=neq.cancelled&select=line_items&limit=100&order=created_at.desc`
  ).catch(() => []);

  // Build price map from order line items
  const priceMap = new Map<string, number>();
  for (const order of orderItems) {
    let items: Array<{ product_id?: string | number; price?: string }>;
    try { items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || []; } catch { continue; }
    for (const item of items) {
      if (item.product_id && item.price) {
        priceMap.set(String(item.product_id), parseFloat(item.price));
      }
    }
  }

  const storeContext = `E-commerce store "${storeName}" selling ${products.length} products`;

  const results: Array<{ product_id: string; product_title: string; classification: string; confidence: number; reasoning: string }> = [];
  let classified = 0;
  let skipped = 0;

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < products.length; i += 5) {
    const batch = products.slice(i, i + 5);

    const batchResults = await Promise.all(
      batch.map(async (product) => {
        const productForLLM: ProductForLLM = {
          product_id: product.product_id,
          title: product.product_title,
          price: priceMap.get(product.product_id) || 0,
          product_type: product.product_type,
        };

        const result = await classifySingleProduct(productForLLM, storeContext);

        if (result.classification === 'unknown' || result.confidence === 0) {
          skipped++;
          return null;
        }

        classified++;
        return {
          product_id: product.product_id,
          product_title: product.product_title,
          ...result,
        };
      })
    );

    // Persist LLM results
    const now = new Date().toISOString();
    for (const result of batchResults) {
      if (!result) continue;

      results.push(result);

      await rest(
        `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(result.product_id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            llm_classification: result.classification,
            llm_confidence: result.confidence,
            llm_reasoning: result.reasoning,
            llm_classified_at: now,
            updated_at: now,
          }),
        }
      ).catch(() => null);
    }

    // Small delay between batches to respect rate limits
    if (i + 5 < products.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`[PRISM:LLM] ${storeId}: ${classified} classified, ${skipped} skipped`);
  return { classified, skipped, results };
}
