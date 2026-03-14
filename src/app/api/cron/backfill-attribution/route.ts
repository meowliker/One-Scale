import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  logStoreError,
} from '@/app/api/lib/supabase-persistence';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ---- Cron Log ----

async function logCron(
  cronName: string,
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number
) {
  await rest('/cron_logs', {
    method: 'POST',
    body: JSON.stringify({
      cron_name: cronName,
      store_id: storeId,
      status,
      rows_processed: rowsProcessed,
      error,
      duration_ms: durationMs,
    }),
  });
}

// ---- Types ----

interface LowConfidenceAttribution {
  id: string;
  store_id: string;
  order_id: string;
  shopify_order_id: string;
  confidence_score: number;
  attribution_method: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  created_at: string;
}

interface TrackingEvent {
  id: string;
  store_id: string;
  event_name: string;
  session_id: string | null;
  click_id: string | null;
  fbc: string | null;
  fbp: string | null;
  email_hash: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  occurred_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  value: number | null;
}

interface BackfillProgress {
  id?: string;
  store_id: string;
  cron_name: string;
  last_processed_id: string | null;
  last_run_at: string;
  total_processed: number;
  total_improved: number;
}

// ---- Attribution Scoring ----

function computeAttributionScore(
  event: TrackingEvent,
  orderCreatedAt: string
): { method: string; confidence: number } {
  const eventTime = new Date(event.occurred_at).getTime();
  const orderTime = new Date(orderCreatedAt).getTime();
  const hoursDiff = (orderTime - eventTime) / (1000 * 60 * 60);

  // Time decay: closer events get higher scores
  const timeDecay = Math.max(0, 1 - hoursDiff / (7 * 24)); // Decays over 7 days

  if (event.click_id) {
    return { method: 'click_id', confidence: Math.round(95 * timeDecay) };
  }
  if (event.fbc) {
    return { method: 'fbc', confidence: Math.round(85 * timeDecay) };
  }
  if (event.utm_source && event.utm_campaign) {
    return { method: 'utm', confidence: Math.round(75 * timeDecay) };
  }
  if (event.fbp) {
    return { method: 'fbp', confidence: Math.round(65 * timeDecay) };
  }
  if (event.session_id) {
    return { method: 'session', confidence: Math.round(55 * timeDecay) };
  }
  if (event.email_hash) {
    return { method: 'email', confidence: Math.round(50 * timeDecay) };
  }
  return { method: 'modeled', confidence: Math.round(30 * timeDecay) };
}

// ---- Main Handler ----

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const start = Date.now();
  let totalProcessed = 0;
  let totalImproved = 0;

  try {
    // Find orders older than 1 day with confidence_score < 50
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const lowConfidence = await rest<LowConfidenceAttribution[]>(
      `/order_attribution?confidence_score=lt.50&created_at=lt.${encodeURIComponent(oneDayAgo)}&select=*&order=created_at.desc&limit=500`
    );

    if (!lowConfidence || lowConfidence.length === 0) {
      return NextResponse.json({
        ok: true,
        cron: 'backfill-attribution',
        runAt: new Date().toISOString(),
        message: 'No low-confidence attributions to backfill',
        processed: 0,
        improved: 0,
      });
    }

    // Group by store for efficient processing
    const byStore = new Map<string, LowConfidenceAttribution[]>();
    for (const attr of lowConfidence) {
      const list = byStore.get(attr.store_id) || [];
      list.push(attr);
      byStore.set(attr.store_id, list);
    }

    for (const [storeId, attributions] of byStore) {
      const storeStart = Date.now();
      let storeProcessed = 0;
      let storeImproved = 0;

      try {
        // Fetch tracking events for this store (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const events = await rest<TrackingEvent[]>(
          `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&occurred_at=gte.${encodeURIComponent(thirtyDaysAgo)}&event_name=neq.Purchase&select=*&order=occurred_at.desc&limit=10000`
        );

        if (!events || events.length === 0) {
          storeProcessed = attributions.length;
          totalProcessed += storeProcessed;
          continue;
        }

        // Build signal lookup maps
        const eventsByClickId = new Map<string, TrackingEvent[]>();
        const eventsByFbc = new Map<string, TrackingEvent[]>();
        const eventsByFbp = new Map<string, TrackingEvent[]>();
        const eventsBySession = new Map<string, TrackingEvent[]>();
        const eventsByEmail = new Map<string, TrackingEvent[]>();

        for (const event of events) {
          if (event.click_id) {
            const list = eventsByClickId.get(event.click_id) || [];
            list.push(event);
            eventsByClickId.set(event.click_id, list);
          }
          if (event.fbc) {
            const list = eventsByFbc.get(event.fbc) || [];
            list.push(event);
            eventsByFbc.set(event.fbc, list);
          }
          if (event.fbp) {
            const list = eventsByFbp.get(event.fbp) || [];
            list.push(event);
            eventsByFbp.set(event.fbp, list);
          }
          if (event.session_id) {
            const list = eventsBySession.get(event.session_id) || [];
            list.push(event);
            eventsBySession.set(event.session_id, list);
          }
          if (event.email_hash) {
            const list = eventsByEmail.get(event.email_hash) || [];
            list.push(event);
            eventsByEmail.set(event.email_hash, list);
          }
        }

        // Process each low-confidence attribution
        for (const attr of attributions) {
          storeProcessed++;

          // Find purchase event for this order to get identity signals
          const purchaseEvents = await rest<TrackingEvent[]>(
            `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&event_name=eq.Purchase&select=*&limit=10`
          );

          // Find matching touch events using all available signals
          let bestMatch: TrackingEvent | null = null;
          let bestScore = { method: 'proportional', confidence: 0 };

          // Search across all signal types for matching pre-purchase touches
          const candidates: TrackingEvent[] = [];

          for (const purchase of purchaseEvents || []) {
            if (purchase.click_id) candidates.push(...(eventsByClickId.get(purchase.click_id) || []));
            if (purchase.fbc) candidates.push(...(eventsByFbc.get(purchase.fbc) || []));
            if (purchase.fbp) candidates.push(...(eventsByFbp.get(purchase.fbp) || []));
            if (purchase.session_id) candidates.push(...(eventsBySession.get(purchase.session_id) || []));
            if (purchase.email_hash) candidates.push(...(eventsByEmail.get(purchase.email_hash) || []));
          }

          // Deduplicate and find best match
          const seen = new Set<string>();
          for (const candidate of candidates) {
            if (seen.has(candidate.id)) continue;
            seen.add(candidate.id);

            const score = computeAttributionScore(candidate, attr.created_at);
            if (score.confidence > bestScore.confidence) {
              bestScore = score;
              bestMatch = candidate;
            }
          }

          // Only update if we found a better attribution than current
          if (bestMatch && bestScore.confidence > (attr.confidence_score || 0)) {
            await rest(
              `/order_attribution?id=eq.${encodeURIComponent(attr.id)}`,
              {
                method: 'PATCH',
                body: JSON.stringify({
                  attribution_method: bestScore.method,
                  confidence_score: bestScore.confidence,
                  campaign_id: bestMatch.campaign_id || attr.campaign_id,
                  adset_id: bestMatch.adset_id || attr.adset_id,
                  ad_id: bestMatch.ad_id || attr.ad_id,
                  backfilled_at: new Date().toISOString(),
                }),
              }
            );
            storeImproved++;
          }
        }

        // Update backfill progress tracker
        await rest('/backfill_progress', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: storeId,
            cron_name: 'backfill-attribution',
            last_processed_id: attributions[attributions.length - 1]?.id || null,
            last_run_at: new Date().toISOString(),
            total_processed: storeProcessed,
            total_improved: storeImproved,
          }),
        });

        const storeElapsed = Date.now() - storeStart;
        await logCron('backfill-attribution', storeId, 'success', storeProcessed, null, storeElapsed);

        totalProcessed += storeProcessed;
        totalImproved += storeImproved;
      } catch (err) {
        const storeElapsed = Date.now() - storeStart;
        const message = err instanceof Error ? err.message : 'Unknown error';
        await logCron('backfill-attribution', storeId, 'error', storeProcessed, message, storeElapsed).catch(() => {});
        await logStoreError(storeId, 'cron_backfill_attribution', message);
        totalProcessed += storeProcessed;
        // Continue processing other stores
      }
    }

    return NextResponse.json({
      ok: true,
      cron: 'backfill-attribution',
      runAt: new Date().toISOString(),
      processed: totalProcessed,
      improved: totalImproved,
      checked: lowConfidence.length,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logCron('backfill-attribution', 'global', 'error', 0, message, elapsed).catch(() => {});
    return NextResponse.json({
      ok: false,
      cron: 'backfill-attribution',
      error: message,
    }, { status: 500 });
  }
}
