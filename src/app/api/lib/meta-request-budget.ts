import { createHash } from "crypto";
import { isSupabasePersistenceEnabled, rest } from "./supabase-persistence";

export type Pressure = { key: string; usage: number; tier?: string; blockMs?: number };
export function budgetKeys(token: string, endpoint: string): string[] {
  const hash = createHash("sha256").update(token).digest("hex");
  const account = endpoint.match(/^\/?act_(\d+)(?:\/|$)/)?.[1];
  return ["app:onescale", `token:${hash}`, ...(account ? [`account:${account}`] : [])];
}
function percent(value: Record<string, unknown>): number {
  return Math.max(0, ...["call_count", "total_cputime", "total_time", "acc_id_util_pct", "app_id_util_pct", "ads_api_util_pct"].map(k => Number(value[k]) || 0));
}
export function readMetaPressure(headers: Headers, keys: string[]): Pressure[] {
  const values: Pressure[] = [];
  const read = (name: string) => {
    try { const parsed = JSON.parse(headers.get(name) || "{}"); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
  };
  const app = read("x-app-usage");
  if (Object.keys(app).length) values.push({ key: keys[0], usage: percent(app) });
  const accountKey = keys.find(k => k.startsWith("account:"));
  const account = read("x-ad-account-usage");
  if (accountKey && Object.keys(account).length)
    values.push({ key: accountKey, usage: percent(account), blockMs: percent(account) >= 90 ? Math.max(0, Number(account.reset_time_duration || 0) * 1000) : 0 });
  const insights = read("x-fb-ads-insights-throttle");
  if (Object.keys(insights).length) {
    values.push({ key: keys[0], usage: Number(insights.app_id_util_pct) || 0 });
    if (accountKey) values.push({ key: accountKey, usage: Number(insights.acc_id_util_pct) || 0 });
  }
  for (const [id, rows] of Object.entries(read("x-business-use-case-usage"))) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const usage = percent(row);
      // Meta may key BUC usage by a business, not the queried account. Apply
      // that pressure to this credential too, so object-ID endpoints also defer.
      for (const key of new Set([`account:${id}`, keys[1], ...(accountKey ? [accountKey] : [])]))
        values.push({ key, usage, tier: row.ads_api_access_tier,
          blockMs: usage >= 90 ? Math.max(0, Number(row.estimated_time_to_regain_access || 0) * 60000) : 0 });
    }
  }
  return values;
}
export async function reserveMetaRequest(keys: string[]) {
  if (!isSupabasePersistenceEnabled()) return { reserved: true, waitMs: 0 };
  return rest<{ reserved: boolean; waitMs: number }>("/rpc/meta_reserve_request", {
    method: "POST", body: JSON.stringify({ p_keys: keys }),
  });
}
export async function recordMetaPressure(keys: string[], headers: Headers, blockedMs = 0) {
  if (!isSupabasePersistenceEnabled()) return;
  const pressure = readMetaPressure(headers, keys);
  if (blockedMs) for (const key of keys) pressure.push({ key, usage: 100, blockMs: blockedMs });
  const merged = new Map<string, Pressure>();
  for (const p of pressure) {
    const old = merged.get(p.key);
    merged.set(p.key, { key: p.key, usage: Math.max(p.usage, old?.usage || 0), tier: p.tier || old?.tier, blockMs: Math.max(p.blockMs || 0, old?.blockMs || 0) });
  }
  await Promise.all([...merged.values()].map(p => rest("/rpc/meta_record_pressure", {
    method: "POST", body: JSON.stringify({ p_key: p.key, p_usage: p.usage, p_tier: p.tier || null, p_block_ms: Math.min(2147483647, Math.ceil(p.blockMs || 0)) }),
  })));
}
