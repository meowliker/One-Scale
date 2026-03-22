-- Product launch profiles - stores Meta campaign settings per product for auto-population
-- Run this in Supabase SQL editor after 032_third_party_tokens.sql

-- ── 1. product_launch_profiles — stores launch settings per product ─────────
CREATE TABLE IF NOT EXISTS product_launch_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  
  -- Meta Account Settings
  ad_account_id text,
  ad_account_name text,
  page_id text,
  page_name text,
  instagram_id text,
  pixel_id text,
  pixel_name text,
  
  -- Campaign Settings
  default_campaign_id text,
  default_campaign_name text,
  default_adset_id text,
  default_adset_name text,
  conversion_event text DEFAULT 'PURCHASE',
  custom_conversion_id text,
  
  -- Budget & Schedule
  daily_budget numeric(10,2) DEFAULT 50,
  lifetime_budget numeric(10,2),
  budget_type text DEFAULT 'daily',
  test_duration integer DEFAULT 7,
  bid_strategy text DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  
  -- Targeting
  min_age integer DEFAULT 18,
  max_age integer DEFAULT 65,
  gender text DEFAULT 'all',
  locations jsonb DEFAULT '["US"]',
  interests jsonb DEFAULT '[]',
  
  -- Creative Defaults
  destination_url text,
  utm_template text DEFAULT 'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}',
  call_to_action text DEFAULT 'SHOP_NOW',
  
  -- Winner Copy Library (cached from Meta)
  winner_copy_library jsonb DEFAULT '[]',
  
  -- Metadata
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_launch_profiles_store
  ON product_launch_profiles(store_id);

CREATE INDEX IF NOT EXISTS idx_product_launch_profiles_product
  ON product_launch_profiles(store_id, product_id);


-- ── 2. meta_campaigns_cache — cached campaigns from Meta ─────────────────────
CREATE TABLE IF NOT EXISTS meta_campaigns_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  status text,
  objective text,
  daily_budget numeric(10,2),
  lifetime_budget numeric(10,2),
  spend_last_30d numeric(10,2),
  roas_last_30d numeric(6,2),
  created_time timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(store_id, ad_account_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_cache_store
  ON meta_campaigns_cache(store_id, ad_account_id);


-- ── 3. meta_adsets_cache — cached adsets from Meta ───────────────────────────
CREATE TABLE IF NOT EXISTS meta_adsets_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  adset_id text NOT NULL,
  adset_name text NOT NULL,
  status text,
  daily_budget numeric(10,2),
  lifetime_budget numeric(10,2),
  targeting jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(store_id, ad_account_id, adset_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_adsets_cache_store
  ON meta_adsets_cache(store_id, ad_account_id);

CREATE INDEX IF NOT EXISTS idx_meta_adsets_cache_campaign
  ON meta_adsets_cache(store_id, campaign_id);


-- ── 4. meta_pages_cache — cached Facebook pages ──────────────────────────────
CREATE TABLE IF NOT EXISTS meta_pages_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  page_id text NOT NULL,
  page_name text NOT NULL,
  instagram_business_account_id text,
  instagram_username text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(store_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_pages_cache_store
  ON meta_pages_cache(store_id);


-- ── 5. meta_pixels_cache — cached pixels ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_pixels_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id text NOT NULL,
  ad_account_id text NOT NULL,
  pixel_id text NOT NULL,
  pixel_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(store_id, ad_account_id, pixel_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_pixels_cache_store
  ON meta_pixels_cache(store_id, ad_account_id);
