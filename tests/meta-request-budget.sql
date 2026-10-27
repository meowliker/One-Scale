DO $$
DECLARE keys jsonb:=jsonb_build_array('app:test-'||gen_random_uuid(),'token:test-'||gen_random_uuid(),'account:test-'||gen_random_uuid()); r jsonb; before_next timestamptz; i integer;
BEGIN
 r:=meta_reserve_request(keys);IF NOT (r->>'reserved')::boolean OR (r->>'waitMs')::numeric>50 THEN RAISE EXCEPTION 'First request not immediate'; END IF;
 r:=meta_reserve_request(keys);IF (r->>'waitMs')::numeric<1000 THEN RAISE EXCEPTION 'Concurrent instance not paced'; END IF;
 FOR i IN 1..6 LOOP r:=meta_reserve_request(keys); END LOOP;
 IF (r->>'reserved')::boolean THEN RAISE EXCEPTION 'Burst not deferred'; END IF;
 SELECT next_at INTO before_next FROM meta_request_budgets WHERE key=keys->>2;
 r:=meta_reserve_request(keys);
 IF (SELECT next_at FROM meta_request_budgets WHERE key=keys->>2)<>before_next THEN RAISE EXCEPTION 'Rejected reservation extended queue'; END IF;
 PERFORM meta_record_pressure(keys->>2,92,'development_access',1200000);
 r:=meta_reserve_request(keys);IF (r->>'reserved')::boolean OR (r->>'waitMs')::numeric<1199000 THEN RAISE EXCEPTION 'Cooldown not enforced'; END IF;
 r:=meta_reserve_request(jsonb_build_array(keys->>0,'token:new-test',keys->>2));
 IF (r->>'reserved')::boolean THEN RAISE EXCEPTION 'New token bypassed account cooldown'; END IF;
 DELETE FROM meta_request_budgets WHERE keys ? key OR key='token:new-test';
END $$;
