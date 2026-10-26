BEGIN;
CREATE TABLE IF NOT EXISTS profit_sheet_layouts (
 store_id text NOT NULL REFERENCES profit_sheet_stores(store_id) ON DELETE CASCADE,
 scope_id text NOT NULL,
 columns jsonb NOT NULL,
 views jsonb NOT NULL DEFAULT '[]',
 active_view text,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(store_id,scope_id)
);
ALTER TABLE profit_sheet_layouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON profit_sheet_layouts FROM anon,authenticated;
GRANT ALL ON profit_sheet_layouts TO service_role;
CREATE OR REPLACE FUNCTION profit_sheet_save_layout(p_store text,p_scope text,p_revision integer,p_columns jsonb,p_views jsonb,p_active text)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v integer;
BEGIN
 INSERT INTO profit_sheet_layouts(store_id,scope_id,columns,views,active_view,revision)
 VALUES(p_store,p_scope,p_columns,p_views,p_active,1)
 ON CONFLICT(store_id,scope_id) DO UPDATE SET columns=p_columns,views=p_views,active_view=p_active,revision=profit_sheet_layouts.revision+1,updated_at=now()
 WHERE profit_sheet_layouts.revision=p_revision
 RETURNING revision INTO v;
 IF v IS NULL OR (p_revision<>0 AND v=1) THEN RAISE EXCEPTION 'Layout changed in another session'; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION profit_sheet_save_layout(text,text,integer,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_save_layout(text,text,integer,jsonb,jsonb,text) TO service_role;
-- Extend missing-data detection without invalidating existing cached financial reports.
DROP FUNCTION profit_sheet_enqueue_missing(text,jsonb,text,integer);
CREATE FUNCTION profit_sheet_enqueue_missing(p_store text,p_dates jsonb,p_scope text DEFAULT 'store',p_finance_version integer DEFAULT 0,p_meta_version integer DEFAULT 0)
RETURNS integer LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d text; v integer; n integer:=0; changed integer;
BEGIN
 SELECT version INTO STRICT v FROM profit_sheet_stores WHERE store_id=p_store;
 FOR d IN SELECT jsonb_array_elements_text(p_dates) LOOP
  IF NOT EXISTS (SELECT 1 FROM profit_sheet_days WHERE store_id=p_store AND date=d::date AND scope_id=p_scope AND config_version=v
   AND (p_finance_version=0 OR COALESCE((metrics->>'financeVersion')::integer,0)>=p_finance_version)
   AND (p_meta_version=0 OR COALESCE((metrics->>'metaVersion')::integer,0)>=p_meta_version)) THEN
   INSERT INTO profit_sheet_jobs(store_id,date) VALUES(p_store,d::date)
   ON CONFLICT(store_id,date) DO UPDATE SET status='queued',error=null,attempts=0,updated_at=now() WHERE profit_sheet_jobs.status='success';
   GET DIAGNOSTICS changed = ROW_COUNT; n:=n+changed;
  END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION profit_sheet_enqueue_missing(text,jsonb,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION profit_sheet_enqueue_missing(text,jsonb,text,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
