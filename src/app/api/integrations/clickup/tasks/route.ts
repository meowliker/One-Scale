import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken } from '@/app/api/lib/db';

interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  type_config?: Record<string, unknown>;
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

function extractFieldValue(fields: ClickUpCustomField[], ...nameParts: string[]): string {
  for (const field of fields) {
    const nameLower = field.name.toLowerCase();
    if (nameParts.some((p) => nameLower.includes(p.toLowerCase()))) {
      if (field.value == null) continue;
      if (typeof field.value === 'string') return field.value;
      if (typeof field.value === 'object') {
        // URL field type
        const v = field.value as Record<string, unknown>;
        if (v.url) return String(v.url);
        if (v.value) return String(v.value);
        // Option field type
        if (v.name) return String(v.name);
      }
      return String(field.value);
    }
  }
  return '';
}

function detectFormat(fields: ClickUpCustomField[], name: string, tags: Array<{ name: string }>): 'video' | 'image' | 'carousel' {
  const formatVal = extractFieldValue(fields, 'format', 'type', 'creative type').toLowerCase();
  if (formatVal.includes('video')) return 'video';
  if (formatVal.includes('carousel')) return 'carousel';
  if (formatVal.includes('image') || formatVal.includes('photo') || formatVal.includes('static')) return 'image';

  // Check tags
  for (const tag of tags) {
    const t = tag.name.toLowerCase();
    if (t.includes('video')) return 'video';
    if (t.includes('carousel')) return 'carousel';
    if (t.includes('image') || t.includes('static')) return 'image';
  }

  // Check task name
  const nameLower = name.toLowerCase();
  if (nameLower.includes('video') || nameLower.includes('ugc') || nameLower.includes('reel')) return 'video';
  if (nameLower.includes('carousel')) return 'carousel';
  return 'image';
}

// GET — fetch ClickUp tasks by status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const statusFilter = searchParams.get('status') || '';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const row = getThirdPartyToken(storeId, 'clickup');
  if (!row) return NextResponse.json({ error: 'ClickUp not connected', notConnected: true }, { status: 200 });

  const token = row.access_token;
  const meta = row.metadata ? JSON.parse(row.metadata) as {
    listId?: string;
    readyStatus?: string;
    workspaceId?: string;
  } : {};

  const listId = meta.listId;
  if (!listId) {
    return NextResponse.json({ error: 'No ClickUp list configured. Please configure in Settings → Integrations.', notConfigured: true }, { status: 200 });
  }

  const status = statusFilter || meta.readyStatus || 'ready to launch';

  // Fetch tasks from the configured list with the given status
  const params = new URLSearchParams({
    include_closed: 'false',
    subtasks: 'true',
    page: '0',
  });
  params.append('statuses[]', status);

  const res = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task?${params.toString()}`,
    { headers: { Authorization: token } }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `ClickUp API error: ${text}` }, { status: res.status });
  }

  const data = await res.json() as { tasks: ClickUpTask[] };
  const tasks = data.tasks || [];

  // Transform tasks into ClickUpCreativeSet format
  const creatives = tasks.map((task) => {
    const hook = extractFieldValue(task.custom_fields, 'hook', 'headline', 'angle');
    const angle = extractFieldValue(task.custom_fields, 'angle', 'concept', 'theme', 'strategy');
    const driveLink = extractFieldValue(task.custom_fields, 'drive', 'video', 'asset', 'link', 'url', 'file');
    const productName = extractFieldValue(task.custom_fields, 'product', 'sku', 'item');
    const thumbnailUrl = extractFieldValue(task.custom_fields, 'thumbnail', 'preview', 'cover');
    const format = detectFormat(task.custom_fields, task.name, task.tags);

    // Use list name as product if no product field
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
