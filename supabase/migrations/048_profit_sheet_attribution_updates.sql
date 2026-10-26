BEGIN;
CREATE TABLE profit_sheet_attribution_updates (
 store_id text PRIMARY KEY REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 scanned_until timestamptz,
 checked_at timestamptz NOT NULL DEFAULT '1970-01-01',
 lease_until timestamptz,
 error text
);
ALTER TABLE profit_sheet_attribution_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profit_sheet_attribution_updates FROM anon,authenticated;
GRANT ALL ON profit_sheet_attribution_updates TO service_role;
CREATE FUNCTION profit_sheet_claim_update_scan() RETURNS SETOF profit_sheet_attribution_updates LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO profit_sheet_attribution_updates(store_id) SELECT store_id FROM profit_sheet_stores ON CONFLICT DO NOTHING;
 RETURN QUERY WITH selected AS (
 SELECT store_id FROM profit_sheet_attribution_updates
 WHERE checked_at < now()-interval '15 minutes' AND (lease_until IS NULL OR lease_until<now())
 ORDER BY checked_at FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE profit_sheet_attribution_updates u SET checked_at=now(),lease_until=now()+interval '2 minutes'
 FROM selected s WHERE u.store_id=s.store_id RETURNING u.*;
END $$;
REVOKE ALL ON FUNCTION profit_sheet_claim_update_scan() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_claim_update_scan() TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
