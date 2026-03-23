'use client';

import { useState } from 'react';
import {
  Package,
  Globe,
  Facebook,
  Instagram,
  Activity,
  FlaskConical,
  TrendingUp,
  RefreshCw,
  Pencil,
  BookOpen,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Building2,
  LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import type { ProductProfile, ProductCampaignLink, CampaignLinkType } from '@/types/creativeHub';

interface ProductProfileCardProps {
  profile: ProductProfile;
  linkedCampaigns: ProductCampaignLink[];
  creativeCount?: number;
  onEdit: (profile: ProductProfile) => void;
  onViewCopyLibrary: (profileId: string) => void;
}

const campaignTypeBadge: Record<CampaignLinkType, { label: string; className: string; Icon: typeof FlaskConical }> = {
  testing: {
    label: 'Testing',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
    Icon: FlaskConical,
  },
  scaling: {
    label: 'Scaling',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    Icon: TrendingUp,
  },
  retargeting: {
    label: 'Retarget',
    className: 'bg-purple-50 text-purple-700 border border-purple-200',
    Icon: RefreshCw,
  },
};

/** Collect unique non-empty values from campaign links for a given key */
function collectUnique<K extends keyof ProductCampaignLink>(
  links: ProductCampaignLink[],
  idKey: K,
  nameKey: K
): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const link of links) {
    const id = link[idKey] as string | undefined;
    const name = link[nameKey] as string | undefined;
    if (id && !seen.has(id)) {
      seen.set(id, name || id);
    }
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}

function formatAggregated(
  items: { id: string; name: string }[],
  pluralLabel: string
): { display: string; tooltip?: string } {
  if (items.length === 0) return { display: 'Not set' };
  if (items.length === 1) return { display: items[0].name };
  return {
    display: `${items.length} ${pluralLabel}`,
    tooltip: items.map((i) => i.name).join(', '),
  };
}

export function ProductProfileCard({
  profile,
  linkedCampaigns,
  creativeCount,
  onEdit,
  onViewCopyLibrary,
}: ProductProfileCardProps) {
  const [campaignsExpanded, setCampaignsExpanded] = useState(true);
  const { stores, activeStoreId } = useStoreStore();
  const activeStore = stores.find(s => s.id === activeStoreId);
  const adAccountName = activeStore?.adAccounts?.find(
    a => a.id === profile.adAccountId || a.accountId === profile.adAccountId
  )?.name;

  // Aggregate metadata from campaign links, fall back to profile-level data
  const pages = collectUnique(linkedCampaigns, 'pageId', 'pageName');
  const pixels = collectUnique(linkedCampaigns, 'pixelId', 'pixelName');
  const instagrams = collectUnique(linkedCampaigns, 'instagramActorId', 'instagramUsername');
  const bms = collectUnique(linkedCampaigns, 'bmId', 'bmName');

  // Fall back to profile-level names, then IDs
  const pageDisplay = pages.length > 0
    ? formatAggregated(pages, 'pages')
    : { display: profile.pageName || profile.pageId || 'Not set' };

  const pixelDisplay = pixels.length > 0
    ? formatAggregated(pixels, 'pixels')
    : { display: profile.pixelName || profile.pixelId || 'Not set' };

  // Only show IG items that have a real username (not raw numeric IDs)
  const igItems = instagrams.length > 0
    ? instagrams
        .filter((i) => i.name && !/^\d+$/.test(i.name)) // skip raw numeric IDs
        .map((i) => ({ ...i, name: i.name.startsWith('@') ? i.name : `@${i.name}` }))
    : profile.instagramUsername
      ? [{ id: profile.instagramActorId || '', name: `@${profile.instagramUsername}` }]
      : [];
  const igDisplay = igItems.length > 0
    ? formatAggregated(igItems, 'accounts')
    : { display: 'Not set' };

  const bmDisplay = bms.length > 0
    ? formatAggregated(bms, 'BMs')
    : { display: 'Not set' };

  const clickupDisplay = profile.clickupListName || 'Not mapped';

  const isConfigured = linkedCampaigns?.some(c => c.pageId || c.pixelId) || !!profile.pageId;

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface-elevated shadow-sm p-6 transition-all duration-200 hover:shadow-md',
        isConfigured
          ? 'border-border hover:border-blue-200 border-l-4 border-l-blue-500'
          : 'border-border hover:border-amber-200 border-l-4 border-l-amber-400'
      )}
    >
      {/* Header: image + name + badges */}
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 flex-shrink-0 rounded-lg bg-surface-hover flex items-center justify-center overflow-hidden">
          {profile.productImage ? (
            <img
              src={profile.productImage}
              alt={profile.productName}
              className="h-full w-full object-cover"
            />
          ) : (
            <Package className="h-7 w-7 text-text-dimmed" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-base font-semibold text-text-primary truncate">
              {profile.productName}
            </h3>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0',
                isConfigured
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              )}
            >
              {isConfigured ? 'Configured' : 'Not configured'}
            </span>
            {creativeCount != null && creativeCount > 0 && (
              <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-xs font-medium ml-2">
                {creativeCount} creative{creativeCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {profile.averageOrderValue && (
            <p className="text-xs text-text-secondary mt-0.5">
              AOV: ${profile.averageOrderValue.toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* Key info grid */}
      <div className="border-t border-border mt-4 pt-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
          <InfoRow
            icon={<DollarSign className="h-3.5 w-3.5" />}
            label="Ad Account"
            value={
              adAccountName
                ? `${adAccountName} (${profile.adAccountCurrency})`
                : profile.adAccountId
                  ? `${profile.adAccountId} (${profile.adAccountCurrency})`
                  : 'Not set'
            }
            tooltip={profile.adAccountId}
            muted={!profile.adAccountId}
          />
          <InfoRow
            icon={<Facebook className="h-3.5 w-3.5" />}
            label="Page"
            value={pageDisplay.display}
            tooltip={pageDisplay.tooltip}
            muted={pageDisplay.display === 'Not set'}
          />
          <InfoRow
            icon={<Instagram className="h-3.5 w-3.5" />}
            label="Instagram"
            value={igDisplay.display}
            tooltip={igDisplay.tooltip}
            muted={igDisplay.display === 'Not set'}
          />
          <InfoRow
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Pixel"
            value={pixelDisplay.display}
            tooltip={pixelDisplay.tooltip}
            muted={pixelDisplay.display === 'Not set'}
          />
          <InfoRow
            icon={<Building2 className="h-3.5 w-3.5" />}
            label="BM"
            value={bmDisplay.display}
            tooltip={bmDisplay.tooltip}
            muted={bmDisplay.display === 'Not set'}
          />
          <InfoRow
            icon={<LayoutGrid className="h-3.5 w-3.5" />}
            label="ClickUp"
            value={clickupDisplay}
            muted={clickupDisplay === 'Not mapped'}
          />
          <InfoRow
            icon={<Globe className="h-3.5 w-3.5" />}
            label="URL"
            value={profile.destinationUrl || 'Not set'}
            muted={!profile.destinationUrl}
            truncate
            colSpan2
          />
        </div>
      </div>

      {/* Linked campaigns */}
      {linkedCampaigns.length > 0 && (
        <div className="border-t border-border mt-4 pt-4">
          <button
            onClick={() => setCampaignsExpanded(!campaignsExpanded)}
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors w-full"
          >
            {campaignsExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {linkedCampaigns.length} linked campaign{linkedCampaigns.length !== 1 ? 's' : ''}
          </button>

          {campaignsExpanded && (
            <div className="mt-2.5 space-y-2">
              {linkedCampaigns.map((link) => {
                const badge = campaignTypeBadge[link.campaignType];
                return (
                  <div
                    key={link.id}
                    className="flex items-center gap-2 text-sm rounded-lg bg-surface-hover/50 px-3 py-2"
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0',
                        badge.className
                      )}
                    >
                      <badge.Icon className="h-3 w-3" />
                      {badge.label}
                    </span>
                    <span className="text-text-primary truncate flex-1">{link.campaignName}</span>
                    {!link.isActive && (
                      <span className="text-xs text-text-dimmed">Paused</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Test defaults summary */}
      <div className="border-t border-border mt-4 pt-4">
        <p className="text-xs text-text-secondary">
          <span className="font-medium text-text-primary">Defaults:</span>{' '}
          {profile.defaultStructure} &middot; ${profile.defaultBudget}/day &middot;{' '}
          {profile.defaultDuration}d &middot;{' '}
          {profile.defaultBidStrategy.replace(/_/g, ' ').toLowerCase()}
        </p>
      </div>

      {/* Footer actions */}
      <div className="border-t border-border mt-4 pt-4 flex items-center gap-3">
        <button
          onClick={() => onEdit(profile)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-text-primary bg-surface-elevated hover:bg-surface-hover transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit Profile
        </button>
        <button
          onClick={() => onViewCopyLibrary(profile.id)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <BookOpen className="h-3.5 w-3.5" />
          View Copy Library
        </button>
        {profile.destinationUrl && (
          <a
            href={profile.destinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-text-dimmed hover:text-text-secondary transition-colors"
            title="Open product URL"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  tooltip,
  muted = false,
  truncate = false,
  colSpan2 = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tooltip?: string;
  muted?: boolean;
  truncate?: boolean;
  colSpan2?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2 min-w-0', colSpan2 && 'col-span-2')}>
      <span className="text-text-dimmed flex-shrink-0">{icon}</span>
      <span className="text-text-secondary flex-shrink-0">{label}:</span>
      <span
        className={cn(
          'font-medium',
          muted ? 'text-text-dimmed italic' : 'text-text-primary',
          truncate && 'truncate'
        )}
        title={tooltip}
      >
        {value}
      </span>
    </div>
  );
}
