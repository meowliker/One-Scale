BEGIN;
ALTER TABLE profit_sheet_products ADD COLUMN IF NOT EXISTS start_date date;
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
  INSERT INTO profit_sheet_products(store_id,id,name,links,shopify_ids,start_date) VALUES(p_store,p->>'id',p->>'name',p->'links',p->'shopifyIds',NULLIF(p->>'startDate','')::date);
  FOR b IN SELECT * FROM jsonb_array_elements(p->'assignments') LOOP
   INSERT INTO profit_sheet_assignments VALUES(p_store,p->>'id',b->>'accountId',b->'campaignIds');
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
 'products',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'links',p.links,'shopifyIds',p.shopify_ids,'startDate',p.start_date,'assignments',COALESCE((SELECT jsonb_agg(jsonb_build_object('accountId',b.account_id,'campaignIds',b.campaign_ids)) FROM profit_sheet_assignments b WHERE b.store_id=p.store_id AND b.product_id=p.id),'[]'::jsonb))) FROM profit_sheet_products p WHERE p.store_id=s.store_id),'[]'::jsonb))
 FROM profit_sheet_stores s WHERE s.store_id=p_store;
$$;
REVOKE ALL ON FUNCTION profit_sheet_config(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_config(text) TO service_role;
NOTIFY pgrst,'reload schema';

-- Rebuild existing product reports using full matched-order revenue.
UPDATE profit_sheet_stores s SET version=version+1 WHERE EXISTS(SELECT 1 FROM profit_sheet_products p WHERE p.store_id=s.store_id);
COMMIT;
