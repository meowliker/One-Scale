'use client';

import type { PnLEntry } from '@/types/pnl';
import { cn, formatCurrency } from '@/lib/utils';
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

interface PnLSummaryCardsProps {
  entry: PnLEntry;
  isDigital?: boolean;
}

interface CardConfig {
  label: string;
  digitalLabel?: string;
  key: keyof PnLEntry;
  icon: React.ReactNode;
  borderColor: string;
  isCost: boolean;
  hideForDigital?: boolean;
}

const cards: CardConfig[] = [
  {
    label: 'Revenue',
    key: 'revenue',
    icon: <DollarSign className="h-5 w-5 text-emerald-600" />,
    borderColor: 'border-l-emerald-500',
    isCost: false,
  },
  {
    label: 'COGS',
    key: 'cogs',
    icon: <Package className="h-5 w-5 text-red-500" />,
    borderColor: 'border-l-red-500',
    isCost: true,
    hideForDigital: true,
  },
  {
    label: 'Ad Spend',
    key: 'adSpend',
    icon: <CreditCard className="h-5 w-5 text-red-500" />,
    borderColor: 'border-l-orange-500',
    isCost: true,
  },
  {
    label: 'Shipping + Fees',
    digitalLabel: 'Transaction Fees',
    key: 'shipping',
    icon: <Truck className="h-5 w-5 text-red-500" />,
    borderColor: 'border-l-amber-500',
    isCost: true,
  },
  {
    label: 'Refunds',
    key: 'refunds',
    icon: <TrendingDown className="h-5 w-5 text-red-500" />,
    borderColor: 'border-l-rose-500',
    isCost: true,
  },
];

export function PnLSummaryCards({ entry, isDigital = false }: PnLSummaryCardsProps) {
  const shippingAndFees = entry.shipping + entry.fees;
  const visibleCards = isDigital ? cards.filter((c) => !c.hideForDigital) : cards;
  const isPositiveProfit = entry.netProfit >= 0;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      {visibleCards.map((card) => {
        let rawValue: number;
        if (card.key === 'shipping' && isDigital) {
          // For digital: only show transaction fees (no shipping cost)
          rawValue = entry.fees;
        } else if (card.key === 'shipping') {
          rawValue = shippingAndFees;
        } else {
          rawValue = entry[card.key] as number;
        }

        const displayLabel = isDigital && card.digitalLabel ? card.digitalLabel : card.label;

        return (
          <div
            key={card.key}
            className={cn(
              'rounded-lg border border-l-4 bg-surface-elevated p-4 shadow-sm',
              card.borderColor
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-muted">
                {displayLabel}
              </span>
              {card.icon}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {card.isCost ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              )}
              <span
                className={cn(
                  'text-lg font-semibold',
                  card.isCost ? 'text-red-600' : 'text-emerald-700'
                )}
              >
                {formatCurrency(rawValue)}
              </span>
            </div>
            {card.key === 'revenue' && entry.orderCount != null && entry.orderCount > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-xs text-text-muted">
                <ShoppingCart className="h-3 w-3" />
                <span>{entry.orderCount.toLocaleString()} orders</span>
              </div>
            )}
            {card.key === 'refunds' && ((entry.fullRefundCount || 0) > 0 || (entry.partialRefundCount || 0) > 0) && (
              <div className="mt-1.5 space-y-0.5">
                {(entry.fullRefundCount || 0) > 0 && (
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <RotateCcw className="h-3 w-3" />
                    <span>{entry.fullRefundCount} full ({formatCurrency(entry.fullRefundAmount || 0)})</span>
                  </div>
                )}
                {(entry.partialRefundCount || 0) > 0 && (
                  <div className="flex items-center gap-1 text-xs text-text-muted">
                    <RotateCcw className="h-3 w-3" />
                    <span>{entry.partialRefundCount} partial ({formatCurrency(entry.partialRefundAmount || 0)})</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Net Profit card */}
      <div
        className={cn(
          'rounded-lg border border-l-4 bg-surface-elevated p-4 shadow-sm',
          isPositiveProfit ? 'border-l-emerald-500' : 'border-l-red-500'
        )}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-text-muted">Net Profit</span>
          <DollarSign
            className={cn(
              'h-5 w-5',
              isPositiveProfit ? 'text-emerald-600' : 'text-red-500'
            )}
          />
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {isPositiveProfit ? (
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span
            className={cn(
              'text-xl font-bold',
              isPositiveProfit ? 'text-emerald-700' : 'text-red-600'
            )}
          >
            {formatCurrency(entry.netProfit)}
          </span>
        </div>
      </div>
    </div>
  );
}
