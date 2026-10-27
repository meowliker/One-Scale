BEGIN;
ALTER TABLE profit_sheet_discovery ADD COLUMN retry_at timestamptz, ADD COLUMN rerun_requested boolean NOT NULL DEFAULT false, ADD COLUMN attempts integer NOT NULL DEFAULT 0;
CREATE TABLE profit_sheet_creative_cache (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 account_id text NOT NULL, token_hash text NOT NULL, snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(store_id,account_id)
);
ALTER TABLE profit_sheet_creative_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profit_sheet_creative_cache FROM anon,authenticated;
GRANT ALL ON profit_sheet_creative_cache TO service_role;

CREATE OR REPLACE FUNCTION profit_sheet_queue_discovery(p_day date,p_store text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO profit_sheet_discovery(store_id,status,run_day)
 SELECT store_id,'queued',p_day FROM profit_sheet_stores WHERE p_store IS NULL OR store_id=p_store
 ON CONFLICT(store_id) DO UPDATE SET
 status=CASE WHEN profit_sheet_discovery.status='running' AND profit_sheet_discovery.lease_until>now() THEN 'running' ELSE 'queued' END,
 rerun_requested=profit_sheet_discovery.status='running' AND profit_sheet_discovery.lease_until>now(),
 run_day=p_day,error=null,
 attempts=CASE WHEN profit_sheet_discovery.status IN ('queued','running') THEN profit_sheet_discovery.attempts ELSE 0 END
 WHERE p_store IS NOT NULL OR profit_sheet_discovery.run_day IS DISTINCT FROM p_day;
 -- Do not clear retry_at: repeated UI requests must not bypass a provider cooldown.
END $$;
CREATE OR REPLACE FUNCTION profit_sheet_claim_discovery(p_store text DEFAULT NULL) RETURNS SETOF profit_sheet_discovery LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 RETURN QUERY WITH selected AS (SELECT store_id FROM profit_sheet_discovery WHERE
 (status='queued' OR (status='running' AND lease_until<now())) AND (retry_at IS NULL OR retry_at<=now())
 AND (p_store IS NULL OR store_id=p_store) ORDER BY checked_at NULLS FIRST FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE profit_sheet_discovery d SET status='running',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',
 error=null,rerun_requested=false,attempts=d.attempts+1 FROM selected s WHERE d.store_id=s.store_id RETURNING d.*;
END $$;

-- One linking list, with Profit Sheet retaining its own running dates and manual credentials.
CREATE FUNCTION profit_sheet_bridge_account() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s text; a text; changed integer; d date := (now() AT TIME ZONE 'UTC' - interval '6 hours')::date;
BEGIN
 IF current_setting('profit_sheet.bridging',true)='yes' THEN RETURN NULL; END IF;
 s:=COALESCE(NEW.store_id,OLD.store_id); a:=COALESCE(NEW.ad_account_id,OLD.ad_account_id);
 IF NOT EXISTS(SELECT 1 FROM stores WHERE id=s) THEN RETURN NULL; END IF;
 INSERT INTO profit_sheet_stores(store_id) VALUES(s) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM profit_sheet_stores WHERE store_id=s FOR UPDATE;
 IF TG_OP='DELETE' OR NOT NEW.is_active OR NEW.platform<>'meta' THEN
  DELETE FROM profit_sheet_accounts WHERE store_id=s AND account_id=a AND details->>'credentialSource'='integration';
  GET DIAGNOSTICS changed=ROW_COUNT;
 ELSE
  INSERT INTO profit_sheet_accounts(store_id,account_id,token_ciphertext,details)
  VALUES(s,a,'',jsonb_build_object('adAccountId',a,'name',NEW.ad_account_name,'currency',NEW.currency,'timezone',NEW.timezone,
    'credentialSource','integration','active',true,'start',to_char(date_trunc('month',d),'YYYY-MM-DD')||'T00:00','end','','hasToken',true))
  ON CONFLICT(store_id,account_id) DO UPDATE SET details=profit_sheet_accounts.details ||
    jsonb_build_object('name',NEW.ad_account_name,'currency',NEW.currency,'timezone',NEW.timezone)
  WHERE profit_sheet_accounts.details->>'credentialSource'='integration' AND
   (profit_sheet_accounts.details->>'name',profit_sheet_accounts.details->>'currency',profit_sheet_accounts.details->>'timezone') IS DISTINCT FROM (NEW.ad_account_name,NEW.currency,NEW.timezone);
  GET DIAGNOSTICS changed=ROW_COUNT;
 END IF;
 IF changed>0 THEN
  UPDATE profit_sheet_stores SET version=version+1,updated_at=now() WHERE store_id=s;
  PERFORM profit_sheet_queue_discovery(d,s);
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER profit_sheet_bridge_account AFTER INSERT OR UPDATE OR DELETE ON store_ad_accounts FOR EACH ROW EXECUTE FUNCTION profit_sheet_bridge_account();

-- Keep the reverse direction atomic too. Discovery publishes must not enqueue themselves.
ALTER FUNCTION profit_sheet_save(text,integer,jsonb,jsonb,jsonb) RENAME TO profit_sheet_save_config_v050;
CREATE OR REPLACE FUNCTION profit_sheet_save_config_v050(p_store text,p_version integer,p_settings jsonb,p_accounts jsonb,p_products jsonb)
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
  IF current_setting('profit_sheet.discovery_publish',true)='yes' THEN CONTINUE; END IF;
  IF p->>'source'='auto' AND COALESCE((p->>'manualOverride')::boolean,false)=false
     AND EXISTS(SELECT 1 FROM profit_sheet_products old WHERE old.store_id=p_store AND old.id=p->>'id' AND (old.details->>'source' IS DISTINCT FROM 'auto' OR COALESCE((old.details->>'manualOverride')::boolean,false))) THEN CONTINUE; END IF;
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
CREATE FUNCTION profit_sheet_save(p_store text,p_version integer,p_settings jsonb,p_accounts jsonb,p_products jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v integer; old_config jsonb; a jsonb; prior_flag text; changed boolean;
BEGIN
 INSERT INTO profit_sheet_stores(store_id) VALUES(p_store) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM profit_sheet_stores WHERE store_id=p_store FOR UPDATE;
 old_config:=profit_sheet_config(p_store);
 changed:=old_config->'products' IS DISTINCT FROM p_products OR
  (SELECT COALESCE(jsonb_agg(x->'details' ORDER BY x->'details'->>'adAccountId'),'[]') FROM jsonb_array_elements(old_config->'accounts') x)
  IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(x-'tokenCiphertext' ORDER BY x->>'adAccountId'),'[]') FROM jsonb_array_elements(p_accounts) x);
 v:=profit_sheet_save_config_v050(p_store,p_version,p_settings,p_accounts,p_products);
 prior_flag:=current_setting('profit_sheet.bridging',true);
 PERFORM set_config('profit_sheet.bridging','yes',true);
 DELETE FROM store_ad_accounts a WHERE a.store_id=p_store AND a.platform='meta'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(old_config->'accounts') x WHERE x->'details'->>'adAccountId'=a.ad_account_id AND x->'details'->>'credentialSource'='integration')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_accounts) x WHERE x->>'adAccountId'=a.ad_account_id);
 FOR a IN SELECT * FROM jsonb_array_elements(p_accounts) WHERE value->>'credentialSource'='integration' LOOP
  INSERT INTO store_ad_accounts(store_id,ad_account_id,ad_account_name,platform,currency,timezone,is_active)
  VALUES(p_store,a->>'adAccountId',a->>'name','meta',a->>'currency',a->>'timezone',true)
  ON CONFLICT(store_id,ad_account_id) DO UPDATE SET ad_account_name=EXCLUDED.ad_account_name,currency=EXCLUDED.currency,timezone=EXCLUDED.timezone,is_active=true;
 END LOOP;
 PERFORM set_config('profit_sheet.bridging',COALESCE(prior_flag,''),true);
 IF changed AND current_setting('profit_sheet.discovery_publish',true) IS DISTINCT FROM 'yes' THEN
  PERFORM profit_sheet_queue_discovery((now() AT TIME ZONE 'UTC' - interval '6 hours')::date,p_store);
 END IF;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION profit_sheet_finish_discovery(p_store text,p_lease uuid,p_version integer,p_accounts jsonb,p_products jsonb,p_report jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE pending boolean; prior_flag text;
BEGIN
 PERFORM 1 FROM profit_sheet_stores WHERE store_id=p_store AND version=p_version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Settings changed during discovery'; END IF;
 SELECT rerun_requested INTO pending FROM profit_sheet_discovery WHERE store_id=p_store AND lease=p_lease AND status='running' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Discovery lease expired'; END IF;
 prior_flag:=current_setting('profit_sheet.discovery_publish',true);
 PERFORM set_config('profit_sheet.discovery_publish','yes',true);
 IF p_products IS NOT NULL THEN PERFORM profit_sheet_save(p_store,p_version,NULL,p_accounts,p_products); END IF;
 PERFORM set_config('profit_sheet.discovery_publish',COALESCE(prior_flag,''),true);
 INSERT INTO profit_sheet_discovery_history(store_id,report) VALUES(p_store,p_report);
 UPDATE profit_sheet_discovery SET status=CASE WHEN pending OR p_report->>'retryAt' IS NOT NULL THEN 'queued' WHEN COALESCE((p_report->>'metaComplete')::boolean,true) THEN 'success' ELSE 'partial' END,
 retry_at=(p_report->>'retryAt')::timestamptz,lease_until=null,checked_at=now(),report=p_report,error=null WHERE store_id=p_store;
END $$;
REVOKE ALL ON FUNCTION profit_sheet_save(text,integer,jsonb,jsonb,jsonb),profit_sheet_save_config_v050(text,integer,jsonb,jsonb,jsonb),profit_sheet_bridge_account() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_save(text,integer,jsonb,jsonb,jsonb) TO service_role;
-- Reconcile existing linked accounts without overwriting schedules, products or manual tokens.
UPDATE store_ad_accounts SET is_active=is_active WHERE platform='meta' AND is_active;
NOTIFY pgrst,'reload schema';
COMMIT;
