import { subDays } from 'date-fns';

export type SetupAccount = {
  id?: string;
  name?: string;
  accountId?: string;
  businessId?: string;
  businessName?: string;
};

export type SetupPage = {
  id?: string;
  name?: string;
  instagramId?: string;
  instagramUsername?: string;
  adAccountIds?: string[];
};

export type SetupInstagram = {
  id?: string;
  name?: string;
  username?: string;
  linkedPageId?: string;
  adAccountIds?: string[];
};

export type SetupPixel = {
  id?: string;
  name?: string;
  adAccountId?: string;
};

export type ActiveAccount = {
  ad_account_id: string;
  ad_account_name?: string;
  timezone?: string | null;
};

export type EntityEnrichment = {
  adAccountId: string | null;
  adAccountName: string | null;
  businessManagerId: string | null;
  businessManagerName: string | null;
  facebookPageId: string | null;
  facebookPageName: string | null;
  instagramId: string | null;
  instagramUsername: string | null;
  pixelId: string | null;
  pixelName: string | null;
};

export type EnrichmentLookups = {
  accountNameById: Map<string, string>;
  businessByAccountId: Map<string, { id: string | null; name: string | null }>;
  pagesByAccountId: Map<string, SetupPage[]>;
  pixelsByAccountId: Map<string, SetupPixel[]>;
  instagramByAccountId: Map<string, SetupInstagram[]>;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function pickFirst<T>(rows: T[]): T | null {
  return rows.length > 0 ? rows[0] : null;
}

export function normalizeMetaAccountId(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/^act_/, '');
}

export function buildWarehouseVariantKey(since: string, until: string): string {
  return `warehouse:since:${since}|until:${until}|strict:1`;
}

export function buildWarehouseDateRange(accountTz: string): { since: string; until: string } {
  const until = new Intl.DateTimeFormat('en-CA', { timeZone: accountTz }).format(new Date());
  const start = subDays(new Date(`${until}T00:00:00Z`), 29).toISOString().slice(0, 10);
  return { since: start, until };
}

export function buildEnrichmentLookups(
  setupAccounts: SetupAccount[],
  setupPages: SetupPage[],
  setupPixels: SetupPixel[],
  setupInstagram: SetupInstagram[],
  activeAccounts: ActiveAccount[]
): EnrichmentLookups {
  const accountNameById = new Map<string, string>();
  const businessByAccountId = new Map<string, { id: string | null; name: string | null }>();
  const pagesByAccountId = new Map<string, SetupPage[]>();
  const pixelsByAccountId = new Map<string, SetupPixel[]>();
  const instagramByAccountId = new Map<string, SetupInstagram[]>();

  for (const account of activeAccounts) {
    const normalized = normalizeMetaAccountId(account.ad_account_id);
    if (normalized) {
      accountNameById.set(normalized, account.ad_account_name || normalized);
    }
  }

  for (const row of setupAccounts) {
    const normalized = normalizeMetaAccountId(asString(row.id) || asString(row.accountId) || '');
    if (!normalized) continue;
    accountNameById.set(normalized, asString(row.name) || accountNameById.get(normalized) || normalized);
    businessByAccountId.set(normalized, {
      id: asString(row.businessId),
      name: asString(row.businessName),
    });
  }

  for (const page of setupPages) {
    for (const id of toArray<string>(page.adAccountIds)) {
      const normalized = normalizeMetaAccountId(id);
      if (!normalized) continue;
      const rows = pagesByAccountId.get(normalized) || [];
      rows.push(page);
      pagesByAccountId.set(normalized, rows);
    }
  }

  for (const pixel of setupPixels) {
    const normalized = normalizeMetaAccountId(asString(pixel.adAccountId) || '');
    if (!normalized) continue;
    const rows = pixelsByAccountId.get(normalized) || [];
    rows.push(pixel);
    pixelsByAccountId.set(normalized, rows);
  }

  for (const ig of setupInstagram) {
    for (const id of toArray<string>(ig.adAccountIds)) {
      const normalized = normalizeMetaAccountId(id);
      if (!normalized) continue;
      const rows = instagramByAccountId.get(normalized) || [];
      rows.push(ig);
      instagramByAccountId.set(normalized, rows);
    }
  }

  return {
    accountNameById,
    businessByAccountId,
    pagesByAccountId,
    pixelsByAccountId,
    instagramByAccountId,
  };
}

export function resolveEnrichmentForAccount(
  accountIdRaw: string | null,
  lookups: EnrichmentLookups
): EntityEnrichment {
  const normalized = normalizeMetaAccountId(accountIdRaw);
  const page = pickFirst(lookups.pagesByAccountId.get(normalized) || []);
  const pixel = pickFirst(lookups.pixelsByAccountId.get(normalized) || []);
  const instagram = pickFirst(lookups.instagramByAccountId.get(normalized) || []);
  const business = lookups.businessByAccountId.get(normalized);
  return {
    adAccountId: normalized || null,
    adAccountName: lookups.accountNameById.get(normalized) || null,
    businessManagerId: business?.id || null,
    businessManagerName: business?.name || null,
    facebookPageId: asString(page?.id) || null,
    facebookPageName: asString(page?.name) || null,
    instagramId: asString(page?.instagramId) || asString(instagram?.id) || null,
    instagramUsername: asString(page?.instagramUsername) || asString(instagram?.username) || asString(instagram?.name) || null,
    pixelId: asString(pixel?.id) || null,
    pixelName: asString(pixel?.name) || null,
  };
}

export function mergeEnrichment(base: EntityEnrichment, override: Partial<EntityEnrichment>): EntityEnrichment {
  return {
    adAccountId: override.adAccountId ?? base.adAccountId,
    adAccountName: override.adAccountName ?? base.adAccountName,
    businessManagerId: override.businessManagerId ?? base.businessManagerId,
    businessManagerName: override.businessManagerName ?? base.businessManagerName,
    facebookPageId: override.facebookPageId ?? base.facebookPageId,
    facebookPageName: override.facebookPageName ?? base.facebookPageName,
    instagramId: override.instagramId ?? base.instagramId,
    instagramUsername: override.instagramUsername ?? base.instagramUsername,
    pixelId: override.pixelId ?? base.pixelId,
    pixelName: override.pixelName ?? base.pixelName,
  };
}

