# P&L Dashboard Enhancement — Design Spec

## Overview
Enhance the existing P&L dashboard with new sections while preserving all existing functionality. 2062-style aesthetic: monochrome surfaces, green=profit, red=cost, nothing else.

## Layout (top to bottom)

### S1: Live Pulse (compact row)
- Single row: Live ticker (net profit) + 4 mini KPIs (revenue, ad spend, margin, orders)
- Ticker: gradient green/red background, animated counter
- Today's data only — replaces need for "Today" in period picker

### S2: Period View (existing, modified)
- Date picker: **Yesterday / 7D / 30D / This Month / Custom** (no "Today" — covered by S1)
- Existing PnLSummaryCards (6 KPIs: Revenue, COGS, Ad Spend, Ship+Fees, Refunds, Net Profit)
- Summary cards show full/partial refund counts
- Existing PnLWaterfallChart + MarginIndicator (unchanged)
- Digital products: COGS card hidden, label adjustments

### S3: Trends (existing, untouched)
- Existing PnLTrendChart (30-day area chart)
- Existing PnLDayPartChart with ALL 4 views: Grouped Bar, Stacked Bar, Area/Line, Data Table
- Date range picker, summary stats, sortable table headers — all preserved

### S4: Hourly Performance (NEW)
- **3 view toggles**: Heatmap / Line Chart / Bar Chart
- **Peak Hours badge**: auto-calculated 3-hour window with highest revenue
- **"vs Last Week" comparison toggle**: overlay previous week's data
- Heatmap: 7 days x 24 hours grid, monochrome opacity scale
- Line/Bar: 24-hour x-axis, revenue/profit y-axis
- Data source: `getHourlyPnL()` from services/pnl.ts (already exists)
- Fetched in parallel with other data for speed

### S5: Product Performance (ENHANCED)
- **Category tabs**: Main Products / Upsells / Downsells / Add-ons / All
  - Main = highest-priced item in order (primary product)
  - Upsell = additional items added post-purchase at higher/same price
  - Downsell = additional items at lower price
  - Add-ons = bundle extras, zero-price items
  - Classification logic: use line item price vs order context
- **View modes**: Card grid / Table list (existing toggle)
- **Search + filter**: by product name, SKU
- **Table columns**: Product, Revenue, COGS, Ad Spend, Shipping, Fees, Net Profit, Margin
- **Digital products**: COGS column shows "—" (dash), shipping/fees from Shopify actuals
- **Physical products**: full COGS from stored costs or 30% default
- **AOV summary cards**: Main AOV, With Upsells AOV, AOV Lift %, Upsell Take Rate
- Data source: `getProductPnL()` from services/productPnL.ts (enhanced with classification)

### S6: Refunds (NEW section, data already exists)
- **3 cards**: Total Refunds / Full Refunds / Partial Refunds
- Each shows: amount, count, % of revenue
- Data source: already tracked in PnLEntry (fullRefundCount, partialRefundCount, fullRefundAmount, partialRefundAmount)

### S7: Chargebacks (NEW)
- **2 cards**: Lost / Recovered
- Shows amount + description
- Data source: chargebackLoss / chargebackWon fields (added to PnLEntry)
- Populated via Shopify dispute webhooks (future — shows $0 for now)

### S8: Settings (existing, untouched)
- Existing COGS Manager tab (editable product costs)
- Existing Breakdown tab (cost breakdown bars)

## Data Rules

### Digital vs Physical
- **COGS**: Physical = cost × units. Digital = hidden ("—" in UI), $0 in calculations
- **Shipping**: Show actual Shopify data for both. Digital may have $0 but don't force it
- **Processing Fees**: Always shown for both, from Shopify Balance Transactions
- **Refunds**: Always shown for both

### P&L Formula
- Physical: Revenue - COGS - Shipping - Fees - Refunds - Ad Spend = Net Profit
- Digital: Revenue - Shipping - Fees - Refunds - Ad Spend = Net Profit

### Product Classification (for S5 tabs)
- **Main**: Line item with highest price in the order
- **Upsell**: Additional items with price >= main item's price tier
- **Downsell**: Additional items with price < main item's price
- **Add-on**: Zero-price or bundle items
- Classification happens at the order line-item level during aggregation

## Technical Approach
- All new sections are React components added to PnLDashboardClient
- No existing component code is modified — only new imports and JSX added
- Hourly data fetched in parallel via Promise.all in page.tsx
- Product classification logic added to productPnL.ts service
- Chargeback fields added to PnLEntry type (default 0)
- Refund breakdown uses existing fields already in PnLEntry

## Files to Create
- `src/components/pnl/LivePulseRow.tsx` — compact live ticker + 4 KPIs
- `src/components/pnl/HourlyPerformance.tsx` — heatmap/line/bar with toggle + peak + comparison
- `src/components/pnl/RefundBreakdown.tsx` — total/full/partial cards
- `src/components/pnl/ChargebackSection.tsx` — lost/recovered cards
- `src/components/pnl/AOVSummary.tsx` — 4 AOV metric cards

## Files to Modify
- `src/components/pnl/PnLDashboardClient.tsx` — add new sections, keep all existing
- `src/components/pnl/ProductPnLSection.tsx` — add category tabs (Main/Upsell/Downsell/Add-on/All)
- `src/app/dashboard/pnl/page.tsx` — add hourlyPnL to data fetch
- `src/services/productPnL.ts` — add product classification logic
- `src/types/pnl.ts` — add chargeback fields to PnLEntry
- `src/types/productPnL.ts` — add ProductCategory type

## Files NOT Modified (preserved exactly)
- `src/components/pnl/PnLSummaryCards.tsx`
- `src/components/pnl/PnLWaterfallChart.tsx`
- `src/components/pnl/PnLTrendChart.tsx`
- `src/components/pnl/PnLDayPartChart.tsx`
- `src/components/pnl/MarginIndicator.tsx`
- `src/components/pnl/COGSManager.tsx`
- `src/components/pnl/LiveProfitTicker.tsx` (still used inside LivePulseRow)
- `src/services/pnl.ts` (getHourlyPnL already exists)
