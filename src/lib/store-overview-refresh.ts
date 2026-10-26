export type RefreshStep = 'orders' | 'meta' | 'report';
export type RefreshProgress = { state: 'queued' | 'syncing' | 'success' | 'warning' | 'error'; message: string };

export function refreshError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value || '');
  if (/No Meta connection/i.test(message) || (/Meta|OAuthException/i.test(message) && /token|session|190/i.test(message))) {
    return 'Meta connection expired or was revoked. Reconnect Meta Ads in Settings → Integrations, then retry.';
  }
  if (/No Shopify connection|Shopify.*(401|403|token)/i.test(message)) {
    return 'Shopify connection is missing or unavailable. Reconnect Shopify in Settings → Integrations, then retry.';
  }
  if (/Supabase|statement timeout/i.test(message)) {
    return 'The reporting database could not complete the request. Please retry.';
  }
  if (/timeout|timed out|abort|504/i.test(message)) {
    return 'Sync timed out. Try again with a smaller date range.';
  }
  if (/rate.?limit|429/i.test(message)) return 'The provider is rate limiting requests. Wait a minute, then retry.';
  if (/<!doctype|<html|access_token|Bearer /i.test(message)) return 'Sync failed. Please retry or check the store connection.';
  return message.slice(0, 350) || 'Sync failed. Please retry.';
}

export function refreshRanges(from: string, to: string, batchDays = 7): Array<{ from: string; to: string }> {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!valid(from) || !valid(to) || from > to) throw new Error('Select a valid date range.');
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days > 92) throw new Error('Refresh supports up to 92 days at a time. Select a smaller date range.');
  if (!Number.isInteger(batchDays) || batchDays < 1) throw new Error('Invalid batch size.');
  const ranges = [];
  for (let day = Date.parse(from); day <= Date.parse(to); day += batchDays * 86400000) {
    ranges.push({ from: new Date(day).toISOString().slice(0, 10), to: new Date(Math.min(Date.parse(to), day + (batchDays - 1) * 86400000)).toISOString().slice(0, 10) });
  }
  return ranges;
}

// Cron handlers can return HTTP 200 with per-store errors or skipped work.
export function assertRefreshResult(body: {
  ok?: boolean; error?: string;
  results?: Array<{ status?: string; error?: string }>;
}, httpOk: boolean): void {
  const failure = body.results?.find(row => row.error || !['success', 'ok'].includes(row.status || ''));
  if (!httpOk || body.ok === false || body.error || failure || !body.results?.length) {
    throw new Error(body.error || failure?.error || failure?.status || 'Sync returned no completed results.');
  }
}

export async function refreshStoreRange(
  ranges: Array<{ from: string; to: string }>,
  run: (step: RefreshStep, range: { from: string; to: string }, metaSynced?: boolean) => Promise<void | { warning?: string }>,
  progress: (message: string) => void,
  includeMeta = true,
): Promise<{ warnings: string[] }> {
  const warnings = new Set<string>();
  let tryMeta = includeMeta;
  for (const range of ranges) {
    progress(`Syncing Shopify orders · ${range.from}–${range.to}`);
    // A Shopify failure must still stop the report from being overwritten.
    try { await run('orders', range); } catch (error) { throw new Error(refreshError(error)); }
    let metaSynced = false;
    if (tryMeta) {
      progress(`Syncing Meta spend · ${range.from}–${range.to}`);
      try {
        const result = await run('meta', range);
        if (result?.warning) {
          warnings.add(result.warning);
          tryMeta = false;
        } else {
          metaSynced = true;
        }
      } catch (error) {
        warnings.add(refreshError(error));
        // Don't repeat a failed connection for every week in the date range.
        tryMeta = false;
      }
    }
    progress(`Updating Shopify reports · ${range.from}–${range.to}`);
    await run('report', range, metaSynced);
  }
  return { warnings: [...warnings] };
}
