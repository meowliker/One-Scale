import { getMetaConnectionHealth, setMetaToken } from "./tokens";
import { inspectMetaToken, MetaTokenError } from "./meta-token";
import { getConnection, upsertConnection } from "./db";
import { rest, isSupabasePersistenceEnabled } from "./supabase-persistence";
import { decryptSecret } from "./crypto";

export async function saveVerifiedMetaToken(storeId: string, token: string) {
  const info = await inspectMetaToken(token);
  await setMetaToken(storeId, {
    storeId,
    platform: "meta",
    accessToken: token,
    metaInfo: info,
  });
  return (await getMetaConnectionHealth(storeId)).health;
}
export async function restoreSavedMetaToken(
  storeId: string,
  accountId: string,
) {
  const rows = await rest<Array<{ token_ciphertext: string }>>(
    `/profit_sheet_accounts?store_id=eq.${encodeURIComponent(storeId)}&account_id=eq.${encodeURIComponent(accountId)}&select=token_ciphertext&limit=1`,
  );
  if (!rows[0]) throw new Error("No saved token for this store and account.");
  return saveVerifiedMetaToken(
    storeId,
    decryptSecret(rows[0].token_ciphertext),
  );
}
export async function checkMetaConnection(storeId: string) {
  const { conn, health } = await getMetaConnectionHealth(storeId);
  if (!conn) return health;
  let metadata: string;
  let expiry: number | null | undefined;
  try {
    const info = await inspectMetaToken(conn.access_token);
    metadata = JSON.stringify({ ...info, validation: "valid" });
    const dates = [info.expiresAt, info.dataAccessExpiresAt].filter(
      (x): x is number => typeof x === "number" && x > 0,
    );
    expiry = dates.length ? Math.min(...dates) : null;
  } catch (e) {
    if (!(e instanceof MetaTokenError) || e.code !== "invalid") throw e;
    let previous = {};
    try {
      previous = JSON.parse(conn.metadata || "{}");
    } catch {}
    metadata = JSON.stringify({
      ...previous,
      validation: "invalid",
      checkedAt: new Date().toISOString(),
    });
  }
  // Validation never deletes credentials; a transient provider outage cannot disconnect a store.
  if (isSupabasePersistenceEnabled()) {
    const version = conn.last_synced
      ? `eq.${encodeURIComponent(conn.last_synced)}`
      : "is.null";
    await rest(
      `/connections?store_id=eq.${encodeURIComponent(storeId)}&platform=eq.meta&last_synced=${version}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          metadata,
          ...(expiry !== undefined ? { expires_at: expiry } : {}),
          last_synced: new Date().toISOString(),
        }),
      },
    );
  } else if (
    getConnection(storeId, "meta")?.access_token === conn.access_token
  ) {
    upsertConnection({
      storeId,
      platform: "meta",
      accessToken: conn.access_token,
      metadata,
      ...(expiry !== undefined ? { expiresAt: expiry } : {}),
    });
  }
  return (await getMetaConnectionHealth(storeId)).health;
}
