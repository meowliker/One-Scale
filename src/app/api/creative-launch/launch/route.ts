import { NextRequest, NextResponse } from 'next/server';
import { getStore } from '@/app/api/lib/db';
import type { ProductLaunchPlan, ProductLaunchResult } from '@/types/creativeLaunch';

interface LaunchRequestBody {
  storeId?: string;
  products?: ProductLaunchPlan[];
  campaignConfig?: {
    mode?: 'existing' | 'new';
    campaignId?: string;
    campaignName?: string;
    adsetMode?: 'existing' | 'new' | 'isolated';
    adsetId?: string;
    adsetName?: string;
    destinationUrl?: string;
  };
  targetingConfig?: unknown;
  budgetConfig?: unknown;
  creativeConfig?: unknown;
  launchAsPaused?: boolean;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateProductLaunchPlan(
  plan: ProductLaunchPlan,
  fallbackDestinationUrl: string
): ProductLaunchResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!plan.creativeIds || plan.creativeIds.length === 0) {
    errors.push('No creatives selected for this product.');
  }

  if (!plan.mapping.adAccountId) errors.push('Ad account is required.');
  if (!plan.mapping.pageId) errors.push('Facebook page is required.');
  if (!plan.mapping.pixelId) errors.push('Pixel is required.');

  const destinationUrl = plan.mapping.destinationUrl || plan.mapping.productLinks?.[0] || fallbackDestinationUrl;
  if (!destinationUrl) {
    errors.push('Destination URL is required.');
  } else if (!isHttpUrl(destinationUrl)) {
    errors.push('Destination URL must be a valid HTTP/HTTPS URL.');
  }

  if (!plan.mapping.instagramId) {
    warnings.push('Instagram account not set. Meta will use page defaults when possible.');
  }
  if (!plan.mapping.utmTemplate) {
    warnings.push('UTM template is empty.');
  }

  return {
    productId: plan.productId,
    productName: plan.productName,
    status: errors.length === 0 ? 'queued' : 'failed',
    errors,
    warnings,
  };
}

export async function POST(request: NextRequest) {
  let body: LaunchRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const storeId = body.storeId || '';
  const products = Array.isArray(body.products) ? body.products : [];
  const fallbackDestinationUrl = body.campaignConfig?.destinationUrl || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }
  if (products.length === 0) {
    return NextResponse.json({ error: 'products array is required' }, { status: 400 });
  }

  const store = getStore(storeId);
  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const results = products.map((plan) => validateProductLaunchPlan(plan, fallbackDestinationUrl));
  const queued = results.filter((row) => row.status === 'queued').length;
  const failed = results.length - queued;

  return NextResponse.json(
    {
      ok: queued > 0,
      summary: {
        total: results.length,
        queued,
        failed,
      },
      results,
      mode: 'orchestrated',
      storeId,
      storeName: store.name,
    },
    { status: queued > 0 ? 200 : 400 }
  );
}
