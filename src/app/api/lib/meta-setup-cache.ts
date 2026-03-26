import { fetchFromMeta } from '@/app/api/lib/meta-client';
import type { MetaSnapshotEndpoint } from '@/app/api/lib/db';

interface StoreAccountLike {
  ad_account_id: string;
  ad_account_name: string;
}

interface SnapshotWriter {
  (endpoint: MetaSnapshotEndpoint, scopeId: string, variantKey: string, payload: unknown): Promise<void>;
}

interface MetaPageOption {
  id: string;
  name: string;
  instagramId?: string;
  instagramUsername?: string;
  adAccountIds?: string[];
}

interface MetaInstagramOption {
  id: string;
  name: string;
  username: string;
  linkedPageId?: string;
  adAccountIds?: string[];
}

interface MetaPixelOption {
  id: string;
  name: string;
  adAccountId: string;
}

export interface MetaSetupCachePayload {
  accounts: Array<{
    id: string;
    name: string;
    accountId: string;
    account_status?: number;
    currency?: string;
    businessId?: string;
    businessName?: string;
    business?: { id?: string; name?: string };
  }>;
  pages: MetaPageOption[];
  instagram: MetaInstagramOption[];
  pixels: MetaPixelOption[];
}

function normalizeAccountId(value: string): string {
  return value.replace(/^act_/, '');
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function asInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
  return undefined;
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const out = new Map<string, T>();
  for (const row of rows) {
    if (!row?.id) continue;
    if (!out.has(row.id)) out.set(row.id, row);
  }
  return [...out.values()];
}

function mergeAccountIds(existing: string[] | undefined, next: string[] | undefined): string[] | undefined {
  const merged = new Set<string>();
  for (const row of existing || []) {
    if (row) merged.add(row);
  }
  for (const row of next || []) {
    if (row) merged.add(row);
  }
  return merged.size > 0 ? [...merged] : undefined;
}

function mergePages(rows: MetaPageOption[]): MetaPageOption[] {
  const out = new Map<string, MetaPageOption>();
  for (const row of rows) {
    if (!row?.id) continue;
    const existing = out.get(row.id);
    if (!existing) {
      out.set(row.id, row);
      continue;
    }
    out.set(row.id, {
      id: row.id,
      name: existing.name || row.name || row.id,
      instagramId: existing.instagramId || row.instagramId,
      instagramUsername: existing.instagramUsername || row.instagramUsername,
      adAccountIds: mergeAccountIds(existing.adAccountIds, row.adAccountIds),
    });
  }
  return [...out.values()];
}

function mergeInstagram(rows: MetaInstagramOption[]): MetaInstagramOption[] {
  const out = new Map<string, MetaInstagramOption>();
  for (const row of rows) {
    if (!row?.id) continue;
    const existing = out.get(row.id);
    if (!existing) {
      out.set(row.id, row);
      continue;
    }
    out.set(row.id, {
      id: row.id,
      name: existing.name || row.name || row.id,
      username: existing.username || row.username || row.name || row.id,
      linkedPageId: existing.linkedPageId || row.linkedPageId,
      adAccountIds: mergeAccountIds(existing.adAccountIds, row.adAccountIds),
    });
  }
  return [...out.values()];
}

export async function refreshMetaSetupSnapshots(params: {
  accessToken: string;
  adAccounts: StoreAccountLike[];
  writeSnapshot: SnapshotWriter;
}): Promise<MetaSetupCachePayload> {
  const { accessToken, adAccounts, writeSnapshot } = params;
  const accounts = await Promise.all(
    adAccounts.map(async (account) => {
      const accountRow = {
        id: account.ad_account_id,
        name: account.ad_account_name || account.ad_account_id,
        accountId: normalizeAccountId(account.ad_account_id),
        account_status: undefined as number | undefined,
        currency: undefined as string | undefined,
        businessId: undefined as string | undefined,
        businessName: undefined as string | undefined,
        business: undefined as { id?: string; name?: string } | undefined,
      };
      try {
        const details = await fetchFromMeta<Record<string, unknown>>(
          accessToken,
          `/${account.ad_account_id}`,
          { fields: 'id,name,account_id,account_status,currency,business{id,name},owner_business{id,name}' },
          8000,
          1
        );
        const business = (details.business && typeof details.business === 'object')
          ? (details.business as Record<string, unknown>)
          : null;
        const ownerBusiness = (details.owner_business && typeof details.owner_business === 'object')
          ? (details.owner_business as Record<string, unknown>)
          : null;
        accountRow.businessId =
          asNonEmptyString(business?.id)
          || asNonEmptyString(ownerBusiness?.id)
          || undefined;
        accountRow.businessName =
          asNonEmptyString(business?.name)
          || asNonEmptyString(ownerBusiness?.name)
          || undefined;
        accountRow.business = (accountRow.businessId || accountRow.businessName)
          ? {
              id: accountRow.businessId,
              name: accountRow.businessName,
            }
          : undefined;
        accountRow.account_status = asInteger(details.account_status);
        accountRow.currency = asNonEmptyString(details.currency);
      } catch {
        // Keep fallback row from store cache
      }
      return accountRow;
    })
  );

  const pages: MetaPageOption[] = [];
  const instagram: MetaInstagramOption[] = [];
  const pixels: MetaPixelOption[] = [];
  const pageNameById = new Map<string, string>();

  await writeSnapshot('accounts', '', 'latest', accounts);

  try {
    const pageResponse = await fetchFromMeta<{ data?: Array<Record<string, unknown>> }>(
      accessToken,
      '/me/accounts',
      { fields: 'id,name,instagram_business_account{id,username}', limit: '200' },
      10000,
      1
    );
    for (const row of pageResponse.data || []) {
      const id = typeof row.id === 'string' ? row.id : '';
      const name = typeof row.name === 'string' ? row.name : id;
      if (!id) continue;
      const ig = (row.instagram_business_account && typeof row.instagram_business_account === 'object')
        ? row.instagram_business_account as Record<string, unknown>
        : null;
      const instagramId = ig && typeof ig.id === 'string' ? ig.id : '';
      const instagramUsername = ig && typeof ig.username === 'string' ? ig.username : '';
      pages.push({
        id,
        name,
        instagramId: instagramId || undefined,
        instagramUsername: instagramUsername || undefined,
      });
      pageNameById.set(id, name);
      if (instagramId) {
        instagram.push({
          id: instagramId,
          name: instagramUsername || instagramId,
          username: instagramUsername || instagramId,
          linkedPageId: id,
        });
      }
    }
  } catch {
    // Cache warm-up is best effort. Product setup can still proceed with manual overrides.
  }

  const perAccountRows = await Promise.all(
    accounts.map(async (account) => {
      const accountNode = `act_${normalizeAccountId(account.id)}`;
      const accountPages: MetaPageOption[] = [];
      const accountPixels: MetaPixelOption[] = [];
      const accountInstagram: MetaInstagramOption[] = [];

      try {
        const pixelResponse = await fetchFromMeta<{ data?: Array<Record<string, unknown>> }>(
          accessToken,
          `/${accountNode}/adspixels`,
          { fields: 'id,name,status', limit: '300' },
          10000,
          1
        );
        for (const row of pixelResponse.data || []) {
          const id = typeof row.id === 'string' ? row.id : '';
          if (!id) continue;
          const name = typeof row.name === 'string' ? row.name : id;
          accountPixels.push({ id, name, adAccountId: account.id });
        }
      } catch {
        // Best effort.
      }

      try {
        const instagramResponse = await fetchFromMeta<{ data?: Array<Record<string, unknown>> }>(
          accessToken,
          `/${accountNode}/instagram_accounts`,
          { fields: 'id,username,name', limit: '300' },
          10000,
          1
        );
        for (const row of instagramResponse.data || []) {
          const id = typeof row.id === 'string' ? row.id : '';
          if (!id) continue;
          const username = typeof row.username === 'string'
            ? row.username
            : (typeof row.name === 'string' ? row.name : id);
          accountInstagram.push({
            id,
            name: username || id,
            username: username || id,
            adAccountIds: [account.id],
          });
        }
      } catch {
        // Best effort.
      }

      try {
        const promotedPagesResponse = await fetchFromMeta<{ data?: Array<Record<string, unknown>> }>(
          accessToken,
          `/${accountNode}/promote_pages`,
          { fields: 'id,name,instagram_business_account{id,username}', limit: '200' },
          10000,
          1
        );
        for (const row of promotedPagesResponse.data || []) {
          const id = asNonEmptyString(row.id);
          if (!id) continue;
          const name = asNonEmptyString(row.name) || pageNameById.get(id) || id;
          if (name) pageNameById.set(id, name);
          const ig = (row.instagram_business_account && typeof row.instagram_business_account === 'object')
            ? row.instagram_business_account as Record<string, unknown>
            : null;
          const instagramId = asNonEmptyString(ig?.id);
          const instagramUsername = asNonEmptyString(ig?.username);

          accountPages.push({
            id,
            name,
            instagramId,
            instagramUsername,
            adAccountIds: [account.id],
          });

          if (instagramId) {
            accountInstagram.push({
              id: instagramId,
              name: instagramUsername || instagramId,
              username: instagramUsername || instagramId,
              linkedPageId: id,
              adAccountIds: [account.id],
            });
          }
        }
      } catch {
        // Best effort.
      }

      try {
        const pageIds = new Set<string>();
        let after: string | undefined;
        let pageFetches = 0;
        const MAX_AD_PAGES = 15;

        while (pageFetches < MAX_AD_PAGES) {
          const adsResponse = await fetchFromMeta<{
            data?: Array<Record<string, unknown>>;
            paging?: { cursors?: { after?: string } };
          }>(
            accessToken,
            `/${accountNode}/ads`,
            {
              fields: 'creative{object_story_spec}',
              limit: '200',
              ...(after ? { after } : {}),
            },
            10000,
            1
          );

          for (const row of adsResponse.data || []) {
            const creative = (row.creative && typeof row.creative === 'object')
              ? (row.creative as Record<string, unknown>)
              : null;
            const story = (creative?.object_story_spec && typeof creative.object_story_spec === 'object')
              ? (creative.object_story_spec as Record<string, unknown>)
              : null;
            const pageId = story && typeof story.page_id === 'string' ? story.page_id : '';
            if (pageId) pageIds.add(pageId);
          }

          pageFetches += 1;
          const nextAfter = adsResponse.paging?.cursors?.after;
          if (!nextAfter) break;
          after = nextAfter;
        }

        for (const pageId of pageIds) {
          const pageName = pageNameById.get(pageId) || '';
          accountPages.push({
            id: pageId,
            name: pageName || pageId,
            adAccountIds: [account.id],
          });
        }
      } catch {
        // Best effort.
      }

      await writeSnapshot('pages', account.id, 'latest', accountPages);
      await writeSnapshot('pixels', account.id, 'latest', accountPixels);
      await writeSnapshot('instagram', account.id, 'latest', accountInstagram);

      return {
        pages: accountPages,
        pixels: accountPixels,
        instagram: accountInstagram,
      };
    })
  );

  for (const row of perAccountRows) {
    pages.push(...row.pages);
    pixels.push(...row.pixels);
    instagram.push(...row.instagram);
  }

  const uniquePages = mergePages(pages);
  const uniqueInstagram = mergeInstagram(instagram);
  const uniquePixels = uniqueById(
    pixels.map((row) => ({ ...row, id: `${row.adAccountId}:${row.id}` }))
  ).map((row) => ({
    id: row.id.split(':').slice(1).join(':') || row.id,
    name: row.name,
    adAccountId: row.adAccountId,
  }));

  await Promise.all([
    writeSnapshot('pages', '', 'latest', uniquePages),
    writeSnapshot('instagram', '', 'latest', uniqueInstagram),
    writeSnapshot('pixels', '', 'latest', uniquePixels),
  ]);

  return {
    accounts,
    pages: uniquePages,
    instagram: uniqueInstagram,
    pixels: uniquePixels,
  };
}
