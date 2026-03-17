/**
 * ShopifyRateLimiter
 *
 * Mirrors Shopify's leaky bucket algorithm per store.
 * Standard stores: 40 bucket, 2/sec drain
 * Shopify Plus:    400 bucket, 20/sec drain
 *
 * Usage:
 *   const limiter = getRateLimiter(storeId);
 *   const response = await limiter.fetch(url, options);
 */

interface BucketState {
  used: number;
  capacity: number;
  lastDrainTime: number;
  drainRate: number;
}

const buckets = new Map<string, BucketState>();

function getBucket(storeId: string, isPlus = false): BucketState {
  if (!buckets.has(storeId)) {
    buckets.set(storeId, {
      used: 0,
      capacity: isPlus ? 400 : 40,
      lastDrainTime: Date.now(),
      drainRate: isPlus ? 20 : 2,
    });
  }
  return buckets.get(storeId)!;
}

function drainBucket(bucket: BucketState): void {
  const now = Date.now();
  const elapsedSeconds = (now - bucket.lastDrainTime) / 1000;
  const drained = Math.floor(elapsedSeconds * bucket.drainRate);
  bucket.used = Math.max(0, bucket.used - drained);
  bucket.lastDrainTime = now;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ShopifyRateLimiter {
  private storeId: string;
  private isPlus: boolean;

  constructor(storeId: string, isPlus = false) {
    this.storeId = storeId;
    this.isPlus = isPlus;
  }

  async fetch(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
    const bucket = getBucket(this.storeId, this.isPlus);
    drainBucket(bucket);

    const usageRatio = bucket.used / bucket.capacity;
    if (usageRatio > 0.8) {
      const excessRequests = bucket.used - bucket.capacity * 0.5;
      const waitMs = Math.ceil((excessRequests / bucket.drainRate) * 1000);
      console.log(`[RateLimit:${this.storeId}] Bucket ${bucket.used}/${bucket.capacity} — waiting ${waitMs}ms`);
      await sleep(waitMs);
      drainBucket(bucket);
    }

    bucket.used = Math.min(bucket.capacity, bucket.used + 1);

    try {
      const response = await fetch(url, options);

      const callLimitHeader = response.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (callLimitHeader) {
        const [used, capacity] = callLimitHeader.split('/').map(Number);
        if (!isNaN(used) && !isNaN(capacity)) {
          bucket.used = used;
          bucket.capacity = capacity;
          bucket.lastDrainTime = Date.now();
        }
      }

      if (response.status === 429) {
        if (retries <= 0) {
          throw new Error(`Shopify rate limit exceeded after retries: ${url}`);
        }
        const retryAfter = response.headers.get('Retry-After');
        const waitSeconds = retryAfter ? parseFloat(retryAfter) : 2;
        const waitMs = Math.ceil(waitSeconds * 1000) + 200;
        console.warn(`[RateLimit:${this.storeId}] 429 received — waiting ${waitMs}ms, ${retries} retries left`);
        await sleep(waitMs);
        drainBucket(bucket);
        return this.fetch(url, options, retries - 1);
      }

      return response;
    } catch (err) {
      if (retries <= 0) throw err;
      await sleep(1000 * (4 - retries));
      return this.fetch(url, options, retries - 1);
    }
  }

  async fetchAllPages<T>(url: string, key: string, options: RequestInit = {}): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = url;
    let pageCount = 0;

    while (nextUrl) {
      pageCount++;
      const response = await this.fetch(nextUrl, options);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Shopify API error ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json() as Record<string, T[]>;
      const items = data[key] || [];
      results.push(...items);

      const linkHeader = response.headers.get('Link');
      nextUrl = parseLinkHeader(linkHeader);

      if (pageCount % 5 === 0) {
        console.log(`[RateLimit:${this.storeId}] Paginating ${key}: page ${pageCount}, ${results.length} items so far`);
      }

      if (pageCount >= 50) {
        console.warn(`[RateLimit:${this.storeId}] Hit 50-page cap for ${key} — truncating`);
        break;
      }
    }

    return results;
  }

  getUsagePercent(): number {
    const bucket = getBucket(this.storeId, this.isPlus);
    drainBucket(bucket);
    return Math.round((bucket.used / bucket.capacity) * 100);
  }
}

function parseLinkHeader(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

const limiters = new Map<string, ShopifyRateLimiter>();

export function getRateLimiter(storeId: string, isPlus = false): ShopifyRateLimiter {
  const key = `${storeId}:${isPlus}`;
  if (!limiters.has(key)) {
    limiters.set(key, new ShopifyRateLimiter(storeId, isPlus));
  }
  return limiters.get(key)!;
}
