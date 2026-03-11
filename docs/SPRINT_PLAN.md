# OneScale — Sprint Plan
**Target: EOD Tomorrow** | Last Updated: 2026-03-11

---

## OWNER MAP

| Section | Owner |
|---|---|
| Ads Manager | Dev Team |
| Ads Error Center | Dev Team |
| Attribution / Health | Dev Team |
| AI Recommendations | Dev Team |
| P&L Sheet | Mahesh |
| Summary | Dev Team |
| Creative Testing | Gaurav |

---

## 1. ADS MANAGER

### 1.1 Instant Load
- [ ] Load active campaign data on mount — no spinner, no delay
- [ ] Pre-fetch all data (campaigns, adsets, ads) in parallel on page load
- [ ] Cache the last successful response so it renders immediately on revisit

### 1.2 Latest Actions Panel
- [ ] Show the last 7 edits/actions — **active campaigns only**
- [ ] Display: action type, target name, timestamp, changed value (before → after)
- [ ] Collapsed by default, expandable panel on the right or bottom

### 1.3 Action & Functionality Audit
- [ ] Audit every button/action in the ads manager for correctness
- [ ] Verify: toggle on/off, budget edit, bid edit, status change all work end-to-end
- [ ] Fix any broken or non-functional controls

### 1.4 Date Section
- [ ] Add a calendar date-picker (single + range support)
- [ ] Organize: Preset ranges (Today, Yesterday, Last 7d, Last 30d, This Month, Custom)
- [ ] Consistent styling with the rest of the app

### 1.5 Live Mode Button
- [ ] Add a **"Live"** toggle button in the header bar
- [ ] When enabled: auto-refresh data from Facebook API every **2 minutes**
- [ ] Visual indicator (pulsing green dot) while live mode is active
- [ ] Disable live mode automatically if the user navigates away

### 1.6 Column Section Redesign
- [ ] Replace the text "Columns" button with a **columns icon only** (no label)
- [ ] Tooltip on hover: "Columns"
- [ ] **Move Preset section inside the Column panel** — presets are a sub-section, not a separate control
- [ ] Layout inside panel: Presets at top, column toggles below

### 1.7 Performance Graph
- [ ] Graphs must load for **active campaigns only** (auto-load on open)
- [ ] Separate tabs/views: Campaign / Adset / Ad level
- [ ] Verify data accuracy for each level — no mismatched metrics
- [ ] Default metric: Spend + ROAS overlaid

### 1.8 Active Column Filter
- [ ] Add **"Active Only"** filter toggle for: Campaigns, Adsets, Ads, Rejected Ads
- [ ] Filter persists within the session
- [ ] Badge count on the filter showing how many items are hidden

### 1.9 Remove Active Column
- [ ] Remove the "Active" status column from the Ads Manager table
- [ ] Status is shown via row styling / toggle — no redundant column needed

### 1.10 Kill / Review / Scale Panel
- [ ] Add **3d / 7d** time window selector — all recommendations are scoped to selected window
- [ ] UI improvements:
  - Clear "Kill" (red), "Review" (yellow), "Scale" (green) visual hierarchy
  - Show key metric delta vs prior period
  - One-click action buttons per recommendation
  - Confirmation modal before Kill action

### 1.11 Edit & Duplicate (Facebook-style)
- [ ] Inline row edit: click a cell to edit budget, bid, name directly
- [ ] Right-click context menu OR action column with: Edit | Duplicate | Preview
- [ ] Duplicate creates a copy with "Copy of …" prefix, opens edit modal pre-filled
- [ ] Edit modal matches Facebook Ads Manager field layout

---

## 2. ADS ERROR CENTER

### 2.1 Rejected Ads Auto-Load
- [ ] On app load, automatically fetch ads rejected in the **last 12 hours**
- [ ] Show in a dedicated "Error Center" panel / page section
- [ ] Display: Ad name, Ad set, Campaign, Rejection reason, Policy link (if available)

### 2.2 Timestamp
- [ ] Show exact rejection timestamp (relative: "2h ago" + absolute on hover)
- [ ] Sort by most recent rejection first

### 2.3 Notification Badge
- [ ] If any rejections in last 12 hours → show a **blinking red dot** on the Error Center nav icon
- [ ] Blink animation: CSS pulse, stops after user visits Error Center
- [ ] No number badge — icon blink only

---

## 3. ATTRIBUTION CENTER / HEALTH

> Goal: Better than TripleWhale

- [ ] **Journey View**: Full customer touchpoint timeline (first click → last click → purchase)
- [ ] **Channel Attribution**: Side-by-side comparison — First Touch / Last Touch / Linear / Time Decay / Data-Driven
- [ ] **Revenue Reconciliation**: Meta reported vs Shopify actual — delta highlighted
- [ ] **Store Health Score**: Single metric (0–100) combining ROAS, CVR, AOV trends
- [ ] **Cohort Analysis**: LTV by acquisition channel + date cohort
- [ ] **UTM Breakdown**: Revenue by utm_source / utm_medium / utm_campaign
- [ ] Real-time view: last 24h rolling window with auto-refresh

---

## 4. AI RECOMMENDATIONS (Ads Manager)

- [ ] Replace generic tips with **data-driven, specific recommendations**:
  - "Adset X has CPM 40% above account average — consider new audience"
  - "Campaign Y ROAS dropped 25% in last 3d — review creative fatigue"
  - "Scale candidate: Adset Z — stable ROAS >2.5 for 7d, budget headroom available"
- [ ] Each recommendation: metric evidence + suggested action + 1-click apply
- [ ] Priority ranking: High / Medium / Low
- [ ] Dismiss / Snooze per recommendation

---

## 5. P&L SHEET (Mahesh)

### 5.1 Live Updates
- [ ] Verify P&L data refreshes in real-time (or on a clear schedule)
- [ ] Show last-updated timestamp prominently

### 5.2 Graph
- [ ] Fix the P&L graph (correct data mapping) OR remove it if unfixable before EOD

### 5.3 Net Profit Trend — Hourly
- [ ] Hourly breakdown chart for net profit
- [ ] **NOT URGENT** — deprioritize if time is short

### 5.4 Product-wise P&L Breakdown
- [ ] Table: Product | Revenue | COGS | Ad Spend | Gross Profit | Net Profit | Margin %
- [ ] Sortable columns
- [ ] Filter by date range

### 5.5 Remove Product Performance Section
- [ ] Remove the existing "Product Performance" section OR fix it completely
- [ ] No half-working sections shipped

### 5.6 Remove Breakdown Section
- [ ] Remove the "Breakdown" section from P&L

### 5.7 Chargeback Section
- [ ] Add a dedicated Chargeback section
- [ ] Show: total chargebacks, chargeback rate %, by product, by time period
- [ ] Pull from Shopify dispute/chargeback data

---

## 6. SUMMARY PAGE

### 6.1 Instant Data Load
- [ ] Pre-load summary data on mount — same approach as Ads Manager
- [ ] Skeleton screens while loading, not blank states

### 6.2 Conversion Funnel — Fix Data
- [ ] Audit each funnel step's data source
- [ ] Ensure Sessions → Add to Cart → Checkout → Purchase numbers are accurate and consistent

### 6.3 Top Performing Campaigns — Fix Data
- [ ] Verify correct campaigns are shown (currently showing incorrect data)
- [ ] Confirm metric used for ranking (ROAS? Revenue? Spend?)

### 6.4 Live Bar — Add Profit
- [ ] The live top bar currently shows: Sessions, Revenue, Orders, ROAS
- [ ] Add: **Net Profit** and **Profit Margin %**

---

## 7. CREATIVE TESTING

> **Owner: Gaurav** — Gaurav to plan and execute independently

---

## PRIORITY ORDER FOR TOMORROW

| Priority | Item |
|---|---|
| P0 | Ads Manager instant load (1.1) |
| P0 | Ads Error Center auto-load + blink badge (2.1, 2.3) |
| P0 | Summary instant load + live bar profit (6.1, 6.4) |
| P1 | Live mode button (1.5) |
| P1 | Performance graph fix (1.7) |
| P1 | P&L live check + product breakdown + chargeback (5.1, 5.4, 5.7) |
| P1 | Kill/Review/Scale 3d/7d + UI (1.10) |
| P2 | Column section icon + preset inside (1.6) |
| P2 | Active filter toggles (1.8, 1.9) |
| P2 | Date section calendar (1.4) |
| P2 | Edit & Duplicate (1.11) |
| P2 | Latest Actions panel (1.2) |
| P3 | Attribution Center full rebuild (3) |
| P3 | AI Recommendations upgrade (4) |
| P3 | Net Profit hourly trend (5.3) |

---

## DEFINITION OF DONE

- Feature works end-to-end in production (not just locally)
- No console errors related to the feature
- Mobile responsive (where applicable)
- Data shown matches the source (Facebook / Shopify) — spot-checked manually
