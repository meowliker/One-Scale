// src/components/ads-manager/BulkActionPanel.tsx
'use client';

import { useState } from 'react';
import { PowerOff, TrendingUp } from 'lucide-react';
import type { Campaign } from '@/types/campaign';
import { cn } from '@/lib/utils';

// SmartSegmentId defined inline in case smartFilterStore hasn't been created yet
type SmartSegmentId =
  | 'kill-list'
  | 'needs-review'
  | 'scale-now'
  | 'top-7d'
  | 'learning'
  | 'fatigue'
  | null;

const BUDGET_PRESETS = [10, 20, 30, 40] as const;

interface Props {
  segment: SmartSegmentId;
  filteredCampaigns: Campaign[];
  onToggleStatus: (ids: string[], status: 'ACTIVE' | 'PAUSED') => Promise<void>;
  onChangeBudget: (ids: string[], pctChange: number) => Promise<void>;
}

export function BulkActionPanel({ segment, filteredCampaigns, onToggleStatus, onChangeBudget }: Props) {
  const [customPct, setCustomPct] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!segment) return null;
  const isKillSegment = segment === 'kill-list' || segment === 'fatigue';
  const isScaleSegment = segment === 'scale-now' || segment === 'top-7d' || segment === 'learning';
  const count = filteredCampaigns.length;
  if (count === 0) return null;

  const handleTurnOff = async () => {
    setLoading(true);
    try {
      await onToggleStatus(filteredCampaigns.map((c) => c.id), 'PAUSED');
      setResult(`✓ Paused ${count} campaign${count !== 1 ? 's' : ''}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBudget = async (pct: number) => {
    setLoading(true);
    try {
      await onChangeBudget(filteredCampaigns.map((c) => c.id), pct);
      setResult(`✓ Budget ${pct > 0 ? '+' : ''}${pct}% on ${count} campaign${count !== 1 ? 's' : ''}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgba(0,0,0,0.06)] bg-[#f5f5f7] px-4 py-2">
      <span className="text-[12px] font-medium text-[#86868b]">
        {count} campaign{count !== 1 ? 's' : ''} selected —
      </span>

      {/* Kill / Pause action */}
      {isKillSegment && (
        <button
          onClick={handleTurnOff}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#ff3b30] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <PowerOff className="h-3.5 w-3.5" />
          Turn Off All ({count})
        </button>
      )}

      {/* Budget scale actions */}
      {isScaleSegment && (
        <>
          <span className="text-[12px] text-[#86868b]">Increase budget:</span>
          {BUDGET_PRESETS.map((pct) => (
            <button
              key={pct}
              onClick={() => handleBudget(pct)}
              disabled={loading}
              className="rounded-lg border border-[rgba(0,0,114,0.15)] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0071e3] transition-colors hover:bg-[#0071e3] hover:text-white disabled:opacity-50"
            >
              +{pct}%
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={customPct}
              onChange={(e) => setCustomPct(e.target.value)}
              placeholder="Custom %"
              className="w-20 rounded-lg border border-[rgba(0,0,0,0.1)] px-2 py-1.5 text-[12px]"
            />
            <button
              onClick={() => customPct && handleBudget(Number(customPct))}
              disabled={loading || !customPct}
              className="rounded-lg bg-[#0071e3] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </>
      )}

      {result && (
        <span className="ml-2 text-[12px] font-medium text-[#34c759]">{result}</span>
      )}
    </div>
  );
}
