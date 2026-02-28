import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchShopifyOrders } from '@/app/api/lib/shopify-client';
import { resolveMetaEntityIdsFromUtms } from '@/app/api/lib/meta-attribution-lookup';

/**
 * Attribute Shopify revenue to Meta campaigns via UTM parameters.
 *
 * POST /api/attribution/campaign-revenue
 * Body: { storeId, dateRange: { since, until }, campaignIds: string[] }
 *
 * Returns: { data: { [campaignId]: { shopifyRevenue, orderCount } } }
 *
 * Attribution strategy (in order):
 * 1. Direct ID — landing_site URL contains `campaign_id=123456`
 * 2. UTM fuzzy match — `utm_campaign=CampaignName` → resolve via lookup
 * 3. Unattributed — order has no Meta-linked UTMs (excluded from results)
 */
export async function POST(request: NextRequest) {
  let body: { storeId?: string; dateRange?: { since?: string; until?: string }; campaignIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { storeId, dateRange, campaignIds } = body;
  if (!storeId || !dateRange?.since || !dateRange?.until) {
    return NextResponse.json(
      { error: 'storeId, dateRange.since, and dateRange.until are required' },
      { status: 400 }
    );
  }

  const token = await getShopifyToken(storeId);
  if (!token || !token.shopDomain) {
    return NextResponse.json({ error: 'Not authenticated with Shopify' }, { status: 401 });
  }

  try {
    // Fetch all paid orders in the date range (paginate through all pages)
    const allOrders = await fetchAllOrders(
      token.accessToken,
      token.shopDomain,
      dateRange.since,
      dateRange.until
    );

    // Build a set of campaign IDs we care about (for filtering)
    const campaignIdSet = campaignIds?.length ? new Set(campaignIds) : null;

    // Aggregate revenue per campaign
    const result: Record<string, { shopifyRevenue: number; orderCount: number }> = {};

    for (const order of allOrders) {
      // Skip fully refunded orders
      if (order.financialStatus === 'refunded' || order.financialStatus === 'voided') continue;

      const resolved = resolveFromLandingSite(order.landingSite ?? null);
      let campaignId = resolved.campaignId;

      // If no direct campaign_id in URL, try UTM fuzzy matching
      if (!campaignId && resolved.utmCampaign) {
        const attribution = await resolveMetaEntityIdsFromUtms({
          storeId,
          utmCampaign: resolved.utmCampaign,
          utmMedium: resolved.utmMedium,
          utmContent: resolved.utmContent,
          campaignId: resolved.campaignId,
          adSetId: resolved.adSetId,
          adId: resolved.adId,
        });
        campaignId = attribution.campaignId;
      }

      if (!campaignId) continue;
      if (campaignIdSet && !campaignIdSet.has(campaignId)) continue;

      const revenue = parseFloat(order.totalPrice) || 0;
      if (!result[campaignId]) {
        result[campaignId] = { shopifyRevenue: 0, orderCount: 0 };
      }
      result[campaignId].shopifyRevenue += revenue;
      result[campaignId].orderCount += 1;
    }

    // Round revenues to 2 decimal places
    for (const key of Object.keys(result)) {
      result[key].shopifyRevenue = Math.round(result[key].shopifyRevenue * 100) / 100;
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute campaign revenue';
    console.error('[campaign-revenue] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fetch all Shopify orders for a date range, paginating through all pages.
 */
async function fetchAllOrders(
  accessToken: string,
  shopDomain: string,
  since: string,
  until: string
) {
  const allOrders: Awaited<ReturnType<typeof fetchShopifyOrders>> = [];
  let sinceId: string | undefined;
  const MAX_PAGES = 20; // Safety limit: 20 pages × 250 = 5,000 orders max

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchShopifyOrders(accessToken, shopDomain, {
      limit: 250,
      sinceId,
      createdAtMin: since,
      createdAtMax: until,
      financialStatus: 'paid',
    });

    allOrders.push(...batch);
    if (batch.length < 250) break; // Last page
    sinceId = String(batch[batch.length - 1].id);
  }

  return allOrders;
}

/**
 * Parse landing_site URL for direct campaign/adset/ad IDs and UTM params.
 * OneScale URL tags format:
 *   utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}
 *   &utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}
 */
function resolveFromLandingSite(landingSite: string | null): {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  utmContent: string | null;
} {
  const empty = {
    campaignId: null,
    adSetId: null,
    adId: null,
    utmCampaign: null,
    utmMedium: null,
    utmContent: null,
  };

  if (!landingSite) return empty;

  try {
    // landing_site may be a full URL or just a path with query string
    const urlStr = landingSite.startsWith('http') ? landingSite : `https://example.com${landingSite}`;
    const params = new URL(urlStr).searchParams;

    return {
      campaignId: params.get('campaign_id') || null,
      adSetId: params.get('adset_id') || null,
      adId: params.get('ad_id') || null,
      utmCampaign: params.get('utm_campaign') || null,
      utmMedium: params.get('utm_medium') || null,
      utmContent: params.get('utm_content') || null,
    };
  } catch {
    return empty;
  }
}
