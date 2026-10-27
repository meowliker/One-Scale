-- Run inside a transaction and ROLLBACK. Uses synthetic accounts only.
DO $$
DECLARE w text:='test-meta-'||gen_random_uuid(); other text:='test-meta-'||gen_random_uuid();
 a text:='test-meta-'||gen_random_uuid(); b text:='test-meta-'||gen_random_uuid();
 c text:='test-meta-'||gen_random_uuid(); d text:='test-meta-'||gen_random_uuid();
 original_synced timestamptz; current_synced timestamptz;
BEGIN
 INSERT INTO workspaces(id,name) VALUES(w,'Meta sharing test'),(other,'Unrelated account');
 INSERT INTO stores(id,name,domain) VALUES(a,'A',a||'.myshopify.com'),(b,'B',b||'.myshopify.com'),(c,'C',c||'.myshopify.com'),(d,'D',d||'.myshopify.com');
 INSERT INTO workspace_stores(workspace_id,store_id) VALUES(w,a),(w,b),(other,c);
 INSERT INTO connections(store_id,platform,access_token,account_id,account_name) VALUES
 (a,'meta','expired','act_a','Selected A'),(b,'meta','expired','act_b','Selected B'),(c,'meta','unrelated','act_c','Selected C'),(a,'shopify','shopify-secret',null,null);
 PERFORM workspace_meta_save(a,'{"access_token":"enc:test-one","expires_at":null,"metadata":"{\"validation\":\"valid\"}"}');
 IF (SELECT count(*) FROM connections WHERE store_id IN(a,b) AND platform='meta' AND access_token='enc:test-one')<>2 THEN RAISE EXCEPTION 'Save did not share'; END IF;
 IF (SELECT account_id FROM connections WHERE store_id=b AND platform='meta')<>'act_b' THEN RAISE EXCEPTION 'Store selection overwritten'; END IF;
 IF (SELECT access_token FROM connections WHERE store_id=c AND platform='meta')<>'unrelated' THEN RAISE EXCEPTION 'Cross-account sharing'; END IF;
 IF (SELECT access_token FROM connections WHERE store_id=a AND platform='shopify')<>'shopify-secret' THEN RAISE EXCEPTION 'Shopify modified'; END IF;
 INSERT INTO workspace_stores(workspace_id,store_id) VALUES(w,d);
 IF (SELECT access_token FROM connections WHERE store_id=d AND platform='meta') IS DISTINCT FROM 'enc:test-one' THEN RAISE EXCEPTION 'New store did not inherit'; END IF;
 SELECT last_synced INTO original_synced FROM connections WHERE store_id=a AND platform='meta';
 PERFORM workspace_meta_save(b,'{"access_token":"enc:test-two","expires_at":null,"metadata":"{\"validation\":\"valid\"}"}');
 PERFORM workspace_meta_validate(a,original_synced,'{"validation":"invalid"}',NULL);
 IF (SELECT metadata FROM connections WHERE store_id=a AND platform='meta')::jsonb->>'validation'<>'valid' THEN RAISE EXCEPTION 'Stale validation won'; END IF;
 SELECT last_synced INTO current_synced FROM connections WHERE store_id=a AND platform='meta';
 PERFORM workspace_meta_validate(a,current_synced,'{"validation":"invalid"}',NULL);
 IF EXISTS(SELECT 1 FROM connections WHERE store_id IN(a,b,d) AND platform='meta' AND metadata::jsonb->>'validation'<>'invalid') THEN RAISE EXCEPTION 'Invalidation not shared'; END IF;
 PERFORM workspace_meta_save(a,'{"access_token":"enc:test-three","expires_at":null,"metadata":"{\"validation\":\"valid\"}"}');
 UPDATE workspace_stores SET workspace_id=other WHERE store_id=d;
 IF EXISTS(SELECT 1 FROM connections WHERE store_id=d AND platform='meta') THEN RAISE EXCEPTION 'Moved store retained old account token'; END IF;
 -- Deleting a store must not disconnect the rest of the workspace.
 DELETE FROM stores WHERE id=b;
 IF NOT EXISTS(SELECT 1 FROM workspace_meta_connections WHERE workspace_id=w) THEN RAISE EXCEPTION 'Store deletion removed shared login'; END IF;
 PERFORM workspace_meta_disconnect(a);
 IF EXISTS(SELECT 1 FROM connections WHERE store_id=a AND platform='meta') OR EXISTS(SELECT 1 FROM workspace_meta_connections WHERE workspace_id=w) THEN RAISE EXCEPTION 'Disconnect failed'; END IF;
 IF (SELECT access_token FROM connections WHERE store_id=c AND platform='meta')<>'unrelated' THEN RAISE EXCEPTION 'Disconnect crossed accounts'; END IF;
 UPDATE workspace_stores SET workspace_id=w WHERE store_id=d;
 IF EXISTS(SELECT 1 FROM connections WHERE store_id=d AND platform='meta') THEN RAISE EXCEPTION 'Disconnected token resurrected'; END IF;
END $$;
