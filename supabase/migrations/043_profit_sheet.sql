BEGIN;
CREATE TABLE IF NOT EXISTS profit_sheet_stores (
 store_id text PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
 saved_from date, saved_to date, end_today boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, currency text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS profit_sheet_accounts (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 account_id text NOT NULL, token_ciphertext text NOT NULL, details jsonb NOT NULL,
 PRIMARY KEY(store_id, account_id)
);
CREATE TABLE IF NOT EXISTS profit_sheet_products (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 id text NOT NULL, name text NOT NULL, links jsonb NOT NULL DEFAULT '[]', shopify_ids jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(store_id,id)
);
CREATE TABLE IF NOT EXISTS profit_sheet_assignments (
 store_id text NOT NULL, product_id text NOT NULL, account_id text NOT NULL,
 campaign_ids jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(store_id,product_id,account_id),
 FOREIGN KEY(store_id,product_id) REFERENCES profit_sheet_products(store_id,id) ON DELETE CASCADE,
 FOREIGN KEY(store_id,account_id) REFERENCES profit_sheet_accounts(store_id,account_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS profit_sheet_days (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 date date NOT NULL, scope_id text NOT NULL, metrics jsonb NOT NULL, warnings jsonb NOT NULL DEFAULT '[]',
 currency text NOT NULL, config_version integer NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,date,scope_id)
);
CREATE TABLE IF NOT EXISTS profit_sheet_jobs (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE, date date NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','success','error')),
 attempts integer NOT NULL DEFAULT 0, error text, lease_id uuid, lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(store_id,date)
);
CREATE INDEX IF NOT EXISTS profit_sheet_jobs_pending ON profit_sheet_jobs(status,updated_at);
ALTER TABLE profit_sheet_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profit_sheet_stores,profit_sheet_accounts,profit_sheet_products,profit_sheet_assignments,profit_sheet_days,profit_sheet_jobs FROM anon,authenticated;
GRANT ALL ON profit_sheet_stores,profit_sheet_accounts,profit_sheet_products,profit_sheet_assignments,profit_sheet_days,profit_sheet_jobs TO service_role;

CREATE OR REPLACE FUNCTION profit_sheet_save(p_store text,p_version integer,p_settings jsonb,p_accounts jsonb,p_products jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v integer; a jsonb; p jsonb; b jsonb;
BEGIN
 INSERT INTO profit_sheet_stores(store_id) VALUES(p_store) ON CONFLICT DO NOTHING;
 SELECT version INTO v FROM profit_sheet_stores WHERE store_id=p_store FOR UPDATE;
 IF p_version IS NOT NULL AND p_version<>v THEN RAISE EXCEPTION 'Settings changed. Reload and retry.'; END IF;
 DELETE FROM profit_sheet_assignments WHERE store_id=p_store;
 DELETE FROM profit_sheet_products WHERE store_id=p_store;
 DELETE FROM profit_sheet_accounts WHERE store_id=p_store;
 FOR a IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
  INSERT INTO profit_sheet_accounts VALUES(p_store,a->>'adAccountId',a->>'tokenCiphertext',a-'tokenCiphertext');
 END LOOP;
 FOR p IN SELECT * FROM jsonb_array_elements(p_products) LOOP
  INSERT INTO profit_sheet_products VALUES(p_store,p->>'id',p->>'name',p->'links',p->'shopifyIds');
  FOR b IN SELECT * FROM jsonb_array_elements(p->'assignments') LOOP
   INSERT INTO profit_sheet_assignments VALUES(p_store,p->>'id',b->>'accountId',b->'campaignIds');
  END LOOP;
 END LOOP;
 UPDATE profit_sheet_stores SET saved_from=CASE WHEN p_settings IS NULL THEN saved_from ELSE (p_settings->>'savedFrom')::date END,
 saved_to=CASE WHEN p_settings IS NULL THEN saved_to ELSE (p_settings->>'savedTo')::date END,
 end_today=CASE WHEN p_settings IS NULL THEN end_today ELSE COALESCE((p_settings->>'endToday')::boolean,true) END,version=v+1,updated_at=now() WHERE store_id=p_store;
 RETURN v+1;
END $$;
CREATE OR REPLACE FUNCTION profit_sheet_enqueue(p_store text,p_dates jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d text;
BEGIN
 FOR d IN SELECT jsonb_array_elements_text(p_dates) LOOP
 INSERT INTO profit_sheet_jobs(store_id,date) VALUES(p_store,d::date)
 ON CONFLICT(store_id,date) DO UPDATE SET status='queued',error=null,attempts=0,updated_at=now()
 WHERE profit_sheet_jobs.status<>'running' OR profit_sheet_jobs.lease_until<now();
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION profit_sheet_claim(p_store text DEFAULT NULL,p_date date DEFAULT NULL)
RETURNS SETOF profit_sheet_jobs LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 RETURN QUERY WITH selected AS (
 SELECT store_id,date FROM profit_sheet_jobs
 WHERE ((status='queued') OR (status='running' AND lease_until<now()))
 AND (p_store IS NULL OR store_id=p_store) AND (p_date IS NULL OR date=p_date)
 ORDER BY updated_at,date FOR UPDATE SKIP LOCKED LIMIT 1
 ) UPDATE profit_sheet_jobs j SET status='running',attempts=j.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '6 minutes',updated_at=now()
 FROM selected s WHERE j.store_id=s.store_id AND j.date=s.date RETURNING j.*;
END $$;
CREATE OR REPLACE FUNCTION profit_sheet_publish(p_store text,p_date date,p_lease uuid,p_version integer,p_currency text,p_rows jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
 PERFORM 1 FROM profit_sheet_jobs WHERE store_id=p_store AND date=p_date AND lease_id=p_lease AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sync lease expired'; END IF;
 PERFORM 1 FROM profit_sheet_stores WHERE store_id=p_store AND version=p_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Settings changed during sync. Retry.'; END IF;
 DELETE FROM profit_sheet_days WHERE store_id=p_store AND date=p_date;
 FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
 INSERT INTO profit_sheet_days(store_id,date,scope_id,metrics,warnings,currency,config_version)
 VALUES(p_store,p_date,r->>'scopeId',r->'metrics',r->'warnings',p_currency,p_version);
 END LOOP;
 UPDATE profit_sheet_stores SET currency=p_currency WHERE store_id=p_store;
 UPDATE profit_sheet_jobs SET status='success',error=null,lease_until=null,updated_at=now() WHERE store_id=p_store AND date=p_date AND lease_id=p_lease;
END $$;
REVOKE ALL ON FUNCTION profit_sheet_save(text,integer,jsonb,jsonb,jsonb),profit_sheet_enqueue(text,jsonb),profit_sheet_claim(text,date),profit_sheet_publish(text,date,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_save(text,integer,jsonb,jsonb,jsonb),profit_sheet_enqueue(text,jsonb),profit_sheet_claim(text,date),profit_sheet_publish(text,date,uuid,integer,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
CREATE OR REPLACE FUNCTION profit_sheet_config(p_store text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('settings',jsonb_build_object('savedFrom',s.saved_from,'savedTo',s.saved_to,'endToday',s.end_today),'version',s.version,'currency',s.currency,
 'accounts',COALESCE((SELECT jsonb_agg(jsonb_build_object('details',a.details,'token_ciphertext',a.token_ciphertext)) FROM profit_sheet_accounts a WHERE a.store_id=s.store_id),'[]'::jsonb),
 'products',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'links',p.links,'shopifyIds',p.shopify_ids,'assignments',COALESCE((SELECT jsonb_agg(jsonb_build_object('accountId',b.account_id,'campaignIds',b.campaign_ids)) FROM profit_sheet_assignments b WHERE b.store_id=p.store_id AND b.product_id=p.id),'[]'::jsonb))) FROM profit_sheet_products p WHERE p.store_id=s.store_id),'[]'::jsonb))
 FROM profit_sheet_stores s WHERE s.store_id=p_store;
$$;
REVOKE ALL ON FUNCTION profit_sheet_config(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_config(text) TO service_role;
NOTIFY pgrst,'reload schema';
