import { rest } from '@/app/api/lib/supabase-persistence';

// Get a platform setting
export async function getPlatformSetting<T = string>(key: string): Promise<T | null> {
  const rows = await rest<Array<{ value: string }>>(
    `/platform_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`
  ).catch(() => []);

  if (!rows[0]?.value) return null;
  try { return JSON.parse(rows[0].value) as T; } catch { return rows[0].value as T; }
}

// Set a platform setting
export async function setPlatformSetting(key: string, value: unknown): Promise<void> {
  await rest('/platform_settings?on_conflict=key', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      key,
      value: JSON.stringify(value),
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => null);
}

// Record a merchant correction for learning
export async function recordCorrection(
  storeId: string,
  productId: string,
  fromClassification: string,
  toClassification: string,
  signalSnapshot: Record<string, unknown>
): Promise<void> {
  await rest('/classification_corrections', {
    method: 'POST',
    body: JSON.stringify({
      store_id: storeId,
      product_id: productId,
      from_classification: fromClassification,
      to_classification: toClassification,
      signals_at_correction: JSON.stringify(signalSnapshot),
      corrected_at: new Date().toISOString(),
    }),
  }).catch(() => null);
}

// Recompute platform-wide classification thresholds from all corrections
export async function recomputePlatformThresholds(): Promise<void> {
  const corrections = await rest<Array<{
    from_classification: string;
    to_classification: string;
    signals_at_correction: string;
  }>>(
    `/classification_corrections?select=from_classification,to_classification,signals_at_correction&limit=1000`
  ).catch(() => []);

  if (corrections.length < 50) return; // Not enough data

  const mainToUpsell = corrections.filter(c => c.from_classification === 'main' && c.to_classification === 'upsell').length;
  const upsellToMain = corrections.filter(c => c.from_classification === 'upsell' && c.to_classification === 'main').length;
  const total = corrections.length;

  // Adjust thresholds based on correction patterns
  const clearMainRatio = mainToUpsell / total > 0.3 ? 2.0 : mainToUpsell / total > 0.15 ? 1.7 : 1.5;
  const clearUpsellRatio = upsellToMain / total > 0.3 ? 2.0 : upsellToMain / total > 0.15 ? 1.7 : 1.5;

  await setPlatformSetting('classification_thresholds', {
    clearMainRatio,
    clearUpsellRatio,
    minScoreForDecision: 30,
    computed_from: total,
    computed_at: new Date().toISOString(),
  });
}
