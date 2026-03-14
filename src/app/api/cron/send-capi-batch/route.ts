import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
} from '@/app/api/lib/supabase-persistence';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const META_CAPI_URL = 'https://graph.facebook.com/v21.0';

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

interface PendingCapiEvent {
  id: string;
  store_id: string;
  pixel_id: string;
  event_name: string;
  event_time: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user_data: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custom_data: any;
  event_source_url: string | null;
  action_source: string;
  status: string;
  retry_count: number;
  access_token: string;
}

interface CapiResponse {
  events_received: number;
  messages: string[];
  fbtrace_id: string;
}

// ---- Slack Alert ----

async function sendSlackAlert(message: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch {
    console.error('[CAPI] Failed to send Slack alert');
  }
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
  let totalSent = 0;
  let totalFailed = 0;

  try {
    // Fetch pending events: status = 'pending' OR (status = 'failed' AND retry_count < 3)
    const pendingEvents = await rest<PendingCapiEvent[]>(
      `/capi_logs?or=(status.eq.pending,and(status.eq.failed,retry_count.lt.3))&select=*&order=event_time.asc&limit=1000`
    );

    if (!pendingEvents || pendingEvents.length === 0) {
      return NextResponse.json({
        ok: true,
        cron: 'send-capi-batch',
        runAt: new Date().toISOString(),
        message: 'No pending events',
        sent: 0,
        failed: 0,
      });
    }

    // Group events by pixel_id + access_token for batch sending
    const batches = new Map<string, PendingCapiEvent[]>();
    for (const event of pendingEvents) {
      const key = `${event.pixel_id}::${event.access_token}`;
      const list = batches.get(key) || [];
      list.push(event);
      batches.set(key, list);
    }

    for (const [key, events] of batches) {
      const [pixelId, accessToken] = key.split('::');
      if (!pixelId || !accessToken) continue;

      // Send in chunks of up to 1000 events per request
      for (let i = 0; i < events.length; i += 1000) {
        const chunk = events.slice(i, i + 1000);
        const storeId = chunk[0]?.store_id || 'unknown';

        const capiPayload = {
          data: chunk.map((e) => ({
            event_name: e.event_name,
            event_time: e.event_time,
            user_data: typeof e.user_data === 'string' ? JSON.parse(e.user_data) : e.user_data,
            custom_data: typeof e.custom_data === 'string' ? JSON.parse(e.custom_data) : e.custom_data,
            event_source_url: e.event_source_url,
            action_source: e.action_source || 'website',
          })),
        };

        try {
          const response = await fetch(
            `${META_CAPI_URL}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(capiPayload),
            }
          );

          if (response.ok) {
            const result = (await response.json()) as CapiResponse;

            // Update all events in this chunk as sent
            const eventIds = chunk.map((e) => e.id);
            for (const eventId of eventIds) {
              await rest(`/capi_logs?id=eq.${encodeURIComponent(eventId)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  status: 'sent',
                  sent_at: new Date().toISOString(),
                  events_received: result.events_received,
                  fbtrace_id: result.fbtrace_id,
                }),
              });
            }

            totalSent += chunk.length;

            // Check EMQ score from response headers
            const emqHeader = response.headers.get('x-fb-ads-insights-emq');
            if (emqHeader) {
              const emqScore = parseFloat(emqHeader);
              if (!isNaN(emqScore) && emqScore < 6.0) {
                await sendSlackAlert(
                  `[OneScale CAPI] EMQ score dropped to ${emqScore.toFixed(1)} for pixel ${pixelId} (store: ${storeId}). Minimum recommended: 6.0. Check user_data quality.`
                );
              }
            }
          } else {
            const errorBody = await response.text();
            console.error(`[CAPI] Batch send failed (${response.status}):`, errorBody);

            // Mark events as failed with incremented retry_count
            for (const event of chunk) {
              await rest(`/capi_logs?id=eq.${encodeURIComponent(event.id)}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  status: 'failed',
                  retry_count: (event.retry_count || 0) + 1,
                  last_error: errorBody.substring(0, 500),
                  last_attempt_at: new Date().toISOString(),
                }),
              });
            }

            totalFailed += chunk.length;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          console.error('[CAPI] Network error:', message);

          for (const event of chunk) {
            await rest(`/capi_logs?id=eq.${encodeURIComponent(event.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'failed',
                retry_count: (event.retry_count || 0) + 1,
                last_error: message.substring(0, 500),
                last_attempt_at: new Date().toISOString(),
              }),
            });
          }

          totalFailed += chunk.length;
        }
      }
    }

    const elapsed = Date.now() - start;
    await logCron('send-capi-batch', 'global', 'success', totalSent, null, elapsed);

    return NextResponse.json({
      ok: true,
      cron: 'send-capi-batch',
      runAt: new Date().toISOString(),
      sent: totalSent,
      failed: totalFailed,
      total: pendingEvents.length,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logCron('send-capi-batch', 'global', 'error', 0, message, elapsed).catch(() => {});
    return NextResponse.json({
      ok: false,
      cron: 'send-capi-batch',
      error: message,
    }, { status: 500 });
  }
}
