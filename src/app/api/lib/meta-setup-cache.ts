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
}

interface MetaInstagramOption {
  id: string;
  name: string;
  username: string;
  linkedPageId?: string;
}

interface MetaPixelOption {
  id: string;
  name: string;
  adAccountId: string;
}

export interface MetaSetupCachePayload {
  accounts: Array<{ id: string; name: string; accountId: string }>;
  pages: MetaPageOption[];
  instagram: MetaInstagramOption[];
  pixels: MetaPixelOption[];
}

function normalizeAccountId(value: string): string {
  return value.replace(/^act_/, '');
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const out = new Map<string, T>();
  for (const row of rows) {
    if (!row?.id) continue;
    if (!out.has(row.id)) out.set(row.id, row);
  }
  return [...out.values()];
}

export async function refreshMetaSetupSnapshots(params: {
  accessToken: string;
  adAccounts: StoreAccountLike[];
  writeSnapshot: SnapshotWriter;
}): Promise<MetaSetupCachePayload> {
  const { accessToken, adAccounts, writeSnapshot } = params;
  const accounts = adAccounts.map((account) => ({
    id: account.ad_account_id,
    name: account.ad_account_name || account.ad_account_id,
    accountId: normalizeAccountId(account.ad_account_id),
  }));

  const pages: MetaPageOption[] = [];
  const instagram: MetaInstagramOption[] = [];
  const pixels: MetaPixelOption[] = [];

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
          });
        }
      } catch {
        // Best effort.
      }

      await writeSnapshot('pixels', account.id, 'latest', accountPixels);
      await writeSnapshot('instagram', account.id, 'latest', accountInstagram);

      return {
        pixels: accountPixels,
        instagram: accountInstagram,
      };
    })
  );

  for (const row of perAccountRows) {
    pixels.push(...row.pixels);
    instagram.push(...row.instagram);
  }

  const uniquePages = uniqueById(pages);
  const uniqueInstagram = uniqueById(instagram);
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
