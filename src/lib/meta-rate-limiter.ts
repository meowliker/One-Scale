/**
 * MetaRateLimiter
 *
 * Meta Graph API rate limiting.
 * Limits: 200 calls/hour per app per ad account.
 * Headers: x-app-usage, x-business-use-case-usage
 *
 * Strategy: exponential backoff on 429/503, proactive slow-down above 75%.
 */

interface MetaUsage {
  call_count: number;
  total_cputime: number;
  total_time: number;
}

const metaUsageByAccount = new Map<string, MetaUsage>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function metaFetch(
  url: string,
  adAccountId: string,
  options: RequestInit = {},
  retries = 4
): Promise<Response> {
  const usage = metaUsageByAccount.get(adAccountId);
  if (usage) {
    const maxUsage = Math.max(usage.call_count, usage.total_cputime, usage.total_time);
    if (maxUsage > 90) {
      console.warn(`[MetaRate:${adAccountId}] Usage at ${maxUsage}% — waiting 30s`);
      await sleep(30_000);
    } else if (maxUsage > 75) {
      const waitMs = Math.round((maxUsage - 75) * 1000);
      console.log(`[MetaRate:${adAccountId}] Usage at ${maxUsage}% — waiting ${waitMs}ms`);
      await sleep(waitMs);
    }
  }

  const response = await fetch(url, options);

  const appUsageHeader = response.headers.get('x-app-usage');
  if (appUsageHeader) {
    try {
      const parsed = JSON.parse(appUsageHeader) as MetaUsage;
      metaUsageByAccount.set(adAccountId, parsed);
    } catch { /* ignore parse errors */ }
  }

  if (response.status === 429 || response.status === 503) {
    if (retries <= 0) {
      throw new Error(`Meta API rate limit exceeded after retries`);
    }
    const waitMs = Math.pow(2, 4 - retries) * 15_000;
    console.warn(`[MetaRate:${adAccountId}] ${response.status} — waiting ${waitMs / 1000}s, ${retries} retries left`);
    await sleep(waitMs);
    return metaFetch(url, adAccountId, options, retries - 1);
  }

  if (response.ok) {
    const clone = response.clone();
    try {
      const body = await clone.json() as { error?: { code: number; error_subcode?: number } };
      if (body?.error?.code === 17 || body?.error?.code === 32 || body?.error?.code === 613) {
        if (retries <= 0) throw new Error(`Meta rate limit in response body`);
        await sleep(30_000);
        return metaFetch(url, adAccountId, options, retries - 1);
      }
    } catch { /* not JSON or no error */ }
  }

  return response;
}
