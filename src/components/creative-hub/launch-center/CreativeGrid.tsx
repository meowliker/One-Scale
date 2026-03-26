'use client';

import { useState, useMemo } from 'react';
import { Search, Image, Film, Images, CheckSquare, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxCreative, CreativeFormat } from '@/types/creativeHub';

interface CreativeGridProps {
  creatives: InboxCreative[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

const FORMAT_CONFIG: Record<CreativeFormat, { label: string; icon: typeof Image; color: string; bg: string }> = {
  image: { label: 'Image', icon: Image, color: 'text-blue-400', bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  video: { label: 'Video', icon: Film, color: 'text-purple-400', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  carousel: { label: 'Carousel', icon: Images, color: 'text-green-400', bg: 'bg-green-500/10 text-green-400 border-green-500/20' },
};

export function CreativeGrid({ creatives, selectedIds, onToggle, onSelectAll, onClearAll }: CreativeGridProps) {
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<CreativeFormat | 'all'>('all');

  const filtered = useMemo(() => {
    return creatives.filter((c) => {
      if (formatFilter !== 'all' && c.creativeFormat !== formatFilter) return false;
      if (search && !c.creativeName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [creatives, formatFilter, search]);

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search creatives..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>
        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value as CreativeFormat | 'all')}
          className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          <option value="all">All Formats</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="carousel">Carousel</option>
        </select>
        <div className="flex items-center gap-2">
          <button
            onClick={onSelectAll}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Select All
          </button>
          <button
            onClick={onClearAll}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Counter */}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {selectedIds.size} of {creatives.length} selected
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {filtered.map((creative) => {
          const isSelected = selectedIds.has(creative.id);
          const fmt = FORMAT_CONFIG[creative.creativeFormat];
          const FormatIcon = fmt.icon;
          const pastResult = creative.pastTestResult;

          return (
            <button
              key={creative.id}
              onClick={() => onToggle(creative.id)}
              className={cn(
                'relative flex flex-col rounded-xl border p-2 text-left transition-all duration-200 hover:scale-[1.02]',
                isSelected
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-blue-400 dark:hover:border-blue-500/50'
              )}
            >
              {/* Checkbox */}
              <div className="absolute top-2 right-2 z-10">
                {isSelected ? (
                  <CheckSquare className="w-5 h-5 text-blue-500" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {/* Thumbnail */}
              <div className="relative w-full aspect-square rounded-lg bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden mb-2">
                {creative.thumbnailUrl ? (
                  <img
                    src={creative.thumbnailUrl}
                    alt={creative.creativeName}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <FormatIcon className={cn('w-10 h-10', fmt.color)} />
                )}

                {/* Past test badge */}
                {creative.alreadyTested && pastResult && (
                  <span
                    className={cn(
                      'absolute bottom-1 left-1 px-1.5 py-0.5 text-[10px] font-semibold rounded',
                      pastResult.status === 'winner' && 'bg-green-500/90 text-white',
                      pastResult.status === 'killed' && 'bg-red-500/90 text-white',
                      pastResult.status === 'inconclusive' && 'bg-gray-500/90 text-white'
                    )}
                  >
                    {pastResult.status === 'winner' ? 'Winner' : pastResult.status === 'killed' ? 'Killed' : 'Tested'}
                  </span>
                )}
              </div>

              {/* Info */}
              <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                {creative.creativeName}
              </p>
              <span className={cn('mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border w-fit', fmt.bg)}>
                <FormatIcon className="w-3 h-3" />
                {fmt.label}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <X className="w-8 h-8 mb-2" />
          <p className="text-sm">No creatives match your filters</p>
        </div>
      )}
    </div>
  );
}
