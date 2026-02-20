import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { resolveDeploymentBaseUrl } from '@/app/api/lib/resolve-base-url';

const SHOPIFY_API_VERSION = '2024-01';

/**
 * Webhook topics to register for real-time order tracking.
 * These enable immediate attribution when orders come in.
 */
const REQUIRED_TOPICS = [
  'orders/create',
  'orders/updated',
  'refunds/create',
] as const;

interface ShopifyWebhook {
  id: number;
  topic: string;
  address: string;
  format: string;
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get('storeId') || '';
  let overrideBaseUrl = '';

  try {
    const body = (await request.json()) as { storeId?: string; baseUrl?: string };
    if (body.storeId) storeId = body.storeId;
    if (body.baseUrl) overrideBaseUrl = body.baseUrl;
  } catch {
    // body is optional
  }

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token.shopDomain) {
    return NextResponse.json({ error: 'Shopify not connected for this store' }, { status: 401 });
  }

  const baseUrl = resolveDeploymentBaseUrl(request, overrideBaseUrl);
  const webhookAddress = `${baseUrl}/api/shopify/webhooks`;

  try {
    // 1. List existing webhooks
    const listRes = await fetch(
      `https://${token.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
      {
        headers: {
          'X-Shopify-Access-Token': token.accessToken,
          'Content-Type': 'application/json',
        },
      }
    );
    if (!listRes.ok) {
      const text = await listRes.text();
      throw new Error(`Failed to list webhooks (${listRes.status}): ${text}`);
    }
    const { webhooks: existing } = (await listRes.json()) as { webhooks: ShopifyWebhook[] };

    // 2. Check which topics need registration
    const registered: string[] = [];
    const alreadyRegistered: string[] = [];
    const errors: string[] = [];

    for (const topic of REQUIRED_TOPICS) {
      const existingHook = existing.find(
        (w) => w.topic === topic && w.address === webhookAddress
      );
      if (existingHook) {
        alreadyRegistered.push(topic);
        continue;
      }

      // Delete any stale hooks for this topic pointing to a different address
      const staleHooks = existing.filter(
        (w) => w.topic === topic && w.address !== webhookAddress
      );
      for (const stale of staleHooks) {
        try {
          await fetch(
            `https://${token.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks/${stale.id}.json`,
            {
              method: 'DELETE',
              headers: {
                'X-Shopify-Access-Token': token.accessToken,
                'Content-Type': 'application/json',
              },
            }
          );
        } catch {
          // best-effort cleanup
        }
      }

      // Register new webhook
      try {
        const createRes = await fetch(
          `https://${token.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
          {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': token.accessToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              webhook: {
                topic,
                address: webhookAddress,
                format: 'json',
              },
            }),
          }
        );
        if (createRes.ok) {
          registered.push(topic);
        } else {
          const errText = await createRes.text();
          errors.push(`${topic}: ${createRes.status} - ${errText}`);
        }
      } catch (err) {
        errors.push(`${topic}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      ok: true,
      storeId,
      shopDomain: token.shopDomain,
      webhookAddress,
      registered,
      alreadyRegistered,
      errors: errors.length > 0 ? errors : undefined,
      totalActive: registered.length + alreadyRegistered.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to register webhooks';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
