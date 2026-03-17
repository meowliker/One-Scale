import type { CustomExpense } from '@/types/pnlSettings';

export interface ExpenseBreakdownItem {
  expenseId?: number;
  name: string;
  category: 'fixed' | 'variable';
  allocated: number;
}

export interface ExpenseResult {
  totalExpenses: number;
  breakdown: ExpenseBreakdownItem[];
  dailyDistribution: { date: string; amount: number }[];
}

export function calculateExpenses(
  expenses: CustomExpense[],
  dateRange: { start: string; end: string },
  hourlyProfile?: number[]
): ExpenseResult {
  // Parse as UTC midnight — inputs are YYYY-MM-DD already in store timezone,
  // we use UTC consistently here to avoid browser TZ drift during iteration
  const rangeStart = new Date(dateRange.start + 'T12:00:00Z');
  const rangeEnd = new Date(dateRange.end + 'T12:00:00Z');

  const breakdown: ExpenseBreakdownItem[] = [];
  const dailyMap = new Map<string, number>();

  for (let d = new Date(rangeStart); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }

  let totalExpenses = 0;

  for (const expense of expenses) {
    if (!expense.isActive) continue;

    const expStart = expense.startDate ? new Date(expense.startDate + 'T12:00:00Z') : rangeStart;
    const expEnd = expense.endDate ? new Date(expense.endDate + 'T12:00:00Z') : rangeEnd;
    const effectiveStart = new Date(Math.max(expStart.getTime(), rangeStart.getTime()));
    const effectiveEnd = new Date(Math.min(expEnd.getTime(), rangeEnd.getTime()));

    if (effectiveStart > effectiveEnd) continue;

    let dailyRate: number;
    let isOneTime = false;

    switch (expense.frequency) {
      case 'daily': dailyRate = expense.amount; break;
      case 'weekly': dailyRate = expense.amount / 7; break;
      case 'monthly': dailyRate = expense.amount / 30; break;
      case 'yearly': dailyRate = expense.amount / 365; break;
      case 'one_time': isOneTime = true; dailyRate = 0; break;
      default: dailyRate = 0;
    }

    let allocated = 0;

    if (isOneTime) {
      if (expense.startDate) {
        const oneTimeDate = expense.startDate;
        if (oneTimeDate >= dateRange.start && oneTimeDate <= dateRange.end) {
          allocated = expense.amount;
          const existing = dailyMap.get(oneTimeDate) || 0;
          dailyMap.set(oneTimeDate, existing + expense.amount);
        }
      }
    } else {
      const activeDays = Math.max(1, Math.round(
        (effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000
      ));
      allocated = dailyRate * activeDays;

      for (let d = new Date(effectiveStart); d <= effectiveEnd; d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const existing = dailyMap.get(dateStr) || 0;
        dailyMap.set(dateStr, existing + dailyRate);
      }
    }

    if (allocated > 0) {
      totalExpenses += allocated;
      breakdown.push({
        expenseId: expense.id,
        name: expense.name,
        category: expense.category,
        allocated: Math.round(allocated * 100) / 100,
      });
    }
  }

  const dailyDistribution = Array.from(dailyMap.entries())
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    breakdown,
    dailyDistribution,
  };
}
