import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken, getStoreAdAccounts } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  hydrateStoreFromSupabase,
  rest,
  listPersistentStoreAdAccounts,
} from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta, mapInsightsToMetrics } from '@/app/api/lib/meta-client';

interface MainProduct {
  id: string;
  name: string;
}

interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  status: { status: string };
  date_created: string;
  url: string;
  list: { id: string; name: string };
  tags: Array<{ name: string }>;
  custom_fields: Array<{
    id: string;
    name: string;
    value?: string | number | boolean | null;
    type_config?: { options?: Array<{ id: string; name: string; orderindex: number }> };
  }>;
}

interface ClickUpCreative {
  id: string;
  taskId: string;
  name: string;
  productName: string;
  productId?: string;
  status: string;
  format: 'video' | 'image' | 'carousel';
  hook?: string;
  angle?: string;
  thumbnailUrl?: string;
  driveLink?: string;
  dateAdded: string;
  listName: string;
  listId: string;
}

interface TestingAd {
  id: string;
  adId: string;
  adName: string;
  creativeName: string;
  productName: string;
  productId?: string;
  campaignName: string;
  adsetName: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED';
  thumbnailUrl?: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  dayNumber: number;
  startDate: string;
  testStatus: 'running' | 'day3_review' | 'winner' | 'killed' | 'scaling';
}

function extractFieldValue(fields: ClickUpTask['custom_fields'], ...names: string[]): string {
  for (const name of names) {
    const field = fields.find((f) => f.name.toLowerCase().includes(name.toLowerCase()));
    if (field && field.value != null) {
      if (typeof field.value === 'string') return field.value;
      if (typeof field.value === 'number') {
        if (field.type_config?.options) {
          const opt = field.type_config.options.find((o) => o.orderindex === field.value);
          if (opt) return opt.name;
        }
        return String(field.value);
      }
    }
  }
  return '';
}

function detectFormat(fields: ClickUpTask['custom_fields'], name: string, tags: Array<{ name: string }>): 'video' | 'image' | 'carousel' {
  const fv = extractFieldValue(fields, 'format', 'type', 'creative type').toLowerCase();
  if (fv.includes('video')) return 'video';
  if (fv.includes('carousel')) return 'carousel';
  if (fv.includes('image') || fv.includes('static')) return 'image';
  for (const tag of tags) {
    const t = tag.name.toLowerCase();
    if (t.includes('video') || t.includes('ugc') || t.includes('reel')) return 'video';
    if (t.includes('carousel')) return 'carousel';
    if (t.includes('image') || t.includes('static')) return 'image';
  }
  const n = name.toLowerCase();
  if (n.includes('video') || n.includes('ugc') || n.includes('reel')) return 'video';
  if (n.includes('carousel')) return 'carousel';
  return 'image';
}

interface ListMapping {
  listId: string;
  listName: string;
  productId?: string;
  productName?: string;
}

async function fetchClickUpCreatives(
  token: string,
  listIds: string[],
  readyStatus: string,
  listMappings: ListMapping[]
): Promise<ClickUpCreative[]> {
  const params = new URLSearchParams({ include_closed: 'false', subtasks: 'true', page: '0' });
  params.append('statuses[]', readyStatus);

  const allTaskArrays = await Promise.all(
    listIds.map(async (listId) => {
      try {
        const res = await fetch(
          `https://api.clickup.com/api/v2/list/${listId}/task?${params.toString()}`,
          { headers: { Authorization: token } }
        );
        if (!res.ok) return [];
        const data = await res.json() as { tasks: ClickUpTask[] };
        return (data.tasks || []).map(t => ({ ...t, _listId: listId }));
      } catch {
        return [];
      }
    })
  );

  const seenIds = new Set<string>();
  const tasks: (ClickUpTask & { _listId: string })[] = [];
  for (const arr of allTaskArrays) {
    for (const t of arr) {
      if (!seenIds.has(t.id)) {
        seenIds.add(t.id);
        tasks.push(t);
      }
    }
  }

  return tasks.map((task) => {
    const hook = extractFieldValue(task.custom_fields, 'hook', 'headline');
    const angle = extractFieldValue(task.custom_fields, 'angle', 'concept', 'theme', 'strategy');
    const driveLink = extractFieldValue(task.custom_fields, 'drive', 'asset', 'link', 'file', 'url');
    const thumbnailUrl = extractFieldValue(task.custom_fields, 'thumbnail', 'preview', 'cover');
    const format = detectFormat(task.custom_fields, task.name, task.tags);

    // Get product name from list mapping first, then from custom field, then from list name
    const mapping = listMappings.find(m => m.listId === task._listId || m.listId === task.list.id);
    const productName = mapping?.productName || extractFieldValue(task.custom_fields, 'product', 'item') || task.list.name;

    return {
      id: task.id,
      taskId: task.id,
      name: task.name,
      productName,
      productId: mapping?.productId,
      status: task.status.status,
      format,
      hook: hook || undefined,
      angle: angle || undefined,
      thumbnailUrl: thumbnailUrl || undefined,
      driveLink: driveLink || task.url,
      dateAdded: new Date(parseInt(task.date_created)).toISOString().split('T')[0],
      listName: task.list.name,
      listId: task.list.id,
    };
  });
}

async function fetchTestingCreatives(
  token: string,
  listIds: string[],
  testingStatus: string,
  listMappings: ListMapping[]
): Promise<ClickUpCreative[]> {
  const params = new URLSearchParams({ include_closed: 'false', subtasks: 'true', page: '0' });
  params.append('statuses[]', testingStatus);

  const allTaskArrays = await Promise.all(
    listIds.map(async (listId) => {
      try {
        const res = await fetch(
          `https://api.clickup.com/api/v2/list/${listId}/task?${params.toString()}`,
          { headers: { Authorization: token } }
        );
        if (!res.ok) return [];
        const data = await res.json() as { tasks: ClickUpTask[] };
        return (data.tasks || []).map(t => ({ ...t, _listId: listId }));
      } catch {
        return [];
      }
    })
  );

  const seenIds = new Set<string>();
  const tasks: (ClickUpTask & { _listId: string })[] = [];
  for (const arr of allTaskArrays) {
    for (const t of arr) {
      if (!seenIds.has(t.id)) {
        seenIds.add(t.id);
        tasks.push(t);
      }
    }
  }

  return tasks.map((task) => {
    const hook = extractFieldValue(task.custom_fields, 'hook', 'headline');
    const angle = extractFieldValue(task.custom_fields, 'angle', 'concept', 'theme', 'strategy');
    const driveLink = extractFieldValue(task.custom_fields, 'drive', 'asset', 'link', 'file', 'url');
    const thumbnailUrl = extractFieldValue(task.custom_fields, 'thumbnail', 'preview', 'cover');
    const format = detectFormat(task.custom_fields, task.name, task.tags);

    // Get product name from list mapping first, then from custom field, then from list name
    const mapping = listMappings.find(m => m.listId === task._listId || m.listId === task.list.id);
    const productName = mapping?.productName || extractFieldValue(task.custom_fields, 'product', 'item') || task.list.name;

    return {
      id: task.id,
      taskId: task.id,
      name: task.name,
      productName,
      productId: mapping?.productId,
      status: task.status.status,
      format,
      hook: hook || undefined,
      angle: angle || undefined,
      thumbnailUrl: thumbnailUrl || undefined,
      driveLink: driveLink || task.url,
      dateAdded: new Date(parseInt(task.date_created)).toISOString().split('T')[0],
      listName: task.list.name,
      listId: task.list.id,
    };
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // Hydrate from Supabase if needed
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
  }

  const clickupRow = getThirdPartyToken(storeId, 'clickup');

  if (!clickupRow) {
    return NextResponse.json({
      readyToLaunch: [],
      currentlyTesting: [],
      summary: {
        totalReady: 0,
        totalTesting: 0,
        totalSpend: 0,
        avgRoas: 0,
        winners: 0,
        killed: 0,
      },
      notConnected: true,
      message: 'ClickUp not connected. Go to Settings → Integrations to connect.',
    });
  }

  const token = clickupRow.access_token;
  const meta = clickupRow.metadata ? JSON.parse(clickupRow.metadata) as {
    listId?: string;
    listIds?: string[];
    readyStatus?: string;
    testingStatus?: string;
    listMappings?: Array<{ listId: string; listName: string; productId?: string; productName?: string }>;
  } : {};

  const listIds: string[] = meta.listIds?.length ? meta.listIds : (meta.listId ? [meta.listId] : []);

  if (listIds.length === 0) {
    return NextResponse.json({
      readyToLaunch: [],
      currentlyTesting: [],
      summary: {
        totalReady: 0,
        totalTesting: 0,
        totalSpend: 0,
        avgRoas: 0,
        winners: 0,
        killed: 0,
      },
      notConfigured: true,
      message: 'ClickUp list not configured. Go to Settings → Integrations to set it up.',
    });
  }

  const readyStatus = meta.readyStatus || 'ready to launch';
  const testingStatus = meta.testingStatus || 'testing';
  const listMappings: ListMapping[] = meta.listMappings || [];

  try {
    // Fetch ClickUp creatives and Meta token in parallel for faster loading
    const [readyToLaunch, testingCreatives, metaToken] = await Promise.all([
      fetchClickUpCreatives(token, listIds, readyStatus, listMappings),
      fetchTestingCreatives(token, listIds, testingStatus, listMappings),
      getMetaToken(storeId),
    ]);

    // Fetch real Meta Ads data for testing performance
    let currentlyTesting: TestingAd[] = [];
    
    if (metaToken?.accessToken) {
      // Get ad accounts for this store
      const useSupabase = isSupabasePersistenceEnabled();
      const adAccounts = useSupabase
        ? await listPersistentStoreAdAccounts(storeId)
        : getStoreAdAccounts(storeId);
      
      const activeAccounts = adAccounts.filter(a => a.platform === 'meta' && a.is_active);
      
      if (activeAccounts.length > 0) {
        // Fetch ads with insights from all accounts (last 7 days for faster loading)
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const until = new Date().toISOString().split('T')[0];
        
        const allAdsPromises = activeAccounts.map(async (account) => {
          // Normalize ad account ID - remove act_ prefix if present to avoid duplication
          const accountId = account.ad_account_id.replace(/^act_/, '');
          
          try {
            
            // Fetch ads - limit to 50 for faster loading
            const response = await fetchFromMeta<{ data: Array<{
              id: string;
              name: string;
              status: string;
              effective_status: string;
              campaign: { id: string; name: string };
              adset: { id: string; name: string };
              creative?: { thumbnail_url?: string };
              created_time: string;
            }> }>(
              metaToken.accessToken,
              `/act_${accountId}/ads`,
              {
                fields: 'id,name,status,effective_status,campaign{id,name},adset{id,name},created_time',
                limit: '50',
                filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE'] }]),
              }
            );
            
            // Fetch insights at account level for all ads (more efficient)
            const adIds = response.data?.map(ad => ad.id) || [];
            if (adIds.length === 0) return [];
            
            const insightsMap = new Map<string, {
              spend: string;
              impressions: string;
              clicks: string;
              reach: string;
              actions?: Array<{ action_type: string; value: string }>;
              action_values?: Array<{ action_type: string; value: string }>;
            }>();
            
            // Fetch insights at account level with ad breakdown - limit fields for speed
            try {
              const insightsResponse = await fetchFromMeta<{ data: Array<{
                ad_id: string;
                spend: string;
                impressions: string;
                clicks: string;
                reach: string;
                actions?: Array<{ action_type: string; value: string }>;
                action_values?: Array<{ action_type: string; value: string }>;
              }> }>(
                metaToken.accessToken,
                `/act_${accountId}/insights`,
                {
                  fields: 'ad_id,spend,impressions,clicks,actions,action_values',
                  level: 'ad',
                  time_range: JSON.stringify({ since, until }),
                  limit: '100',
                  filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }]),
                }
              );
              
              // Build insights map from response
              for (const row of insightsResponse.data || []) {
                if (row.ad_id) {
                  const existing = insightsMap.get(row.ad_id);
                  if (existing) {
                    // Aggregate if multiple rows for same ad
                    existing.spend = String(parseFloat(existing.spend || '0') + parseFloat(row.spend || '0'));
                    existing.impressions = String(parseInt(existing.impressions || '0') + parseInt(row.impressions || '0'));
                    existing.clicks = String(parseInt(existing.clicks || '0') + parseInt(row.clicks || '0'));
                    // Merge actions arrays
                    if (row.actions) {
                      existing.actions = [...(existing.actions || []), ...row.actions];
                    }
                    if (row.action_values) {
                      existing.action_values = [...(existing.action_values || []), ...row.action_values];
                    }
                  } else {
                    insightsMap.set(row.ad_id, row);
                  }
                }
              }
            } catch (insightsErr) {
              console.error(`[Creative Launch] Failed to fetch insights for account act_${accountId}:`, insightsErr);
              // Continue without insights - ads will show with 0 metrics
            }
            
            return (response.data || []).map(ad => {
              const insights = insightsMap.get(ad.id);
              const metrics = insights ? mapInsightsToMetrics(insights) : null;
              
              const spend = metrics?.spend || 0;
              const impressions = metrics?.impressions || 0;
              const clicks = metrics?.clicks || 0;
              const purchases = metrics?.conversions || 0;
              const revenue = metrics?.revenue || 0;
              
              // Calculate day number from created_time
              const createdDate = new Date(ad.created_time);
              const dayNumber = Math.max(1, Math.ceil((Date.now() - createdDate.getTime()) / (24 * 60 * 60 * 1000)));
              
              // Determine test status based on actual performance data
              let testStatus: TestingAd['testStatus'] = 'running';
              const roas = spend > 0 ? revenue / spend : 0;
              
              // Only apply status rules if we have actual spend data
              if (spend > 0) {
                if (dayNumber >= 3 && dayNumber < 5) testStatus = 'day3_review';
                if (roas > 2.0 && spend > 50) testStatus = 'winner';
                if (roas < 0.5 && dayNumber >= 3 && spend > 30) testStatus = 'killed';
              }
              
              // Mark as killed only if paused AND has poor performance with actual spend
              if (ad.effective_status === 'PAUSED') {
                if (spend > 0 && roas < 1) {
                  testStatus = 'killed';
                } else if (spend === 0) {
                  // Paused with no spend - just mark as paused/running
                  testStatus = 'running';
                }
              }
              
              // Try to match to a product based on campaign/adset name
              let productName = ad.campaign?.name || 'Unknown';
              let productId: string | undefined;
              
              // Extract product from campaign name (e.g., "TOF | Kids Life Skills | Test")
              const campaignParts = ad.campaign?.name?.split('|').map(s => s.trim()) || [];
              if (campaignParts.length >= 2) {
                productName = campaignParts[1];
              }
              
              return {
                id: ad.id,
                adId: ad.id,
                adName: ad.name,
                creativeName: ad.name,
                productName,
                productId,
                campaignName: ad.campaign?.name || '',
                adsetName: ad.adset?.name || '',
                status: ad.effective_status as 'ACTIVE' | 'PAUSED' | 'DELETED',
                thumbnailUrl: ad.creative?.thumbnail_url,
                spend,
                impressions,
                clicks,
                ctr: impressions > 0 ? clicks / impressions : 0,
                cpc: clicks > 0 ? spend / clicks : 0,
                cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
                purchases,
                revenue,
                roas,
                cpa: purchases > 0 ? spend / purchases : 0,
                dayNumber,
                startDate: ad.created_time.split('T')[0],
                testStatus,
              };
            });
          } catch (err) {
            console.error(`[Creative Launch] Failed to fetch ads for account act_${accountId}:`, err);
            return [];
          }
        });
        
        const allAdsArrays = await Promise.all(allAdsPromises);
        currentlyTesting = allAdsArrays.flat();
      }
    }
    
    // If no Meta data, fall back to ClickUp testing creatives with placeholder data
    if (currentlyTesting.length === 0 && testingCreatives.length > 0) {
      currentlyTesting = testingCreatives.map((creative) => ({
        id: `test_${creative.id}`,
        adId: `clickup_${creative.id}`,
        adName: creative.name,
        creativeName: creative.name,
        productName: creative.productName,
        productId: creative.productId,
        campaignName: `Testing | ${creative.productName}`,
        adsetName: creative.listName,
        status: 'ACTIVE' as const,
        thumbnailUrl: creative.thumbnailUrl,
        spend: 0,
        impressions: 0,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        purchases: 0,
        revenue: 0,
        roas: 0,
        cpa: 0,
        dayNumber: 1,
        startDate: creative.dateAdded,
        testStatus: 'running' as const,
      }));
    }

    // Fetch main products from product_config (same source as P&L)
    let mainProducts: MainProduct[] = [];
    try {
      const enc = encodeURIComponent;
      const products = await rest<Array<{ product_id: string; product_name: string }>>(
        `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name&order=product_name.asc`
      );
      if (products && products.length > 0) {
        mainProducts = products.map((p) => ({ id: p.product_id, name: p.product_name }));
      }
    } catch {
      // Continue without products
    }

    // Calculate summary
    const totalSpend = currentlyTesting.reduce((sum, ad) => sum + ad.spend, 0);
    const totalRevenue = currentlyTesting.reduce((sum, ad) => sum + ad.revenue, 0);
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    const winners = currentlyTesting.filter((ad) => ad.testStatus === 'winner').length;
    const killed = currentlyTesting.filter((ad) => ad.testStatus === 'killed').length;

    // Build product-wise summaries
    // First, get mapped list IDs for each product
    const productListMap = new Map<string, string[]>();
    for (const mapping of listMappings) {
      if (mapping.productId) {
        const existing = productListMap.get(mapping.productId) || [];
        existing.push(mapping.listId);
        productListMap.set(mapping.productId, existing);
      }
    }

    // Helper function for fuzzy name matching
    const fuzzyMatch = (name1: string, name2: string): boolean => {
      const n1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '');
      const n2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '');
      // Check if one contains the other, or significant overlap
      if (n1.includes(n2) || n2.includes(n1)) return true;
      // Check for word overlap
      const words1 = name1.toLowerCase().split(/\s+/);
      const words2 = name2.toLowerCase().split(/\s+/);
      const commonWords = words1.filter(w => w.length > 3 && words2.some(w2 => w2.includes(w) || w.includes(w2)));
      return commonWords.length >= 1;
    };

    const productSummaries = mainProducts.map((product) => {
      // Get list IDs mapped to this product
      const mappedListIds = productListMap.get(product.id) || [];

      // Filter creatives for this product using:
      // 1. productId match (from listMappings)
      // 2. listId match (creative's list is mapped to this product)
      // 3. Fallback: fuzzy name-based matching on productName or listName
      const productReady = readyToLaunch.filter((c) => {
        // Direct productId match
        if (c.productId === product.id) return true;
        // List is mapped to this product
        if (c.listId && mappedListIds.includes(c.listId)) return true;
        // Fuzzy match on productName (from ClickUp custom field or list name)
        if (fuzzyMatch(c.productName, product.name)) return true;
        // Fuzzy match on listName
        if (fuzzyMatch(c.listName, product.name)) return true;
        return false;
      });

      const productTesting = currentlyTesting.filter((a) => {
        // Direct productId match (from creative)
        if (a.productId === product.id) return true;
        // Fuzzy match on productName
        if (fuzzyMatch(a.productName, product.name)) return true;
        return false;
      });

      const productSpend = productTesting.reduce((sum, ad) => sum + ad.spend, 0);
      const productRevenue = productTesting.reduce((sum, ad) => sum + ad.revenue, 0);

      return {
        productId: product.id,
        productName: product.name,
        readyCount: productReady.length,
        testingCount: productTesting.length,
        spend: productSpend,
        roas: productSpend > 0 ? productRevenue / productSpend : 0,
        winners: productTesting.filter((a) => a.testStatus === 'winner').length,
        killed: productTesting.filter((a) => a.testStatus === 'killed').length,
        readyToLaunch: productReady,
        currentlyTesting: productTesting,
      };
    });

    // Extract winning creatives for pre-population (top performers by ROAS)
    const winningCreatives = currentlyTesting
      .filter(ad => ad.testStatus === 'winner' || (ad.roas >= 1.5 && ad.spend >= 30))
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 10)
      .map(ad => ({
        adId: ad.adId,
        adName: ad.adName,
        productName: ad.productName,
        campaignName: ad.campaignName,
        adsetName: ad.adsetName,
        thumbnailUrl: ad.thumbnailUrl,
        roas: ad.roas,
        spend: ad.spend,
        revenue: ad.revenue,
      }));

    // Build winning texts/headlines per product for pre-population
    // This would ideally come from ad creative body/headline data
    const winningTexts = productSummaries.map(ps => {
      const productWinners = ps.currentlyTesting
        .filter(ad => ad.testStatus === 'winner' || ad.roas >= 1.5)
        .sort((a, b) => b.roas - a.roas);
      
      return {
        productId: ps.productId,
        productName: ps.productName,
        topPerformingAds: productWinners.slice(0, 3).map(ad => ({
          adName: ad.adName,
          roas: ad.roas,
          spend: ad.spend,
        })),
      };
    }).filter(p => p.topPerformingAds.length > 0);

    return NextResponse.json({
      readyToLaunch,
      currentlyTesting,
      mainProducts,
      productSummaries,
      winningCreatives,
      winningTexts,
      summary: {
        totalReady: readyToLaunch.length,
        totalTesting: currentlyTesting.length,
        totalSpend,
        avgRoas,
        winners,
        killed,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch dashboard data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
