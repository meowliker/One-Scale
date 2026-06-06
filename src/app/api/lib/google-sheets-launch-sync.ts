import { createSign } from 'crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const DEFAULT_LAUNCH_SPREADSHEET_ID = '1L0V2eFdWdwKLLEOjiFp-kpp4FZ7JRYuRK-vPXh1MLWA';

const LAUNCH_SHEET_MAPPINGS = [
  {
    tabName: 'Final Sheet 2026',
    clickupColumn: 'C',
    statusColumn: 'K',
  },
  {
    tabName: 'Immuvi Creative sheet',
    clickupColumn: 'C',
    statusColumn: 'J',
  },
] as const;

interface ServiceAccountCredentials {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
}

export interface GoogleSheetLaunchTask {
  taskId: string;
  taskName?: string | null;
}

export interface GoogleSheetLaunchSyncResult {
  configured: boolean;
  attempted: number;
  updated: number;
  failed: number;
  notFound: number;
  notUpdatedTaskNames: string[];
  errors: string[];
}

interface TaskTarget {
  taskId: string;
  taskName: string;
  keys: Set<string>;
}

interface SheetMatch {
  task: TaskTarget;
  spreadsheetId: string;
  tabName: string;
  statusColumn: string;
  rowNumber: number;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function escapeSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function getLaunchSpreadsheetIds(): string[] {
  const configured = process.env.GOOGLE_SHEETS_LAUNCH_SPREADSHEET_IDS?.trim();
  if (!configured) return [DEFAULT_LAUNCH_SPREADSHEET_ID];

  const ids = configured
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return ids.length > 0 ? ids : [DEFAULT_LAUNCH_SPREADSHEET_ID];
}

function readServiceAccountCredentials(): ServiceAccountCredentials | null {
  const encoded = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();

  try {
    if (encoded) {
      return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ServiceAccountCredentials;
    }
    if (raw) {
      return JSON.parse(raw) as ServiceAccountCredentials;
    }
  } catch (err) {
    console.warn('[google-sheets-sync] Failed to parse service account credentials', err);
  }

  return null;
}

async function getGoogleSheetsAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const credentials = readServiceAccountCredentials();
  if (!credentials?.client_email || !credentials.private_key) {
    throw new Error('Google Sheets service account credentials are not configured.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: SHEETS_SCOPE,
    aud: credentials.token_uri || GOOGLE_TOKEN_URL,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
  };
  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(credentials.private_key);
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const response = await fetch(credentials.token_uri || GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google token request failed (${response.status})${text ? `: ${text.slice(0, 250)}` : ''}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Google token request did not return an access token.');
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

function normalizeTaskKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractTaskKeys(value: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return keys;

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const compact = normalizeTaskKey(decoded);
  if (compact.length >= 4 && compact.length <= 64) {
    keys.add(compact);
  }

  for (const token of decoded.match(/[a-z0-9]+/g) || []) {
    const normalized = normalizeTaskKey(token);
    if (normalized.length >= 4 && normalized.length <= 64) {
      keys.add(normalized);
    }
  }

  return keys;
}

function toTaskTargets(tasks: GoogleSheetLaunchTask[]): TaskTarget[] {
  const byKey = new Map<string, TaskTarget>();

  for (const task of tasks) {
    const keys = extractTaskKeys(task.taskId);
    const primaryKey = normalizeTaskKey(task.taskId);
    if (!primaryKey || keys.size === 0) continue;

    const existing = byKey.get(primaryKey);
    if (existing) {
      for (const key of keys) existing.keys.add(key);
      if (!existing.taskName && task.taskName) existing.taskName = task.taskName;
      continue;
    }

    byKey.set(primaryKey, {
      taskId: task.taskId,
      taskName: task.taskName?.trim() || task.taskId,
      keys,
    });
  }

  return Array.from(byKey.values());
}

function findTaskForCell(cellValue: unknown, tasks: TaskTarget[]): TaskTarget | undefined {
  if (typeof cellValue !== 'string' && typeof cellValue !== 'number') return undefined;
  const cellKeys = extractTaskKeys(String(cellValue));
  if (cellKeys.size === 0) return undefined;

  return tasks.find((task) => {
    for (const key of task.keys) {
      if (cellKeys.has(key)) return true;
    }
    return false;
  });
}

async function fetchClickUpColumns(
  accessToken: string,
  spreadsheetId: string,
): Promise<Array<{ values?: unknown[][] }>> {
  const params = new URLSearchParams({
    valueRenderOption: 'FORMATTED_VALUE',
    majorDimension: 'ROWS',
  });
  for (const mapping of LAUNCH_SHEET_MAPPINGS) {
    params.append('ranges', `${escapeSheetName(mapping.tabName)}!${mapping.clickupColumn}:${mapping.clickupColumn}`);
  }

  const response = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Google Sheets read failed (${response.status})${text ? `: ${text.slice(0, 250)}` : ''}`);
  }

  const data = (await response.json()) as { valueRanges?: Array<{ values?: unknown[][] }> };
  return data.valueRanges || [];
}

async function updateStatusCells(accessToken: string, matches: SheetMatch[]): Promise<void> {
  if (matches.length === 0) return;

  const matchesBySpreadsheet = new Map<string, SheetMatch[]>();
  for (const match of matches) {
    const spreadsheetMatches = matchesBySpreadsheet.get(match.spreadsheetId) || [];
    spreadsheetMatches.push(match);
    matchesBySpreadsheet.set(match.spreadsheetId, spreadsheetMatches);
  }

  for (const [spreadsheetId, spreadsheetMatches] of matchesBySpreadsheet.entries()) {
    const response = await fetch(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: spreadsheetMatches.map((match) => ({
          range: `${escapeSheetName(match.tabName)}!${match.statusColumn}${match.rowNumber}`,
          values: [['Testing']],
        })),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Google Sheets update failed (${response.status})${text ? `: ${text.slice(0, 250)}` : ''}`);
    }
  }
}

export async function updateLaunchedTasksInGoogleSheet(
  tasks: GoogleSheetLaunchTask[],
): Promise<GoogleSheetLaunchSyncResult> {
  const targets = toTaskTargets(tasks);
  if (targets.length === 0) {
    return {
      configured: Boolean(readServiceAccountCredentials()),
      attempted: 0,
      updated: 0,
      failed: 0,
      notFound: 0,
      notUpdatedTaskNames: [],
      errors: [],
    };
  }

  try {
    const accessToken = await getGoogleSheetsAccessToken();
    const matches: SheetMatch[] = [];
    const matchedTaskIds = new Set<string>();

    for (const spreadsheetId of getLaunchSpreadsheetIds()) {
      const valueRanges = await fetchClickUpColumns(accessToken, spreadsheetId);

      for (const [tabIndex, mapping] of LAUNCH_SHEET_MAPPINGS.entries()) {
        const rows = valueRanges[tabIndex]?.values || [];
        for (const [rowIndex, row] of rows.entries()) {
          const task = findTaskForCell(row?.[0], targets);
          if (!task) continue;

          matches.push({
            task,
            spreadsheetId,
            tabName: mapping.tabName,
            statusColumn: mapping.statusColumn,
            rowNumber: rowIndex + 1,
          });
          matchedTaskIds.add(task.taskId);
        }
      }
    }

    await updateStatusCells(accessToken, matches);
    const notMatched = targets.filter((task) => !matchedTaskIds.has(task.taskId));

    return {
      configured: true,
      attempted: targets.length,
      updated: matches.length,
      failed: notMatched.length,
      notFound: notMatched.length,
      notUpdatedTaskNames: notMatched.map((task) => task.taskName),
      errors: notMatched.length > 0 ? ['Some ClickUp tasks were not found in the configured Google Sheet tabs.'] : [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      configured: Boolean(readServiceAccountCredentials()),
      attempted: targets.length,
      updated: 0,
      failed: targets.length,
      notFound: 0,
      notUpdatedTaskNames: targets.map((task) => task.taskName),
      errors: [message],
    };
  }
}
