-- =============================================================================
-- Migration 012: Downsell Classification
-- Adds support for downsell product classification, mutual exclusions between
-- products, and a full history log of classification changes over time.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Section 1: product_behaviors — mutual_exclusions column
-- Stores a list of product_ids that cannot be offered alongside this product
-- (e.g. a downsell should not appear when its parent upsell is already active).
-- -----------------------------------------------------------------------------
ALTER TABLE product_behaviors
  ADD COLUMN IF NOT EXISTS mutual_exclusions JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN product_behaviors.mutual_exclusions IS
  'Array of product_ids that are mutually exclusive with this product. '
  'Used to prevent conflicting offers (e.g. upsell + its own downsell) '
  'from appearing at the same time.';


-- -----------------------------------------------------------------------------
-- Section 2: product_classifications — downsell_of column
-- When a product is classified as a downsell, this column records the
-- product_id of the primary / full-price product it is a downsell of.
-- NULL means the product is not a downsell of any specific product.
-- -----------------------------------------------------------------------------
ALTER TABLE product_classifications
  ADD COLUMN IF NOT EXISTS downsell_of TEXT;

COMMENT ON COLUMN product_classifications.downsell_of IS
  'The product_id of the main (full-price) product that this product is a '
  'downsell of. NULL when the product is not acting as a downsell alternative.';


-- -----------------------------------------------------------------------------
-- Section 3: classification_history table
-- Immutable audit log that records every time a product classification changes,
-- whether triggered automatically by the system or manually by the merchant.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS classification_history (
  -- Primary key
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope
  store_id                TEXT        NOT NULL,
  product_id              TEXT        NOT NULL,

  -- Classification transition
  previous_classification TEXT,                        -- NULL on first classification
  new_classification      TEXT        NOT NULL,

  -- Attribution
  changed_by              TEXT        NOT NULL DEFAULT 'system',  -- 'system' | 'merchant'

  -- Confidence score (0–100) produced by the classification model at change time
  confidence              INTEGER     DEFAULT 0,

  -- Raw signals / features that drove the new classification decision
  signals                 JSONB       NOT NULL DEFAULT '[]',

  -- Timestamp
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE classification_history IS
  'Append-only audit log of product classification changes. '
  'Each row captures a single transition from one classification to another, '
  'including who/what triggered the change and the underlying signals.';

COMMENT ON COLUMN classification_history.previous_classification IS
  'The classification value before this change. NULL when the product is '
  'being classified for the very first time.';

COMMENT ON COLUMN classification_history.new_classification IS
  'The classification value assigned by this change event.';

COMMENT ON COLUMN classification_history.changed_by IS
  'Who triggered the classification change. '
  'Use ''system'' for automated pipeline changes and ''merchant'' for manual overrides.';

COMMENT ON COLUMN classification_history.confidence IS
  'Confidence score (0–100) from the classification model at the moment of change. '
  '0 is used for manual merchant overrides where no model score applies.';

COMMENT ON COLUMN classification_history.signals IS
  'JSON array of signal objects that contributed to the new classification. '
  'Each signal should include at minimum { "name": "...", "value": ... }.';


-- -----------------------------------------------------------------------------
-- Section 4: Indexes on classification_history
-- Optimise the two most common query patterns:
--   1. Fetch the full history for a specific product in a store.
--   2. Fetch recent classification activity across all products in a store.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_classification_history_product
  ON classification_history (store_id, product_id);

COMMENT ON INDEX idx_classification_history_product IS
  'Supports lookups of the complete classification history for a single product.';

CREATE INDEX IF NOT EXISTS idx_classification_history_recency
  ON classification_history (store_id, created_at DESC);

COMMENT ON INDEX idx_classification_history_recency IS
  'Supports time-ordered queries across all products within a store, '
  'e.g. "show me everything that changed in the last 7 days".';
