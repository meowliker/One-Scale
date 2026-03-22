-- Expand meta_endpoint_snapshots endpoint constraint for setup-option caches
-- Adds support for pages, pixels, instagram, and accounts snapshots.

ALTER TABLE meta_endpoint_snapshots
  DROP CONSTRAINT IF EXISTS meta_endpoint_snapshots_endpoint_check;

ALTER TABLE meta_endpoint_snapshots
  ADD CONSTRAINT meta_endpoint_snapshots_endpoint_check
  CHECK (endpoint IN (
    'creatives',
    'adsets',
    'ads',
    'campaigns',
    'insights',
    'pages',
    'pixels',
    'instagram',
    'accounts'
  ));
