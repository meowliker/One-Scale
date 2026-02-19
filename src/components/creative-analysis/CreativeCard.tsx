'use client';

import { ImageIcon, Video } from 'lucide-react';
import type { Creative } from '@/types/creative';
import { cn, formatCurrency, formatPercentage, formatRoas } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';

interface CreativeCardProps {
  creative: Creative;
}

function getFatigueColor(score: number): string {
  if (score <= 30) return 'bg-green-500';
  if (score <= 60) return 'bg-yellow-500';
  if (score <= 80) return 'bg-orange-500';
  return 'bg-red-500';
}

function getFatigueTextColor(score: number): string {
  if (score <= 30) return 'text-green-700';
  if (score <= 60) return 'text-yellow-700';
  if (score <= 80) return 'text-orange-700';
  return 'text-red-700';
}

export function CreativeCard({ creative }: CreativeCardProps) {
  const TypeIcon = creative.type === 'Image' ? ImageIcon : Video;
  const iconBg =
    creative.type === 'Image'
      ? 'bg-blue-50 text-blue-500'
      : 'bg-purple-50 text-purple-500';

  return (
    <div className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-gray-300">
      {/* Thumbnail placeholder */}
      <div
        className={cn(
          'flex h-32 w-full items-center justify-center rounded-lg mb-4',
          creative.type === 'Image' ? 'bg-blue-50' : 'bg-purple-50'
        )}
      >
        <TypeIcon
          className={cn(
            'h-10 w-10',
            creative.type === 'Image' ? 'text-blue-400' : 'text-purple-400'
          )}
        />
      </div>

      {/* Name and status */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
          {creative.name}
        </h3>
        <StatusBadge status={creative.status} />
      </div>

      {/* Type badge */}
      <div className="mb-3">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            iconBg
          )}
        >
          <TypeIcon className="h-3 w-3" />
          {creative.type}
        </span>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Spend</p>
          <p className="text-sm font-semibold text-gray-900">{formatCurrency(creative.spend)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">ROAS</p>
          <p className="text-sm font-semibold text-gray-900">{formatRoas(creative.roas)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">CTR</p>
          <p className="text-sm font-semibold text-gray-900">{formatPercentage(creative.ctr)}</p>
        </div>
      </div>

      {/* Fatigue bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
            Fatigue
          </span>
          <span
            className={cn('text-xs font-semibold', getFatigueTextColor(creative.fatigueScore))}
          >
            {creative.fatigueScore}%
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              getFatigueColor(creative.fatigueScore)
            )}
            style={{ width: `${creative.fatigueScore}%` }}
          />
        </div>
      </div>
    </div>
  );
}
