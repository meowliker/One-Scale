'use client';

import { useState, useEffect } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import { DollarSign } from 'lucide-react';

interface LiveProfitTickerProps {
  netProfit: number;
}

export function LiveProfitTicker({ netProfit }: LiveProfitTickerProps) {
  const [displayValue, setDisplayValue] = useState(netProfit);
  const [isAnimating, setIsAnimating] = useState(false);

  // Animate to new value when netProfit prop changes
  useEffect(() => {
    // Smoothly count towards the new value
    const start = displayValue;
    const end = netProfit;
    const diff = end - start;
    if (Math.abs(diff) < 0.01) {
      setDisplayValue(end);
      return;
    }

    setIsAnimating(true);
    const duration = 800; // ms
    const steps = 20;
    const stepDuration = duration / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      if (step >= steps) {
        setDisplayValue(end);
        setIsAnimating(false);
        clearInterval(interval);
      } else {
        // Ease-out cubic
        const t = step / steps;
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayValue(Math.round((start + diff * eased) * 100) / 100);
      }
    }, stepDuration);

    return () => clearInterval(interval);
    // Only re-run when netProfit changes, not displayValue
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netProfit]);

  const isPositive = displayValue >= 0;

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
        <DollarSign className="h-4 w-4" />
        <span>Live Profit Today</span>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      </div>
      <div
        className={cn(
          'mt-3 text-3xl font-bold tabular-nums transition-all duration-300',
          isPositive ? 'text-emerald-700' : 'text-red-600',
          isAnimating && 'scale-105'
        )}
      >
        {formatCurrency(displayValue)}
      </div>
    </div>
  );
}
