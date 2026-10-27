-- Execute after migration inside a transaction; always ROLLBACK.
DO $$
DECLARE s text:='test-mapping-'||gen_random_uuid(); other text:='test-mapping-'||gen_random_uuid(); cfg jsonb; v integer; l uuid; d date:=current_date; before_version integer;
BEGIN
 INSERT INTO stores(id,name,domain) VALUES(s,'Mapping test',s||'.myshopify.com'),(other,'Other',other||'.myshopify.com');
 INSERT INTO store_ad_accounts(store_id,ad_account_id,ad_account_name,platform,currency,timezone,is_active) VALUES(s,'act_1','One','meta','USD','UTC',true);
 IF NOT EXISTS(SELECT 1 FROM profit_sheet_accounts WHERE store_id=s AND account_id='act_1' AND details->>'credentialSource'='integration') THEN RAISE EXCEPTION 'Integration did not bridge'; END IF;
 IF EXISTS(SELECT 1 FROM profit_sheet_accounts WHERE store_id=other) THEN RAISE EXCEPTION 'Cross-store link'; END IF;
 UPDATE profit_sheet_accounts SET details=details||'{"start":"2020-01-01T10:00","active":false,"end":"2020-01-03T11:00"}' WHERE store_id=s;
 SELECT version INTO before_version FROM profit_sheet_stores WHERE store_id=s;
 UPDATE store_ad_accounts SET ad_account_name='Renamed' WHERE store_id=s;
 IF (SELECT details->>'start' FROM profit_sheet_accounts WHERE store_id=s)<>'2020-01-01T10:00' OR (SELECT details->>'active' FROM profit_sheet_accounts WHERE store_id=s)<>'false' THEN RAISE EXCEPTION 'Schedule overwritten'; END IF;
 IF (SELECT version FROM profit_sheet_stores WHERE store_id=s)<>before_version+1 THEN RAISE EXCEPTION 'Version not invalidated'; END IF;
 cfg:=profit_sheet_config(s);
 v:=profit_sheet_save(s,(cfg->>'version')::integer,null,'[{"adAccountId":"act_1","credentialSource":"integration","tokenCiphertext":"","name":"One","currency":"USD","timezone":"UTC","active":false,"start":"2020-01-01T10:00","end":"2020-01-03T11:00"},{"adAccountId":"act_2","credentialSource":"integration","tokenCiphertext":"","name":"Two","currency":"USD","timezone":"UTC","active":true,"start":"2020-01-01T10:00","end":""}]','[]');
 IF NOT EXISTS(SELECT 1 FROM store_ad_accounts WHERE store_id=s AND ad_account_id='act_2' AND is_active) THEN RAISE EXCEPTION 'Reverse link missing'; END IF;
 IF (SELECT count(*) FROM profit_sheet_accounts WHERE store_id=s)<>2 THEN RAISE EXCEPTION 'Bridge recursion'; END IF;
 SELECT lease INTO l FROM profit_sheet_claim_discovery(s);
 PERFORM profit_sheet_queue_discovery(d,s);
 IF NOT (SELECT rerun_requested FROM profit_sheet_discovery WHERE store_id=s) THEN RAISE EXCEPTION 'Running request lost'; END IF;
 PERFORM profit_sheet_finish_discovery(s,l,v,'[]',null,'{"metaComplete":true}');
 IF (SELECT status FROM profit_sheet_discovery WHERE store_id=s)<>'queued' THEN RAISE EXCEPTION 'Followup not queued'; END IF;
 SELECT lease INTO l FROM profit_sheet_claim_discovery(s);
 PERFORM profit_sheet_finish_discovery(s,l,v,'[]',null,jsonb_build_object('metaComplete',false,'retryAt',now()+interval '1 hour'));
 PERFORM profit_sheet_queue_discovery(d,s);
 IF EXISTS(SELECT 1 FROM profit_sheet_claim_discovery(s)) THEN RAISE EXCEPTION 'Cooldown bypassed'; END IF;
 UPDATE store_ad_accounts SET is_active=false WHERE store_id=s AND ad_account_id='act_2';
 IF EXISTS(SELECT 1 FROM profit_sheet_accounts WHERE store_id=s AND account_id='act_2') THEN RAISE EXCEPTION 'Disable did not unlink'; END IF;
 DELETE FROM store_ad_accounts WHERE store_id=s;
 IF EXISTS(SELECT 1 FROM profit_sheet_accounts WHERE store_id=s) THEN RAISE EXCEPTION 'Unlink not mirrored'; END IF;
 DELETE FROM stores WHERE id IN(s,other);
END $$;
