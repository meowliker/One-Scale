'use client';

import { useMemo } from 'react';
import { Check, Target, DollarSign, Users, Rocket, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClickUpCreativeSet } from '@/types/creativeLaunch';

interface CampaignConfig {
  mode: 'existing' | 'new';
  campaignId: string;
  campaignName: string;
  adsetMode: 'existing' | 'new' | 'isolated';
  adsetId: string;
  adsetName: string;
  destinationUrl: string;
}

interface TargetingConfig {
  ageMin: number;
  ageMax: number;
  genders: number[];
  locations: string[];
  interests: Array<{ id: string; name: string }>;
}

interface BudgetConfig {
  budgetType: 'daily' | 'lifetime';
  dailyBudget: number;
  lifetimeBudget: number;
  bidStrategy: string;
  startDate: string;
  endDate: string;
  noEndDate: boolean;
}

interface CreativeConfig {
  primaryText: string;
  headline: string;
  description: string;
  ctaType: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  dailyBudget: number | null;
  spend30d: number;
  roas30d: number;
}

interface LaunchReviewStepProps {
  selectedCreatives: ClickUpCreativeSet[];
  campaignConfig: CampaignConfig;
  targetingConfig: TargetingConfig;
  budgetConfig: BudgetConfig;
  creativeConfig: CreativeConfig;
  campaigns: Campaign[];
  launchAsPaused?: boolean;
  onLaunchAsPausedChange?: (value: boolean) => void;
}

const BID_STRATEGY_LABELS: Record<string, string> = {
  'LOWEST_COST_WITHOUT_CAP': 'Lowest Cost',
  'LOWEST_COST_WITH_BID_CAP': 'Bid Cap',
  'COST_CAP': 'Cost Cap',
  'LOWEST_COST_WITH_MIN_ROAS': 'Minimum ROAS',
};

const CTA_LABELS: Record<string, string> = {
  'SHOP_NOW': 'Shop Now',
  'LEARN_MORE': 'Learn More',
  'SIGN_UP': 'Sign Up',
  'BUY_NOW': 'Buy Now',
  'GET_OFFER': 'Get Offer',
  'ORDER_NOW': 'Order Now',
  'BOOK_NOW': 'Book Now',
  'CONTACT_US': 'Contact Us',
};

export function LaunchReviewStep({
  selectedCreatives,
  campaignConfig,
  targetingConfig,
  budgetConfig,
  creativeConfig,
  campaigns,
  launchAsPaused = false,
  onLaunchAsPausedChange,
}: LaunchReviewStepProps) {
  const selectedCampaign = campaigns.find(c => c.id === campaignConfig.campaignId);

  // Calculate summary stats
  const stats = useMemo(() => {
    const totalCreatives = selectedCreatives.length;
    const totalAdSets = campaignConfig.adsetMode === 'isolated' ? totalCreatives : 1;
    const totalBudget = budgetConfig.budgetType === 'daily'
      ? budgetConfig.dailyBudget * 7 // Estimate 7 days
      : budgetConfig.lifetimeBudget;
    
    return { totalCreatives, totalAdSets, totalBudget };
  }, [selectedCreatives, campaignConfig, budgetConfig]);

  // Validation warnings
  const warnings = useMemo(() => {
    const w: string[] = [];
    if (!creativeConfig.primaryText) w.push('No primary text set');
    if (!creativeConfig.headline) w.push('No headline set');
    if (targetingConfig.locations.length === 0) w.push('No locations selected');
    return w;
  }, [creativeConfig, targetingConfig]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Review & Launch</h2>
        <p className="mt-1 text-sm text-slate-600">
          Review your configuration before launching to Meta Ads.
        </p>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Please review before launching</p>
              <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{stats.totalCreatives}</p>
          <p className="text-xs text-slate-600 mt-1">Creatives</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-purple-50 to-pink-50 p-4 text-center">
          <p className="text-3xl font-bold text-purple-600">{stats.totalAdSets}</p>
          <p className="text-xs text-slate-600 mt-1">Ad Sets</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 text-center">
          <p className="text-3xl font-bold text-emerald-600">${stats.totalBudget}</p>
          <p className="text-xs text-slate-600 mt-1">Est. Spend</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-4">
          {/* Campaign Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-5 w-5 text-blue-500" />
              <h3 className="text-sm font-medium text-slate-700">Campaign</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Type</span>
                <span className="text-slate-900 font-medium">
                  {campaignConfig.mode === 'existing' ? 'Existing Campaign' : 'New Campaign'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Campaign</span>
                <span className="text-slate-900 font-medium truncate max-w-[200px]">
                  {campaignConfig.mode === 'existing'
                    ? selectedCampaign?.name || 'Not selected'
                    : campaignConfig.campaignName || 'Not named'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Ad Set Mode</span>
                <span className="text-slate-900 font-medium capitalize">{campaignConfig.adsetMode}</span>
              </div>
            </div>
          </div>

          {/* Targeting Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-purple-500" />
              <h3 className="text-sm font-medium text-slate-700">Targeting</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Age Range</span>
                <span className="text-slate-900 font-medium">
                  {targetingConfig.ageMin} - {targetingConfig.ageMax}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Gender</span>
                <span className="text-slate-900 font-medium">
                  {targetingConfig.genders.length === 0
                    ? 'All'
                    : targetingConfig.genders.map(g => g === 1 ? 'Male' : 'Female').join(', ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Locations</span>
                <span className="text-slate-900 font-medium">
                  {targetingConfig.locations.join(', ') || 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Interests</span>
                <span className="text-slate-900 font-medium">
                  {targetingConfig.interests.length > 0
                    ? `${targetingConfig.interests.length} selected`
                    : 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Budget Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              <h3 className="text-sm font-medium text-slate-700">Budget & Schedule</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Budget Type</span>
                <span className="text-slate-900 font-medium capitalize">{budgetConfig.budgetType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount</span>
                <span className="text-slate-900 font-medium">
                  ${budgetConfig.budgetType === 'daily' ? budgetConfig.dailyBudget : budgetConfig.lifetimeBudget}
                  {budgetConfig.budgetType === 'daily' ? '/day' : ' total'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bid Strategy</span>
                <span className="text-slate-900 font-medium">
                  {BID_STRATEGY_LABELS[budgetConfig.bidStrategy] || budgetConfig.bidStrategy}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Start Date</span>
                <span className="text-slate-900 font-medium">{budgetConfig.startDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">End Date</span>
                <span className="text-slate-900 font-medium">
                  {budgetConfig.noEndDate ? 'No end date' : budgetConfig.endDate || 'Not set'}
                </span>
              </div>
            </div>
          </div>

          {/* Creative Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="h-5 w-5 text-orange-500" />
              <h3 className="text-sm font-medium text-slate-700">Creative</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Type</span>
                <span className="text-slate-900 font-medium capitalize">{creativeConfig.mediaType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CTA</span>
                <span className="text-slate-900 font-medium">
                  {CTA_LABELS[creativeConfig.ctaType] || creativeConfig.ctaType}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Primary Text</span>
                <p className="text-slate-900 text-xs line-clamp-2 bg-slate-50 rounded p-2">
                  {creativeConfig.primaryText || 'Not set'}
                </p>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Headline</span>
                <p className="text-slate-900 text-xs bg-slate-50 rounded p-2">
                  {creativeConfig.headline || 'Not set'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Creatives Preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">
          Selected Creatives ({selectedCreatives.length})
        </h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {selectedCreatives.slice(0, 8).map(creative => (
            <div
              key={creative.id}
              className="flex-shrink-0 w-24 rounded-lg border border-slate-200 overflow-hidden"
            >
              <div className="aspect-square bg-slate-100">
                {creative.thumbnailUrl ? (
                  <img
                    src={creative.thumbnailUrl}
                    alt={creative.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-slate-400 text-xs">
                    No preview
                  </div>
                )}
              </div>
              <div className="p-1.5">
                <p className="text-xs text-slate-700 truncate">{creative.name}</p>
              </div>
            </div>
          ))}
          {selectedCreatives.length > 8 && (
            <div className="flex-shrink-0 w-24 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
              <span className="text-sm text-slate-500">+{selectedCreatives.length - 8} more</span>
            </div>
          )}
        </div>
      </div>

      {/* Launch as Paused Option */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={launchAsPaused}
            onChange={(e) => onLaunchAsPausedChange?.(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <p className="text-sm font-medium text-slate-700">Launch as Paused</p>
            <p className="text-xs text-slate-500">
              Create the campaign but keep it paused. You can review and activate it later in Meta Ads Manager.
            </p>
          </div>
        </label>
      </div>

      {/* Launch Notice */}
      <div className={cn(
        "rounded-xl border p-4",
        launchAsPaused 
          ? "border-blue-200 bg-blue-50" 
          : "border-emerald-200 bg-emerald-50"
      )}>
        <div className="flex items-start gap-3">
          <Check className={cn(
            "h-5 w-5 flex-shrink-0 mt-0.5",
            launchAsPaused ? "text-blue-500" : "text-emerald-500"
          )} />
          <div>
            <p className={cn(
              "text-sm font-medium",
              launchAsPaused ? "text-blue-800" : "text-emerald-800"
            )}>
              {launchAsPaused ? "Ready to create (paused)" : "Ready to launch"}
            </p>
            <p className={cn(
              "text-xs mt-0.5",
              launchAsPaused ? "text-blue-600" : "text-emerald-600"
            )}>
              {launchAsPaused 
                ? "Click 'Launch as Paused' to create your campaign in paused state."
                : "Click 'Launch to Meta' to create your campaign and start running ads."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
