'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface LiveProfitTickerProps {
  netProfit: number;
}

export function LiveProfitTicker({ netProfit }: LiveProfitTickerProps) {
  const [displayValue, setDisplayValue] = useState(netProfit);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const diff = netProfit - displayValue;
    if (Math.abs(diff) < 0.01) { setDisplayValue(netProfit); return; }
    setAnimating(true);
    let step = 0;
    const steps = 20;
    const interval = setInterval(() => {
      step++;
      if (step >= steps) { setDisplayValue(netProfit); setAnimating(false); clearInterval(interval); }
      else {
        const t = step / steps;
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayValue(Math.round((displayValue + diff * eased) * 100) / 100);
      }
    }, 800 / steps);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netProfit]);

  const isPositive = displayValue >= 0;

  return (
    <div className={`relative rounded-2xl p-6 overflow-hidden border-2 ${
      isPositive
        ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-400 dark:from-emerald-600 dark:to-emerald-700 dark:border-emerald-500'
        : 'bg-gradient-to-br from-red-500 to-red-600 border-red-400 dark:from-red-600 dark:to-red-700 dark:border-red-500'
    }`}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 bg-white" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          <span className="text-sm font-bold uppercase tracking-widest text-white/80">Live · Today</span>
        </div>
        <div className={`text-5xl font-black tracking-tight tabular-nums text-white transition-transform duration-300 ${animating ? 'scale-[1.02]' : 'scale-100'}`}>
          {formatCurrency(displayValue)}
        </div>
        <div className="flex items-center gap-1.5 text-base font-semibold text-white/90">
          {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          <span>{isPositive ? 'Profitable today' : 'Net loss today'}</span>
        </div>
      </div>
    </div>
  );
}
