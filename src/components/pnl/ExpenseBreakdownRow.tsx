'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Receipt, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ExpenseItem {
  name: string;
  amount: number;
}

interface ExpenseBreakdownRowProps {
  totalExpenses: number;
  revenue: number;
  breakdown: ExpenseItem[];
  currency?: string;
}

export function ExpenseBreakdownRow({ totalExpenses, revenue, breakdown, currency = 'USD' }: ExpenseBreakdownRowProps) {
  const [expanded, setExpanded] = useState(false);
  const pct = revenue > 0 ? (totalExpenses / revenue) * 100 : 0;

  return (
    <div className="apple-card mt-4 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface-hover"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
            <Receipt className="h-4 w-4 text-purple-500" />
          </div>
          <div>
            <span className="text-sm font-semibold text-text-primary">Custom Expenses</span>
            <span className="ml-2 text-xs text-text-secondary">({breakdown.length} items)</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text-primary">
            {formatCurrency(totalExpenses, currency)}
            <span className="ml-1.5 text-xs text-text-secondary/60">({pct.toFixed(1)}%)</span>
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-text-secondary" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expense-breakdown"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 py-3 space-y-2">
              {breakdown.map((item) => {
                const itemPct = revenue > 0 ? (item.amount / revenue) * 100 : 0;
                return (
                  <div key={item.name} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-text-secondary">{item.name}</span>
                    <span className="text-sm font-medium text-text-primary">
                      {formatCurrency(item.amount, currency)}
                      <span className="ml-1.5 text-xs text-text-secondary/50">({itemPct.toFixed(1)}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
