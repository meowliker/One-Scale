import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Supabase REST helper (self-contained for tracking_configs table)
// ---------------------------------------------------------------------------

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function supabaseRest(path: string, init?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  return res;
}

// ---------------------------------------------------------------------------
// Step result types
// ---------------------------------------------------------------------------

type StepStatus = 'success' | 'error' | 'skipped';

interface TrackingConfigResult {
  status: StepStatus;
  pixelId: string;
  message: string;
}

interface PixelInstallResult {
  status: StepStatus;
  message: string;
}

interface WebhooksResult {
  status: StepStatus;
  registered: number;
  message: string;
}

interface BackfillResult {
  status: StepStatus;
  orders: number;
  attributed: number;
  message: string;
}

interface CronScheduleResult {
  status: StepStatus;
  message: string;
}

interface AutoSetupResponse {
  ok: boolean;
  storeId: string;
  steps: {
    trackingConfig: TrackingConfigResult;
    pixelInstall: PixelInstallResult;
    webhooks: WebhooksResult;
    backfill: BackfillResult;
    cronSchedule: CronScheduleResult;
  };
}

// ---------------------------------------------------------------------------
// POST /api/tracking/auto-setup?storeId=xxx
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // --- Parse storeId and optional baseUrl ---
  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get('storeId') || '';
  let bodyBaseUrl = '';

  try {
    const body = (await request.json()) as { baseUrl?: string; storeId?: string };
    if (body.storeId) storeId = body.storeId;
    if (body.baseUrl) bodyBaseUrl = body.baseUrl;
  } catch {
    // body is optional
  }

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const resolvedBaseUrl =
    bodyBaseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    `https://${request.headers.get('host')}`;

  const cookieHeader = request.headers.get('cookie') || '';

  // Initialize step results with safe defaults
  const steps: AutoSetupResponse['steps'] = {
    trackingConfig: { status: 'error', pixelId: '', message: 'Not started' },
    pixelInstall: { status: 'error', message: 'Not started' },
    webhooks: { status: 'error', registered: 0, message: 'Not started' },
    backfill: { status: 'error', orders: 0, attributed: 0, message: 'Not started' },
    cronSchedule: { status: 'error', message: 'Not started' },
  };

  // =========================================================================
  // Step 1: Generate / ensure tracking config exists
  // =========================================================================
  const pixelId = `TW-${storeId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;

  try {
    const sb = isSupabasePersistenceEnabled();

    if (sb) {
      // Check if tracking config already exists for this store
      const existingRes = await supabaseRest(
        `/tracking_configs?store_id=eq.${encodeURIComponent(storeId)}&select=pixel_id&limit=1`
      );

      if (existingRes.ok) {
        const existingRows = await existingRes.json();
        if (Array.isArray(existingRows) && existingRows.length > 0) {
          steps.trackingConfig = {
            status: 'skipped',
            pixelId: existingRows[0].pixel_id || pixelId,
            message: 'Tracking config already exists',
          };
        } else {
          // Create a new tracking config
          const createRes = await supabaseRest('/tracking_configs', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              store_id: storeId,
              pixel_id: pixelId,
              server_side_enabled: true,
            }),
          });

          if (createRes.ok || createRes.status === 201) {
            steps.trackingConfig = {
              status: 'success',
              pixelId,
              message: 'Tracking config created',
            };
          } else {
            const errText = await createRes.text();
            steps.trackingConfig = {
              status: 'error',
              pixelId,
              message: `Failed to create tracking config: ${createRes.status} - ${errText}`,
            };
          }
        }
      } else {
        const errText = await existingRes.text();
        steps.trackingConfig = {
          status: 'error',
          pixelId,
          message: `Failed to query tracking configs: ${existingRes.status} - ${errText}`,
        };
      }
    } else {
      // Supabase not enabled — skip
      steps.trackingConfig = {
        status: 'skipped',
        pixelId,
        message: 'Supabase persistence not enabled; skipping config creation',
      };
    }
  } catch (err) {
    steps.trackingConfig = {
      status: 'error',
      pixelId,
      message: `Tracking config step failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // =========================================================================
  // Step 2: Install pixel on Shopify store
  // =========================================================================
  try {
    const pixelRes = await fetch(
      new URL('/api/tracking/install-pixel', resolvedBaseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: cookieHeader,
        },
        body: JSON.stringify({ storeId, baseUrl: resolvedBaseUrl }),
      }
    );

    const pixelData = await pixelRes.json().catch(() => ({}));

    if (pixelRes.ok && (pixelData.ok || pixelData.installed || pixelData.alreadyInstalled)) {
      steps.pixelInstall = {
        status: 'success',
        message: pixelData.alreadyInstalled
          ? 'Pixel already installed'
          : 'Pixel installed successfully',
      };
    } else {
      steps.pixelInstall = {
        status: 'error',
        message: pixelData.error || `Pixel install failed (${pixelRes.status})`,
      };
    }
  } catch (err) {
    steps.pixelInstall = {
      status: 'error',
      message: `Pixel install step failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // =========================================================================
  // Step 3: Register webhooks
  // =========================================================================
  try {
    const webhookRes = await fetch(
      new URL('/api/shopify/register-webhooks', resolvedBaseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: cookieHeader,
        },
        body: JSON.stringify({ storeId, baseUrl: resolvedBaseUrl }),
      }
    );

    const webhookData = await webhookRes.json().catch(() => ({}));

    if (webhookRes.ok && webhookData.ok) {
      const registered =
        (webhookData.registered?.length ?? 0) +
        (webhookData.alreadyRegistered?.length ?? 0);
      steps.webhooks = {
        status: 'success',
        registered: webhookData.totalActive ?? registered,
        message:
          webhookData.registered?.length > 0
            ? `Registered ${webhookData.registered.length} new webhook(s)`
            : 'All webhooks already registered',
      };
    } else {
      steps.webhooks = {
        status: 'error',
        registered: 0,
        message: webhookData.error || `Webhook registration failed (${webhookRes.status})`,
      };
    }
  } catch (err) {
    steps.webhooks = {
      status: 'error',
      registered: 0,
      message: `Webhook step failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // =========================================================================
  // Step 4: Run initial 7-day backfill
  // =========================================================================
  try {
    const backfillRes = await fetch(
      new URL(`/api/tracking/backfill-orders?storeId=${encodeURIComponent(storeId)}`, resolvedBaseUrl),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: cookieHeader,
        },
        body: JSON.stringify({ storeId, days: 7, fast: true }),
      }
    );

    const backfillData = await backfillRes.json().catch(() => ({}));

    if (backfillRes.ok && (backfillData.ok || backfillData.orders != null)) {
      steps.backfill = {
        status: 'success',
        orders: backfillData.orders ?? backfillData.totalOrders ?? 0,
        attributed: backfillData.attributed ?? backfillData.attributedOrders ?? 0,
        message: `Backfilled ${backfillData.orders ?? backfillData.totalOrders ?? 0} orders`,
      };
    } else {
      steps.backfill = {
        status: 'error',
        orders: 0,
        attributed: 0,
        message: backfillData.error || `Backfill failed (${backfillRes.status})`,
      };
    }
  } catch (err) {
    steps.backfill = {
      status: 'error',
      orders: 0,
      attributed: 0,
      message: `Backfill step failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // =========================================================================
  // Step 5: Mark store as auto-backfill enabled
  // =========================================================================
  try {
    const sb = isSupabasePersistenceEnabled();

    if (sb) {
      const patchRes = await supabaseRest(
        `/tracking_configs?store_id=eq.${encodeURIComponent(storeId)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ auto_backfill_enabled: true }),
        }
      );

      if (patchRes.ok || patchRes.status === 204) {
        steps.cronSchedule = {
          status: 'success',
          message: 'Auto-backfill enabled for store',
        };
      } else {
        const errText = await patchRes.text();
        steps.cronSchedule = {
          status: 'error',
          message: `Failed to enable auto-backfill: ${patchRes.status} - ${errText}`,
        };
      }
    } else {
      steps.cronSchedule = {
        status: 'skipped',
        message: 'Supabase persistence not enabled; skipping auto-backfill flag',
      };
    }
  } catch (err) {
    steps.cronSchedule = {
      status: 'error',
      message: `Cron schedule step failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // =========================================================================
  // Response
  // =========================================================================
  return NextResponse.json({
    ok: true,
    storeId,
    steps,
  } satisfies AutoSetupResponse);
}
