'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Sparkles,
  Link2,
  EyeOff,
  PlusCircle,
  DollarSign,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductProfile } from '@/types/creativeHub';
import type { UnmappedCampaign } from '@/stores/creativeHubStore';

interface UnmappedCampaignCardProps {
  campaign: UnmappedCampaign;
  profiles: ProductProfile[];
  onMapToProfile: (campaignId: string, profileId: string) => void;
  onIgnore: (campaignId: string) => void;
  onCreateNewProfile: (campaign: UnmappedCampaign) => void;
}

export function UnmappedCampaignCard({
  campaign,
  profiles,
  onMapToProfile,
  onIgnore,
  onCreateNewProfile,
}: UnmappedCampaignCardProps) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Placeholder AI suggestion
  const aiSuggestion = profiles.length > 0
    ? {
        profileName: profiles[0].productName,
        profileId: profiles[0].id,
        confidence: 78,
      }
    : null;

  return (
    <div className="rounded-xl border border-border bg-amber-50/30 shadow-sm border-l-4 border-l-amber-400 p-5 transition-all duration-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Campaign info */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-text-primary truncate">
                {campaign.campaignName}
              </h4>
              <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                <span>Account: {campaign.adAccountId}</span>
                {campaign.spend !== undefined && (
                  <span className="inline-flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {campaign.spend.toFixed(2)}/day
                  </span>
                )}
                {campaign.status && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-medium',
                      campaign.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {campaign.status}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* AI suggestion */}
          {aiSuggestion && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/60 border border-amber-200/60 px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-text-secondary">
                <span className="font-medium text-text-primary">AI suggests:</span> Map to{' '}
                <span className="font-semibold text-amber-700">{aiSuggestion.profileName}</span>
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  {aiSuggestion.confidence}% match
                </span>
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {/* Map to profile dropdown */}
            <div className="relative">
              <div className="flex items-center">
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="appearance-none rounded-l-lg border border-border bg-white px-3 py-1.5 pr-7 text-xs font-medium text-text-primary focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Select product...</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.productName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-[calc(100%-1.75rem)] top-1/2 -translate-y-1/2 h-3 w-3 text-text-dimmed" />
                <button
                  disabled={!selectedProfileId}
                  onClick={() => {
                    if (selectedProfileId) {
                      onMapToProfile(campaign.campaignId, selectedProfileId);
                    }
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-r-lg border border-l-0 border-border px-3 py-1.5 text-xs font-medium transition-colors',
                    selectedProfileId
                      ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                      : 'bg-gray-100 text-text-dimmed cursor-not-allowed'
                  )}
                >
                  <Link2 className="h-3 w-3" />
                  Map
                </button>
              </div>
            </div>

            <button
              onClick={() => onIgnore(campaign.campaignId)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary bg-white hover:bg-surface-hover transition-colors"
            >
              <EyeOff className="h-3 w-3" />
              Ignore
            </button>

            <button
              onClick={() => onCreateNewProfile(campaign)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-blue-600 bg-white hover:bg-blue-50 transition-colors"
            >
              <PlusCircle className="h-3 w-3" />
              Create New Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
