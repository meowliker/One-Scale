'use client';

import { ShoppingCart, MousePointer, UserPlus, Eye, Heart, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCampaignCreateStore } from '@/stores/campaignCreateStore';
import type { CampaignObjective } from '@/types/campaign';
import { WinnerChip } from './WinnerChip';

interface ObjectiveOption {
  value: CampaignObjective;
  title: string;
  description: string;
  icon: React.ElementType;
}

const OBJECTIVES: ObjectiveOption[] = [
  {
    value: 'CONVERSIONS',
    title: 'Conversions',
    description: 'Drive valuable actions on your website',
    icon: ShoppingCart,
  },
  {
    value: 'TRAFFIC',
    title: 'Traffic',
    description: 'Send people to your website',
    icon: MousePointer,
  },
  {
    value: 'LEAD_GENERATION',
    title: 'Lead Generation',
    description: 'Collect leads for your business',
    icon: UserPlus,
  },
  {
    value: 'BRAND_AWARENESS',
    title: 'Brand Awareness',
    description: 'Increase awareness of your brand',
    icon: Eye,
  },
  {
    value: 'ENGAGEMENT',
    title: 'Engagement',
    description: 'Get more page likes, comments, and shares',
    icon: Heart,
  },
  {
    value: 'VIDEO_VIEWS',
    title: 'Video Views',
    description: 'Get more people to watch your video content',
    icon: Play,
  },
];

export function ObjectiveStep() {
  const { objective, setObjective, winnerChips } = useCampaignCreateStore();
  const winner = winnerChips.objective;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Choose your campaign objective</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Select the goal that best describes what you want to achieve with this campaign.
        </p>
        {winner && (
          <div className="mt-3 inline-flex rounded-xl border border-blue-300/40 bg-blue-500/10 px-1 py-1">
            <WinnerChip title={winner.title} value={winner.value} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {OBJECTIVES.map((opt) => {
          const isSelected = objective === opt.value;
          const Icon = opt.icon;

          return (
            <button
              key={opt.value}
              onClick={() => setObjective(opt.value)}
              className={cn(
                'group relative flex items-start gap-4 rounded-2xl border p-5 text-left transition-all',
                isSelected
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-surface hover:border-border-focus/40 hover:bg-surface-hover'
              )}
            >
              <div className={cn(
                'absolute inset-x-0 top-0 h-1 rounded-t-2xl transition-opacity',
                isSelected ? 'bg-primary opacity-100' : 'opacity-0'
              )} />
              <div
                className={cn(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
                  isSelected ? 'bg-primary/15 text-primary' : 'bg-surface-hover text-text-muted'
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h3
                  className={cn(
                    'text-sm font-semibold',
                    isSelected ? 'text-text-primary' : 'text-text-primary'
                  )}
                >
                  {opt.title}
                </h3>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isSelected ? 'text-text-secondary' : 'text-text-muted'
                  )}
                >
                  {opt.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
