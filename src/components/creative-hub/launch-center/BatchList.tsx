'use client';

import { useMemo } from 'react';
import { X, Image, Film, Images, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreativeBatch, InboxCreative, CreativeFormat } from '@/types/creativeHub';

interface BatchListProps {
  batches: CreativeBatch[];
  creatives: InboxCreative[];
  onRemoveBatch: (batchId: string) => void;
  onRemoveCreative: (batchId: string, creativeId: string) => void;
}

const FORMAT_ICON: Record<CreativeFormat, typeof Image> = {
  image: Image,
  video: Film,
  carousel: Images,
};

const FORMAT_COLOR: Record<CreativeFormat, string> = {
  image: 'border-blue-500/40 bg-blue-500/10',
  video: 'border-purple-500/40 bg-purple-500/10',
  carousel: 'border-green-500/40 bg-green-500/10',
};

export function BatchList({ batches, creatives, onRemoveBatch, onRemoveCreative }: BatchListProps) {
  const creativesMap = useMemo(() => {
    const map = new Map<string, InboxCreative>();
    creatives.forEach((c) => map.set(c.id, c));
    return map;
  }, [creatives]);

  const totalAds = useMemo(() => batches.reduce((sum, b) => sum + b.creativeIds.length, 0), [batches]);

  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500">
        <Layers className="w-8 h-8 mb-2" />
        <p className="text-sm">No batches created yet. Use Quick Actions above.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {batches.map((batch) => (
        <div
          key={batch.id}
          className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50"
        >
          {/* Batch label */}
          <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap min-w-[80px]">
            {batch.name}
          </span>

          {/* Creative pills */}
          <div className="flex items-center gap-1.5 flex-1 overflow-x-auto py-1">
            {batch.creativeIds.map((cid) => {
              const creative = creativesMap.get(cid);
              if (!creative) return null;
              const fmt = creative.creativeFormat;
              const Icon = FORMAT_ICON[fmt];
              return (
                <div
                  key={cid}
                  className={cn(
                    'group relative flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center cursor-default',
                    FORMAT_COLOR[fmt]
                  )}
                  title={creative.creativeName}
                >
                  {creative.thumbnailUrl ? (
                    <img
                      src={creative.thumbnailUrl}
                      alt={creative.creativeName}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <Icon className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  )}
                  {/* Remove creative from batch */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveCreative(batch.id, cid);
                    }}
                    className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full bg-red-500 text-white items-center justify-center"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Count badge */}
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 whitespace-nowrap">
            {batch.creativeIds.length} ads
          </span>

          {/* Remove batch */}
          <button
            onClick={() => onRemoveBatch(batch.id)}
            className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      {/* Summary footer */}
      <div className="mt-1 px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700/50">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{batches.length}</span> ad sets{' '}
          <span className="mx-1">x</span>{' '}
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            {batches.length > 0 ? Math.round(totalAds / batches.length) : 0}
          </span>{' '}
          avg ads = <span className="font-semibold text-gray-700 dark:text-gray-300">{totalAds}</span> total ads
        </p>
      </div>
    </div>
  );
}
