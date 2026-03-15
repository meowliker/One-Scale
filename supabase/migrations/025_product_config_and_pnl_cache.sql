-- Apps Script Port: Product config, ad account mappings, and per-product P&L cache

-- Product config: defines main products with keyword matching rules
CREATE TABLE IF NOT EXISTS product_config (
  store_id text NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  main_keywords jsonb DEFAULT '[]'::jsonb,    -- [["texture"],["mystery box"]] — each inner array is AND-matched
  upsell_keywords jsonb DEFAULT '[]'::jsonb,  -- ["texture upsell","texture bump"]
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);

-- Meta ad account → product mapping with campaign keywords
CREATE TABLE IF NOT EXISTS meta_ad_account_mappings (
  store_id text NOT NULL,
  ad_account_id text NOT NULL,
  product_id text,                             -- direct mapping: all spend → this product
  product_keywords jsonb DEFAULT '[]'::jsonb,  -- ["texture","mystery box"] — match against campaign name
  is_inr boolean DEFAULT false,                -- INR currency flag
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, ad_account_id)
);

-- Per-product per-date P&L cache (Apps Script equivalent)
CREATE TABLE IF NOT EXISTS product_pnl_cache (
  store_id text NOT NULL,
  product_id text NOT NULL,
  date text NOT NULL,
  product_name text,
  revenue numeric(12,2) DEFAULT 0,
  orders integer DEFAULT 0,
  fees numeric(12,2) DEFAULT 0,
  ad_spend numeric(12,2) DEFAULT 0,
  cogs numeric(12,2) DEFAULT 0,
  net_profit numeric(12,2) DEFAULT 0,
  margin numeric(8,2) DEFAULT 0,
  attribution_method text,                     -- 'direct_mapping' | 'keyword_match' | 'proportional'
  computed_at timestamptz DEFAULT now(),
  PRIMARY KEY (store_id, product_id, date)
);

-- Add ad_account_id to meta_spend_cache if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meta_spend_cache' AND column_name = 'ad_account_id'
  ) THEN
    ALTER TABLE meta_spend_cache ADD COLUMN ad_account_id text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'meta_spend_cache' AND column_name = 'campaign_name'
  ) THEN
    ALTER TABLE meta_spend_cache ADD COLUMN campaign_name text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meta_spend_cache_account
  ON meta_spend_cache (store_id, ad_account_id, date);

CREATE INDEX IF NOT EXISTS idx_product_pnl_cache_lookup
  ON product_pnl_cache (store_id, date);
