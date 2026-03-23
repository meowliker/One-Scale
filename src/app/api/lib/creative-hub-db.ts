import { getDb } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import type {
  ProductProfile,
  ProductCampaignLink,
  CreativeTest,
  CreativeTestItem,
  TestAdCopy,
  WinningCopy,
  FatigueAlert,
} from '@/types/creativeHub';

// ── Supabase REST helper ──

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function supaRest<T>(
  path: string,
  options?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: options?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
      ...options?.headers,
    },
    body: options?.body,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : ([] as unknown as T);
}

// ── Row types (snake_case DB rows) ──

interface ProductProfileRow {
  id: string;
  store_id: string;
  shopify_product_id: string | null;
  product_name: string;
  product_image: string | null;
  ad_account_id: string;
  ad_account_currency: string;
  page_id: string | null;
  instagram_actor_id: string | null;
  instagram_username: string | null;
  pixel_id: string | null;
  conversion_event: string;
  destination_url: string | null;
  utm_template: string | null;
  average_order_value: number | null;
  default_budget: number;
  default_duration: number;
  default_bid_strategy: string;
  default_bid_amount: number | null;
  default_roas_floor: number | null;
  default_structure: string;
  default_launch_status: string;
  naming_template_json: string | null;
  targeting_presets_json: string | null;
  clickup_list_id: string | null;
  clickup_list_name: string | null;
  clickup_sync_interval: number;
  ai_min_spend: number | null;
  ai_min_impressions: number;
  ai_min_hours: number;
  ai_eval_frequency: string;
  created_at: string;
  updated_at: string;
}

interface ProductCampaignLinkRow {
  id: string;
  product_profile_id: string;
  campaign_id: string;
  campaign_name: string | null;
  campaign_type: string;
  ad_account_id: string;
  page_id: string | null;
  page_name: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  instagram_actor_id: string | null;
  instagram_username: string | null;
  bm_id: string | null;
  bm_name: string | null;
  is_active: number | boolean;
  linked_at: string;
}

interface CreativeTestRow {
  id: string;
  store_id: string;
  product_profile_id: string;
  campaign_id: string;
  campaign_name: string | null;
  campaign_mode: string;
  adset_mode: string;
  structure: string;
  bid_strategy: string | null;
  bid_amount: number | null;
  roas_floor: number | null;
  daily_budget: number | null;
  test_duration: number | null;
  launch_status: string | null;
  status: string;
  launched_by: string | null;
  launched_at: string | null;
  completed_at: string | null;
  total_spend: number;
  winner_creative_id: string | null;
  created_at: string;
}

interface CreativeTestItemRow {
  id: string;
  creative_test_id: string;
  clickup_task_id: string | null;
  clickup_task_name: string | null;
  creative_name: string;
  creative_format: string | null;
  hook: string | null;
  angle: string | null;
  drive_url: string | null;
  thumbnail_url: string | null;
  meta_asset_id: string | null;
  meta_asset_type: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  meta_creative_id: string | null;
  upload_status: string;
  launch_status: string;
  review_status: string | null;
  review_feedback: string | null;
  learning_phase: string | null;
  test_status: string;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number | null;
  ctr: number | null;
  purchases: number;
  impressions: number;
  ai_recommendation: string | null;
  ai_reasoning: string | null;
  created_at: string;
}

interface TestAdCopyRow {
  id: string;
  creative_test_id: string;
  copy_type: string;
  copy_text: string;
  source: string | null;
  source_copy_id: string | null;
  position: number | null;
}

interface CopyLibraryRow {
  id: string;
  product_profile_id: string;
  primary_text: string;
  headline: string | null;
  description: string | null;
  cta: string | null;
  source_ad_id: string | null;
  source_test_id: string | null;
  roas: number | null;
  cpa: number | null;
  ctr: number | null;
  total_spend: number | null;
  total_revenue: number | null;
  total_purchases: number | null;
  is_ai_generated: number | boolean;
  created_at: string;
}

interface FatigueAlertRow {
  id: string;
  product_profile_id: string;
  product_name: string | null;
  ad_id: string;
  creative_name: string | null;
  campaign_id: string | null;
  ctr_trend: string | null;
  cpa_trend: string | null;
  frequency_trend: string | null;
  alert_type: string | null;
  status: string;
  snoozed_until: string | null;
  created_at: string;
}

// ── Mapping helpers ──

function mapProfileRow(row: ProductProfileRow): ProductProfile {
  return {
    id: row.id,
    storeId: row.store_id,
    shopifyProductId: row.shopify_product_id ?? undefined,
    productName: row.product_name,
    productImage: row.product_image ?? undefined,
    adAccountId: row.ad_account_id,
    adAccountCurrency: row.ad_account_currency,
    pageId: row.page_id ?? undefined,
    instagramActorId: row.instagram_actor_id ?? undefined,
    instagramUsername: row.instagram_username ?? undefined,
    pixelId: row.pixel_id ?? undefined,
    conversionEvent: row.conversion_event,
    destinationUrl: row.destination_url ?? undefined,
    utmTemplate: row.utm_template ?? undefined,
    averageOrderValue: row.average_order_value ?? undefined,
    defaultBudget: row.default_budget,
    defaultDuration: row.default_duration,
    defaultBidStrategy: row.default_bid_strategy as ProductProfile['defaultBidStrategy'],
    defaultBidAmount: row.default_bid_amount ?? undefined,
    defaultRoasFloor: row.default_roas_floor ?? undefined,
    defaultStructure: row.default_structure as 'ABO' | 'CBO',
    defaultLaunchStatus: row.default_launch_status as 'ACTIVE' | 'PAUSED',
    namingTemplate: row.naming_template_json ? JSON.parse(row.naming_template_json) : undefined,
    targetingPresets: row.targeting_presets_json ? JSON.parse(row.targeting_presets_json) : undefined,
    clickupListId: row.clickup_list_id ?? undefined,
    clickupListName: row.clickup_list_name ?? undefined,
    clickupSyncInterval: row.clickup_sync_interval,
    aiMinSpend: row.ai_min_spend ?? undefined,
    aiMinImpressions: row.ai_min_impressions,
    aiMinHours: row.ai_min_hours,
    aiEvalFrequency: row.ai_eval_frequency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCampaignLinkRow(row: ProductCampaignLinkRow): ProductCampaignLink {
  return {
    id: row.id,
    productProfileId: row.product_profile_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? '',
    campaignType: row.campaign_type as ProductCampaignLink['campaignType'],
    adAccountId: row.ad_account_id,
    pageId: row.page_id ?? undefined,
    pageName: row.page_name ?? undefined,
    pixelId: row.pixel_id ?? undefined,
    pixelName: row.pixel_name ?? undefined,
    instagramActorId: row.instagram_actor_id ?? undefined,
    instagramUsername: row.instagram_username ?? undefined,
    bmId: row.bm_id ?? undefined,
    bmName: row.bm_name ?? undefined,
    isActive: row.is_active === 1 || row.is_active === true,
    linkedAt: row.linked_at,
  };
}

function mapTestRow(row: CreativeTestRow): Omit<CreativeTest, 'items' | 'adCopy'> {
  return {
    id: row.id,
    storeId: row.store_id,
    productProfileId: row.product_profile_id,
    productName: '', // populated from join or profile lookup
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? '',
    campaignMode: row.campaign_mode as CreativeTest['campaignMode'],
    adsetMode: row.adset_mode as CreativeTest['adsetMode'],
    structure: row.structure as 'ABO' | 'CBO',
    bidStrategy: row.bid_strategy as CreativeTest['bidStrategy'],
    bidAmount: row.bid_amount ?? undefined,
    roasFloor: row.roas_floor ?? undefined,
    dailyBudget: row.daily_budget ?? 0,
    testDuration: row.test_duration ?? 0,
    launchStatus: row.launch_status ?? '',
    status: row.status as CreativeTest['status'],
    launchedBy: row.launched_by ?? '',
    launchedAt: row.launched_at ?? '',
    completedAt: row.completed_at ?? undefined,
    totalSpend: row.total_spend,
    winnerCreativeId: row.winner_creative_id ?? undefined,
  };
}

function mapTestItemRow(row: CreativeTestItemRow): CreativeTestItem {
  return {
    id: row.id,
    creativeTestId: row.creative_test_id,
    clickupTaskId: row.clickup_task_id ?? undefined,
    clickupTaskName: row.clickup_task_name ?? undefined,
    creativeName: row.creative_name,
    creativeFormat: (row.creative_format ?? 'image') as CreativeTestItem['creativeFormat'],
    hook: row.hook ?? undefined,
    angle: row.angle ?? undefined,
    driveUrl: row.drive_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    metaAssetId: row.meta_asset_id ?? undefined,
    metaAssetType: row.meta_asset_type ?? undefined,
    metaAdsetId: row.meta_adset_id ?? undefined,
    metaAdId: row.meta_ad_id ?? undefined,
    metaCreativeId: row.meta_creative_id ?? undefined,
    uploadStatus: row.upload_status as CreativeTestItem['uploadStatus'],
    launchStatus: row.launch_status as CreativeTestItem['launchStatus'],
    reviewStatus: row.review_status as CreativeTestItem['reviewStatus'],
    reviewFeedback: row.review_feedback ?? undefined,
    learningPhase: row.learning_phase as CreativeTestItem['learningPhase'],
    testStatus: row.test_status as CreativeTestItem['testStatus'],
    spend: row.spend,
    revenue: row.revenue,
    roas: row.roas,
    cpa: row.cpa ?? undefined,
    ctr: row.ctr ?? undefined,
    purchases: row.purchases,
    impressions: row.impressions,
    aiRecommendation: row.ai_recommendation as CreativeTestItem['aiRecommendation'],
    aiReasoning: row.ai_reasoning ?? undefined,
  };
}

function mapAdCopyRow(row: TestAdCopyRow): TestAdCopy {
  return {
    id: row.id,
    creativeTestId: row.creative_test_id,
    copyType: row.copy_type as TestAdCopy['copyType'],
    copyText: row.copy_text,
    source: (row.source ?? 'manual') as TestAdCopy['source'],
    sourceCopyId: row.source_copy_id ?? undefined,
    position: row.position ?? 0,
  };
}

function mapCopyLibraryRow(row: CopyLibraryRow): WinningCopy {
  return {
    id: row.id,
    productProfileId: row.product_profile_id,
    primaryText: row.primary_text,
    headline: row.headline ?? undefined,
    description: row.description ?? undefined,
    cta: row.cta ?? undefined,
    sourceAdId: row.source_ad_id ?? undefined,
    sourceTestId: row.source_test_id ?? undefined,
    roas: row.roas ?? 0,
    cpa: row.cpa ?? undefined,
    ctr: row.ctr ?? undefined,
    totalSpend: row.total_spend ?? 0,
    totalRevenue: row.total_revenue ?? 0,
    totalPurchases: row.total_purchases ?? 0,
    isAiGenerated: row.is_ai_generated === 1 || row.is_ai_generated === true,
    createdAt: row.created_at,
  };
}

function mapFatigueAlertRow(row: FatigueAlertRow): FatigueAlert {
  return {
    id: row.id,
    productProfileId: row.product_profile_id,
    productName: row.product_name ?? '',
    adId: row.ad_id,
    creativeName: row.creative_name ?? '',
    campaignId: row.campaign_id ?? '',
    ctrTrend: row.ctr_trend ? JSON.parse(row.ctr_trend) : [],
    cpaTrend: row.cpa_trend ? JSON.parse(row.cpa_trend) : [],
    frequencyTrend: row.frequency_trend ? JSON.parse(row.frequency_trend) : [],
    alertType: (row.alert_type ?? 'fatigue') as FatigueAlert['alertType'],
    status: row.status as FatigueAlert['status'],
    snoozedUntil: row.snoozed_until ?? undefined,
    createdAt: row.created_at,
  };
}

// ── Local SQLite helpers (fallback) ──

function getProductProfilesLocal(storeId: string): ProductProfile[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM product_profiles WHERE store_id = ? ORDER BY updated_at DESC'
  ).all(storeId) as ProductProfileRow[];
  return rows.map(mapProfileRow);
}

function getProductProfileLocal(id: string): ProductProfile | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM product_profiles WHERE id = ?'
  ).get(id) as ProductProfileRow | undefined;
  return row ? mapProfileRow(row) : null;
}

function upsertProductProfileLocal(profile: Partial<ProductProfile> & { id: string; storeId: string; productName: string; adAccountId: string }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO product_profiles (
      id, store_id, shopify_product_id, product_name, product_image,
      ad_account_id, ad_account_currency, page_id, instagram_actor_id, instagram_username, pixel_id,
      conversion_event, destination_url, utm_template, average_order_value,
      default_budget, default_duration, default_bid_strategy, default_bid_amount,
      default_roas_floor, default_structure, default_launch_status,
      naming_template_json, targeting_presets_json,
      clickup_list_id, clickup_list_name, clickup_sync_interval,
      ai_min_spend, ai_min_impressions, ai_min_hours, ai_eval_frequency,
      updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      shopify_product_id = excluded.shopify_product_id,
      product_name = excluded.product_name,
      product_image = excluded.product_image,
      ad_account_id = excluded.ad_account_id,
      ad_account_currency = excluded.ad_account_currency,
      page_id = excluded.page_id,
      instagram_actor_id = excluded.instagram_actor_id,
      instagram_username = excluded.instagram_username,
      pixel_id = excluded.pixel_id,
      conversion_event = excluded.conversion_event,
      destination_url = excluded.destination_url,
      utm_template = excluded.utm_template,
      average_order_value = excluded.average_order_value,
      default_budget = excluded.default_budget,
      default_duration = excluded.default_duration,
      default_bid_strategy = excluded.default_bid_strategy,
      default_bid_amount = excluded.default_bid_amount,
      default_roas_floor = excluded.default_roas_floor,
      default_structure = excluded.default_structure,
      default_launch_status = excluded.default_launch_status,
      naming_template_json = excluded.naming_template_json,
      targeting_presets_json = excluded.targeting_presets_json,
      clickup_list_id = excluded.clickup_list_id,
      clickup_list_name = excluded.clickup_list_name,
      clickup_sync_interval = excluded.clickup_sync_interval,
      ai_min_spend = excluded.ai_min_spend,
      ai_min_impressions = excluded.ai_min_impressions,
      ai_min_hours = excluded.ai_min_hours,
      ai_eval_frequency = excluded.ai_eval_frequency,
      updated_at = datetime('now')
  `).run(
    profile.id,
    profile.storeId,
    profile.shopifyProductId ?? null,
    profile.productName,
    profile.productImage ?? null,
    profile.adAccountId,
    profile.adAccountCurrency ?? 'USD',
    profile.pageId ?? null,
    profile.instagramActorId ?? null,
    profile.instagramUsername ?? null,
    profile.pixelId ?? null,
    profile.conversionEvent ?? 'PURCHASE',
    profile.destinationUrl ?? null,
    profile.utmTemplate ?? null,
    profile.averageOrderValue ?? null,
    profile.defaultBudget ?? 20,
    profile.defaultDuration ?? 3,
    profile.defaultBidStrategy ?? 'LOWEST_COST_WITHOUT_CAP',
    profile.defaultBidAmount ?? null,
    profile.defaultRoasFloor ?? null,
    profile.defaultStructure ?? 'ABO',
    profile.defaultLaunchStatus ?? 'ACTIVE',
    profile.namingTemplate ? JSON.stringify(profile.namingTemplate) : null,
    profile.targetingPresets ? JSON.stringify(profile.targetingPresets) : null,
    profile.clickupListId ?? null,
    profile.clickupListName ?? null,
    profile.clickupSyncInterval ?? 30,
    profile.aiMinSpend ?? null,
    profile.aiMinImpressions ?? 500,
    profile.aiMinHours ?? 24,
    profile.aiEvalFrequency ?? 'every_6h',
  );
}

function deleteProductProfileLocal(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM product_profiles WHERE id = ?').run(id);
}

function getProductCampaignLinksLocal(profileId: string): ProductCampaignLink[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM product_campaign_links WHERE product_profile_id = ? ORDER BY linked_at DESC'
  ).all(profileId) as ProductCampaignLinkRow[];
  return rows.map(mapCampaignLinkRow);
}

function upsertProductCampaignLinkLocal(link: Partial<ProductCampaignLink> & { id: string; productProfileId: string; campaignId: string; campaignType: string; adAccountId: string }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO product_campaign_links (
      id, product_profile_id, campaign_id, campaign_name, campaign_type, ad_account_id,
      page_id, page_name, pixel_id, pixel_name,
      instagram_actor_id, instagram_username, bm_id, bm_name,
      is_active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      campaign_name = excluded.campaign_name,
      campaign_type = excluded.campaign_type,
      ad_account_id = excluded.ad_account_id,
      page_id = excluded.page_id,
      page_name = excluded.page_name,
      pixel_id = excluded.pixel_id,
      pixel_name = excluded.pixel_name,
      instagram_actor_id = excluded.instagram_actor_id,
      instagram_username = excluded.instagram_username,
      bm_id = excluded.bm_id,
      bm_name = excluded.bm_name,
      is_active = excluded.is_active
  `).run(
    link.id,
    link.productProfileId,
    link.campaignId,
    link.campaignName ?? null,
    link.campaignType,
    link.adAccountId,
    link.pageId ?? null,
    link.pageName ?? null,
    link.pixelId ?? null,
    link.pixelName ?? null,
    link.instagramActorId ?? null,
    link.instagramUsername ?? null,
    link.bmId ?? null,
    link.bmName ?? null,
    link.isActive !== false ? 1 : 0,
  );
}

function getCreativeTestsLocal(storeId: string, status?: string): CreativeTest[] {
  const db = getDb();

  const query = status
    ? 'SELECT ct.*, pp.product_name FROM creative_tests ct LEFT JOIN product_profiles pp ON pp.id = ct.product_profile_id WHERE ct.store_id = ? AND ct.status = ? ORDER BY ct.created_at DESC'
    : 'SELECT ct.*, pp.product_name FROM creative_tests ct LEFT JOIN product_profiles pp ON pp.id = ct.product_profile_id WHERE ct.store_id = ? ORDER BY ct.created_at DESC';

  const rows = status
    ? db.prepare(query).all(storeId, status) as (CreativeTestRow & { product_name: string })[]
    : db.prepare(query).all(storeId) as (CreativeTestRow & { product_name: string })[];

  return rows.map((row) => {
    const test = mapTestRow(row);
    const items = db.prepare(
      'SELECT * FROM creative_test_items WHERE creative_test_id = ? ORDER BY created_at ASC'
    ).all(row.id) as CreativeTestItemRow[];
    const adCopy = db.prepare(
      'SELECT * FROM test_ad_copy WHERE creative_test_id = ? ORDER BY position ASC'
    ).all(row.id) as TestAdCopyRow[];

    return {
      ...test,
      productName: row.product_name ?? '',
      items: items.map(mapTestItemRow),
      adCopy: adCopy.map(mapAdCopyRow),
    };
  });
}

function getCreativeTestLocal(id: string): CreativeTest | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT ct.*, pp.product_name FROM creative_tests ct LEFT JOIN product_profiles pp ON pp.id = ct.product_profile_id WHERE ct.id = ?'
  ).get(id) as (CreativeTestRow & { product_name: string }) | undefined;
  if (!row) return null;

  const test = mapTestRow(row);
  const items = db.prepare(
    'SELECT * FROM creative_test_items WHERE creative_test_id = ? ORDER BY created_at ASC'
  ).all(id) as CreativeTestItemRow[];
  const adCopy = db.prepare(
    'SELECT * FROM test_ad_copy WHERE creative_test_id = ? ORDER BY position ASC'
  ).all(id) as TestAdCopyRow[];

  return {
    ...test,
    productName: row.product_name ?? '',
    items: items.map(mapTestItemRow),
    adCopy: adCopy.map(mapAdCopyRow),
  };
}

function createCreativeTestLocal(test: {
  id: string;
  storeId: string;
  productProfileId: string;
  campaignId: string;
  campaignName?: string;
  campaignMode: string;
  adsetMode: string;
  structure: string;
  bidStrategy?: string;
  bidAmount?: number;
  roasFloor?: number;
  dailyBudget?: number;
  testDuration?: number;
  launchStatus?: string;
  status?: string;
  launchedBy?: string;
  launchedAt?: string;
  items: Array<{
    id: string;
    clickupTaskId?: string;
    clickupTaskName?: string;
    creativeName: string;
    creativeFormat?: string;
    hook?: string;
    angle?: string;
    driveUrl?: string;
    thumbnailUrl?: string;
    metaAssetId?: string;
    metaAssetType?: string;
  }>;
  adCopy: Array<{
    id: string;
    copyType: string;
    copyText: string;
    source?: string;
    sourceCopyId?: string;
    position?: number;
  }>;
}): void {
  const db = getDb();

  const insertTest = db.prepare(`
    INSERT INTO creative_tests (
      id, store_id, product_profile_id, campaign_id, campaign_name,
      campaign_mode, adset_mode, structure, bid_strategy, bid_amount,
      roas_floor, daily_budget, test_duration, launch_status, status,
      launched_by, launched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO creative_test_items (
      id, creative_test_id, clickup_task_id, clickup_task_name,
      creative_name, creative_format, hook, angle,
      drive_url, thumbnail_url, meta_asset_id, meta_asset_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCopy = db.prepare(`
    INSERT INTO test_ad_copy (
      id, creative_test_id, copy_type, copy_text, source, source_copy_id, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertTest.run(
      test.id,
      test.storeId,
      test.productProfileId,
      test.campaignId,
      test.campaignName ?? null,
      test.campaignMode,
      test.adsetMode,
      test.structure,
      test.bidStrategy ?? null,
      test.bidAmount ?? null,
      test.roasFloor ?? null,
      test.dailyBudget ?? null,
      test.testDuration ?? null,
      test.launchStatus ?? null,
      test.status ?? 'launching',
      test.launchedBy ?? null,
      test.launchedAt ?? null,
    );

    for (const item of test.items) {
      insertItem.run(
        item.id,
        test.id,
        item.clickupTaskId ?? null,
        item.clickupTaskName ?? null,
        item.creativeName,
        item.creativeFormat ?? null,
        item.hook ?? null,
        item.angle ?? null,
        item.driveUrl ?? null,
        item.thumbnailUrl ?? null,
        item.metaAssetId ?? null,
        item.metaAssetType ?? null,
      );
    }

    for (const copy of test.adCopy) {
      insertCopy.run(
        copy.id,
        test.id,
        copy.copyType,
        copy.copyText,
        copy.source ?? null,
        copy.sourceCopyId ?? null,
        copy.position ?? 0,
      );
    }
  });

  transaction();
}

function updateCreativeTestStatusLocal(id: string, status: string): void {
  const db = getDb();
  const completedAt = (status === 'completed' || status === 'failed') ? new Date().toISOString() : null;
  db.prepare(
    'UPDATE creative_tests SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?'
  ).run(status, completedAt, id);
}

function updateCreativeTestItemLocal(id: string, updates: Partial<{
  metaAdsetId: string;
  metaAdId: string;
  metaCreativeId: string;
  uploadStatus: string;
  launchStatus: string;
  reviewStatus: string;
  reviewFeedback: string;
  learningPhase: string;
  testStatus: string;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  purchases: number;
  impressions: number;
  aiRecommendation: string;
  aiReasoning: string;
}>): void {
  const db = getDb();

  const fieldMap: Record<string, string> = {
    metaAdsetId: 'meta_adset_id',
    metaAdId: 'meta_ad_id',
    metaCreativeId: 'meta_creative_id',
    uploadStatus: 'upload_status',
    launchStatus: 'launch_status',
    reviewStatus: 'review_status',
    reviewFeedback: 'review_feedback',
    learningPhase: 'learning_phase',
    testStatus: 'test_status',
    spend: 'spend',
    revenue: 'revenue',
    roas: 'roas',
    cpa: 'cpa',
    ctr: 'ctr',
    purchases: 'purchases',
    impressions: 'impressions',
    aiRecommendation: 'ai_recommendation',
    aiReasoning: 'ai_reasoning',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const column = fieldMap[key];
    if (column && value !== undefined) {
      setClauses.push(`${column} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE creative_test_items SET ${setClauses.join(', ')} WHERE id = ?`
  ).run(...values);
}

function getCopyLibraryLocal(productProfileId: string): WinningCopy[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM copy_library WHERE product_profile_id = ? ORDER BY roas DESC'
  ).all(productProfileId) as CopyLibraryRow[];
  return rows.map(mapCopyLibraryRow);
}

function saveCopyToLibraryLocal(copy: Partial<WinningCopy> & { id: string; productProfileId: string; primaryText: string }): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO copy_library (
      id, product_profile_id, primary_text, headline, description, cta,
      source_ad_id, source_test_id, roas, cpa, ctr,
      total_spend, total_revenue, total_purchases, is_ai_generated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    copy.id,
    copy.productProfileId,
    copy.primaryText,
    copy.headline ?? null,
    copy.description ?? null,
    copy.cta ?? null,
    copy.sourceAdId ?? null,
    copy.sourceTestId ?? null,
    copy.roas ?? null,
    copy.cpa ?? null,
    copy.ctr ?? null,
    copy.totalSpend ?? null,
    copy.totalRevenue ?? null,
    copy.totalPurchases ?? null,
    copy.isAiGenerated ? 1 : 0,
  );
}

function deleteCopyFromLibraryLocal(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM copy_library WHERE id = ?').run(id);
}

function getFatigueAlertsLocal(storeId: string): FatigueAlert[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT cfa.* FROM creative_fatigue_alerts cfa
    JOIN product_profiles pp ON pp.id = cfa.product_profile_id
    WHERE pp.store_id = ? AND cfa.status = 'active'
    ORDER BY cfa.created_at DESC
  `).all(storeId) as FatigueAlertRow[];
  return rows.map(mapFatigueAlertRow);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Exported async functions (Supabase primary, SQLite fallback) ──
// ══════════════════════════════════════════════════════════════════════════════

// ── Product Profiles ──

export async function getProductProfiles(storeId: string): Promise<ProductProfile[]> {
  if (isSupabasePersistenceEnabled()) {
    const rows = await supaRest<ProductProfileRow[]>(
      `/product_profiles?store_id=eq.${encodeURIComponent(storeId)}&order=updated_at.desc`
    );
    return rows.map(mapProfileRow);
  }
  return getProductProfilesLocal(storeId);
}

export async function getProductProfile(id: string): Promise<ProductProfile | null> {
  if (isSupabasePersistenceEnabled()) {
    const rows = await supaRest<ProductProfileRow[]>(
      `/product_profiles?id=eq.${encodeURIComponent(id)}&limit=1`
    );
    return rows.length > 0 ? mapProfileRow(rows[0]) : null;
  }
  return getProductProfileLocal(id);
}

export async function upsertProductProfile(
  profile: Partial<ProductProfile> & { id: string; storeId: string; productName: string; adAccountId: string },
): Promise<void> {
  if (isSupabasePersistenceEnabled()) {
    const now = new Date().toISOString();
    await supaRest<ProductProfileRow[]>(
      `/product_profiles?on_conflict=id`,
      {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({
          id: profile.id,
          store_id: profile.storeId,
          shopify_product_id: profile.shopifyProductId ?? null,
          product_name: profile.productName,
          product_image: profile.productImage ?? null,
          ad_account_id: profile.adAccountId,
          ad_account_currency: profile.adAccountCurrency ?? 'USD',
          page_id: profile.pageId ?? null,
          page_name: profile.pageName ?? null,
          instagram_actor_id: profile.instagramActorId ?? null,
          instagram_username: profile.instagramUsername ?? null,
          pixel_id: profile.pixelId ?? null,
          pixel_name: profile.pixelName ?? null,
          conversion_event: profile.conversionEvent ?? 'PURCHASE',
          destination_url: profile.destinationUrl ?? null,
          utm_template: profile.utmTemplate ?? null,
          average_order_value: profile.averageOrderValue ?? null,
          default_budget: profile.defaultBudget ?? 20,
          default_duration: profile.defaultDuration ?? 3,
          default_bid_strategy: profile.defaultBidStrategy ?? 'LOWEST_COST_WITHOUT_CAP',
          default_bid_amount: profile.defaultBidAmount ?? null,
          default_roas_floor: profile.defaultRoasFloor ?? null,
          default_structure: profile.defaultStructure ?? 'ABO',
          default_launch_status: profile.defaultLaunchStatus ?? 'ACTIVE',
          naming_template_json: profile.namingTemplate ? JSON.stringify(profile.namingTemplate) : null,
          targeting_presets_json: profile.targetingPresets ? JSON.stringify(profile.targetingPresets) : null,
          clickup_list_id: profile.clickupListId ?? null,
          clickup_list_name: profile.clickupListName ?? null,
          clickup_sync_interval: profile.clickupSyncInterval ?? 30,
          ai_min_spend: profile.aiMinSpend ?? null,
          ai_min_impressions: profile.aiMinImpressions ?? 500,
          ai_min_hours: profile.aiMinHours ?? 24,
          ai_eval_frequency: profile.aiEvalFrequency ?? 'every_6h',
          updated_at: now,
        }),
      },
    );
    return;
  }
  upsertProductProfileLocal(profile);
}

export async function deleteProductProfile(id: string): Promise<void> {
  if (isSupabasePersistenceEnabled()) {
    await supaRest<unknown>(
      `/product_profiles?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return;
  }
  deleteProductProfileLocal(id);
}

// ── Product Campaign Links ──

export async function getProductCampaignLinks(profileId: string): Promise<ProductCampaignLink[]> {
  if (isSupabasePersistenceEnabled()) {
    const rows = await supaRest<ProductCampaignLinkRow[]>(
      `/product_campaign_links?product_profile_id=eq.${encodeURIComponent(profileId)}&order=linked_at.desc`
    );
    return rows.map(mapCampaignLinkRow);
  }
  return getProductCampaignLinksLocal(profileId);
}

export async function upsertProductCampaignLink(
  link: Partial<ProductCampaignLink> & { id: string; productProfileId: string; campaignId: string; campaignType: string; adAccountId: string },
): Promise<void> {
  if (isSupabasePersistenceEnabled()) {
    await supaRest<ProductCampaignLinkRow[]>(
      `/product_campaign_links?on_conflict=id`,
      {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({
          id: link.id,
          product_profile_id: link.productProfileId,
          campaign_id: link.campaignId,
          campaign_name: link.campaignName ?? null,
          campaign_type: link.campaignType,
          ad_account_id: link.adAccountId,
          page_id: link.pageId ?? null,
          page_name: link.pageName ?? null,
          pixel_id: link.pixelId ?? null,
          pixel_name: link.pixelName ?? null,
          instagram_actor_id: link.instagramActorId ?? null,
          instagram_username: link.instagramUsername ?? null,
          bm_id: link.bmId ?? null,
          bm_name: link.bmName ?? null,
          is_active: link.isActive !== false,
        }),
      },
    );
    return;
  }
  upsertProductCampaignLinkLocal(link);
}

// ── Creative Tests ──

export async function getCreativeTests(storeId: string, status?: string): Promise<CreativeTest[]> {
  if (isSupabasePersistenceEnabled()) {
    // Fetch tests
    let testPath = `/creative_tests?store_id=eq.${encodeURIComponent(storeId)}&order=created_at.desc`;
    if (status) {
      testPath += `&status=eq.${encodeURIComponent(status)}`;
    }
    const testRows = await supaRest<CreativeTestRow[]>(testPath);

    if (testRows.length === 0) return [];

    // Gather all test IDs for batch queries
    const testIds = testRows.map((r) => r.id);
    const idsFilter = `in.(${testIds.map((id) => `"${id}"`).join(',')})`;

    // Fetch product profiles for product names, items, and ad copy in parallel
    const profileIds = [...new Set(testRows.map((r) => r.product_profile_id))];
    const profileFilter = `in.(${profileIds.map((id) => `"${id}"`).join(',')})`;

    const [profileRows, itemRows, copyRows] = await Promise.all([
      supaRest<ProductProfileRow[]>(
        `/product_profiles?id=${profileFilter}&select=id,product_name`
      ),
      supaRest<CreativeTestItemRow[]>(
        `/creative_test_items?creative_test_id=${idsFilter}&order=created_at.asc`
      ),
      supaRest<TestAdCopyRow[]>(
        `/test_ad_copy?creative_test_id=${idsFilter}&order=position.asc`
      ),
    ]);

    const profileNameMap = new Map(profileRows.map((p) => [p.id, p.product_name]));

    return testRows.map((row) => {
      const test = mapTestRow(row);
      return {
        ...test,
        productName: profileNameMap.get(row.product_profile_id) ?? '',
        items: itemRows.filter((i) => i.creative_test_id === row.id).map(mapTestItemRow),
        adCopy: copyRows.filter((c) => c.creative_test_id === row.id).map(mapAdCopyRow),
      };
    });
  }
  return getCreativeTestsLocal(storeId, status);
}

export async function getCreativeTest(id: string): Promise<CreativeTest | null> {
  if (isSupabasePersistenceEnabled()) {
    const testRows = await supaRest<CreativeTestRow[]>(
      `/creative_tests?id=eq.${encodeURIComponent(id)}&limit=1`
    );
    if (testRows.length === 0) return null;

    const row = testRows[0];

    // Fetch product name, items, and ad copy in parallel
    const [profileRows, itemRows, copyRows] = await Promise.all([
      supaRest<ProductProfileRow[]>(
        `/product_profiles?id=eq.${encodeURIComponent(row.product_profile_id)}&select=id,product_name&limit=1`
      ),
      supaRest<CreativeTestItemRow[]>(
        `/creative_test_items?creative_test_id=eq.${encodeURIComponent(id)}&order=created_at.asc`
      ),
      supaRest<TestAdCopyRow[]>(
        `/test_ad_copy?creative_test_id=eq.${encodeURIComponent(id)}&order=position.asc`
      ),
    ]);

    const test = mapTestRow(row);
    return {
      ...test,
      productName: profileRows.length > 0 ? profileRows[0].product_name : '',
      items: itemRows.map(mapTestItemRow),
      adCopy: copyRows.map(mapAdCopyRow),
    };
  }
  return getCreativeTestLocal(id);
}

export async function createCreativeTest(test: {
  id: string;
  storeId: string;
  productProfileId: string;
  campaignId: string;
  campaignName?: string;
  campaignMode: string;
  adsetMode: string;
  structure: string;
  bidStrategy?: string;
  bidAmount?: number;
  roasFloor?: number;
  dailyBudget?: number;
  testDuration?: number;
  launchStatus?: string;
  status?: string;
  launchedBy?: string;
  launchedAt?: string;
  items: Array<{
    id: string;
    clickupTaskId?: string;
    clickupTaskName?: string;
    creativeName: string;
    creativeFormat?: string;
    hook?: string;
    angle?: string;
    driveUrl?: string;
    thumbnailUrl?: string;
    metaAssetId?: string;
    metaAssetType?: string;
  }>;
  adCopy: Array<{
    id: string;
    copyType: string;
    copyText: string;
    source?: string;
    sourceCopyId?: string;
    position?: number;
  }>;
}): Promise<void> {
  if (isSupabasePersistenceEnabled()) {
    // Insert the test row
    await supaRest<CreativeTestRow[]>(
      `/creative_tests`,
      {
        method: 'POST',
        body: JSON.stringify({
          id: test.id,
          store_id: test.storeId,
          product_profile_id: test.productProfileId,
          campaign_id: test.campaignId,
          campaign_name: test.campaignName ?? null,
          campaign_mode: test.campaignMode,
          adset_mode: test.adsetMode,
          structure: test.structure,
          bid_strategy: test.bidStrategy ?? null,
          bid_amount: test.bidAmount ?? null,
          roas_floor: test.roasFloor ?? null,
          daily_budget: test.dailyBudget ?? null,
          test_duration: test.testDuration ?? null,
          launch_status: test.launchStatus ?? null,
          status: test.status ?? 'launching',
          launched_by: test.launchedBy ?? null,
          launched_at: test.launchedAt ?? null,
        }),
      },
    );

    // Insert items and ad copy in parallel
    const itemsPromise = test.items.length > 0
      ? supaRest<CreativeTestItemRow[]>(
          `/creative_test_items`,
          {
            method: 'POST',
            body: JSON.stringify(
              test.items.map((item) => ({
                id: item.id,
                creative_test_id: test.id,
                clickup_task_id: item.clickupTaskId ?? null,
                clickup_task_name: item.clickupTaskName ?? null,
                creative_name: item.creativeName,
                creative_format: item.creativeFormat ?? null,
                hook: item.hook ?? null,
                angle: item.angle ?? null,
                drive_url: item.driveUrl ?? null,
                thumbnail_url: item.thumbnailUrl ?? null,
                meta_asset_id: item.metaAssetId ?? null,
                meta_asset_type: item.metaAssetType ?? null,
              })),
            ),
          },
        )
      : Promise.resolve([]);

    const copyPromise = test.adCopy.length > 0
      ? supaRest<TestAdCopyRow[]>(
          `/test_ad_copy`,
          {
            method: 'POST',
            body: JSON.stringify(
              test.adCopy.map((copy) => ({
                id: copy.id,
                creative_test_id: test.id,
                copy_type: copy.copyType,
                copy_text: copy.copyText,
                source: copy.source ?? null,
                source_copy_id: copy.sourceCopyId ?? null,
                position: copy.position ?? 0,
              })),
            ),
          },
        )
      : Promise.resolve([]);

    await Promise.all([itemsPromise, copyPromise]);
    return;
  }
  createCreativeTestLocal(test);
}

export async function updateCreativeTestStatus(id: string, status: string): Promise<void> {
  if (isSupabasePersistenceEnabled()) {
    const patch: Record<string, unknown> = { status };
    if (status === 'completed' || status === 'failed') {
      patch.completed_at = new Date().toISOString();
    }
    await supaRest<CreativeTestRow[]>(
      `/creative_tests?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    );
    return;
  }
  updateCreativeTestStatusLocal(id, status);
}

export async function updateCreativeTestItem(id: string, updates: Partial<{
  metaAdsetId: string;
  metaAdId: string;
  metaCreativeId: string;
  uploadStatus: string;
  launchStatus: string;
  reviewStatus: string;
  reviewFeedback: string;
  learningPhase: string;
  testStatus: string;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  purchases: number;
  impressions: number;
  aiRecommendation: string;
  aiReasoning: string;
}>): Promise<void> {
  if (isSupabasePersistenceEnabled()) {
    const fieldMap: Record<string, string> = {
      metaAdsetId: 'meta_adset_id',
      metaAdId: 'meta_ad_id',
      metaCreativeId: 'meta_creative_id',
      uploadStatus: 'upload_status',
      launchStatus: 'launch_status',
      reviewStatus: 'review_status',
      reviewFeedback: 'review_feedback',
      learningPhase: 'learning_phase',
      testStatus: 'test_status',
      spend: 'spend',
      revenue: 'revenue',
      roas: 'roas',
      cpa: 'cpa',
      ctr: 'ctr',
      purchases: 'purchases',
      impressions: 'impressions',
      aiRecommendation: 'ai_recommendation',
      aiReasoning: 'ai_reasoning',
    };

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      const column = fieldMap[key];
      if (column && value !== undefined) {
        patch[column] = value;
      }
    }

    if (Object.keys(patch).length === 0) return;

    await supaRest<CreativeTestItemRow[]>(
      `/creative_test_items?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    );
    return;
  }
  updateCreativeTestItemLocal(id, updates);
}

// ── Copy Library ──

export async function getCopyLibrary(productProfileId: string): Promise<WinningCopy[]> {
  if (isSupabasePersistenceEnabled()) {
    const rows = await supaRest<CopyLibraryRow[]>(
      `/copy_library?product_profile_id=eq.${encodeURIComponent(productProfileId)}&order=roas.desc.nullslast`
    );
    return rows.map(mapCopyLibraryRow);
  }
  return getCopyLibraryLocal(productProfileId);
}

export async function saveCopyToLibrary(
  copy: Partial<WinningCopy> & { id: string; productProfileId: string; primaryText: string },
): Promise<void> {
  if (isSupabasePersistenceEnabled()) {
    await supaRest<CopyLibraryRow[]>(
      `/copy_library`,
      {
        method: 'POST',
        body: JSON.stringify({
          id: copy.id,
          product_profile_id: copy.productProfileId,
          primary_text: copy.primaryText,
          headline: copy.headline ?? null,
          description: copy.description ?? null,
          cta: copy.cta ?? null,
          source_ad_id: copy.sourceAdId ?? null,
          source_test_id: copy.sourceTestId ?? null,
          roas: copy.roas ?? null,
          cpa: copy.cpa ?? null,
          ctr: copy.ctr ?? null,
          total_spend: copy.totalSpend ?? null,
          total_revenue: copy.totalRevenue ?? null,
          total_purchases: copy.totalPurchases ?? null,
          is_ai_generated: copy.isAiGenerated ?? false,
        }),
      },
    );
    return;
  }
  saveCopyToLibraryLocal(copy);
}

export async function deleteCopyFromLibrary(id: string): Promise<void> {
  if (isSupabasePersistenceEnabled()) {
    await supaRest<unknown>(
      `/copy_library?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    return;
  }
  deleteCopyFromLibraryLocal(id);
}

// ── Fatigue Alerts ──

export async function getFatigueAlerts(storeId: string): Promise<FatigueAlert[]> {
  if (isSupabasePersistenceEnabled()) {
    // First get product profile IDs for this store
    const profiles = await supaRest<{ id: string }[]>(
      `/product_profiles?store_id=eq.${encodeURIComponent(storeId)}&select=id`
    );
    if (profiles.length === 0) return [];

    const profileIds = profiles.map((p) => p.id);
    const profileFilter = `in.(${profileIds.map((id) => `"${id}"`).join(',')})`;

    const rows = await supaRest<FatigueAlertRow[]>(
      `/creative_fatigue_alerts?product_profile_id=${profileFilter}&status=eq.active&order=created_at.desc`
    );
    return rows.map(mapFatigueAlertRow);
  }
  return getFatigueAlertsLocal(storeId);
}
