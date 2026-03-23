-- ============================================================
-- Supabase Migration: Creative Hub Tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. Product Profiles
CREATE TABLE IF NOT EXISTS product_profiles (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  shopify_product_id TEXT,
  product_name TEXT NOT NULL,
  product_image TEXT,
  ad_account_id TEXT NOT NULL,
  ad_account_currency TEXT DEFAULT 'USD',
  page_id TEXT,
  page_name TEXT,
  instagram_actor_id TEXT,
  instagram_username TEXT,
  pixel_id TEXT,
  pixel_name TEXT,
  conversion_event TEXT DEFAULT 'PURCHASE',
  destination_url TEXT,
  utm_template TEXT,
  average_order_value REAL,
  default_budget REAL DEFAULT 20,
  default_duration INTEGER DEFAULT 3,
  default_bid_strategy TEXT DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  default_bid_amount REAL,
  default_roas_floor REAL,
  default_structure TEXT DEFAULT 'ABO',
  default_launch_status TEXT DEFAULT 'ACTIVE',
  naming_template_json TEXT,
  targeting_presets_json TEXT,
  clickup_list_id TEXT,
  clickup_list_name TEXT,
  clickup_sync_interval INTEGER DEFAULT 30,
  ai_min_spend REAL,
  ai_min_impressions INTEGER DEFAULT 500,
  ai_min_hours INTEGER DEFAULT 24,
  ai_eval_frequency TEXT DEFAULT 'every_6h',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_profiles_store ON product_profiles(store_id);

-- 2. Product Campaign Links
CREATE TABLE IF NOT EXISTS product_campaign_links (
  id TEXT PRIMARY KEY,
  product_profile_id TEXT NOT NULL REFERENCES product_profiles(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_type TEXT NOT NULL,
  ad_account_id TEXT NOT NULL,
  page_id TEXT,
  page_name TEXT,
  pixel_id TEXT,
  pixel_name TEXT,
  instagram_actor_id TEXT,
  instagram_username TEXT,
  bm_id TEXT,
  bm_name TEXT,
  destination_url TEXT,
  is_active BOOLEAN DEFAULT true,
  linked_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_links_profile ON product_campaign_links(product_profile_id);

-- 3. Creative Tests
CREATE TABLE IF NOT EXISTS creative_tests (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  product_profile_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_mode TEXT NOT NULL,
  adset_mode TEXT NOT NULL,
  structure TEXT NOT NULL,
  bid_strategy TEXT,
  bid_amount REAL,
  roas_floor REAL,
  daily_budget REAL,
  test_duration INTEGER,
  launch_status TEXT,
  status TEXT DEFAULT 'launching',
  launched_by TEXT,
  launched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_spend REAL DEFAULT 0,
  winner_creative_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_tests_store ON creative_tests(store_id, status);

-- 4. Creative Test Items
CREATE TABLE IF NOT EXISTS creative_test_items (
  id TEXT PRIMARY KEY,
  creative_test_id TEXT NOT NULL REFERENCES creative_tests(id) ON DELETE CASCADE,
  clickup_task_id TEXT,
  clickup_task_name TEXT,
  creative_name TEXT NOT NULL,
  creative_format TEXT,
  hook TEXT,
  angle TEXT,
  drive_url TEXT,
  thumbnail_url TEXT,
  meta_asset_id TEXT,
  meta_asset_type TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  meta_creative_id TEXT,
  upload_status TEXT DEFAULT 'pending',
  launch_status TEXT DEFAULT 'pending',
  review_status TEXT,
  review_feedback TEXT,
  learning_phase TEXT,
  test_status TEXT DEFAULT 'testing',
  spend REAL DEFAULT 0,
  revenue REAL DEFAULT 0,
  roas REAL DEFAULT 0,
  cpa REAL,
  ctr REAL,
  purchases INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ai_recommendation TEXT,
  ai_reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_test_items_test ON creative_test_items(creative_test_id);

-- 5. Copy Library
CREATE TABLE IF NOT EXISTS copy_library (
  id TEXT PRIMARY KEY,
  product_profile_id TEXT NOT NULL,
  primary_text TEXT NOT NULL,
  headline TEXT,
  description TEXT,
  cta TEXT,
  source_ad_id TEXT,
  source_test_id TEXT,
  roas REAL,
  cpa REAL,
  ctr REAL,
  total_spend REAL,
  total_revenue REAL,
  total_purchases INTEGER,
  is_ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_library_profile ON copy_library(product_profile_id);

-- 6. Test Ad Copy
CREATE TABLE IF NOT EXISTS test_ad_copy (
  id TEXT PRIMARY KEY,
  creative_test_id TEXT NOT NULL REFERENCES creative_tests(id) ON DELETE CASCADE,
  copy_type TEXT NOT NULL,
  copy_text TEXT NOT NULL,
  source TEXT,
  source_copy_id TEXT,
  position INTEGER
);

-- 7. Creative Fatigue Alerts
CREATE TABLE IF NOT EXISTS creative_fatigue_alerts (
  id TEXT PRIMARY KEY,
  product_profile_id TEXT NOT NULL,
  product_name TEXT,
  ad_id TEXT NOT NULL,
  creative_name TEXT,
  campaign_id TEXT,
  ctr_trend TEXT,
  cpa_trend TEXT,
  frequency_trend TEXT,
  alert_type TEXT,
  status TEXT DEFAULT 'active',
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fatigue_alerts_profile ON creative_fatigue_alerts(product_profile_id);
