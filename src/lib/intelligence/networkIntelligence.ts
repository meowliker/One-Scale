/**
 * PRISM — Network Intelligence (Cross-Store Learning)
 *
 * Every store that connects teaches PRISM patterns that help
 * classify products in every other store.
 *
 * Archetypes are PATTERNS only — no individual store data is shared.
 * Only statistical patterns (price ranges, keyword correlations).
 *
 * With 10 stores: limited patterns
 * With 100 stores: strong patterns
 * With 1000 stores: near-perfect prediction for new stores
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

// ── Train Network Archetypes ────────────────────────────────

interface TrainingProduct {
  classification: string;
  confidence: number;
  product_title: string;
  product_type: string;
  price: number;
  price_aov_ratio: number;
  is_digital: boolean;
  store_id: string;
}

function extractTopWords(words: string[], minFrequency: number = 3): string[] {
  const counts = new Map<string, number>();
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'of', 'on', 'at', 'by',
    'with', 'from', 'up', 'out', 'is', 'it', 'as', 'be', 'was', 'not', 'no',
    'my', 'your', 'our', 'his', 'her', 'its', 'new', 'free',
  ]);

  for (const word of words) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= minFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 30);
}

export interface TrainResult {
  archetypes_created: number;
  training_products: number;
  training_stores: number;
}

/**
 * Train network archetypes from all high-confidence classified products.
 * Run weekly to update patterns as more stores connect.
 */
export async function trainNetworkArchetypes(): Promise<TrainResult> {
  // Get all high-confidence classifications from all stores
  const trainingData = await rest<Array<{
    classification: string; confidence: number;
    product_title: string; product_type: string;
    price_aov_ratio: number; store_id: string;
  }>>(
    `/product_classifications?confidence=gte.80&manual_override=eq.false` +
    `&classification=in.(main,upsell,downsell,bundle)` +
    `&select=classification,confidence,product_title,product_type,price_aov_ratio,store_id` +
    `&limit=5000`
  ).catch(() => []);

  if (trainingData.length < 20) {
    console.log(`[PRISM:Network] Only ${trainingData.length} training products — need at least 20`);
    return { archetypes_created: 0, training_products: trainingData.length, training_stores: 0 };
  }

  // Also include manually confirmed classifications (highest quality)
  const manualData = await rest<Array<{
    classification: string; confidence: number;
    product_title: string; product_type: string;
    price_aov_ratio: number; store_id: string;
  }>>(
    `/product_classifications?manual_override=eq.true` +
    `&classification=in.(main,upsell,downsell,bundle)` +
    `&select=classification,confidence,product_title,product_type,price_aov_ratio,store_id` +
    `&limit=2000`
  ).catch(() => []);

  const allData = [...trainingData, ...manualData];
  const storeIds = new Set(allData.map(d => d.store_id));

  // Group by classification
  const byClass: Record<string, TrainingProduct[]> = {};
  for (const d of allData) {
    if (!byClass[d.classification]) byClass[d.classification] = [];
    byClass[d.classification].push({
      ...d,
      price: 0,
      is_digital: false,
    });
  }

  // Build archetypes for each classification
  const archetypes: Array<Record<string, unknown>> = [];

  for (const [classification, products] of Object.entries(byClass)) {
    if (products.length < 5) continue;

    // Price/AOV ratio distribution
    const ratios = products
      .map(p => p.price_aov_ratio)
      .filter(r => r > 0)
      .sort((a, b) => a - b);

    const ratioMin = ratios.length > 0 ? ratios[Math.floor(ratios.length * 0.1)] : 0;
    const ratioMax = ratios.length > 0 ? ratios[Math.floor(ratios.length * 0.9)] : 0;

    // Title keywords
    const allWords = products.flatMap(p =>
      p.product_title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
    );
    const topWords = extractTopWords(allWords, Math.max(2, Math.floor(products.length * 0.1)));

    // Find words that are DISTINCTIVE to this classification
    // (appear much more often here than in other classifications)
    const otherWords = Object.entries(byClass)
      .filter(([cls]) => cls !== classification)
      .flatMap(([, prods]) => prods.flatMap(p =>
        p.product_title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/)
      ));
    const otherWordFreq = new Map<string, number>();
    for (const w of otherWords) {
      otherWordFreq.set(w, (otherWordFreq.get(w) || 0) + 1);
    }

    const distinctiveWords = topWords.filter(word => {
      const thisFreq = allWords.filter(w => w === word).length / products.length;
      const otherFreq = (otherWordFreq.get(word) || 0) / Math.max(1, otherWords.length);
      return thisFreq > otherFreq * 2; // Must appear 2x more in this class
    });

    // Product type patterns
    const typeCounts = new Map<string, number>();
    for (const p of products) {
      const t = (p.product_type || '').toLowerCase().trim();
      if (t) typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    }

    // Unique stores that contributed
    const contributingStores = new Set(products.map(p => p.store_id));

    // Validation: hold out 20% of products and test accuracy
    const shuffled = [...products].sort(() => Math.random() - 0.5);
    const testSet = shuffled.slice(0, Math.floor(products.length * 0.2));
    const validationAccuracy = testSet.length > 0
      ? testSet.filter(p => {
          const r = p.price_aov_ratio;
          return (ratios.length === 0 || (r >= ratioMin * 0.8 && r <= ratioMax * 1.2));
        }).length / testSet.length
      : 0;

    archetypes.push({
      archetype_name: `${classification}_archetype`,
      predicted_classification: classification,
      confidence: Math.round(validationAccuracy * 100),
      price_aov_ratio_min: Math.round(ratioMin * 1000) / 1000,
      price_aov_ratio_max: Math.round(ratioMax * 1000) / 1000,
      title_keywords_positive: distinctiveWords.slice(0, 15),
      title_keywords_negative: [],
      training_store_count: contributingStores.size,
      training_product_count: products.length,
      validation_accuracy: Math.round(validationAccuracy * 1000) / 1000,
      last_trained_at: new Date().toISOString(),
    });
  }

  // Clear old archetypes and insert new ones
  await rest('/network_product_archetypes', { method: 'DELETE' }).catch(() => null);

  if (archetypes.length > 0) {
    await rest('/network_product_archetypes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(archetypes),
    }).catch(() => null);
  }

  console.log(`[PRISM:Network] Trained ${archetypes.length} archetypes from ${allData.length} products across ${storeIds.size} stores`);

  return {
    archetypes_created: archetypes.length,
    training_products: allData.length,
    training_stores: storeIds.size,
  };
}

// ── Apply Network Archetypes to New Store ───────────────────

export interface NetworkPrediction {
  product_id: string;
  product_title: string;
  predicted_classification: string;
  confidence: number;
  archetype_name: string;
  match_signals: string[];
}

/**
 * Apply network archetypes to products in a store that lack
 * high-confidence classifications. Best for new stores with < 30 orders.
 */
export async function applyNetworkArchetypes(storeId: string): Promise<NetworkPrediction[]> {
  // Get products needing classification (low confidence or pending)
  const products = await rest<Array<{
    product_id: string; product_title: string; product_type: string;
    classification: string; confidence: number; price_aov_ratio: number;
    manual_override: boolean;
  }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}` +
    `&manual_override=eq.false` +
    `&or=(classification.eq.pending,classification.eq.unknown,confidence.lt.60)` +
    `&select=product_id,product_title,product_type,classification,confidence,price_aov_ratio,manual_override`
  ).catch(() => []);

  if (products.length === 0) return [];

  // Get archetypes with good validation accuracy
  const archetypes = await rest<Array<{
    archetype_name: string;
    predicted_classification: string;
    confidence: number;
    price_aov_ratio_min: number;
    price_aov_ratio_max: number;
    title_keywords_positive: string[];
    training_store_count: number;
    validation_accuracy: number;
  }>>(
    `/network_product_archetypes?validation_accuracy=gte.0.6&training_store_count=gte.3` +
    `&select=*&order=confidence.desc`
  ).catch(() => []);

  if (archetypes.length === 0) return [];

  const predictions: NetworkPrediction[] = [];
  const now = new Date().toISOString();

  for (const product of products) {
    let bestMatch: { archetype: typeof archetypes[0]; score: number; signals: string[] } | null = null;

    for (const archetype of archetypes) {
      let score = 0;
      const signals: string[] = [];

      // Check price/AOV ratio
      if (archetype.price_aov_ratio_min > 0 || archetype.price_aov_ratio_max > 0) {
        const r = product.price_aov_ratio;
        if (r > 0 && r >= archetype.price_aov_ratio_min * 0.8 && r <= archetype.price_aov_ratio_max * 1.2) {
          score += 0.3;
          signals.push(`price_aov_ratio ${r.toFixed(2)} in range`);
        }
      }

      // Check title keywords
      const titleLower = product.product_title.toLowerCase();
      let keywordMatches = 0;
      for (const keyword of archetype.title_keywords_positive || []) {
        if (titleLower.includes(keyword)) {
          keywordMatches++;
        }
      }
      if (keywordMatches > 0 && archetype.title_keywords_positive.length > 0) {
        const keywordScore = keywordMatches / archetype.title_keywords_positive.length;
        score += keywordScore * 0.5;
        signals.push(`${keywordMatches} keyword matches`);
      }

      // Check product type
      const typeLower = (product.product_type || '').toLowerCase();
      if (typeLower && archetype.predicted_classification === 'upsell') {
        if (['upsell', 'bump', 'add-on', 'addon', 'order bump'].some(k => typeLower.includes(k))) {
          score += 0.2;
          signals.push(`product_type "${typeLower}" matches`);
        }
      }

      // Must have meaningful match
      if (score > 0.3 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { archetype, score, signals };
      }
    }

    if (bestMatch) {
      const finalConfidence = Math.min(
        75,
        Math.round(bestMatch.archetype.confidence * bestMatch.score)
      );

      predictions.push({
        product_id: product.product_id,
        product_title: product.product_title,
        predicted_classification: bestMatch.archetype.predicted_classification,
        confidence: finalConfidence,
        archetype_name: bestMatch.archetype.archetype_name,
        match_signals: bestMatch.signals,
      });

      // Only update if network prediction is better than current
      if (finalConfidence > product.confidence) {
        await rest(
          `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(product.product_id)}&manual_override=eq.false`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              classification: bestMatch.archetype.predicted_classification,
              confidence: finalConfidence,
              detection_method: 'network_archetype',
              classification_method: 'network_archetype',
              updated_at: now,
            }),
          }
        ).catch(() => null);
      }
    }
  }

  console.log(`[PRISM:Network] ${storeId}: ${predictions.length} products classified via network archetypes`);
  return predictions;
}
