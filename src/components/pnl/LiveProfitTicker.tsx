'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface LiveProfitTickerProps {
  netProfit: number;
}

export function LiveProfitTicker({ netProfit }: LiveProfitTickerProps) {
  const [displayValue, setDisplayValue] = useState(netProfit);
  const [isAnimating, setIsAnimating] = useState(false);

  // Animate to new value when netProfit prop changes
  useEffect(() => {
    const start = displayValue;
    const end = netProfit;
    const diff = end - start;
    if (Math.abs(diff) < 0.01) {
      setDisplayValue(end);
      return;
    }

    setIsAnimating(true);
    const duration = 800;
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
        const t = step / steps;
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplayValue(Math.round((start + diff * eased) * 100) / 100);
      }
    }, stepDuration);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [netProfit]);

  const isPositive = displayValue >= 0;

  return (
    <div
      className={`relative rounded-3xl p-7 overflow-hidden transition-all duration-500 ${
        isPositive
          ? 'bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200'
          : 'bg-gradient-to-br from-red-50 to-rose-50 border-2 border-red-200'
      }`}
    >
      {/* Background decoration — large faded icon */}
      <div
        className={`absolute right-6 top-1/2 -translate-y-1/2 text-[140px] font-black pointer-events-none select-none leading-none ${
          isPositive ? 'text-emerald-200' : 'text-red-200'
        }`}
      >
        {isPositive ? '↑' : '↓'}
      </div>

      <div className="relative flex items-center justify-between">
        <div>
          {/* Live indicator + label */}
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                  isPositive ? 'bg-emerald-400' : 'bg-red-400'
                }`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  isPositive ? 'bg-emerald-500' : 'bg-red-500'
                }`}
              />
            </span>
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Live Profit Today
            </span>
          </div>

          {/* Main profit value */}
          <div
            className={`text-5xl font-black tracking-tight tabular-nums transition-all duration-300 ${
              isPositive ? 'text-emerald-600' : 'text-red-600'
            } ${isAnimating ? 'scale-105' : 'scale-100'}`}
          >
            {formatCurrency(displayValue)}
          </div>

          {/* Profit/loss label */}
          <div className={`flex items-center gap-1.5 mt-2 text-sm font-medium ${
            isPositive ? 'text-emerald-600' : 'text-red-600'
          }`}>
            {isPositive ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>{isPositive ? 'Profitable day' : 'Net loss today'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
