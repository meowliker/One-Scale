BEGIN;
CREATE TABLE meta_request_budgets (
 key text PRIMARY KEY, next_at timestamptz NOT NULL DEFAULT now(), blocked_until timestamptz,
 interval_ms integer NOT NULL DEFAULT 0, pressure_until timestamptz,
 usage_percent numeric, access_tier text, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE meta_request_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON meta_request_budgets FROM anon,authenticated;
GRANT ALL ON meta_request_budgets TO service_role;
-- Reserve a time slot atomically across Vercel instances; lock keys in stable order.
CREATE FUNCTION meta_reserve_request(p_keys jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE k text; slot timestamptz:=clock_timestamp(); b timestamptz; t timestamptz:=clock_timestamp();
BEGIN
 FOR k IN SELECT jsonb_array_elements_text(p_keys) ORDER BY 1 LOOP
  INSERT INTO meta_request_budgets(key) VALUES(k) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM meta_request_budgets WHERE key=k FOR UPDATE;
 END LOOP;
 SELECT max(blocked_until),greatest(t,max(next_at)) INTO b,slot FROM meta_request_budgets WHERE p_keys ? key;
 IF b>t THEN RETURN jsonb_build_object('reserved',false,'waitMs',ceil(extract(epoch FROM b-t)*1000)); END IF;
 IF slot>t+interval '5 seconds' THEN RETURN jsonb_build_object('reserved',false,'waitMs',ceil(extract(epoch FROM slot-t)*1000)); END IF;
 UPDATE meta_request_budgets SET next_at=slot+make_interval(secs=>greatest(
   CASE WHEN key LIKE 'account:%' THEN 1.5 WHEN key LIKE 'token:%' THEN 1.0 ELSE 0.4 END,
   CASE WHEN pressure_until>t THEN interval_ms/1000.0 ELSE 0 END)),updated_at=t WHERE p_keys ? key;
 RETURN jsonb_build_object('reserved',true,'waitMs',greatest(0,ceil(extract(epoch FROM slot-t)*1000)));
END $$;
CREATE FUNCTION meta_record_pressure(p_key text,p_usage numeric,p_tier text,p_block_ms integer DEFAULT 0) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE t timestamptz:=clock_timestamp();
BEGIN
 INSERT INTO meta_request_budgets(key) VALUES(p_key) ON CONFLICT DO NOTHING;
 UPDATE meta_request_budgets SET usage_percent=p_usage,access_tier=COALESCE(p_tier,access_tier),
 interval_ms=CASE WHEN p_usage>=75 THEN 5000 ELSE interval_ms END,
 pressure_until=CASE WHEN p_usage>=75 THEN greatest(pressure_until,t+interval '10 minutes') ELSE pressure_until END,
 blocked_until=CASE WHEN p_block_ms>0 OR p_usage>=90 THEN greatest(blocked_until,t+make_interval(secs=>greatest(p_block_ms,CASE WHEN p_usage>=90 THEN 300000 ELSE 0 END)/1000.0)) ELSE blocked_until END,
 updated_at=t WHERE key=p_key;
END $$;
REVOKE ALL ON FUNCTION meta_reserve_request(jsonb),meta_record_pressure(text,numeric,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION meta_reserve_request(jsonb),meta_record_pressure(text,numeric,text,integer) TO service_role;
ALTER TABLE profit_sheet_jobs ADD COLUMN retry_at timestamptz;
CREATE OR REPLACE FUNCTION profit_sheet_claim(p_store text DEFAULT NULL,p_date date DEFAULT NULL)
RETURNS SETOF profit_sheet_jobs LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 RETURN QUERY WITH selected AS (
 SELECT store_id,date FROM profit_sheet_jobs
 WHERE (status='queued' OR (status='running' AND COALESCE(lease_until,'epoch'::timestamptz)<=now()))
 AND (retry_at IS NULL OR retry_at<=now())
 AND (p_store IS NULL OR store_id=p_store) AND (p_date IS NULL OR date=p_date)
 ORDER BY updated_at,date FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE profit_sheet_jobs j SET status='running',attempts=j.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '6 minutes',updated_at=now(),retry_at=null
 FROM selected s WHERE j.store_id=s.store_id AND j.date=s.date RETURNING j.*;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
