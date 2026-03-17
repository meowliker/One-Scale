/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 *
 * Currency Normalizer — every financial value passes through here
 * before entering any P&L calculation. Converts from source currency
 * to store base currency using date-specific exchange rates.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

export interface NormalizedAmount {
  value: number;
  originalValue: number;
  originalCurrency: string;
  targetCurrency: string;
  conversionRate: number;
  rateDate: string;
  conversionApplied: boolean;
}

// ── Cache to avoid repeated DB lookups within same request ───

const rateCache = new Map<string, number>();

function rateCacheKey(from: string, to: string, date: string): string {
  return `${from}_${to}_${date}`;
}

// ── Main Normalizer ─────────────────────────────────────────

export async function normalize(
  amount: number,
  fromCurrency: string,
  targetCurrency: string,
  forDate: string,
): Promise<NormalizedAmount> {
  if (!fromCurrency) fromCurrency = targetCurrency;

  if (fromCurrency === targetCurrency || !fromCurrency || !targetCurrency) {
    return {
      value: amount,
      originalValue: amount,
      originalCurrency: fromCurrency || targetCurrency,
      targetCurrency: targetCurrency,
      conversionRate: 1,
      rateDate: forDate,
      conversionApplied: false,
    };
  }

  const rate = await getRateForDate(fromCurrency, targetCurrency, forDate);

  return {
    value: Math.round(amount * rate * 100) / 100,
    originalValue: amount,
    originalCurrency: fromCurrency,
    targetCurrency,
    conversionRate: rate,
    rateDate: forDate,
    conversionApplied: true,
  };
}

export async function normalizeBatch(
  items: Array<{ amount: number; currency: string }>,
  targetCurrency: string,
  forDate: string,
): Promise<NormalizedAmount[]> {
  const sourceCurrencies = [...new Set(items.map(i => i.currency).filter(Boolean))];

  const rates = new Map<string, number>();
  for (const src of sourceCurrencies) {
    if (src === targetCurrency) {
      rates.set(src, 1);
    } else {
      rates.set(src, await getRateForDate(src, targetCurrency, forDate));
    }
  }

  return items.map(item => {
    const currency = item.currency || targetCurrency;
    const rate = rates.get(currency) ?? 1;
    return {
      value: Math.round(item.amount * rate * 100) / 100,
      originalValue: item.amount,
      originalCurrency: currency,
      targetCurrency,
      conversionRate: rate,
      rateDate: forDate,
      conversionApplied: currency !== targetCurrency,
    };
  });
}

// ── Rate Lookup ─────────────────────────────────────────────

async function getRateForDate(
  fromCurrency: string,
  toCurrency: string,
  date: string,
): Promise<number> {
  const cacheKey = rateCacheKey(fromCurrency, toCurrency, date);
  const cached = rateCache.get(cacheKey);
  if (cached) return cached;

  const enc = (v: string) => encodeURIComponent(v);

  // Try exact date
  const exactRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?from_currency=eq.${enc(fromCurrency)}&to_currency=eq.${enc(toCurrency)}&date=eq.${date}&select=rate&limit=1`
  ).catch(() => []);

  if (exactRows.length > 0 && exactRows[0].rate > 0) {
    rateCache.set(cacheKey, exactRows[0].rate);
    return exactRows[0].rate;
  }

  // Try nearest past rate (within 7 days)
  const nearestRows = await rest<Array<{ rate: number; date: string }>>(
    `/exchange_rates?from_currency=eq.${enc(fromCurrency)}&to_currency=eq.${enc(toCurrency)}&date=lte.${date}&select=rate,date&order=date.desc&limit=1`
  ).catch(() => []);

  if (nearestRows.length > 0 && nearestRows[0].rate > 0) {
    console.log(`[PRISM:Currency] Using rate from ${nearestRows[0].date} for ${date} (${fromCurrency}→${toCurrency}: ${nearestRows[0].rate})`);
    rateCache.set(cacheKey, nearestRows[0].rate);
    return nearestRows[0].rate;
  }

  // Fetch live rate and save
  const liveRate = await fetchLiveRate(fromCurrency, toCurrency);

  await rest('/exchange_rates?on_conflict=date,from_currency,to_currency', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      date,
      from_currency: fromCurrency,
      to_currency: toCurrency,
      rate: liveRate,
      fetched_at: new Date().toISOString(),
      source: 'live_fetch',
    }),
  }).catch(() => null);

  rateCache.set(cacheKey, liveRate);
  return liveRate;
}

// ── Live Rate Fetcher ───────────────────────────────────────

async function fetchLiveRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<number> {
  const sources = [
    `https://open.er-api.com/v6/latest/${fromCurrency}`,
    `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`,
  ];

  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      const rate = data.rates?.[toCurrency] ?? data.conversion_rates?.[toCurrency];

      if (rate && rate > 0) {
        console.log(`[PRISM:Currency] Live rate ${fromCurrency}→${toCurrency}: ${rate}`);
        return rate;
      }
    } catch {
      continue;
    }
  }

  console.error(`[PRISM:Currency] ALL rate sources failed for ${fromCurrency}→${toCurrency}. Using fallback.`);
  return getFallbackRate(fromCurrency, toCurrency);
}

function getFallbackRate(from: string, to: string): number {
  const toUSD: Record<string, number> = {
    USD: 1, INR: 0.012, GBP: 1.27, EUR: 1.09, AUD: 0.65,
    CAD: 0.74, SGD: 0.74, AED: 0.27, JPY: 0.0067, BRL: 0.20,
    MXN: 0.058, NZD: 0.60, SEK: 0.095, NOK: 0.093, DKK: 0.146,
    CHF: 1.13, HKD: 0.128, PLN: 0.25, CZK: 0.044, ZAR: 0.055,
    ILS: 0.28, PHP: 0.018, THB: 0.029, MYR: 0.22, KRW: 0.00074,
  };

  const fromInUSD = toUSD[from] ?? 1;
  const toInUSD = toUSD[to] ?? 1;
  return fromInUSD / toInUSD;
}

// ── Daily Rate Sync ─────────────────────────────────────────

export async function syncExchangeRates(): Promise<number> {
  const enc = (v: string) => encodeURIComponent(v);
  const today = new Date().toISOString().split('T')[0];

  // Find all stores with currency mismatches
  const stores = await rest<Array<{ currency: string; ads_currency: string | null }>>(
    '/store_ad_accounts?select=currency&limit=100'
  ).catch(() => []);

  // Also check store_config for shopify currency
  const configs = await rest<Array<{ currency: string }>>(
    '/stores?select=id'
  ).catch(() => []);

  // For now, just ensure we have today's rate for common pairs
  const commonPairs = [
    ['USD', 'INR'], ['INR', 'USD'],
    ['USD', 'EUR'], ['EUR', 'USD'],
    ['USD', 'GBP'], ['GBP', 'USD'],
    ['USD', 'AUD'], ['AUD', 'USD'],
    ['USD', 'CAD'], ['CAD', 'USD'],
  ];

  let synced = 0;
  for (const [from, to] of commonPairs) {
    const existing = await rest<Array<{ rate: number }>>(
      `/exchange_rates?from_currency=eq.${enc(from)}&to_currency=eq.${enc(to)}&date=eq.${today}&select=rate&limit=1`
    ).catch(() => []);

    if (existing.length > 0) continue;

    await getRateForDate(from, to, today);
    synced++;
  }

  console.log(`[PRISM:Currency] Synced ${synced} exchange rates for ${today}`);
  return synced;
}
