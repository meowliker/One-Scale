BEGIN;
ALTER TABLE profit_sheet_stores ADD COLUMN last_full_synced_at timestamptz,
 ADD COLUMN last_full_sync_from date, ADD COLUMN last_full_sync_to date;
CREATE FUNCTION profit_sheet_sync_status(p_store text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s profit_sheet_stores; discovery profit_sheet_discovery; today date:=(now() AT TIME ZONE 'UTC' - interval '6 hours')::date;
 complete boolean:=false; completed_at timestamptz; stage text; account_count integer;
BEGIN
 SELECT * INTO s FROM profit_sheet_stores WHERE store_id=p_store FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('stage','accounts','lastCompletedAt',null,'from',today-2,'to',today); END IF;
 SELECT count(*) INTO account_count FROM profit_sheet_accounts WHERE store_id=p_store;
 SELECT * INTO discovery FROM profit_sheet_discovery WHERE store_id=p_store;
 IF account_count>0 AND discovery.status='success' AND discovery.checked_at IS NOT NULL THEN
  WITH needed AS (
   SELECT today-n AS date,'store'::text AS scope_id FROM generate_series(0,2) n
   UNION ALL
   SELECT today-n,p.id FROM generate_series(0,2) n CROSS JOIN profit_sheet_products p
   WHERE p.store_id=p_store AND (p.start_date IS NULL OR today-n>=p.start_date)
  )
  SELECT bool_and(COALESCE(r.date IS NOT NULL AND r.config_version=s.version AND j.status='success'
    AND r.synced_at>=discovery.checked_at AND r.metrics->>'revenue' IS NOT NULL
    AND (needed.scope_id<>'store' OR (r.metrics->>'adSpend' IS NOT NULL AND r.metrics->>'shopifyFees' IS NOT NULL)),false)),max(r.synced_at)
  INTO complete,completed_at FROM needed
  LEFT JOIN profit_sheet_days r ON r.store_id=p_store AND r.date=needed.date AND r.scope_id=needed.scope_id
  LEFT JOIN profit_sheet_jobs j ON j.store_id=p_store AND j.date=needed.date;
 END IF;
 complete:=COALESCE(complete,false);
 IF complete AND (s.last_full_synced_at IS NULL OR completed_at>s.last_full_synced_at) THEN
  UPDATE profit_sheet_stores SET last_full_synced_at=completed_at,last_full_sync_from=today-2,last_full_sync_to=today WHERE store_id=p_store;
  s.last_full_synced_at:=completed_at;s.last_full_sync_from:=today-2;s.last_full_sync_to:=today;
 END IF;
 stage:=CASE WHEN account_count=0 THEN 'accounts'
  WHEN discovery.status IN ('queued','running') THEN 'products'
  WHEN discovery.status IN ('error','partial') THEN 'attention'
  WHEN complete THEN 'complete'
  WHEN EXISTS(SELECT 1 FROM profit_sheet_jobs WHERE store_id=p_store AND date BETWEEN today-2 AND today AND status='error') THEN 'attention'
  ELSE 'reports' END;
 RETURN jsonb_build_object('stage',stage,'lastCompletedAt',s.last_full_synced_at,
  'lastCompletedFrom',s.last_full_sync_from,'lastCompletedTo',s.last_full_sync_to,
  'from',today-2,'to',today,'retryAt',discovery.retry_at);
END $$;
REVOKE ALL ON FUNCTION profit_sheet_sync_status(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_sync_status(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
