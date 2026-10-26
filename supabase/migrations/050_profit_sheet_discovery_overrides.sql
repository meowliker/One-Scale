BEGIN;
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
NOTIFY pgrst,'reload schema';
COMMIT;
