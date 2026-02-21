// src/components/ads-manager/SmartSegmentsBar.tsx
'use client';

import { useState, useMemo } from 'react';
import { useSmartFilterStore, type SmartSegmentId } from '@/stores/smartFilterStore';
import { useColumnPresetStore } from '@/stores/columnPresetStore';
import type { Campaign } from '@/types/campaign';
import type { SparklineDataPoint } from '@/data/mockSparklineData';
import { cn } from '@/lib/utils';
import { Plus, X } from 'lucide-react';

interface SegmentDef {
  id: SmartSegmentId;
  label: string;
  emoji: string;
  color: string;          // Tailwind bg class for active chip
  textColor: string;
  presetId: string;       // column preset to activate
  test: (c: Campaign, trend7d: number | null, trend14d: number | null) => boolean;
  actionLabel?: string;
}

const DIGITAL_SEGMENTS: SegmentDef[] = [
  {
    id: 'kill-list',
    label: 'Kill List',
    emoji: '🔴',
    color: 'bg-red-100 border-red-200',
    textColor: 'text-red-700',
    presetId: 'kill-list-view',
    test: (c) => c.status === 'ACTIVE' && c.metrics.roas < 1.0 && c.metrics.spend > 20,
    actionLabel: 'Turn Off',
  },
  {
    id: 'needs-review',
    label: 'Needs Review',
    emoji: '🟡',
    color: 'bg-amber-100 border-amber-200',
    textColor: 'text-amber-700',
    presetId: 'performance',
    test: (c) => c.status === 'ACTIVE' && c.metrics.roas >= 1.0 && c.metrics.roas < 2.5 && c.metrics.spend > 10,
  },
  {
    id: 'scale-now',
    label: 'Scale Now',
    emoji: '🟢',
    color: 'bg-green-100 border-green-200',
    textColor: 'text-green-700',
    presetId: 'scale-view',
    test: (c, trend7d) => c.status === 'ACTIVE' && c.metrics.roas >= 2.5 && (trend7d === null || trend7d >= -0.1),
    actionLabel: 'Scale Budget',
  },
  {
    id: 'top-7d',
    label: 'Top 7d',
    emoji: '⚡',
    color: 'bg-blue-100 border-blue-200',
    textColor: 'text-blue-700',
    presetId: 'performance',
    test: (c, trend7d) => c.status === 'ACTIVE' && c.metrics.roas > 1.5 && (trend7d === null || trend7d > 0),
  },
  {
    id: 'learning',
    label: 'Learning',
    emoji: '🧪',
    color: 'bg-purple-100 border-purple-200',
    textColor: 'text-purple-700',
    presetId: 'performance',
    test: (c) => c.status === 'ACTIVE' && c.metrics.spend < 50 && c.metrics.conversions < 7,
  },
  {
    id: 'fatigue',
    label: 'Creative Fatigue',
    emoji: '💀',
    color: 'bg-orange-100 border-orange-200',
    textColor: 'text-orange-700',
    presetId: 'creative-health',
    test: (c) => c.status === 'ACTIVE' && c.metrics.frequency > 3.5,
    actionLabel: 'Pause',
  },
];

interface Props {
  campaigns: Campaign[];
  sparklineData?: Record<string, SparklineDataPoint[]>;
}

export function SmartSegmentsBar({ campaigns, sparklineData = {} }: Props) {
  const { activeSegment, setActiveSegment, savedFilters, activeSavedFilterId,
    setActiveSavedFilter, deleteSavedFilter } = useSmartFilterStore();
  const { setPreset } = useColumnPresetStore();
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);

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
      setPreset(seg.presetId);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-1">
      <span className="text-[11px] font-semibold text-[#86868b] shrink-0 uppercase tracking-wide">Segments:</span>

      {/* Built-in smart segments */}
      {DIGITAL_SEGMENTS.map((seg) => {
        const isActive = activeSegment === seg.id;
        const count = counts[seg.id!] ?? 0;
        return (
          <button
            key={seg.id}
            onClick={() => handleSegmentClick(seg)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all duration-150',
              isActive
                ? cn(seg.color, seg.textColor, 'shadow-sm')
                : 'border-[rgba(0,0,0,0.08)] bg-white text-[#1d1d1f] hover:border-[rgba(0,0,0,0.15)] hover:bg-[#f5f5f7]'
            )}
          >
            <span>{seg.emoji}</span>
            <span>{seg.label}</span>
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
              isActive ? 'bg-white/60' : 'bg-[#f5f5f7]'
            )}>
              {count}
            </span>
          </button>
        );
      })}

      {/* Custom saved filter chips */}
      {savedFilters.map((sf) => {
        const isActive = activeSavedFilterId === sf.id;
        return (
          <span key={sf.id} className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium',
            isActive
              ? 'border-[#0071e3]/40 bg-[#0071e3]/10 text-[#0071e3]'
              : 'border-[rgba(0,0,0,0.08)] bg-white text-[#1d1d1f]'
          )}>
            <button onClick={() => setActiveSavedFilter(isActive ? null : sf.id)}>
              {sf.emoji} {sf.name}
            </button>
            <button onClick={() => deleteSavedFilter(sf.id)} className="ml-0.5 opacity-50 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}

      {/* Add custom filter button */}
      <button
        onClick={() => setShowFilterBuilder(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-[rgba(0,0,0,0.15)] bg-transparent px-3 py-1 text-[12px] text-[#86868b] transition-colors hover:border-[#0071e3] hover:text-[#0071e3]"
      >
        <Plus className="h-3 w-3" />
        Save Filter
      </button>

      {/* Filter Builder Modal — inline for now */}
      {showFilterBuilder && (
        <CustomFilterModal onClose={() => setShowFilterBuilder(false)} />
      )}
    </div>
  );
}

// CustomFilterModal — simple modal for creating a named custom filter
function CustomFilterModal({ onClose }: { onClose: () => void }) {
  const { saveFiler } = useSmartFilterStore();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⭐');
  const [roasMin, setRoasMin] = useState('');
  const [roasMax, setRoasMax] = useState('');
  const [cpaMin, setCpaMin] = useState('');
  const [cpaMax, setCpaMax] = useState('');
  const [spendMin, setSpendMin] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;
    saveFiler({
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
