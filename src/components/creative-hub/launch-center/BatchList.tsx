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
      <div className="flex flex-col items-center justify-center py-10 text-slate-500">
        <Layers className="mb-2 h-8 w-8" />
        <p className="text-sm">No batches created yet. Use Quick Actions above.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {batches.map((batch) => (
        <div
          key={batch.id}
          className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-100/95 px-4 py-3"
        >
          {/* Batch label */}
          <span className="min-w-[80px] whitespace-nowrap text-sm font-semibold text-slate-800">
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
                    <Icon className="h-3.5 w-3.5 text-slate-500" />
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
          <span className="whitespace-nowrap rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {batch.creativeIds.length} ads
          </span>

          {/* Remove batch */}
          <button
            onClick={() => onRemoveBatch(batch.id)}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-500"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}

      {/* Summary footer */}
      <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{batches.length}</span> ad sets{' '}
          <span className="mx-1">x</span>{' '}
          <span className="font-semibold text-slate-700">
            {batches.length > 0 ? Math.round(totalAds / batches.length) : 0}
          </span>{' '}
          avg ads = <span className="font-semibold text-slate-700">{totalAds}</span> total ads
        </p>
      </div>
    </div>
  );
}
