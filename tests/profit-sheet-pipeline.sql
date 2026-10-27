-- Execute transactionally after migration 054 and ROLLBACK fixtures.
DO $$
DECLARE s text:='test-pipeline-'||gen_random_uuid(); d date:=(now() AT TIME ZONE 'UTC' - interval '6 hours')::date; l uuid; v integer; n integer;
BEGIN
 INSERT INTO stores(id,name,domain) VALUES(s,'Pipeline test',s||'.myshopify.com');
 INSERT INTO profit_sheet_stores(store_id) VALUES(s);
 PERFORM profit_sheet_enqueue(s,jsonb_build_array(d));
 PERFORM profit_sheet_queue_discovery(d,s);
 IF EXISTS(SELECT 1 FROM profit_sheet_jobs WHERE store_id=s) OR EXISTS(SELECT 1 FROM profit_sheet_discovery WHERE store_id=s) THEN RAISE EXCEPTION 'Empty setup started automatically'; END IF;
 INSERT INTO store_ad_accounts(store_id,ad_account_id,ad_account_name,platform,currency,timezone,is_active) VALUES(s,'act_1','Account','meta','USD','UTC',true);
 PERFORM profit_sheet_enqueue(s,(SELECT jsonb_agg(x::date) FROM generate_series(d-26,d,interval '1 day') x));
 IF (SELECT count(*) FROM profit_sheet_jobs WHERE store_id=s)<>3 THEN RAISE EXCEPTION 'Automatic range not restricted to three days'; END IF;
 PERFORM profit_sheet_enqueue_missing(s,jsonb_build_array(d-20,d-3));
 IF (SELECT count(*) FROM profit_sheet_jobs WHERE store_id=s)<>3 THEN RAISE EXCEPTION 'Missing queue expanded history'; END IF;
 IF EXISTS(SELECT 1 FROM profit_sheet_claim(s)) THEN RAISE EXCEPTION 'Reports overtook queued discovery'; END IF;
 SELECT lease INTO l FROM profit_sheet_claim_discovery(s);
 IF l IS NULL THEN RAISE EXCEPTION 'Discovery not claimable'; END IF;
 IF EXISTS(SELECT 1 FROM profit_sheet_claim(s)) THEN RAISE EXCEPTION 'Reports overlapped running discovery'; END IF;
 SELECT version INTO v FROM profit_sheet_stores WHERE store_id=s;
 PERFORM profit_sheet_finish_discovery(s,l,v,'[]',NULL,'{"metaComplete":true}');
 IF NOT EXISTS(SELECT 1 FROM profit_sheet_claim(s)) THEN RAISE EXCEPTION 'Reports not released after discovery'; END IF;
 IF EXISTS(SELECT 1 FROM profit_sheet_claim(s)) THEN RAISE EXCEPTION 'Two report workers for same store'; END IF;
 PERFORM profit_sheet_queue_discovery(d,s);
 IF EXISTS(SELECT 1 FROM profit_sheet_claim_discovery(s)) THEN RAISE EXCEPTION 'Discovery overlapped running report'; END IF;
 UPDATE profit_sheet_jobs SET status='success',lease_until=NULL WHERE store_id=s;
 SELECT lease INTO l FROM profit_sheet_claim_discovery(s);
 PERFORM profit_sheet_finish_discovery(s,l,v,'[]',NULL,'{"metaComplete":true}');
 PERFORM profit_sheet_enqueue_requested(s,jsonb_build_array(d-20),true);
 IF NOT EXISTS(SELECT 1 FROM profit_sheet_claim(s,d-20)) THEN RAISE EXCEPTION 'Explicit historical sync blocked'; END IF;
 UPDATE profit_sheet_jobs SET status='success',lease_until=NULL WHERE store_id=s;
 -- Integration deletion also removes legacy/manual credentials and dependent assignments.
 UPDATE profit_sheet_accounts SET details=details||'{"credentialSource":"manual"}' WHERE store_id=s;
 INSERT INTO profit_sheet_products(store_id,id,name) VALUES(s,'product','Product');
 INSERT INTO profit_sheet_assignments(store_id,product_id,account_id) VALUES(s,'product','act_1');
 PERFORM profit_sheet_unlink_account(s,'act_1');
 IF EXISTS(SELECT 1 FROM profit_sheet_accounts WHERE store_id=s) OR EXISTS(SELECT 1 FROM profit_sheet_assignments WHERE store_id=s) OR EXISTS(SELECT 1 FROM store_ad_accounts WHERE store_id=s) THEN RAISE EXCEPTION 'Unlink incomplete'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profit_sheet_products WHERE store_id=s) THEN RAISE EXCEPTION 'Unlink removed product'; END IF;
 IF EXISTS(SELECT 1 FROM profit_sheet_discovery WHERE store_id=s) THEN RAISE EXCEPTION 'Discovery continued without accounts'; END IF;
 -- Removing a sheet account is reversible: relinking can discover assignments again.
 INSERT INTO store_ad_accounts(store_id,ad_account_id,ad_account_name,platform,currency,timezone,is_active) VALUES(s,'act_2','Account 2','meta','USD','UTC',true);
 INSERT INTO profit_sheet_assignments(store_id,product_id,account_id) VALUES(s,'product','act_2');
 SELECT version INTO v FROM profit_sheet_stores WHERE store_id=s;
 PERFORM profit_sheet_save(s,v,NULL,'[]','[{"id":"product","name":"Product","links":[],"shopifyIds":[],"assignments":[]}]');
 IF EXISTS(SELECT 1 FROM store_ad_accounts WHERE store_id=s) THEN RAISE EXCEPTION 'Sheet unlink not mirrored'; END IF;
 IF EXISTS(SELECT 1 FROM profit_sheet_exclusions WHERE store_id=s AND key='account:product:act_2') THEN RAISE EXCEPTION 'Store unlink permanently blocked relinking'; END IF;
 -- Idempotent unlink repairs orphaned sheet entries even without an integration link.
 INSERT INTO profit_sheet_accounts(store_id,account_id,token_ciphertext,details) VALUES(s,'act_1','','{}');
 PERFORM profit_sheet_unlink_account(s,'act_1');
 IF EXISTS(SELECT 1 FROM profit_sheet_accounts WHERE store_id=s) THEN RAISE EXCEPTION 'Orphan unlink failed'; END IF;
 DELETE FROM stores WHERE id=s;
END $$;
