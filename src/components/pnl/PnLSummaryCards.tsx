'use client';

import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Truck,
  CreditCard,
  ShoppingCart,
  RotateCcw,
} from 'lucide-react';
import { DataFreshness } from '@/components/ui/DataFreshness';
import { DeltaBadge } from '@/components/ui/DeltaBadge';
import { PNL_METRICS, type PnLMetricKey } from '@/lib/pnl/pnlMetricConfig';

interface PnLSummaryCardsProps {
  entry: PnLEntry;
  comparison?: PnLEntry;
  isDigital?: boolean;
  lastUpdated?: Date | string;
  currency?: string;
}

interface CardConfig {
  label: string;
  digitalLabel?: string;
  key: keyof PnLEntry;
  metricKey: PnLMetricKey;
  icon: React.ReactNode;
  accentClass: string;
  isCost: boolean;
  hideForDigital?: boolean;
}

const cards: CardConfig[] = [
  {
    label: 'Revenue',
    key: 'revenue',
    metricKey: 'revenue',
    icon: <DollarSign className="h-4 w-4" />,
    accentClass: 'text-emerald-500',
    isCost: false,
  },
  {
    label: 'COGS',
    key: 'cogs',
    metricKey: 'cogs',
    icon: <Package className="h-4 w-4" />,
    accentClass: 'text-red-500',
    isCost: true,
    hideForDigital: true,
  },
  {
    label: 'Ad Spend',
    key: 'adSpend',
    metricKey: 'adSpend',
    icon: <CreditCard className="h-4 w-4" />,
    accentClass: 'text-orange-500',
    isCost: true,
  },
  {
    label: 'Shipping + Fees',
    digitalLabel: 'Transaction Fees',
    key: 'shipping',
    metricKey: 'shipping',
    icon: <Truck className="h-4 w-4" />,
    accentClass: 'text-amber-500',
    isCost: true,
  },
  {
    label: 'Refunds',
    key: 'refunds',
    metricKey: 'refunds',
    icon: <RotateCcw className="h-4 w-4" />,
    accentClass: 'text-rose-500',
    isCost: true,
  },
];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function PnLSummaryCards({ entry, comparison, isDigital = false, lastUpdated, currency = 'USD' }: PnLSummaryCardsProps) {
  const shippingAndFees = entry.shipping + entry.fees;
  const visibleCards = isDigital ? cards.filter((c) => !c.hideForDigital) : cards;
  const isPositiveProfit = entry.netProfit >= 0;

  return (
    <div>
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
    >
      {visibleCards.map((card) => {
        let rawValue: number;
        if (card.key === 'shipping' && isDigital) {
          rawValue = entry.fees;
        } else if (card.key === 'shipping') {
          rawValue = shippingAndFees;
        } else {
          rawValue = entry[card.key] as number;
        }

        const displayLabel = isDigital && card.digitalLabel ? card.digitalLabel : card.label;

        return (
          <motion.div
            key={card.key}
            variants={item}
            className="apple-card p-4 group hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-text-secondary/60 uppercase tracking-wide">
                {displayLabel}
              </span>
              <span className={`${card.accentClass} opacity-50`}>
                {card.icon}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-bold tabular-nums tracking-tight ${
                  card.isCost ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatCurrency(rawValue, currency)}
              </span>
            </div>
            {comparison && (
              <div className="mt-1">
                <DeltaBadge
                  current={rawValue}
                  previous={card.key === 'shipping' && isDigital
                    ? comparison.fees
                    : card.key === 'shipping'
                      ? comparison.shipping + comparison.fees
                      : (comparison[card.key] as number)}
                  polarity={PNL_METRICS[card.metricKey].polarity}
                  format={PNL_METRICS[card.metricKey].format}
                  size="sm"
                />
              </div>
            )}
            {card.key === 'revenue' && (
              <div className="mt-1.5 space-y-0.5">
                {entry.orderCount != null && entry.orderCount > 0 && (
                  <div className="flex items-center gap-1 text-xs text-text-secondary/50">
                    <ShoppingCart className="h-3 w-3" />
                    <span>{entry.orderCount.toLocaleString()} orders</span>
                  </div>
                )}
                {entry.grossRevenue != null && entry.settledRevenue != null && entry.settledRevenue > 0 && entry.grossRevenue !== entry.settledRevenue && (
                  <div className="text-[10px] text-text-secondary/40">
                    Gross: {formatCurrency(entry.grossRevenue, currency)}
                  </div>
                )}
              </div>
            )}
            {card.key === 'refunds' && ((entry.fullRefundCount || 0) > 0 || (entry.partialRefundCount || 0) > 0) && (
              <div className="mt-1.5 space-y-0.5">
                {(entry.fullRefundCount || 0) > 0 && (
                  <div className="flex items-center gap-1 text-xs text-text-secondary/50">
                    <span>{entry.fullRefundCount} full ({formatCurrency(entry.fullRefundAmount || 0, currency)})</span>
                  </div>
                )}
                {(entry.partialRefundCount || 0) > 0 && (
                  <div className="flex items-center gap-1 text-xs text-text-secondary/50">
                    <span>{entry.partialRefundCount} partial ({formatCurrency(entry.partialRefundAmount || 0, currency)})</span>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        );
      })}

      {/* Net Profit card — slightly emphasized */}
      <motion.div
        variants={item}
        className={`apple-card p-4 relative overflow-hidden group hover:shadow-md transition-shadow ${
          isPositiveProfit
            ? 'ring-1 ring-emerald-500/20'
            : 'ring-1 ring-red-500/20'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-text-secondary/60 uppercase tracking-wide">
            Net Profit
          </span>
          {isPositiveProfit ? (
            <TrendingUp className="h-4 w-4 text-emerald-500 opacity-60" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500 opacity-60" />
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-2xl font-extrabold tabular-nums tracking-tight ${
              isPositiveProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatCurrency(entry.netProfit, currency)}
          </span>
        </div>
        {entry.revenue > 0 && (
          <div className="mt-1.5 text-xs text-text-secondary/50">
            {entry.margin.toFixed(1)}% margin
          </div>
        )}
        {comparison && (
          <div className="mt-1">
            <DeltaBadge
              current={entry.netProfit}
              previous={comparison.netProfit}
              polarity="up_good"
              format="currency"
              size="sm"
            />
          </div>
        )}
      </motion.div>
    </motion.div>
    {lastUpdated && (
      <div className="flex justify-end mt-2">
        <DataFreshness lastUpdated={lastUpdated} />
      </div>
    )}
    </div>
  );
}
