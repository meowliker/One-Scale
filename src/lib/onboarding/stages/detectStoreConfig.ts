import { rest } from '@/app/api/lib/supabase-persistence';

const SHOPIFY_API_VERSION = '2024-01';

export interface StoreConfig {
  store_id: string;
  shopify_store_name: string | null;
  shopify_store_id: string | null;
  shopify_domain: string | null;
  myshopify_domain: string | null;
  currency: string;
  reporting_currency: string;
  money_format: string | null;
  money_with_currency_format: string | null;
  currency_format: string | null;
  enabled_presentment_currencies: string[];
  iana_timezone: string;
  timezone_offset: string | null;
  country_code: string | null;
  country_name: string | null;
  province_code: string | null;
  primary_locale: string | null;
  shopify_plan: string | null;
  shopify_plan_display: string | null;
  taxes_included: boolean;
  tax_shipping: boolean;
  weight_unit: string | null;
  store_created_at: string | null;
  config_synced_at: string;
  config_version: number;
}

/**
 * Fetch full shop config from Shopify API and save to store_config.
 * Called during onboarding and by the daily config sync cron.
 */
export async function detectAndSaveStoreConfig(
  storeId: string,
  accessToken: string,
  shopDomain: string,
): Promise<StoreConfig> {
  const response = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
    { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } },
  );

  if (!response.ok) {
    throw new Error(`Shop API ${response.status}: ${await response.text()}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { shop } = await response.json() as { shop: Record<string, any> };

  const config: StoreConfig = {
    store_id: storeId,
    shopify_store_name: shop.name || null,
    shopify_store_id: shop.id ? String(shop.id) : null,
    shopify_domain: shop.domain || shopDomain,
    myshopify_domain: shop.myshopify_domain || shopDomain,
    currency: shop.currency || 'USD',
    reporting_currency: shop.currency || 'USD',
    money_format: shop.money_format || null,
    money_with_currency_format: shop.money_with_currency_format || null,
    currency_format: shop.currency_format || null,
    enabled_presentment_currencies: shop.enabled_presentment_currencies ?? [shop.currency || 'USD'],
    iana_timezone: shop.iana_timezone || 'America/New_York',
    timezone_offset: shop.timezone || null,
    country_code: shop.country_code || null,
    country_name: shop.country_name || null,
    province_code: shop.province_code || null,
    primary_locale: shop.primary_locale || 'en',
    shopify_plan: shop.plan_name || null,
    shopify_plan_display: shop.plan_display_name || null,
    taxes_included: shop.taxes_included ?? false,
    tax_shipping: shop.tax_shipping ?? false,
    weight_unit: shop.weight_unit || 'kg',
    store_created_at: shop.created_at || null,
    config_synced_at: new Date().toISOString(),
    config_version: 1,
  };

  await rest('/store_config', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(config),
  });

  console.log(
    `[StoreConfig] ${shopDomain}: currency=${config.currency}, ` +
    `timezone=${config.iana_timezone}, country=${config.country_code}`,
  );

  return config;
}

/**
 * Handle a shop/update webhook or detected config drift.
 * Compares new shop data against stored config, logs changes, and handles
 * critical changes (currency/timezone) by invalidating affected P&L snapshots.
 */
export async function handleShopConfigChange(
  storeId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newShopData: Record<string, any>,
): Promise<void> {
  const existing = await rest<Array<Record<string, string | number | boolean | null>>>(
    `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`,
  ).catch(() => []);

  const currentConfig = existing[0];
  if (!currentConfig) return;

  // Fields to watch for changes
  const fieldsToWatch: Record<string, unknown> = {
    currency: newShopData.currency,
    iana_timezone: newShopData.iana_timezone,
    country_code: newShopData.country_code,
    taxes_included: newShopData.taxes_included,
    money_format: newShopData.money_format,
    primary_locale: newShopData.primary_locale,
    shopify_plan: newShopData.plan_name,
    shopify_store_name: newShopData.name,
  };

  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const [field, newValue] of Object.entries(fieldsToWatch)) {
    if (newValue === undefined) continue;
    const currentValue = currentConfig[field];
    if (JSON.stringify(currentValue) !== JSON.stringify(newValue)) {
      changes[field] = { from: currentValue, to: newValue };
    }
  }

  if (Object.keys(changes).length === 0) return;

  console.log(`[StoreConfig] Changes detected for ${storeId}:`, JSON.stringify(changes));

  // Save change history
  await rest('/store_config_history', {
    method: 'POST',
    body: JSON.stringify({
      store_id: storeId,
      changed_fields: changes,
      previous_values: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])),
      new_values: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])),
      source: 'webhook',
    }),
  }).catch(() => null);

  // Build update payload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = {
    config_synced_at: new Date().toISOString(),
    config_version: ((currentConfig.config_version as number) ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };

  for (const [field, change] of Object.entries(changes)) {
    updatePayload[field] = change.to;
    // Also update reporting_currency when currency changes
    if (field === 'currency') updatePayload.reporting_currency = change.to;
  }

  // Handle critical changes
  if (changes.currency) {
    updatePayload.previous_currency = changes.currency.from;
    updatePayload.currency_changed_at = new Date().toISOString();

    // Invalidate ALL P&L snapshots — they used the wrong currency
    await rest(
      `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}`,
      { method: 'DELETE' },
    ).catch(() => null);

    console.log(`[StoreConfig] Currency changed ${changes.currency.from} → ${changes.currency.to} for ${storeId} — P&L snapshots cleared`);
  }

  if (changes.iana_timezone) {
    updatePayload.previous_timezone = changes.iana_timezone.from;
    updatePayload.timezone_changed_at = new Date().toISOString();

    // Timezone changes affect date bucketing — clear last 60 days
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const cutoff = sixtyDaysAgo.toISOString().split('T')[0];

    await rest(
      `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${cutoff}`,
      { method: 'DELETE' },
    ).catch(() => null);

    console.log(`[StoreConfig] Timezone changed ${changes.iana_timezone.from} → ${changes.iana_timezone.to} for ${storeId} — last 60 days snapshots cleared`);
  }

  // Save updated config
  await rest(`/store_config?store_id=eq.${encodeURIComponent(storeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updatePayload),
  }).catch(() => null);
}

/**
 * Get store timezone from store_config. Server-side only.
 */
export async function getStoreTimezoneFromConfig(storeId: string): Promise<string> {
  const rows = await rest<Array<{ iana_timezone: string }>>(
    `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=iana_timezone&limit=1`,
  ).catch(() => []);

  if (!rows[0]?.iana_timezone) {
    console.warn(`[StoreConfig] No timezone for ${storeId} — using America/New_York`);
    return 'America/New_York';
  }

  return rows[0].iana_timezone;
}

/**
 * Get store currency from store_config. Server-side only.
 */
export async function getStoreCurrencyFromConfig(storeId: string): Promise<string> {
  const rows = await rest<Array<{ currency: string }>>(
    `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=currency&limit=1`,
  ).catch(() => []);

  return rows[0]?.currency ?? 'USD';
}
