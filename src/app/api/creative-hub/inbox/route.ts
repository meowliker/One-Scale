import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/api/lib/db';
import { getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import { getProductProfiles } from '@/app/api/lib/creative-hub-db';
import {
  isSupabasePersistenceEnabled,
  getPersistentThirdPartyToken,
  hydrateStoreFromSupabase,
} from '@/app/api/lib/supabase-persistence';
import type { InboxCreative, CreativeFormat } from '@/types/creativeHub';

/** Resolve ClickUp token, hydrating from Supabase on Vercel if needed */
async function getClickUpToken(storeId: string) {
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
    const row = getThirdPartyToken(storeId, 'clickup');
    if (row) return row;
    const persistent = await getPersistentThirdPartyToken(storeId, 'clickup');
    if (persistent) {
      upsertThirdPartyToken({
        storeId,
        platform: 'clickup',
        accessToken: persistent.access_token,
        metadata: persistent.metadata
          ? (JSON.parse(persistent.metadata) as Record<string, unknown>)
          : undefined,
      });
      return getThirdPartyToken(storeId, 'clickup');
    }
    return null;
  }
  return getThirdPartyToken(storeId, 'clickup');
}

// ── ClickUp types (mirrored from integrations/clickup/tasks) ──

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
  assignees?: Array<{ username?: string; profilePicture?: string }>;
}

// ── Helpers ──

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

function detectFormat(fields: ClickUpCustomField[], name: string, tags: Array<{ name: string }>): CreativeFormat {
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
    const data = (await res.json()) as { tasks: ClickUpTask[] };
    return data.tasks || [];
  } catch {
    return [];
  }
}

function getAlreadyTestedTaskIds(storeId: string): Map<string, { testDate: string; roas: number; status: string }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT cti.clickup_task_id, cti.roas, cti.test_status, ct.created_at
       FROM creative_test_items cti
       JOIN creative_tests ct ON ct.id = cti.creative_test_id
       WHERE ct.store_id = ? AND cti.clickup_task_id IS NOT NULL`
    )
    .all(storeId) as Array<{
    clickup_task_id: string;
    roas: number;
    test_status: string;
    created_at: string;
  }>;

  const map = new Map<string, { testDate: string; roas: number; status: string }>();
  for (const row of rows) {
    map.set(row.clickup_task_id, {
      testDate: row.created_at,
      roas: row.roas,
      status: row.test_status,
    });
  }
  return map;
}

function mapTaskToInboxCreative(
  task: ClickUpTask,
  profileId: string | undefined,
  profileName: string | undefined,
  testedMap: Map<string, { testDate: string; roas: number; status: string }>
): InboxCreative {
  const hook = extractFieldValue(task.custom_fields, 'hook', 'headline');
  const angle = extractFieldValue(task.custom_fields, 'angle', 'concept', 'theme', 'strategy');
  const driveLink = extractFieldValue(task.custom_fields, 'drive', 'asset', 'link', 'file', 'url');
  const thumbnailUrl = extractFieldValue(task.custom_fields, 'thumbnail', 'preview', 'cover');
  const creator = task.assignees?.[0]?.username || '';
  const format = detectFormat(task.custom_fields, task.name, task.tags);

  const tested = testedMap.get(task.id);

  return {
    id: `inbox_${task.id}`,
    clickupTaskId: task.id,
    clickupTaskName: task.name,
    productProfileId: profileId,
    productName: profileName,
    creativeName: task.name,
    creativeFormat: format,
    hook: hook || undefined,
    angle: angle || undefined,
    creator: creator || undefined,
    driveUrl: driveLink || undefined,
    thumbnailUrl: thumbnailUrl || undefined,
    uploadStatus: 'pending',
    uploadProgress: 0,
    alreadyTested: !!tested,
    pastTestResult: tested
      ? {
          testDate: tested.testDate,
          roas: tested.roas,
          status: tested.status as 'winner' | 'killed' | 'inconclusive',
        }
      : undefined,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * GET /api/creative-hub/inbox?storeId=X&productId=Y
 *
 * Fetches creatives from ClickUp (filtered for "Ready to Launch" status),
 * maps them to InboxCreative format, and flags duplicates already in creative_test_items.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const productId = searchParams.get('productId') || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // Get ClickUp token (with Supabase hydration for Vercel)
  const row = await getClickUpToken(storeId);
  if (!row) {
    return NextResponse.json({ creatives: [], notConnected: true });
  }

  const token = row.access_token;
  const meta = row.metadata
    ? (JSON.parse(row.metadata) as { readyStatus?: string })
    : {};
  const readyStatus = meta.readyStatus || 'ready to launch';

  // Get product profiles to resolve clickup_list_id -> product mapping
  const profiles = getProductProfiles(storeId);
  const targetProfiles = productId
    ? profiles.filter((p) => p.id === productId)
    : profiles;

  // Collect all list IDs from profiles that have a ClickUp list configured
  const listProfileMap = new Map<string, { id: string; name: string }>();
  for (const profile of targetProfiles) {
    if (profile.clickupListId) {
      listProfileMap.set(profile.clickupListId, {
        id: profile.id,
        name: profile.productName,
      });
    }
  }

  if (listProfileMap.size === 0) {
    return NextResponse.json({ creatives: [], notConfigured: true });
  }

  // Get already-tested task IDs for dedup flagging
  const testedMap = getAlreadyTestedTaskIds(storeId);

  // Fetch tasks from each ClickUp list in parallel
  const allCreatives: InboxCreative[] = [];
  const seenIds = new Set<string>();

  const listEntries = Array.from(listProfileMap.entries());
  const taskArrays = await Promise.all(
    listEntries.map(([listId]) => fetchTasksFromList(token, listId, readyStatus))
  );

  for (let i = 0; i < listEntries.length; i++) {
    const [, profile] = listEntries[i];
    const tasks = taskArrays[i];
    for (const task of tasks) {
      if (seenIds.has(task.id)) continue;
      seenIds.add(task.id);
      allCreatives.push(
        mapTaskToInboxCreative(task, profile.id, profile.name, testedMap)
      );
    }
  }

  return NextResponse.json({ creatives: allCreatives });
}
