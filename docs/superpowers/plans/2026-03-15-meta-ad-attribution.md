# Meta Ad Attribution & Multi-Signal Classification

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an intelligent Meta ads attribution system that automatically detects which campaigns drive which products, and feed ad signals into product classification for near-perfect accuracy.

**Architecture:** Four-method attribution engine (pixel sessions, ad creative URLs, revenue correlation, campaign name intelligence) writes to `campaign_product_attributions` table. A signal scorer computes 15+ signals per product into `product_signal_scores`. The classification router integrates ad signals as dominant weights, creating a bidirectional feedback loop: ad data improves classification, classification improves attribution.

**Tech Stack:** Next.js API routes, TypeScript, Supabase PostgREST via `rest()`, Meta Graph API v18.0

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/018_ad_attribution.sql` | Schema: campaign_product_attributions, product_signal_scores, alter product_classifications |
| `src/lib/prism/adAttribution.ts` | Core engine: 4 attribution methods + orchestrator |
| `src/lib/prism/signalScorer.ts` | Compute all 15+ signals, store in product_signal_scores |
| `src/app/api/cron/compute-ad-attribution/route.ts` | Cron endpoint to run attribution for all stores |
| `src/app/api/admin/ad-attribution-report/route.ts` | Diagnostic report: attribution results + confidence |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/intelligence/types.ts` | Add AdSignals interface, extend ClassificationSignals with ad fields |
| `src/lib/intelligence/signalStackClassifier.ts` | Add ad_campaign_score + ad_landing_score to computeSignals |
| `src/lib/intelligence/classificationRouter.ts` | Fetch ad signals before classification, pass to signal stack |
| `src/lib/attribution/metaSpendAttributor.ts` | Use campaign_product_attributions as priority source |
| `src/app/api/lib/meta-client.ts` | Add fetchAdCreativeUrls function |
| `middleware.ts` | Ensure `/api/cron/compute-ad-attribution` covered by `/api/cron/` prefix (already covered) |

---

## Chunk 1: Database & Types Foundation

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/018_ad_attribution.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 018_ad_attribution.sql
-- PRISM Ad Attribution & Multi-Signal Classification

-- ── Campaign Product Attributions ───────────────────────────
-- Stores detected campaign→product links with method and confidence
CREATE TABLE IF NOT EXISTS campaign_product_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text,
  product_id text NOT NULL,
  product_title text,
  confidence numeric(5,2) NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'proportional',
  -- method: pixel_session | ad_creative_url | revenue_correlation | campaign_name | proportional
  sessions_tracked integer DEFAULT 0,
  conversions_tracked integer DEFAULT 0,
  correlation_score numeric(5,4) DEFAULT 0,
  creative_url text,
  last_computed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_cpa_store ON campaign_product_attributions(store_id);
CREATE INDEX IF NOT EXISTS idx_cpa_product ON campaign_product_attributions(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_cpa_method ON campaign_product_attributions(store_id, method);

-- ── Product Signal Scores ───────────────────────────────────
-- Per-product breakdown of ALL classification signals
CREATE TABLE IF NOT EXISTS product_signal_scores (
  store_id text NOT NULL,
  product_id text NOT NULL,

  -- Ad-based signals
  score_own_campaigns numeric DEFAULT 0,
  score_ad_landing numeric DEFAULT 0,
  score_direct_spend_share numeric DEFAULT 0,

  -- Behavioral signals (from order data)
  score_alone_rate numeric DEFAULT 0,
  score_position numeric DEFAULT 0,
  score_revenue_share numeric DEFAULT 0,

  -- Shopify metadata signals
  score_title_keywords numeric DEFAULT 0,
  score_product_type_tags numeric DEFAULT 0,
  score_price_relative numeric DEFAULT 0,
  score_description_keywords numeric DEFAULT 0,
  score_product_handle numeric DEFAULT 0,
  score_compare_at_price numeric DEFAULT 0,

  -- Pixel/session signals
  score_session_entry numeric DEFAULT 0,
  score_traffic_source numeric DEFAULT 0,
  score_add_to_cart_source numeric DEFAULT 0,

  -- Order pattern signals
  score_first_order_appearance numeric DEFAULT 0,
  score_refund_rate numeric DEFAULT 0,

  -- Combined
  total_score numeric DEFAULT 0,
  signal_count integer DEFAULT 0,

  -- Final output
  classification text,
  confidence integer DEFAULT 0,
  primary_signal text,

  computed_at timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_pss_classification
  ON product_signal_scores(store_id, classification);

-- ── Extend product_classifications ──────────────────────────
ALTER TABLE product_classifications
  ADD COLUMN IF NOT EXISTS product_handle text,
  ADD COLUMN IF NOT EXISTS has_own_campaigns boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ad_landing_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_signal_confidence numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ad_signal_method text;
```

- [ ] **Step 2: Apply migration locally**

Run against Supabase:
```bash
# Save for deployment — will apply via admin endpoint or SQL editor tomorrow
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_ad_attribution.sql
git commit -m "feat: add ad attribution tables and signal scores schema"
```

---

### Task 2: Extend Types

**Files:**
- Modify: `src/lib/intelligence/types.ts`

- [ ] **Step 1: Add AdSignals interface and extend ClassificationSignals**

Add after the existing `ClassificationSignals` interface (~line 260):

```typescript
// ── Ad Attribution Types ────────────────────────────────────

export interface AdSignals {
  has_own_campaigns: boolean;
  landing_page_rate: number;       // 0-1: fraction of Meta sessions landing on this product
  landing_sessions: number;        // absolute count
  direct_spend_share: number;      // 0-1: fraction of total store spend on this product's campaigns
  campaign_count: number;          // number of campaigns linked to this product
  total_meta_sessions: number;     // total Meta-sourced sessions for the store
}

export interface CampaignProductAttribution {
  store_id: string;
  campaign_id: string;
  campaign_name: string;
  product_id: string;
  product_title: string | null;
  confidence: number;
  method: AdAttributionMethod;
  sessions_tracked: number;
  conversions_tracked: number;
  correlation_score: number;
  creative_url: string | null;
}

export type AdAttributionMethod =
  | 'pixel_session'
  | 'ad_creative_url'
  | 'revenue_correlation'
  | 'campaign_name'
  | 'proportional';
```

Also extend `ClassificationSignals` to include ad scores. Add two new fields:

```typescript
// Add to ClassificationSignals interface:
  ad_campaign_score: number;
  ad_landing_score: number;
```

And extend `SignalStackMethod`:
```typescript
// Add to SignalStackMethod union:
  | 'ad_campaign_detected'
  | 'ad_traffic_landing'
  | 'no_ad_traffic_high_cooccurrence'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/intelligence/types.ts
git commit -m "feat: add ad attribution and signal score types"
```

---

## Chunk 2: Ad Creative URL Detection

### Task 3: Meta Client Extension

**Files:**
- Modify: `src/app/api/lib/meta-client.ts`

- [ ] **Step 1: Add fetchAdCreativeUrls function**

Add this exported function to the end of meta-client.ts:

```typescript
/**
 * Fetch ad creative URLs for all ads in a campaign.
 * Returns URLs that link to product pages (/products/handle).
 */
export async function fetchAdCreativeUrls(
  token: string,
  campaignId: string,
): Promise<Array<{ adId: string; adName: string; url: string }>> {
  const results: Array<{ adId: string; adName: string; url: string }> = [];

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${campaignId}/ads` +
      `?fields=id,name,creative{object_story_spec,asset_feed_spec,effective_object_story_id,object_url,link_url}` +
      `&limit=100&access_token=${token}`,
    );
    if (!res.ok) return results;
    const data = await res.json();

    for (const ad of data.data ?? []) {
      // Try multiple URL sources from the creative
      const creative = ad.creative ?? {};
      const url =
        creative.object_url ??
        creative.link_url ??
        creative.object_story_spec?.link_data?.link ??
        creative.object_story_spec?.video_data?.call_to_action?.value?.link ??
        null;
      if (url) {
        results.push({ adId: ad.id, adName: ad.name ?? '', url });
      }
    }
  } catch {
    // Graceful failure — creative URL detection is best-effort
  }

  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/lib/meta-client.ts
git commit -m "feat: add fetchAdCreativeUrls to Meta client"
```

---

### Task 4: Ad Attribution Engine

**Files:**
- Create: `src/lib/prism/adAttribution.ts`

- [ ] **Step 1: Write the full attribution engine**

This is the core file. Four methods with confidence hierarchy:

```typescript
/**
 * PRISM — Ad Attribution Engine
 *
 * Automatically detects which Meta campaigns drive which products.
 * Four methods, cascading confidence:
 *   1. Pixel session data (95% confidence)
 *   2. Ad creative URL matching (90% confidence)
 *   3. Revenue correlation (70% confidence)
 *   4. Campaign name intelligence (50% confidence)
 *
 * Results stored in campaign_product_attributions table.
 * Recomputed periodically — gets smarter over time.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import type { AdAttributionMethod } from '@/lib/intelligence/types';

const enc = (v: string) => encodeURIComponent(v);

interface AttributionCandidate {
  campaign_id: string;
  campaign_name: string;
  product_id: string;
  product_title: string;
  confidence: number;
  method: AdAttributionMethod;
  sessions_tracked: number;
  conversions_tracked: number;
  correlation_score: number;
  creative_url: string | null;
}

interface AttributionReport {
  store_id: string;
  total_campaigns: number;
  attributed: number;
  unattributed: number;
  by_method: Record<string, number>;
  attributions: AttributionCandidate[];
}

// ── Main Orchestrator ────────────────────────────────────────

export async function computeAdAttributions(
  storeId: string,
  metaToken?: string,
): Promise<AttributionReport> {
  // Get all campaigns with spend in last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
  const campaigns = await rest<Array<{
    campaign_id: string; campaign_name: string; total_spend: number;
  }>>(
    `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${ninetyDaysAgo}` +
    `&select=campaign_id,campaign_name` +
    `&order=campaign_id`
  ).catch(() => []);

  // Deduplicate campaigns (meta_spend_cache has daily rows)
  const campaignMap = new Map<string, string>();
  for (const c of campaigns) {
    if (!campaignMap.has(c.campaign_id)) {
      campaignMap.set(c.campaign_id, c.campaign_name);
    }
  }
  const uniqueCampaigns = Array.from(campaignMap.entries()).map(
    ([campaign_id, campaign_name]) => ({ campaign_id, campaign_name })
  );

  if (uniqueCampaigns.length === 0) {
    return { store_id: storeId, total_campaigns: 0, attributed: 0, unattributed: 0, by_method: {}, attributions: [] };
  }

  // Get products from product_classifications
  const products = await rest<Array<{
    product_id: string; product_title: string; product_handle: string | null;
  }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,product_title,product_handle`
  ).catch(() => []);

  // Run all four methods
  const pixelResults = await pixelSessionAttribution(storeId, uniqueCampaigns);
  const creativeResults = metaToken
    ? await adCreativeUrlAttribution(storeId, uniqueCampaigns, products, metaToken)
    : [];
  const correlationResults = await revenueCorrelationAttribution(storeId, uniqueCampaigns, products);
  const nameResults = campaignNameAttribution(uniqueCampaigns, products);

  // Merge: highest confidence wins per campaign
  const bestPerCampaign = new Map<string, AttributionCandidate>();

  // Process in reverse priority order so higher confidence overwrites
  for (const result of [...nameResults, ...correlationResults, ...creativeResults, ...pixelResults]) {
    const existing = bestPerCampaign.get(result.campaign_id);
    if (!existing || result.confidence > existing.confidence) {
      bestPerCampaign.set(result.campaign_id, result);
    }
  }

  const attributions = Array.from(bestPerCampaign.values());
  const byMethod: Record<string, number> = {};
  for (const a of attributions) {
    byMethod[a.method] = (byMethod[a.method] || 0) + 1;
  }

  // Persist to campaign_product_attributions
  await persistAttributions(storeId, attributions);

  return {
    store_id: storeId,
    total_campaigns: uniqueCampaigns.length,
    attributed: attributions.length,
    unattributed: uniqueCampaigns.length - attributions.length,
    by_method: byMethod,
    attributions,
  };
}

// ── Method 1: Pixel Session Attribution (95% confidence) ────

async function pixelSessionAttribution(
  storeId: string,
  campaigns: Array<{ campaign_id: string; campaign_name: string }>,
): Promise<AttributionCandidate[]> {
  // Query visitor_attribution for Meta-sourced sessions with campaign data
  const sessions = await rest<Array<{
    utm_campaign: string;
    first_product_viewed_id: string;
    first_product_viewed_title: string;
    order_id: string | null;
  }>>(
    `/visitor_attribution?store_id=eq.${enc(storeId)}` +
    `&or=(utm_source.ilike.*facebook*,utm_source.ilike.*meta*,utm_source.ilike.*instagram*,fbclid.not.is.null)` +
    `&utm_campaign=not.is.null&first_product_viewed_id=not.is.null` +
    `&select=utm_campaign,first_product_viewed_id,first_product_viewed_title,order_id`
  ).catch(() => []);

  if (sessions.length === 0) return [];

  // Group by campaign + product
  const campProductStats = new Map<string, Map<string, {
    title: string; sessions: number; conversions: number;
  }>>();

  for (const s of sessions) {
    const campaignKey = s.utm_campaign;
    if (!campProductStats.has(campaignKey)) {
      campProductStats.set(campaignKey, new Map());
    }
    const productMap = campProductStats.get(campaignKey)!;
    const pid = s.first_product_viewed_id;
    const existing = productMap.get(pid) ?? { title: s.first_product_viewed_title || '', sessions: 0, conversions: 0 };
    existing.sessions++;
    if (s.order_id) existing.conversions++;
    productMap.set(pid, existing);
  }

  const results: AttributionCandidate[] = [];

  // Match utm_campaign values to actual campaign_ids
  const campaignNameToId = new Map<string, string>();
  for (const c of campaigns) {
    // UTM campaign can be the campaign name or ID
    campaignNameToId.set(c.campaign_name.toLowerCase(), c.campaign_id);
    campaignNameToId.set(c.campaign_id, c.campaign_id);
  }

  for (const [utmCampaign, productMap] of campProductStats) {
    // Find matching campaign
    const campaignId = campaignNameToId.get(utmCampaign.toLowerCase()) ?? campaignNameToId.get(utmCampaign);
    if (!campaignId) continue;

    const campaignName = campaigns.find(c => c.campaign_id === campaignId)?.campaign_name ?? utmCampaign;

    // Product with most sessions wins
    let bestProduct: { pid: string; title: string; sessions: number; conversions: number } | null = null;
    let totalSessions = 0;

    for (const [pid, stats] of productMap) {
      totalSessions += stats.sessions;
      if (!bestProduct || stats.sessions > bestProduct.sessions) {
        bestProduct = { pid, title: stats.title, sessions: stats.sessions, conversions: stats.conversions };
      }
    }

    if (!bestProduct || totalSessions < 3) continue;

    const dominance = bestProduct.sessions / totalSessions;
    // Confidence: 95% base, scaled by dominance (if product is 50% of sessions, confidence = 47%)
    const confidence = Math.round(95 * dominance);

    results.push({
      campaign_id: campaignId,
      campaign_name: campaignName,
      product_id: bestProduct.pid,
      product_title: bestProduct.title,
      confidence: Math.min(95, confidence),
      method: 'pixel_session',
      sessions_tracked: bestProduct.sessions,
      conversions_tracked: bestProduct.conversions,
      correlation_score: 0,
      creative_url: null,
    });
  }

  return results;
}

// ── Method 2: Ad Creative URL Attribution (90% confidence) ──

async function adCreativeUrlAttribution(
  storeId: string,
  campaigns: Array<{ campaign_id: string; campaign_name: string }>,
  products: Array<{ product_id: string; product_title: string; product_handle: string | null }>,
  metaToken: string,
): Promise<AttributionCandidate[]> {
  // Dynamic import to avoid pulling meta-client into non-API contexts
  const { fetchAdCreativeUrls } = await import('@/app/api/lib/meta-client');

  const results: AttributionCandidate[] = [];
  const handleToProduct = new Map<string, { product_id: string; product_title: string }>();

  for (const p of products) {
    if (p.product_handle) {
      handleToProduct.set(p.product_handle.toLowerCase(), { product_id: p.product_id, product_title: p.product_title });
    }
    // Also try deriving handle from title (fallback)
    const derivedHandle = p.product_title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    if (derivedHandle && !handleToProduct.has(derivedHandle)) {
      handleToProduct.set(derivedHandle, { product_id: p.product_id, product_title: p.product_title });
    }
  }

  if (handleToProduct.size === 0) return results;

  // Fetch creative URLs for each campaign (rate-limited)
  for (const campaign of campaigns) {
    try {
      const creatives = await fetchAdCreativeUrls(metaToken, campaign.campaign_id);

      for (const creative of creatives) {
        // Extract product handle from URL: /products/big-mystery-box
        const match = creative.url.match(/\/products\/([^/?#]+)/);
        if (!match) continue;

        const handle = match[1].toLowerCase();
        const product = handleToProduct.get(handle);
        if (!product) continue;

        results.push({
          campaign_id: campaign.campaign_id,
          campaign_name: campaign.campaign_name,
          product_id: product.product_id,
          product_title: product.product_title,
          confidence: 90,
          method: 'ad_creative_url',
          sessions_tracked: 0,
          conversions_tracked: 0,
          correlation_score: 0,
          creative_url: creative.url,
        });
        break; // One match per campaign is enough
      }
    } catch {
      // Skip campaign if API fails
    }
  }

  return results;
}

// ── Method 3: Revenue Correlation (70% confidence) ──────────

async function revenueCorrelationAttribution(
  storeId: string,
  campaigns: Array<{ campaign_id: string; campaign_name: string }>,
  products: Array<{ product_id: string; product_title: string; product_handle: string | null }>,
): Promise<AttributionCandidate[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  // Get daily spend per campaign
  const spendRows = await rest<Array<{ campaign_id: string; date: string; spend: number }>>(
    `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${thirtyDaysAgo}` +
    `&select=campaign_id,date,spend&order=date`
  ).catch(() => []);

  if (spendRows.length === 0) return [];

  // Get daily revenue per product from orders
  const orders = await rest<Array<{ created_at: string; line_items: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(thirtyDaysAgo + 'T00:00:00Z')}` +
    `&order_status=neq.cancelled&financial_status=neq.refunded` +
    `&select=created_at,line_items&order=created_at`
  ).catch(() => []);

  if (orders.length === 0) return [];

  // Build daily revenue per product
  const productDailyRevenue = new Map<string, Map<string, number>>();
  for (const order of orders) {
    const date = order.created_at.split('T')[0];
    let items: Array<{ product_id?: string | number; price?: string; quantity?: number }>;
    try { items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || []; } catch { continue; }
    for (const item of items) {
      if (!item.product_id) continue;
      const pid = String(item.product_id);
      if (!productDailyRevenue.has(pid)) productDailyRevenue.set(pid, new Map());
      const dayMap = productDailyRevenue.get(pid)!;
      dayMap.set(date, (dayMap.get(date) ?? 0) + (parseFloat(item.price || '0') * (item.quantity || 1)));
    }
  }

  // Build daily spend per campaign
  const campaignDailySpend = new Map<string, Map<string, number>>();
  for (const row of spendRows) {
    if (!campaignDailySpend.has(row.campaign_id)) campaignDailySpend.set(row.campaign_id, new Map());
    const dayMap = campaignDailySpend.get(row.campaign_id)!;
    dayMap.set(row.date, (dayMap.get(row.date) ?? 0) + Number(row.spend));
  }

  // Collect all dates
  const allDates = new Set<string>();
  for (const dayMap of campaignDailySpend.values()) for (const d of dayMap.keys()) allDates.add(d);
  const sortedDates = Array.from(allDates).sort();
  if (sortedDates.length < 7) return []; // Need at least 7 days for correlation

  const results: AttributionCandidate[] = [];

  for (const campaign of campaigns) {
    const spendByDay = campaignDailySpend.get(campaign.campaign_id);
    if (!spendByDay) continue;

    const spendVector = sortedDates.map(d => spendByDay.get(d) ?? 0);
    // Skip campaigns with near-zero variance
    if (spendVector.every(v => v === 0)) continue;

    let bestCorrelation = 0;
    let bestProductId = '';
    let bestProductTitle = '';

    for (const product of products) {
      const revenueByDay = productDailyRevenue.get(product.product_id);
      if (!revenueByDay) continue;

      const revenueVector = sortedDates.map(d => revenueByDay.get(d) ?? 0);
      const correlation = pearsonCorrelation(spendVector, revenueVector);

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestProductId = product.product_id;
        bestProductTitle = product.product_title;
      }
    }

    if (bestCorrelation > 0.5 && bestProductId) {
      results.push({
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        product_id: bestProductId,
        product_title: bestProductTitle,
        confidence: Math.round(70 * bestCorrelation), // 70% * correlation strength
        method: 'revenue_correlation',
        sessions_tracked: 0,
        conversions_tracked: 0,
        correlation_score: Math.round(bestCorrelation * 1000) / 1000,
        creative_url: null,
      });
    }
  }

  return results;
}

// ── Method 4: Campaign Name Intelligence (50% confidence) ───

function campaignNameAttribution(
  campaigns: Array<{ campaign_id: string; campaign_name: string }>,
  products: Array<{ product_id: string; product_title: string; product_handle: string | null }>,
): AttributionCandidate[] {
  const results: AttributionCandidate[] = [];

  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'of', 'on', 'at',
    'by', 'with', 'from', 'up', 'out', 'is', 'it', 'as', 'be', 'was',
    'campaign', 'ad', 'ads', 'adset', 'test', 'v1', 'v2', 'v3', 'v4',
    'broad', 'lookalike', 'retargeting', 'prospecting', 'cbo', 'abo',
    'purchase', 'conversion', 'sales', 'traffic', 'reach', 'engagement',
    'new', 'copy', 'creative', 'interest', 'lal',
  ]);

  function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t));
  }

  for (const campaign of campaigns) {
    const campaignTokens = tokenize(campaign.campaign_name);
    if (campaignTokens.length === 0) continue;

    let bestScore = 0;
    let bestProduct: { product_id: string; product_title: string } | null = null;

    for (const product of products) {
      const productTokens = tokenize(product.product_title);
      if (productTokens.length === 0) continue;

      let matchCount = 0;
      for (const token of productTokens) {
        if (campaignTokens.includes(token)) matchCount++;
      }

      const score = matchCount / productTokens.length;
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    }

    if (bestScore >= 0.3 && bestProduct) {
      results.push({
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        product_id: bestProduct.product_id,
        product_title: bestProduct.product_title,
        confidence: Math.round(50 * bestScore),
        method: 'campaign_name',
        sessions_tracked: 0,
        conversions_tracked: 0,
        correlation_score: 0,
        creative_url: null,
      });
    }
  }

  return results;
}

// ── Pearson Correlation ─────────────────────────────────────

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denominator === 0) return 0;

  return Math.max(0, numerator / denominator); // Clamp to 0-1 (we only care about positive correlation)
}

// ── Persistence ─────────────────────────────────────────────

async function persistAttributions(
  storeId: string,
  attributions: AttributionCandidate[],
): Promise<void> {
  if (attributions.length === 0) return;

  const now = new Date().toISOString();
  const rows = attributions.map(a => ({
    store_id: storeId,
    campaign_id: a.campaign_id,
    campaign_name: a.campaign_name,
    product_id: a.product_id,
    product_title: a.product_title,
    confidence: a.confidence,
    method: a.method,
    sessions_tracked: a.sessions_tracked,
    conversions_tracked: a.conversions_tracked,
    correlation_score: a.correlation_score,
    creative_url: a.creative_url,
    last_computed_at: now,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    await rest(
      '/campaign_product_attributions?on_conflict=store_id,campaign_id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      }
    ).catch(() => null);
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npx next build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/prism/adAttribution.ts
git commit -m "feat: PRISM ad attribution engine — 4-method campaign→product detection"
```

---

## Chunk 3: Signal Scorer & Classification Enhancement

### Task 5: Signal Scorer

**Files:**
- Create: `src/lib/prism/signalScorer.ts`

- [ ] **Step 1: Write the signal scorer**

This computes all 15+ signals per product and stores them in product_signal_scores:

```typescript
/**
 * PRISM — Multi-Signal Product Scorer
 *
 * Computes 15+ signals per product from all data sources:
 * ad campaigns, pixel sessions, order patterns, Shopify metadata.
 * Produces a final classification score with full signal breakdown.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

// ── Title/Description keyword lists ─────────────────────────

const UPSELL_TITLE_KEYWORDS = [
  'bundle', 'kit', 'pack', 'upgrade', 'bonus', 'add-on', 'addon',
  'fast', 'rush', 'vip', 'express', 'priority', 'warranty',
  'insurance', 'protection', 'gift-wrap', 'gift wrap', 'tip',
  'bump', 'expedited', 'shipping protection', 'extended warranty',
];

const MAIN_TITLE_KEYWORDS = [
  'course', 'masterclass', 'program', 'system', 'blueprint',
  'guide', 'complete', 'full', 'ultimate', 'signature',
];

const UPSELL_DESCRIPTION_KEYWORDS = [
  'only available with', 'add to your order', 'exclusive upgrade',
  'special offer', 'limited time', 'one-time offer', 'order bump',
];

const MAIN_DESCRIPTION_KEYWORDS = [
  'complete', 'full program', 'everything you need', 'our flagship',
  'best seller', 'most popular',
];

const UPSELL_HANDLE_PREFIXES = ['upsell', 'bump', 'oto', 'downsell', 'addon'];

// ── Signal Weights (adaptive) ───────────────────────────────

interface WeightConfig {
  own_campaigns: number;
  ad_landing: number;
  title_keywords: number;
  alone_rate: number;
  session_entry: number;
  traffic_source: number;
  product_type_tags: number;
  price_relative: number;
  description_keywords: number;
  product_handle: number;
  position: number;
  compare_at_price: number;
  first_order: number;
  refund_rate: number;
  add_to_cart_source: number;
  direct_spend_share: number;
}

function computeAdaptiveWeights(hasPixelData: boolean, hasAdData: boolean): WeightConfig {
  if (hasPixelData && hasAdData) {
    return {
      own_campaigns: 0.25, ad_landing: 0.20, title_keywords: 0.05,
      alone_rate: 0.10, session_entry: 0.08, traffic_source: 0.06,
      product_type_tags: 0.03, price_relative: 0.02, description_keywords: 0.02,
      product_handle: 0.02, position: 0.05, compare_at_price: 0.02,
      first_order: 0.03, refund_rate: 0.02, add_to_cart_source: 0.03,
      direct_spend_share: 0.00, // captured in own_campaigns
    };
  }
  if (hasAdData) {
    return {
      own_campaigns: 0.30, ad_landing: 0.00, title_keywords: 0.10,
      alone_rate: 0.20, session_entry: 0.00, traffic_source: 0.00,
      product_type_tags: 0.05, price_relative: 0.03, description_keywords: 0.03,
      product_handle: 0.03, position: 0.10, compare_at_price: 0.03,
      first_order: 0.05, refund_rate: 0.03, add_to_cart_source: 0.00,
      direct_spend_share: 0.05,
    };
  }
  // No ad data, no pixel — rely on behavioral + metadata
  return {
    own_campaigns: 0.00, ad_landing: 0.00, title_keywords: 0.20,
    alone_rate: 0.25, session_entry: 0.00, traffic_source: 0.00,
    product_type_tags: 0.05, price_relative: 0.05, description_keywords: 0.05,
    product_handle: 0.05, position: 0.15, compare_at_price: 0.03,
    first_order: 0.07, refund_rate: 0.05, add_to_cart_source: 0.00,
    direct_spend_share: 0.00,
  };
}

// ── Main Entry Point ────────────────────────────────────────

export interface SignalScoreReport {
  store_id: string;
  products_scored: number;
  signals_available: number;
  products: Array<{
    product_id: string;
    product_title: string;
    classification: string;
    confidence: number;
    primary_signal: string;
    total_score: number;
    signal_count: number;
  }>;
}

export async function computeAllSignals(storeId: string): Promise<SignalScoreReport> {
  // Load data sources in parallel
  const [
    classifications, attributions, behaviors, metaSessions, orders,
  ] = await Promise.all([
    rest<Array<{
      product_id: string; product_title: string; product_type: string;
      product_handle: string | null; alone_pct: number; first_position_pct: number;
      avg_position: number; revenue_share: number; has_own_campaigns: boolean;
      ad_landing_rate: number; manual_override: boolean;
    }>>(
      `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,product_title,product_type,product_handle,alone_pct,first_position_pct,avg_position,revenue_share,has_own_campaigns,ad_landing_rate,manual_override`
    ).catch(() => []),

    rest<Array<{
      campaign_id: string; product_id: string; confidence: number; method: string;
    }>>(
      `/campaign_product_attributions?store_id=eq.${enc(storeId)}&select=campaign_id,product_id,confidence,method`
    ).catch(() => []),

    rest<Array<{
      product_id: string; alone_rate: number; first_rate: number;
      avg_position: number; revenue_share: number; co_occurrence_rate: number;
    }>>(
      `/product_behaviors?store_id=eq.${enc(storeId)}&select=product_id,alone_rate,first_rate,avg_position,revenue_share,co_occurrence_rate`
    ).catch(() => []),

    rest<Array<{
      first_product_viewed_id: string; order_id: string | null;
    }>>(
      `/visitor_attribution?store_id=eq.${enc(storeId)}&or=(utm_source.ilike.*facebook*,utm_source.ilike.*meta*,fbclid.not.is.null)&select=first_product_viewed_id,order_id`
    ).catch(() => []),

    rest<Array<{ line_items: string; created_at: string }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&order_status=neq.cancelled&financial_status=neq.refunded&select=line_items,created_at&order=created_at.asc&limit=1000`
    ).catch(() => []),
  ]);

  const hasAdData = attributions.length > 0;
  const hasPixelData = metaSessions.length > 0;
  const weights = computeAdaptiveWeights(hasPixelData, hasAdData);

  // Build lookup maps
  const behaviorMap = new Map(behaviors.map(b => [b.product_id, b]));
  const attributionsByProduct = new Map<string, number>();
  for (const a of attributions) {
    attributionsByProduct.set(a.product_id, (attributionsByProduct.get(a.product_id) ?? 0) + 1);
  }

  // Pixel landing counts
  const totalMetaSessions = metaSessions.length;
  const landingCounts = new Map<string, number>();
  for (const s of metaSessions) {
    if (s.first_product_viewed_id) {
      landingCounts.set(s.first_product_viewed_id, (landingCounts.get(s.first_product_viewed_id) ?? 0) + 1);
    }
  }

  // Median price for relative scoring
  const prices = classifications.map(c => {
    const b = behaviorMap.get(c.product_id);
    return b ? b.revenue_share : 0;
  }).filter(p => p > 0).sort((a, b) => a - b);
  const medianRevenueShare = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;

  // First-order appearance
  const firstOrderProducts = new Set<string>();
  if (orders.length > 0) {
    // Look at first 10% of orders (earliest) to find "entry products"
    const earlyOrders = orders.slice(0, Math.max(10, Math.floor(orders.length * 0.1)));
    for (const o of earlyOrders) {
      let items: Array<{ product_id?: string | number }>;
      try { items = typeof o.line_items === 'string' ? JSON.parse(o.line_items) : o.line_items || []; } catch { continue; }
      for (const item of items) {
        if (item.product_id) firstOrderProducts.add(String(item.product_id));
      }
    }
  }

  // Total ad spend for share computation
  const totalCampaigns = attributions.length;

  // Score each product
  const scoredProducts: Array<{
    product_id: string; product_title: string; classification: string;
    confidence: number; primary_signal: string; total_score: number; signal_count: number;
  }> = [];

  const scoreRows: Array<Record<string, unknown>> = [];

  for (const product of classifications) {
    if (product.manual_override) continue; // Skip manual overrides

    const behavior = behaviorMap.get(product.product_id);
    const hasOwnCampaigns = (attributionsByProduct.get(product.product_id) ?? 0) > 0;
    const landingSessions = landingCounts.get(product.product_id) ?? 0;
    const landingRate = totalMetaSessions > 0 ? landingSessions / totalMetaSessions : 0;
    const campaignCount = attributionsByProduct.get(product.product_id) ?? 0;
    const spendShare = totalCampaigns > 0 ? campaignCount / totalCampaigns : 0;

    // Compute individual signal scores (-1 to +1, positive = main, negative = upsell)
    const scores: Record<string, number> = {};
    let signalCount = 0;

    // Ad signals
    scores.own_campaigns = hasOwnCampaigns ? 1.0 : (hasAdData ? -0.5 : 0);
    if (hasAdData) signalCount++;

    scores.ad_landing = landingRate > 0.1 ? 0.8 : (landingRate > 0 ? 0.3 : (hasPixelData ? -0.5 : 0));
    if (hasPixelData) signalCount++;

    scores.direct_spend_share = spendShare > 0.2 ? 0.8 : (spendShare > 0 ? 0.3 : 0);
    if (hasAdData && spendShare > 0) signalCount++;

    // Behavioral signals
    const aloneRate = behavior?.alone_rate ?? (product.alone_pct / 100);
    scores.alone_rate = aloneRate > 0.5 ? 0.8 : (aloneRate > 0.3 ? 0.3 : (aloneRate < 0.05 ? -0.8 : -0.3));
    signalCount++;

    const firstRate = behavior?.first_rate ?? (product.first_position_pct / 100);
    scores.position = firstRate > 0.65 ? 0.7 : (product.avg_position > 2.5 ? -0.7 : 0);
    signalCount++;

    scores.revenue_share = product.revenue_share > 30 ? 0.6 : (product.revenue_share < 5 ? -0.4 : 0);
    signalCount++;

    // Shopify metadata signals
    const titleLower = (product.product_title || '').toLowerCase();
    const typeLower = (product.product_type || '').toLowerCase();
    const handleLower = (product.product_handle || '').toLowerCase();

    scores.title_keywords = UPSELL_TITLE_KEYWORDS.some(k => titleLower.includes(k)) ? -0.7
      : MAIN_TITLE_KEYWORDS.some(k => titleLower.includes(k)) ? 0.6 : 0;
    if (scores.title_keywords !== 0) signalCount++;

    scores.product_type_tags = typeLower.includes('upsell') || typeLower.includes('bump') ? -0.8
      : typeLower.includes('main') || typeLower.includes('hero') ? 0.7 : 0;
    if (scores.product_type_tags !== 0) signalCount++;

    scores.price_relative = product.revenue_share < medianRevenueShare * 0.3 ? -0.3
      : product.revenue_share > medianRevenueShare * 1.5 ? 0.3 : 0;
    if (scores.price_relative !== 0) signalCount++;

    scores.product_handle = UPSELL_HANDLE_PREFIXES.some(p => handleLower.startsWith(p)) ? -0.8 : 0;
    if (scores.product_handle !== 0) signalCount++;

    scores.description_keywords = 0; // Would need product description from Shopify — skip for now
    scores.compare_at_price = 0; // Would need compare_at_price from Shopify — skip for now

    // Session/pixel signals
    scores.session_entry = 0; // Already captured in ad_landing
    scores.traffic_source = landingRate > 0.2 ? 0.5 : 0;
    if (hasPixelData && scores.traffic_source !== 0) signalCount++;

    scores.add_to_cart_source = 0; // Would need cart-page pixel events — skip for now

    // Order pattern signals
    scores.first_order = firstOrderProducts.has(product.product_id) ? 0.4 : -0.2;
    signalCount++;

    scores.refund_rate = 0; // Would need per-product refund data — skip for now

    // Compute weighted total
    let totalScore = 0;
    totalScore += scores.own_campaigns * weights.own_campaigns;
    totalScore += scores.ad_landing * weights.ad_landing;
    totalScore += scores.direct_spend_share * weights.direct_spend_share;
    totalScore += scores.alone_rate * weights.alone_rate;
    totalScore += scores.position * weights.position;
    totalScore += scores.revenue_share * 0; // already in alone_rate
    totalScore += scores.title_keywords * weights.title_keywords;
    totalScore += scores.product_type_tags * weights.product_type_tags;
    totalScore += scores.price_relative * weights.price_relative;
    totalScore += scores.product_handle * weights.product_handle;
    totalScore += scores.traffic_source * weights.traffic_source;
    totalScore += scores.first_order * weights.first_order;

    // Find primary signal (highest absolute contribution)
    let primarySignal = 'behavioral';
    let maxContribution = 0;
    const contributions: Record<string, number> = {
      'ad_campaigns': Math.abs(scores.own_campaigns * weights.own_campaigns),
      'ad_landing': Math.abs(scores.ad_landing * weights.ad_landing),
      'alone_rate': Math.abs(scores.alone_rate * weights.alone_rate),
      'position': Math.abs(scores.position * weights.position),
      'title_keywords': Math.abs(scores.title_keywords * weights.title_keywords),
      'product_type': Math.abs(scores.product_type_tags * weights.product_type_tags),
      'product_handle': Math.abs(scores.product_handle * weights.product_handle),
    };
    for (const [signal, contribution] of Object.entries(contributions)) {
      if (contribution > maxContribution) {
        maxContribution = contribution;
        primarySignal = signal;
      }
    }

    // Determine classification
    let classification: string;
    let confidence: number;
    if (totalScore > 0.3) {
      classification = 'main';
      confidence = Math.min(99, Math.round(totalScore * 100));
    } else if (totalScore < -0.3) {
      classification = 'upsell';
      confidence = Math.min(99, Math.round(Math.abs(totalScore) * 100));
    } else {
      classification = 'pending';
      confidence = Math.round(Math.abs(totalScore) * 100);
    }

    scoredProducts.push({
      product_id: product.product_id,
      product_title: product.product_title,
      classification, confidence, primary_signal: primarySignal,
      total_score: Math.round(totalScore * 1000) / 1000,
      signal_count: signalCount,
    });

    scoreRows.push({
      store_id: storeId,
      product_id: product.product_id,
      score_own_campaigns: scores.own_campaigns,
      score_ad_landing: scores.ad_landing,
      score_direct_spend_share: scores.direct_spend_share,
      score_alone_rate: scores.alone_rate,
      score_position: scores.position,
      score_revenue_share: scores.revenue_share,
      score_title_keywords: scores.title_keywords,
      score_product_type_tags: scores.product_type_tags,
      score_price_relative: scores.price_relative,
      score_description_keywords: scores.description_keywords,
      score_product_handle: scores.product_handle,
      score_compare_at_price: scores.compare_at_price,
      score_session_entry: scores.session_entry,
      score_traffic_source: scores.traffic_source,
      score_add_to_cart_source: scores.add_to_cart_source,
      score_first_order_appearance: scores.first_order,
      score_refund_rate: scores.refund_rate,
      total_score: totalScore,
      signal_count: signalCount,
      classification,
      confidence,
      primary_signal: primarySignal,
      computed_at: new Date().toISOString(),
    });
  }

  // Persist scores
  for (let i = 0; i < scoreRows.length; i += 50) {
    const chunk = scoreRows.slice(i, i + 50);
    await rest(
      '/product_signal_scores?on_conflict=store_id,product_id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      }
    ).catch(() => null);
  }

  return {
    store_id: storeId,
    products_scored: scoredProducts.length,
    signals_available: hasAdData && hasPixelData ? 15 : hasAdData ? 10 : 8,
    products: scoredProducts,
  };
}
```

- [ ] **Step 2: Verify build**

```bash
npx next build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/prism/signalScorer.ts
git commit -m "feat: PRISM multi-signal product scorer — 15+ weighted signals"
```

---

### Task 6: Enhance Classification Router with Ad Signals

**Files:**
- Modify: `src/lib/intelligence/signalStackClassifier.ts`
- Modify: `src/lib/intelligence/classificationRouter.ts`
- Modify: `src/lib/intelligence/types.ts`

- [ ] **Step 1: Add ad fields to ClassificationSignals in types.ts**

In `src/lib/intelligence/types.ts`, add two fields to `ClassificationSignals`:

```typescript
// Add after subscription_score in ClassificationSignals:
  ad_campaign_score: number;
  ad_landing_score: number;
```

Add to `SignalStackMethod` union:
```typescript
  | 'ad_campaign_detected'
  | 'ad_traffic_landing'
```

- [ ] **Step 2: Update signalStackClassifier.ts to incorporate ad signals**

Modify `computeSignals()` to accept optional ad signals and add them to the aggregate:

Change the function signature:
```typescript
export function computeSignals(
  pattern: ProductOrderPattern,
  medianPrice: number,
  adSignals?: { has_own_campaigns: boolean; landing_page_rate: number; direct_spend_share: number },
): ClassificationSignals {
```

Add after the subscription_score computation (~line 114):
```typescript
  // Signal 9: Ad campaign ownership (25 points — strongest signal)
  let ad_campaign_score = 0;
  if (adSignals?.has_own_campaigns) ad_campaign_score = 25;
  else if (adSignals && !adSignals.has_own_campaigns && adSignals.direct_spend_share === 0) ad_campaign_score = -15;

  // Signal 10: Ad landing page rate (20 points)
  let ad_landing_score = 0;
  if (adSignals) {
    if (adSignals.landing_page_rate > 0.1) ad_landing_score = 20;
    else if (adSignals.landing_page_rate === 0) ad_landing_score = -10;
  }
```

Add to rawSum:
```typescript
  const rawSum = alone_pct_score + position_score + revenue_score + tag_score +
    (type_score === -999 ? 0 : type_score) +
    title_score + price_score + app_score + subscription_score +
    ad_campaign_score + ad_landing_score;
```

Add to the return object:
```typescript
    ad_campaign_score,
    ad_landing_score,
```

Update `classifyProduct()` to handle ad-based classifications before the standard score checks:

Insert after the "Insufficient data" block (~line 195) and before "Bundle detection":
```typescript
  // ── AD-BASED CLASSIFICATION (highest confidence) ────────
  if (signals.ad_campaign_score >= 25) {
    return {
      ...base,
      classification: 'main',
      confidence: 95,
      method: 'ad_campaign_detected',
      signals,
      needs_review: false,
    };
  }

  if (signals.ad_landing_score >= 20) {
    return {
      ...base,
      classification: 'main',
      confidence: 85,
      method: 'ad_traffic_landing',
      signals,
      needs_review: false,
    };
  }
```

- [ ] **Step 3: Update classificationRouter.ts to fetch and pass ad signals**

Add a function to fetch ad signals and modify `classifyAllProducts()`:

Add at top of file, new import:
```typescript
import type { AdSignals } from './types';
```

Add helper function before `classifyAllProducts()`:
```typescript
async function getAdSignalsForProducts(storeId: string): Promise<Map<string, { has_own_campaigns: boolean; landing_page_rate: number; direct_spend_share: number }>> {
  const signals = new Map<string, { has_own_campaigns: boolean; landing_page_rate: number; direct_spend_share: number }>();

  // Get campaign attributions
  const attributions = await rest<Array<{ product_id: string }>>(
    `/campaign_product_attributions?store_id=eq.${enc(storeId)}&confidence=gte.50&select=product_id`
  ).catch(() => []);

  // Get pixel landing data for Meta traffic
  const landingData = await rest<Array<{ first_product_viewed_id: string }>(
    `/visitor_attribution?store_id=eq.${enc(storeId)}&or=(utm_source.ilike.*facebook*,utm_source.ilike.*meta*,fbclid.not.is.null)&first_product_viewed_id=not.is.null&select=first_product_viewed_id`
  ).catch(() => []);

  const totalMetaSessions = landingData.length;
  const landingCounts = new Map<string, number>();
  for (const s of landingData) {
    if (s.first_product_viewed_id) {
      landingCounts.set(s.first_product_viewed_id, (landingCounts.get(s.first_product_viewed_id) ?? 0) + 1);
    }
  }

  // Count campaigns per product
  const campaignsPerProduct = new Map<string, number>();
  const totalCampaigns = new Set(attributions.map(a => a.product_id)).size;
  for (const a of attributions) {
    campaignsPerProduct.set(a.product_id, (campaignsPerProduct.get(a.product_id) ?? 0) + 1);
  }

  // Build signal map for all products that have any ad data
  const allProductIds = new Set([
    ...campaignsPerProduct.keys(),
    ...landingCounts.keys(),
  ]);

  for (const pid of allProductIds) {
    const campaignCount = campaignsPerProduct.get(pid) ?? 0;
    const landingSessions = landingCounts.get(pid) ?? 0;

    signals.set(pid, {
      has_own_campaigns: campaignCount > 0,
      landing_page_rate: totalMetaSessions > 0 ? landingSessions / totalMetaSessions : 0,
      direct_spend_share: totalCampaigns > 0 ? campaignCount / totalCampaigns : 0,
    });
  }

  return signals;
}
```

In `classifyAllProducts()`, after line 91 (after `partitionByDataSufficiency`), add:
```typescript
  // 3b. Fetch ad signals for all products
  const adSignalMap = await getAdSignalsForProducts(storeId);
```

Change the behavioral classification loop (~line 95) to pass ad signals:
```typescript
  for (const p of sufficient) {
    const adSig = adSignalMap.get(p.product_id);
    const signals = computeSignals(p, medianPrice, adSig);
    behavioralResults.push(classifyProduct(p, signals));
  }
```

In `persistClassifications()`, add the ad signal columns to the row mapping (~line 294):
```typescript
      has_own_campaigns: adSignalMap?.get(r.product_id)?.has_own_campaigns ?? false,
      ad_landing_rate: adSignalMap?.get(r.product_id)?.landing_page_rate ?? 0,
      ad_signal_confidence: (r.method === 'ad_campaign_detected' || r.method === 'ad_traffic_landing') ? r.confidence : 0,
      ad_signal_method: (r.method === 'ad_campaign_detected' || r.method === 'ad_traffic_landing') ? r.method : null,
```

Note: `persistClassifications` needs the `adSignalMap` passed in. Change its signature to accept it as an optional parameter and thread it through from `classifyAllProducts`.

- [ ] **Step 4: Verify build**

```bash
npx next build
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/intelligence/types.ts src/lib/intelligence/signalStackClassifier.ts src/lib/intelligence/classificationRouter.ts
git commit -m "feat: integrate ad signals into product classification — bidirectional feedback loop"
```

---

## Chunk 4: Cron & Admin Endpoints + Integration

### Task 7: Cron Endpoint

**Files:**
- Create: `src/app/api/cron/compute-ad-attribution/route.ts`

- [ ] **Step 1: Write the cron endpoint**

```typescript
/**
 * Cron: Compute Ad Attribution
 * Runs ad attribution engine for all stores, then signal scoring.
 * Designed to run weekly or after Meta sync.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';
import { computeAdAttributions } from '@/lib/prism/adAttribution';
import { computeAllSignals } from '@/lib/prism/signalScorer';
import { getMetaToken } from '@/app/api/lib/tokens';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const requestedStoreId = new URL(request.url).searchParams.get('storeId');
  const stores = requestedStoreId
    ? [{ id: requestedStoreId, name: requestedStoreId }]
    : await listPersistentStores();

  const results: Array<{
    store: string;
    attribution: { attributed: number; unattributed: number; by_method: Record<string, number> };
    signals: { products_scored: number; signals_available: number };
    error?: string;
  }> = [];

  for (const store of stores) {
    try {
      // Get Meta token for creative URL detection
      let metaToken: string | undefined;
      try {
        metaToken = await getMetaToken(store.id) ?? undefined;
      } catch { /* no Meta connection */ }

      // Step 1: Compute ad attributions
      const attribution = await computeAdAttributions(store.id, metaToken);

      // Step 2: Compute signal scores
      const signals = await computeAllSignals(store.id);

      results.push({
        store: store.name,
        attribution: {
          attributed: attribution.attributed,
          unattributed: attribution.unattributed,
          by_method: attribution.by_method,
        },
        signals: {
          products_scored: signals.products_scored,
          signals_available: signals.signals_available,
        },
      });
    } catch (err) {
      results.push({
        store: store.name,
        attribution: { attributed: 0, unattributed: 0, by_method: {} },
        signals: { products_scored: 0, signals_available: 0 },
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    run_at: new Date().toISOString(),
    stores_processed: results.length,
    results,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/compute-ad-attribution/route.ts
git commit -m "feat: add compute-ad-attribution cron endpoint"
```

---

### Task 8: Admin Report Endpoint

**Files:**
- Create: `src/app/api/admin/ad-attribution-report/route.ts`

- [ ] **Step 1: Write the diagnostic report endpoint**

```typescript
/**
 * Admin: Ad Attribution Report
 * Shows detailed attribution results per store:
 * - Which method detected each campaign's product
 * - Confidence scores
 * - Total spend attributed per product
 * - How much spend is still unattributed
 * - Signal score breakdown for 5 products
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const requestedStoreId = new URL(request.url).searchParams.get('storeId');
  const stores = requestedStoreId
    ? [{ id: requestedStoreId, name: requestedStoreId }]
    : await listPersistentStores();

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
  const report: unknown[] = [];

  for (const store of stores) {
    // Get attributions
    const attributions = await rest<Array<{
      campaign_id: string; campaign_name: string; product_id: string;
      product_title: string; confidence: number; method: string;
      sessions_tracked: number; conversions_tracked: number;
      correlation_score: number; creative_url: string | null;
    }>>(
      `/campaign_product_attributions?store_id=eq.${enc(store.id)}&select=*&order=confidence.desc`
    ).catch(() => []);

    // Get total spend per campaign
    const spendRows = await rest<Array<{ campaign_id: string; spend: number }>>(
      `/meta_spend_cache?store_id=eq.${enc(store.id)}&date=gte.${ninetyDaysAgo}&select=campaign_id,spend`
    ).catch(() => []);

    const spendByCampaign = new Map<string, number>();
    for (const r of spendRows) {
      spendByCampaign.set(r.campaign_id, (spendByCampaign.get(r.campaign_id) ?? 0) + Number(r.spend));
    }

    // Calculate spend per product and unattributed
    const spendByProduct = new Map<string, { title: string; spend: number; campaigns: number }>();
    let attributedSpend = 0;
    const attributedCampaignIds = new Set<string>();

    for (const a of attributions) {
      const campSpend = spendByCampaign.get(a.campaign_id) ?? 0;
      attributedSpend += campSpend;
      attributedCampaignIds.add(a.campaign_id);

      const existing = spendByProduct.get(a.product_id) ?? { title: a.product_title, spend: 0, campaigns: 0 };
      existing.spend += campSpend;
      existing.campaigns++;
      spendByProduct.set(a.product_id, existing);
    }

    const totalSpend = Array.from(spendByCampaign.values()).reduce((s, v) => s + v, 0);
    const unattributedSpend = totalSpend - attributedSpend;

    // Get signal scores for top 5 products
    const signalScores = await rest<Array<{
      product_id: string; classification: string; confidence: number;
      primary_signal: string; total_score: number; signal_count: number;
      score_own_campaigns: number; score_ad_landing: number;
      score_alone_rate: number; score_title_keywords: number;
      score_position: number; score_product_type_tags: number;
    }>>(
      `/product_signal_scores?store_id=eq.${enc(store.id)}&select=*&order=confidence.desc&limit=5`
    ).catch(() => []);

    // Method distribution
    const byMethod: Record<string, { count: number; total_spend: number; avg_confidence: number }> = {};
    for (const a of attributions) {
      if (!byMethod[a.method]) byMethod[a.method] = { count: 0, total_spend: 0, avg_confidence: 0 };
      byMethod[a.method].count++;
      byMethod[a.method].total_spend += spendByCampaign.get(a.campaign_id) ?? 0;
      byMethod[a.method].avg_confidence += a.confidence;
    }
    for (const m of Object.values(byMethod)) {
      m.avg_confidence = m.count > 0 ? Math.round(m.avg_confidence / m.count) : 0;
      m.total_spend = Math.round(m.total_spend * 100) / 100;
    }

    // Confidence tiers
    const highConfidence = attributions.filter(a => a.confidence >= 70).length;
    const medConfidence = attributions.filter(a => a.confidence >= 40 && a.confidence < 70).length;
    const lowConfidence = attributions.filter(a => a.confidence < 40).length;

    report.push({
      store: store.name,
      store_id: store.id,
      summary: {
        total_campaigns: spendByCampaign.size,
        attributed_campaigns: attributions.length,
        unattributed_campaigns: spendByCampaign.size - attributedCampaignIds.size,
        total_spend_90d: Math.round(totalSpend * 100) / 100,
        attributed_spend: Math.round(attributedSpend * 100) / 100,
        unattributed_spend: Math.round(unattributedSpend * 100) / 100,
        attribution_rate: totalSpend > 0 ? Math.round(attributedSpend / totalSpend * 100) + '%' : 'N/A',
      },
      confidence_tiers: {
        high_70plus: highConfidence,
        medium_40_70: medConfidence,
        low_under_40: lowConfidence,
      },
      by_method: byMethod,
      spend_per_product: Array.from(spendByProduct.entries()).map(([pid, data]) => ({
        product_id: pid,
        product_title: data.title,
        spend: Math.round(data.spend * 100) / 100,
        campaigns: data.campaigns,
      })).sort((a, b) => b.spend - a.spend),
      signal_breakdown_top5: signalScores.map(s => ({
        product_id: s.product_id,
        classification: s.classification,
        confidence: s.confidence,
        primary_signal: s.primary_signal,
        total_score: s.total_score,
        signals: {
          ad_campaigns: s.score_own_campaigns,
          ad_landing: s.score_ad_landing,
          alone_rate: s.score_alone_rate,
          position: s.score_position,
          title_keywords: s.score_title_keywords,
          product_type: s.score_product_type_tags,
        },
      })),
      attributions: attributions.map(a => ({
        campaign: a.campaign_name,
        product: a.product_title,
        confidence: a.confidence,
        method: a.method,
        sessions: a.sessions_tracked,
        conversions: a.conversions_tracked,
        correlation: a.correlation_score,
        creative_url: a.creative_url,
      })),
    });
  }

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    total_stores: report.length,
    stores: report,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/ad-attribution-report/route.ts
git commit -m "feat: add ad attribution report admin endpoint"
```

---

### Task 9: Update metaSpendAttributor to use new attributions

**Files:**
- Modify: `src/lib/attribution/metaSpendAttributor.ts`

- [ ] **Step 1: Add PRISM attribution as priority 2 (after manual mappings)**

Add new type and update `AttributionMethod`:
```typescript
export type AttributionMethod =
  | 'manual_mapping'
  | 'prism_attribution'    // NEW: from campaign_product_attributions
  | 'keyword_match'
  | 'single_product'
  | 'unattributed';
```

Add `PrismAttribution` to the function params:
```typescript
export interface PrismAttribution {
  campaignId: string;
  productId: string;
  confidence: number;
}
```

Update `attributeSpend` signature:
```typescript
export function attributeSpend(
  campaigns: CampaignSpendData[],
  products: ProductData[],
  manualMappings: ManualMapping[] = [],
  prismAttributions: PrismAttribution[] = [],
): SpendAttribution[] {
```

Add PRISM lookup map after manualMap:
```typescript
  const prismMap = new Map<string, PrismAttribution>();
  for (const p of prismAttributions) {
    prismMap.set(p.campaignId, p);
  }
```

Add Priority 2 block after manual mapping check:
```typescript
    // Priority 2: PRISM auto-attribution (pixel/creative/correlation)
    const prism = prismMap.get(campaign.campaignId);
    if (prism && prism.confidence >= 50) {
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: prism.productId,
        spend: campaign.spend,
        confidence: prism.confidence / 100,
        method: 'prism_attribution',
      });
      continue;
    }
```

- [ ] **Step 2: Update universalCalculator.ts to load PRISM attributions**

In `src/lib/pnl/universalCalculator.ts`, where campaign_product_mappings are loaded, also load PRISM attributions:

Find where `campaign_product_mappings` are fetched and add:
```typescript
    // Load PRISM auto-attributions
    const prismAttributions = await rest<Array<{
      campaign_id: string; product_id: string; confidence: number;
    }>>(
      `/campaign_product_attributions?store_id=eq.${enc(storeId)}&confidence=gte.50&select=campaign_id,product_id,confidence`
    ).catch(() => []);
```

Pass them to `attributeSpend()`:
```typescript
    const prismMappings = prismAttributions.map(a => ({
      campaignId: a.campaign_id,
      productId: a.product_id,
      confidence: a.confidence,
    }));
    // Pass as 4th argument to attributeSpend
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/attribution/metaSpendAttributor.ts src/lib/pnl/universalCalculator.ts
git commit -m "feat: integrate PRISM attributions into spend attribution pipeline"
```

---

### Task 10: Store Product Handles During Classification

**Files:**
- Modify: `src/lib/intelligence/classificationRouter.ts`

- [ ] **Step 1: Add handle storage to persistClassifications**

The classification router receives product data from `analyzeOrderPatterns()` which pulls from `shopify_orders_cache`. The line_items JSON doesn't include handles. We need to fetch handles from the Shopify API or derive them.

Approach: In `persistClassifications`, derive handles from product titles as a best-effort:

```typescript
// In the row mapping, add:
product_handle: deriveHandle(r.product_title),
```

Add helper:
```typescript
function deriveHandle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

Note: This is a best-effort derivation. For exact handles, the `onboard-store` or `force-classify-all` admin endpoint should fetch products from Shopify and update the handle column. Add a TODO comment noting this.

- [ ] **Step 2: Commit**

```bash
git add src/lib/intelligence/classificationRouter.ts
git commit -m "feat: store product handles in classifications for URL matching"
```

---

### Task 11: Final Build Verification

- [ ] **Step 1: Full build**

```bash
npx next build
```

Fix any TypeScript errors.

- [ ] **Step 2: Verify all new files exist**

```bash
ls -la src/lib/prism/adAttribution.ts
ls -la src/lib/prism/signalScorer.ts
ls -la src/app/api/cron/compute-ad-attribution/route.ts
ls -la src/app/api/admin/ad-attribution-report/route.ts
ls -la supabase/migrations/018_ad_attribution.sql
```

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: PRISM ad attribution system — complete implementation"
```

---

## Post-Implementation Verification

After deploying tomorrow:

1. **Apply migration 018** via Supabase SQL editor
2. **Run the cron**: `curl -H "Authorization: Bearer $CRON_SECRET" "https://onescale.app/api/cron/compute-ad-attribution"`
3. **Check the report**: `curl -H "Authorization: Bearer $CRON_SECRET" "https://onescale.app/api/admin/ad-attribution-report"`
4. **Re-run classification**: `curl -H "Authorization: Bearer $CRON_SECRET" "https://onescale.app/api/admin/force-classify-all"`
5. **Check signal scores**: Query `product_signal_scores` table to see per-product breakdown
6. **Target**: >80% of spend attributed with >70% confidence

## Architecture Diagram

```
Meta Sync (every 10min)
  └─ campaign data into meta_spend_cache

Pixel Tracking (real-time)
  └─ visitor sessions into visitor_attribution

Ad Attribution Cron (weekly)
  ├─ Method 1: pixel_session (95%) ← visitor_attribution
  ├─ Method 2: ad_creative_url (90%) ← Meta API creative URLs
  ├─ Method 3: revenue_correlation (70%) ← meta_spend_cache × orders
  └─ Method 4: campaign_name (50%) ← keyword matching
  └─ → campaign_product_attributions

Signal Scorer (after attribution)
  ├─ 15+ signals from all sources
  ├─ Adaptive weights by data availability
  └─ → product_signal_scores

Classification (periodic)
  ├─ Existing 8 behavioral signals
  ├─ + 2 new ad signals (ad_campaign_score, ad_landing_score)
  ├─ Ad signals override behavioral when confident
  └─ → product_classifications (with has_own_campaigns, ad_landing_rate)

P&L Calculator (on demand)
  ├─ manual_mapping (priority 1)
  ├─ prism_attribution (priority 2, NEW)
  ├─ keyword_match (priority 3)
  └─ unattributed (last resort)
```
