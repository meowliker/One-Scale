BEGIN;
ALTER TABLE profit_sheet_products ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE profit_sheet_assignments ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
CREATE TABLE profit_sheet_exclusions (store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,key text NOT NULL,label text NOT NULL,created_at timestamptz DEFAULT now(),PRIMARY KEY(store_id,key));
CREATE TABLE profit_sheet_discovery (store_id text PRIMARY KEY REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,status text NOT NULL DEFAULT 'idle',run_day date,lease uuid,lease_until timestamptz,checked_at timestamptz,report jsonb NOT NULL DEFAULT '{}',error text);
CREATE TABLE profit_sheet_discovery_history (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,created_at timestamptz NOT NULL DEFAULT now(),report jsonb NOT NULL);
CREATE TABLE profit_sheet_meta_inventory (store_id text PRIMARY KEY REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,accounts jsonb NOT NULL,businesses jsonb NOT NULL,warnings jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE profit_sheet_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_discovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_discovery_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_meta_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profit_sheet_exclusions,profit_sheet_discovery,profit_sheet_discovery_history,profit_sheet_meta_inventory FROM anon,authenticated;
GRANT ALL ON profit_sheet_exclusions,profit_sheet_discovery,profit_sheet_discovery_history,profit_sheet_meta_inventory TO service_role;
GRANT USAGE ON SEQUENCE profit_sheet_discovery_history_id_seq TO service_role;
CREATE OR REPLACE FUNCTION profit_sheet_save(p_store text,p_version integer,p_settings jsonb,p_accounts jsonb,p_products jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v integer; a jsonb; p jsonb; b jsonb; old_product record; old_assignment record;
BEGIN
 INSERT INTO profit_sheet_stores(store_id) VALUES(p_store) ON CONFLICT DO NOTHING;
 SELECT version INTO v FROM profit_sheet_stores WHERE store_id=p_store FOR UPDATE;
 IF p_version IS NOT NULL AND p_version<>v THEN RAISE EXCEPTION 'Settings changed. Reload and retry.'; END IF;
 -- Persistent opt-outs are recorded before replacing the configuration.
 FOR old_product IN SELECT * FROM profit_sheet_products WHERE store_id=p_store LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_products) n WHERE n->>'id'=old_product.id) THEN
   INSERT INTO profit_sheet_exclusions(store_id,key,label) SELECT p_store,'product:'||value,old_product.name FROM jsonb_array_elements_text(old_product.shopify_ids) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 FOR p IN SELECT * FROM jsonb_array_elements(p_products) LOOP
  FOR old_assignment IN SELECT * FROM profit_sheet_assignments WHERE store_id=p_store AND product_id=p->>'id' LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'assignments') n WHERE n->>'accountId'=old_assignment.account_id) THEN
    INSERT INTO profit_sheet_exclusions(store_id,key,label) VALUES(p_store,'account:'||(p->>'id')||':'||old_assignment.account_id,p->>'name') ON CONFLICT DO NOTHING;
   END IF;
   FOR b IN SELECT * FROM jsonb_array_elements(p->'assignments') LOOP
    IF b->>'accountId'=old_assignment.account_id THEN
     INSERT INTO profit_sheet_exclusions(store_id,key,label)
     SELECT p_store,'campaign:'||(p->>'id')||':'||old_assignment.account_id||':'||value,p->>'name'
     FROM jsonb_array_elements_text(old_assignment.campaign_ids)
     WHERE NOT COALESCE(b->'campaignIds','[]') ? value OR COALESCE(b->'excludedCampaignIds','[]') ? value
     ON CONFLICT DO NOTHING;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 DELETE FROM profit_sheet_assignments WHERE store_id=p_store;
 DELETE FROM profit_sheet_products WHERE store_id=p_store;
 DELETE FROM profit_sheet_accounts WHERE store_id=p_store;
 FOR a IN SELECT * FROM jsonb_array_elements(p_accounts) LOOP
  INSERT INTO profit_sheet_accounts VALUES(p_store,a->>'adAccountId',a->>'tokenCiphertext',a-'tokenCiphertext');
 END LOOP;
 FOR p IN SELECT * FROM jsonb_array_elements(p_products) LOOP
  INSERT INTO profit_sheet_products(store_id,id,name,links,shopify_ids,start_date,details) VALUES(p_store,p->>'id',p->>'name',p->'links',p->'shopifyIds',NULLIF(p->>'startDate','')::date,p-ARRAY['id','name','links','shopifyIds','startDate','assignments']);
  FOR b IN SELECT * FROM jsonb_array_elements(p->'assignments') LOOP
   INSERT INTO profit_sheet_assignments(store_id,product_id,account_id,campaign_ids,details) VALUES(p_store,p->>'id',b->>'accountId',b->'campaignIds',b-ARRAY['accountId','campaignIds']);
  END LOOP;
 END LOOP;
 UPDATE profit_sheet_stores SET saved_from=CASE WHEN p_settings IS NULL THEN saved_from ELSE (p_settings->>'savedFrom')::date END,
 saved_to=CASE WHEN p_settings IS NULL THEN saved_to ELSE (p_settings->>'savedTo')::date END,
 end_today=CASE WHEN p_settings IS NULL THEN end_today ELSE COALESCE((p_settings->>'endToday')::boolean,true) END,version=v+1,updated_at=now() WHERE store_id=p_store;
 RETURN v+1;
END $$;
CREATE OR REPLACE FUNCTION profit_sheet_config(p_store text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('settings',jsonb_build_object('savedFrom',s.saved_from,'savedTo',s.saved_to,'endToday',s.end_today),'version',s.version,'currency',s.currency,
 'accounts',COALESCE((SELECT jsonb_agg(jsonb_build_object('details',a.details,'token_ciphertext',a.token_ciphertext)) FROM profit_sheet_accounts a WHERE a.store_id=s.store_id),'[]'::jsonb),
 'products',COALESCE((SELECT jsonb_agg(p.details || jsonb_build_object('id',p.id,'name',p.name,'links',p.links,'shopifyIds',p.shopify_ids,'startDate',p.start_date,'assignments',COALESCE((SELECT jsonb_agg(b.details || jsonb_build_object('accountId',b.account_id,'campaignIds',b.campaign_ids)) FROM profit_sheet_assignments b WHERE b.store_id=p.store_id AND b.product_id=p.id),'[]'::jsonb))) FROM profit_sheet_products p WHERE p.store_id=s.store_id),'[]'::jsonb))
 FROM profit_sheet_stores s WHERE s.store_id=p_store;
$$;

CREATE FUNCTION profit_sheet_queue_discovery(p_day date,p_store text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO profit_sheet_discovery(store_id,status,run_day)
 SELECT store_id,'queued',p_day FROM profit_sheet_stores WHERE p_store IS NULL OR store_id=p_store
 ON CONFLICT(store_id) DO UPDATE SET status='queued',run_day=p_day,error=null
 WHERE (p_store IS NOT NULL OR profit_sheet_discovery.run_day IS DISTINCT FROM p_day) AND (profit_sheet_discovery.status<>'running' OR profit_sheet_discovery.lease_until<now());
END $$;
CREATE FUNCTION profit_sheet_claim_discovery(p_store text DEFAULT NULL) RETURNS SETOF profit_sheet_discovery LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 RETURN QUERY WITH selected AS (SELECT store_id FROM profit_sheet_discovery WHERE (status='queued' OR (status='running' AND lease_until<now())) AND (p_store IS NULL OR store_id=p_store) ORDER BY checked_at NULLS FIRST FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE profit_sheet_discovery d SET status='running',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',error=null FROM selected s WHERE d.store_id=s.store_id RETURNING d.*;
END $$;
CREATE FUNCTION profit_sheet_finish_discovery(p_store text,p_lease uuid,p_version integer,p_accounts jsonb,p_products jsonb,p_report jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM profit_sheet_discovery WHERE store_id=p_store AND lease=p_lease AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Discovery lease expired'; END IF;
 PERFORM 1 FROM profit_sheet_stores WHERE store_id=p_store AND version=p_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Settings changed during discovery'; END IF;
 IF p_products IS NOT NULL THEN PERFORM profit_sheet_save(p_store,p_version,NULL,p_accounts,p_products); END IF;
 INSERT INTO profit_sheet_discovery_history(store_id,report) VALUES(p_store,p_report);
 UPDATE profit_sheet_discovery SET status='success',lease_until=null,checked_at=now(),report=p_report,error=null WHERE store_id=p_store;
END $$;
REVOKE ALL ON FUNCTION profit_sheet_queue_discovery(date,text),profit_sheet_claim_discovery(text),profit_sheet_finish_discovery(text,uuid,integer,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_queue_discovery(date,text),profit_sheet_claim_discovery(text),profit_sheet_finish_discovery(text,uuid,integer,jsonb,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
