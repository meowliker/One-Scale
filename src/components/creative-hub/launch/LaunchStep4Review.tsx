'use client';

import { useMemo } from 'react';
import {
  Image as ImageIcon,
  FolderOpen,
  Layers,
  FileText,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { HealthCheckPanel } from './HealthCheckPanel';
import type {
  HealthCheck,
  InboxCreative,
  LaunchConfig,
  PreLaunchReport,
} from '@/types/creativeHub';

export function LaunchStep4Review() {
  const { launchConfig, updateLaunchConfig, profiles, inboxCreatives, selectedCreativeIds } =
    useCreativeHubStore();

  const selectedProfile = profiles.find((p) => p.id === launchConfig.productProfileId);
  const selectedCreatives = useMemo(
    () => resolveReviewCreatives(launchConfig, inboxCreatives, selectedCreativeIds),
    [inboxCreatives, launchConfig, selectedCreativeIds],
  );
  const plannedAdSets = useMemo(
    () => buildReviewAdSets(launchConfig, selectedCreatives),
    [launchConfig, selectedCreatives],
  );
  const launchStatus = launchConfig.launchStatus || 'ACTIVE';

  const primaryTexts = useMemo(() => launchConfig.primaryTexts || [], [launchConfig.primaryTexts]);
  const headlines = useMemo(() => launchConfig.headlines || [], [launchConfig.headlines]);
  const descriptions = useMemo(() => launchConfig.descriptions || [], [launchConfig.descriptions]);
  const backendReport = launchConfig.healthCheckReport as PreLaunchReport | undefined;

  // Build health check report
  const report = useMemo<PreLaunchReport>(() => {
    if (backendReport?.checks?.length) {
      return backendReport;
    }

    const checks: HealthCheck[] = [];

    // Product profile
    checks.push(
      selectedProfile
        ? { check: 'Product Profile', status: 'ok', message: selectedProfile.productName }
        : { check: 'Product Profile', status: 'fail', message: 'No product profile selected' }
    );

    // Creatives
    checks.push(
      selectedCreatives.length > 0
        ? {
            check: 'Creatives',
            status: 'ok',
            message: `${selectedCreatives.length} creative${selectedCreatives.length !== 1 ? 's' : ''} selected`,
          }
        : { check: 'Creatives', status: 'fail', message: 'No creatives selected' }
    );

    // Upload status
    const notReady = selectedCreatives.filter((c) => c.uploadStatus !== 'ready');
    if (notReady.length > 0) {
      checks.push({
        check: 'Asset Uploads',
        status: 'warn',
        message: `${notReady.length} creative${notReady.length !== 1 ? 's' : ''} not yet uploaded to Meta`,
        details: 'Upload will be attempted during launch. This may cause delays.',
      });
    } else if (selectedCreatives.length > 0) {
      checks.push({ check: 'Asset Uploads', status: 'ok', message: 'All creatives uploaded to Meta' });
    }

    // Ad copy
    checks.push(
      primaryTexts.length > 0
        ? { check: 'Primary Text', status: 'ok', message: `${primaryTexts.length} primary text${primaryTexts.length !== 1 ? 's' : ''}` }
        : { check: 'Primary Text', status: 'warn', message: 'No primary text added. Default text will be used.' }
    );

    checks.push(
      headlines.length > 0
        ? { check: 'Headlines', status: 'ok', message: `${headlines.length} headline${headlines.length !== 1 ? 's' : ''}` }
        : { check: 'Headlines', status: 'warn', message: 'No headlines added.' }
    );

    // Budget
    const budget = launchConfig.dailyBudget;
    if (budget && budget > 0) {
      checks.push({
        check: 'Budget',
        status: budget < 5 ? 'warn' : 'ok',
        message: `$${budget}/day`,
        ...(budget < 5 ? { details: 'Very low budget may limit delivery and test accuracy.' } : {}),
      });
    } else {
      checks.push({ check: 'Budget', status: 'fail', message: 'No budget set' });
    }

    // Campaign
    if (launchConfig.campaignMode === 'existing' && launchConfig.existingCampaignId) {
      checks.push({ check: 'Campaign', status: 'ok', message: 'Using existing campaign' });
    } else if (launchConfig.campaignMode === 'new') {
      checks.push({
        check: 'Campaign',
        status: launchConfig.newCampaignName ? 'ok' : 'fail',
        message: launchConfig.newCampaignName || 'Campaign name is required before launch',
      });
    } else {
      checks.push({ check: 'Campaign', status: 'fail', message: 'No campaign selected' });
    }

    // Destination URL
    checks.push(
      launchConfig.destinationUrl
        ? { check: 'Destination URL', status: 'ok', message: launchConfig.destinationUrl }
        : { check: 'Destination URL', status: 'warn', message: 'No URL set. Will use product profile default.' }
    );

    const failures = checks.filter((c) => c.status === 'fail').length;
    const warnings = checks.filter((c) => c.status === 'warn').length;

    return {
      checks,
      canLaunch: failures === 0,
      failures,
      warnings,
    };
  }, [backendReport, selectedProfile, selectedCreatives, primaryTexts, headlines, launchConfig]);

  // Build "What will be created" tree
  const previewAdSets = plannedAdSets.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Health Check Panel */}
      <HealthCheckPanel report={report} />

      {/* Two-column summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Campaign details */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Campaign Details</h3>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <DetailRow label="Product" value={selectedProfile?.productName || 'Not selected'} />
            <DetailRow
              label="Campaign Mode"
              value={launchConfig.campaignMode === 'existing' ? 'Existing Campaign' : 'New Campaign'}
            />
            <DetailRow label="Structure" value={launchConfig.structure || 'CBO'} />
            <DetailRow
              label="Budget"
              value={`$${launchConfig.dailyBudget ?? 0}/day`}
            />
            <DetailRow
              label="Duration"
              value={`${launchConfig.testDuration ?? 3} days`}
            />
            <DetailRow
              label="Bid Strategy"
              value={formatBidStrategy(launchConfig.bidStrategy || 'LOWEST_COST_WITHOUT_CAP')}
            />
            {launchConfig.bidAmount != null && (
              <DetailRow label="Bid/CPA Cap" value={`$${launchConfig.bidAmount}`} />
            )}
            {launchConfig.roasFloor != null && (
              <DetailRow label="Min ROAS" value={`${launchConfig.roasFloor}x`} />
            )}
            <DetailRow
              label="Launch Time"
              value={
                launchConfig.launchTime === 'scheduled'
                  ? `${launchConfig.scheduledDate || 'Select date'} at ${launchConfig.scheduledTime || '09:00'}`
                  : 'Immediately'
              }
            />
            <DetailRow label="CTA" value={launchConfig.ctaType || 'SHOP_NOW'} />
            <DetailRow
              label="Advantage+ Creative"
              value={launchConfig.advantageCreative !== false ? 'Enabled' : 'Disabled'}
            />
          </div>
        </div>

        {/* Right: What will be created tree */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">What Will Be Created</h3>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="space-y-2">
              {/* Campaign node */}
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold text-slate-900">
                  {launchConfig.campaignMode === 'new'
                    ? (launchConfig.newCampaignName || 'New Campaign')
                    : 'Existing Campaign'}
                </span>
              </div>

              {/* Ad set nodes */}
              <div className="ml-4 space-y-1.5 border-l-2 border-slate-200 pl-4">
                {previewAdSets.map((adSet, idx) => (
                  <div key={adSet.id}>
                    <div className="flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-xs text-slate-700">
                        {adSet.name || `Ad Set ${idx + 1}`}
                      </span>
                    </div>
                    {/* Ad nodes */}
                    <div className="ml-4 mt-1 space-y-1 border-l border-slate-200 pl-3">
                      {adSet.creatives.slice(0, 3).map((creative) => (
                        <div key={creative.id} className="flex items-center gap-2">
                          <ImageIcon className="h-3 w-3 text-slate-400" />
                          <span className="truncate text-[10px] text-slate-500">
                            {creative.creativeName}
                          </span>
                        </div>
                      ))}
                      {adSet.creatives.length > 3 && (
                        <span className="text-[10px] text-slate-400">
                          +{adSet.creatives.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {plannedAdSets.length > 5 && (
                  <span className="text-[10px] text-slate-400">
                    +{plannedAdSets.length - 5} more ad sets
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Ad Copy Summary */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Ad Copy Summary</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CopySummaryColumn title="Primary Texts" items={primaryTexts.map((t) => t.text)} color="blue" />
          <CopySummaryColumn title="Headlines" items={headlines.map((h) => h.text)} color="amber" />
          <CopySummaryColumn title="Descriptions" items={descriptions.map((d) => d.text)} color="emerald" />
        </div>
      </div>

      {/* Creative Preview Grid */}
      {selectedCreatives.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Creatives ({selectedCreatives.length})
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {selectedCreatives.map((creative) => (
              <div
                key={creative.id}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              >
                <div className="aspect-square">
                  {creative.thumbnailUrl ? (
                    <img
                      src={creative.thumbnailUrl}
                      alt={creative.creativeName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-slate-400" />
                    </div>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-2 pt-6">
                  <p className="truncate text-[10px] font-medium text-white">
                    {creative.creativeName}
                  </p>
                  <span className="rounded bg-black/30 px-1 py-0.5 text-[9px] text-white/80">
                    {creative.creativeFormat}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warning banners */}
      {report.warnings > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-800">
            There {report.warnings === 1 ? 'is' : 'are'}{' '}
            <span className="font-semibold">{report.warnings}</span> warning
            {report.warnings !== 1 ? 's' : ''}. Review above for details. You can still launch.
          </p>
        </div>
      )}

      {!report.canLaunch && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
          <p className="text-xs text-red-800">
            <span className="font-semibold">{report.failures}</span> required check
            {report.failures !== 1 ? 's' : ''} failed. Fix the issues above before launching.
          </p>
        </div>
      )}

      {/* Launch Status Toggle */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Launch Status</label>
        <div className="flex gap-0">
          <button
            type="button"
            onClick={() => updateLaunchConfig({ launchStatus: 'ACTIVE' })}
            className={cn(
              'rounded-l-lg border px-5 py-2.5 text-sm font-medium transition-colors',
              launchStatus === 'ACTIVE'
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            )}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => updateLaunchConfig({ launchStatus: 'PAUSED' })}
            className={cn(
              'rounded-r-lg border border-l-0 px-5 py-2.5 text-sm font-medium transition-colors',
              launchStatus === 'PAUSED'
                ? 'border-amber-600 bg-amber-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            )}
          >
            Paused
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {launchStatus === 'ACTIVE'
            ? 'Ads will start delivering immediately after creation.'
            : 'Ads will be created in paused mode. Enable them manually when ready.'}
        </p>
      </div>

      {/* Notice banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
        <div className="text-xs text-blue-800">
          <p className="font-medium">
            {launchConfig.launchTime === 'scheduled' ? 'Ready to schedule?' : 'Ready to launch?'}
          </p>
          <p className="mt-0.5">
            {launchConfig.launchTime === 'scheduled'
              ? 'Click "Schedule Test" below to save this launch for later execution at the selected date and time.'
              : 'Click "Launch Test on Meta" below to create all campaigns, ad sets, and ads on your Meta ad account.'}
            {launchConfig.mirrorAccounts?.some((a) => a.selected) && (
              <> This will also mirror to {launchConfig.mirrorAccounts.filter((a) => a.selected).length} additional account(s).</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-800">{value}</span>
    </div>
  );
}

function CopySummaryColumn({
  title,
  items,
  color,
}: {
  title: string;
  items: string[];
  color: 'blue' | 'amber' | 'emerald';
}) {
  const badge = {
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs font-semibold text-slate-900">{title}</span>
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', badge[color])}>
          {items.length}
        </span>
      </div>
      {items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((text, idx) => (
            <p key={idx} className="line-clamp-2 text-[10px] text-slate-600">
              {idx + 1}. {text}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400">None added</p>
      )}
    </div>
  );
}

function formatBidStrategy(strategy: string): string {
  const labels: Record<string, string> = {
    LOWEST_COST_WITHOUT_CAP: 'Lowest Cost',
    COST_CAP: 'Cost Cap',
    LOWEST_COST_WITH_BID_CAP: 'Bid Cap',
    LOWEST_COST_WITH_MIN_ROAS: 'Minimum ROAS',
  };
  return labels[strategy] || strategy;
}

function resolveReviewCreatives(
  launchConfig: Partial<LaunchConfig>,
  inboxCreatives: InboxCreative[],
  selectedCreativeIds: Set<string>,
): InboxCreative[] {
  if (launchConfig.selectedCreativeSnapshots?.length) {
    return launchConfig.selectedCreativeSnapshots;
  }

  if (launchConfig.selectedCreativeIds?.length) {
    const lookup = new Map(inboxCreatives.map((creative) => [creative.id, creative]));
    return launchConfig.selectedCreativeIds
      .map((creativeId) => lookup.get(creativeId))
      .filter((creative): creative is InboxCreative => Boolean(creative));
  }

  return inboxCreatives.filter((creative) => selectedCreativeIds.has(creative.id));
}

function buildReviewAdSets(
  launchConfig: Partial<LaunchConfig>,
  selectedCreatives: InboxCreative[],
): Array<{ id: string; name: string; creatives: InboxCreative[] }> {
  const creativeLookup = new Map(selectedCreatives.map((creative) => [creative.id, creative]));

  if (launchConfig.batches?.length) {
    return launchConfig.batches
      .map((batch) => ({
        id: batch.id,
        name: batch.name,
        creatives: batch.creativeIds
          .map((creativeId) => creativeLookup.get(creativeId))
          .filter((creative): creative is InboxCreative => Boolean(creative)),
      }))
      .filter((batch) => batch.creatives.length > 0);
  }

  if (launchConfig.adsetMode === 'existing_adsets' && launchConfig.existingAdsetAssignments) {
    return Object.entries(launchConfig.existingAdsetAssignments)
      .map(([adsetId, creativeIds]) => ({
        id: adsetId,
        name: adsetId,
        creatives: creativeIds
          .map((creativeId) => creativeLookup.get(creativeId))
          .filter((creative): creative is InboxCreative => Boolean(creative)),
      }))
      .filter((adSet) => adSet.creatives.length > 0);
  }

  if (selectedCreatives.length === 0) {
    return [];
  }

  if (launchConfig.adsetDistribution === 'all_to_one') {
    return [{ id: 'adset-1', name: 'Ad Set 1', creatives: selectedCreatives }];
  }

  const chunkSize =
    launchConfig.adsetDistribution === 'one_per_adset'
      ? 1
      : Math.max(launchConfig.creativesPerBatch ?? 1, 1);

  if (chunkSize <= 1) {
    return selectedCreatives.map((creative, index) => ({
      id: `adset-${index + 1}`,
      name: `Ad Set ${index + 1}`,
      creatives: [creative],
    }));
  }

  const adSets: Array<{ id: string; name: string; creatives: InboxCreative[] }> = [];
  for (let index = 0; index < selectedCreatives.length; index += chunkSize) {
    const creatives = selectedCreatives.slice(index, index + chunkSize);
    adSets.push({
      id: `adset-${adSets.length + 1}`,
      name: `Ad Set ${adSets.length + 1}`,
      creatives,
    });
  }

  return adSets;
}
