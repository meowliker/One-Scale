'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Upload, Download, Pencil, Trash2, ChevronDown, Receipt, DollarSign, Layers, FileText } from 'lucide-react';
import { useStoreStore } from '@/stores/storeStore';
import { formatCurrency } from '@/lib/utils';
import { ExpensePanel } from '@/components/pnl/ExpensePanel';
import type { CustomExpense, ExpenseCategory, ExpenseFrequency } from '@/types/pnlSettings';
import toast from 'react-hot-toast';

interface DbExpense {
  id: number;
  store_id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  frequency: ExpenseFrequency;
  distribution: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

function toMonthlyEstimate(amount: number, frequency: ExpenseFrequency): number {
  switch (frequency) {
    case 'daily': return amount * 30;
    case 'weekly': return amount * (52 / 12);
    case 'monthly': return amount;
    case 'yearly': return amount / 12;
    case 'one_time': return amount;
  }
}

function frequencyLabel(f: ExpenseFrequency): string {
  return { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly', one_time: 'One-Time' }[f];
}

const CSV_TEMPLATE = 'name,category,amount,frequency,distribution,start_date,end_date\nOffice Rent,fixed,2000,monthly,daily,,\nFacebook Ads Agency,variable,1500,monthly,daily,,\nDomain Renewal,fixed,15,yearly,daily,2026-01-01,';

export default function ExpensesPage() {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [expenses, setExpenses] = useState<DbExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<CustomExpense | null>(null);
  const [fixedCollapsed, setFixedCollapsed] = useState(false);
  const [variableCollapsed, setVariableCollapsed] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pnl/expenses?storeId=${encodeURIComponent(activeStoreId)}`);
      const json = await res.json();
      if (json.ok && json.data) setExpenses(json.data);
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const fixedExpenses = useMemo(() => expenses.filter((e) => e.category === 'fixed'), [expenses]);
  const variableExpenses = useMemo(() => expenses.filter((e) => e.category === 'variable'), [expenses]);

  const activeCount = useMemo(() => expenses.filter((e) => e.is_active).length, [expenses]);
  const monthlyEstimate = useMemo(
    () => expenses.filter((e) => e.is_active).reduce((sum, e) => sum + toMonthlyEstimate(e.amount, e.frequency), 0),
    [expenses]
  );
  const fixedTotal = useMemo(
    () => fixedExpenses.filter((e) => e.is_active).reduce((sum, e) => sum + toMonthlyEstimate(e.amount, e.frequency), 0),
    [fixedExpenses]
  );
  const variableTotal = useMemo(
    () => variableExpenses.filter((e) => e.is_active).reduce((sum, e) => sum + toMonthlyEstimate(e.amount, e.frequency), 0),
    [variableExpenses]
  );

  function openAdd() {
    setEditingExpense(null);
    setPanelOpen(true);
  }

  function openEdit(exp: DbExpense) {
    setEditingExpense({
      id: exp.id,
      name: exp.name,
      category: exp.category,
      amount: exp.amount,
      frequency: exp.frequency,
      distribution: exp.distribution as any,
      startDate: exp.start_date,
      endDate: exp.end_date,
      isActive: exp.is_active,
    });
    setPanelOpen(true);
  }

  async function handleSave(data: Omit<CustomExpense, 'id' | 'isActive'> & { id?: number }) {
    try {
      if (data.id) {
        await fetch('/api/pnl/expenses', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.id, storeId: activeStoreId, ...data }),
        });
        toast.success('Expense updated');
      } else {
        await fetch('/api/pnl/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: activeStoreId, ...data }),
        });
        toast.success('Expense added');
      }
      setPanelOpen(false);
      fetchExpenses();
    } catch {
      toast.error('Failed to save expense');
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this expense?')) return;
    try {
      await fetch(`/api/pnl/expenses?id=${id}&storeId=${encodeURIComponent(activeStoreId)}`, { method: 'DELETE' });
      toast.success('Expense deleted');
      fetchExpenses();
    } catch {
      toast.error('Failed to delete');
    }
  }

  async function handleToggle(exp: DbExpense) {
    try {
      await fetch('/api/pnl/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: exp.id, storeId: activeStoreId, isActive: !exp.is_active }),
      });
      fetchExpenses();
    } catch {
      toast.error('Failed to toggle');
    }
  }

  async function handleImport() {
    if (!csvText.trim()) { toast.error('Paste CSV data first'); return; }
    setImporting(true);
    try {
      const res = await fetch(`/api/pnl/expenses/import?storeId=${encodeURIComponent(activeStoreId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(`Imported ${json.imported}, updated ${json.updated}`);
        if (json.errors?.length) toast.error(`${json.errors.length} row errors`);
        setCsvText('');
        fetchExpenses();
      } else {
        toast.error(json.error || 'Import failed');
      }
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expenses_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderTable(items: DbExpense[], collapsed: boolean, onToggleCollapse: () => void, groupLabel: string) {
    return (
      <div className="apple-card overflow-hidden">
        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-surface-hover transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-bold text-text-primary uppercase tracking-wide">{groupLabel}</span>
            <span className="text-xs text-text-secondary bg-surface-hover px-2 py-0.5 rounded-full">{items.length}</span>
          </div>
          <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-text-secondary" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              {items.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-text-secondary">No {groupLabel.toLowerCase()} expenses</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-border text-left text-xs font-semibold text-text-secondary uppercase tracking-wide">
                      <th className="px-5 py-2.5">Name</th>
                      <th className="px-3 py-2.5">Amount</th>
                      <th className="px-3 py-2.5">Frequency</th>
                      <th className="px-3 py-2.5">Monthly Est.</th>
                      <th className="px-3 py-2.5 text-center">Active</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((exp) => (
                      <tr key={exp.id} className="border-t border-border hover:bg-surface-hover/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-text-primary">{exp.name}</td>
                        <td className="px-3 py-3 text-text-primary">{formatCurrency(exp.amount)}</td>
                        <td className="px-3 py-3 text-text-secondary">{frequencyLabel(exp.frequency)}</td>
                        <td className="px-3 py-3 font-medium text-text-primary">{formatCurrency(toMonthlyEstimate(exp.amount, exp.frequency))}</td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => handleToggle(exp)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${exp.is_active ? 'bg-accent' : 'bg-surface-hover'}`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${exp.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button onClick={() => openEdit(exp)} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors" title="Edit">
                              <Pencil className="h-3.5 w-3.5 text-text-secondary" />
                            </button>
                            <button onClick={() => handleDelete(exp.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (!activeStoreId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-text-secondary text-sm">Select a store to manage expenses</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Expense Manager</h1>
          <p className="text-sm text-text-secondary mt-0.5">Track fixed and variable costs that affect your P&L</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => { const el = document.getElementById('csv-import-section'); el?.scrollIntoView({ behavior: 'smooth' }); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="apple-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
              <Receipt className="h-4 w-4 text-accent" />
            </div>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Active Expenses</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{activeCount}</p>
        </div>
        <div className="apple-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Monthly Estimate</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">{formatCurrency(monthlyEstimate)}</p>
        </div>
        <div className="apple-card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
              <Layers className="h-4 w-4 text-purple-500" />
            </div>
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Fixed / Variable</span>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {formatCurrency(fixedTotal)} <span className="text-sm text-text-secondary font-normal">/ {formatCurrency(variableTotal)}</span>
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="apple-card p-10 text-center">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-text-secondary/20 border-t-text-primary" />
          <p className="text-sm text-text-secondary mt-3">Loading expenses...</p>
        </div>
      ) : expenses.length === 0 ? (
        /* Empty state */
        <div className="apple-card p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-hover">
              <Receipt className="h-7 w-7 text-text-secondary" />
            </div>
          </div>
          <h3 className="text-base font-semibold text-text-primary mb-1">No expenses yet</h3>
          <p className="text-sm text-text-secondary mb-5">Add your business costs to get accurate P&L calculations</p>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Your First Expense
          </button>
        </div>
      ) : (
        /* Grouped tables */
        <div className="space-y-4">
          {renderTable(fixedExpenses, fixedCollapsed, () => setFixedCollapsed((v) => !v), 'Fixed Costs')}
          {renderTable(variableExpenses, variableCollapsed, () => setVariableCollapsed((v) => !v), 'Variable Costs')}
        </div>
      )}

      {/* CSV Import Zone */}
      <div id="csv-import-section" className="apple-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <FileText className="h-4 w-4 text-text-secondary" />
            <h3 className="text-sm font-bold text-text-primary">CSV Import</h3>
          </div>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download Template
          </button>
        </div>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder="Paste CSV data here...&#10;name,category,amount,frequency,distribution,start_date,end_date"
          rows={5}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/40 font-mono focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
        />
        <div className="flex justify-end mt-3">
          <button
            onClick={handleImport}
            disabled={importing || !csvText.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="h-3.5 w-3.5" />
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>

      {/* Expense Panel */}
      <ExpensePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onSave={handleSave}
        expense={editingExpense}
      />
    </div>
  );
}
