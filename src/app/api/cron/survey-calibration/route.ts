import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
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

interface SurveyResponse {
  id: string;
  store_id: string;
  order_id: string;
  channel: string; // 'facebook', 'google', 'tiktok', 'organic', 'email', 'word_of_mouth', etc.
  created_at: string;
}

interface TrackingEventCount {
  channel: string;
  count: number;
}

const CHANNELS = ['facebook', 'google', 'tiktok', 'organic', 'email', 'influencer'] as const;

// ---- Channel Detection from Tracking Events ----

function classifyTrackingChannel(event: {
  click_id: string | null;
  fbc: string | null;
  fbp: string | null;
  utm_source: string | null;
  referrer: string | null;
}): string | null {
  // Facebook signals
  if (event.click_id || event.fbc || event.fbp) return 'facebook';
  if (event.utm_source) {
    const src = event.utm_source.toLowerCase();
    if (src.includes('facebook') || src.includes('fb') || src.includes('meta') || src.includes('ig') || src.includes('instagram')) return 'facebook';
    if (src.includes('google') || src.includes('gclid') || src.includes('adwords')) return 'google';
    if (src.includes('tiktok') || src.includes('tt')) return 'tiktok';
    if (src.includes('email') || src.includes('klaviyo') || src.includes('mailchimp')) return 'email';
  }
  if (event.referrer) {
    const ref = event.referrer.toLowerCase();
    if (ref.includes('facebook.com') || ref.includes('instagram.com') || ref.includes('fb.com')) return 'facebook';
    if (ref.includes('google.com') || ref.includes('google.co')) return 'google';
    if (ref.includes('tiktok.com')) return 'tiktok';
  }
  return null;
}

// ---- Main Handler ----

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{
    storeId: string;
    status: string;
    calibrations?: Record<string, number>;
    error?: string;
  }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch survey responses from last 30 days
      const surveys = await rest<SurveyResponse[]>(
        `/survey_responses?store_id=eq.${encodeURIComponent(store.id)}&created_at=gte.${encodeURIComponent(thirtyDaysAgo)}&select=*`
      );

      if (!surveys || surveys.length === 0) {
        results.push({ storeId: store.id, status: 'skipped', error: 'No survey responses' });
        continue;
      }

      // Count survey responses per channel
      const surveyCounts: Record<string, number> = {};
      for (const survey of surveys) {
        const channel = survey.channel.toLowerCase();
        surveyCounts[channel] = (surveyCounts[channel] || 0) + 1;
      }

      // Fetch tracking events (purchases only) from same period
      const trackingEvents = await rest<Array<{
        id: string;
        click_id: string | null;
        fbc: string | null;
        fbp: string | null;
        utm_source: string | null;
        referrer: string | null;
      }>>(
        `/tracking_events?store_id=eq.${encodeURIComponent(store.id)}&event_name=eq.Purchase&occurred_at=gte.${encodeURIComponent(thirtyDaysAgo)}&select=id,click_id,fbc,fbp,utm_source,referrer`
      );

      // Count tracked purchases per channel
      const trackedCounts: Record<string, number> = {};
      for (const event of trackingEvents || []) {
        const channel = classifyTrackingChannel(event);
        if (channel) {
          trackedCounts[channel] = (trackedCounts[channel] || 0) + 1;
        }
      }

      // Calculate calibration multipliers per channel
      const calibrations: Record<string, number> = {};
      let calibrationCount = 0;

      for (const channel of CHANNELS) {
        const surveyCount = surveyCounts[channel] || 0;
        const trackedCount = trackedCounts[channel] || 0;

        if (trackedCount === 0 || surveyCount === 0) continue;

        // Ratio: how many people said this channel vs how many we tracked
        const ratio = surveyCount / trackedCount;

        // Only store multiplier if the ratio indicates meaningful divergence
        // ratio > 1.3 means surveys suggest this channel is under-counted by tracking
        // ratio < 0.7 means surveys suggest this channel is over-counted by tracking
        let multiplier = 1.0;
        if (ratio > 1.3) {
          multiplier = ratio;
        } else if (ratio < 0.7) {
          multiplier = ratio;
        }

        calibrations[channel] = Math.round(multiplier * 1000) / 1000;

        // Upsert into attribution_calibration (idempotent: store_id + channel is unique)
        await rest('/attribution_calibration', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: store.id,
            channel,
            survey_count: surveyCount,
            tracked_count: trackedCount,
            ratio: Math.round(ratio * 1000) / 1000,
            multiplier,
            sample_size: surveys.length,
            period_start: thirtyDaysAgo,
            period_end: new Date().toISOString(),
            computed_at: new Date().toISOString(),
          }),
        });

        calibrationCount++;
      }

      const elapsed = Date.now() - start;
      await logCron('survey-calibration', store.id, 'success', calibrationCount, null, elapsed);
      results.push({ storeId: store.id, status: 'success', calibrations });
    } catch (err) {
      const elapsed = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      await logCron('survey-calibration', store.id, 'error', 0, message, elapsed).catch(() => {});
      await logStoreError(store.id, 'cron_survey_calibration', message);
      results.push({ storeId: store.id, status: 'error', error: message });
      // Continue processing other stores
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'survey-calibration',
    runAt: new Date().toISOString(),
    results,
  });
}
