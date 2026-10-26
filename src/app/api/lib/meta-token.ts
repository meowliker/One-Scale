/** Meta uses epoch seconds in debug_token; application connection rows use milliseconds. */
export function metaExpiry(value: unknown): number | null {
  if (value == null || value === 0) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("Invalid Meta expiry");
  return value < 1e12 ? value * 1000 : value;
}
export type MetaTokenInfo = {
  type: string;
  expiresAt: number | null;
  dataAccessExpiresAt: number | null;
  scopes: string[];
  checkedAt: string;
};
export class MetaTokenError extends Error {
  constructor(public code: "invalid" | "permissions" | "unavailable") {
    super(
      code === "invalid"
        ? "Meta rejected this token or it has expired. Reconnect Meta or supply a valid token."
        : code === "permissions"
          ? "This token needs ads_read or ads_management permission."
          : "Meta could not validate the token right now. Your saved connection has not been removed. Retry shortly.",
    );
  }
}
export async function inspectMetaToken(
  accessToken: string,
): Promise<MetaTokenInfo> {
  const url = new URL("https://graph.facebook.com/v21.0/debug_token");
  url.searchParams.set("input_token", accessToken);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch {
    throw new MetaTokenError("unavailable");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new MetaTokenError(
      body?.error?.code === 190 ? "invalid" : "unavailable",
    );
  const data = body?.data;
  if (!data || data.is_valid !== true) throw new MetaTokenError("invalid");
  const expiresAt = metaExpiry(data.expires_at),
    dataAccessExpiresAt = metaExpiry(data.data_access_expires_at);
  if (
    (expiresAt && expiresAt <= Date.now()) ||
    (dataAccessExpiresAt && dataAccessExpiresAt <= Date.now())
  )
    throw new MetaTokenError("invalid");
  const scopes = Array.isArray(data.scopes)
    ? data.scopes.filter((s: unknown): s is string => typeof s === "string")
    : [];
  if (!scopes.includes("ads_read") && !scopes.includes("ads_management"))
    throw new MetaTokenError("permissions");
  // Never infer "no expiry" from a missing field or an unknown token type.
  if (data.expires_at == null || typeof data.type !== "string")
    throw new MetaTokenError("unavailable");
  return {
    type: data.type,
    expiresAt,
    dataAccessExpiresAt,
    scopes,
    checkedAt: new Date().toISOString(),
  };
}
export function effectiveMetaExpiry(
  expiresAt: number | null,
  dataAccessExpiresAt?: number | null,
) {
  const dates = [expiresAt, dataAccessExpiresAt].filter(
    (x): x is number => typeof x === "number" && x > 0,
  );
  return dates.length ? Math.min(...dates) : null;
}
