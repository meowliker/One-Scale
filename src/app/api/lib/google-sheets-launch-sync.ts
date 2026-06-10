import { createSign } from 'crypto';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const LAUNCH_SPREADSHEETS = [
  {
    spreadsheetId: '1L0V2eFdWdwKLLEOjiFp-kpp4FZ7JRYuRK-vPXh1MLWA',
    mappings: [
      {
        tabName: 'Final Sheet 2026',
        clickupColumn: 'C',
        statusColumn: 'K',
        launchLabelColumn: 'M',
      },
      {
        tabName: 'Immuvi Creative sheet',
        clickupColumn: 'C',
        statusColumn: 'J',
        launchLabelColumn: 'L',
      },
    ],
  },
  {
    spreadsheetId: '1rqqsENvXzYwQqgvVmikzBq5LK9dS2OlokVpQNBh0W64',
    mappings: [
      {
        tabName: 'Final Sheet 2026',
        clickupColumn: 'C',
        statusColumn: 'K',
        launchLabelColumn: 'M',
      },
    ],
  },
] as const;

type LaunchSheetMapping = (typeof LAUNCH_SPREADSHEETS)[number]['mappings'][number];

interface ServiceAccountCredentials {
  client_email?: string;
  private_key?: string;
  token_uri?: string;
}

export interface GoogleSheetLaunchTask {
  taskId: string;
  taskName?: string | null;
  relatedTaskIds?: string[];
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

type RelatedTaskIdResolver = (task: GoogleSheetLaunchTask) => Promise<string[]>;

interface TaskTarget {
  taskId: string;
  taskName: string;
  taskNameKey: string;
  primaryKeys: Set<string>;
  relatedKeys: Set<string>;
}

interface SheetMatch {
  task: TaskTarget;
  spreadsheetId: string;
  tabName: string;
  statusColumn: string;
  launchLabelColumn: string;
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

function normalizeTaskName(value: string | null | undefined): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function columnToZeroIndex(column: string): number {
  return column
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')
    .reduce((index, char) => index * 26 + char.charCodeAt(0) - 64, 0) - 1;
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
    const primaryKeys = extractTaskKeys(task.taskId);
    const primaryKey = normalizeTaskKey(task.taskId);
    if (!primaryKey || primaryKeys.size === 0) continue;
    const relatedKeys = new Set<string>();
    for (const relatedTaskId of task.relatedTaskIds || []) {
      for (const key of extractTaskKeys(relatedTaskId)) relatedKeys.add(key);
    }

    const existing = byKey.get(primaryKey);
    if (existing) {
      for (const key of primaryKeys) existing.primaryKeys.add(key);
      for (const key of relatedKeys) existing.relatedKeys.add(key);
      if (!existing.taskName && task.taskName) {
        existing.taskName = task.taskName;
        existing.taskNameKey = normalizeTaskName(task.taskName);
      }
      continue;
    }

    byKey.set(primaryKey, {
      taskId: task.taskId,
      taskName: task.taskName?.trim() || task.taskId,
      taskNameKey: normalizeTaskName(task.taskName),
      primaryKeys,
      relatedKeys,
    });
  }

  return Array.from(byKey.values());
}

function findTaskForLinkCell(
  cellValue: unknown,
  tasks: TaskTarget[],
  keyKind: 'primary' | 'related',
): TaskTarget | undefined {
  if (typeof cellValue !== 'string' && typeof cellValue !== 'number') return undefined;
  const cellKeys = extractTaskKeys(String(cellValue));
  if (cellKeys.size === 0) return undefined;

  return tasks.find((task) => {
    const taskKeys = keyKind === 'primary' ? task.primaryKeys : task.relatedKeys;
    for (const key of taskKeys) {
      if (cellKeys.has(key)) return true;
    }
    return false;
  });
}

function findTaskForRow(row: unknown[], mapping: LaunchSheetMapping, tasks: TaskTarget[]): TaskTarget | undefined {
  const clickupIndex = columnToZeroIndex(mapping.clickupColumn);
  const linkMatch = findTaskForLinkCell(row[clickupIndex], tasks, 'primary');
  if (linkMatch) return linkMatch;

  const rowCellNames = new Set(
    row
      .map((cell) => (typeof cell === 'string' || typeof cell === 'number' ? normalizeTaskName(String(cell)) : ''))
      .filter(Boolean),
  );

  return tasks.find((task) => task.taskNameKey && rowCellNames.has(task.taskNameKey));
}

function findTaskForRelatedLinkRow(
  row: unknown[],
  mapping: LaunchSheetMapping,
  tasks: TaskTarget[],
): TaskTarget | undefined {
  const clickupIndex = columnToZeroIndex(mapping.clickupColumn);
  return findTaskForLinkCell(row[clickupIndex], tasks, 'related');
}

async function fetchSheetRows(
  accessToken: string,
  spreadsheetId: string,
  mappings: readonly LaunchSheetMapping[],
): Promise<Array<{ values?: unknown[][] }>> {
  const params = new URLSearchParams({
    valueRenderOption: 'FORMATTED_VALUE',
    majorDimension: 'ROWS',
  });
  for (const mapping of mappings) {
    params.append('ranges', `${escapeSheetName(mapping.tabName)}!A:${mapping.launchLabelColumn}`);
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

async function updateMatchedRows(
  accessToken: string,
  matches: SheetMatch[],
  launchTestingLabel?: string,
): Promise<void> {
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
        data: spreadsheetMatches.flatMap((match) => [
          {
            range: `${escapeSheetName(match.tabName)}!${match.statusColumn}${match.rowNumber}`,
            values: [['Testing']],
          },
          ...(launchTestingLabel
            ? [
                {
                  range: `${escapeSheetName(match.tabName)}!${match.launchLabelColumn}${match.rowNumber}`,
                  values: [[launchTestingLabel]],
                },
              ]
            : []),
        ]),
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
  launchTestingLabel?: string,
  resolveRelatedTaskIds?: RelatedTaskIdResolver,
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
    const matchedRows = new Set<string>();
    const scannedSheets: Array<{
      spreadsheetId: string;
      mappings: readonly LaunchSheetMapping[];
      valueRanges: Array<{ values?: unknown[][] }>;
    }> = [];

    for (const spreadsheet of LAUNCH_SPREADSHEETS) {
      const valueRanges = await fetchSheetRows(
        accessToken,
        spreadsheet.spreadsheetId,
        spreadsheet.mappings,
      );
      scannedSheets.push({
        spreadsheetId: spreadsheet.spreadsheetId,
        mappings: spreadsheet.mappings,
        valueRanges,
      });

      for (const [tabIndex, mapping] of spreadsheet.mappings.entries()) {
        const rows = valueRanges[tabIndex]?.values || [];
        for (const [rowIndex, row] of rows.entries()) {
          const task = findTaskForRow(row || [], mapping, targets);
          if (!task) continue;
          const rowKey = `${spreadsheet.spreadsheetId}:${mapping.tabName}:${rowIndex + 1}`;
          if (matchedRows.has(rowKey)) continue;

          matches.push({
            task,
            spreadsheetId: spreadsheet.spreadsheetId,
            tabName: mapping.tabName,
            statusColumn: mapping.statusColumn,
            launchLabelColumn: mapping.launchLabelColumn,
            rowNumber: rowIndex + 1,
          });
          matchedRows.add(rowKey);
          matchedTaskIds.add(task.taskId);
        }
      }
    }

    const unmatchedAfterDirectScan = targets.filter((task) => !matchedTaskIds.has(task.taskId));
    if (resolveRelatedTaskIds && unmatchedAfterDirectScan.length > 0) {
      await Promise.all(
        unmatchedAfterDirectScan.map(async (task) => {
          try {
            const relatedTaskIds = await resolveRelatedTaskIds({
              taskId: task.taskId,
              taskName: task.taskName,
            });
            for (const relatedTaskId of relatedTaskIds) {
              for (const key of extractTaskKeys(relatedTaskId)) task.relatedKeys.add(key);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`[google-sheets-sync] Failed to resolve related ClickUp task IDs for ${task.taskId}: ${message}`);
          }
        }),
      );
    }

    const unmatchedWithRelatedKeys = targets.filter(
      (task) => !matchedTaskIds.has(task.taskId) && task.relatedKeys.size > 0,
    );
    if (unmatchedWithRelatedKeys.length > 0) {
      for (const spreadsheet of scannedSheets) {
        for (const [tabIndex, mapping] of spreadsheet.mappings.entries()) {
          const rows = spreadsheet.valueRanges[tabIndex]?.values || [];
          for (const [rowIndex, row] of rows.entries()) {
            const task = findTaskForRelatedLinkRow(row || [], mapping, unmatchedWithRelatedKeys);
            if (!task) continue;
            const rowKey = `${spreadsheet.spreadsheetId}:${mapping.tabName}:${rowIndex + 1}`;
            if (matchedRows.has(rowKey)) continue;

            matches.push({
              task,
              spreadsheetId: spreadsheet.spreadsheetId,
              tabName: mapping.tabName,
              statusColumn: mapping.statusColumn,
              launchLabelColumn: mapping.launchLabelColumn,
              rowNumber: rowIndex + 1,
            });
            matchedRows.add(rowKey);
            matchedTaskIds.add(task.taskId);
          }
        }
      }
    }

    await updateMatchedRows(accessToken, matches, launchTestingLabel);
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
