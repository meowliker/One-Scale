// src/components/ads-manager/SmartSegmentsBar.tsx
'use client';

import { useState, useMemo } from 'react';
import { useSmartFilterStore, type SmartSegmentId } from '@/stores/smartFilterStore';
import type { Campaign } from '@/types/campaign';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import { cn } from '@/lib/utils';
import { Plus, X } from 'lucide-react';

interface SegmentDef {
  id: SmartSegmentId;
  label: string;
  shortLabel?: string;    // short label for the chip (falls back to label)
  emoji: string;
  color: string;          // Tailwind bg class for active chip
  textColor: string;
  dot: string;            // Tailwind bg class for the colored dot
  countBg: string;        // Tailwind bg class for the count badge (inactive)
  countText: string;      // Tailwind text class for the count badge (inactive)
  presetId: string;       // column preset to activate
  test: (c: Campaign, trend7d: number | null, trend14d: number | null) => boolean;
  actionLabel?: string;
}

const DIGITAL_SEGMENTS: SegmentDef[] = [
  {
    id: 'kill-list',
    label: 'Kill List',
    shortLabel: 'Kill',
    emoji: '🔴',
    color: 'bg-red-100 border-red-200',
    textColor: 'text-red-700',
    dot: 'bg-red-500',
    countBg: 'bg-red-100',
    countText: 'text-red-700',
    presetId: 'kill-list-view',
    // kill-list: (spend > 30 AND conversions = 0) OR (roas < 0.8 AND spend > 20)
    test: (c) =>
      c.status === 'ACTIVE' &&
      (
        (c.metrics.spend > 30 && c.metrics.conversions === 0) ||
        (c.metrics.roas < 0.8 && c.metrics.spend > 20)
      ),
    actionLabel: 'Turn Off',
  },
  {
    id: 'needs-review',
    label: 'Needs Review',
    shortLabel: 'Review',
    emoji: '🟡',
    color: 'bg-amber-100 border-amber-200',
    textColor: 'text-amber-700',
    dot: 'bg-amber-500',
    countBg: 'bg-amber-100',
    countText: 'text-amber-700',
    presetId: 'performance',
    // needs-review: roas < 1.0 AND roas >= 0.8 AND spend > 15
    test: (c) => c.status === 'ACTIVE' && c.metrics.roas >= 0.8 && c.metrics.roas < 1.0 && c.metrics.spend > 15,
  },
  {
    id: 'scale-now',
    label: 'Scale Now',
    shortLabel: 'Scale',
    emoji: '🟢',
    color: 'bg-green-100 border-green-200',
    textColor: 'text-green-700',
    dot: 'bg-green-500',
    countBg: 'bg-green-100',
    countText: 'text-green-700',
    presetId: 'scale-view',
    // scale-now: roas >= 1.4 AND 7d trend >= -5%
    test: (c, trend7d) => c.status === 'ACTIVE' && c.metrics.roas >= 1.4 && (trend7d === null || trend7d >= -0.05),
    actionLabel: 'Scale Budget',
  },
  {
    id: 'top-7d',
    label: 'Top 7d',
    emoji: '⚡',
    color: 'bg-blue-100 border-blue-200',
    textColor: 'text-blue-700',
    dot: 'bg-blue-500',
    countBg: 'bg-blue-100',
    countText: 'text-blue-700',
    presetId: 'performance',
    // top-7d: roas >= 1.2 AND trend >= 0
    test: (c, trend7d) => c.status === 'ACTIVE' && c.metrics.roas >= 1.2 && (trend7d === null || trend7d >= 0),
  },
  {
    id: 'learning',
    label: 'Learning',
    emoji: '🧪',
    color: 'bg-purple-100 border-purple-200',
    textColor: 'text-purple-700',
    dot: 'bg-purple-500',
    countBg: 'bg-purple-100',
    countText: 'text-purple-700',
    presetId: 'performance',
    // learning: conversions < 5 AND spend < 50
    test: (c) => c.status === 'ACTIVE' && c.metrics.conversions < 5 && c.metrics.spend < 50,
  },
  {
    id: 'fatigue',
    label: 'Creative Fatigue',
    shortLabel: 'Fatigue',
    emoji: '💀',
    color: 'bg-orange-100 border-orange-200',
    textColor: 'text-orange-700',
    dot: 'bg-orange-500',
    countBg: 'bg-orange-100',
    countText: 'text-orange-700',
    presetId: 'creative-health',
    // fatigue: frequency > 3.5 AND roas < 1.3
    test: (c) => c.status === 'ACTIVE' && c.metrics.frequency > 3.5 && c.metrics.roas < 1.3,
    actionLabel: 'Pause',
  },
];

interface Props {
  campaigns: Campaign[];
  sparklineData?: Record<string, SparklineDataPoint[]>;
}

export function SmartSegmentsBar({ campaigns, sparklineData = {} }: Props) {
  const { activeSegment, setActiveSegment, segmentDays, setSegmentDays, savedFilters, activeSavedFilterId,
    setActiveSavedFilter, deleteSavedFilter } = useSmartFilterStore();
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);
  
  // Segments that support 3d/7d toggle
  const supportsTimeToggle = activeSegment === 'kill-list' || activeSegment === 'needs-review' || activeSegment === 'scale-now';

  // Compute 7-day trend (% change in ROAS from first half to second half of 7-day window)
  const getTrend = (campaignId: string): number | null => {
    const pts = sparklineData[campaignId];
    if (!pts || pts.length < 4) return null;
    const mid = Math.floor(pts.length / 2);
    const early = pts.slice(0, mid).reduce((s, p) => s + (p.roas ?? 0), 0) / mid;
    const recent = pts.slice(mid).reduce((s, p) => s + (p.roas ?? 0), 0) / (pts.length - mid);
    if (early === 0) return null;
    return (recent - early) / early; // positive = improving
  };

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const seg of DIGITAL_SEGMENTS) {
      result[seg.id!] = campaigns.filter((c) => {
        const trend = getTrend(c.id);
        return seg.test(c, trend, null);
      }).length;
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, sparklineData]);

  const handleSegmentClick = (seg: SegmentDef) => {
    if (activeSegment === seg.id) {
      setActiveSegment(null);
    } else {
      setActiveSegment(seg.id);
      // Don't change column preset - keep user's selected columns
    }
  };

  return (
    <div className="flex items-center gap-1 px-0.5">
      {/* Built-in smart segments */}
      {DIGITAL_SEGMENTS.map((seg) => {
        const isActive = activeSegment === seg.id;
        const count = counts[seg.id!] ?? 0;
        const hasHits = count > 0;
        return (
          <button
            key={seg.id}
            onClick={() => handleSegmentClick(seg)}
            className={cn(
              'group inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all duration-150 border',
              isActive
                ? cn(seg.color, seg.textColor, 'shadow-sm')
                : hasHits
                  ? 'border-[rgba(0,0,0,0.1)] bg-white text-[#1d1d1f] hover:bg-[#f5f5f7]'
                  : 'border-transparent bg-transparent text-[#aeaeb2] hover:bg-[#f5f5f7] hover:text-[#86868b] hover:border-[rgba(0,0,0,0.06)]'
            )}
          >
            {/* Colored dot indicator */}
            <span className={cn(
              'h-1.5 w-1.5 rounded-full flex-shrink-0',
              seg.dot,
              !hasHits && !isActive && 'opacity-30'
            )} />
            <span>{seg.shortLabel ?? seg.label}</span>
            {hasHits && (
              <span className={cn(
                'rounded px-1 text-[10px] font-bold tabular-nums',
                isActive ? 'bg-white/50' : cn(seg.countBg, seg.countText)
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}

      {/* 3d/7d Toggle - only show when Kill, Review, or Scale is active */}
      {supportsTimeToggle && (
        <div className="inline-flex items-center rounded-md border border-[rgba(0,0,0,0.1)] bg-white overflow-hidden ml-1">
          <button
            onClick={() => setSegmentDays(3)}
            className={cn(
              'px-2 py-0.5 text-[10px] font-semibold transition-all duration-150',
              segmentDays === 3
                ? 'bg-[#1d1d1f] text-white'
                : 'text-[#6e6e73] hover:bg-[#f5f5f7]'
            )}
          >
            3d
          </button>
          <button
            onClick={() => setSegmentDays(7)}
            className={cn(
              'px-2 py-0.5 text-[10px] font-semibold transition-all duration-150',
              segmentDays === 7
                ? 'bg-[#1d1d1f] text-white'
                : 'text-[#6e6e73] hover:bg-[#f5f5f7]'
            )}
          >
            7d
          </button>
        </div>
      )}

      {/* Divider */}
      <span className="mx-1 h-3.5 w-px bg-[rgba(0,0,0,0.08)]" />

      {/* Custom saved filter chips */}
      {savedFilters.map((sf) => {
        const isActive = activeSavedFilterId === sf.id;
        return (
          <span key={sf.id} className={cn(
            'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-all duration-150',
            isActive
              ? 'border-[#0071e3]/30 bg-[#e8f0fe] text-[#0071e3]'
              : 'border-[rgba(0,0,0,0.08)] bg-white text-[#1d1d1f] hover:bg-[#f5f5f7]'
          )}>
            <button onClick={() => setActiveSavedFilter(isActive ? null : sf.id)} className="flex items-center gap-1">
              <span className="text-[11px]">{sf.emoji}</span>
              {sf.name}
            </button>
            <button onClick={() => deleteSavedFilter(sf.id)} className="ml-0.5 opacity-40 hover:opacity-80">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}

      {/* Save Filter */}
      <button
        onClick={() => setShowFilterBuilder(true)}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-[rgba(0,0,0,0.12)] px-2 py-0.5 text-[11px] text-[#aeaeb2] transition-all hover:border-[#0071e3] hover:text-[#0071e3]"
      >
        <Plus className="h-3 w-3" />
        Save
      </button>

      {showFilterBuilder && (
        <CustomFilterModal onClose={() => setShowFilterBuilder(false)} />
      )}
    </div>
  );
}

// CustomFilterModal — simple modal for creating a named custom filter
function CustomFilterModal({ onClose }: { onClose: () => void }) {
  const { saveFilter } = useSmartFilterStore();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⭐');
  const [roasMin, setRoasMin] = useState('');
  const [roasMax, setRoasMax] = useState('');
  const [cpaMin, setCpaMin] = useState('');
  const [cpaMax, setCpaMax] = useState('');
  const [spendMin, setSpendMin] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    saveFilter({
      name: name.trim(),
      emoji,
      roasMin: roasMin ? Number(roasMin) : null,
      roasMax: roasMax ? Number(roasMax) : null,
      cpaMin: cpaMin ? Number(cpaMin) : null,
      cpaMax: cpaMax ? Number(cpaMax) : null,
      spendMin: spendMin ? Number(spendMin) : null,
      spendMax: null,
      ctrMin: null,
      statusFilter: 'all',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="w-80 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-[14px] font-semibold text-[#1d1d1f]">Save Custom Filter</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-12 rounded-lg border border-[rgba(0,0,0,0.1)] px-2 py-1.5 text-center text-[14px]" maxLength={2} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Filter name" className="flex-1 rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-[13px]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-[#86868b]">ROAS min</label>
              <input type="number" value={roasMin} onChange={(e) => setRoasMin(e.target.value)} placeholder="e.g. 2.5" className="w-full rounded-lg border border-[rgba(0,0,0,0.1)] px-2 py-1 text-[13px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#86868b]">ROAS max</label>
              <input type="number" value={roasMax} onChange={(e) => setRoasMax(e.target.value)} placeholder="e.g. 5.0" className="w-full rounded-lg border border-[rgba(0,0,0,0.1)] px-2 py-1 text-[13px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#86868b]">CPA max ($)</label>
              <input type="number" value={cpaMax} onChange={(e) => setCpaMax(e.target.value)} placeholder="e.g. 50" className="w-full rounded-lg border border-[rgba(0,0,0,0.1)] px-2 py-1 text-[13px]" />
            </div>
            <div>
              <label className="text-[11px] text-[#86868b]">Min Spend ($)</label>
              <input type="number" value={spendMin} onChange={(e) => setSpendMin(e.target.value)} placeholder="e.g. 20" className="w-full rounded-lg border border-[rgba(0,0,0,0.1)] px-2 py-1 text-[13px]" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-[rgba(0,0,0,0.1)] py-1.5 text-[13px] text-[#86868b]">Cancel</button>
          <button onClick={handleSave} className="flex-1 rounded-lg bg-[#0071e3] py-1.5 text-[13px] font-medium text-white">Save Filter</button>
        </div>
      </div>
    </div>
  );
}
