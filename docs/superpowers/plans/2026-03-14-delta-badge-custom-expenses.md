# Delta Badge + Custom Expenses Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add period-over-period DeltaBadge to P&L summary cards and integrate custom expenses into the P&L formula with a full expenses manager UI.

**Architecture:** Modular engine layer — DeltaBadge is a standalone UI component, pnlMetricConfig is a data file mapping metrics to polarities, expenseEngine is a pure function for expense distribution, and universalCalculator integrates expenses into the formula. Custom expenses are computed dynamically at display time (not baked into snapshots).

**Tech Stack:** Next.js 16 (App Router), TypeScript 5, React 19, Tailwind CSS 4, Supabase PostgREST via `rest()`, Framer Motion 12, Lucide React, Zustand 5

**Spec:** `docs/superpowers/specs/2026-03-14-delta-badge-custom-expenses-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/ui/DeltaBadge.tsx` | Reusable period-over-period change badge |
| Create | `src/lib/pnl/pnlMetricConfig.ts` | Metric → polarity/format config map |
| Create | `src/lib/pnl/expenseEngine.ts` | Pure function: expense distribution calculation |
| Create | `src/app/dashboard/pnl/expenses/page.tsx` | Expenses manager page |
| Create | `src/components/pnl/ExpensePanel.tsx` | Slide-over add/edit expense form |
| Create | `src/components/pnl/ExpenseBreakdownRow.tsx` | Expandable expenses line in P&L breakdown |
| Create | `src/app/api/pnl/expenses/route.ts` | CRUD API for expenses |
| Create | `src/app/api/pnl/expenses/import/route.ts` | CSV import API |
| Create | `supabase/migrations/009_hourly_sales_profile.sql` | DB migration for hourly profile column |
| Modify | `src/types/pnl.ts` | Add `customExpenses` + `expenseBreakdown` to PnLEntry |
| Modify | `src/lib/intelligence/types.ts` | Add `totalCustomExpenses` + `expenseBreakdown` to PnLResult, `high_expense_ratio` to PnLWarning |
| Modify | `src/components/pnl/PnLSummaryCards.tsx` | Add `comparison` prop + DeltaBadge rendering |
| Modify | `src/components/pnl/PnLDashboardClient.tsx` | Compute previousEntry, pass comparison, update computeEntryFromDaily, add ExpenseBreakdownRow |
| Modify | `src/components/pnl/PnLWaterfallChart.tsx` | Add Custom Expenses bar |
| Modify | `src/lib/pnl/universalCalculator.ts` | Integrate expense engine into formula |
| Modify | `src/data/navigation.ts` | Add Expenses nav item |
| Modify | `src/app/api/cron/daily-pnl-snapshot/route.ts` | Add hourly sales profile computation |

---

## Chunk 1: DeltaBadge + Metric Config + Type Extensions

### Task 1: Extend PnLEntry and PnLResult types

**Files:**
- Modify: `src/types/pnl.ts:1-18`
- Modify: `src/lib/intelligence/types.ts:177-234`

- [ ] **Step 1: Add customExpenses fields to PnLEntry**

In `src/types/pnl.ts`, add after `chargebackWon?: number;` (line 17):

```typescript
  customExpenses?: number;
  expenseBreakdown?: { name: string; amount: number }[];
```

- [ ] **Step 2: Add totalCustomExpenses to PnLResult**

In `src/lib/intelligence/types.ts`, add after `totalMargin: number;` (line 221):

```typescript
  totalCustomExpenses: number;
  expenseBreakdown: { name: string; amount: number }[];
```

- [ ] **Step 3: Extend PnLWarning type union**

In `src/lib/intelligence/types.ts`, replace the `type` field on line 178-179:

```typescript
  type: 'missing_cogs' | 'estimated_fees' | 'no_fee_data' | 'unattributed_spend'
    | 'no_products' | 'stale_data' | 'missing_shipping' | 'currency_mismatch'
    | 'high_expense_ratio';
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | head -30`
Expected: No new type errors from these additions (fields are optional/additive).

- [ ] **Step 5: Commit**

```bash
git add src/types/pnl.ts src/lib/intelligence/types.ts
git commit -m "feat(pnl): extend types for custom expenses and delta badges"
```

---

### Task 2: Create pnlMetricConfig.ts

**Files:**
- Create: `src/lib/pnl/pnlMetricConfig.ts`

- [ ] **Step 1: Create the metric config file**

Create `src/lib/pnl/pnlMetricConfig.ts`:

```typescript
export type PnLMetricKey =
  | 'revenue' | 'cogs' | 'adSpend' | 'shipping'
  | 'fees' | 'refunds' | 'chargebacks' | 'customExpenses'
  | 'netProfit' | 'margin' | 'orderCount';

export type Polarity = 'up_good' | 'down_good' | 'neutral';
export type MetricFormat = 'currency' | 'percentage' | 'number';

export interface PnLMetricDef {
  key: PnLMetricKey;
  label: string;
  polarity: Polarity;
  format: MetricFormat;
}

export const PNL_METRICS: Record<PnLMetricKey, PnLMetricDef> = {
  revenue:        { key: 'revenue',        label: 'Revenue',         polarity: 'up_good',   format: 'currency' },
  cogs:           { key: 'cogs',           label: 'COGS',            polarity: 'down_good', format: 'currency' },
  adSpend:        { key: 'adSpend',        label: 'Ad Spend',        polarity: 'down_good', format: 'currency' },
  shipping:       { key: 'shipping',       label: 'Shipping',        polarity: 'down_good', format: 'currency' },
  fees:           { key: 'fees',           label: 'Fees',            polarity: 'down_good', format: 'currency' },
  refunds:        { key: 'refunds',        label: 'Refunds',         polarity: 'down_good', format: 'currency' },
  chargebacks:    { key: 'chargebacks',    label: 'Chargebacks',     polarity: 'down_good', format: 'currency' },
  customExpenses: { key: 'customExpenses', label: 'Custom Expenses', polarity: 'down_good', format: 'currency' },
  netProfit:      { key: 'netProfit',      label: 'Net Profit',      polarity: 'up_good',   format: 'currency' },
  margin:         { key: 'margin',         label: 'Margin',          polarity: 'up_good',   format: 'percentage' },
  orderCount:     { key: 'orderCount',     label: 'Orders',          polarity: 'neutral',   format: 'number' },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pnl/pnlMetricConfig.ts
git commit -m "feat(pnl): add metric config with polarity and format definitions"
```

---

### Task 3: Create DeltaBadge component

**Files:**
- Create: `src/components/ui/DeltaBadge.tsx`

- [ ] **Step 1: Create the DeltaBadge component**

Create `src/components/ui/DeltaBadge.tsx`:

```typescript
'use client';

import { motion } from 'framer-motion';
import type { Polarity, MetricFormat } from '@/lib/pnl/pnlMetricConfig';

interface DeltaBadgeProps {
  current: number;
  previous: number;
  polarity: Polarity;
  format: MetricFormat;
  size?: 'sm' | 'md';
}

export function DeltaBadge({ current, previous, polarity, format, size = 'sm' }: DeltaBadgeProps) {
  // Both zero — nothing to show
  if (current === 0 && previous === 0) return null;

  // Previous was zero, now has value — NEW badge
  if (previous === 0 && current > 0) {
    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`inline-flex items-center gap-0.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 font-semibold text-blue-600 dark:text-blue-400 ${
          size === 'sm' ? 'text-[10px]' : 'text-xs'
        }`}
      >
        NEW
      </motion.span>
    );
  }

  const pctChange = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
  const isUp = pctChange > 0;
  const isDown = pctChange < 0;
  const isFlat = pctChange === 0;

  // Determine color based on polarity
  let colorClass: string;
  if (isFlat) {
    colorClass = 'text-zinc-400 bg-zinc-500/10';
  } else if (polarity === 'neutral') {
    colorClass = 'text-blue-600 dark:text-blue-400 bg-blue-500/10';
  } else if (polarity === 'up_good') {
    colorClass = isUp
      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
      : 'text-red-600 dark:text-red-400 bg-red-500/10';
  } else {
    // down_good — costs going down is good
    colorClass = isDown
      ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
      : 'text-red-600 dark:text-red-400 bg-red-500/10';
  }

  const arrow = isUp ? '▲' : isDown ? '▼' : '—';
  const sign = isUp ? '+' : '';
  const displayValue = `${sign}${pctChange.toFixed(1)}%`;

  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums ${colorClass} ${
        size === 'sm' ? 'text-[10px]' : 'text-xs'
      }`}
    >
      <span>{arrow}</span>
      <span>{displayValue}</span>
    </motion.span>
  );
}
```

- [ ] **Step 2: Verify import resolves**

Run: `npx next build 2>&1 | head -30`
Expected: No errors from DeltaBadge.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/DeltaBadge.tsx
git commit -m "feat(ui): create DeltaBadge component with polarity-aware coloring"
```

---

### Task 4: Integrate DeltaBadge into PnLSummaryCards

**Files:**
- Modify: `src/components/pnl/PnLSummaryCards.tsx`
- Modify: `src/components/pnl/PnLDashboardClient.tsx:41-79,114-117,289-291`

- [ ] **Step 1: Add comparison prop and DeltaBadge to PnLSummaryCards**

In `src/components/pnl/PnLSummaryCards.tsx`:

1. Add imports at the top (after existing imports):
```typescript
import { DeltaBadge } from '@/components/ui/DeltaBadge';
import { PNL_METRICS } from '@/lib/pnl/pnlMetricConfig';
import type { PnLMetricKey } from '@/lib/pnl/pnlMetricConfig';
```

2. Update the interface (line 18-22) to add `comparison`:
```typescript
interface PnLSummaryCardsProps {
  entry: PnLEntry;
  comparison?: PnLEntry;
  isDigital?: boolean;
  lastUpdated?: Date | string;
}
```

3. Add a `metricKey` field to CardConfig (line 24-32):
```typescript
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
```

4. Add `metricKey` to each card in the array (line 34-72):
```typescript
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
```

5. Update the component function signature (line 84):
```typescript
export function PnLSummaryCards({ entry, comparison, isDigital = false, lastUpdated }: PnLSummaryCardsProps) {
```

6. Add DeltaBadge below each card's main value. After the `</div>` closing the `flex items-baseline` div (line 131), add:
```typescript
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
```

7. Add DeltaBadge to the Net Profit card. After the margin line (line 186-188), add:
```typescript
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
```

- [ ] **Step 2: Compute previousEntry in PnLDashboardClient and pass it**

In `src/components/pnl/PnLDashboardClient.tsx`:

1. After the `previousDailyPnL` useMemo (around line 149), add:
```typescript
  const previousEntry = useMemo(() => {
    return computeEntryFromDaily(dailyPnL, { start: prevStart, end: prevEnd });
  }, [dailyPnL, prevStart, prevEnd]);
```

2. Update the `<PnLSummaryCards>` call (around line 291) to pass comparison:
```typescript
        <PnLSummaryCards entry={activeEntry} comparison={previousEntry} isDigital={isDigital} lastUpdated={lastUpdated} />
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pnl/PnLSummaryCards.tsx src/components/pnl/PnLDashboardClient.tsx
git commit -m "feat(pnl): add DeltaBadge to summary cards with period comparison"
```

---

## Chunk 2: Expense Engine + Calculator Integration

### Task 5: Create expenseEngine.ts

**Files:**
- Create: `src/lib/pnl/expenseEngine.ts`

- [ ] **Step 1: Create the expense engine**

Create `src/lib/pnl/expenseEngine.ts`:

```typescript
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

/**
 * Calculate the total custom expenses allocated to a date range.
 * Pure function — no side effects, no database calls.
 */
export function calculateExpenses(
  expenses: CustomExpense[],
  dateRange: { start: string; end: string },
  hourlyProfile?: number[]
): ExpenseResult {
  const rangeStart = new Date(dateRange.start + 'T00:00:00Z');
  const rangeEnd = new Date(dateRange.end + 'T23:59:59Z');
  const rangeDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000));

  const breakdown: ExpenseBreakdownItem[] = [];
  const dailyMap = new Map<string, number>();

  // Initialize daily map
  for (let d = new Date(rangeStart); d <= rangeEnd; d.setUTCDate(d.getUTCDate() + 1)) {
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }

  let totalExpenses = 0;

  for (const expense of expenses) {
    if (!expense.isActive) continue;

    // Compute active date range overlap
    const expStart = expense.startDate ? new Date(expense.startDate + 'T00:00:00Z') : rangeStart;
    const expEnd = expense.endDate ? new Date(expense.endDate + 'T23:59:59Z') : rangeEnd;

    const effectiveStart = new Date(Math.max(expStart.getTime(), rangeStart.getTime()));
    const effectiveEnd = new Date(Math.min(expEnd.getTime(), rangeEnd.getTime()));

    if (effectiveStart > effectiveEnd) continue; // No overlap

    // Normalize to daily rate
    let dailyRate: number;
    let isOneTime = false;

    switch (expense.frequency) {
      case 'daily':
        dailyRate = expense.amount;
        break;
      case 'weekly':
        dailyRate = expense.amount / 7;
        break;
      case 'monthly':
        dailyRate = expense.amount / 30;
        break;
      case 'yearly':
        dailyRate = expense.amount / 365;
        break;
      case 'one_time':
        isOneTime = true;
        dailyRate = 0;
        break;
      default:
        dailyRate = 0;
    }

    let allocated = 0;

    if (isOneTime) {
      // One-time: full amount on the start date if it falls in range
      if (expense.startDate) {
        const oneTimeDate = expense.startDate;
        const startStr = dateRange.start;
        const endStr = dateRange.end;
        if (oneTimeDate >= startStr && oneTimeDate <= endStr) {
          allocated = expense.amount;
          const existing = dailyMap.get(oneTimeDate) || 0;
          dailyMap.set(oneTimeDate, existing + expense.amount);
        }
      }
    } else {
      // Count active days in range
      const activeDays = Math.max(1, Math.round(
        (effectiveEnd.getTime() - effectiveStart.getTime()) / 86400000
      ));

      // Smart distribution: weight by hourly sales profile
      if (expense.distribution === 'smart' && hourlyProfile && hourlyProfile.length === 24) {
        // Daily total is still dailyRate, but we note this uses smart weighting
        // (hourly allocation happens at a finer grain — for daily view, the total is the same)
        allocated = dailyRate * activeDays;
      } else {
        allocated = dailyRate * activeDays;
      }

      // Distribute across active days
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pnl/expenseEngine.ts
git commit -m "feat(pnl): create expense engine for distribution calculation"
```

---

### Task 6: Integrate expenses into universalCalculator

**Files:**
- Modify: `src/lib/pnl/universalCalculator.ts:16-26,122-147,556-593`

- [ ] **Step 1: Add import for expense engine**

In `src/lib/pnl/universalCalculator.ts`, add after line 1 (after the comment block, around line 16):

```typescript
import { calculateExpenses } from '@/lib/pnl/expenseEngine';
import type { CustomExpense } from '@/types/pnlSettings';
```

- [ ] **Step 2: Add fetchCustomExpenses helper**

At the bottom of the file, before `function enc(v: string)` (around line 709), add:

```typescript
interface CustomExpenseRow {
  id: number;
  name: string;
  category: 'fixed' | 'variable';
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
  distribution: 'daily' | 'hourly' | 'smart';
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

async function fetchCustomExpenses(storeId: string): Promise<CustomExpense[]> {
  try {
    const rows = await rest<CustomExpenseRow[]>(
      `/pnl_custom_expenses?store_id=eq.${enc(storeId)}&is_active=eq.true&select=*`
    );
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      amount: Number(r.amount),
      frequency: r.frequency,
      distribution: r.distribution,
      startDate: r.start_date,
      endDate: r.end_date,
      isActive: r.is_active,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 3: Add customExpenses to parallel fetch**

In the `Promise.all` block (lines 123-147), add `fetchCustomExpenses(storeId)` to the array and destructure it. Replace the Promise.all block:

The last item in the current destructuring is `timezone`. Add after it:
```typescript
    customExpensesList,
```

And add to the Promise.all array (after `fetchStoreTimezone(storeId)`):
```typescript
    fetchCustomExpenses(storeId),
```

- [ ] **Step 4: Calculate and subtract custom expenses from net profit**

After the chargebacks section (around line 456, after `totalChargebackPending`) and before fee method determination (line 460), add:

```typescript
  // ── 5b. Calculate custom expenses ──────────────────────────
  const expenseResult = calculateExpenses(customExpensesList, { start: dateFrom, end: dateTo });
  const totalCustomExpenses = expenseResult.totalExpenses;
```

Update the net profit calculation (line 556-557) to subtract custom expenses:

Replace:
```typescript
  const totalNetProfit = totalRevenue - totalCogs - totalAdSpend - totalFees
    - totalShipping - totalRefunds - totalChargebackLoss + totalChargebackWon;
```

With:
```typescript
  const totalNetProfit = totalRevenue - totalCogs - totalAdSpend - totalFees
    - totalShipping - totalRefunds - totalChargebackLoss + totalChargebackWon - totalCustomExpenses;
```

- [ ] **Step 5: Add expense warning and include in result**

After the existing warnings block (around line 510), add:

```typescript
  if (totalCustomExpenses > 0 && totalRevenue > 0 && (totalCustomExpenses / totalRevenue) > 0.2) {
    warnings.push({
      type: 'high_expense_ratio',
      message: `Custom expenses are ${((totalCustomExpenses / totalRevenue) * 100).toFixed(1)}% of revenue. Review expense configuration.`,
      severity: 'warning',
      amount: totalCustomExpenses,
    });
  }
```

In the return statement (lines 569-593), add after `dataCompleteness`:

```typescript
    totalCustomExpenses,
    expenseBreakdown: expenseResult.breakdown.map(b => ({ name: b.name, amount: b.allocated })),
```

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pnl/universalCalculator.ts
git commit -m "feat(pnl): integrate custom expenses into universal calculator formula"
```

---

### Task 7: Update computeEntryFromDaily + waterfall chart

**Files:**
- Modify: `src/components/pnl/PnLDashboardClient.tsx:41-79`
- Modify: `src/components/pnl/PnLWaterfallChart.tsx:20-47`

- [ ] **Step 1: Add expense computation to PnLDashboardClient**

In `src/components/pnl/PnLDashboardClient.tsx`:

1. Add imports at top:
```typescript
import { calculateExpenses } from '@/lib/pnl/expenseEngine';
import type { CustomExpense } from '@/types/pnlSettings';
```

2. Add state for custom expenses (after `productAbortRef`):
```typescript
  const [customExpenses, setCustomExpenses] = useState<CustomExpense[]>([]);

  // Fetch custom expenses on mount
  useEffect(() => {
    if (!activeStoreId) return;
    fetch(`/api/pnl/expenses?storeId=${encodeURIComponent(activeStoreId)}`)
      .then(r => r.json())
      .then(json => {
        if (json.ok && json.data) {
          setCustomExpenses(json.data.filter((e: any) => e.is_active).map((e: any) => ({
            id: e.id, name: e.name, category: e.category, amount: Number(e.amount),
            frequency: e.frequency, distribution: e.distribution,
            startDate: e.start_date, endDate: e.end_date, isActive: e.is_active,
          })));
        }
      })
      .catch(() => {});
  }, [activeStoreId]);
```

3. Update `computeEntryFromDaily` to accept optional expenses param. Change its signature to:
```typescript
function computeEntryFromDaily(dailyPnL: PnLEntry[], range: DateRange, expenses?: CustomExpense[]): PnLEntry {
```

At the end of the function, before `return`, add expense calculation:
```typescript
  // Apply custom expenses dynamically
  let customExpensesTotal = 0;
  let expenseBreakdown: { name: string; amount: number }[] = [];
  if (expenses && expenses.length > 0) {
    const result = calculateExpenses(expenses, { start: startStr, end: endStr });
    customExpensesTotal = result.totalExpenses;
    expenseBreakdown = result.breakdown.map(b => ({ name: b.name, amount: b.allocated }));
  }

  const netProfit = totals.revenue - totals.cogs - totals.adSpend - totals.shipping - totals.fees - totals.refunds - totals.chargebackLoss + totals.chargebackWon - customExpensesTotal;
  const margin = totals.revenue > 0 ? (netProfit / totals.revenue) * 100 : 0;

  return {
    date: startStr,
    ...totals,
    netProfit,
    margin,
    customExpenses: customExpensesTotal,
    expenseBreakdown,
  };
```

Remove the old netProfit/margin calculation lines (70-71) since they're now inside the expense block above.

4. Update all calls to `computeEntryFromDaily` to pass `customExpenses`:
```typescript
  const activeEntry = useMemo(() => computeEntryFromDaily(dailyPnL, dateRange, customExpenses), [dailyPnL, dateRange, customExpenses]);
  const todayEntry = useMemo(() => computeEntryFromDaily(dailyPnL, getDateRange('today'), customExpenses), [dailyPnL, customExpenses]);
  const previousEntry = useMemo(() => computeEntryFromDaily(dailyPnL, { start: prevStart, end: prevEnd }, customExpenses), [dailyPnL, prevStart, prevEnd, customExpenses]);
```

- [ ] **Step 2: Add Custom Expenses to waterfall chart**

In `src/components/pnl/PnLWaterfallChart.tsx`, in the `rows` useMemo (line 20-47), add after `addCost('Chargebacks', entry.chargebackLoss || 0);` (line 36):

```typescript
    if ((entry.customExpenses || 0) > 0) {
      result.push({ name: 'Custom Expenses', amount: entry.customExpenses!, pct: (entry.customExpenses! / rev) * 100, type: 'cost' });
    }
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | head -30`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/pnl/PnLDashboardClient.tsx src/components/pnl/PnLWaterfallChart.tsx
git commit -m "feat(pnl): add custom expenses to daily aggregation and waterfall chart"
```

---

## Chunk 3: Expense Breakdown Row + API Routes

### Task 8: Create ExpenseBreakdownRow component

**Files:**
- Create: `src/components/pnl/ExpenseBreakdownRow.tsx`
- Modify: `src/components/pnl/PnLDashboardClient.tsx`

- [ ] **Step 1: Create ExpenseBreakdownRow**

Create `src/components/pnl/ExpenseBreakdownRow.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Receipt } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface ExpenseBreakdownRowProps {
  totalExpenses: number;
  breakdown: { name: string; amount: number }[];
  revenue: number;
}

export function ExpenseBreakdownRow({ totalExpenses, breakdown, revenue }: ExpenseBreakdownRowProps) {
  const [expanded, setExpanded] = useState(false);

  if (totalExpenses <= 0 || breakdown.length === 0) return null;

  const pct = revenue > 0 ? (totalExpenses / revenue) * 100 : 0;

  return (
    <div className="apple-card p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-sm"
      >
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-purple-500" />
          <span className="font-semibold text-text-primary">Custom Expenses</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary/40 tabular-nums">{pct.toFixed(1)}%</span>
          <span className="font-semibold tabular-nums text-text-primary">−{formatCurrency(totalExpenses)}</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-4 w-4 text-text-secondary/50" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {breakdown.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{item.name}</span>
                  <span className="font-medium tabular-nums text-text-primary">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Add ExpenseBreakdownRow to PnLDashboardClient**

In `src/components/pnl/PnLDashboardClient.tsx`:

1. Add import:
```typescript
import { ExpenseBreakdownRow } from '@/components/pnl/ExpenseBreakdownRow';
```

2. In the "Period View" SectionWrapper (around line 289-305), after the waterfall+margin grid div and before `</SectionWrapper>`, add:

```typescript
        {/* Custom Expenses breakdown */}
        {(activeEntry.customExpenses || 0) > 0 && (
          <div className="mt-4">
            <ExpenseBreakdownRow
              totalExpenses={activeEntry.customExpenses || 0}
              breakdown={activeEntry.expenseBreakdown || []}
              revenue={activeEntry.revenue}
            />
          </div>
        )}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/components/pnl/ExpenseBreakdownRow.tsx src/components/pnl/PnLDashboardClient.tsx
git commit -m "feat(pnl): add expandable custom expenses breakdown row"
```

---

### Task 9: Create expense API routes

**Files:**
- Create: `src/app/api/pnl/expenses/route.ts`
- Create: `src/app/api/pnl/expenses/import/route.ts`

- [ ] **Step 1: Create CRUD route**

Create `src/app/api/pnl/expenses/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

function enc(v: string): string {
  return encodeURIComponent(v);
}

// GET — list all expenses for a store
export async function GET(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const storeId = req.nextUrl.searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const rows = await rest(
      `/pnl_custom_expenses?store_id=eq.${enc(storeId)}&order=category,name`
    );
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to fetch' }, { status: 500 });
  }
}

// POST — create a new expense
export async function POST(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await req.json();
  const { storeId, name, category, amount, frequency, distribution, startDate, endDate } = body;

  if (!storeId || !name || !category || !amount || !frequency) {
    return NextResponse.json({ error: 'Missing required fields: storeId, name, category, amount, frequency' }, { status: 400 });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  if (!['fixed', 'variable'].includes(category)) {
    return NextResponse.json({ error: 'category must be "fixed" or "variable"' }, { status: 400 });
  }

  if (!['daily', 'weekly', 'monthly', 'yearly', 'one_time'].includes(frequency)) {
    return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
  }

  if (frequency === 'one_time' && !startDate) {
    return NextResponse.json({ error: 'one_time frequency requires a startDate' }, { status: 400 });
  }

  try {
    const result = await rest('/pnl_custom_expenses', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        store_id: storeId,
        name,
        category,
        amount,
        frequency,
        distribution: distribution || 'daily',
        start_date: startDate || null,
        end_date: endDate || null,
        is_active: true,
      }),
    });
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create' }, { status: 500 });
  }
}

// PATCH — update an expense (with store_id security)
export async function PATCH(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await req.json();
  const { id, storeId, ...updates } = body;

  if (!id || !storeId) {
    return NextResponse.json({ error: 'id and storeId required' }, { status: 400 });
  }

  // Map camelCase to snake_case for DB
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
  if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
  if (updates.distribution !== undefined) dbUpdates.distribution = updates.distribution;
  if (updates.startDate !== undefined) dbUpdates.start_date = updates.startDate;
  if (updates.endDate !== undefined) dbUpdates.end_date = updates.endDate;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

  try {
    await rest(
      `/pnl_custom_expenses?id=eq.${enc(String(id))}&store_id=eq.${enc(storeId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(dbUpdates),
      }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update' }, { status: 500 });
  }
}

// DELETE — remove an expense (with store_id security)
export async function DELETE(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await req.json();
  const { id, storeId } = body;

  if (!id || !storeId) {
    return NextResponse.json({ error: 'id and storeId required' }, { status: 400 });
  }

  try {
    await rest(
      `/pnl_custom_expenses?id=eq.${enc(String(id))}&store_id=eq.${enc(storeId)}`,
      { method: 'DELETE' }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create CSV import route**

Create `src/app/api/pnl/expenses/import/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

function enc(v: string): string {
  return encodeURIComponent(v);
}

interface ParsedRow {
  name: string;
  category: 'fixed' | 'variable';
  amount: number;
  frequency: string;
  distribution: string;
  start_date: string | null;
  end_date: string | null;
}

export async function POST(req: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const storeId = req.nextUrl.searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const text = await req.text();
  const lines = text.trim().split('\n');

  if (lines.length < 2) {
    return NextResponse.json({ error: 'CSV must have header + at least 1 row' }, { status: 400 });
  }

  // Skip header
  const dataLines = lines.slice(1);
  const errors: { row: number; message: string }[] = [];
  const validRows: ParsedRow[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const cols = dataLines[i].split(',').map(c => c.trim());
    const rowNum = i + 2; // 1-indexed, skip header

    if (cols.length < 3) {
      errors.push({ row: rowNum, message: 'Not enough columns' });
      continue;
    }

    const [name, category, amountStr, frequency, distribution, startDate, endDate] = cols;

    if (!name) { errors.push({ row: rowNum, message: 'Name is required' }); continue; }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) { errors.push({ row: rowNum, message: 'Amount must be positive number' }); continue; }

    if (!['fixed', 'variable'].includes(category)) { errors.push({ row: rowNum, message: 'Category must be fixed or variable' }); continue; }

    const freq = frequency || 'monthly';
    if (!['daily', 'weekly', 'monthly', 'yearly', 'one_time'].includes(freq)) {
      errors.push({ row: rowNum, message: `Invalid frequency: ${freq}` }); continue;
    }

    validRows.push({
      name,
      category: category as 'fixed' | 'variable',
      amount,
      frequency: freq,
      distribution: distribution || 'daily',
      start_date: startDate || null,
      end_date: endDate || null,
    });
  }

  // Fetch existing expenses for idempotent upsert
  let existing: Array<{ id: number; name: string }> = [];
  try {
    existing = await rest<Array<{ id: number; name: string }>>(
      `/pnl_custom_expenses?store_id=eq.${enc(storeId)}&select=id,name`
    );
  } catch { /* proceed without existing */ }

  const existingMap = new Map(existing.map(e => [e.name.toLowerCase(), e.id]));

  let imported = 0;
  let updated = 0;

  for (const row of validRows) {
    const existingId = existingMap.get(row.name.toLowerCase());

    try {
      if (existingId) {
        // Update existing
        await rest(
          `/pnl_custom_expenses?id=eq.${existingId}&store_id=eq.${enc(storeId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              category: row.category,
              amount: row.amount,
              frequency: row.frequency,
              distribution: row.distribution,
              start_date: row.start_date,
              end_date: row.end_date,
            }),
          }
        );
        updated++;
      } else {
        // Insert new
        await rest('/pnl_custom_expenses', {
          method: 'POST',
          body: JSON.stringify({
            store_id: storeId,
            name: row.name,
            category: row.category,
            amount: row.amount,
            frequency: row.frequency,
            distribution: row.distribution,
            start_date: row.start_date,
            end_date: row.end_date,
            is_active: true,
          }),
        });
        imported++;
      }
    } catch (err) {
      errors.push({ row: 0, message: `Failed to save "${row.name}": ${err instanceof Error ? err.message : 'Unknown'}` });
    }
  }

  return NextResponse.json({ ok: true, imported, updated, errors });
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/pnl/expenses/route.ts src/app/api/pnl/expenses/import/route.ts
git commit -m "feat(api): add expense CRUD and CSV import API routes"
```

---

## Chunk 4: Expenses Manager UI

### Task 10: Create ExpensePanel (slide-over add/edit form)

**Files:**
- Create: `src/components/pnl/ExpensePanel.tsx`

- [ ] **Step 1: Create the slide-over panel component**

Create `src/components/pnl/ExpensePanel.tsx`:

```typescript
'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { CustomExpense, ExpenseCategory, ExpenseFrequency, ExpenseDistribution } from '@/types/pnlSettings';

interface ExpensePanelProps {
  open: boolean;
  onClose: () => void;
  onSave: (expense: Omit<CustomExpense, 'id' | 'isActive'> & { id?: number }) => void;
  expense?: CustomExpense | null;
}

const FREQUENCIES: { value: ExpenseFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One-time' },
];

const DISTRIBUTIONS: { value: ExpenseDistribution; label: string; desc: string }[] = [
  { value: 'daily', label: 'Even Daily', desc: 'Spread equally across days' },
  { value: 'hourly', label: 'Hourly', desc: 'Equal weight per hour' },
  { value: 'smart', label: 'Smart', desc: 'Weighted by sales pattern' },
];

export function ExpensePanel({ open, onClose, onSave, expense }: ExpensePanelProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('fixed');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<ExpenseFrequency>('monthly');
  const [distribution, setDistribution] = useState<ExpenseDistribution>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
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
  }, [expense, open]);

  const impactPreview = useMemo(() => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return null;

    let daily: number;
    switch (frequency) {
      case 'daily': daily = amt; break;
      case 'weekly': daily = amt / 7; break;
      case 'monthly': daily = amt / 30; break;
      case 'yearly': daily = amt / 365; break;
      case 'one_time': daily = 0; break;
      default: daily = 0;
    }

    return {
      daily: daily,
      monthly: frequency === 'one_time' ? amt : daily * 30,
      yearly: frequency === 'one_time' ? amt : daily * 365,
    };
  }, [amount, frequency]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (name.length > 100) errs.name = 'Max 100 characters';

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) errs.amount = 'Must be a positive number';

    if (frequency === 'one_time' && !startDate) errs.startDate = 'Required for one-time expenses';
    if (startDate && endDate && startDate > endDate) errs.endDate = 'Must be after start date';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSave({
      id: expense?.id,
      name: name.trim(),
      category,
      amount: parseFloat(amount),
      frequency,
      distribution,
      startDate: startDate || null,
      endDate: endDate || null,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30"
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-[400px] max-w-full bg-surface border-l border-border shadow-xl overflow-y-auto"
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-text-primary">
                  {expense ? 'Edit Expense' : 'Add Expense'}
                </h2>
                <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-hover transition-colors">
                  <X className="h-5 w-5 text-text-secondary" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Office Rent"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Category</label>
                  <div className="flex gap-2">
                    {(['fixed', 'variable'] as ExpenseCategory[]).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          category === cat
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border text-text-secondary hover:bg-surface-hover'
                        }`}
                      >
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-secondary">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-border bg-surface pl-7 pr-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                  </div>
                  {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
                </div>

                {/* Frequency */}
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>

                {/* Distribution (fixed only) */}
                {category === 'fixed' && (
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Distribution</label>
                    <div className="space-y-2">
                      {DISTRIBUTIONS.map((d) => (
                        <label key={d.value} className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="distribution"
                            value={d.value}
                            checked={distribution === d.value}
                            onChange={() => setDistribution(d.value)}
                            className="mt-1 accent-accent"
                          />
                          <div>
                            <span className="text-sm font-medium text-text-primary">{d.label}</span>
                            <p className="text-xs text-text-secondary/60">{d.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                    {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                    {errors.endDate && <p className="text-xs text-red-500 mt-1">{errors.endDate}</p>}
                  </div>
                </div>

                {/* Impact Preview */}
                {impactPreview && (
                  <div className="rounded-lg bg-surface-hover p-4 space-y-1">
                    <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Impact Preview</h4>
                    {frequency !== 'one_time' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">Daily cost</span>
                        <span className="font-semibold text-text-primary tabular-nums">{formatCurrency(impactPreview.daily)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">Monthly cost</span>
                      <span className="font-semibold text-text-primary tabular-nums">{formatCurrency(impactPreview.monthly)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">Yearly cost</span>
                      <span className="font-semibold text-text-primary tabular-nums">{formatCurrency(impactPreview.yearly)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pnl/ExpensePanel.tsx
git commit -m "feat(pnl): create slide-over expense add/edit panel"
```

---

### Task 11: Create Expenses Manager page

**Files:**
- Create: `src/app/dashboard/pnl/expenses/page.tsx`
- Modify: `src/data/navigation.ts`

- [ ] **Step 1: Create the expenses manager page**

Create `src/app/dashboard/pnl/expenses/page.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Upload, Download, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import { ExpensePanel } from '@/components/pnl/ExpensePanel';
import type { CustomExpense } from '@/types/pnlSettings';
import toast from 'react-hot-toast';

interface ExpenseRow {
  id: number;
  store_id: string;
  name: string;
  category: 'fixed' | 'variable';
  amount: number;
  frequency: string;
  distribution: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
}

function toMonthlyEstimate(amount: number, frequency: string): number {
  switch (frequency) {
    case 'daily': return amount * 30;
    case 'weekly': return amount * 4.33;
    case 'monthly': return amount;
    case 'yearly': return amount / 12;
    case 'one_time': return 0;
    default: return 0;
  }
}

export default function ExpensesPage() {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<CustomExpense | null>(null);
  const [fixedCollapsed, setFixedCollapsed] = useState(false);
  const [variableCollapsed, setVariableCollapsed] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchExpenses = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pnl/expenses?storeId=${encodeURIComponent(activeStoreId)}`);
      const json = await res.json();
      if (json.ok) setExpenses(json.data || []);
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const handleSave = async (data: Omit<CustomExpense, 'id' | 'isActive'> & { id?: number }) => {
    if (!activeStoreId) return;

    const isEdit = !!data.id;
    const method = isEdit ? 'PATCH' : 'POST';

    try {
      const res = await fetch('/api/pnl/expenses', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          storeId: activeStoreId,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(isEdit ? 'Expense updated' : 'Expense added');
        fetchExpenses();
      } else {
        toast.error(json.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save expense');
    }
  };

  const handleDelete = async (id: number) => {
    if (!activeStoreId) return;
    try {
      const res = await fetch('/api/pnl/expenses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, storeId: activeStoreId }),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success('Expense deleted');
        setExpenses((prev) => prev.filter((e) => e.id !== id));
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleToggleActive = async (expense: ExpenseRow) => {
    if (!activeStoreId) return;
    // Optimistic update
    setExpenses((prev) => prev.map((e) => e.id === expense.id ? { ...e, is_active: !e.is_active } : e));

    try {
      await fetch('/api/pnl/expenses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: expense.id, storeId: activeStoreId, isActive: !expense.is_active }),
      });
    } catch {
      // Revert
      setExpenses((prev) => prev.map((e) => e.id === expense.id ? { ...e, is_active: expense.is_active } : e));
      toast.error('Failed to update');
    }
  };

  const handleCsvImport = async () => {
    if (!activeStoreId || !csvText.trim()) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/pnl/expenses/import?storeId=${encodeURIComponent(activeStoreId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: csvText,
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(`Imported ${json.imported}, updated ${json.updated}`);
        setShowImport(false);
        setCsvText('');
        fetchExpenses();
      }
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = `name,category,amount,frequency,distribution,start_date,end_date\nOffice Rent,fixed,3000,monthly,daily,,\nShopify Subscription,fixed,79,monthly,daily,,\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'expenses-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const fixedExpenses = expenses.filter((e) => e.category === 'fixed');
  const variableExpenses = expenses.filter((e) => e.category === 'variable');
  const totalMonthly = expenses
    .filter((e) => e.is_active)
    .reduce((sum, e) => sum + toMonthlyEstimate(e.amount, e.frequency), 0);
  const activeCount = expenses.filter((e) => e.is_active).length;

  const openEdit = (row: ExpenseRow) => {
    setEditingExpense({
      id: row.id,
      name: row.name,
      category: row.category,
      amount: row.amount,
      frequency: row.frequency as CustomExpense['frequency'],
      distribution: row.distribution as CustomExpense['distribution'],
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
    });
    setPanelOpen(true);
  };

  const openAdd = () => {
    setEditingExpense(null);
    setPanelOpen(true);
  };

  const renderGroup = (title: string, items: ExpenseRow[], collapsed: boolean, toggle: () => void) => (
    <div className="apple-card overflow-hidden">
      <button onClick={toggle} className="flex w-full items-center justify-between p-4 hover:bg-surface-hover transition-colors">
        <span className="text-sm font-bold text-text-primary">{title} ({items.length})</span>
        <motion.div animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4 text-text-secondary" />
        </motion.div>
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            {items.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-text-secondary/50">No {title.toLowerCase()} yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-xs text-text-secondary/50 uppercase tracking-wide">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Amount</th>
                    <th className="px-4 py-2 hidden md:table-cell">Frequency</th>
                    <th className="px-4 py-2 hidden lg:table-cell">Monthly Est.</th>
                    <th className="px-4 py-2">Active</th>
                    <th className="px-4 py-2 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className={`border-t border-border ${!row.is_active ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3 font-medium text-text-primary">{row.name}</td>
                      <td className="px-4 py-3 tabular-nums">{formatCurrency(row.amount)}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs">{row.frequency}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell tabular-nums">
                        {formatCurrency(toMonthlyEstimate(row.amount, row.frequency))}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(row)}
                          className={`h-5 w-9 rounded-full transition-colors ${row.is_active ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`}
                        >
                          <motion.div
                            animate={{ x: row.is_active ? 16 : 2 }}
                            className="h-4 w-4 rounded-full bg-white shadow"
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(row)} className="p-1 rounded hover:bg-surface-hover transition-colors">
                            <Pencil className="h-3.5 w-3.5 text-text-secondary" />
                          </button>
                          <button onClick={() => handleDelete(row.id)} className="p-1 rounded hover:bg-red-500/10 transition-colors">
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-text-secondary/20 border-t-text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Expenses</h1>
          <p className="text-sm text-text-secondary mt-1">Manage custom expenses for accurate P&L calculations</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(!showImport)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="apple-card p-4">
          <div className="text-xs text-text-secondary/50 uppercase tracking-wide">Active Expenses</div>
          <div className="text-2xl font-bold text-text-primary mt-1">{activeCount}</div>
        </div>
        <div className="apple-card p-4">
          <div className="text-xs text-text-secondary/50 uppercase tracking-wide">Monthly Estimate</div>
          <div className="text-2xl font-bold text-text-primary mt-1 tabular-nums">{formatCurrency(totalMonthly)}</div>
        </div>
        <div className="apple-card p-4">
          <div className="text-xs text-text-secondary/50 uppercase tracking-wide">Fixed / Variable</div>
          <div className="text-2xl font-bold text-text-primary mt-1">{fixedExpenses.length} / {variableExpenses.length}</div>
        </div>
      </div>

      {/* CSV Import Zone */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="apple-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">Import from CSV</h3>
                <button onClick={downloadTemplate} className="flex items-center gap-1 text-xs text-accent hover:text-accent/80">
                  <Download className="h-3.5 w-3.5" />
                  Download Template
                </button>
              </div>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Paste CSV content here or drag a .csv file..."
                className="w-full h-32 rounded-lg border border-dashed border-border bg-surface p-3 text-sm text-text-primary font-mono placeholder:text-text-secondary/30 focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
              <button
                onClick={handleCsvImport}
                disabled={!csvText.trim() || importing}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {expenses.length === 0 ? (
        <div className="apple-card p-12 text-center">
          <p className="text-lg font-semibold text-text-primary">No expenses yet</p>
          <p className="text-sm text-text-secondary mt-2">Add your first expense to get accurate P&L calculations.</p>
          <button
            onClick={openAdd}
            className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition-colors"
          >
            Add First Expense
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {renderGroup('Fixed Costs', fixedExpenses, fixedCollapsed, () => setFixedCollapsed(!fixedCollapsed))}
          {renderGroup('Variable Costs', variableExpenses, variableCollapsed, () => setVariableCollapsed(!variableCollapsed))}
        </div>
      )}

      {/* Slide-over Panel */}
      <ExpensePanel
        open={panelOpen}
        onClose={() => { setPanelOpen(false); setEditingExpense(null); }}
        onSave={handleSave}
        expense={editingExpense}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add Expenses to navigation**

In `src/data/navigation.ts`, add the `Receipt` import and the nav item.

Add `Receipt` to the import list (line 1-21):
```typescript
import {
  // ... existing imports ...
  Receipt,
} from 'lucide-react';
```

In the `topItems` array (line 29-41), add after the P&L entry (`{ label: 'P&L Tracking', ... }`):
```typescript
    { label: 'Expenses', href: '/dashboard/pnl/expenses', icon: Receipt },
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/pnl/expenses/page.tsx src/data/navigation.ts
git commit -m "feat(pnl): add expenses manager page with CRUD, CSV import, and navigation"
```

---

## Chunk 5: Smart Distribution Cron + Migration + Final Wiring

### Task 12: Create DB migration and update cron

**Files:**
- Create: `supabase/migrations/009_hourly_sales_profile.sql`
- Modify: `src/app/api/cron/daily-pnl-snapshot/route.ts`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/009_hourly_sales_profile.sql`:

```sql
-- Add hourly sales profile column for smart expense distribution
ALTER TABLE pnl_store_settings
ADD COLUMN IF NOT EXISTS hourly_sales_profile JSONB DEFAULT NULL;

COMMENT ON COLUMN pnl_store_settings.hourly_sales_profile IS 'Array of 24 hourly weights (sum=1.0) computed from order patterns, used for smart expense distribution';
```

- [ ] **Step 2: Add hourly profile computation to daily cron**

In `src/app/api/cron/daily-pnl-snapshot/route.ts`, after the `daily_pnl_snapshots` upsert (around line 129), add before the success logging:

```typescript
      // Compute hourly sales profile from last 30 days of orders
      try {
        const thirtyDaysAgo = daysAgoInTimezone(30, tz);
        const orderHours = await rest<Array<{ created_at: string }>>(
          `/shopify_orders_cache?store_id=eq.${encodeURIComponent(store.id)}&created_at=gte.${encodeURIComponent(thirtyDaysAgo)}&select=created_at`
        );

        if (orderHours.length > 0) {
          const hourBuckets = new Array(24).fill(0);
          for (const o of orderHours) {
            const hour = new Date(o.created_at).getUTCHours();
            hourBuckets[hour]++;
          }
          const total = hourBuckets.reduce((a: number, b: number) => a + b, 0);
          if (total > 0) {
            const profile = hourBuckets.map((count: number) => Math.round((count / total) * 10000) / 10000);
            await rest(
              `/pnl_store_settings?store_id=eq.${encodeURIComponent(store.id)}`,
              {
                method: 'PATCH',
                body: JSON.stringify({ hourly_sales_profile: profile }),
              }
            );
          }
        }
      } catch {
        // Non-critical — profile computation failure doesn't block snapshot
      }
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/009_hourly_sales_profile.sql src/app/api/cron/daily-pnl-snapshot/route.ts
git commit -m "feat(pnl): add hourly sales profile migration and cron computation"
```

---

### Task 13: Update Settings CustomExpensesTab to read-only

**Files:**
- Modify: `src/components/pnl-settings/CustomExpensesTab.tsx` (if exists) or the expense tab in COGSManager/Settings

- [ ] **Step 1: Convert to read-only summary**

Find the existing custom expenses tab component. Replace its inline CRUD UI with:
- Read-only list showing expense name, amount, frequency, active status (no edit/delete buttons)
- Keep monthly estimate summary at top
- Add a "Manage Expenses →" link at the bottom that navigates to `/dashboard/pnl/expenses`:

```typescript
<a href="/dashboard/pnl/expenses" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent/80 transition-colors">
  Manage Expenses →
</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pnl-settings/
git commit -m "feat(pnl): convert settings expense tab to read-only with link to manager"
```

---

### Task 14: Final build verification and commit

- [ ] **Step 1: Run full build**

Run: `npx next build 2>&1 | tail -50`
Expected: Build succeeds with no new errors. Pre-existing errors (3x `@/services/productPnL` missing module, 4x `fs` module in client bundles) are acceptable — zero new errors from our changes.

- [ ] **Step 2: Final commit with all changes**

If any files were missed:
```bash
git status
git add <any-missed-files>
git commit -m "chore: final cleanup for delta badge + custom expenses"
```

- [ ] **Step 3: Verify dev server**

Run: `npm run dev`
Navigate to `http://localhost:3000/dashboard/pnl` — verify DeltaBadges appear on summary cards.
Navigate to `http://localhost:3000/dashboard/pnl/expenses` — verify expenses page loads.
