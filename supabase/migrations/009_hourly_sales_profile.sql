ALTER TABLE pnl_store_settings
ADD COLUMN IF NOT EXISTS hourly_sales_profile JSONB DEFAULT NULL;

COMMENT ON COLUMN pnl_store_settings.hourly_sales_profile IS 'Array of 24 hourly weights (sum=1.0) for smart expense distribution';
