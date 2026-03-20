ALTER TABLE IF EXISTS product_launch_profiles
  ADD COLUMN IF NOT EXISTS product_links text;
