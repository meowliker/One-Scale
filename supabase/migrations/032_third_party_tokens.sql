-- Migration: Third-party tokens table for ClickUp and other integrations
-- This table persists API tokens for third-party integrations (ClickUp, etc.)
-- so they survive serverless cold starts on Vercel

CREATE TABLE IF NOT EXISTS third_party_tokens (
  id BIGSERIAL PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  access_token TEXT NOT NULL,
  metadata JSONB,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, platform)
);

-- Index for fast lookups by store_id and platform
CREATE INDEX IF NOT EXISTS idx_third_party_tokens_store_platform 
  ON third_party_tokens(store_id, platform);

-- Enable RLS
ALTER TABLE third_party_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: service role can do everything
CREATE POLICY "Service role full access on third_party_tokens"
  ON third_party_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Comment
COMMENT ON TABLE third_party_tokens IS 'Stores API tokens for third-party integrations like ClickUp';
