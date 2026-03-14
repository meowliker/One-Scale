'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { CustomExpense, ExpenseCategory, ExpenseFrequency, ExpenseDistribution } from '@/types/pnlSettings';

interface ExpensePanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (expense: Omit<CustomExpense, 'id' | 'isActive'> & { id?: number }) => void;
  expense?: CustomExpense | null;
  currency?: string;
}

const FREQUENCY_OPTIONS: { value: ExpenseFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One-Time' },
];

const DISTRIBUTION_OPTIONS: { value: ExpenseDistribution; label: string }[] = [
  { value: 'daily', label: 'Spread evenly per day' },
  { value: 'hourly', label: 'Spread by hourly traffic' },
  { value: 'smart', label: 'Smart (revenue-weighted)' },
];

function computeImpact(amount: number, frequency: ExpenseFrequency) {
  let daily = 0;
  let monthly = 0;
  let yearly = 0;
  switch (frequency) {
    case 'daily': daily = amount; monthly = amount * 30; yearly = amount * 365; break;
    case 'weekly': daily = amount / 7; monthly = amount * (52 / 12); yearly = amount * 52; break;
    case 'monthly': daily = amount / 30; monthly = amount; yearly = amount * 12; break;
    case 'yearly': daily = amount / 365; monthly = amount / 12; yearly = amount; break;
    case 'one_time': daily = amount; monthly = amount; yearly = amount; break;
  }
  return { daily, monthly, yearly };
}

export function ExpensePanel({ open, onClose, onSave, expense, currency = 'USD' }: ExpensePanelProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('fixed');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<ExpenseFrequency>('monthly');
  const [distribution, setDistribution] = useState<ExpenseDistribution>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (expense) {
        setName(expense.name);
        setCategory(expense.category);
        setAmount(String(expense.amount));
        setFrequency(expense.frequency);
        setDistribution(expense.distribution);
        setStartDate(expense.startDate || '');
        setEndDate(expense.endDate || '');
      } else {
        setName('');
        setCategory('fixed');
        setAmount('');
        setFrequency('monthly');
        setDistribution('daily');
        setStartDate('');
        setEndDate('');
      }
      setErrors({});
    }
  }, [open, expense]);

  const parsedAmount = parseFloat(amount) || 0;

  const impact = useMemo(() => {
    if (parsedAmount <= 0) return null;
    return computeImpact(parsedAmount, frequency);
  }, [parsedAmount, frequency]);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (parsedAmount <= 0) errs.amount = 'Amount must be greater than 0';
    if (frequency === 'one_time' && !startDate) errs.startDate = 'Start date required for one-time expenses';
    if (startDate && endDate && endDate < startDate) errs.endDate = 'End date must be after start date';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSave({
      id: expense?.id,
      name: name.trim(),
      category,
      amount: parsedAmount,
      frequency,
      distribution,
      startDate: startDate || null,
      endDate: endDate || null,
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="expense-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="expense-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed right-0 top-0 z-50 h-full w-[400px] max-w-full bg-surface border-l border-border shadow-2xl overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
              <h2 className="text-base font-bold text-text-primary">
                {expense ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
                <X className="h-4 w-4 text-text-secondary" />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Office Rent"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
              </div>

              {/* Category toggle */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Category</label>
                <div className="flex gap-2">
                  {(['fixed', 'variable'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        category === cat
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      {cat === 'fixed' ? 'Fixed' : 'Variable'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Amount ($)</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary/50" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                {errors.amount && <p className="text-xs text-red-400 mt-1">{errors.amount}</p>}
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Frequency</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                >
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Distribution (fixed category only) */}
              {category === 'fixed' && (
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Distribution</label>
                  <div className="space-y-2">
                    {DISTRIBUTION_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="distribution"
                          value={opt.value}
                          checked={distribution === opt.value}
                          onChange={() => setDistribution(opt.value)}
                          className="accent-accent"
                        />
                        <span className="text-sm text-text-primary">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Start / End date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  {errors.startDate && <p className="text-xs text-red-400 mt-1">{errors.startDate}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  {errors.endDate && <p className="text-xs text-red-400 mt-1">{errors.endDate}</p>}
                </div>
              </div>

              {/* Impact preview */}
              {impact && (
                <div className="rounded-lg border border-border bg-surface-hover/50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="h-3.5 w-3.5 text-accent" />
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Impact Preview</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Daily', value: impact.daily },
                      { label: 'Monthly', value: impact.monthly },
                      { label: 'Yearly', value: impact.yearly },
                    ].map((item) => (
                      <div key={item.label} className="text-center">
                        <p className="text-xs text-text-secondary mb-0.5">{item.label}</p>
                        <p className="text-sm font-semibold text-text-primary">{formatCurrency(item.value, currency)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
              >
                {expense ? 'Update' : 'Add Expense'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
