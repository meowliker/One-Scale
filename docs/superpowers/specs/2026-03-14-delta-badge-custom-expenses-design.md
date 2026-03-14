# Delta Badge + Custom Expenses — Design Spec

**Date:** 2026-03-14
**Status:** Approved
**Scope:** Add DeltaBadge component to P&L summary cards + integrate custom expenses into the P&L formula + build full expenses manager UI. Scoped entirely to the P&L section — no other dashboard sections affected.

---

## Part 1 — DeltaBadge Component

**File:** `src/components/ui/DeltaBadge.tsx`

Standalone, reusable badge showing period-over-period percentage change with context-aware coloring.

**Props:**
```typescript
interface DeltaBadgeProps {
  current: number;
  previous: number;
  polarity: 'up_good' | 'down_good' | 'neutral';
  format: 'currency' | 'percentage' | 'number';
  size?: 'sm' | 'md';  // sm for inline, md for cards. Default: 'sm'
}
```

**Color Logic:**

| Polarity | Value Up | Value Down | No Change |
|----------|----------|------------|-----------|
| `up_good` (Revenue, Profit) | Green `#059669` | Red `#dc2626` | Gray `#a1a1aa` |
| `down_good` (COGS, Refunds, Ad Spend) | Red `#dc2626` | Green `#059669` | Gray `#a1a1aa` |
| `neutral` (Order Count) | Blue `#2563eb` | Blue `#2563eb` | Gray `#a1a1aa` |

**Display:**
- Shows `▲ +12.3%` (green/red/blue) or `▼ -5.1%` with percentage change
- If previous is 0 and current > 0, show `NEW` badge in blue
- If both are 0, show nothing (return null)
- Smooth fade-in animation via Framer Motion (`animate={{ opacity: 1 }}` from `opacity: 0`)
- Round to 1 decimal place

---

## Part 2 — P&L Metric Config

**File:** `src/lib/pnl/pnlMetricConfig.ts`

Typed configuration mapping each P&L metric to its delta polarity and display format.

```typescript
type PnLMetricKey =
  | 'revenue' | 'cogs' | 'adSpend' | 'shipping'
  | 'fees' | 'refunds' | 'chargebacks' | 'customExpenses'
  | 'netProfit' | 'margin' | 'orderCount';

interface PnLMetricDef {
  key: PnLMetricKey;
  label: string;
  polarity: 'up_good' | 'down_good' | 'neutral';
  format: 'currency' | 'percentage' | 'number';
}

const PNL_METRICS: Record<PnLMetricKey, PnLMetricDef> = {
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

---

## Part 3 — DeltaBadge Integration into PnLSummaryCards

**Files:**
- `src/components/pnl/PnLSummaryCards.tsx` — add comparison prop + DeltaBadge rendering
- `src/components/pnl/PnLDashboardClient.tsx` — compute previous period entry + pass as prop

**PnLSummaryCards Changes:**
- Add `comparison?: PnLEntry` prop to `PnLSummaryCardsProps`
- Import `DeltaBadge` and `PNL_METRICS`
- Below each card's main value, render `<DeltaBadge>` using:
  - `current` = entry[metricKey]
  - `previous` = comparison[metricKey]
  - `polarity` and `format` from `PNL_METRICS[metricKey]`
- If no `comparison` prop, DeltaBadges don't render

**PnLDashboardClient Changes:**
The client already computes `previousDailyPnL` (filtered array) for trend charts, but does NOT aggregate it into a single `PnLEntry`. Add:
```typescript
const previousEntry = useMemo(() => {
  return computeEntryFromDaily(dailyPnL, { start: prevStart, end: prevEnd });
}, [dailyPnL, prevStart, prevEnd]);
```
Pass `previousEntry` as the `comparison` prop to `<PnLSummaryCards>`.

---

## Part 4 — Expense Engine

**File:** `src/lib/pnl/expenseEngine.ts`

Pure function module — no side effects, no database calls, no state.

**Core Function:**
```typescript
interface ExpenseResult {
  totalExpenses: number;
  breakdown: { expenseId?: number; name: string; category: 'fixed' | 'variable'; allocated: number }[];
  dailyDistribution: { date: string; amount: number }[];
}

function calculateExpenses(
  expenses: CustomExpense[],
  dateRange: { start: string; end: string },
  hourlyProfile?: number[]  // 24-element array, sum = 1.0
): ExpenseResult
```

**Frequency Normalization (to daily rate):**

| Frequency | Calculation |
|-----------|-------------|
| `daily` | amount as-is |
| `weekly` | amount / 7 |
| `monthly` | amount / 30 |
| `yearly` | amount / 365 |
| `one_time` | full amount if date in range, else 0 |

**Distribution Models:**

| Type | Method | Description |
|------|--------|-------------|
| Fixed + `daily` | Even spread | dailyRate × activeDaysInRange |
| Fixed + `hourly` | Equal hourly weight | Same total as daily, but 1/24 per hour |
| Fixed + `smart` | Weighted by sales profile | dailyRate allocated proportionally to hourly sales volume |
| Variable + any | dailyRate × activeDays | Straightforward multiplication |
| One-time | Lump sum | Full amount on the specific date |

**Date Boundary Rules:**
- Only count days where expense is active: `max(startDate, rangeStart)` to `min(endDate, rangeEnd)`
- If `startDate` is null, treat as always active from the beginning
- If `endDate` is null, treat as ongoing (no end)
- Only include expenses where `isActive === true`

---

## Part 5 — Universal Calculator Integration

**Architecture Decision: Custom expenses are computed dynamically at display time, NOT baked into snapshots.** This ensures changing an expense retroactively updates all historical views. The daily snapshot cron stores raw P&L data (revenue, COGS, etc.) without custom expenses. The client-side `computeEntryFromDaily()` and server-side calculator both apply expenses dynamically.

**Files:**
- `src/lib/pnl/universalCalculator.ts` — add expense calculation to the formula
- `src/lib/intelligence/types.ts` — extend `PnLResult` and `PnLWarning` types
- `src/types/pnl.ts` — extend `PnLEntry` type
- `src/components/pnl/PnLDashboardClient.tsx` — update `computeEntryFromDaily()` to include `customExpenses`

**universalCalculator.ts Changes:**
1. Import `calculateExpenses` from `expenseEngine.ts`
2. Fetch custom expenses from `pnl_custom_expenses` table (add to parallel data fetch)
3. Call `calculateExpenses(expenses, dateRange)` after existing calculations
4. Subtract `totalExpenses` from net profit
5. Add warning if expenses > 20% of revenue

**PnLResult Type Extension** (`src/lib/intelligence/types.ts`):
```typescript
// Add to PnLResult interface:
totalCustomExpenses: number;
expenseBreakdown: { name: string; amount: number }[];
```

**PnLWarning Type Extension** (`src/lib/intelligence/types.ts`):
```typescript
// Add 'high_expense_ratio' to PnLWarning.type union:
type: 'missing_cogs' | 'estimated_fees' | 'no_fee_data' | 'unattributed_spend'
  | 'no_products' | 'stale_data' | 'missing_shipping' | 'currency_mismatch'
  | 'high_expense_ratio';
```

**PnLEntry Type Extension** (`src/types/pnl.ts`):
```typescript
// Add to PnLEntry interface:
customExpenses?: number;
expenseBreakdown?: { name: string; amount: number }[];
```

**computeEntryFromDaily() Update** (`src/components/pnl/PnLDashboardClient.tsx`):
- Add `customExpenses` to the reduce accumulator
- Subtract `customExpenses` from `netProfit` calculation
- The expenses per day come from the daily entries which are enriched by the P&L service

**Updated Formula:**
```
Net Profit = Revenue - COGS - Ad Spend - Shipping - Fees - Refunds
             - Chargebacks(lost) + Chargebacks(won) - Custom Expenses
```

---

## Part 6 — P&L Display: Expenses Line

**Files:** `src/components/pnl/PnLWaterfallChart.tsx`, `src/components/pnl/PnLSummaryCards.tsx`

### Waterfall Chart
Add `customExpenses` bar between Fees/Refunds and Net Profit.
- Color: `#8b5cf6` (purple)
- Label: "Custom Expenses"
- Shows negative contribution to profit

### Summary Cards
Keep the existing 6-card grid layout (`grid-cols-6` on lg). Do NOT add a 7th card — it would break the grid. Instead, the Custom Expenses total is shown in the expandable breakdown below the cards and in the waterfall chart.

### Expandable Expenses Breakdown
In the P&L breakdown area (below summary cards), add an expandable "Custom Expenses" line:
```
- Custom Expenses  -$800  ▾
    Rent             $500
    Software         $200
    VA Salary        $100
```
- Click to expand/collapse
- Framer Motion `AnimatePresence` for smooth animation
- Individual expense items shown with their allocated amount for the selected period

---

## Part 7 — Expenses Manager Page

**File:** `src/app/dashboard/pnl/expenses/page.tsx`

Full-featured expense management page at `/dashboard/pnl/expenses/`.

**Layout:**
- **Header:** "Expenses" title + "Add Expense" button (primary) + "Import CSV" button (secondary)
- **Summary Bar:** Total monthly estimate, total active expenses count, Fixed vs Variable split
- **Table:** Grouped by Fixed Costs / Variable Costs (collapsible sections)

**Table Columns:**

| Column | Content |
|--------|---------|
| Name | Expense name |
| Category | Fixed / Variable badge |
| Amount | Formatted currency |
| Frequency | daily/weekly/monthly/yearly/one-time badge |
| Distribution | daily/hourly/smart (fixed only) |
| Monthly Est. | Normalized monthly cost |
| Active | Toggle switch |
| Actions | Edit (pencil) + Delete (trash) icons |

**Empty State:** Illustration + "No expenses yet. Add your first expense to get accurate P&L calculations." + CTA button.

**Navigation:** The sidebar (`src/data/navigation.ts`) uses a flat `topItems` array with no sub-item support. Add "Expenses" as a standalone item in `topItems` directly below the P&L entry. Icon: `Receipt` from Lucide. Label: "Expenses". Href: `/dashboard/pnl/expenses`.

---

## Part 8 — Add/Edit Expense Panel

Slide-over panel from the right side (400px width). Used for both creating and editing expenses.

**Form Fields:**
- **Name** — text input, required
- **Category** — Fixed / Variable toggle buttons
- **Amount** — currency input with $ prefix, required, > 0
- **Frequency** — dropdown: daily, weekly, monthly, yearly, one-time
- **Distribution** — radio buttons: daily, hourly, smart (only shown for Fixed category)
- **Start Date** — optional date picker
- **End Date** — optional date picker
- **Active** — toggle, default true

**Impact Preview** (bottom of panel):
- Shows estimated daily/monthly/yearly cost based on inputs (computed client-side from the form values using the same frequency normalization as `expenseEngine.ts`)
- No live P&L data needed — the preview shows the expense's own projected cost breakdown, not its impact on net profit. This avoids needing to fetch P&L data into the expenses page.
- Updates in real-time as user changes inputs

**Validation:**
- Name: required, max 100 chars
- Amount: required, > 0, max 2 decimal places
- End date must be after start date (if both set)
- Frequency "one-time" requires a start date

**Save Behavior:**
- Optimistic UI — immediately update table
- POST/PATCH to `/api/pnl/expenses`
- On error, revert and show toast

---

## Part 9 — CSV Import

**Template Download:**
Button generates a CSV file with headers and 2 example rows:
```csv
name,category,amount,frequency,distribution,start_date,end_date
Office Rent,fixed,3000,monthly,daily,,
Shopify Subscription,fixed,79,monthly,daily,,
```

**Upload Flow:**
1. Click "Import CSV" → drag-drop zone appears (or file picker)
2. Parse CSV client-side, show preview table with validation status per row
3. Green checkmark = valid, red X = error with message
4. "Import N valid expenses" button — imports only valid rows, skips invalid ones. Shows count of valid/invalid. Disabled if zero valid rows.
5. POST to `/api/pnl/expenses/import`

**Idempotent Import:**
- Match by `name + store_id` (case-insensitive)
- Existing match → update fields
- No match → insert new
- Response: `{ imported: number, updated: number, errors: [] }`

---

## Part 10 — Smart Distribution: Hourly Profile

**Extend daily snapshot cron** (`src/app/api/cron/daily-pnl-snapshot/route.ts`):

After computing yesterday's P&L, compute an hourly sales profile:
1. Query order timestamps for the past 30 days
2. Bucket into 24 hourly slots
3. Normalize to sum = 1.0
4. Store as JSON in `pnl_store_settings` table: `hourly_sales_profile` column

**Profile Format:**
```json
[0.01, 0.01, 0.005, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.10, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.03, 0.02, 0.015, 0.01, 0.01, 0.005]
```

**Usage:** When `expenseEngine.calculateExpenses()` receives an hourly profile and an expense has `distribution = 'smart'`, it allocates that expense's daily amount proportionally to the profile weights.

**Fallback:** If no hourly profile exists yet (new store), fall back to equal daily distribution.

**DB Change:** Add `hourly_sales_profile JSONB` column to `pnl_store_settings` table.

**Migration File:** `supabase/migrations/009_hourly_sales_profile.sql`
```sql
ALTER TABLE pnl_store_settings
ADD COLUMN IF NOT EXISTS hourly_sales_profile JSONB DEFAULT NULL;
```

---

## Part 11 — API Routes

**Base path:** `/api/pnl/expenses/`

### GET `/api/pnl/expenses`
- Query: `store_id` from session
- Returns: all expenses for the store, ordered by category then name
- Uses: `rest('/pnl_custom_expenses?store_id=eq.${storeId}&order=category,name')`

### POST `/api/pnl/expenses`
- Body: `{ name, category, amount, frequency, distribution, startDate?, endDate? }`
- Validates input, sets `store_id` from session, `is_active = true`
- Uses: `rest('/pnl_custom_expenses', { method: 'POST', body })`
- Returns: created expense with id

### PATCH `/api/pnl/expenses`
- Body: `{ id, ...fieldsToUpdate }`
- Validates id belongs to store
- Uses: `rest('/pnl_custom_expenses?id=eq.${id}&store_id=eq.${storeId}', { method: 'PATCH', body })`

### DELETE `/api/pnl/expenses`
- Body: `{ id }`
- Validates id belongs to store
- Uses: `rest('/pnl_custom_expenses?id=eq.${id}&store_id=eq.${storeId}', { method: 'DELETE' })`

**Note on existing helpers:** The existing `updatePersistentCustomExpense()` and `deletePersistentCustomExpense()` in `supabase-persistence.ts` filter only by `id`, not `store_id`. The API routes MUST use raw `rest()` calls with `store_id` filtering for multi-tenant security (as shown in the URL patterns above), NOT the existing helper functions.

**Error Response Format:** All routes return `{ error: string }` with appropriate HTTP status on failure:
- 400: validation error
- 404: expense not found or doesn't belong to store
- 500: server error

### POST `/api/pnl/expenses/import`
- Body: CSV text or multipart form with file
- Parses rows, validates each
- Upserts: match by `name + store_id` (case-insensitive)
- Returns: `{ imported: number, updated: number, errors: { row: number, message: string }[] }`

---

## Settings Tab Update

**File:** `src/components/pnl-settings/CustomExpensesTab.tsx` (existing)

Convert to read-only summary:
- Show expense name, amount, frequency, active status (no edit/delete actions)
- Add "Manage Expenses →" link that navigates to `/dashboard/pnl/expenses/`
- Keep the monthly estimate summary at top

---

## Technical Constraints

- Stack: Next.js 16, TypeScript, Tailwind CSS 4, Supabase
- DB pattern: `rest()` from `supabase-persistence.ts` — raw PostgREST, zero `@supabase/supabase-js`
- Animations: Framer Motion 12 — smooth, no jank
- Icons: Lucide React
- DeltaBadge is P&L-scoped only — do not add to other dashboard sections
- Custom expenses subtracted from net profit in universalCalculator
- Optimistic UI on all expense CRUD operations
- Do not break existing dashboard functionality
- One store never affects another
