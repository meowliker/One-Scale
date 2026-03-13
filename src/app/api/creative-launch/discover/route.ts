import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken, getStoreAdAccounts, getLatestMetaEndpointSnapshot } from '@/app/api/lib/db';
import { getMetaToken } from '@/app/api/lib/tokens';
import type { ProductProfile, ClickUpCreativeSet, WinnerCopy } from '@/types/creativeLaunch';

interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  value?: unknown;
}

interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status: { status: string; color: string };
  custom_fields: ClickUpCustomField[];
  tags: Array<{ name: string }>;
  list: { id: string; name: string };
  url: string;
  date_created: string;
}

function extractFieldValue(fields: ClickUpCustomField[], ...nameParts: string[]): string {
  for (const field of fields) {
    const nameLower = field.name.toLowerCase();
    if (nameParts.some((p) => nameLower.includes(p.toLowerCase()))) {
      if (field.value == null) continue;
      if (typeof field.value === 'string') return field.value;
      if (typeof field.value === 'object') {
        const v = field.value as Record<string, unknown>;
        if (v.url) return String(v.url);
        if (v.value) return String(v.value);
        if (v.name) return String(v.name);
      }
      return String(field.value);
    }
  }
  return '';
}

function detectFormat(fields: ClickUpCustomField[], name: string, tags: Array<{ name: string }>): 'video' | 'image' | 'carousel' {
  const fv = extractFieldValue(fields, 'format', 'type', 'creative type').toLowerCase();
  if (fv.includes('video')) return 'video';
  if (fv.includes('carousel')) return 'carousel';
  if (fv.includes('image') || fv.includes('static')) return 'image';
  for (const tag of tags) {
    const t = tag.name.toLowerCase();
    if (t.includes('video') || t.includes('ugc')) return 'video';
    if (t.includes('carousel')) return 'carousel';
    if (t.includes('image') || t.includes('static')) return 'image';
  }
  const n = name.toLowerCase();
  if (n.includes('video') || n.includes('ugc') || n.includes('reel')) return 'video';
  if (n.includes('carousel')) return 'carousel';
  return 'image';
}

// Extract winner copy from Meta ad snapshots
function extractWinnerCopy(storeId: string): WinnerCopy[] {
  try {
    // Try to get ads snapshot from DB (cached from last Meta sync)
    const snapshot = getLatestMetaEndpointSnapshot(storeId, 'ads', '');
    if (!snapshot) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ads = snapshot.data as any[];
    if (!Array.isArray(ads)) return [];

    const winners: WinnerCopy[] = [];
    for (const ad of ads) {
      const roas = parseFloat(ad.metrics?.roas ?? ad.metrics?.purchase_roas ?? '0');
      const spend = parseFloat(ad.metrics?.spend ?? '0');
      if (roas < 1.0 || spend < 10) continue;

      const creative = ad.creative?.body || ad.name || '';
      const headline = ad.creative?.title || ad.creative?.headline || '';

      if (!creative && !headline) continue;

      winners.push({
        id: ad.id,
        primaryText: creative,
        headline: headline || creative.split('\n')[0] || '',
        cta: ad.creative?.call_to_action?.type || 'SHOP_NOW',
        roas: Math.round(roas * 100) / 100,
        spend: Math.round(spend),
        daysRunning: ad.daysRunning ?? 7,
      });
    }

    // Sort by ROAS descending, take top 5
    return winners.sort((a, b) => b.roas - a.roas).slice(0, 5);
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  // --- Check ClickUp connection ---
  const clickupRow = getThirdPartyToken(storeId, 'clickup');
  if (!clickupRow) {
    return NextResponse.json({
      notConnected: true,
      products: [],
      clickupCreatives: [],
      message: 'ClickUp not connected. Go to Settings → Integrations to connect.',
    });
  }

  const token = clickupRow.access_token;
  const meta = clickupRow.metadata ? JSON.parse(clickupRow.metadata) as {
    listId?: string;
    readyStatus?: string;
    workspaceId?: string;
    workspaceName?: string;
  } : {};

  if (!meta.listId) {
    return NextResponse.json({
      notConfigured: true,
      products: [],
      clickupCreatives: [],
      message: 'ClickUp list not configured. Go to Settings → Integrations to set it up.',
    });
  }

  // --- Fetch ClickUp tasks ---
  const status = meta.readyStatus || 'ready to launch';
  const params = new URLSearchParams({ include_closed: 'false', subtasks: 'true', page: '0' });
  params.append('statuses[]', status);

  const tasksRes = await fetch(
    `https://api.clickup.com/api/v2/list/${meta.listId}/task?${params.toString()}`,
    { headers: { Authorization: token } }
  );

  let tasks: ClickUpTask[] = [];
  if (tasksRes.ok) {
    const data = await tasksRes.json() as { tasks: ClickUpTask[] };
    tasks = data.tasks || [];
  }

  // --- Get Meta ad account info for this store ---
  const adAccounts = getStoreAdAccounts(storeId);
  const metaToken = await getMetaToken(storeId);
  const hasMetaConnection = !!metaToken && adAccounts.length > 0;

  const primaryAdAccount = adAccounts[0];
  const winnerCopyLibrary = extractWinnerCopy(storeId);

  // --- Group tasks by product ---
  const productMap = new Map<string, {
    name: string;
    tasks: ClickUpTask[];
  }>();

  for (const task of tasks) {
    const productName = extractFieldValue(task.custom_fields, 'product', 'sku', 'item') || task.list.name;
    const productId = `product_${productName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    if (!productMap.has(productId)) {
      productMap.set(productId, { name: productName, tasks: [] });
    }
    productMap.get(productId)!.tasks.push(task);
  }

  // --- Build ProductProfile and ClickUpCreativeSet arrays ---
  const products: ProductProfile[] = [];
  const clickupCreatives: ClickUpCreativeSet[] = [];

  for (const [productId, { name, tasks: productTasks }] of productMap.entries()) {
    const creatives: ClickUpCreativeSet[] = productTasks.map((task) => ({
      id: task.id,
      taskId: task.id,
      productId,
      productName: name,
      name: task.name,
      hook: extractFieldValue(task.custom_fields, 'hook', 'headline') || task.name,
      angle: extractFieldValue(task.custom_fields, 'angle', 'concept', 'theme') || '',
      format: detectFormat(task.custom_fields, task.name, task.tags),
      thumbnailUrl: extractFieldValue(task.custom_fields, 'thumbnail', 'preview', 'cover'),
      driveLink: extractFieldValue(task.custom_fields, 'drive', 'video', 'asset', 'link', 'url', 'file') || task.url,
      notes: task.description || '',
      dateAdded: new Date(parseInt(task.date_created)).toISOString().split('T')[0],
    }));

    clickupCreatives.push(...creatives);

    const product: ProductProfile = {
      id: productId,
      name,
      image: '',
      shopifyUrl: '',
      adAccountId: primaryAdAccount?.ad_account_id || '',
      adAccountName: primaryAdAccount?.ad_account_name || '',
      pageId: '',
      pageName: '',
      instagramId: '',
      pixelId: '',
      conversionEvent: 'Purchase',
      landingUrl: '',
      defaultBudget: 50,
      defaultDuration: 7,
      winnerCopyLibrary,
      clickupListId: meta.listId,
      readyCreativesCount: creatives.length,
      confidence: hasMetaConnection ? 90 : 60,
      store: storeId,
    };

    products.push(product);
  }

  return NextResponse.json({
    products,
    clickupCreatives,
    hasMetaConnection,
    adAccounts: adAccounts.map((a) => ({
      id: a.ad_account_id,
      name: a.ad_account_name,
    })),
  });
}
