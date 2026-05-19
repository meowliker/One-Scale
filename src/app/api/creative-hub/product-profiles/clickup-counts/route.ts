import { NextRequest, NextResponse } from 'next/server';
import { getProductProfiles } from '@/app/api/lib/creative-hub-db';
import { getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import {
  getPersistentThirdPartyToken,
  hydrateStoreFromSupabase,
  isSupabasePersistenceEnabled,
} from '@/app/api/lib/supabase-persistence';
import type { ClickUpProfileStatusCounts } from '@/types/creativeHub';

interface ClickUpTask {
  id: string;
  status?: { status?: string };
}

interface ClickUpMetadata {
  readyStatus?: string;
}

const EMPTY_COUNTS: ClickUpProfileStatusCounts = {
  ready: 0,
  testing: 0,
  launched: 0,
  winners: 0,
  total: 0,
  statusBreakdown: {},
};

async function getClickUpToken(storeId: string) {
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
    const hydrated = getThirdPartyToken(storeId, 'clickup');
    if (hydrated) return hydrated;

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
  }

  return getThirdPartyToken(storeId, 'clickup');
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function isReadyStatus(status: string, readyStatus: string): boolean {
  const normalized = normalizeStatus(status);
  const configured = normalizeStatus(readyStatus);
  return normalized === configured || (normalized.includes('ready') && normalized.includes('launch'));
}

function bucketForStatus(status: string, readyStatus: string): keyof ClickUpProfileStatusCounts | null {
  const normalized = normalizeStatus(status);
  if (!normalized) return null;

  if (normalized.includes('winner') || normalized.includes('winning') || normalized === 'won') {
    return 'winners';
  }

  if (
    normalized.includes('launched') ||
    normalized.includes('live') ||
    normalized.includes('published') ||
    normalized.includes('completed') ||
    normalized === 'done'
  ) {
    return 'launched';
  }

  if (
    normalized.includes('testing') ||
    normalized === 'test' ||
    normalized.includes('in test') ||
    normalized.includes('active test')
  ) {
    return 'testing';
  }

  if (isReadyStatus(status, readyStatus)) {
    return 'ready';
  }

  return null;
}

async function fetchAllTasksFromList(token: string, listId: string): Promise<ClickUpTask[]> {
  const tasks: ClickUpTask[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < 50; page += 1) {
    const params = new URLSearchParams({
      include_closed: 'true',
      subtasks: 'true',
      page: String(page),
    });

    const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task?${params.toString()}`, {
      headers: { Authorization: token },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new Error(`ClickUp token invalid or expired (${res.status}): ${body.slice(0, 240)}`);
      }
      throw new Error(`ClickUp list ${listId} task fetch failed (${res.status}): ${body.slice(0, 240)}`);
    }

    const data = (await res.json()) as { tasks?: ClickUpTask[] };
    const pageTasks = data.tasks || [];
    if (pageTasks.length === 0) break;

    for (const task of pageTasks) {
      if (!task.id || seen.has(task.id)) continue;
      seen.add(task.id);
      tasks.push(task);
    }

    if (pageTasks.length < 100) break;
  }

  return tasks;
}

function countTasks(tasks: ClickUpTask[], readyStatus: string): ClickUpProfileStatusCounts {
  const counts: ClickUpProfileStatusCounts = { ...EMPTY_COUNTS, statusBreakdown: {} };

  for (const task of tasks) {
    const status = task.status?.status || '';
    const normalized = normalizeStatus(status);
    if (normalized) {
      counts.statusBreakdown![status] = (counts.statusBreakdown![status] ?? 0) + 1;
    }

    const bucket = bucketForStatus(status, readyStatus);
    if (bucket && bucket !== 'total' && bucket !== 'statusBreakdown') {
      counts[bucket] += 1;
    }
    counts.total += 1;
  }

  return counts;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    const profiles = await getProductProfiles(storeId);
    const profilesByList = new Map<string, string[]>();

    for (const profile of profiles) {
      if (!profile.clickupListId) continue;
      const existing = profilesByList.get(profile.clickupListId) || [];
      existing.push(profile.id);
      profilesByList.set(profile.clickupListId, existing);
    }

    if (profilesByList.size === 0) {
      return NextResponse.json({ counts: {}, notConfigured: true });
    }

    const clickup = await getClickUpToken(storeId);
    if (!clickup) {
      return NextResponse.json({ counts: {}, notConnected: true });
    }

    const metadata: ClickUpMetadata = clickup.metadata ? JSON.parse(clickup.metadata) : {};
    const readyStatus = metadata.readyStatus || 'ready to launch';

    const counts: Record<string, ClickUpProfileStatusCounts> = {};
    await Promise.all(
      [...profilesByList.entries()].map(async ([listId, profileIds]) => {
        const listCounts = countTasks(await fetchAllTasksFromList(clickup.access_token, listId), readyStatus);
        for (const profileId of profileIds) {
          counts[profileId] = listCounts;
        }
      }),
    );

    return NextResponse.json({ counts, readyStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch ClickUp status counts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
