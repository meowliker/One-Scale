-- Migration: Add google_drive to platform constraints and add metadata column
-- Required for Google Drive OAuth integration

-- 1. Expand app_credentials platform check to include google_drive
ALTER TABLE app_credentials
  DROP CONSTRAINT IF EXISTS app_credentials_platform_check;

ALTER TABLE app_credentials
  ADD CONSTRAINT app_credentials_platform_check
  CHECK (platform IN ('meta', 'shopify', 'google_drive'));

-- 2. Expand connections platform check to include google_drive
ALTER TABLE connections
  DROP CONSTRAINT IF EXISTS connections_platform_check;

ALTER TABLE connections
  ADD CONSTRAINT connections_platform_check
  CHECK (platform IN ('meta', 'shopify', 'google_drive'));

-- 3. Add metadata column to connections (for storing user email, etc.)
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS metadata TEXT;

-- 4. Expand oauth_states platform check to include google_drive
ALTER TABLE oauth_states
  DROP CONSTRAINT IF EXISTS oauth_states_platform_check;

ALTER TABLE oauth_states
  ADD CONSTRAINT oauth_states_platform_check
  CHECK (platform IN ('meta', 'shopify', 'google_drive'));

-- Done
