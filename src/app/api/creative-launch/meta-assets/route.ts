import { NextRequest, NextResponse } from 'next/server';
import { getStoreAdAccounts, getLatestMetaEndpointSnapshot } from '@/app/api/lib/db';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';

interface WinnerCopy {
  id: string;
  primaryText: string;
  headline: string;
  cta: string;
  roas: number;
  spend: number;
}

interface WinningTargeting {
  ageMin: number;
  ageMax: number;
  genders: number[];
  locations: string[];
  interests: Array<{ id: string; name: string }>;
  source: string;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
}

interface MetaAdset {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  daily_budget?: string;
  lifetime_budget?: string;
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: { countries?: string[] };
    flexible_spec?: Array<{ interests?: Array<{ id: string; name: string }> }>;
  };
}

interface MetaPage {
  id: string;
  name: string;
  instagram_business_account?: { id: string; username: string };
}

interface MetaPixel {
  id: string;
  name: string;
}

interface MetaInsights {
  spend: string;
  purchase_roas?: Array<{ value: string }>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const adAccountId = searchParams.get('adAccountId') || '';
  const productName = searchParams.get('productName') || '';
  const refresh = searchParams.get('refresh') === 'true';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const metaToken = await getMetaToken(storeId);
  if (!metaToken?.accessToken) {
    return NextResponse.json({ error: 'Meta not connected' }, { status: 400 });
  }

  const adAccounts = getStoreAdAccounts(storeId);
  const activeAccounts = adAccounts.filter(a => a.platform === 'meta' && a.is_active);

  if (activeAccounts.length === 0) {
    return NextResponse.json({ error: 'No active Meta ad accounts' }, { status: 400 });
  }

  // Use specified account or first active account
  const targetAccountId = adAccountId || activeAccounts[0].ad_account_id;
  const normalizedAccountId = targetAccountId.replace(/^act_/, '');

  try {
    // Fetch fresh data from Meta API - campaigns and pages first (most important)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const until = new Date().toISOString().split('T')[0];

    // Fetch campaigns and pages first (essential), pixels separately (optional)
    const [campaignsRes, pagesRes] = await Promise.all([
      // Fetch campaigns
      fetchFromMeta<{ data: MetaCampaign[] }>(
        metaToken.accessToken,
        `/act_${normalizedAccountId}/campaigns`,
        {
          fields: 'id,name,status,objective,daily_budget,lifetime_budget,created_time',
          limit: '100',
          filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
        }
      ).catch(err => {
        console.warn('[Meta Assets] Failed to fetch campaigns:', err.message);
        return { data: [] as MetaCampaign[] };
      }),
      // Fetch pages
      fetchFromMeta<{ data: MetaPage[] }>(
        metaToken.accessToken,
        '/me/accounts',
        { fields: 'id,name,instagram_business_account{id,username}' }
      ).catch(err => {
        console.warn('[Meta Assets] Failed to fetch pages:', err.message);
        return { data: [] as MetaPage[] };
      }),
    ]);

    // Fetch pixels separately - this often gets rate limited, so make it optional
    let pixels: MetaPixel[] = [];
    try {
      const pixelsRes = await fetchFromMeta<{ data: MetaPixel[] }>(
        metaToken.accessToken,
        `/act_${normalizedAccountId}/adspixels`,
        { fields: 'id,name' }
      );
      pixels = pixelsRes.data || [];
    } catch (err) {
      console.warn('[Meta Assets] Failed to fetch pixels (rate limited?):', err instanceof Error ? err.message : 'Unknown error');
      // Continue without pixels - they're not essential for launching
    }

    const campaigns = campaignsRes.data || [];
    const pages = pagesRes.data || [];

    // Fetch ALL adsets (not just for active campaigns) so we can show adsets for any selected campaign
    let adsets: MetaAdset[] = [];

    if (campaigns.length > 0) {
      try {
        const adsetsRes = await fetchFromMeta<{ data: MetaAdset[] }>(
          metaToken.accessToken,
          `/act_${normalizedAccountId}/adsets`,
          {
            fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,targeting',
            limit: '500',
            filtering: JSON.stringify([
              { field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] },
            ]),
          }
        );
        adsets = adsetsRes.data || [];
      } catch (err) {
        console.warn('[Meta Assets] Failed to fetch adsets:', err instanceof Error ? err.message : 'Unknown error');
      }
    }

    // Fetch insights for campaigns (last 30 days)
    const campaignInsightsMap = new Map<string, { spend: number; roas: number }>();
    if (campaigns.length > 0) {
      try {
        const insightsRes = await fetchFromMeta<{ data: Array<{ campaign_id: string } & MetaInsights> }>(
          metaToken.accessToken,
          `/act_${normalizedAccountId}/insights`,
          {
            fields: 'campaign_id,spend,purchase_roas',
            level: 'campaign',
            time_range: JSON.stringify({ since, until }),
            limit: '100',
          }
        );

        for (const row of insightsRes.data || []) {
          const spend = parseFloat(row.spend || '0');
          const roas = parseFloat(row.purchase_roas?.[0]?.value || '0');
          campaignInsightsMap.set(row.campaign_id, { spend, roas });
        }
      } catch (e) {
        console.error('[Meta Assets] Failed to fetch campaign insights:', e);
      }
    }

    // Extract winner copy from cached ad data - Top 5 by ROAS ranking (no minimum thresholds)
    const winnerCopy: WinnerCopy[] = [];
    try {
      const adsSnapshot = getLatestMetaEndpointSnapshot(storeId, 'ads', '');
      if (adsSnapshot?.data && Array.isArray(adsSnapshot.data)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allAdsWithCopy: WinnerCopy[] = [];
        
        for (const ad of adsSnapshot.data as any[]) {
          const roas = parseFloat(ad.metrics?.roas ?? ad.metrics?.purchase_roas ?? '0');
          const spend = parseFloat(ad.metrics?.spend ?? '0');

          const creative = ad.creative?.body || ad.name || '';
          const headline = ad.creative?.title || ad.creative?.headline || '';
          
          // Only skip if there's no copy at all
          if (!creative && !headline) continue;

          allAdsWithCopy.push({
            id: ad.id,
            primaryText: creative,
            headline: headline || creative.split('\n')[0] || '',
            cta: ad.creative?.call_to_action?.type || 'SHOP_NOW',
            roas: Math.round(roas * 100) / 100,
            spend: Math.round(spend),
          });
        }
        
        // Sort by ROAS descending and take Top 5
        allAdsWithCopy.sort((a, b) => b.roas - a.roas);
        winnerCopy.push(...allAdsWithCopy.slice(0, 5));
      }
    } catch (err) {
      console.warn('[Meta Assets] Failed to extract winner copy:', err);
    }

    // Extract winning targeting from best performing adsets
    let winningTargeting: WinningTargeting | null = null;
    if (adsets.length > 0 && campaignInsightsMap.size > 0) {
      // Find adsets from campaigns with best ROAS
      const sortedCampaigns = [...campaignInsightsMap.entries()]
        .filter(([, data]) => data.roas > 1.0 && data.spend > 50)
        .sort((a, b) => b[1].roas - a[1].roas);

      for (const [campaignId] of sortedCampaigns) {
        const campaignAdsets = adsets.filter(a => a.campaign_id === campaignId && a.targeting);
        if (campaignAdsets.length > 0) {
          const bestAdset = campaignAdsets[0];
          const t = bestAdset.targeting;
          if (t) {
            winningTargeting = {
              ageMin: t.age_min || 18,
              ageMax: t.age_max || 65,
              genders: t.genders || [],
              locations: t.geo_locations?.countries || ['US'],
              interests: t.flexible_spec?.[0]?.interests || [],
              source: `From "${bestAdset.name}" (best performing)`,
            };
            break;
          }
        }
      }
    }

    // Return ALL campaigns - no filtering by product name
    // User wants to see all campaigns from the ad account
    return NextResponse.json({
      campaigns: campaigns.map(c => {
        const insights = campaignInsightsMap.get(c.id);
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          objective: c.objective,
          dailyBudget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : null,
          lifetimeBudget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
          spend30d: insights?.spend || 0,
          roas30d: insights?.roas || 0,
        };
      }),
      adsets: adsets.map(a => ({
        id: a.id,
        name: a.name,
        campaignId: a.campaign_id,
        status: a.status,
        dailyBudget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : null,
        targeting: a.targeting,
      })),
      pages: pages.map(p => ({
        id: p.id,
        name: p.name,
        instagramId: p.instagram_business_account?.id || null,
        instagramUsername: p.instagram_business_account?.username || null,
      })),
      pixels: pixels.map(p => ({
        id: p.id,
        name: p.name,
      })),
      adAccounts: activeAccounts.map(a => ({
        id: a.ad_account_id,
        name: a.ad_account_name,
      })),
      winnerCopy,
      winningTargeting,
      cached: false,
    });
  } catch (error) {
    console.error('[Meta Assets] Error fetching from Meta:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch Meta assets' },
      { status: 500 }
    );
  }
}
