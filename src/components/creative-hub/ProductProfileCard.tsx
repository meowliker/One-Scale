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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductProfile, ProductCampaignLink, CampaignLinkType } from '@/types/creativeHub';

interface ProductProfileCardProps {
  profile: ProductProfile;
  linkedCampaigns: ProductCampaignLink[];
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

function isConfigured(profile: ProductProfile): boolean {
  return !!(
    profile.adAccountId &&
    profile.pageId &&
    profile.pixelId &&
    profile.conversionEvent &&
    profile.destinationUrl
  );
}

export function ProductProfileCard({
  profile,
  linkedCampaigns,
  onEdit,
  onViewCopyLibrary,
}: ProductProfileCardProps) {
  const [campaignsExpanded, setCampaignsExpanded] = useState(true);
  const configured = isConfigured(profile);

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface-elevated shadow-sm p-6 transition-all duration-200 hover:shadow-md',
        configured
          ? 'border-border hover:border-blue-200 border-l-4 border-l-blue-500'
          : 'border-border hover:border-amber-200 border-l-4 border-l-amber-400'
      )}
    >
      {/* Header: image + name + badge */}
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
                configured
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              )}
            >
              {configured ? 'Configured' : 'Not configured'}
            </span>
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
              profile.adAccountId
                ? `${profile.adAccountId} (${profile.adAccountCurrency})`
                : 'Not set'
            }
            muted={!profile.adAccountId}
          />
          <InfoRow
            icon={<Facebook className="h-3.5 w-3.5" />}
            label="Page"
            value={profile.pageId || 'Not set'}
            muted={!profile.pageId}
          />
          <InfoRow
            icon={<Instagram className="h-3.5 w-3.5" />}
            label="Instagram"
            value={profile.instagramActorId || 'Not set'}
            muted={!profile.instagramActorId}
          />
          <InfoRow
            icon={<Activity className="h-3.5 w-3.5" />}
            label="Pixel"
            value={profile.pixelId || 'Not set'}
            muted={!profile.pixelId}
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
  muted = false,
  truncate = false,
  colSpan2 = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
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
      >
        {value}
      </span>
    </div>
  );
}
