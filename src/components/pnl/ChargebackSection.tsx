'use client';

import { formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';

interface ChargebackSectionProps {
  chargebackLoss: number;
  chargebackWon: number;
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

export function ChargebackSection({ chargebackLoss, chargebackWon }: ChargebackSectionProps) {
  const hasLost = chargebackLoss > 0;
  const hasWon = chargebackWon > 0;
  const bothZero = !hasLost && !hasWon;

  return (
    <div>
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">Chargebacks</h3>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4"
      >
        {/* Lost */}
        <motion.div variants={item} className="apple-card p-5">
          <div className="text-xs font-semibold text-text-secondary/60 uppercase tracking-wide mb-2">Lost</div>
          <div
            className={`text-2xl font-bold tabular-nums tracking-tight ${
              hasLost ? 'text-red-500 dark:text-red-400' : 'text-text-secondary/30'
            }`}
          >
            {formatCurrency(chargebackLoss)}
          </div>
          <div
            className={`text-xs mt-1.5 ${
              hasLost ? 'text-text-secondary/60' : 'text-text-secondary/30'
            }`}
          >
            {hasLost ? 'Disputed & lost' : 'No lost chargebacks'}
          </div>
        </motion.div>

        {/* Recovered */}
        <motion.div variants={item} className="apple-card p-5">
          <div className="text-xs font-semibold text-text-secondary/60 uppercase tracking-wide mb-2">Recovered</div>
          <div
            className={`text-2xl font-bold tabular-nums tracking-tight ${
              hasWon ? 'text-emerald-500 dark:text-emerald-400' : 'text-text-secondary/30'
            }`}
          >
            {formatCurrency(chargebackWon)}
          </div>
          <div
            className={`text-xs mt-1.5 ${
              hasWon ? 'text-text-secondary/60' : 'text-text-secondary/30'
            }`}
          >
            {hasWon ? 'Disputed & won' : 'No recoveries'}
          </div>
        </motion.div>
      </motion.div>

      {bothZero && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-xs text-text-secondary/40 mt-3 leading-relaxed"
        >
          Chargebacks tracked automatically via Shopify webhooks. Data appears here if disputes are filed.
        </motion.p>
      )}
    </div>
  );
}
