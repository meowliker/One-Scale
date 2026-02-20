import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getStoreAdAccounts } from '@/app/api/lib/db';

type IssueSeverity = 'critical' | 'warning';
type IssueKind = 'ad_policy_rejected' | 'ad_with_issues' | 'learning_limited' | 'low_quality';

interface UiIssue {
  id: string;
  kind: IssueKind;
  severity: IssueSeverity;
  level: 'campaign' | 'adset' | 'ad';
  entityStatus: string;
  campaignStatus: string;
  adId: string;
  adSetId: string;
  campaignId: string;
  adName: string;
  adSetName: string;
  campaignName: string;
  reason: string;
  details?: string;
  lastUpdatedAt?: string;
  suggestion: string;
  actionLabel: string;
}

type MetaRow = Record<string, unknown>;
const issuesCache = new Map<string, { at: number; data: UiIssue[] }>();
const ISSUES_CACHE_TTL_MS = 10 * 60 * 1000;

function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function hasIssue(effectiveStatus: string, review: string, issuesInfo: string): boolean {
  const eff = effectiveStatus.toUpperCase();
  return (
    eff.includes('DISAPPROVED') ||
    eff.includes('REJECTED') ||
    eff.includes('WITH_ISSUES') ||
    eff.includes('LEARNING_LIMITED') ||
    review.length > 0 ||
    issuesInfo.length > 0
  );
}

function mapIssue(
  kind: 'campaign' | 'adset' | 'ad',
  row: MetaRow,
  fallbackCampaignName: string,
  fallbackAdSetName: string
): UiIssue | null {
  const id = text(row.id);
  if (!id) return null;

  const effectiveStatus = text(row.effective_status);
  const review = text(row.ad_review_feedback);
  const issuesInfo = text(row.issues_info);
  if (!hasIssue(effectiveStatus, review, issuesInfo)) return null;

  const eff = effectiveStatus.toUpperCase();
  const details = review || issuesInfo || effectiveStatus || undefined;
  const lastUpdatedAt = text(row.updated_time) || undefined;
  const campaignObj = row.campaign as MetaRow | undefined;
  const adSetObj = row.adset as MetaRow | undefined;
  const campaignName = text(campaignObj?.name) || fallbackCampaignName;
  const adSetName = text(adSetObj?.name) || fallbackAdSetName;

  let mappedKind: IssueKind = 'ad_with_issues';
  let severity: IssueSeverity = 'critical';
  let reason = 'Delivery/policy issue detected';
  let suggestion = 'Review policy feedback and destination compliance, then relaunch.';

  if (eff.includes('DISAPPROVED') || eff.includes('REJECTED')) {
    mappedKind = 'ad_policy_rejected';
    reason = 'Rejected/Disapproved by Meta policy';
    suggestion = 'Fix policy violation in copy/creative/landing page and re-enable after approval.';
  } else if (eff.includes('LEARNING_LIMITED')) {
    mappedKind = 'learning_limited';
    severity = 'warning';
    reason = 'Learning limited';
    suggestion = 'Increase budget or consolidate ad sets to generate more optimization events.';
  }

  const actionLabel =
    mappedKind === 'learning_limited'
      ? 'Boost Budget +20%'
      : kind === 'campaign'
      ? (text(row.status).toUpperCase() === 'ACTIVE' ? 'Pause Campaign' : 'Enable Campaign')
      : kind === 'adset'
      ? (text(row.status).toUpperCase() === 'ACTIVE' ? 'Pause Ad Set' : 'Enable Ad Set')
      : (text(row.status).toUpperCase() === 'ACTIVE' ? 'Pause Ad' : 'Enable Ad');

  return {
    id: `${kind}-${id}`,
    kind: mappedKind,
    severity,
    level: kind,
    entityStatus: text(row.status).toUpperCase(),
    campaignStatus: (kind === 'campaign' ? text(row.status) : text(campaignObj?.status)).toUpperCase(),
    adId: kind === 'ad' ? id : '',
    adSetId: kind === 'adset' ? id : text(adSetObj?.id),
    campaignId: kind === 'campaign' ? id : text(campaignObj?.id),
    adName: kind === 'ad' ? text(row.name) : kind === 'adset' ? '(ad set level)' : '(campaign level)',
    adSetName: kind === 'adset' ? text(row.name) : adSetName,
    campaignName: kind === 'campaign' ? text(row.name) : campaignName,
    reason,
    details,
    lastUpdatedAt,
    suggestion,
    actionLabel,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  const mapped = getStoreAdAccounts(storeId)
    .filter((a) => a.platform === 'meta' && a.is_active === 1)
    .map((a) => a.ad_account_id);
  if (mapped.length === 0) {
    return NextResponse.json({ data: [] as UiIssue[] });
  }

  const cached = issuesCache.get(storeId);
  if (cached && Date.now() - cached.at < ISSUES_CACHE_TTL_MS) {
    return NextResponse.json({ data: cached.data, cached: true });
  }

  try {
    const results = await Promise.all(
      mapped.map(async (accountId) => {
        const [campaignsRes, adSetsRes, adsRes] = await Promise.all([
          fetchFromMeta<{ data: MetaRow[] }>(token.accessToken, `/${accountId}/campaigns`, {
            fields: 'id,name,status,updated_time,effective_status,configured_status,issues_info,ad_review_feedback',
            limit: '500',
          }).catch(() => ({ data: [] })),
          fetchFromMeta<{ data: MetaRow[] }>(token.accessToken, `/${accountId}/adsets`, {
            fields: 'id,name,status,updated_time,effective_status,configured_status,issues_info,ad_review_feedback,campaign{id,name,status}',
            limit: '500',
          }).catch(() => ({ data: [] })),
          fetchFromMeta<{ data: MetaRow[] }>(token.accessToken, `/${accountId}/ads`, {
            fields: 'id,name,status,updated_time,effective_status,configured_status,issues_info,ad_review_feedback,campaign{id,name,status},adset{id,name,status}',
            limit: '500',
          }).catch(() => ({ data: [] })),
        ]);

        const issues: UiIssue[] = [];
        for (const c of campaignsRes.data || []) {
          const item = mapIssue('campaign', c, text(c.name), '');
          if (item) issues.push(item);
        }
        for (const a of adSetsRes.data || []) {
          const item = mapIssue('adset', a, text((a.campaign as MetaRow | undefined)?.name), text(a.name));
          if (item) issues.push(item);
        }
        for (const ad of adsRes.data || []) {
          const item = mapIssue(
            'ad',
            ad,
            text((ad.campaign as MetaRow | undefined)?.name),
            text((ad.adset as MetaRow | undefined)?.name)
          );
          if (item) issues.push(item);
        }
        return issues;
      })
    );

    const flat = results.flat();
    const deduped = Array.from(new Map(flat.map((i) => [i.id, i])).values());
    deduped.sort((a, b) => (a.severity === b.severity ? a.reason.localeCompare(b.reason) : a.severity === 'critical' ? -1 : 1));
    const finalData = deduped.slice(0, 200);
    issuesCache.set(storeId, { at: Date.now(), data: finalData });
    return NextResponse.json({ data: finalData });
  } catch (err) {
    if (cached) {
      return NextResponse.json({ data: cached.data, cached: true, stale: true });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch issues';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
