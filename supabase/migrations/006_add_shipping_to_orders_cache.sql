ALTER TABLE shopify_orders_cache ADD COLUMN IF NOT EXISTS total_shipping_price numeric(12,2) DEFAULT 0;
