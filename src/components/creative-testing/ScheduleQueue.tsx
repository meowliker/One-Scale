'use client';

import { Image, Video, LayoutGrid, Calendar, DollarSign, Clock, XCircle, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import type { ScheduledCreative, ScheduleStatus } from '@/types/creativeSchedule';

interface ScheduleQueueProps {
  creatives: ScheduledCreative[];
  onCancel: (id: string) => void;
  onLaunchNow: (id: string) => void;
}

const statusConfig: Record<ScheduleStatus, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  queued: { label: 'Queued', variant: 'default' },
  scheduled: { label: 'Scheduled', variant: 'info' },
  active: { label: 'Active', variant: 'success' },
  completed: { label: 'Completed', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
};

const typeIcons: Record<string, typeof Image> = {
  image: Image,
  video: Video,
  carousel: LayoutGrid,
};

export function ScheduleQueue({ creatives, onCancel, onLaunchNow }: ScheduleQueueProps) {
  if (creatives.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <Calendar className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-sm text-gray-500">No scheduled creatives yet</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {creatives.map((creative) => {
        const TypeIcon = typeIcons[creative.creativeType] || Image;
        const status = statusConfig[creative.status];
        const isActionable = creative.status === 'queued' || creative.status === 'scheduled';

        return (
          <div
            key={creative.id}
            className={cn(
              'rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md',
              creative.status === 'cancelled' && 'opacity-60'
            )}
          >
            {/* Thumbnail placeholder */}
            <div className="relative flex h-36 items-center justify-center rounded-t-lg bg-gradient-to-br from-gray-100 to-gray-200">
              <TypeIcon className="h-10 w-10 text-gray-400" />
              <div className="absolute right-2 top-2">
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
            </div>

            {/* Details */}
            <div className="p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 truncate">{creative.name}</h3>
                <p className="text-xs text-gray-500 truncate">{creative.creativeName}</p>
              </div>

              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  <span>Launch: {new Date(creative.launchDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-gray-400" />
                  <span>{formatCurrency(creative.dailyBudget)}/day</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-gray-400" />
                  <span>{creative.testDuration} day test</span>
                </div>
              </div>

              <p className="text-xs text-gray-500 truncate">
                Campaign: {creative.targetCampaignName}
              </p>

              {/* Actions */}
              {isActionable && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => onLaunchNow(creative.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    <Play className="h-3 w-3" />
                    Launch Now
                  </button>
                  <button
                    onClick={() => onCancel(creative.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <XCircle className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
