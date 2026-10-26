BEGIN;
CREATE TABLE profit_sheet_meta_entities (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 account_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('campaign','adset','ad')),
 entity_id text NOT NULL, entity jsonb NOT NULL,
 PRIMARY KEY(store_id,account_id,kind,entity_id)
);
CREATE TABLE profit_sheet_meta_catalogs (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 account_id text NOT NULL, synced_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,account_id)
);
CREATE TABLE profit_sheet_attribution (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 date date NOT NULL, config_version integer NOT NULL, currency text NOT NULL,
 snapshot jsonb NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,date)
);
ALTER TABLE profit_sheet_meta_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_meta_catalogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profit_sheet_attribution ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profit_sheet_meta_entities,profit_sheet_meta_catalogs,profit_sheet_attribution FROM anon,authenticated;
GRANT ALL ON profit_sheet_meta_entities,profit_sheet_meta_catalogs,profit_sheet_attribution TO service_role;
CREATE FUNCTION profit_sheet_publish_attribution(p_store text,p_date date,p_lease uuid,p_version integer,p_currency text,p_rows jsonb,p_attribution jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 -- Existing publish locks and verifies both the worker lease and config revision.
 PERFORM profit_sheet_publish(p_store,p_date,p_lease,p_version,p_currency,p_rows);
 INSERT INTO profit_sheet_attribution(store_id,date,config_version,currency,snapshot)
 VALUES(p_store,p_date,p_version,p_currency,p_attribution)
 ON CONFLICT(store_id,date) DO UPDATE SET config_version=p_version,currency=p_currency,snapshot=p_attribution,synced_at=now();
END $$;
REVOKE ALL ON FUNCTION profit_sheet_publish_attribution(text,date,uuid,integer,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_publish_attribution(text,date,uuid,integer,text,jsonb,jsonb) TO service_role;
DROP FUNCTION profit_sheet_enqueue_missing(text,jsonb,text,integer,integer);
CREATE FUNCTION profit_sheet_enqueue_missing(p_store text,p_dates jsonb,p_scope text DEFAULT 'store',p_finance_version integer DEFAULT 0,p_meta_version integer DEFAULT 0,p_attribution_version integer DEFAULT 0)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d text; v integer; n integer:=0; changed integer;
BEGIN
 SELECT version INTO STRICT v FROM profit_sheet_stores WHERE store_id=p_store;
 FOR d IN SELECT jsonb_array_elements_text(p_dates) LOOP
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
REVOKE ALL ON FUNCTION profit_sheet_enqueue_missing(text,jsonb,text,integer,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_enqueue_missing(text,jsonb,text,integer,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
