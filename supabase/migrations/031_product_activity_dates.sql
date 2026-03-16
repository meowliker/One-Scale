-- Migration 031: Track product activity dates for PRISM self-learning
-- Stores first_order_date and last_order_date per product per store.
-- PRISM uses this to only show products active in the requested date range.

ALTER TABLE product_classifications ADD COLUMN IF NOT EXISTS first_order_date text;
ALTER TABLE product_classifications ADD COLUMN IF NOT EXISTS last_order_date text;
ALTER TABLE product_classifications ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
