'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightCircle, ExternalLink, ShieldAlert, Sparkles, Wrench } from 'lucide-react';
import type { Campaign, EntityStatus } from '@/types/campaign';
import { cn } from '@/lib/utils';

type IssueSeverity = 'critical' | 'warning';
type IssueKind = 'ad_policy_rejected' | 'ad_with_issues' | 'learning_limited' | 'low_quality';
type IssueLevel = 'campaign' | 'adset' | 'ad';

export interface AdIssue {
  id: string;
  kind: IssueKind;
  severity: IssueSeverity;
  level: IssueLevel;
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

export interface AdsIssuesPanelProps {
  campaigns: Campaign[];
  onCampaignStatusChange: (id: string, status: EntityStatus) => Promise<void> | void;
  onAdSetStatusChange: (id: string, status: EntityStatus) => Promise<void> | void;
  onAdStatusChange: (id: string, status: EntityStatus) => Promise<void> | void;
  onAdSetBudgetChange: (id: string, budget: number) => Promise<void> | void;
  onNavigateIssue?: (issue: AdIssue) => void;
  prefetchedIssues?: AdIssue[];
  issuesLoading?: boolean;
  focusedIssueId?: string | null;
}

function issueKey(issue: AdIssue): string {
  return [
    issue.level,
    issue.campaignId || '',
    issue.adSetId || '',
    issue.adId || '',
    issue.kind,
    issue.reason,
  ].join('|');
}

function extractIssues(campaigns: Campaign[]): AdIssue[] {
  const issues: AdIssue[] = [];

  for (const campaign of campaigns) {
    const campaignEffective = (campaign.policyInfo?.effectiveStatus || '').toUpperCase();
    const campaignReview = campaign.policyInfo?.reviewFeedback || '';
    const campaignIssues = campaign.policyInfo?.issuesInfo?.join(' | ') || '';
    if (
      campaignEffective.includes('DISAPPROVED') ||
      campaignEffective.includes('WITH_ISSUES') ||
      campaignReview.length > 0 ||
      campaignIssues.length > 0
    ) {
      issues.push({
        id: `campaign-${campaign.id}`,
        kind: 'ad_with_issues',
        severity: 'critical',
        level: 'campaign',
        entityStatus: campaign.status,
        campaignStatus: campaign.status,
        adId: '',
        adSetId: '',
        campaignId: campaign.id,
        adName: '(campaign level)',
        adSetName: '-',
        campaignName: campaign.name,
        reason: 'Campaign has delivery/policy issues',
        details: campaignReview || campaignIssues || campaign.policyInfo?.effectiveStatus,
        suggestion: 'Review campaign setup and destination compliance. Pause if budget is leaking.',
        actionLabel: campaign.status === 'ACTIVE' ? 'Pause Campaign' : 'Enable Campaign',
      });
    }

    for (const adSet of campaign.adSets || []) {
      const adSetEffective = (adSet.policyInfo?.effectiveStatus || '').toUpperCase();
      const adSetReview = adSet.policyInfo?.reviewFeedback || '';
      const adSetIssues = adSet.policyInfo?.issuesInfo?.join(' | ') || '';
      if (
        adSetEffective.includes('DISAPPROVED') ||
        adSetEffective.includes('WITH_ISSUES') ||
        adSetReview.length > 0 ||
        adSetIssues.length > 0
      ) {
        issues.push({
          id: `adset-${adSet.id}`,
          kind: 'ad_with_issues',
          severity: 'critical',
          level: 'adset',
          entityStatus: adSet.status,
          campaignStatus: campaign.status,
          adId: '',
          adSetId: adSet.id,
          campaignId: campaign.id,
          adName: '(ad set level)',
          adSetName: adSet.name,
          campaignName: campaign.name,
          reason: 'Ad set has delivery/policy issues',
          details: adSetReview || adSetIssues || adSet.policyInfo?.effectiveStatus,
          suggestion: 'Review targeting/placements and associated ads. Pause ad set if needed.',
          actionLabel: adSet.status === 'ACTIVE' ? 'Pause Ad Set' : 'Enable Ad Set',
        });
      }

      for (const ad of adSet.ads || []) {
        const effective = (ad.policyInfo?.effectiveStatus || '').toUpperCase();
        const review = ad.policyInfo?.reviewFeedback || '';
        const issueInfo = ad.policyInfo?.issuesInfo?.join(' | ');

        const base = {
          level: 'ad' as const,
          entityStatus: ad.status,
          campaignStatus: campaign.status,
          adId: ad.id,
          adSetId: adSet.id,
          campaignId: campaign.id,
          adName: ad.name,
          adSetName: adSet.name,
          campaignName: campaign.name,
        };

        if (effective.includes('DISAPPROVED') || effective.includes('REJECTED')) {
          issues.push({
            id: `policy-${ad.id}`,
            kind: 'ad_policy_rejected',
            severity: 'critical',
            reason: 'Ad rejected by Meta policy',
            details: review || issueInfo,
            suggestion: 'Fix policy violation in copy/creative and re-enable after approval.',
            actionLabel: ad.status === 'ACTIVE' ? 'Pause Ad' : 'Enable Ad',
            ...base,
          });
          continue;
        }

        if (effective.includes('WITH_ISSUES') || review.length > 0 || (ad.policyInfo?.issuesInfo?.length || 0) > 0) {
          issues.push({
            id: `issues-${ad.id}`,
            kind: 'ad_with_issues',
            severity: 'critical',
            reason: 'Ad has delivery/policy issues',
            details: review || issueInfo,
            suggestion: 'Review feedback and update creative/copy/destination.',
            actionLabel: ad.status === 'ACTIVE' ? 'Pause Ad' : 'Enable Ad',
            ...base,
          });
          continue;
        }

        if (effective.includes('LEARNING_LIMITED')) {
          issues.push({
            id: `learning-${ad.id}`,
            kind: 'learning_limited',
            severity: 'warning',
            reason: 'Learning limited',
            details: 'Delivery may be unstable due to insufficient optimization events.',
            suggestion: 'Increase ad set budget to speed up learning.',
            actionLabel: 'Boost Budget +20%',
            ...base,
          });
          continue;
        }

        if (ad.metrics.qualityRanking >= 3 && ad.metrics.spend >= 20) {
          issues.push({
            id: `quality-${ad.id}`,
            kind: 'low_quality',
            severity: 'warning',
            reason: 'Low quality ranking',
            details: `Quality score: ${ad.metrics.qualityRanking}`,
            suggestion: 'Refresh creative/copy and tighten audience-message match.',
            actionLabel: ad.status === 'ACTIVE' ? 'Pause Ad' : 'Enable Ad',
            ...base,
          });
        }
      }
    }
  }

  return issues;
}

function getMetaManagerUrl(issue: AdIssue): string {
  const base = 'https://www.facebook.com/adsmanager/manage/campaigns';
  if (issue.level === 'ad' && issue.adId) {
    return `${base}?selected_ad_ids=${encodeURIComponent(issue.adId)}`;
  }
  if (issue.level === 'adset' && issue.adSetId) {
    return `${base}?selected_adset_ids=${encodeURIComponent(issue.adSetId)}`;
  }
  if (issue.campaignId) {
    return `${base}?selected_campaign_ids=${encodeURIComponent(issue.campaignId)}`;
  }
  return base;
}

export function AdsIssuesPanel({
  campaigns,
  onCampaignStatusChange,
  onAdSetStatusChange,
  onAdStatusChange,
  onAdSetBudgetChange,
  onNavigateIssue,
  prefetchedIssues = [],
  issuesLoading = false,
  focusedIssueId = null,
}: AdsIssuesPanelProps) {
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [showOnlyActiveCampaigns, setShowOnlyActiveCampaigns] = useState(false);
  const [showRecent12hOnly, setShowRecent12hOnly] = useState(false);

  const localIssues = useMemo(() => extractIssues(campaigns), [campaigns]);
  const issues = useMemo(() => {
    const merged = [...prefetchedIssues, ...localIssues];
    const deduped = Array.from(new Map(merged.map((i) => [issueKey(i), i])).values());
    return deduped.sort((a, b) => (a.severity === b.severity ? a.reason.localeCompare(b.reason) : a.severity === 'critical' ? -1 : 1));
  }, [prefetchedIssues, localIssues]);

  const visibleIssues = useMemo(() => {
    const now = Date.now();
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    return issues.filter((i) => {
      if (showOnlyActiveCampaigns && i.campaignStatus !== 'ACTIVE') return false;
      if (!showRecent12hOnly) return true;
      const issueTs = i.lastUpdatedAt ? Date.parse(i.lastUpdatedAt) : NaN;
      return Number.isFinite(issueTs) && now - issueTs <= twelveHoursMs;
    });
  }, [issues, showOnlyActiveCampaigns, showRecent12hOnly]);

  useEffect(() => {
    if (!focusedIssueId) return;
    const target = issues.find((i) => i.id === focusedIssueId);
    if (!target) return;
    if (target.campaignStatus !== 'ACTIVE') setShowOnlyActiveCampaigns(false);
    if (target.lastUpdatedAt) {
      const ts = Date.parse(target.lastUpdatedAt);
      const now = Date.now();
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      if (!Number.isFinite(ts) || now - ts > twelveHoursMs) setShowRecent12hOnly(false);
    } else {
      setShowRecent12hOnly(false);
    }
  }, [focusedIssueId, issues]);

  useEffect(() => {
    if (!focusedIssueId) return;
    const row = document.getElementById(`issue-row-${focusedIssueId}`);
    if (!row) return;
    window.setTimeout(() => {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, [focusedIssueId, visibleIssues]);

  const adSetById = useMemo(() => {
    const map = new Map<string, { dailyBudget: number }>();
    for (const campaign of campaigns) {
      for (const adSet of campaign.adSets || []) {
        map.set(adSet.id, { dailyBudget: adSet.dailyBudget || 0 });
      }
    }
    return map;
  }, [campaigns]);

  const totals = useMemo(() => {
    let critical = 0;
    let warning = 0;
    let recent12h = 0;
    const now = Date.now();
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    for (const issue of visibleIssues) {
      if (issue.severity === 'critical') critical++;
      else warning++;
      const issueTs = issue.lastUpdatedAt ? Date.parse(issue.lastUpdatedAt) : NaN;
      if (Number.isFinite(issueTs) && now - issueTs <= twelveHoursMs) recent12h++;
    }
    return { critical, warning, recent12h };
  }, [visibleIssues]);

  const handleFix = async (issue: AdIssue) => {
    setWorkingId(issue.id);
    try {
      if (issue.kind === 'learning_limited') {
        const adSet = adSetById.get(issue.adSetId);
        const current = adSet?.dailyBudget || 0;
        const nextBudget = Math.max(1, Math.round(current * 1.2 * 100) / 100);
        await onAdSetBudgetChange(issue.adSetId, nextBudget);
      } else {
        const nextStatus: EntityStatus = issue.actionLabel.startsWith('Pause') ? 'PAUSED' : 'ACTIVE';
        if (issue.level === 'campaign') {
          await onCampaignStatusChange(issue.campaignId, nextStatus);
        } else if (issue.level === 'adset') {
          await onAdSetStatusChange(issue.adSetId, nextStatus);
        } else if (issue.adId) {
          await onAdStatusChange(issue.adId, nextStatus);
        }
      }
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <section id="ads-errors-center" className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
          <h2 className="text-sm font-semibold text-text-primary">Ads Error Center</h2>
          {issuesLoading && <span className="text-xs text-text-muted">Scanning...</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOnlyActiveCampaigns((v) => !v)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              showOnlyActiveCampaigns
                ? 'bg-primary/20 text-primary-light'
                : 'bg-surface text-text-secondary hover:bg-surface-hover'
            )}
          >
            {showOnlyActiveCampaigns ? 'Showing: Active Campaigns' : 'Showing: All Campaigns'}
          </button>
          <button
            onClick={() => setShowRecent12hOnly((v) => !v)}
            className={cn(
              'rounded-md px-2 py-1 text-xs font-medium transition-colors',
              showRecent12hOnly
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-surface text-text-secondary hover:bg-surface-hover'
            )}
          >
            {showRecent12hOnly ? 'Window: Last 12h' : 'Window: Any time'}
          </button>
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-300">
            {totals.recent12h} in last 12h
          </span>
          {totals.critical > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300">
              {totals.critical} critical
            </span>
          )}
          {totals.warning > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
              {totals.warning} warning
            </span>
          )}
        </div>
      </div>

      {visibleIssues.length === 0 ? (
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-sm font-medium text-emerald-300">No matching issues found.</p>
          <p className="mt-1 text-xs text-text-muted">
            Try toggling campaign/date windows or wait for scan completion.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full min-w-[980px] text-xs">
            <thead className="border-b border-border bg-surface-hover text-text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Level</th>
                <th className="px-3 py-2 text-left">Entity</th>
                <th className="px-3 py-2 text-left">Campaign</th>
                <th className="px-3 py-2 text-left">Entity Status</th>
                <th className="px-3 py-2 text-left">Campaign Status</th>
                <th className="px-3 py-2 text-left">Issue</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th className="px-3 py-2 text-left">Details</th>
                <th className="px-3 py-2 text-left">Suggested Fix</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleIssues.slice(0, 100).map((issue) => (
                <tr
                  key={issue.id}
                  id={`issue-row-${issue.id}`}
                  className={cn(
                    'border-b border-border/60 align-top',
                    focusedIssueId === issue.id && 'bg-amber-500/10'
                  )}
                >
                  <td className="px-3 py-2">
                    <span className={cn(
                      'rounded px-1.5 py-0.5 font-medium uppercase',
                      issue.level === 'campaign'
                        ? 'bg-blue-500/15 text-blue-300'
                        : issue.level === 'adset'
                        ? 'bg-purple-500/15 text-purple-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                    )}>
                      {issue.level}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-primary">
                    {issue.level === 'campaign'
                      ? issue.campaignName
                      : issue.level === 'adset'
                      ? issue.adSetName
                      : issue.adName}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{issue.campaignName}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'rounded px-1.5 py-0.5 font-medium',
                      issue.entityStatus === 'ACTIVE'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-surface-hover text-text-muted'
                    )}>
                      {issue.entityStatus || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      'rounded px-1.5 py-0.5 font-medium',
                      issue.campaignStatus === 'ACTIVE'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-surface-hover text-text-muted'
                    )}>
                      {issue.campaignStatus || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 text-text-primary">
                      {issue.severity === 'critical' && <AlertTriangle className="h-3.5 w-3.5 text-red-300" />}
                      {issue.reason}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-muted">
                    {issue.lastUpdatedAt ? new Date(issue.lastUpdatedAt).toLocaleString() : '-'}
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-text-muted" title={issue.details}>
                    {issue.details || '-'}
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-text-muted" title={issue.suggestion}>
                    {issue.suggestion}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onNavigateIssue?.(issue)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      >
                        <ArrowRightCircle className="h-3 w-3" />
                        Go to
                      </button>
                      <a
                        href={getMetaManagerUrl(issue)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Meta
                      </a>
                      <button
                        onClick={() => handleFix(issue)}
                        disabled={workingId === issue.id}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary-light hover:bg-primary/20 disabled:opacity-60"
                      >
                        {issue.kind === 'learning_limited' ? <Sparkles className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                        {workingId === issue.id ? 'Applying...' : issue.actionLabel}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
