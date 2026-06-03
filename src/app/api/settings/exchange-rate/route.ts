import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, rest } from '@/app/api/lib/supabase-persistence';
import {
  fetchLiveExchangeRate,
  getFallbackExchangeRate,
  isPlausibleRate,
} from '@/app/api/lib/live-exchange-rate';

export const dynamic = 'force-dynamic';

function normalizeCurrency(value: string | null): string {
  const code = String(value || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : '';
}

async function getStoredExchangeRate(fromCurrency: string, toCurrency: string): Promise<number | null> {
  if (!isSupabasePersistenceEnabled()) return null;

  const enc = (value: string) => encodeURIComponent(value);

  const recentRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?base_currency=eq.${enc(fromCurrency)}&target_currency=eq.${enc(toCurrency)}&select=rate,date&order=date.desc&limit=1`,
  ).catch(() => []);
  if (recentRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, Number(recentRows[0].rate))) {
    return Number(recentRows[0].rate);
  }

  const legacyRecentRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?from_currency=eq.${enc(fromCurrency)}&to_currency=eq.${enc(toCurrency)}&select=rate,date&order=date.desc&limit=1`,
  ).catch(() => []);
  if (legacyRecentRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, Number(legacyRecentRows[0].rate))) {
    return Number(legacyRecentRows[0].rate);
  }

  const inverseRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?base_currency=eq.${enc(toCurrency)}&target_currency=eq.${enc(fromCurrency)}&select=rate,date&order=date.desc&limit=1`,
  ).catch(() => []);
  if (inverseRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, 1 / Number(inverseRows[0].rate))) {
    return 1 / Number(inverseRows[0].rate);
  }

  const legacyInverseRows = await rest<Array<{ rate: number }>>(
    `/exchange_rates?from_currency=eq.${enc(toCurrency)}&to_currency=eq.${enc(fromCurrency)}&select=rate,date&order=date.desc&limit=1`,
  ).catch(() => []);
  if (legacyInverseRows[0]?.rate && isPlausibleRate(fromCurrency, toCurrency, 1 / Number(legacyInverseRows[0].rate))) {
    return 1 / Number(legacyInverseRows[0].rate);
  }

  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fromCurrency = normalizeCurrency(searchParams.get('from'));
  const toCurrency = normalizeCurrency(searchParams.get('to'));

  if (!fromCurrency || !toCurrency) {
    return NextResponse.json({ error: 'Valid from and to currency codes are required' }, { status: 400 });
  }

  if (fromCurrency === toCurrency) {
    return NextResponse.json({ rate: 1, source: 'same_currency' });
  }

  const liveRate = await fetchLiveExchangeRate(fromCurrency, toCurrency);
  if (liveRate?.rate && liveRate.rate > 0) {
    return NextResponse.json({ rate: liveRate.rate, source: liveRate.source });
  }

  const storedRate = await getStoredExchangeRate(fromCurrency, toCurrency);
  if (storedRate && storedRate > 0) {
    return NextResponse.json({ rate: storedRate, source: 'stored' });
  }

  const fallbackRate = getFallbackExchangeRate(fromCurrency, toCurrency);
  const fallbackCurrencies = new Set(['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD']);
  const hasKnownFallback = fallbackCurrencies.has(fromCurrency) && fallbackCurrencies.has(toCurrency);

  if (hasKnownFallback && fallbackRate && fallbackRate > 0) {
    return NextResponse.json({ rate: fallbackRate, source: 'fallback' });
  }

  return NextResponse.json({ error: `No exchange rate found for ${fromCurrency} -> ${toCurrency}` }, { status: 404 });
}
