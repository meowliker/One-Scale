BEGIN;
-- One encrypted Meta login per account/workspace. Store connection rows remain
-- compatibility mirrors; their selected ad accounts are never copied.
CREATE TABLE workspace_meta_connections (
 workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 access_token text NOT NULL, refresh_token text, expires_at bigint,
 scopes text, metadata text, connected_at timestamptz NOT NULL DEFAULT now(),
 last_synced timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workspace_meta_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspace_meta_connections FROM anon,authenticated;
GRANT ALL ON workspace_meta_connections TO service_role;

CREATE FUNCTION workspace_meta_save(p_store text,p_connection jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE w text; shared workspace_meta_connections;
BEGIN
 SELECT workspace_id INTO w FROM workspace_stores WHERE store_id=p_store;
 IF w IS NULL THEN RAISE EXCEPTION 'Store must belong to an account before connecting Meta'; END IF;
 -- Serialize saves, validation and disconnects for this account.
 PERFORM 1 FROM workspaces WHERE id=w FOR UPDATE;
 INSERT INTO workspace_meta_connections(workspace_id,access_token,refresh_token,expires_at,scopes,metadata)
 VALUES(w,p_connection->>'access_token',p_connection->>'refresh_token',
        (p_connection->>'expires_at')::bigint,p_connection->>'scopes',p_connection->>'metadata')
 ON CONFLICT(workspace_id) DO UPDATE SET access_token=EXCLUDED.access_token,
 refresh_token=EXCLUDED.refresh_token,expires_at=EXCLUDED.expires_at,
 scopes=EXCLUDED.scopes,metadata=EXCLUDED.metadata,last_synced=clock_timestamp()
 RETURNING * INTO shared;
 INSERT INTO connections(store_id,platform,access_token,refresh_token,expires_at,scopes,metadata,last_synced)
 SELECT store_id,'meta',shared.access_token,shared.refresh_token,shared.expires_at,
 shared.scopes,shared.metadata,shared.last_synced FROM workspace_stores WHERE workspace_id=w
 ON CONFLICT(store_id,platform) DO UPDATE SET access_token=EXCLUDED.access_token,
 refresh_token=EXCLUDED.refresh_token,expires_at=EXCLUDED.expires_at,
 scopes=EXCLUDED.scopes,metadata=EXCLUDED.metadata,last_synced=EXCLUDED.last_synced;
END $$;

CREATE FUNCTION workspace_meta_validate(p_store text,p_expected_synced timestamptz,p_metadata text,p_expiry jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE w text; shared workspace_meta_connections; checked timestamptz:=clock_timestamp();
BEGIN
 SELECT workspace_id INTO w FROM workspace_stores WHERE store_id=p_store;
 PERFORM 1 FROM workspaces WHERE id=w FOR UPDATE;
 -- A late provider response must never overwrite a replacement connection.
 PERFORM 1 FROM connections WHERE store_id=p_store AND platform='meta'
 AND last_synced IS NOT DISTINCT FROM p_expected_synced;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO shared FROM workspace_meta_connections WHERE workspace_id=w;
 IF FOUND THEN
  IF shared.access_token IS DISTINCT FROM (SELECT access_token FROM connections WHERE store_id=p_store AND platform='meta') THEN RETURN; END IF;
  UPDATE workspace_meta_connections SET metadata=p_metadata,
   expires_at=CASE WHEN p_expiry IS NULL THEN expires_at ELSE (p_expiry->>'value')::bigint END,
   last_synced=checked WHERE workspace_id=w RETURNING * INTO shared;
  UPDATE connections SET metadata=shared.metadata,expires_at=shared.expires_at,last_synced=checked
   WHERE platform='meta' AND store_id IN (SELECT store_id FROM workspace_stores WHERE workspace_id=w);
 ELSE
  -- Untouched legacy accounts can still validate their existing per-store token.
  UPDATE connections SET metadata=p_metadata,
   expires_at=CASE WHEN p_expiry IS NULL THEN expires_at ELSE (p_expiry->>'value')::bigint END,
   last_synced=checked WHERE store_id=p_store AND platform='meta';
 END IF;
END $$;

CREATE FUNCTION workspace_meta_disconnect(p_store text) RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE w text;
BEGIN
 SELECT workspace_id INTO w FROM workspace_stores WHERE store_id=p_store;
 IF w IS NULL THEN
  DELETE FROM connections WHERE store_id=p_store AND platform='meta'; RETURN;
 END IF;
 PERFORM 1 FROM workspaces WHERE id=w FOR UPDATE;
 DELETE FROM workspace_meta_connections WHERE workspace_id=w;
 DELETE FROM connections WHERE platform='meta' AND store_id IN
  (SELECT store_id FROM workspace_stores WHERE workspace_id=w);
END $$;

CREATE FUNCTION inherit_workspace_meta_connection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE shared workspace_meta_connections;
BEGIN
 IF TG_OP='UPDATE' AND NEW.workspace_id=OLD.workspace_id THEN RETURN NEW; END IF;
 PERFORM 1 FROM workspaces WHERE id=NEW.workspace_id FOR UPDATE;
 -- A store moved to another account must not carry the old account's Meta login.
 DELETE FROM connections WHERE store_id=NEW.store_id AND platform='meta';
 SELECT * INTO shared FROM workspace_meta_connections WHERE workspace_id=NEW.workspace_id;
 IF FOUND THEN
  INSERT INTO connections(store_id,platform,access_token,refresh_token,expires_at,scopes,metadata,last_synced)
  VALUES(NEW.store_id,'meta',shared.access_token,shared.refresh_token,shared.expires_at,
         shared.scopes,shared.metadata,shared.last_synced);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inherit_workspace_meta AFTER INSERT OR UPDATE OF workspace_id ON workspace_stores
FOR EACH ROW EXECUTE FUNCTION inherit_workspace_meta_connection();

REVOKE ALL ON FUNCTION workspace_meta_save(text,jsonb),workspace_meta_validate(text,timestamptz,text,jsonb),workspace_meta_disconnect(text),inherit_workspace_meta_connection() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION workspace_meta_save(text,jsonb),workspace_meta_validate(text,timestamptz,text,jsonb),workspace_meta_disconnect(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
