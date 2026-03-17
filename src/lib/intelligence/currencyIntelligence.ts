/**
 * Currency Intelligence
 *
 * Detects and manages multi-currency support per store.
 *
 * - Detect store currency from Shopify shop data
 * - Detect Meta account currencies per ad account
 * - Detect Shopify Markets if enabled
 * - Apply exchange rate at transaction date, not today
 * - Store original + converted amounts separately
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import type { CurrencyConfigRow } from './types';

// ── Interfaces ──────────────────────────────────────────────

interface ShopData {
  currency: string;
  enabled_presentment_currencies?: string[];
  primary_locale?: string;
}

interface AdAccountCurrency {
  adAccountId: string;
  currency: string;
}

interface CurrencyDetectionResult {
  shopCurrency: string;
  presentmentCurrencies: string[];
  metaCurrencies: Record<string, string>;
  hasMarkets: boolean;
  needsConversion: boolean;
}

// ── Main Detection ──────────────────────────────────────────

/**
 * Detect all currencies associated with a store.
 */
export function detectCurrencies(
  shopData: ShopData,
  adAccountCurrencies: AdAccountCurrency[]
): CurrencyDetectionResult {
  const shopCurrency = shopData.currency || 'USD';
  const presentmentCurrencies = shopData.enabled_presentment_currencies || [shopCurrency];
  const hasMarkets = presentmentCurrencies.length > 1;

  // Build meta currency map
  const metaCurrencies: Record<string, string> = {};
  for (const acc of adAccountCurrencies) {
    metaCurrencies[acc.adAccountId] = acc.currency;
  }

  // Check if any currency differs from shop currency
  const allCurrencies = new Set<string>([
    shopCurrency,
    ...presentmentCurrencies,
    ...Object.values(metaCurrencies),
  ]);
  const needsConversion = allCurrencies.size > 1;

  return {
    shopCurrency,
    presentmentCurrencies,
    metaCurrencies,
    hasMarkets,
    needsConversion,
  };
}

/**
 * Detect currencies and save to currency_config table.
 */
export async function detectAndSaveCurrencies(
  storeId: string,
  shopData: ShopData,
  adAccountCurrencies: AdAccountCurrency[]
): Promise<CurrencyDetectionResult> {
  const result = detectCurrencies(shopData, adAccountCurrencies);

  await rest(
    '/currency_config?on_conflict=store_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        store_id: storeId,
        shop_currency: result.shopCurrency,
        presentment_currencies: result.presentmentCurrencies.join(','),
        meta_currencies: result.metaCurrencies,
        has_markets: result.hasMarkets,
        auto_convert: result.needsConversion,
        display_currency: result.shopCurrency,
        rate_source: 'shopify',
        detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]),
    }
  );

  // Update store_intelligence
  try {
    await rest(
      `/store_intelligence?store_id=eq.${encodeURIComponent(storeId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          currency_detected_at: new Date().toISOString(),
          shop_currency: result.shopCurrency,
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } catch { /* ignore */ }

  return result;
}

/**
 * Get exchange rate for a date from the exchange_rates table.
 * Falls back to the most recent rate if exact date not found.
 */
export async function getExchangeRate(
  baseCurrency: string,
  targetCurrency: string,
  date: string
): Promise<number> {
  if (baseCurrency === targetCurrency) return 1;

  const enc = (v: string) => encodeURIComponent(v);

  // Try exact date first
  try {
    const rows = await rest<Array<{ rate: number }>>(
      `/exchange_rates?base_currency=eq.${enc(baseCurrency)}&target_currency=eq.${enc(targetCurrency)}&date=eq.${enc(date)}&select=rate&limit=1`
    );
    if (rows[0]) return Number(rows[0].rate);
  } catch { /* ignore */ }

  // Fallback: most recent rate before this date
  try {
    const rows = await rest<Array<{ rate: number }>>(
      `/exchange_rates?base_currency=eq.${enc(baseCurrency)}&target_currency=eq.${enc(targetCurrency)}&date=lte.${enc(date)}&select=rate&order=date.desc&limit=1`
    );
    if (rows[0]) return Number(rows[0].rate);
  } catch { /* ignore */ }

  // Try inverse rate
  try {
    const rows = await rest<Array<{ rate: number }>>(
      `/exchange_rates?base_currency=eq.${enc(targetCurrency)}&target_currency=eq.${enc(baseCurrency)}&date=lte.${enc(date)}&select=rate&order=date.desc&limit=1`
    );
    if (rows[0] && Number(rows[0].rate) > 0) return 1 / Number(rows[0].rate);
  } catch { /* ignore */ }

  // No rate found — return 1 and caller should show warning
  return 1;
}

/**
 * Convert an amount from one currency to another at a specific date's rate.
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: string
): Promise<{ converted: number; rate: number; isEstimate: boolean }> {
  if (fromCurrency === toCurrency) {
    return { converted: amount, rate: 1, isEstimate: false };
  }

  const rate = await getExchangeRate(fromCurrency, toCurrency, date);
  const isEstimate = rate === 1 && fromCurrency !== toCurrency;

  return {
    converted: amount * rate,
    rate,
    isEstimate,
  };
}

/**
 * Get stored currency config for a store.
 */
export async function getCurrencyConfig(storeId: string): Promise<CurrencyConfigRow | null> {
  try {
    const rows = await rest<CurrencyConfigRow[]>(
      `/currency_config?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}
