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
        <h2 className="text-lg font-semibold text-slate-900">Choose your campaign objective</h2>
        <p className="mt-1 text-sm text-slate-600">
          Select the goal that best describes what you want to achieve with this campaign.
        </p>
        {winner && (
          <div className="mt-3 inline-flex rounded-xl border border-blue-200 bg-blue-50/80 px-1 py-1">
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
                  ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-lg shadow-blue-100/80'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
              )}
            >
              <div className={cn(
                'absolute inset-x-0 top-0 h-1 rounded-t-2xl transition-opacity',
                isSelected ? 'bg-gradient-to-r from-blue-500 to-cyan-400 opacity-100' : 'opacity-0'
              )} />
              <div
                className={cn(
                  'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
                  isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h3
                  className={cn(
                    'text-sm font-semibold',
                    isSelected ? 'text-blue-900' : 'text-slate-900'
                  )}
                >
                  {opt.title}
                </h3>
                <p
                  className={cn(
                    'text-xs mt-0.5',
                    isSelected ? 'text-blue-700' : 'text-slate-500'
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
