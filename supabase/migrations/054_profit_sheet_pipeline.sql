BEGIN;
ALTER TABLE profit_sheet_jobs ADD COLUMN request_kind text NOT NULL DEFAULT 'auto' CHECK(request_kind IN ('auto','manual'));
-- Old automatic month-wide queues must not resume after rollout; saved reports remain intact.
DELETE FROM profit_sheet_jobs WHERE status IN ('queued','error') AND date < (now() AT TIME ZONE 'UTC' - interval '6 hours')::date-2;
CREATE OR REPLACE FUNCTION profit_sheet_enqueue(p_store text,p_dates jsonb) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d text; today date:=(now() AT TIME ZONE 'UTC' - interval '6 hours')::date; manual boolean:=current_setting('profit_sheet.manual',true)='yes';
BEGIN
 IF NOT COALESCE(manual,false) AND NOT EXISTS(SELECT 1 FROM profit_sheet_accounts WHERE store_id=p_store) THEN RETURN; END IF;
 FOR d IN SELECT jsonb_array_elements_text(p_dates) LOOP
 IF NOT COALESCE(manual,false) AND (d::date<today-2 OR d::date>today) THEN CONTINUE; END IF;
 INSERT INTO profit_sheet_jobs(store_id,date,request_kind) VALUES(p_store,d::date,CASE WHEN manual THEN 'manual' ELSE 'auto' END)
 ON CONFLICT(store_id,date) DO UPDATE SET status='queued',error=null,attempts=0,updated_at=now(),request_kind=CASE WHEN manual THEN 'manual' ELSE profit_sheet_jobs.request_kind END
 WHERE profit_sheet_jobs.status<>'running' OR profit_sheet_jobs.lease_until<now();
 END LOOP;
END $$;

CREATE FUNCTION profit_sheet_enqueue_requested(p_store text,p_dates jsonb,p_manual boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE prior text;
BEGIN
 prior:=current_setting('profit_sheet.manual',true);
 PERFORM set_config('profit_sheet.manual',CASE WHEN p_manual THEN 'yes' ELSE 'no' END,true);
 PERFORM profit_sheet_enqueue(p_store,p_dates);
 PERFORM set_config('profit_sheet.manual',COALESCE(prior,''),true);
END $$;

CREATE OR REPLACE FUNCTION profit_sheet_enqueue_missing(p_store text,p_dates jsonb,p_scope text DEFAULT 'store',p_finance_version integer DEFAULT 0,p_meta_version integer DEFAULT 0,p_attribution_version integer DEFAULT 0)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d text; v integer; n integer:=0; changed integer; today date:=(now() AT TIME ZONE 'UTC' - interval '6 hours')::date;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM profit_sheet_accounts WHERE store_id=p_store) THEN RETURN 0; END IF;
 SELECT version INTO STRICT v FROM profit_sheet_stores WHERE store_id=p_store;
 FOR d IN SELECT jsonb_array_elements_text(p_dates) LOOP
  IF d::date<today-2 OR d::date>today THEN CONTINUE; END IF;
  IF NOT EXISTS (SELECT 1 FROM profit_sheet_days WHERE store_id=p_store AND date=d::date AND scope_id=p_scope AND config_version=v
   AND (p_finance_version=0 OR COALESCE((metrics->>'financeVersion')::integer,0)>=p_finance_version)
   AND (p_meta_version=0 OR COALESCE((metrics->>'metaVersion')::integer,0)>=p_meta_version)
   AND (p_attribution_version=0 OR COALESCE((metrics->>'attributionVersion')::integer,0)>=p_attribution_version)) THEN
   INSERT INTO profit_sheet_jobs(store_id,date) VALUES(p_store,d::date)
   ON CONFLICT(store_id,date) DO UPDATE SET status='queued',error=null,attempts=0,updated_at=now() WHERE profit_sheet_jobs.status='success';
   GET DIAGNOSTICS changed = ROW_COUNT; n:=n+changed;
  END IF;
 END LOOP;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION profit_sheet_queue_discovery(p_day date,p_store text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 DELETE FROM profit_sheet_jobs j WHERE (p_store IS NULL OR j.store_id=p_store) AND j.request_kind='auto' AND j.status<>'running' AND NOT EXISTS(SELECT 1 FROM profit_sheet_accounts a WHERE a.store_id=j.store_id);
 -- An empty setup waits for its first account link, rather than discovering in the background.
 DELETE FROM profit_sheet_discovery d WHERE (p_store IS NULL OR d.store_id=p_store)
 AND NOT EXISTS(SELECT 1 FROM profit_sheet_accounts a WHERE a.store_id=d.store_id);
 INSERT INTO profit_sheet_discovery(store_id,status,run_day)
 SELECT s.store_id,'queued',p_day FROM profit_sheet_stores s WHERE (p_store IS NULL OR s.store_id=p_store)
 AND EXISTS(SELECT 1 FROM profit_sheet_accounts a WHERE a.store_id=s.store_id)
 ON CONFLICT(store_id) DO UPDATE SET
 status=CASE WHEN profit_sheet_discovery.status='running' AND profit_sheet_discovery.lease_until>now() THEN 'running' ELSE 'queued' END,
 rerun_requested=profit_sheet_discovery.status='running' AND profit_sheet_discovery.lease_until>now(),
 run_day=p_day,error=null,
 attempts=CASE WHEN profit_sheet_discovery.status IN ('queued','running') THEN profit_sheet_discovery.attempts ELSE 0 END
 WHERE p_store IS NOT NULL OR profit_sheet_discovery.run_day IS DISTINCT FROM p_day;
 -- Do not clear retry_at: repeated UI requests must not bypass a provider cooldown.
END $$;
CREATE OR REPLACE FUNCTION profit_sheet_bridge_account() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE s text; a text; changed integer; d date := (now() AT TIME ZONE 'UTC' - interval '6 hours')::date;
BEGIN
 IF current_setting('profit_sheet.bridging',true)='yes' THEN RETURN NULL; END IF;
 s:=COALESCE(NEW.store_id,OLD.store_id); a:=COALESCE(NEW.ad_account_id,OLD.ad_account_id);
 IF NOT EXISTS(SELECT 1 FROM stores WHERE id=s) THEN RETURN NULL; END IF;
 INSERT INTO profit_sheet_stores(store_id) VALUES(s) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM profit_sheet_stores WHERE store_id=s FOR UPDATE;
 IF TG_OP='DELETE' OR NOT NEW.is_active OR NEW.platform<>'meta' THEN
  DELETE FROM profit_sheet_accounts WHERE store_id=s AND account_id=a;
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
  PERFORM profit_sheet_enqueue(s,jsonb_build_array(d-2,d-1,d));
 END IF;
 RETURN NULL;
END $$;
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
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_accounts) retained_account WHERE retained_account->>'adAccountId'=old_assignment.account_id) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'assignments') n WHERE n->>'accountId'=old_assignment.account_id) THEN
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
CREATE OR REPLACE FUNCTION profit_sheet_save(p_store text,p_version integer,p_settings jsonb,p_accounts jsonb,p_products jsonb)
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
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(old_config->'accounts') x WHERE x->'details'->>'adAccountId'=a.ad_account_id)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_accounts) x WHERE x->>'adAccountId'=a.ad_account_id);
 FOR a IN SELECT * FROM jsonb_array_elements(p_accounts) WHERE value->>'credentialSource'='integration' LOOP
  INSERT INTO store_ad_accounts(store_id,ad_account_id,ad_account_name,platform,currency,timezone,is_active)
  VALUES(p_store,a->>'adAccountId',a->>'name','meta',a->>'currency',a->>'timezone',true)
  ON CONFLICT(store_id,ad_account_id) DO UPDATE SET ad_account_name=EXCLUDED.ad_account_name,currency=EXCLUDED.currency,timezone=EXCLUDED.timezone,is_active=true;
 END LOOP;
 PERFORM set_config('profit_sheet.bridging',COALESCE(prior_flag,''),true);
 IF changed AND current_setting('profit_sheet.discovery_publish',true) IS DISTINCT FROM 'yes' THEN
  PERFORM profit_sheet_queue_discovery((now() AT TIME ZONE 'UTC' - interval '6 hours')::date,p_store);
  PERFORM profit_sheet_enqueue(p_store,jsonb_build_array(((now() AT TIME ZONE 'UTC' - interval '6 hours')::date)-2,((now() AT TIME ZONE 'UTC' - interval '6 hours')::date)-1,(now() AT TIME ZONE 'UTC' - interval '6 hours')::date));
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
 IF p_products IS NOT NULL THEN
  PERFORM profit_sheet_save(p_store,p_version,NULL,p_accounts,p_products);
  PERFORM profit_sheet_enqueue(p_store,jsonb_build_array(((now() AT TIME ZONE 'UTC' - interval '6 hours')::date)-2,((now() AT TIME ZONE 'UTC' - interval '6 hours')::date)-1,(now() AT TIME ZONE 'UTC' - interval '6 hours')::date));
 END IF;
 PERFORM set_config('profit_sheet.discovery_publish',COALESCE(prior_flag,''),true);
 INSERT INTO profit_sheet_discovery_history(store_id,report) VALUES(p_store,p_report);
 UPDATE profit_sheet_discovery SET status=CASE WHEN pending OR p_report->>'retryAt' IS NOT NULL THEN 'queued' WHEN COALESCE((p_report->>'metaComplete')::boolean,true) THEN 'success' ELSE 'partial' END,
 retry_at=(p_report->>'retryAt')::timestamptz,lease_until=null,checked_at=now(),report=p_report,error=null WHERE store_id=p_store;
END $$;

-- Serialize the short claim transaction, not provider calls. Both workers use the
-- same lock, so checking and reserving a store stage cannot race across instances.
CREATE OR REPLACE FUNCTION profit_sheet_claim(p_store text DEFAULT NULL,p_date date DEFAULT NULL)
RETURNS SETOF profit_sheet_jobs LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('profit_sheet_pipeline_claim'));
 DELETE FROM profit_sheet_jobs j WHERE j.request_kind='auto' AND (j.status='queued' OR (j.status='running' AND j.lease_until<now()))
 AND (j.date<(now() AT TIME ZONE 'UTC' - interval '6 hours')::date-2 OR NOT EXISTS(SELECT 1 FROM profit_sheet_accounts a WHERE a.store_id=j.store_id));
 RETURN QUERY WITH selected AS (
 SELECT j.store_id,j.date FROM profit_sheet_jobs j
 WHERE (j.status='queued' OR (j.status='running' AND COALESCE(j.lease_until,'epoch'::timestamptz)<=now()))
 AND (j.retry_at IS NULL OR j.retry_at<=now())
 AND (p_store IS NULL OR j.store_id=p_store) AND (p_date IS NULL OR j.date=p_date)
 AND (j.request_kind='manual' OR (j.date BETWEEN (now() AT TIME ZONE 'UTC' - interval '6 hours')::date-2 AND (now() AT TIME ZONE 'UTC' - interval '6 hours')::date
   AND EXISTS(SELECT 1 FROM profit_sheet_accounts a WHERE a.store_id=j.store_id)))
 AND NOT EXISTS(SELECT 1 FROM profit_sheet_discovery d WHERE d.store_id=j.store_id AND d.status IN ('queued','running'))
 AND NOT EXISTS(SELECT 1 FROM profit_sheet_jobs r WHERE r.store_id=j.store_id AND r.status='running' AND r.lease_until>now())
 ORDER BY j.updated_at,j.date FOR UPDATE OF j SKIP LOCKED LIMIT 1
 ) UPDATE profit_sheet_jobs j SET status='running',attempts=j.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '6 minutes',updated_at=now(),retry_at=null
 FROM selected s WHERE j.store_id=s.store_id AND j.date=s.date RETURNING j.*;
END $$;
CREATE OR REPLACE FUNCTION profit_sheet_claim_discovery(p_store text DEFAULT NULL)
RETURNS SETOF profit_sheet_discovery LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('profit_sheet_pipeline_claim'));
 RETURN QUERY WITH selected AS (
 SELECT d.store_id FROM profit_sheet_discovery d
 WHERE (d.status='queued' OR (d.status='running' AND d.lease_until<now()))
 AND (d.retry_at IS NULL OR d.retry_at<=now()) AND (p_store IS NULL OR d.store_id=p_store)
 AND EXISTS(SELECT 1 FROM profit_sheet_accounts a WHERE a.store_id=d.store_id)
 AND NOT EXISTS(SELECT 1 FROM profit_sheet_jobs j WHERE j.store_id=d.store_id AND j.status='running' AND j.lease_until>now())
 ORDER BY d.checked_at NULLS FIRST FOR UPDATE OF d SKIP LOCKED LIMIT 1
 ) UPDATE profit_sheet_discovery d SET status='running',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',error=null,rerun_requested=false,attempts=d.attempts+1
 FROM selected s WHERE d.store_id=s.store_id RETURNING d.*;
END $$;
CREATE FUNCTION profit_sheet_unlink_account(p_store text,p_account text)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE removed integer;
BEGIN
 PERFORM 1 FROM profit_sheet_stores WHERE store_id=p_store FOR UPDATE;
 DELETE FROM store_ad_accounts WHERE store_id=p_store AND ad_account_id=p_account AND platform='meta';
 -- Also remove legacy/manual duplicates, including when the integration link is already absent.
 DELETE FROM profit_sheet_accounts WHERE store_id=p_store AND account_id=p_account;
 GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed>0 THEN
  UPDATE profit_sheet_stores SET version=version+1,updated_at=now() WHERE store_id=p_store;
  PERFORM profit_sheet_queue_discovery((now() AT TIME ZONE 'UTC' - interval '6 hours')::date,p_store);
 END IF;
END $$;


REVOKE ALL ON FUNCTION profit_sheet_enqueue_requested(text,jsonb,boolean),profit_sheet_unlink_account(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_enqueue_requested(text,jsonb,boolean),profit_sheet_unlink_account(text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
