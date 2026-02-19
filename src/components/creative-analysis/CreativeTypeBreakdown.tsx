import { ImageIcon, Video } from 'lucide-react';
import type { Creative } from '@/types/creative';
import { cn, formatCurrency, formatPercentage, formatRoas } from '@/lib/utils';

interface CreativeTypeBreakdownProps {
  creatives: Creative[];
}

export function CreativeTypeBreakdown({ creatives }: CreativeTypeBreakdownProps) {
  const imageCreatives = creatives.filter((c) => c.type === 'Image');
  const videoCreatives = creatives.filter((c) => c.type === 'Video');

  function computeStats(items: Creative[]) {
    if (items.length === 0) {
      return { count: 0, avgRoas: 0, avgCtr: 0, totalSpend: 0, totalRevenue: 0 };
    }
    return {
      count: items.length,
      avgRoas: items.reduce((s, c) => s + c.roas, 0) / items.length,
      avgCtr: items.reduce((s, c) => s + c.ctr, 0) / items.length,
      totalSpend: items.reduce((s, c) => s + c.spend, 0),
      totalRevenue: items.reduce((s, c) => s + c.revenue, 0),
    };
  }

  const imageStats = computeStats(imageCreatives);
  const videoStats = computeStats(videoCreatives);
  const imageBetter = imageStats.avgRoas > videoStats.avgRoas;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Image Performance */}
      <div
        className={cn(
          'rounded-xl border bg-white p-5',
          imageBetter ? 'border-green-300' : 'border-gray-200'
        )}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <ImageIcon className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Image Performance</h3>
            <p className="text-xs text-gray-500">{imageStats.count} creatives</p>
          </div>
          {imageBetter && (
            <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">
              Better
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Avg ROAS</p>
            <p className="text-lg font-bold text-gray-900">{formatRoas(imageStats.avgRoas)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Avg CTR</p>
            <p className="text-lg font-bold text-gray-900">{formatPercentage(imageStats.avgCtr)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Total Spend</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(imageStats.totalSpend)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Total Revenue</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(imageStats.totalRevenue)}</p>
          </div>
        </div>
      </div>

      {/* Video Performance */}
      <div
        className={cn(
          'rounded-xl border bg-white p-5',
          !imageBetter ? 'border-green-300' : 'border-gray-200'
        )}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
            <Video className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Video Performance</h3>
            <p className="text-xs text-gray-500">{videoStats.count} creatives</p>
          </div>
          {!imageBetter && (
            <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">
              Better
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Avg ROAS</p>
            <p className="text-lg font-bold text-gray-900">{formatRoas(videoStats.avgRoas)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Avg CTR</p>
            <p className="text-lg font-bold text-gray-900">{formatPercentage(videoStats.avgCtr)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Total Spend</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(videoStats.totalSpend)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Total Revenue</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(videoStats.totalRevenue)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
