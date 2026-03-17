'use client';

import { useState, useEffect, useRef } from 'react';
import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { DataFreshness } from '@/components/ui/DataFreshness';

interface LivePulseRowProps {
  todayEntry: PnLEntry;
  summaryNetProfit: number;
  lastUpdated?: Date | string;
  currency?: string;
}

/** Smoothly animate a number from its previous value to the target (ease-out cubic). */
function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const start = prevRef.current;
    const diff = target - start;
    if (Math.abs(diff) < 0.01) {
      setDisplay(target);
      prevRef.current = target;
      return;
    }

    const startTime = performance.now();
    let raf: number;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round((start + diff * eased) * 100) / 100);
      if (t < 1) {
        raf = requestAnimationFrame(animate);
      } else {
        prevRef.current = target;
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

export function LivePulseRow({ todayEntry, summaryNetProfit, lastUpdated, currency = 'USD' }: LivePulseRowProps) {
  const netProfit = todayEntry.netProfit || summaryNetProfit;
  const isPositive = netProfit >= 0;
  const margin =
    todayEntry.revenue > 0
      ? (todayEntry.netProfit / todayEntry.revenue) * 100
      : 0;

  // Animate numbers when they change (Shopify-style smooth counting)
  const animNetProfit = useAnimatedNumber(netProfit);
  const animRevenue = useAnimatedNumber(todayEntry.revenue);
  const animAdSpend = useAnimatedNumber(todayEntry.adSpend);
  const animMargin = useAnimatedNumber(margin);
  const animOrders = useAnimatedNumber(todayEntry.orderCount ?? 0, 400);

  const marginColor =
    animMargin >= 15
      ? 'text-emerald-600 dark:text-emerald-400'
      : animMargin < 5
        ? 'text-red-600 dark:text-red-400'
        : 'text-amber-600 dark:text-amber-400';

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 lg:grid-cols-5 gap-3"
    >
      {/* Col 1: Net Profit Hero — no gradient, just border accent */}
      <motion.div
        variants={item}
        className={`p-5 col-span-2 lg:col-span-1 rounded-xl border-l-2 ${
          isPositive ? 'bg-emerald-500/10 border border-emerald-500/30 border-l-emerald-500' : 'bg-red-500/10 border border-red-500/30 border-l-red-500'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`} />
            </span>
            <span className="text-sm font-bold text-text-primary uppercase tracking-wide">
              Live · Today
            </span>
          </div>
          {lastUpdated && <DataFreshness lastUpdated={lastUpdated} />}
        </div>
        <div className={`text-4xl font-black tabular-nums tracking-tight ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {formatCurrency(animNetProfit, currency)}
        </div>
        <div className="text-sm font-medium text-text-secondary mt-1">Net Profit</div>
      </motion.div>

      {/* Col 2: Revenue */}
      <motion.div variants={item} className="apple-card p-5">
        <div className="text-xs font-bold text-text-secondary/60 uppercase mb-2">Revenue</div>
        <div className="text-2xl font-bold tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
          {formatCurrency(animRevenue, currency)}
        </div>
        <div className="flex items-center gap-1 mt-2 text-xs text-text-secondary">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>{Math.round(animOrders)} orders</span>
        </div>
      </motion.div>

      {/* Col 3: Ad Spend */}
      <motion.div variants={item} className="apple-card p-5">
        <div className="text-xs font-bold text-text-secondary/60 uppercase mb-2">Ad Spend</div>
        <div className="text-2xl font-bold tabular-nums tracking-tight text-red-600 dark:text-red-400">
          {formatCurrency(animAdSpend, currency)}
        </div>
        <div className="flex items-center gap-1 mt-2 text-xs text-text-secondary">
          <TrendingDown className="h-3.5 w-3.5" />
          <span>Cost</span>
        </div>
      </motion.div>

      {/* Col 4: Margin */}
      <motion.div variants={item} className="apple-card p-5">
        <div className="text-xs font-bold text-text-secondary/60 uppercase mb-2">Margin</div>
        <div className={`text-2xl font-bold tabular-nums tracking-tight ${marginColor}`}>
          {animMargin.toFixed(1)}%
        </div>
        <div className="flex items-center gap-1 mt-2 text-xs text-text-secondary">
          {animMargin >= 15 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          <span>of revenue</span>
        </div>
      </motion.div>

      {/* Col 5: Orders */}
      <motion.div variants={item} className="apple-card p-5">
        <div className="text-xs font-bold text-text-secondary/60 uppercase mb-2">Orders</div>
        <div className="text-2xl font-bold tabular-nums tracking-tight text-text-primary">
          {Math.round(animOrders)}
        </div>
        <div className="flex items-center gap-1 mt-2 text-xs text-text-secondary">
          <Activity className="h-3.5 w-3.5" />
          <span>today</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
