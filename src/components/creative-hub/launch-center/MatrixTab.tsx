'use client';

import { useState, useMemo, useCallback } from 'react';
import { Grid3X3, Zap, Image, Film, Images, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type { InboxCreative, WinningCopy, CreativeFormat } from '@/types/creativeHub';

type MatrixMetric = 'roas' | 'cpa';

interface CellData {
  roas?: number;
  cpa?: number;
  tested: boolean;
  selected: boolean;
}

type MatrixState = Record<string, Record<string, CellData>>;

const FORMAT_ICON: Record<CreativeFormat, typeof Image> = {
  image: Image,
  video: Film,
  carousel: Images,
};

function getCellColor(metric: MatrixMetric, value?: number): string {
  if (value === undefined) return 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700';
  if (metric === 'roas') {
    if (value >= 3) return 'bg-green-600/20 border-green-500';
    if (value >= 2) return 'bg-green-400/20 border-green-400';
    if (value >= 1) return 'bg-yellow-400/20 border-yellow-400';
    return 'bg-red-400/20 border-red-400';
  }
  // CPA: lower is better, invert logic
  if (value <= 10) return 'bg-green-600/20 border-green-500';
  if (value <= 20) return 'bg-green-400/20 border-green-400';
  if (value <= 40) return 'bg-yellow-400/20 border-yellow-400';
  return 'bg-red-400/20 border-red-400';
}

function formatValue(metric: MatrixMetric, value?: number): string {
  if (value === undefined) return '--';
  if (metric === 'roas') return `${value.toFixed(1)}x`;
  return `$${value.toFixed(0)}`;
}

interface MatrixTabProps {
  creatives: InboxCreative[];
  productProfileId?: string;
  onLaunchSelected?: (creativeIds: string[], copyIds: string[]) => void;
}

export function MatrixTab({ creatives, productProfileId, onLaunchSelected }: MatrixTabProps) {
  const { copyLibrary, setLaunchCenterTab } = useCreativeHubStore();
  const [metric, setMetric] = useState<MatrixMetric>('roas');

  // Filter copies by product profile
  const copies = useMemo(() => {
    if (!productProfileId) return copyLibrary.slice(0, 8);
    return copyLibrary.filter((c) => c.productProfileId === productProfileId).slice(0, 8);
  }, [copyLibrary, productProfileId]);

  // Ready creatives only
  const readyCreatives = useMemo(
    () => creatives.filter((c) => c.uploadStatus === 'ready'),
    [creatives]
  );

  // Build matrix state: all cells start as untested
  const [matrix, setMatrix] = useState<MatrixState>(() => {
    const m: MatrixState = {};
    for (const creative of readyCreatives) {
      m[creative.id] = {};
      for (const copy of copies) {
        m[creative.id][copy.id] = { tested: false, selected: false };
      }
    }
    return m;
  });

  const toggleCell = useCallback((creativeId: string, copyId: string) => {
    setMatrix((prev) => {
      const cell = prev[creativeId]?.[copyId];
      if (!cell) return prev;
      // Only toggle untested cells
      return {
        ...prev,
        [creativeId]: {
          ...prev[creativeId],
          [copyId]: { ...cell, selected: !cell.selected },
        },
      };
    });
  }, []);

  const selectedCombos = useMemo(() => {
    const combos: Array<{ creativeId: string; copyId: string }> = [];
    for (const [creativeId, row] of Object.entries(matrix)) {
      for (const [copyId, cell] of Object.entries(row)) {
        if (cell.selected) combos.push({ creativeId, copyId });
      }
    }
    return combos;
  }, [matrix]);

  const handleLaunch = () => {
    if (selectedCombos.length === 0) return;
    const creativeIds = [...new Set(selectedCombos.map((c) => c.creativeId))];
    const copyIds = [...new Set(selectedCombos.map((c) => c.copyId))];
    onLaunchSelected?.(creativeIds, copyIds);
  };

  if (readyCreatives.length === 0 || copies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
        <Grid3X3 className="w-10 h-10 mb-3" />
        <p className="text-sm font-medium mb-1">Not enough data for matrix</p>
        <p className="text-xs">
          {readyCreatives.length === 0
            ? 'Upload creatives to Meta first'
            : 'Add copy to your Copy Library first'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500 dark:text-gray-400">Metric:</label>
          <div className="relative">
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as MatrixMetric)}
              className="appearance-none pl-3 pr-8 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <option value="roas">ROAS</option>
              <option value="cpa">CPA</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <button
          onClick={handleLaunch}
          disabled={selectedCombos.length === 0}
          className={cn(
            'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            selectedCombos.length > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
          )}
        >
          <Zap className="w-4 h-4" />
          Launch Selected Combos
        </button>
      </div>

      {/* Matrix grid */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-900 px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700 min-w-[140px]">
                Creative / Copy
              </th>
              {copies.map((copy) => (
                <th
                  key={copy.id}
                  className="px-3 py-2.5 text-center text-xs font-medium text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 min-w-[110px] max-w-[140px]"
                >
                  <div className="truncate" title={copy.primaryText}>
                    {copy.headline || copy.primaryText.slice(0, 20) + (copy.primaryText.length > 20 ? '...' : '')}
                  </div>
                  {copy.roas > 0 && (
                    <span className="text-[10px] text-green-500">{copy.roas.toFixed(1)}x ROAS</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {readyCreatives.map((creative) => {
              const FormatIcon = FORMAT_ICON[creative.creativeFormat];
              return (
                <tr key={creative.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                  <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-3 py-2 border-r border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <FormatIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[100px]" title={creative.creativeName}>
                        {creative.creativeName}
                      </span>
                    </div>
                  </td>
                  {copies.map((copy) => {
                    const cell = matrix[creative.id]?.[copy.id];
                    if (!cell) return <td key={copy.id} className="px-2 py-2" />;
                    const value = metric === 'roas' ? cell.roas : cell.cpa;
                    const colorClass = getCellColor(metric, value);
                    return (
                      <td key={copy.id} className="px-2 py-2">
                        <button
                          onClick={() => toggleCell(creative.id, copy.id)}
                          className={cn(
                            'w-full h-10 rounded-md border text-xs font-medium transition-all flex items-center justify-center gap-1',
                            colorClass,
                            cell.selected && 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900',
                            !cell.tested && 'hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                          )}
                        >
                          {cell.selected && (
                            <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span className={cn(cell.tested ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500')}>
                            {formatValue(metric, value)}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend + status */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-600/30 border border-green-500" />
            <span>{metric === 'roas' ? '>3x' : '<$10'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-400/30 border border-green-400" />
            <span>{metric === 'roas' ? '>2x' : '<$20'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-yellow-400/30 border border-yellow-400" />
            <span>{metric === 'roas' ? '>1x' : '<$40'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-red-400/30 border border-red-400" />
            <span>{metric === 'roas' ? '<1x' : '>$40'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
            <span>Untested</span>
          </div>
        </div>
        <span className="font-medium">
          {selectedCombos.length} combo{selectedCombos.length !== 1 ? 's' : ''} selected
        </span>
      </div>
    </div>
  );
}
