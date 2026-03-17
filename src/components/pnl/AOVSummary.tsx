'use client';

import type { ProductPnLData } from '@/types/productPnl';
import { formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';

interface AOVSummaryProps {
  products: ProductPnLData[];
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

export function AOVSummary({ products, currency = 'USD' }: AOVSummaryProps) {
  const safeProducts = products ?? [];

  const mainProducts = safeProducts.filter((p) => p.category === 'main');
  const upsellProducts = safeProducts.filter(
    (p) => p.category !== 'main' && p.category !== 'addon'
  );

  const mainRevenue = mainProducts.reduce((sum, p) => sum + p.revenue, 0);
  const mainUnits = mainProducts.reduce((sum, p) => sum + p.unitsSold, 0);
  const totalRevenue = safeProducts.reduce((sum, p) => sum + p.revenue, 0);
  const totalUnits = safeProducts.reduce((sum, p) => sum + p.unitsSold, 0);

  const mainAOV = mainUnits > 0 ? mainRevenue / mainUnits : 0;
  const allAOV = totalUnits > 0 ? totalRevenue / totalUnits : 0;
  const aovLift = mainAOV > 0 ? ((allAOV - mainAOV) / mainAOV) * 100 : 0;
  const takeRate =
    safeProducts.length > 0 ? (upsellProducts.length / safeProducts.length) * 100 : 0;

  const cards = [
    {
      label: 'AOV (Main)',
      value: formatCurrency(mainAOV, currency),
      color: 'text-text-primary',
    },
    {
      label: 'AOV (With Upsells)',
      value: formatCurrency(allAOV, currency),
      color: 'text-emerald-500 dark:text-emerald-400',
    },
    {
      label: 'AOV Lift',
      value: `${aovLift >= 0 ? '+' : ''}${aovLift.toFixed(1)}%`,
      color: aovLift >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400',
    },
    {
      label: 'Upsell Take Rate',
      value: `${takeRate.toFixed(0)}%`,
      color: 'text-text-primary',
    },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-4 gap-4"
    >
      {cards.map((card) => (
        <motion.div
          key={card.label}
          variants={item}
          className="apple-card p-5"
        >
          <div className="text-xs font-semibold text-text-secondary/60 uppercase tracking-wide mb-2">
            {card.label}
          </div>
          <div className={`text-2xl font-bold tabular-nums tracking-tight ${card.color}`}>
            {card.value}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
