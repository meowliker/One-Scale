'use client';

import { motion } from 'framer-motion';
import type { Polarity, MetricFormat } from '@/lib/pnl/pnlMetricConfig';

interface DeltaBadgeProps {
  current: number;
  previous: number;
  polarity: Polarity;
  format: MetricFormat;
  size?: 'sm' | 'md';
}

export function DeltaBadge({ current, previous, polarity, format, size = 'sm' }: DeltaBadgeProps) {
  if (current === 0 && previous === 0) return null;

  if (previous === 0 && current > 0) {
    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 font-semibold text-blue-600 dark:text-blue-400 ${
          size === 'sm' ? 'text-[10px]' : 'text-xs'
        }`}
      >
        NEW
      </motion.span>
    );
  }

  const pctChange = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  const isUp = pctChange > 0;
  const isDown = pctChange < 0;
  const isFlat = pctChange === 0;

  let colorClass: string;
  if (isFlat) {
    colorClass = 'text-zinc-400 bg-zinc-500/10';
  } else if (polarity === 'neutral') {
    colorClass = 'text-blue-600 dark:text-blue-400 bg-blue-500/10';
  } else if (polarity === 'up_good') {
    colorClass = isUp
      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
      : 'text-red-600 dark:text-red-400 bg-red-500/10';
  } else {
    colorClass = isDown
      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
      : 'text-red-600 dark:text-red-400 bg-red-500/10';
  }

  const arrow = isUp ? '\u25B2' : isDown ? '\u25BC' : '\u2014';
  const sign = isUp ? '+' : '';
  const displayValue = `${sign}${pctChange.toFixed(1)}%`;

  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums ${colorClass} ${
        size === 'sm' ? 'text-[10px]' : 'text-xs'
      }`}
    >
      <span>{arrow}</span>
      <span>{displayValue}</span>
    </motion.span>
  );
}
