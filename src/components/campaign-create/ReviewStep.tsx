'use client';

import { Target, Users, DollarSign, Palette } from 'lucide-react';
import { useCampaignCreateStore } from '@/stores/campaignCreateStore';
import { formatCurrency } from '@/lib/utils';
import type { CampaignObjective, BidStrategy, CTAType } from '@/types/campaign';
import { WinnerChip } from './WinnerChip';

function objectiveLabel(objective: CampaignObjective | null): string {
  const map: Record<CampaignObjective, string> = {
    CONVERSIONS: 'Conversions',
    TRAFFIC: 'Traffic',
    LEAD_GENERATION: 'Lead Generation',
    BRAND_AWARENESS: 'Brand Awareness',
    ENGAGEMENT: 'Engagement',
    VIDEO_VIEWS: 'Video Views',
    REACH: 'Reach',
    APP_INSTALLS: 'App Installs',
  };
  return objective ? map[objective] : 'Not selected';
}

function bidStrategyLabel(strategy: BidStrategy): string {
  const map: Record<BidStrategy, string> = {
    LOWEST_COST: 'Lowest Cost',
    COST_CAP: 'Cost Cap',
    BID_CAP: 'Bid Cap',
    MINIMUM_ROAS: 'Minimum ROAS',
  };
  return map[strategy];
}

function ctaLabel(cta: CTAType): string {
  const map: Record<CTAType, string> = {
    SHOP_NOW: 'Shop Now',
    LEARN_MORE: 'Learn More',
    SIGN_UP: 'Sign Up',
    BOOK_NOW: 'Book Now',
    CONTACT_US: 'Contact Us',
    DOWNLOAD: 'Download',
    GET_OFFER: 'Get Offer',
  };
  return map[cta];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildFinalDestinationUrl(baseUrl: string, urlTags: string): string {
  const base = baseUrl.trim();
  const tags = urlTags.trim();
  if (!base) return '';
  if (!tags) return base;
  return base.includes('?') ? `${base}&${tags}` : `${base}?${tags}`;
}

interface SectionProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}

function Section({ icon: Icon, title, children }: SectionProps) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <Icon className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string | React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right max-w-[60%]">{value}</span>
    </div>
  );
}

export function ReviewStep() {
  const {
    objective,
    targeting,
    budget,
    schedule,
    creative,
    winnerChips,
    publishSettings,
    setPublishSettings,
    uploadedAsset,
  } = useCampaignCreateStore();
  const finalUrl = buildFinalDestinationUrl(publishSettings.destinationUrl, publishSettings.urlTags);
  const chips = Object.values(winnerChips).filter((chip): chip is NonNullable<typeof chip> => !!chip);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Review your campaign</h2>
        <p className="text-sm text-gray-500 mt-1">
          Double-check all your settings before launching.
        </p>
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <WinnerChip key={chip.key} title={chip.title} value={chip.value} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Campaign Objective */}
        <Section icon={Target} title="Campaign Objective">
          <DetailRow label="Objective" value={objectiveLabel(objective)} />
        </Section>

        {/* Targeting */}
        <Section icon={Users} title="Targeting">
          <DetailRow label="Age Range" value={`${targeting.ageMin} - ${targeting.ageMax}`} />
          <DetailRow
            label="Gender"
            value={targeting.genders.map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(', ')}
          />
          <DetailRow
            label="Locations"
            value={
              targeting.locations.length > 0 ? (
                <div className="flex flex-wrap gap-1 justify-end">
                  {targeting.locations.map((loc) => (
                    <span
                      key={loc}
                      className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full"
                    >
                      {loc}
                    </span>
                  ))}
                </div>
              ) : (
                'None'
              )
            }
          />
          <DetailRow
            label="Interests"
            value={
              targeting.interests.length > 0 ? (
                <div className="flex flex-wrap gap-1 justify-end">
                  {targeting.interests.map((interest) => (
                    <span
                      key={interest}
                      className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              ) : (
                'None'
              )
            }
          />
        </Section>

        {/* Budget & Schedule */}
        <Section icon={DollarSign} title="Budget & Schedule">
          <DetailRow
            label="Budget Type"
            value={budget.type.charAt(0).toUpperCase() + budget.type.slice(1)}
          />
          <DetailRow
            label={budget.type === 'daily' ? 'Daily Budget' : 'Lifetime Budget'}
            value={formatCurrency(budget.amount)}
          />
          <DetailRow label="Bid Strategy" value={bidStrategyLabel(budget.bidStrategy)} />
          {budget.bidAmount !== null && (
            <DetailRow label="Bid Amount" value={formatCurrency(budget.bidAmount)} />
          )}
          <DetailRow label="Start Date" value={formatDate(schedule.startDate)} />
          <DetailRow
            label="End Date"
            value={schedule.endDate ? formatDate(schedule.endDate) : 'No End Date'}
          />
        </Section>

        {/* Creative */}
        <Section icon={Palette} title="Creative">
          <DetailRow
            label="Type"
            value={creative.type.charAt(0).toUpperCase() + creative.type.slice(1)}
          />
          <DetailRow label="Headline" value={creative.headline || 'Not set'} />
          <DetailRow label="Body Text" value={creative.body || 'Not set'} />
          <DetailRow label="Description" value={creative.description || 'Not set'} />
          <DetailRow label="Call to Action" value={ctaLabel(creative.ctaType)} />
          <DetailRow label="Uploaded Asset" value={uploadedAsset?.fileName || 'Not uploaded'} />
          <DetailRow label="Campaign Name" value={publishSettings.campaignName || 'Not set'} />
          <DetailRow label="Ad Set Name" value={publishSettings.adSetName || 'Not set'} />
          <DetailRow label="Ad Name" value={publishSettings.adName || 'Not set'} />
          <DetailRow label="Destination URL" value={publishSettings.destinationUrl || 'Not set'} />
          <DetailRow label="URL Tags / UTM" value={publishSettings.urlTags || 'Not set'} />
          <DetailRow label="Final URL" value={finalUrl || 'Not set'} />
          <DetailRow label="Facebook Page ID" value={publishSettings.pageId || 'Not set'} />
          <DetailRow label="Pixel ID" value={publishSettings.pixelId || 'Not set'} />
          <DetailRow label="Conversion Event" value={publishSettings.conversionEvent || 'Not set'} />
        </Section>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={publishSettings.publishNow}
            onChange={(e) => setPublishSettings({ publishNow: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-medium text-gray-800">
            Publish immediately after creation
          </span>
        </label>
        <p className="mt-2 text-xs text-gray-500">
          Recommended: keep this off to create in paused mode, verify delivery, then publish manually.
        </p>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-sm text-green-800 font-medium">
          {publishSettings.publishNow
            ? 'Your campaign will be created and immediately activated.'
            : 'Your campaign will be created in paused mode so you can publish after final checks.'}
        </p>
      </div>
    </div>
  );
}
