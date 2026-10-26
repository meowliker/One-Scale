BEGIN;
-- Range navigation fills missing reports; only an explicit refresh forces saved days.
CREATE OR REPLACE FUNCTION profit_sheet_enqueue_missing(p_store text, p_dates jsonb, p_scope text DEFAULT 'store', p_finance_version integer DEFAULT 0)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d text; v integer; n integer := 0; changed integer;
BEGIN
 SELECT version INTO STRICT v FROM profit_sheet_stores WHERE store_id=p_store;
 FOR d IN SELECT jsonb_array_elements_text(p_dates) LOOP
  IF NOT EXISTS (SELECT 1 FROM profit_sheet_days WHERE store_id=p_store AND date=d::date AND scope_id=p_scope
   AND config_version=v AND (p_finance_version=0 OR COALESCE((metrics->>'financeVersion')::integer,0)>=p_finance_version)) THEN
   INSERT INTO profit_sheet_jobs(store_id,date) VALUES(p_store,d::date)
   ON CONFLICT(store_id,date) DO UPDATE SET status='queued',error=null,attempts=0,updated_at=now()
   WHERE profit_sheet_jobs.status='success';
   -- Do not restart queued/running jobs, or silently retry failed jobs on range changes.
   GET DIAGNOSTICS changed = ROW_COUNT;
   n := n + changed;
  END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION profit_sheet_enqueue_missing(text,jsonb,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_enqueue_missing(text,jsonb,text,integer) TO service_role;
CREATE OR REPLACE FUNCTION profit_sheet_claim(p_store text DEFAULT NULL,p_date date DEFAULT NULL)
RETURNS SETOF profit_sheet_jobs LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 RETURN QUERY WITH selected AS (
 SELECT store_id,date FROM profit_sheet_jobs
 WHERE (status='queued' OR (status='running' AND COALESCE(lease_until,'epoch'::timestamptz)<=now()))
 AND (p_store IS NULL OR store_id=p_store) AND (p_date IS NULL OR date=p_date)
 ORDER BY updated_at,date FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE profit_sheet_jobs j SET status='running',attempts=j.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '6 minutes',updated_at=now()
 FROM selected s WHERE j.store_id=s.store_id AND j.date=s.date RETURNING j.*;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
