import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken } from '@/app/api/lib/db';

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

interface ClickUpTask {
  id: string;
  name: string;
  description?: string;
  status: { status: string; color: string };
  custom_fields: ClickUpCustomField[];
  tags: Array<{ name: string; tag_fg: string; tag_bg: string }>;
  list: { id: string; name: string };
  url: string;
  date_created: string;
  date_updated: string;
}

/**
 * Extract a text value from ClickUp custom fields by matching field name keywords.
 * Handles: text, url, drop_down (resolves option name), labels (joins names), skips bare numbers.
 */
function extractFieldValue(fields: ClickUpCustomField[], ...nameParts: string[]): string {
  for (const field of fields) {
    const nameLower = field.name.toLowerCase();
    if (!nameParts.some((p) => nameLower.includes(p.toLowerCase()))) continue;
    if (field.value == null) continue;

    const options = field.type_config?.options || [];

    // drop_down: value = orderindex (number) → resolve option name
    if (field.type === 'drop_down') {
      if (typeof field.value === 'number') {
        const opt = options.find((o) => o.orderindex === field.value);
        if (opt) return opt.name;
      } else if (typeof field.value === 'string') {
        const opt = options.find((o) => o.id === field.value);
        if (opt) return opt.name;
      }
      continue; // can't resolve dropdown → skip
    }

    // labels: value = array of option ids
    if (field.type === 'labels') {
      if (Array.isArray(field.value)) {
        const names = (field.value as string[])
          .map((id) => options.find((o) => o.id === id)?.name || '')
          .filter(Boolean);
        if (names.length) return names.join(', ');
      }
      continue;
    }

    // number type: skip bare numbers for text extraction
    if (field.type === 'number') continue;

    // string types
    if (typeof field.value === 'string' && field.value.trim()) return field.value;

    // url field object
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
    if (t.includes('video') || t.includes('ugc') || t.includes('reel')) return 'video';
    if (t.includes('carousel')) return 'carousel';
    if (t.includes('image') || t.includes('static')) return 'image';
  }
  const n = name.toLowerCase();
  if (n.includes('video') || n.includes('ugc') || n.includes('reel')) return 'video';
  if (n.includes('carousel')) return 'carousel';
  return 'image';
}

async function fetchTasksFromList(token: string, listId: string, status: string): Promise<ClickUpTask[]> {
  const params = new URLSearchParams({ include_closed: 'false', subtasks: 'true', page: '0' });
  params.append('statuses[]', status);
  try {
    const res = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task?${params.toString()}`,
      { headers: { Authorization: token } }
    );
    if (!res.ok) return [];
    const data = await res.json() as { tasks: ClickUpTask[] };
    return data.tasks || [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const statusFilter = searchParams.get('status') || '';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const row = getThirdPartyToken(storeId, 'clickup');
  if (!row) return NextResponse.json({ error: 'ClickUp not connected', notConnected: true }, { status: 200 });

  const token = row.access_token;
  const meta = row.metadata ? JSON.parse(row.metadata) as {
    listId?: string; listIds?: string[]; readyStatus?: string;
  } : {};

  const listIds: string[] = meta.listIds?.length ? meta.listIds : (meta.listId ? [meta.listId] : []);
  if (listIds.length === 0) {
    return NextResponse.json({ error: 'No ClickUp list configured.', notConfigured: true }, { status: 200 });
  }

  const status = statusFilter || meta.readyStatus || 'ready to launch';
  const allTaskArrays = await Promise.all(listIds.map((id) => fetchTasksFromList(token, id, status)));
  const seenIds = new Set<string>();
  const tasks: ClickUpTask[] = [];
  for (const arr of allTaskArrays) {
    for (const t of arr) {
      if (!seenIds.has(t.id)) { seenIds.add(t.id); tasks.push(t); }
    }
  }

  const creatives = tasks.map((task) => {
    const hook = extractFieldValue(task.custom_fields, 'hook', 'headline');
    const angle = extractFieldValue(task.custom_fields, 'angle', 'concept', 'theme', 'strategy');
    const driveLink = extractFieldValue(task.custom_fields, 'drive', 'asset', 'link', 'file', 'url');
    const productName = extractFieldValue(task.custom_fields, 'product', 'item');
    const thumbnailUrl = extractFieldValue(task.custom_fields, 'thumbnail', 'preview', 'cover');
    const format = detectFormat(task.custom_fields, task.name, task.tags);
    // Use list name as product grouping if no product field resolved
    const product = productName || task.list.name;
    const productId = `product_${product.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    return {
      id: task.id,
      taskId: task.id,
      productId,
      productName: product,
      name: task.name,
      hook: hook || task.name,
      angle: angle || '',
      format,
      thumbnailUrl: thumbnailUrl || '',
      driveLink: driveLink || task.url,
      notes: task.description || '',
      dateAdded: new Date(parseInt(task.date_created)).toISOString().split('T')[0],
      listName: task.list.name,
    };
  });

  return NextResponse.json({ tasks: creatives });
}
