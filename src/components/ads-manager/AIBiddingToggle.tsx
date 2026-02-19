'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AIBiddingPanel } from './AIBiddingPanel';

interface AIBiddingToggleProps {
  campaignId: string;
  campaignName: string;
  initialEnabled?: boolean;
  className?: string;
}

export function AIBiddingToggle({
  campaignId,
  campaignName,
  initialEnabled = false,
  className,
}: AIBiddingToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors',
          enabled
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-surface-hover text-text-dimmed hover:bg-surface-active',
          className
        )}
      >
        <span
          className={cn(
            'inline-block h-1.5 w-1.5 rounded-full',
            enabled ? 'bg-green-500' : 'bg-text-dimmed'
          )}
        />
        AI
      </button>

      <AIBiddingPanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        campaignName={campaignName}
        campaignId={campaignId}
      />
    </>
  );
}
