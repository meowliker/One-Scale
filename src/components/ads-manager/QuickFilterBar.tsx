'use client';

import { cn } from '@/lib/utils';

export type QuickFilterId = 'all-active' | 'high-roas' | 'low-roas' | 'learning' | 'fatigue-risk';

interface QuickFilterDef {
  id: QuickFilterId;
  label: string;
}

const QUICK_FILTERS: QuickFilterDef[] = [
  { id: 'all-active', label: 'All Active' },
  { id: 'high-roas', label: 'High ROAS (>2x)' },
  { id: 'low-roas', label: 'Low ROAS (<1x)' },
  { id: 'learning', label: 'Learning' },
  { id: 'fatigue-risk', label: 'Fatigue Risk' },
];

interface Props {
  activeFilter: QuickFilterId | null;
  onFilterChange: (filter: QuickFilterId | null) => void;
}

export function QuickFilterBar({ activeFilter, onFilterChange }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      {QUICK_FILTERS.map((f) => {
        const isActive = activeFilter === f.id;
        return (
          <button
            key={f.id}
            onClick={() => onFilterChange(isActive ? null : f.id)}
            className={cn(
              'rounded-[20px] px-3 py-1 text-[12px] font-medium cursor-pointer transition-all duration-150 border',
              isActive
                ? 'bg-[#2563eb] border-[#2563eb] text-white dark:bg-[#3b82f6] dark:border-[#3b82f6]'
                : 'bg-[#f1f5f9] border-[#e2e8f0] text-[#475569] hover:bg-[#e2e8f0] hover:text-[#1e293b] dark:bg-[#1e293b] dark:border-[#334155] dark:text-[#94a3b8] dark:hover:bg-[#334155] dark:hover:text-[#e5e7eb]'
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
