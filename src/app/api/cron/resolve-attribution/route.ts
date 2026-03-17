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

interface UnresolvedAttribution {
  id: string;
  store_id: string;
  order_id: string;
  shopify_order_id: string;
  attribution_method: string | null;
  confidence_score: number | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
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
  page_url: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

// ---- Attribution Logic ----

function scoreAttribution(event: TrackingEvent): { method: string; confidence: number } {
  // Direct click_id match (fbclid) is highest confidence
  if (event.click_id) {
    return { method: 'click_id', confidence: 95 };
  }
  // fbc cookie match
  if (event.fbc) {
    return { method: 'fbc', confidence: 85 };
  }
  // UTM parameter match
  if (event.utm_source && event.utm_campaign) {
    return { method: 'utm', confidence: 70 };
  }
  // fbp cookie match (browser-level, less precise)
  if (event.fbp) {
    return { method: 'fbp', confidence: 60 };
  }
  // Session ID match
  if (event.session_id) {
    return { method: 'session', confidence: 50 };
  }
  return { method: 'proportional', confidence: 20 };
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
  let totalResolved = 0;

  try {
    // Query unresolved attributions (no method or proportional-only)
    const unresolved = await rest<UnresolvedAttribution[]>(
      `/order_attribution?or=(attribution_method.is.null,attribution_method.eq.proportional)&select=*&limit=500&order=created_at.desc`
    );

    if (!unresolved || unresolved.length === 0) {
      return NextResponse.json({
        ok: true,
        cron: 'resolve-attribution',
        runAt: new Date().toISOString(),
        message: 'No unresolved attributions found',
        resolved: 0,
      });
    }

    // Group by store_id for efficient batch processing
    const byStore = new Map<string, UnresolvedAttribution[]>();
    for (const attr of unresolved) {
      const list = byStore.get(attr.store_id) || [];
      list.push(attr);
      byStore.set(attr.store_id, list);
    }

    for (const [storeId, attributions] of byStore) {
      const storeStart = Date.now();
      let storeResolved = 0;

      try {
        // Get all order IDs for this batch
        const orderIds = attributions.map((a) => a.shopify_order_id).filter(Boolean);
        if (orderIds.length === 0) continue;

        // Fetch related tracking events from the last 30 days
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const events = await rest<TrackingEvent[]>(
          `/tracking_events?store_id=eq.${encodeURIComponent(storeId)}&occurred_at=gte.${encodeURIComponent(since)}&select=*&order=occurred_at.desc&limit=5000`
        );

        if (!events || events.length === 0) continue;

        // Build lookup maps for efficient matching
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

        // For each unresolved attribution, find the best matching event
        for (const attr of attributions) {
          // Find the purchase event that corresponds to this order
          const purchaseEvents = events.filter(
            (e) => e.event_name === 'Purchase' && e.store_id === storeId
          );

          // Find the purchase event matching this order (via click_id, fbc, session, email)
          let bestMatch: TrackingEvent | null = null;
          let bestScore = { method: 'proportional', confidence: 0 };

          for (const purchase of purchaseEvents) {
            // Look for pre-purchase touch events that share signals with this purchase
            const candidates: TrackingEvent[] = [];

            if (purchase.click_id) {
              candidates.push(...(eventsByClickId.get(purchase.click_id) || []));
            }
            if (purchase.fbc) {
              candidates.push(...(eventsByFbc.get(purchase.fbc) || []));
            }
            if (purchase.fbp) {
              candidates.push(...(eventsByFbp.get(purchase.fbp) || []));
            }
            if (purchase.session_id) {
              candidates.push(...(eventsBySession.get(purchase.session_id) || []));
            }
            if (purchase.email_hash) {
              candidates.push(...(eventsByEmail.get(purchase.email_hash) || []));
            }

            // Filter to non-purchase events that happened before this purchase
            const prePurchase = candidates.filter(
              (c) =>
                c.event_name !== 'Purchase' &&
                new Date(c.occurred_at).getTime() < new Date(purchase.occurred_at).getTime()
            );

            for (const candidate of prePurchase) {
              const score = scoreAttribution(candidate);
              if (score.confidence > bestScore.confidence) {
                bestScore = score;
                bestMatch = candidate;
              }
            }
          }

          // Only update if we found a better attribution
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
                  utm_source: bestMatch.utm_source,
                  utm_medium: bestMatch.utm_medium,
                  utm_campaign: bestMatch.utm_campaign,
                  resolved_at: new Date().toISOString(),
                }),
              }
            );
            storeResolved++;
          }
        }

        const storeElapsed = Date.now() - storeStart;
        await logCron('resolve-attribution', storeId, 'success', storeResolved, null, storeElapsed);
        totalResolved += storeResolved;
      } catch (err) {
        const storeElapsed = Date.now() - storeStart;
        const message = err instanceof Error ? err.message : 'Unknown error';
        await logCron('resolve-attribution', storeId, 'error', storeResolved, message, storeElapsed).catch(() => {});
        await logStoreError(storeId, 'cron_resolve_attribution', message);
        // Continue processing other stores
      }
    }

    return NextResponse.json({
      ok: true,
      cron: 'resolve-attribution',
      runAt: new Date().toISOString(),
      resolved: totalResolved,
      checked: unresolved.length,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logCron('resolve-attribution', 'global', 'error', 0, message, elapsed).catch(() => {});
    return NextResponse.json({
      ok: false,
      cron: 'resolve-attribution',
      error: message,
    }, { status: 500 });
  }
}
