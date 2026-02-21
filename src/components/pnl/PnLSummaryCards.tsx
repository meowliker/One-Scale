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
  iconBg: string;
  stripColor: string;
  isCost: boolean;
  hideForDigital?: boolean;
}

const cards: CardConfig[] = [
  {
    label: 'Revenue',
    key: 'revenue',
    icon: <DollarSign className="h-4 w-4 text-emerald-600" />,
    iconBg: 'bg-emerald-50',
    stripColor: 'bg-emerald-500',
    isCost: false,
  },
  {
    label: 'COGS',
    key: 'cogs',
    icon: <Package className="h-4 w-4 text-red-500" />,
    iconBg: 'bg-red-50',
    stripColor: 'bg-red-500',
    isCost: true,
    hideForDigital: true,
  },
  {
    label: 'Ad Spend',
    key: 'adSpend',
    icon: <CreditCard className="h-4 w-4 text-orange-500" />,
    iconBg: 'bg-orange-50',
    stripColor: 'bg-orange-500',
    isCost: true,
  },
  {
    label: 'Shipping + Fees',
    digitalLabel: 'Transaction Fees',
    key: 'shipping',
    icon: <Truck className="h-4 w-4 text-amber-500" />,
    iconBg: 'bg-amber-50',
    stripColor: 'bg-amber-500',
    isCost: true,
  },
  {
    label: 'Refunds',
    key: 'refunds',
    icon: <TrendingDown className="h-4 w-4 text-violet-500" />,
    iconBg: 'bg-violet-50',
    stripColor: 'bg-violet-500',
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
              'bg-white rounded-2xl p-5 shadow-sm border border-gray-100',
              'hover:shadow-md transition-all duration-200 hover:scale-[1.01]',
              'relative overflow-hidden cursor-default'
            )}
          >
            {/* Left colored strip */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${card.stripColor}`} />

            {/* Content */}
            <div className="pl-2">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {displayLabel}
                </span>
                <div className={cn('p-2 rounded-xl', card.iconBg)}>
                  {card.icon}
                </div>
              </div>

              <div
                className={cn(
                  'text-2xl font-bold tabular-nums',
                  card.isCost ? 'text-gray-800' : 'text-emerald-600'
                )}
              >
                {formatCurrency(rawValue)}
              </div>

              {card.isCost && (
                <div className="flex items-center gap-1 mt-1.5">
                  <TrendingDown className="h-3 w-3 text-red-400" />
                  <span className="text-xs text-gray-400">Cost</span>
                </div>
              )}
              {!card.isCost && (
                <div className="flex items-center gap-1 mt-1.5">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  <span className="text-xs text-gray-400">Income</span>
                </div>
              )}

              {card.key === 'revenue' && entry.orderCount != null && entry.orderCount > 0 && (
                <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                  <ShoppingCart className="h-3 w-3" />
                  <span>{entry.orderCount.toLocaleString()} orders</span>
                </div>
              )}

              {card.key === 'refunds' && ((entry.fullRefundCount || 0) > 0 || (entry.partialRefundCount || 0) > 0) && (
                <div className="mt-1.5 space-y-0.5">
                  {(entry.fullRefundCount || 0) > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <RotateCcw className="h-3 w-3" />
                      <span>{entry.fullRefundCount} full ({formatCurrency(entry.fullRefundAmount || 0)})</span>
                    </div>
                  )}
                  {(entry.partialRefundCount || 0) > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <RotateCcw className="h-3 w-3" />
                      <span>{entry.partialRefundCount} partial ({formatCurrency(entry.partialRefundAmount || 0)})</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Net Profit card */}
      <div
        className={cn(
          'bg-white rounded-2xl p-5 shadow-sm border border-gray-100',
          'hover:shadow-md transition-all duration-200 hover:scale-[1.01]',
          'relative overflow-hidden cursor-default'
        )}
      >
        {/* Left colored strip */}
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl',
            isPositiveProfit ? 'bg-emerald-500' : 'bg-red-500'
          )}
        />

        <div className="pl-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Net Profit
            </span>
            <div className={cn(
              'p-2 rounded-xl',
              isPositiveProfit ? 'bg-emerald-50' : 'bg-red-50'
            )}>
              <DollarSign className={cn(
                'h-4 w-4',
                isPositiveProfit ? 'text-emerald-600' : 'text-red-500'
              )} />
            </div>
          </div>

          <div
            className={cn(
              'text-2xl font-bold tabular-nums',
              isPositiveProfit ? 'text-emerald-600' : 'text-red-600'
            )}
          >
            {formatCurrency(entry.netProfit)}
          </div>

          <div className="flex items-center gap-1 mt-1.5">
            {isPositiveProfit ? (
              <TrendingUp className="h-3 w-3 text-emerald-500" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-400" />
            )}
            <span className="text-xs text-gray-400">
              {isPositiveProfit ? 'Profitable' : 'Net loss'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
