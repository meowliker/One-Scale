/**
 * Currency Handler
 *
 * Handles multi-currency scenarios between Meta ad accounts and Shopify stores.
 * From V4.4: INR spend is written directly in INR (no conversion), and INR
 * accounts are skipped in USD aggregation to prevent double-counting.
 *
 * Uses API routes for data access to avoid importing server-only modules.
 */

export interface CurrencyConfig {
  storeId: string;
  reportingCurrency: string;
  metaCurrencies: Record<string, string>; // adAccountId -> currency code
}

/**
 * Convert an amount from one currency to another.
 * For same-currency conversions, returns the amount unchanged.
 * Falls back to 1.0 rate if exchange rate is unavailable.
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
): Promise<number> {
  if (from.toUpperCase() === to.toUpperCase()) return amount;

  try {
    const res = await fetch(
      `/api/settings/exchange-rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.rate) return amount * data.rate;
    }
  } catch {
    // Fall through to 1.0
  }

  console.warn(`No exchange rate found for ${from} -> ${to}, using 1.0`);
  return amount;
}

/**
 * Get the currency configuration for a store, including all linked
 * Meta ad account currencies.
 */
export async function getStoreCurrencyConfig(
  storeId: string
): Promise<CurrencyConfig> {
  try {
    const res = await fetch(
      `/api/settings/stores?storeId=${encodeURIComponent(storeId)}`
    );
    if (res.ok) {
      const data = await res.json();
      const store = data.store || data;
      return {
        storeId,
        reportingCurrency: store.reporting_currency || store.currency || 'USD',
        metaCurrencies: store.meta_currencies || {},
      };
    }
  } catch {
    // Fall through to defaults
  }

  return {
    storeId,
    reportingCurrency: 'USD',
    metaCurrencies: {},
  };
}

/**
 * Determine whether an ad account's spend should be skipped in aggregation.
 *
 * From V4.4: When an ad account's currency differs from the reporting currency
 * (e.g., INR account on a USD store), its spend is written directly in the
 * account's currency and should be skipped in reporting-currency aggregation
 * to prevent double-counting.
 */
export function shouldSkipInAggregation(
  adAccountCurrency: string,
  reportingCurrency: string
): boolean {
  return adAccountCurrency.toUpperCase() !== reportingCurrency.toUpperCase();
}
