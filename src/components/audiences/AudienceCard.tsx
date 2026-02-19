'use client';

import { Users, Rocket, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Audience } from '@/data/mockAudiences';

const typeBadgeColors = {
  Saved: 'bg-blue-100 text-blue-700',
  Lookalike: 'bg-purple-100 text-purple-700',
  Custom: 'bg-amber-100 text-amber-700',
};

interface AudienceCardProps {
  audience: Audience;
  onToggleStatus: (id: string) => void;
  onLaunch: (id: string) => void;
}

export function AudienceCard({ audience, onToggleStatus, onLaunch }: AudienceCardProps) {
  const isActive = audience.status === 'Active';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
            <Users className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {audience.name}
            </h3>
            <span
              className={cn(
                'inline-block rounded-full px-2 py-0.5 text-[10px] font-medium',
                typeBadgeColors[audience.type]
              )}
            >
              {audience.type}
            </span>
          </div>
        </div>
        <button
          onClick={() => onToggleStatus(audience.id)}
          title={isActive ? 'Deactivate' : 'Activate'}
        >
          {isActive ? (
            <ToggleRight className="h-6 w-6 text-green-500" />
          ) : (
            <ToggleLeft className="h-6 w-6 text-gray-400" />
          )}
        </button>
      </div>

      <div className="mb-3 space-y-1.5 text-xs text-gray-500">
        <div className="flex justify-between">
          <span>Estimated Size</span>
          <span className="font-medium text-gray-900">
            {audience.size >= 1000000
              ? `${(audience.size / 1000000).toFixed(1)}M`
              : `${(audience.size / 1000).toFixed(0)}K`}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Source</span>
          <span className="font-medium text-gray-700">{audience.source}</span>
        </div>
        <div className="flex justify-between">
          <span>Status</span>
          <span
            className={cn(
              'font-medium',
              isActive ? 'text-green-600' : 'text-gray-400'
            )}
          >
            {audience.status}
          </span>
        </div>
      </div>

      <button
        onClick={() => onLaunch(audience.id)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
      >
        <Rocket className="h-3.5 w-3.5" />
        Launch to Campaign
      </button>
    </div>
  );
}
