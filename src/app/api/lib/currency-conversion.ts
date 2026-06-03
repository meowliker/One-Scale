import { isSupabasePersistenceEnabled, rest } from '@/app/api/lib/supabase-persistence';
import {
  fetchLiveExchangeRate,
  getFallbackExchangeRate,
  isPlausibleRate,
} from '@/app/api/lib/live-exchange-rate';

export function normalizeCurrencyCode(value: string | null | undefined, fallback = 'USD'): string {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

async function getStoredExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date?: string,
): Promise<number | null> {
  if (!isSupabasePersistenceEnabled()) return null;

  const enc = (value: string) => encodeURIComponent(value);
  const dateFilter = date ? `&date=lte.${enc(date)}` : '';

  const queries = [
    `/exchange_rates?base_currency=eq.${enc(fromCurrency)}&target_currency=eq.${enc(toCurrency)}${dateFilter}&select=rate,date&order=date.desc&limit=1`,
    `/exchange_rates?from_currency=eq.${enc(fromCurrency)}&to_currency=eq.${enc(toCurrency)}${dateFilter}&select=rate,date&order=date.desc&limit=1`,
  ];

  for (const query of queries) {
    const rows = await rest<Array<{ rate: number }>>(query).catch(() => []);
    const rate = Number(rows[0]?.rate);
    if (isPlausibleRate(fromCurrency, toCurrency, rate)) return rate;
  }

  const inverseQueries = [
    `/exchange_rates?base_currency=eq.${enc(toCurrency)}&target_currency=eq.${enc(fromCurrency)}${dateFilter}&select=rate,date&order=date.desc&limit=1`,
    `/exchange_rates?from_currency=eq.${enc(toCurrency)}&to_currency=eq.${enc(fromCurrency)}${dateFilter}&select=rate,date&order=date.desc&limit=1`,
  ];

  for (const query of inverseQueries) {
    const rows = await rest<Array<{ rate: number }>>(query).catch(() => []);
    const inverseRate = Number(rows[0]?.rate);
    const rate = inverseRate > 0 ? 1 / inverseRate : 0;
    if (isPlausibleRate(fromCurrency, toCurrency, rate)) return rate;
  }

  return null;
}

function shouldUseStoredRateFirst(date?: string): boolean {
  if (!date) return false;

  const today = new Date().toISOString().slice(0, 10);
  return date < today;
}

export async function getExchangeRateServer(
  fromCurrencyInput: string | null | undefined,
  toCurrencyInput: string | null | undefined,
  date?: string,
): Promise<number> {
  const fromCurrency = normalizeCurrencyCode(fromCurrencyInput);
  const toCurrency = normalizeCurrencyCode(toCurrencyInput);
  if (fromCurrency === toCurrency) return 1;

  if (shouldUseStoredRateFirst(date)) {
    const storedRate = await getStoredExchangeRate(fromCurrency, toCurrency, date);
    if (storedRate) return storedRate;
  }

  const liveRate = await fetchLiveExchangeRate(fromCurrency, toCurrency);
  if (liveRate?.rate) return liveRate.rate;

  const storedRate = await getStoredExchangeRate(fromCurrency, toCurrency, date);
  if (storedRate) return storedRate;

  return getFallbackExchangeRate(fromCurrency, toCurrency);
}

export async function convertCurrencyServer(
  amount: number,
  fromCurrencyInput: string | null | undefined,
  toCurrencyInput: string | null | undefined,
  date?: string,
): Promise<number> {
  const value = Number(amount) || 0;
  const fromCurrency = normalizeCurrencyCode(fromCurrencyInput);
  const toCurrency = normalizeCurrencyCode(toCurrencyInput);
  if (fromCurrency === toCurrency) return value;

  const rate = await getExchangeRateServer(fromCurrency, toCurrency, date);
  return value * rate;
}

export async function getStoreReportingCurrencyServer(storeId: string): Promise<string> {
  if (!isSupabasePersistenceEnabled()) return 'USD';

  const rows = await rest<Array<{ currency: string | null; reporting_currency: string | null }>>(
    `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=currency,reporting_currency&limit=1`,
  ).catch(() => []);

  return normalizeCurrencyCode(rows[0]?.reporting_currency || rows[0]?.currency || 'USD');
}
