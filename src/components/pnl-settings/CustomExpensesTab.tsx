'use client';

import { useState } from 'react';
import {
  Receipt,
  Plus,
  Trash2,
  Pencil,
  CalendarDays,
  DollarSign,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  CustomExpense,
  ExpenseCategory,
  ExpenseFrequency,
  ExpenseDistribution,
} from '@/types/pnlSettings';

interface CustomExpensesTabProps {
  expenses: CustomExpense[];
  onAdd: (data: CustomExpense) => void;
  onUpdate: (data: CustomExpense) => void;
  onDelete: (id: number) => void;
}

const frequencyLabels: Record<ExpenseFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
  one_time: 'One-time',
};

const distributionLabels: Record<ExpenseDistribution, string> = {
  daily: 'Daily — Recognized at midnight',
  hourly: 'Hourly — 1/24 recognized each hour',
  smart: 'Smart — Based on your sales distribution',
};

const categoryLabels: Record<ExpenseCategory, { label: string; description: string }> = {
  fixed: { label: 'Fixed', description: 'Constant cost (rent, salaries, subscriptions)' },
  variable: { label: 'Variable', description: 'Scales with activity (commissions, packaging)' },
};

const emptyExpense: CustomExpense = {
  name: '',
  category: 'fixed',
  amount: 0,
  frequency: 'monthly',
  distribution: 'daily',
  startDate: null,
  endDate: null,
  isActive: true,
};

export function CustomExpensesTab({
  expenses,
  onAdd,
  onUpdate,
  onDelete,
}: CustomExpensesTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<CustomExpense | null>(null);
  const [draft, setDraft] = useState<CustomExpense>(emptyExpense);

  const fixedExpenses = expenses.filter((e) => e.category === 'fixed');
  const variableExpenses = expenses.filter((e) => e.category === 'variable');

  const totalMonthly = expenses.reduce((sum, e) => {
    if (!e.isActive) return sum;
    switch (e.frequency) {
      case 'daily': return sum + e.amount * 30;
      case 'weekly': return sum + e.amount * 4.33;
      case 'monthly': return sum + e.amount;
      case 'yearly': return sum + e.amount / 12;
      case 'one_time': return sum + e.amount / 12; // amortize
      default: return sum;
    }
  }, 0);

  const openAdd = () => {
    setDraft(emptyExpense);
    setEditingExpense(null);
    setShowForm(true);
  };

  const openEdit = (expense: CustomExpense) => {
    setDraft({ ...expense });
    setEditingExpense(expense);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!draft.name.trim() || draft.amount <= 0) return;
    if (editingExpense?.id) {
      onUpdate({ ...draft, id: editingExpense.id });
    } else {
      onAdd(draft);
    }
    setShowForm(false);
    setEditingExpense(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingExpense(null);
  };

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Expenses</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{expenses.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Active</p>
          <p className="mt-1 text-xl font-bold text-green-600">
            {expenses.filter((e) => e.isActive).length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Est. Monthly Cost</p>
          <p className="mt-1 text-xl font-bold text-gray-900">${totalMonthly.toFixed(2)}</p>
        </div>
      </div>

      {/* Add button */}
      <div className="flex justify-end">
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Expense
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {editingExpense ? 'Edit Expense' : 'Add New Expense'}
            </h3>
            <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-gray-600">Expense Name *</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Office Rent, SaaS Tools"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="text-xs font-medium text-gray-600">Amount *</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  value={draft.amount || ''}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: parseFloat(e.target.value) || 0 }))}
                  className="w-full rounded-lg border border-gray-300 pl-7 pr-4 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                  min={0}
                  step={0.01}
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-medium text-gray-600">Category</label>
              <div className="mt-1 flex gap-2">
                {(Object.entries(categoryLabels) as [ExpenseCategory, { label: string; description: string }][]).map(
                  ([key, { label }]) => (
                    <button
                      key={key}
                      onClick={() => setDraft((d) => ({ ...d, category: key }))}
                      className={cn(
                        'flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all',
                        draft.category === key
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      )}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Frequency */}
            <div>
              <label className="text-xs font-medium text-gray-600">Frequency</label>
              <select
                value={draft.frequency}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, frequency: e.target.value as ExpenseFrequency }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
              >
                {Object.entries(frequencyLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Distribution */}
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Recognition Method</label>
              <select
                value={draft.distribution}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, distribution: e.target.value as ExpenseDistribution }))
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
              >
                {Object.entries(distributionLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div>
              <label className="text-xs font-medium text-gray-600">Start Date (optional)</label>
              <input
                type="date"
                value={draft.startDate || ''}
                onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value || null }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">End Date (optional)</label>
              <input
                type="date"
                value={draft.endDate || ''}
                onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value || null }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!draft.name.trim() || draft.amount <= 0}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                draft.name.trim() && draft.amount > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {editingExpense ? 'Update Expense' : 'Add Expense'}
            </button>
          </div>
        </div>
      )}

      {/* Expense lists */}
      {expenses.length === 0 && !showForm ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <Receipt className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No custom expenses configured yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Add your fixed costs (rent, salaries) and variable costs (packaging, commissions).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Fixed expenses */}
          {fixedExpenses.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-3 bg-gray-50">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Fixed Expenses
                </h4>
              </div>
              <div className="divide-y divide-gray-100">
                {fixedExpenses.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onEdit={() => openEdit(expense)}
                    onDelete={() => expense.id && onDelete(expense.id)}
                    onToggle={() => onUpdate({ ...expense, isActive: !expense.isActive })}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Variable expenses */}
          {variableExpenses.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-3 bg-gray-50">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Variable Expenses
                </h4>
              </div>
              <div className="divide-y divide-gray-100">
                {variableExpenses.map((expense) => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onEdit={() => openEdit(expense)}
                    onDelete={() => expense.id && onDelete(expense.id)}
                    onToggle={() => onUpdate({ ...expense, isActive: !expense.isActive })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  onEdit,
  onDelete,
  onToggle,
}: {
  expense: CustomExpense;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'text-sm font-medium',
              expense.isActive ? 'text-gray-900' : 'text-gray-400 line-through'
            )}
          >
            {expense.name}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
            {frequencyLabels[expense.frequency]}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-500">
            ${expense.amount.toFixed(2)} / {expense.frequency === 'one_time' ? 'one-time' : expense.frequency}
          </span>
          {expense.startDate && (
            <span className="flex items-center gap-1 text-[10px] text-gray-400">
              <CalendarDays className="h-3 w-3" />
              {expense.startDate}{expense.endDate ? ` → ${expense.endDate}` : '+'}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggle}
          className={cn(
            'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
            expense.isActive
              ? 'bg-green-50 text-green-700 hover:bg-green-100'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          )}
        >
          {expense.isActive ? 'Active' : 'Off'}
        </button>
        <button
          onClick={onEdit}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
