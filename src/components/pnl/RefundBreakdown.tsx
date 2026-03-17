'use client';

import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';

interface RefundBreakdownProps {
  entry: PnLEntry;
  currency?: string;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function RefundBreakdown({ entry, currency = 'USD' }: RefundBreakdownProps) {
  const fullCount = entry.fullRefundCount || 0;
  const partialCount = entry.partialRefundCount || 0;
  const totalCount = fullCount + partialCount;
  const fullAmount = entry.fullRefundAmount || 0;
  const partialAmount = entry.partialRefundAmount || 0;
  const refundPercent =
    entry.revenue > 0 ? ((entry.refunds / entry.revenue) * 100).toFixed(1) : '0.0';

  const cards = [
    {
      label: 'Total Refunds',
      amount: entry.refunds,
      sub: `${totalCount} refunds · ${refundPercent}% of revenue`,
    },
    {
      label: 'Full Refunds',
      amount: fullAmount,
      sub: `${fullCount} orders fully refunded`,
    },
    {
      label: 'Partial Refunds',
      amount: partialAmount,
      sub: `${partialCount} orders partially refunded`,
    },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-3 gap-4"
    >
      {cards.map((card) => {
        const hasValue = card.amount > 0;
        return (
          <motion.div
            key={card.label}
            variants={item}
            className="apple-card p-5"
          >
            <div className="text-xs font-semibold text-text-secondary/60 uppercase tracking-wide mb-2">
              {card.label}
            </div>
            <div
              className={`text-2xl font-bold tabular-nums tracking-tight ${
                hasValue ? 'text-red-500 dark:text-red-400' : 'text-text-secondary/30'
              }`}
            >
              {formatCurrency(card.amount, currency)}
            </div>
            <div
              className={`text-xs mt-1.5 ${
                hasValue ? 'text-text-secondary/60' : 'text-text-secondary/30'
              }`}
            >
              {card.sub}
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
