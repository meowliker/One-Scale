'use client';

import { type ReactNode, useEffect, useMemo } from 'react';
import {
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Flag,
  Layers3,
  Target,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type { CreativeBatch, ProductCampaignLink } from '@/types/creativeHub';

interface LaunchConfigPanelProps {
  batches: CreativeBatch[];
  productProfileId?: string;
}

function isCboCampaign(campaign?: ProductCampaignLink): boolean {
  return Boolean(
    campaign &&
      ((campaign.campaignDailyBudget ?? 0) > 0 || (campaign.campaignLifetimeBudget ?? 0) > 0),
  );
}

function formatCurrency(value?: number): string {
  return `$${Number.isFinite(value) ? Number(value).toFixed(0) : '0'}`;
}

export function LaunchConfigPanel({ batches, productProfileId }: LaunchConfigPanelProps) {
  const profiles = useCreativeHubStore((state) => state.profiles);
  const launchConfig = useCreativeHubStore((state) => state.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((state) => state.updateLaunchConfig);

  const selectedProfile = useMemo(() => {
    const pid = productProfileId ?? launchConfig.productProfileId;
    return profiles.find((profile) => profile.id === pid);
  }, [launchConfig.productProfileId, productProfileId, profiles]);

  const campaignOptions = useMemo(
    () => (selectedProfile?.campaignLinks || []).filter((campaign) => campaign.isActive || campaign.effectiveStatus),
    [selectedProfile],
  );

  const existingCampaign = useMemo(
    () =>
      campaignOptions.find((campaign) => campaign.campaignId === launchConfig.existingCampaignId) ||
      campaignOptions[0],
    [campaignOptions, launchConfig.existingCampaignId],
  );

  const resolvedStructure =
    launchConfig.campaignMode === 'existing' && isCboCampaign(existingCampaign)
      ? 'CBO'
      : launchConfig.structure || selectedProfile?.defaultStructure || 'ABO';

  const budgetLocked =
    launchConfig.campaignMode === 'existing' &&
    resolvedStructure === 'CBO' &&
    Number.isFinite(existingCampaign?.campaignDailyBudget);

  const budgetValue =
    budgetLocked && existingCampaign?.campaignDailyBudget
      ? existingCampaign.campaignDailyBudget
      : launchConfig.dailyBudget ?? selectedProfile?.defaultBudget ?? 20;

  const totalAds = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.creativeIds.length, 0),
    [batches],
  );

  useEffect(() => {
    const patch: Record<string, unknown> = {};

    if (!launchConfig.productProfileId && selectedProfile?.id) {
      patch.productProfileId = selectedProfile.id;
    }

    if (launchConfig.campaignMode === 'existing' && existingCampaign) {
      if (launchConfig.existingCampaignId !== existingCampaign.campaignId) {
        patch.existingCampaignId = existingCampaign.campaignId;
      }
      if (launchConfig.pageId !== existingCampaign.pageId && existingCampaign.pageId) {
        patch.pageId = existingCampaign.pageId;
      }
      if (
        launchConfig.instagramActorId !== existingCampaign.instagramActorId &&
        existingCampaign.instagramActorId
      ) {
        patch.instagramActorId = existingCampaign.instagramActorId;
      }
      if (launchConfig.pixelId !== existingCampaign.pixelId && existingCampaign.pixelId) {
        patch.pixelId = existingCampaign.pixelId;
      }
      if (resolvedStructure !== launchConfig.structure) {
        patch.structure = resolvedStructure;
      }
      if (budgetLocked && budgetValue !== launchConfig.dailyBudget) {
        patch.dailyBudget = budgetValue;
      }
    }

    if (Object.keys(patch).length > 0) {
      updateLaunchConfig(patch);
    }
  }, [
    budgetLocked,
    budgetValue,
    existingCampaign,
    launchConfig.campaignMode,
    launchConfig.dailyBudget,
    launchConfig.existingCampaignId,
    launchConfig.instagramActorId,
    launchConfig.pageId,
    launchConfig.pixelId,
    launchConfig.productProfileId,
    launchConfig.structure,
    resolvedStructure,
    selectedProfile,
    updateLaunchConfig,
  ]);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Campaign Setup
          </p>
          <h4 className="mt-1 text-lg font-semibold text-slate-950">
            Keep destination and Meta mapping easy to scan
          </h4>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {resolvedStructure} • {launchConfig.campaignMode === 'existing' ? 'Existing draft' : 'New draft'}
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <div className="space-y-3">
          <FieldLabel label="Campaign destination" />
          <div className="grid grid-cols-2 gap-2">
            <SegmentButton
              active={(launchConfig.campaignMode || 'existing') === 'existing'}
              onClick={() => updateLaunchConfig({ campaignMode: 'existing' })}
              label="Existing campaign"
            />
            <SegmentButton
              active={launchConfig.campaignMode === 'new'}
              onClick={() => updateLaunchConfig({ campaignMode: 'new' })}
              label="New campaign"
            />
          </div>
          {launchConfig.campaignMode === 'existing' ? (
            <select
              value={existingCampaign?.campaignId || ''}
              onChange={(event) => updateLaunchConfig({ existingCampaignId: event.target.value })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
            >
              {campaignOptions.length === 0 ? (
                <option value="">No linked campaigns found</option>
              ) : (
                campaignOptions.map((campaign) => (
                  <option key={campaign.campaignId} value={campaign.campaignId}>
                    {campaign.campaignName}
                  </option>
                ))
              )}
            </select>
          ) : (
            <input
              value={launchConfig.newCampaignName || ''}
              onChange={(event) => updateLaunchConfig({ newCampaignName: event.target.value })}
              placeholder="Name the new campaign"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white"
            />
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <FieldLabel label="Structure" />
            <div className="grid grid-cols-2 gap-2">
              <SegmentButton
                active={resolvedStructure === 'ABO'}
                disabled={launchConfig.campaignMode === 'existing' && isCboCampaign(existingCampaign)}
                onClick={() => updateLaunchConfig({ structure: 'ABO' })}
                label="ABO"
              />
              <SegmentButton
                active={resolvedStructure === 'CBO'}
                onClick={() => updateLaunchConfig({ structure: 'CBO' })}
                label="CBO"
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {resolvedStructure === 'ABO'
                ? 'Budget is set per ad set, which keeps test lanes independently readable.'
                : budgetLocked
                  ? 'This existing CBO already has a campaign budget, so the amount is inherited and locked.'
                  : 'Budget is set at campaign level for this CBO draft.'}
            </div>
          </div>

          <div className="space-y-3">
            <FieldLabel label="Ad set path" />
            <div className="grid grid-cols-2 gap-2">
              <SegmentButton
                active={(launchConfig.adsetMode || 'new_adsets') === 'new_adsets'}
                onClick={() => updateLaunchConfig({ adsetMode: 'new_adsets' })}
                label="New ad sets"
              />
              <SegmentButton
                active={launchConfig.adsetMode === 'existing_adsets'}
                onClick={() => updateLaunchConfig({ adsetMode: 'existing_adsets' })}
                label="Existing ad sets"
              />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {launchConfig.adsetMode === 'existing_adsets'
                ? 'Reuse current ad sets when you already know the shell you want to place creatives into.'
                : `${batches.length || 0} ad set lane${batches.length === 1 ? '' : 's'} will be created from this quick launch.`}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup
            icon={CircleDollarSign}
            label={resolvedStructure === 'CBO' ? 'Campaign budget' : 'Daily / ad set'}
          >
            <input
              type="number"
              min={1}
              value={budgetValue}
              disabled={budgetLocked}
              onChange={(event) =>
                updateLaunchConfig({ dailyBudget: Number(event.target.value) || 0 })
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            />
          </FieldGroup>

          <FieldGroup icon={Clock3} label="Duration (days)">
            <input
              type="number"
              min={1}
              max={30}
              value={launchConfig.testDuration ?? selectedProfile?.defaultDuration ?? 3}
              onChange={(event) =>
                updateLaunchConfig({ testDuration: Number(event.target.value) || 1 })
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white"
            />
          </FieldGroup>

          <FieldGroup icon={Target} label="Bid strategy">
            <select
              value={launchConfig.bidStrategy || selectedProfile?.defaultBidStrategy || 'LOWEST_COST_WITHOUT_CAP'}
              onChange={(event) => updateLaunchConfig({ bidStrategy: event.target.value as typeof launchConfig.bidStrategy })}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
            >
              <option value="LOWEST_COST_WITHOUT_CAP">Lowest cost</option>
              <option value="LOWEST_COST">Lowest cost (legacy)</option>
              <option value="COST_CAP">Cost cap</option>
              <option value="LOWEST_COST_WITH_BID_CAP">Lowest cost with bid cap</option>
              <option value="BID_CAP">Bid cap</option>
              <option value="LOWEST_COST_WITH_MIN_ROAS">Minimum ROAS</option>
              <option value="MINIMUM_ROAS">Minimum ROAS (legacy)</option>
            </select>
          </FieldGroup>

          <FieldGroup icon={Flag} label="Launch as">
            <select
              value={launchConfig.launchStatus || selectedProfile?.defaultLaunchStatus || 'PAUSED'}
              onChange={(event) =>
                updateLaunchConfig({ launchStatus: event.target.value as 'ACTIVE' | 'PAUSED' })
              }
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white"
            >
              <option value="PAUSED">Paused</option>
              <option value="ACTIVE">Active</option>
            </select>
          </FieldGroup>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-slate-500" />
            <p className="text-sm font-semibold text-slate-900">Live mapping snapshot</p>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600">
            <MappingRow label="Ad account" value={launchConfig.adAccountId || selectedProfile?.adAccountId || 'Not set'} />
            <MappingRow label="Page" value={selectedProfile?.pageName || launchConfig.pageId || 'Not set'} />
            <MappingRow
              label="Instagram"
              value={selectedProfile?.instagramUsername || launchConfig.instagramActorId || 'Not set'}
            />
            <MappingRow label="Pixel" value={selectedProfile?.pixelName || launchConfig.pixelId || 'Not set'} />
            <MappingRow
              label="Destination"
              value={launchConfig.destinationUrl || selectedProfile?.destinationUrl || 'Not set'}
              compact
            />
          </div>
          <div className="mt-4">
            <input
              value={launchConfig.destinationUrl || selectedProfile?.destinationUrl || ''}
              onChange={(event) => updateLaunchConfig({ destinationUrl: event.target.value })}
              placeholder="Destination URL"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400"
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-slate-950 px-4 py-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                Launch summary
              </p>
              <p className="mt-1 text-lg font-semibold">
                {batches.length || 0} ad sets • {totalAds || 0} ads
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
              {formatCurrency(budgetValue)}{resolvedStructure === 'CBO' ? '/campaign' : '/lane'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-300">
            <SummaryTag label="PT" value={launchConfig.primaryTexts?.length || 0} />
            <SummaryTag label="Headlines" value={launchConfig.headlines?.length || 0} />
            <SummaryTag label="Descriptions" value={launchConfig.descriptions?.length || 0} />
            <SummaryTag label="Duration" value={launchConfig.testDuration ?? selectedProfile?.defaultDuration ?? 3} suffix="d" />
          </div>
          {launchConfig.campaignMode === 'existing' && existingCampaign ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
              <ExternalLink className="h-3.5 w-3.5" />
              Existing destination: {existingCampaign.campaignName}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function FieldLabel({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
      {label}
    </p>
  );
}

function SegmentButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-2xl border px-4 py-3 text-sm font-semibold transition',
        active
          ? 'border-blue-500 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {label}
    </button>
  );
}

function FieldGroup({
  children,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  icon: typeof CircleDollarSign;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <label className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      {children}
    </div>
  );
}

function MappingRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/60 bg-white px-3 py-2.5">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</span>
      <span className={cn('text-right font-medium text-slate-700', compact && 'max-w-[70%] truncate')}>
        {value}
      </span>
    </div>
  );
}

function SummaryTag({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-white">
        {value}
        {suffix || ''}
      </p>
    </div>
  );
}
