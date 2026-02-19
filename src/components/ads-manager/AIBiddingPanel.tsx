'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { X, Bot, TrendingUp, TrendingDown } from 'lucide-react';
import { Toggle } from '@/components/ui/Toggle';
import { BidOptimizationChart } from './BidOptimizationChart';

interface AIBiddingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  campaignName: string;
  campaignId: string;
}

const mockBidHistory = [
  { day: 'Day 1', from: 1.20, to: 1.35, change: '+12.5%' },
  { day: 'Day 3', from: 1.35, to: 1.28, change: '-5.2%' },
  { day: 'Day 5', from: 1.28, to: 1.42, change: '+10.9%' },
  { day: 'Day 8', from: 1.42, to: 1.38, change: '-2.8%' },
  { day: 'Day 10', from: 1.38, to: 1.50, change: '+8.7%' },
  { day: 'Day 13', from: 1.50, to: 1.55, change: '+3.3%' },
];

export function AIBiddingPanel({ isOpen, onClose, campaignName, campaignId }: AIBiddingPanelProps) {
  const [aiEnabled, setAiEnabled] = useState(true);
  const [targetRoas, setTargetRoas] = useState(4.0);
  const [targetCpa, setTargetCpa] = useState(15.0);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-surface-elevated shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary-light" />
            <h2 className="text-sm font-semibold text-text-primary">AI Bidding</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-dimmed hover:bg-surface-hover hover:text-text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Campaign name */}
          <div className="mb-5">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">Campaign</p>
            <p className="mt-0.5 text-sm font-medium text-text-primary">{campaignName}</p>
          </div>

          {/* AI Toggle */}
          <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Enable AI Bidding</p>
              <p className="text-xs text-text-muted">Let AI optimize bids automatically</p>
            </div>
            <Toggle
              checked={aiEnabled}
              onChange={setAiEnabled}
            />
          </div>

          {/* Target fields */}
          <div className={cn('mb-6 space-y-4', !aiEnabled && 'pointer-events-none opacity-40')}>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Target ROAS
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={targetRoas}
                  onChange={(e) => setTargetRoas(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-sm text-text-muted">x</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Target CPA
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-text-muted">$</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={targetCpa}
                  onChange={(e) => setTargetCpa(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Bid Optimization Chart */}
          <div className={cn('mb-6', !aiEnabled && 'pointer-events-none opacity-40')}>
            <BidOptimizationChart />
          </div>

          {/* Bid Adjustment History */}
          <div className={cn(!aiEnabled && 'pointer-events-none opacity-40')}>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Bid Adjustment History
            </h4>
            <div className="space-y-1.5">
              {mockBidHistory.map((entry) => {
                const isIncrease = entry.to > entry.from;
                return (
                  <div
                    key={entry.day}
                    className="flex items-center justify-between rounded-md bg-surface px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {isIncrease ? (
                        <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      )}
                      <span className="text-xs font-medium text-text-secondary">{entry.day}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="tabular-nums text-text-secondary">
                        ${entry.from.toFixed(2)} &rarr; ${entry.to.toFixed(2)}
                      </span>
                      <span
                        className={cn(
                          'font-medium tabular-nums',
                          isIncrease ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        ({entry.change})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
