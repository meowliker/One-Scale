-- Execute after migration 055 transactionally and roll back.
DO $$
DECLARE s text:='test-status-'||gen_random_uuid(); d date:=(now() AT TIME ZONE 'UTC' - interval '6 hours')::date; result jsonb; full_time text; v integer;
BEGIN
 INSERT INTO stores(id,name,domain) VALUES(s,'Status test',s||'.myshopify.com');
 INSERT INTO store_ad_accounts(store_id,ad_account_id,ad_account_name,platform,currency,timezone,is_active) VALUES(s,'act_1','Account','meta','USD','UTC',true);
 result:=profit_sheet_sync_status(s);
 IF result->>'lastCompletedAt' IS NOT NULL OR result->>'stage'<>'products' THEN RAISE EXCEPTION 'Queued discovery claimed complete'; END IF;
 SELECT version INTO v FROM profit_sheet_stores WHERE store_id=s;
 UPDATE profit_sheet_discovery SET status='success',checked_at=now()-interval '5 minutes' WHERE store_id=s;
 INSERT INTO profit_sheet_products(store_id,id,name,start_date) VALUES(s,'p','Product',d-1);
 INSERT INTO profit_sheet_days(store_id,date,scope_id,metrics,currency,config_version,synced_at)
 SELECT s,d-n,'store','{"revenue":10,"adSpend":2,"shopifyFees":1}','USD',v,now()-interval '1 minute' FROM generate_series(0,2) n;
 UPDATE profit_sheet_jobs SET status='success' WHERE store_id=s;
 result:=profit_sheet_sync_status(s);
 IF result->>'lastCompletedAt' IS NOT NULL THEN RAISE EXCEPTION 'Missing product report accepted'; END IF;
 INSERT INTO profit_sheet_days(store_id,date,scope_id,metrics,currency,config_version,synced_at)
 SELECT s,d-n,'p','{"revenue":10,"adSpend":2,"shopifyFees":1}','USD',v,now()-interval '1 minute' FROM generate_series(0,1) n;
 DELETE FROM profit_sheet_jobs WHERE store_id=s AND date=d;
 result:=profit_sheet_sync_status(s);
 IF result->>'lastCompletedAt' IS NOT NULL THEN RAISE EXCEPTION 'Missing job accepted'; END IF;
 INSERT INTO profit_sheet_jobs(store_id,date,status) VALUES(s,d,'error');
 result:=profit_sheet_sync_status(s);
 IF result->>'lastCompletedAt' IS NOT NULL OR result->>'stage'<>'attention' THEN RAISE EXCEPTION 'Failed job accepted'; END IF;
 UPDATE profit_sheet_jobs SET status='success' WHERE store_id=s;
 result:=profit_sheet_sync_status(s);full_time:=result->>'lastCompletedAt';
 IF full_time IS NULL OR result->>'stage'<>'complete' THEN RAISE EXCEPTION 'Complete sync not recorded'; END IF;
 IF profit_sheet_sync_status(s)->>'lastCompletedAt'<>full_time THEN RAISE EXCEPTION 'Read advanced sync time'; END IF;
 UPDATE profit_sheet_jobs SET status='queued' WHERE store_id=s AND date=d;
 UPDATE profit_sheet_days SET synced_at=now() WHERE store_id=s AND date=d;
 result:=profit_sheet_sync_status(s);
 IF result->>'lastCompletedAt'<>full_time OR result->>'stage'='complete' THEN RAISE EXCEPTION 'Partial refresh advanced full sync'; END IF;
 UPDATE profit_sheet_stores SET version=version+1 WHERE store_id=s;
 UPDATE profit_sheet_jobs SET status='success' WHERE store_id=s;
 result:=profit_sheet_sync_status(s);
 IF result->>'lastCompletedAt'<>full_time OR result->>'stage'='complete' THEN RAISE EXCEPTION 'Stale config accepted'; END IF;
 DELETE FROM stores WHERE id=s;
END $$;
