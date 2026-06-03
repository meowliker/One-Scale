const fallbackToUsdRates: Record<string, number> = {
  USD: 1,
  INR: 0.012,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.74,
  AUD: 0.66,
};

export type LiveExchangeRate = {
  rate: number;
  source: 'google_finance' | 'open_er_api' | 'exchangerate_api';
};

const liveRateCache = new Map<string, { rate: LiveExchangeRate; expiresAt: number }>();
const LIVE_RATE_CACHE_MS = 10 * 60 * 1000;

export function isPlausibleRate(fromCurrency: string, toCurrency: string, rate: number): boolean {
  if (!Number.isFinite(rate) || rate <= 0) return false;
  if (fromCurrency === 'INR' && toCurrency === 'USD') return rate >= 0.005 && rate <= 0.03;
  if (fromCurrency === 'USD' && toCurrency === 'INR') return rate >= 30 && rate <= 200;
  return rate < 1000;
}

function parseGoogleFinanceRate(html: string): number | null {
  const rawRate = html.match(/data-last-price="([^"]+)"/)?.[1];
  if (!rawRate) return null;

  const rate = Number(rawRate.replace(/,/g, ''));
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export async function fetchGoogleExchangeRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<number | null> {
  const quote = `${encodeURIComponent(fromCurrency)}-${encodeURIComponent(toCurrency)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(`https://www.google.com/finance/quote/${quote}`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return null;

    const rate = parseGoogleFinanceRate(await response.text());
    return rate && isPlausibleRate(fromCurrency, toCurrency, rate) ? rate : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchExchangeApiRate(
  source: string,
  sourceName: LiveExchangeRate['source'],
  fromCurrency: string,
  toCurrency: string,
): Promise<LiveExchangeRate | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(source, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json() as {
      rates?: Record<string, number>;
      conversion_rates?: Record<string, number>;
    };
    const rate = data.rates?.[toCurrency] || data.conversion_rates?.[toCurrency];
    return rate && isPlausibleRate(fromCurrency, toCurrency, rate)
      ? { rate, source: sourceName }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchLiveExchangeRate(
  fromCurrency: string,
  toCurrency: string,
): Promise<LiveExchangeRate | null> {
  const cacheKey = `${fromCurrency}:${toCurrency}`;
  const cached = liveRateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const googleRate = await fetchGoogleExchangeRate(fromCurrency, toCurrency);
  if (googleRate) {
    const rate = { rate: googleRate, source: 'google_finance' as const };
    liveRateCache.set(cacheKey, { rate, expiresAt: Date.now() + LIVE_RATE_CACHE_MS });
    return rate;
  }

  const fallbackSources = [
    {
      source: `https://open.er-api.com/v6/latest/${encodeURIComponent(fromCurrency)}`,
      sourceName: 'open_er_api' as const,
    },
    {
      source: `https://api.exchangerate-api.com/v4/latest/${encodeURIComponent(fromCurrency)}`,
      sourceName: 'exchangerate_api' as const,
    },
  ];

  for (const { source, sourceName } of fallbackSources) {
    const rate = await fetchExchangeApiRate(source, sourceName, fromCurrency, toCurrency);
    if (rate) {
      liveRateCache.set(cacheKey, { rate, expiresAt: Date.now() + LIVE_RATE_CACHE_MS });
      return rate;
    }
  }

  return null;
}

export function getFallbackExchangeRate(fromCurrency: string, toCurrency: string): number {
  if (fromCurrency === toCurrency) return 1;

  if (toCurrency === 'USD' && fallbackToUsdRates[fromCurrency]) {
    return fallbackToUsdRates[fromCurrency];
  }

  if (fromCurrency === 'USD' && fallbackToUsdRates[toCurrency]) {
    return 1 / fallbackToUsdRates[toCurrency];
  }

  const fromUsd = fallbackToUsdRates[fromCurrency];
  const toUsd = fallbackToUsdRates[toCurrency];
  if (fromUsd && toUsd) return fromUsd / toUsd;

  return 1;
}
