import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken, getStoreAdAccounts, getLatestMetaEndpointSnapshot, getStore } from '@/app/api/lib/db';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import type { ProductProfile, ClickUpCreativeSet, WinnerCopy } from '@/types/creativeLaunch';

interface ClickUpCustomFieldOption {
  id: string;
  name: string;
  orderindex: number;
  color?: string;
}

interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  type_config?: {
    options?: ClickUpCustomFieldOption[];
    [key: string]: unknown;
  };
}

interface ClickUpAttachment {
  id: string;
  url: string;
  title: string;
  thumbnail_small?: string;
  thumbnail_medium?: string;
  thumbnail_large?: string;
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
  attachments?: ClickUpAttachment[];
}

function extractFieldValue(fields: ClickUpCustomField[], ...nameParts: string[]): string {
  for (const field of fields) {
    const nameLower = field.name.toLowerCase();
    if (!nameParts.some((p) => nameLower.includes(p.toLowerCase()))) continue;
    if (field.value == null) continue;

    const options = field.type_config?.options || [];

    if (field.type === 'drop_down') {
      if (typeof field.value === 'number') {
        const opt = options.find((o) => o.orderindex === field.value);
        if (opt) return opt.name;
      } else if (typeof field.value === 'string') {
        const opt = options.find((o) => o.id === field.value);
        if (opt) return opt.name;
      }
      continue;
    }

    if (field.type === 'labels') {
      if (Array.isArray(field.value)) {
        const names = (field.value as string[])
          .map((id) => options.find((o) => o.id === id)?.name || '')
          .filter(Boolean);
        if (names.length) return names.join(', ');
      }
      continue;
    }

    if (field.type === 'number') continue;

    if (typeof field.value === 'string' && field.value.trim()) return field.value;

    if (typeof field.value === 'object' && !Array.isArray(field.value)) {
      const v = field.value as Record<string, unknown>;
      if (v.url && typeof v.url === 'string') return v.url;
      if (v.value && typeof v.value === 'string') return v.value;
      if (v.name && typeof v.name === 'string') return v.name;
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
    listIds?: string[];
    readyStatus?: string;
    workspaceId?: string;
    workspaceName?: string;
  } : {};

  // Support both old single listId and new listIds[]
  const listIds: string[] = meta.listIds?.length ? meta.listIds : (meta.listId ? [meta.listId] : []);

  if (listIds.length === 0) {
    return NextResponse.json({
      notConfigured: true,
      products: [],
      clickupCreatives: [],
      message: 'ClickUp list not configured. Go to Settings → Integrations to set it up.',
    });
  }

  // --- Fetch ClickUp tasks from all configured lists in parallel ---
  const status = meta.readyStatus || 'ready to launch';
  const params = new URLSearchParams({ include_closed: 'false', subtasks: 'true', page: '0' });
  params.append('statuses[]', status);

  const allTaskArrays = await Promise.all(
    listIds.map(async (listId) => {
      const res = await fetch(
        `https://api.clickup.com/api/v2/list/${listId}/task?${params.toString()}`,
        { headers: { Authorization: token } }
      );
      if (!res.ok) return [];
      const data = await res.json() as { tasks: ClickUpTask[] };
      return data.tasks || [];
    })
  );

  // Deduplicate by task id
  const seenIds = new Set<string>();
  let tasks: ClickUpTask[] = [];
  for (const arr of allTaskArrays) {
    for (const t of arr) {
      if (!seenIds.has(t.id)) { seenIds.add(t.id); tasks.push(t); }
    }
  }

  // --- Get store info + Meta ad account info ---
  // Note: Meta assets (pages, pixels, campaigns) are fetched separately by meta-assets API
  // to avoid duplicate API calls and improve loading speed
  const storeRecord = getStore(storeId);
  const storeName = storeRecord?.name || storeId;
  const adAccounts = getStoreAdAccounts(storeId);
  const hasMetaConnection = adAccounts.length > 0;

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
    const creatives: ClickUpCreativeSet[] = productTasks.map((task) => {
      // Try to get thumbnail from custom fields first
      let thumbnailUrl = extractFieldValue(task.custom_fields, 'thumbnail', 'preview', 'cover', 'image');
      
      // Get drive link
      const driveLink = extractFieldValue(task.custom_fields, 'drive', 'video', 'asset', 'link', 'url', 'file') || task.url;
      
      // If no thumbnail from custom fields, try to extract from drive link
      if (!thumbnailUrl && driveLink) {
        // Check if drive link is a direct image URL
        if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(driveLink)) {
          thumbnailUrl = driveLink;
        }
        // Check if it's a Google Drive link and convert to thumbnail URL
        else if (driveLink.includes('drive.google.com')) {
          const fileIdMatch = driveLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (fileIdMatch) {
            thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w400`;
          }
        }
        // Check if it's a Dropbox link
        else if (driveLink.includes('dropbox.com')) {
          thumbnailUrl = driveLink.replace('dl=0', 'raw=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
        }
      }
      
      // If still no thumbnail, try to get from attachments (if available)
      if (!thumbnailUrl && task.attachments && task.attachments.length > 0) {
        const firstAttachment = task.attachments[0];
        thumbnailUrl = firstAttachment.thumbnail_large || 
                       firstAttachment.thumbnail_medium || 
                       firstAttachment.thumbnail_small ||
                       firstAttachment.url;
      }
      
      return {
        id: task.id,
        taskId: task.id,
        productId,
        productName: name,
        name: task.name,
        hook: extractFieldValue(task.custom_fields, 'hook', 'headline') || task.name,
        angle: extractFieldValue(task.custom_fields, 'angle', 'concept', 'theme') || '',
        format: detectFormat(task.custom_fields, task.name, task.tags),
        thumbnailUrl,
        driveLink,
        notes: task.description || '',
        dateAdded: new Date(parseInt(task.date_created)).toISOString().split('T')[0],
      };
    });

    clickupCreatives.push(...creatives);

    // Build landing URL from store domain
    const storeDomain = storeRecord?.domain || '';
    const landingUrl = storeDomain ? `https://${storeDomain.replace(/^https?:\/\//, '')}` : '';

    const product: ProductProfile = {
      id: productId,
      name,
      image: '',
      shopifyUrl: landingUrl,
      adAccountId: primaryAdAccount?.ad_account_id || '',
      adAccountName: primaryAdAccount?.ad_account_name || '',
      pageId: '',
      pageName: '',
      instagramId: '',
      pixelId: '',
      conversionEvent: 'Purchase',
      landingUrl: landingUrl,
      defaultCampaignId: undefined,
      defaultCampaignName: undefined,
      defaultBudget: 50,
      defaultDuration: 7,
      winnerCopyLibrary,
      clickupListId: listIds[0],
      readyCreativesCount: creatives.length,
      confidence: hasMetaConnection ? 90 : 60,
      store: storeName,
    };

    products.push(product);
  }

  // Get store domain for destination URL
  const storeDomain = storeRecord?.domain || '';
  const destinationUrl = storeDomain ? `https://${storeDomain.replace(/^https?:\/\//, '')}` : '';

  return NextResponse.json({
    products,
    clickupCreatives,
    hasMetaConnection,
    storeDomain,
    destinationUrl,
    adAccounts: adAccounts.map((a) => ({
      id: a.ad_account_id,
      name: a.ad_account_name,
    })),
  });
}
