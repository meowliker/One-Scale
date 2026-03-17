/**
 * Cron: Train Network Archetypes
 * Runs weekly to update cross-store product classification patterns.
 * Also applies archetypes to stores with low-confidence products.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';
import { trainNetworkArchetypes, applyNetworkArchetypes } from '@/lib/intelligence/networkIntelligence';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Step 1: Train archetypes from all stores
  const trainResult = await trainNetworkArchetypes();

  // Step 2: Apply to stores with low-confidence products
  const stores = await listPersistentStores();
  const applyResults: Array<{ store: string; predictions: number }> = [];

  for (const store of stores) {
    try {
      const predictions = await applyNetworkArchetypes(store.id);
      if (predictions.length > 0) {
        applyResults.push({ store: store.name, predictions: predictions.length });
      }
    } catch {
      // Skip store on error
    }
  }

  return NextResponse.json({
    run_at: new Date().toISOString(),
    training: trainResult,
    applied_to: applyResults,
  });
}
