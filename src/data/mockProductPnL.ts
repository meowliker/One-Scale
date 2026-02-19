import type { ProductPnLData, ProductFBMetrics } from '@/types/productPnL';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Per-product FB metrics for products actively running ads
function adMetrics(
  spend: number,
  impressions: number,
  clicks: number,
  purchases: number,
  revenue: number,
): ProductFBMetrics {
  const reach = Math.round(impressions * 0.72);
  return {
    roas: spend > 0 ? round2(revenue / spend) : 0,
    cpc: clicks > 0 ? round2(spend / clicks) : 0,
    cpm: impressions > 0 ? round2((spend / impressions) * 1000) : 0,
    ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
    aov: purchases > 0 ? round2(revenue / purchases) : 0,
    atcRate: clicks > 0 ? round2((Math.round(clicks * 0.08) / clicks) * 100) : 0,
    spend: round2(spend),
    impressions,
    clicks,
    purchases,
    costPerPurchase: purchases > 0 ? round2(spend / purchases) : 0,
    frequency: reach > 0 ? round2(impressions / reach) : 0,
    reach,
  };
}

// Account-level fallback metrics for non-advertised products
const accountFallback: ProductFBMetrics = {
  roas: 2.48,
  cpc: 1.22,
  cpm: 18.35,
  ctr: 1.82,
  aov: 44.90,
  atcRate: 5.47,
  spend: 0,
  impressions: 0,
  clicks: 0,
  purchases: 0,
  costPerPurchase: 0,
  frequency: 0,
  reach: 0,
};

// Helper to build a product entry
function product(
  id: string,
  name: string,
  sku: string,
  unitsSold: number,
  pricePerUnit: number,
  cogsPercent: number,
  shippingPercent: number,
  feesPercent: number,
  adInfo?: {
    fbMetrics: ProductFBMetrics;
    adLandingPageUrl: string;
    adName: string;
    adSetName: string;
    campaignName: string;
  },
): ProductPnLData {
  const revenue = round2(unitsSold * pricePerUnit);
  const cogs = round2(revenue * cogsPercent);
  const shipping = round2(revenue * shippingPercent);
  const fees = round2(revenue * feesPercent);
  const netProfit = round2(revenue - cogs - shipping - fees);
  const margin = round2((netProfit / revenue) * 100);

  return {
    productId: id,
    productName: name,
    productImage: null,
    shopifyUrl: null,
    sku,
    unitsSold,
    revenue,
    cogs,
    shipping,
    fees,
    netProfit,
    margin,
    fbMetrics: adInfo?.fbMetrics ?? accountFallback,
    isAdvertised: !!adInfo,
    adLandingPageUrl: adInfo?.adLandingPageUrl ?? null,
    adName: adInfo?.adName ?? null,
    adSetName: adInfo?.adSetName ?? null,
    campaignName: adInfo?.campaignName ?? null,
  };
}

export const mockProductPnL: ProductPnLData[] = [
  // High margin hero product — ADVERTISED
  product(
    'prod_001',
    'Calm Mind Adaptogen Blend',
    'CM-ADAPT-60',
    142,
    42.00,
    0.28,
    0.05,
    0.03,
    {
      fbMetrics: adMetrics(687.50, 42_300, 812, 34, 142 * 42),
      adLandingPageUrl: 'https://towardscalm.com/products/calm-mind-adaptogen-blend',
      adName: 'Calm Mind - UGC Testimonial V3',
      adSetName: 'LAL - Purchasers 1% US',
      campaignName: 'Calm Mind - Prospecting CBO',
    },
  ),

  // Solid performer — ADVERTISED
  product(
    'prod_002',
    'Deep Sleep Magnesium Complex',
    'DS-MAG-90',
    118,
    38.00,
    0.30,
    0.05,
    0.03,
    {
      fbMetrics: adMetrics(524.30, 35_200, 645, 26, 118 * 38),
      adLandingPageUrl: 'https://towardscalm.com/products/deep-sleep-magnesium',
      adName: 'Deep Sleep - Before/After Carousel',
      adSetName: 'Interest - Sleep & Wellness',
      campaignName: 'Deep Sleep - Broad Targeting',
    },
  ),

  // Premium high-AOV product — ADVERTISED
  product(
    'prod_003',
    'Nirwanna Glow Serum',
    'NW-GLOW-30ML',
    67,
    68.00,
    0.32,
    0.04,
    0.03,
    {
      fbMetrics: adMetrics(412.80, 28_100, 498, 18, 67 * 68),
      adLandingPageUrl: 'https://nirwanna.com/products/glow-serum-30ml',
      adName: 'Glow Serum - Influencer Reel',
      adSetName: 'LAL - ATC 2% - Female 25-45',
      campaignName: 'Nirwanna Glow - Scale CBO',
    },
  ),

  // Budget entry product — ADVERTISED
  product(
    'prod_004',
    'Daily Zen Ashwagandha Caps',
    'DZ-ASH-120',
    203,
    22.00,
    0.34,
    0.06,
    0.03,
    {
      fbMetrics: adMetrics(318.90, 52_400, 1_024, 41, 203 * 22),
      adLandingPageUrl: 'https://towardscalm.com/products/daily-zen-ashwagandha',
      adName: 'Ashwagandha - Benefits Explainer',
      adSetName: 'Broad - US 18-65+',
      campaignName: 'Ashwagandha - Evergreen ABO',
    },
  ),

  // Mid-tier performer — ADVERTISED
  product(
    'prod_005',
    'Lavender Dream Body Oil',
    'LD-OIL-100ML',
    89,
    34.00,
    0.30,
    0.05,
    0.03,
    {
      fbMetrics: adMetrics(245.60, 18_900, 378, 15, 89 * 34),
      adLandingPageUrl: 'https://nirwanna.com/products/lavender-dream-body-oil',
      adName: 'Lavender Oil - Lifestyle Static',
      adSetName: 'Interest - Self-Care & Beauty',
      campaignName: 'Nirwanna Body Care - Testing',
    },
  ),

  // Low margin — ADVERTISED (poor performer)
  product(
    'prod_006',
    'Herbal Calm Tea Bundle (6-Pack)',
    'HC-TEA-6PK',
    54,
    28.00,
    0.40,
    0.09,
    0.03,
    {
      fbMetrics: adMetrics(198.40, 14_200, 256, 8, 54 * 28),
      adLandingPageUrl: 'https://towardscalm.com/products/herbal-calm-tea-bundle',
      adName: 'Tea Bundle - Cozy Evening UGC',
      adSetName: 'Retargeting - VV 75% 7d',
      campaignName: 'Tea Bundle - Retargeting',
    },
  ),

  // Negative margin — NOT ADVERTISED (clearance)
  product(
    'prod_007',
    'Travel Wellness Kit',
    'TW-KIT-MINI',
    31,
    18.00,
    0.48,
    0.10,
    0.04,
  ),

  // Strong mid-range — ADVERTISED
  product(
    'prod_008',
    'Collagen Peptides Powder',
    'CP-PWD-250G',
    96,
    54.00,
    0.29,
    0.05,
    0.03,
    {
      fbMetrics: adMetrics(389.20, 24_600, 492, 20, 96 * 54),
      adLandingPageUrl: 'https://nirwanna.com/products/collagen-peptides-powder',
      adName: 'Collagen - Science-Backed Results',
      adSetName: 'LAL - Purchasers 3% US',
      campaignName: 'Collagen - Prospecting ABO',
    },
  ),

  // Newer product — NOT ADVERTISED (not yet in ads)
  product(
    'prod_009',
    'Reishi Mushroom Tincture',
    'RM-TINCT-60ML',
    22,
    46.00,
    0.25,
    0.04,
    0.03,
  ),

  // Seasonal — NOT ADVERTISED
  product(
    'prod_010',
    'Eucalyptus Shower Steamers (3-Pack)',
    'ES-STEAM-3PK',
    47,
    16.00,
    0.36,
    0.07,
    0.03,
  ),
];

// Account-level FB metrics (for summary display)
export const mockAccountFBMetrics: ProductFBMetrics = {
  roas: 2.48,
  cpc: 1.22,
  cpm: 18.35,
  ctr: 1.82,
  aov: 44.90,
  atcRate: 5.47,
  spend: 2487.60,
  impressions: 139_420,
  clicks: 2538,
  purchases: 85,
  costPerPurchase: 29.27,
  frequency: 1.39,
  reach: 100_302,
};
