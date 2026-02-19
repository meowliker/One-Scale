import { NextRequest, NextResponse } from 'next/server';
import { getStoreAdAccounts } from '@/app/api/lib/db';
import { fetchFromMeta, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { getMetaToken } from '@/app/api/lib/tokens';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const REQUIRED_TAG_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'campaign_id', 'adset_id', 'ad_id'];
const DEFAULT_META_URL_TAGS =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';
const PAGE_LIMIT = 200;
const MAX_PAGES = 8;

interface MetaEntityLite {
  id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
}

interface MetaCreativeLite {
  id?: string;
  url_tags?: string;
}

interface MetaAdLite extends MetaEntityLite {
  campaign_id?: string;
  adset_id?: string;
  campaign?: MetaEntityLite;
  adset?: MetaEntityLite;
  creative?: MetaCreativeLite;
}

interface MetaAdsPage {
  data?: MetaAdLite[];
  paging?: {
    cursors?: {
      after?: string;
    };
  };
}

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

function clampMaxUpdates(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 120;
  return Math.max(1, Math.min(300, Math.floor(parsed)));
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function missingTagKeys(urlTags?: string | null): string[] {
  const raw = String(urlTags || '').trim();
  if (!raw) return [...REQUIRED_TAG_KEYS];
  try {
    const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
    return REQUIRED_TAG_KEYS.filter((key) => {
      const value = params.get(key);
      return !value || !value.trim();
    });
  } catch {
    return REQUIRED_TAG_KEYS.filter((key) => !raw.includes(`${key}=`));
  }
}

function isActiveCampaign(ad: MetaAdLite): boolean {
  const campaignStatus = normalizeStatus(ad.campaign?.effective_status || ad.campaign?.status);
  if (campaignStatus) return campaignStatus === 'ACTIVE';
  const adStatus = normalizeStatus(ad.effective_status || ad.status);
  return adStatus === 'ACTIVE';
}

async function postToMeta(accessToken: string, endpoint: string, body: Record<string, string>): Promise<void> {
  const params = new URLSearchParams();
  params.set('access_token', accessToken);
  for (const [key, value] of Object.entries(body)) {
    params.set(key, value);
  }

  const response = await fetch(`${GRAPH_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Meta POST failed on ${endpoint}`);
  }
}

async function fetchAdsForAccount(accessToken: string, accountId: string): Promise<MetaAdLite[]> {
  const rows: MetaAdLite[] = [];
  let after: string | null = null;
  let pages = 0;

  while (pages < MAX_PAGES) {
    pages += 1;
    const params: Record<string, string> = {
      fields: 'id,name,status,effective_status,campaign_id,adset_id,campaign{id,name,status,effective_status},adset{id,name,status,effective_status},creative{id,url_tags}',
      limit: String(PAGE_LIMIT),
    };
    if (after) params.after = after;

    const response = await fetchFromMeta<MetaAdsPage>(
      accessToken,
      `/${accountId}/ads`,
      params,
      12_000,
      0
    );

    rows.push(...(response.data || []));
    after = response.paging?.cursors?.after || null;
    if (!after) break;
  }

  return rows;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handle(request: NextRequest, explicitApply?: boolean) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = getMetaToken(storeId);
  if (!token?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  if (request.method === 'POST') {
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const apply = typeof explicitApply === 'boolean' ? explicitApply : parseBoolean(body.apply, false);
  const activeOnly = parseBoolean(body.activeOnly ?? searchParams.get('activeOnly'), true);
  const maxUpdates = clampMaxUpdates(body.maxUpdates ?? searchParams.get('maxUpdates'));

  const accountIds = getStoreAdAccounts(storeId)
    .filter((row) => row.platform === 'meta' && row.is_active === 1)
    .map((row) => row.ad_account_id);

  if (accountIds.length === 0) {
    return NextResponse.json({ error: 'No active Meta ad accounts mapped for this store' }, { status: 400 });
  }

  const scannedByAccount: Array<{ accountId: string; scanned: number }> = [];
  const targets: Array<{
    adId: string;
    adName: string;
    campaignId: string | null;
    campaignName: string;
    creativeId: string | null;
    currentUrlTags: string;
    missingKeys: string[];
  }> = [];

  try {
    for (const accountId of accountIds) {
      const ads = await fetchAdsForAccount(token.accessToken, accountId);
      scannedByAccount.push({ accountId, scanned: ads.length });

      for (const ad of ads) {
        if (activeOnly && !isActiveCampaign(ad)) continue;

        const adId = String(ad.id || '').trim();
        if (!adId) continue;
        const creativeId = String(ad.creative?.id || '').trim() || null;
        const currentUrlTags = String(ad.creative?.url_tags || '').trim();
        const missingKeys = missingTagKeys(currentUrlTags);
        if (missingKeys.length === 0) continue;

        targets.push({
          adId,
          adName: String(ad.name || '').trim() || '(unnamed ad)',
          campaignId: String(ad.campaign?.id || ad.campaign_id || '').trim() || null,
          campaignName: String(ad.campaign?.name || '').trim() || '(unknown campaign)',
          creativeId,
          currentUrlTags,
          missingKeys,
        });
      }
    }
  } catch (err) {
    if (err instanceof MetaRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : 'Failed to audit Meta URL tags';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const details: Array<{
    adId: string;
    adName: string;
    campaignId: string | null;
    campaignName: string;
    creativeId: string | null;
    missingKeys: string[];
    status: 'missing' | 'updated' | 'failed' | 'skipped_no_creative' | 'skipped_cap';
    error?: string;
  }> = [];

  let updated = 0;
  let failed = 0;
  let skippedNoCreative = 0;
  let skippedCap = 0;
  let updatedCalls = 0;
  const creativeResultCache = new Map<string, { ok: boolean; error?: string }>();

  for (const target of targets) {
    if (!apply) {
      details.push({ ...target, status: 'missing' });
      continue;
    }

    if (!target.creativeId) {
      skippedNoCreative += 1;
      details.push({ ...target, status: 'skipped_no_creative' });
      continue;
    }

    if (updatedCalls >= maxUpdates && !creativeResultCache.has(target.creativeId)) {
      skippedCap += 1;
      details.push({ ...target, status: 'skipped_cap' });
      continue;
    }

    const cached = creativeResultCache.get(target.creativeId);
    if (cached) {
      if (cached.ok) {
        updated += 1;
        details.push({ ...target, status: 'updated' });
      } else {
        failed += 1;
        details.push({ ...target, status: 'failed', error: cached.error || 'Failed to update creative' });
      }
      continue;
    }

    try {
      await postToMeta(token.accessToken, `/${target.creativeId}`, { url_tags: DEFAULT_META_URL_TAGS });
      creativeResultCache.set(target.creativeId, { ok: true });
      updated += 1;
      updatedCalls += 1;
      details.push({ ...target, status: 'updated' });
      await sleep(120);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update creative url_tags';
      creativeResultCache.set(target.creativeId, { ok: false, error: message });
      failed += 1;
      details.push({ ...target, status: 'failed', error: message });
      if (message.toLowerCase().includes('rate') || message.includes('code":17')) {
        break;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      mode: apply ? 'apply' : 'audit',
      activeOnly,
      maxUpdates,
      requiredTemplate: DEFAULT_META_URL_TAGS,
      totals: {
        scannedAds: scannedByAccount.reduce((sum, row) => sum + row.scanned, 0),
        missingAds: targets.length,
        updatedAds: updated,
        failedAds: failed,
        skippedNoCreative,
        skippedCap,
      },
      scannedByAccount,
      details: details.slice(0, 200),
    },
  });
}

export async function GET(request: NextRequest) {
  return handle(request, false);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
