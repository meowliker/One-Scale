import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/app/api/lib/db';
import { getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import {
  getCachedInboxCreativeMeta,
  getCachedInboxCreatives,
  getProductProfiles,
  hasCachedInboxCreatives,
  replaceCachedInboxCreatives,
} from '@/app/api/lib/creative-hub-db';
import { getGoogleDriveToken } from '@/app/api/lib/tokens';
import {
  isSupabasePersistenceEnabled,
  getPersistentThirdPartyToken,
  hydrateStoreFromSupabase,
} from '@/app/api/lib/supabase-persistence';
import type {
  ClickUpFieldValue,
  InboxCreative,
  CreativeFormat,
  CreativeHubInboxCacheMeta,
} from '@/types/creativeHub';

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

interface ClickUpAttachment {
  id?: string;
  title?: string;
  name?: string;
  filename?: string;
  url?: string;
  thumbnail_small?: string;
  thumbnail_medium?: string;
  thumbnail_large?: string;
  thumbnail_url?: string;
  mimetype?: string;
  mime_type?: string;
  extension?: string;
  size?: number | string;
  date?: string;
  date_created?: string;
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
  date_closed?: string | null;
  date_done?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  archived?: boolean;
  parent?: string | null;
  time_estimate?: number | null;
  points?: number | null;
  creator?: {
    id?: number | string;
    username?: string;
    email?: string;
    initials?: string;
    color?: string;
    profilePicture?: string;
  };
  priority?: {
    priority?: string;
    color?: string;
    orderindex?: string;
  } | null;
  folder?: { id?: string; name?: string };
  space?: { id?: string; name?: string };
  assignees?: Array<{
    id?: number | string;
    username?: string;
    email?: string;
    initials?: string;
    color?: string;
    profilePicture?: string;
  }>;
  watchers?: Array<{
    id?: number | string;
    username?: string;
    email?: string;
    initials?: string;
    color?: string;
    profilePicture?: string;
  }>;
  text_content?: string;
  attachments?: ClickUpAttachment[];
}

interface GoogleDriveAsset {
  id: string;
  name: string;
  mimeType: string;
  folderPath?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
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

function normalizeFieldValue(field: ClickUpCustomField): string {
  if (field.value == null) return '';

  const options = field.type_config?.options || [];

  if (field.type === 'drop_down') {
    if (typeof field.value === 'number') {
      return options.find((o) => o.orderindex === field.value)?.name || '';
    }
    if (typeof field.value === 'string') {
      return options.find((o) => o.id === field.value)?.name || field.value;
    }
  }

  if (field.type === 'labels' && Array.isArray(field.value)) {
    return (field.value as string[])
      .map((id) => options.find((o) => o.id === id)?.name || '')
      .filter(Boolean)
      .join(', ');
  }

  if (field.type === 'users' && Array.isArray(field.value)) {
    return (field.value as Array<Record<string, unknown> | string | number>)
      .map((user) => {
        if (typeof user === 'string' || typeof user === 'number') return String(user);
        if (user && typeof user === 'object') {
          if (typeof user.username === 'string' && user.username.trim()) return user.username.trim();
          if (typeof user.email === 'string' && user.email.trim()) return user.email.trim();
          if (typeof user.id === 'string' || typeof user.id === 'number') return String(user.id);
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  if (typeof field.value === 'string') return field.value.trim();
  if (typeof field.value === 'number' || typeof field.value === 'boolean') return String(field.value);

  if (Array.isArray(field.value)) {
    return field.value
      .map((entry) => {
        if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
          return String(entry);
        }
        if (entry && typeof entry === 'object') {
          const candidate = entry as Record<string, unknown>;
          if (typeof candidate.name === 'string') return candidate.name;
          if (typeof candidate.username === 'string') return candidate.username;
          if (typeof candidate.email === 'string') return candidate.email;
          if (typeof candidate.id === 'string' || typeof candidate.id === 'number') {
            return String(candidate.id);
          }
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  if (typeof field.value === 'object' && !Array.isArray(field.value)) {
    const value = field.value as Record<string, unknown>;
    if (typeof value.url === 'string') return value.url;
    if (typeof value.value === 'string') return value.value;
    if (typeof value.name === 'string') return value.name;
    if (typeof value.username === 'string') return value.username;
    if (typeof value.email === 'string') return value.email;
    return JSON.stringify(value);
  }

  return '';
}

function normalizeCustomFields(fields: ClickUpCustomField[]): ClickUpFieldValue[] {
  return fields
    .map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      value: normalizeFieldValue(field),
      hasValue: field.value != null && normalizeFieldValue(field).trim().length > 0,
      color: field.type_config?.options?.find((option) => {
        if (typeof field.value === 'string') return option.id === field.value;
        if (typeof field.value === 'number') return option.orderindex === field.value;
        return false;
      })?.color,
    }))
    .filter((field) => field.name.trim().length > 0);
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

function isGoogleDriveFolderUrl(url: string): boolean {
  return url.includes('/folders/') || url.includes('/drive/folders/');
}

function extractGoogleDriveFolderId(url: string): string | null {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractGoogleDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function mapDriveFormat(asset: GoogleDriveAsset, fallbackName: string): CreativeFormat | null {
  const mime = asset.mimeType.toLowerCase();
  const name = asset.name.toLowerCase();

  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('presentation') || name.includes('carousel')) return 'carousel';
  if (fallbackName.toLowerCase().includes('carousel')) return 'carousel';

  return null;
}

function getAttachmentName(attachment: ClickUpAttachment, fallbackName: string): string {
  return (
    attachment.title ||
    attachment.name ||
    attachment.filename ||
    (attachment.url ? decodeURIComponent(attachment.url.split('/').pop() || '') : '') ||
    fallbackName
  ).trim();
}

function getAttachmentMimeType(attachment: ClickUpAttachment): string {
  return (attachment.mimetype || attachment.mime_type || '').toLowerCase();
}

function getAttachmentThumbnail(attachment: ClickUpAttachment): string | undefined {
  return (
    attachment.thumbnail_large ||
    attachment.thumbnail_medium ||
    attachment.thumbnail_small ||
    attachment.thumbnail_url ||
    undefined
  );
}

function getAttachmentSize(attachment: ClickUpAttachment): number | undefined {
  if (typeof attachment.size === 'number') return attachment.size;
  if (typeof attachment.size === 'string') {
    const parsed = Number(attachment.size);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function mapAttachmentFormat(attachment: ClickUpAttachment, fallbackName: string): CreativeFormat | null {
  const mime = getAttachmentMimeType(attachment);
  const name = getAttachmentName(attachment, fallbackName).toLowerCase();
  const extension = (attachment.extension || '').toLowerCase();

  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(extension)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension)) return 'image';
  if (/\.(mp4|mov|avi|mkv|webm|m4v)(\?|$)/i.test(name)) return 'video';
  if (/\.(jpg|jpeg|png|gif|bmp|webp)(\?|$)/i.test(name)) return 'image';

  return null;
}

function getMediaAttachments(task: ClickUpTask): ClickUpAttachment[] {
  return (task.attachments || []).filter((attachment) => attachment.url && mapAttachmentFormat(attachment, task.name));
}

function buildDriveOpenUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function buildDriveProxyUrl(
  storeId: string,
  fileId: string,
  mode: 'content' | 'thumbnail',
  download = false,
): string {
  const params = new URLSearchParams({ storeId, fileId, mode });
  if (download) params.set('download', '1');
  return `/api/google-drive/content?${params.toString()}`;
}

function buildDriveThumbnail(asset: GoogleDriveAsset, storeId: string): string | undefined {
  if (asset.thumbnailLink) return buildDriveProxyUrl(storeId, asset.id, 'thumbnail');
  const format = mapDriveFormat(asset, asset.name);
  if (!format) return undefined;
  return buildDriveProxyUrl(storeId, asset.id, 'thumbnail');
}

async function listGoogleDriveFolderLevel(accessToken: string, folderId: string): Promise<GoogleDriveAsset[]> {
  const query = `'${folderId}' in parents and trashed=false`;
  const fields = 'files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink,size,createdTime,modifiedTime)';
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', fields);
  url.searchParams.set('orderBy', 'folder,name');
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  url.searchParams.set('corpora', 'allDrives');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as { files?: GoogleDriveAsset[] };
  return data.files || [];
}

async function fetchGoogleDriveFolderAssets(
  accessToken: string,
  folderId: string,
  rootFolderName: string,
): Promise<GoogleDriveAsset[]> {
  const results: GoogleDriveAsset[] = [];
  const queue: Array<{ id: string; path: string }> = [{ id: folderId, path: rootFolderName }];
  const seenFolders = new Set<string>([folderId]);
  const maxAssets = 250;

  while (queue.length > 0 && results.length < maxAssets) {
    const current = queue.shift();
    if (!current) break;

    const entries = await listGoogleDriveFolderLevel(accessToken, current.id);
    for (const entry of entries) {
      if (entry.mimeType === 'application/vnd.google-apps.folder') {
        if (!seenFolders.has(entry.id)) {
          seenFolders.add(entry.id);
          queue.push({
            id: entry.id,
            path: `${current.path} / ${entry.name}`,
          });
        }
        continue;
      }

      results.push({
        ...entry,
        folderPath: current.path,
      });
      if (results.length >= maxAssets) break;
    }
  }

  return results;
}

async function fetchGoogleDriveFileAsset(accessToken: string, fileId: string): Promise<GoogleDriveAsset | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,thumbnailLink,webViewLink,webContentLink,size,createdTime,modifiedTime&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  return (await res.json()) as GoogleDriveAsset;
}

async function fetchTaskDetails(token: string, taskId: string): Promise<ClickUpTask | null> {
  try {
    const url = new URL(`https://api.clickup.com/api/v2/task/${taskId}`);
    url.searchParams.set('include_subtasks', 'true');

    const res = await fetch(url.toString(), {
      headers: { Authorization: token },
    });
    if (!res.ok) return null;
    return (await res.json()) as ClickUpTask;
  } catch {
    return null;
  }
}

function normalizeClickUpStatusName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
}

function isReadyLikeClickUpTask(task: ClickUpTask, readyStatus: string): boolean {
  const taskStatus = normalizeClickUpStatusName(task.status?.status || '');
  const configuredStatus = normalizeClickUpStatusName(readyStatus);
  if (!taskStatus) return false;
  if (taskStatus === configuredStatus) return true;

  // Older stores sometimes have slightly different ready-column names.
  return taskStatus.includes('ready') && taskStatus.includes('launch');
}

async function hydrateClickUpTasks(token: string, tasks: ClickUpTask[]): Promise<ClickUpTask[]> {
  if (tasks.length === 0) return [];

  const hydratedTasks: ClickUpTask[] = [];
  const concurrency = 8;
  for (let start = 0; start < tasks.length; start += concurrency) {
    const chunk = tasks.slice(start, start + concurrency);
    const resolved = await Promise.all(
      chunk.map(async (task) => (await fetchTaskDetails(token, task.id)) || task),
    );
    hydratedTasks.push(...resolved);
  }

  return hydratedTasks;
}

async function fetchTasksFromList(
  token: string,
  listId: string,
  status: string,
  options: { fallbackToReadyLike?: boolean; includeStatusFilter?: boolean } = {},
): Promise<ClickUpTask[]> {
  const tasks: ClickUpTask[] = [];
  const pageSize = 100;
  const includeStatusFilter = options.includeStatusFilter !== false;

  try {
    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams({
        include_closed: 'false',
        subtasks: 'true',
        page: String(page),
      });
      if (includeStatusFilter) {
        params.append('statuses[]', status);
      }

      const res = await fetch(
        `https://api.clickup.com/api/v2/list/${listId}/task?${params.toString()}`,
        { headers: { Authorization: token } }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 401 || res.status === 403) {
          throw new Error(`ClickUp token invalid or expired (${res.status}): ${body.slice(0, 240)}`);
        }
        console.warn(
          `[creative-hub/inbox] ClickUp list ${listId} task fetch failed (${res.status}): ${body.slice(0, 240)}`,
        );
        break;
      }

      const data = (await res.json()) as { tasks?: ClickUpTask[] };
      const pageTasks = data.tasks || [];
      if (pageTasks.length === 0) break;

      tasks.push(...pageTasks);
      if (pageTasks.length < pageSize) break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('clickup token invalid')) {
      throw err;
    }
    console.warn(`[creative-hub/inbox] ClickUp list ${listId} task fetch error: ${message}`);
    return tasks;
  }

  if (tasks.length === 0 && options.fallbackToReadyLike !== false) {
    const unfilteredTasks = await fetchTasksFromList(token, listId, status, {
      fallbackToReadyLike: false,
      includeStatusFilter: false,
    });
    const readyLikeTasks = unfilteredTasks.filter((task) => isReadyLikeClickUpTask(task, status));
    if (readyLikeTasks.length > 0) {
      console.log(
        `[creative-hub/inbox] ClickUp exact status "${status}" returned 0 tasks for list ${listId}; ready-like fallback found ${readyLikeTasks.length}.`,
      );
      return readyLikeTasks;
    }
  }

  return hydrateClickUpTasks(token, tasks);
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
  testedMap: Map<string, { testDate: string; roas: number; status: string }>,
  overrides?: Partial<InboxCreative>,
  syncedAt = new Date().toISOString(),
): InboxCreative {
  const hook = extractFieldValue(task.custom_fields, 'hook', 'headline');
  const angle = extractFieldValue(task.custom_fields, 'angle', 'concept', 'theme', 'strategy');
  const driveLink = extractFieldValue(task.custom_fields, 'drive', 'asset', 'link', 'file', 'url');
  const thumbnailUrl = extractFieldValue(task.custom_fields, 'thumbnail', 'preview', 'cover');
  const creator = task.creator?.username || task.assignees?.[0]?.username || '';
  const format = detectFormat(task.custom_fields, task.name, task.tags);
  const customFields = normalizeCustomFields(task.custom_fields);

  const normalizePeople = (
    people:
      | Array<{
          id?: number | string;
          username?: string;
          email?: string;
          initials?: string;
          color?: string;
          profilePicture?: string;
        }>
      | undefined,
  ) =>
    (people || [])
      .map((person) => ({
        id: person.id != null ? String(person.id) : undefined,
        username: person.username || '',
        email: person.email || undefined,
        initials: person.initials || undefined,
        color: person.color || undefined,
        profilePicture: person.profilePicture || undefined,
      }))
      .filter((person) => person.username);

  const creatorDetails = task.creator
    ? {
        id: task.creator.id != null ? String(task.creator.id) : undefined,
        username: task.creator.username || '',
        email: task.creator.email || undefined,
        initials: task.creator.initials || undefined,
        color: task.creator.color || undefined,
        profilePicture: task.creator.profilePicture || undefined,
      }
    : undefined;

  const tested = testedMap.get(task.id);

  return {
    id: `inbox_${task.id}`,
    clickupTaskId: task.id,
    clickupTaskName: task.name,
    clickupTaskStatus: task.status.status,
    clickupTaskUrl: task.url,
    clickupCreatedAt: task.date_created,
    clickupUpdatedAt: task.date_updated,
    clickupListId: task.list.id,
    clickupListName: task.list.name,
    clickupDescription: task.description || task.text_content || undefined,
    clickupTags: task.tags.map((tag) => tag.name).filter(Boolean),
    clickupCustomFields: customFields,
    clickupAssignees: normalizePeople(task.assignees),
    clickupTaskContext: {
      status: {
        name: task.status.status,
        color: task.status.color,
      },
      creator: creatorDetails,
      assignees: normalizePeople(task.assignees),
      watchers: normalizePeople(task.watchers),
      dueDate: task.due_date || undefined,
      startDate: task.start_date || undefined,
      dateClosed: task.date_closed || undefined,
      dateDone: task.date_done || undefined,
      priority: task.priority
        ? {
            label: task.priority.priority || undefined,
            color: task.priority.color || undefined,
            orderindex: task.priority.orderindex || undefined,
          }
        : undefined,
      archived: Boolean(task.archived),
      parentTaskId: task.parent || undefined,
      points: typeof task.points === 'number' ? task.points : undefined,
      timeEstimate: typeof task.time_estimate === 'number' ? task.time_estimate : undefined,
      folder: task.folder
        ? {
            id: task.folder.id || undefined,
            name: task.folder.name || undefined,
          }
        : undefined,
      space: task.space
        ? {
            id: task.space.id || undefined,
            name: task.space.name || undefined,
          }
        : undefined,
      list: task.list
        ? {
            id: task.list.id,
            name: task.list.name,
          }
        : undefined,
    },
    productProfileId: profileId,
    productName: profileName,
    creativeName: task.name,
    creativeFormat: format,
    hook: hook || undefined,
    angle: angle || undefined,
    creator: creator || undefined,
    driveUrl: driveLink || undefined,
    thumbnailUrl: thumbnailUrl || undefined,
    sourceType: 'clickup_task',
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
    syncedAt,
    uploadedAt: task.date_created,
    ...overrides,
  };
}

async function expandTaskToInboxCreatives(
  storeId: string,
  task: ClickUpTask,
  profileId: string | undefined,
  profileName: string | undefined,
  testedMap: Map<string, { testDate: string; roas: number; status: string }>,
  driveAccessToken: string | null,
  syncedAt = new Date().toISOString(),
): Promise<InboxCreative[]> {
  const driveLink = extractFieldValue(task.custom_fields, 'drive', 'asset', 'link', 'file', 'url');
  const baseCreative = mapTaskToInboxCreative(task, profileId, profileName, testedMap, undefined, syncedAt);
  const mediaAttachments = getMediaAttachments(task);

  if (!driveLink && mediaAttachments.length > 0) {
    return mediaAttachments.map((attachment, index) => {
      const attachmentName = getAttachmentName(attachment, task.name);
      const attachmentFormat = mapAttachmentFormat(attachment, task.name) || baseCreative.creativeFormat;
      const attachmentId = attachment.id || `${task.id}_${index}`;
      const attachmentCreatedAt = attachment.date_created || attachment.date || task.date_created;

      return mapTaskToInboxCreative(task, profileId, profileName, testedMap, {
        id: `inbox_${task.id}_attachment_${attachmentId}`,
        creativeName: attachmentName,
        creativeFormat: attachmentFormat,
        clickupAttachmentId: attachment.id || attachmentId,
        clickupAttachmentUrl: attachment.url,
        clickupAttachmentName: attachmentName,
        clickupAttachmentMimeType: getAttachmentMimeType(attachment) || undefined,
        clickupAttachmentSize: getAttachmentSize(attachment),
        thumbnailUrl: getAttachmentThumbnail(attachment) || attachment.url || baseCreative.thumbnailUrl,
        sourceType: 'clickup_attachment',
        sourceParentId: baseCreative.id,
        uploadStatus: 'pending',
        uploadedAt: attachmentCreatedAt,
      }, syncedAt);
    });
  }

  if (!driveLink || !driveAccessToken) {
    return [baseCreative];
  }

  try {
    if (isGoogleDriveFolderUrl(driveLink)) {
      const folderId = extractGoogleDriveFolderId(driveLink);
      if (!folderId) return [baseCreative];

      const assets = await fetchGoogleDriveFolderAssets(driveAccessToken, folderId, task.name);
      const mediaAssets = assets.filter((asset) => mapDriveFormat(asset, task.name));

      if (mediaAssets.length === 0) {
        return [
          {
            ...baseCreative,
            driveFolderId: folderId,
            driveParentFolderUrl: driveLink,
            driveSourceType: 'folder',
          },
        ];
      }

      return mediaAssets.map((asset) => {
        const format = mapDriveFormat(asset, task.name) || baseCreative.creativeFormat;
        return mapTaskToInboxCreative(task, profileId, profileName, testedMap, {
          id: `inbox_${task.id}_${asset.id}`,
          creativeName: asset.name,
          creativeFormat: format,
          driveUrl: asset.webViewLink || buildDriveOpenUrl(asset.id),
          drivePreviewUrl: buildDriveProxyUrl(storeId, asset.id, 'content'),
          driveContentUrl: buildDriveProxyUrl(storeId, asset.id, 'content'),
          driveDownloadUrl: buildDriveProxyUrl(storeId, asset.id, 'content', true),
          driveFileId: asset.id,
          driveFolderId: folderId,
          driveCreatedAt: asset.createdTime,
          driveModifiedAt: asset.modifiedTime,
          driveMimeType: asset.mimeType,
          driveParentFolderName: asset.folderPath || task.name,
          driveParentFolderUrl: driveLink,
          driveSourceType: 'folder_item',
          thumbnailUrl: baseCreative.thumbnailUrl || buildDriveThumbnail(asset, storeId),
          sourceType: 'drive_asset',
          sourceParentId: baseCreative.id,
          uploadedAt: asset.createdTime || task.date_created,
        }, syncedAt);
      });
    }

    const fileId = extractGoogleDriveFileId(driveLink);
    if (!fileId) {
      return [
        {
          ...baseCreative,
          driveUrl: driveLink,
        },
      ];
    }

    const asset = await fetchGoogleDriveFileAsset(driveAccessToken, fileId);
    if (!asset) {
      return [
        {
          ...baseCreative,
          driveFileId: fileId,
          drivePreviewUrl: buildDriveProxyUrl(storeId, fileId, 'content'),
          driveContentUrl: buildDriveProxyUrl(storeId, fileId, 'content'),
          driveDownloadUrl: buildDriveProxyUrl(storeId, fileId, 'content', true),
          driveSourceType: 'file',
        },
      ];
    }

    const format = mapDriveFormat(asset, task.name) || baseCreative.creativeFormat;
    return [
      mapTaskToInboxCreative(task, profileId, profileName, testedMap, {
        creativeFormat: format,
        driveUrl: asset.webViewLink || buildDriveOpenUrl(fileId),
        drivePreviewUrl: buildDriveProxyUrl(storeId, fileId, 'content'),
        driveContentUrl: buildDriveProxyUrl(storeId, fileId, 'content'),
        driveDownloadUrl: buildDriveProxyUrl(storeId, fileId, 'content', true),
        driveFileId: fileId,
        driveCreatedAt: asset.createdTime,
        driveModifiedAt: asset.modifiedTime,
        driveMimeType: asset.mimeType,
        driveSourceType: 'file',
        thumbnailUrl: baseCreative.thumbnailUrl || buildDriveThumbnail(asset, storeId),
        sourceType: 'drive_asset',
        sourceParentId: baseCreative.id,
        uploadedAt: asset.createdTime || task.date_created,
      }, syncedAt),
    ];
  } catch {
    return [
      {
        ...baseCreative,
        driveUrl: driveLink,
        driveSourceType: isGoogleDriveFolderUrl(driveLink) ? 'folder' : 'file',
      },
    ];
  }
}

interface LiveInboxCreativesResult {
  creatives: InboxCreative[];
  snapshots: Array<{
    productProfileId: string;
    creatives: InboxCreative[];
    lastSyncedAt: string;
  }>;
}

async function buildLiveInboxCreatives(
  storeId: string,
  listProfileMap: Map<string, { id: string; name: string }>,
  token: string,
  readyStatus: string,
  testedMap: Map<string, { testDate: string; roas: number; status: string }>,
  driveAccessToken: string | null,
): Promise<LiveInboxCreativesResult> {
  const syncedAt = new Date().toISOString();
  const allCreatives: InboxCreative[] = [];
  const creativesByProfile = new Map<string, InboxCreative[]>();
  const seenIds = new Set<string>();

  const listEntries = Array.from(listProfileMap.entries());
  const taskArrays = await Promise.all(
    listEntries.map(([listId]) => fetchTasksFromList(token, listId, readyStatus))
  );

  for (let i = 0; i < listEntries.length; i++) {
    const [, profile] = listEntries[i];
    const tasks = taskArrays[i];
    const uniqueTasks = tasks.filter((task) => {
      if (seenIds.has(task.id)) return false;
      seenIds.add(task.id);
      return true;
    });

    const profileCreatives: InboxCreative[] = [];
    const concurrency = 6;
    for (let start = 0; start < uniqueTasks.length; start += concurrency) {
      const chunk = uniqueTasks.slice(start, start + concurrency);
      const creativesChunk = await Promise.all(
        chunk.map((task) =>
          expandTaskToInboxCreatives(
            storeId,
            task,
            profile.id,
            profile.name,
            testedMap,
            driveAccessToken,
            syncedAt,
          ),
        ),
      );
      const flattened = creativesChunk.flat().map((creative) => ({ ...creative, syncedAt }));
      profileCreatives.push(...flattened);
      allCreatives.push(...flattened);
    }

    creativesByProfile.set(profile.id, profileCreatives);
  }

  const snapshots = listEntries.map(([, profile]) => ({
    productProfileId: profile.id,
    creatives: creativesByProfile.get(profile.id) ?? [],
    lastSyncedAt: syncedAt,
  }));

  return { creatives: allCreatives, snapshots };
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
  const forceRefresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // Get product profiles to resolve clickup_list_id -> product mapping
  const profiles = await getProductProfiles(storeId);
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

  const targetProfileIds = Array.from(listProfileMap.values()).map((profile) => profile.id);

  if (!forceRefresh && await hasCachedInboxCreatives(storeId, targetProfileIds)) {
    const creatives = await getCachedInboxCreatives(storeId, targetProfileIds);
    const cacheMeta = await getCachedInboxCreativeMeta(storeId, targetProfileIds);
    return NextResponse.json({
      creatives,
      cacheMeta,
      lastSyncedAt: cacheMeta.lastSyncedAt,
      cached: true,
    });
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

  // Get already-tested task IDs for dedup flagging
  const testedMap = getAlreadyTestedTaskIds(storeId);
  const googleDrive = await getGoogleDriveToken(storeId);
  const driveAccessToken = googleDrive?.accessToken || null;

  let liveResult: LiveInboxCreativesResult;
  try {
    liveResult = await buildLiveInboxCreatives(
      storeId,
      listProfileMap,
      token,
      readyStatus,
      testedMap,
      driveAccessToken,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch ClickUp creatives';
    const tokenInvalid = message.toLowerCase().includes('clickup token invalid');
    return NextResponse.json(
      {
        creatives: [],
        error: tokenInvalid
          ? 'ClickUp token is invalid or expired. Reconnect ClickUp from Settings > Integrations, then refresh ClickUp.'
          : message,
        notConnected: tokenInvalid,
      },
      { status: tokenInvalid ? 401 : 500 },
    );
  }

  await replaceCachedInboxCreatives(storeId, liveResult.snapshots);

  return NextResponse.json({
    creatives: liveResult.creatives,
    cacheMeta: {
      source: 'live',
      lastSyncedAt: liveResult.snapshots[0]?.lastSyncedAt ?? null,
      profiles: liveResult.snapshots.map((snapshot) => ({
        productProfileId: snapshot.productProfileId,
        creativeCount: snapshot.creatives.length,
        lastSyncedAt: snapshot.lastSyncedAt,
      })),
    } as CreativeHubInboxCacheMeta,
    lastSyncedAt: liveResult.snapshots[0]?.lastSyncedAt ?? null,
    cached: false,
  });
}
