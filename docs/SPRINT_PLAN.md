# OneScale — Sprint Plan
**Target: EOD Tomorrow** | Last Updated: 2026-03-11
**Team: You (Lead) · Anay · Mahesh**

---

## TEAM OWNERSHIP

| Section | Owner | Status |
|---|---|---|
| Ads Manager — Instant Load, Live Mode, Graphs | **Anay** | 🔴 Not Started |
| Ads Manager — Kill/Review/Scale, Edit/Duplicate | **Anay** | 🔴 Not Started |
| Ads Manager — Column, Date, Filters, Actions Panel | **You** | 🔴 Not Started |
| Ads Error Center | **You** | 🔴 Not Started |
| Attribution Center / Health | **You** | 🔴 Not Started |
| AI Recommendations | **Anay** | 🔴 Not Started |
| P&L Sheet (all items) | **Mahesh** | 🔴 Not Started |
| Summary Page | **Anay** | 🔴 Not Started |
| Creative Testing | **You + Anay + Mahesh** | 🔴 Planning |

---

## BUG TRACKER

> Format: `[ID] Description — Owner — Status`
> Status: 🔴 Found · 🟡 In Progress · 🟢 Fixed

| ID | Bug | Owner | Status | Notes |
|---|---|---|---|---|
| B-01 | Summary — Top Performing Campaigns showing incorrect data | Anay | 🔴 Found | Wrong ranking metric |
| B-02 | Summary — Conversion Funnel data mismatch | Anay | 🔴 Found | Steps don't add up |
| B-03 | P&L — Graph broken / incorrect data mapping | Mahesh | 🔴 Found | Fix or remove |
| B-04 | Ads Manager — Performance graph data wrong per level | Anay | 🔴 Found | Camp/Adset/Ad mismatch |
| B-05 | Ads Manager — Active column redundant/incorrect | You | 🔴 Found | Remove it |
| B-06 | Ads Manager — Actions/buttons not all functional | You | 🔴 Found | Needs full audit |

**Bugs Summary: 6 Found · 0 In Progress · 0 Fixed**

---

## FEATURE TRACKER

> Status: 🔴 Not Started · 🟡 In Progress · 🟢 Done

### ADS MANAGER — Owner: Anay (performance/data) + You (UI/controls)

| ID | Feature | Owner | Status |
|---|---|---|---|
| F-01 | Instant load — active campaign data on mount | Anay | 🔴 Not Started |
| F-02 | Latest Actions panel — last 7 edits, active camps only | You | 🔴 Not Started |
| F-03 | Date section — calendar picker + presets | You | 🔴 Not Started |
| F-04 | Live Mode button — 2 min auto-refresh from Facebook | Anay | 🔴 Not Started |
| F-05 | Column section — icon only + tooltip + presets inside | You | 🔴 Not Started |
| F-06 | Performance Graph — Camp/Adset/Ad tabs, active only | Anay | 🔴 Not Started |
| F-07 | Active Only filter — Campaigns, Adsets, Ads, Rejected | You | 🔴 Not Started |
| F-08 | Kill/Review/Scale — 3d/7d selector + UI overhaul | Anay | 🔴 Not Started |
| F-09 | Edit & Duplicate — inline + modal, Facebook-style | Anay | 🔴 Not Started |

### ADS ERROR CENTER — Owner: You

| ID | Feature | Owner | Status |
|---|---|---|---|
| F-10 | Auto-load rejected ads from last 12h on app open | You | 🔴 Not Started |
| F-11 | Rejection timestamp — relative + absolute on hover | You | 🔴 Not Started |
| F-12 | Blinking badge on nav icon if rejections in last 12h | You | 🔴 Not Started |

### ATTRIBUTION CENTER — Owner: You

| ID | Feature | Owner | Status |
|---|---|---|---|
| F-13 | Customer journey view — full touchpoint timeline | You | 🔴 Not Started |
| F-14 | Channel attribution models — First/Last/Linear/TD/DD | You | 🔴 Not Started |
| F-15 | Revenue reconciliation — Meta vs Shopify delta | You | 🔴 Not Started |
| F-16 | Store Health Score (0–100) | You | 🔴 Not Started |
| F-17 | Cohort analysis — LTV by channel + date | You | 🔴 Not Started |
| F-18 | UTM breakdown table | You | 🔴 Not Started |

### AI RECOMMENDATIONS — Owner: Anay

| ID | Feature | Owner | Status |
|---|---|---|---|
| F-19 | Data-driven specific recommendations with 1-click apply | Anay | 🔴 Not Started |
| F-20 | Priority ranking (High/Med/Low) + Dismiss/Snooze | Anay | 🔴 Not Started |

### P&L SHEET — Owner: Mahesh

| ID | Feature | Owner | Status |
|---|---|---|---|
| F-21 | Verify live data refresh + show last-updated timestamp | Mahesh | 🔴 Not Started |
| F-22 | Product-wise P&L breakdown table | Mahesh | 🔴 Not Started |
| F-23 | Remove Product Performance section | Mahesh | 🔴 Not Started |
| F-24 | Remove Breakdown section | Mahesh | 🔴 Not Started |
| F-25 | Chargeback section from Shopify data | Mahesh | 🔴 Not Started |
| F-26 | Net Profit hourly trend *(NOT URGENT)* | Mahesh | 🔴 Not Started |

### SUMMARY PAGE — Owner: Anay

| ID | Feature | Owner | Status |
|---|---|---|---|
| F-27 | Instant data load + skeleton screens | Anay | 🔴 Not Started |
| F-28 | Add Net Profit + Margin % to live top bar | Anay | 🔴 Not Started |

### CREATIVE TESTING — Owner: You + Anay + Mahesh

| ID | Feature | Owner | Status |
|---|---|---|---|
| F-29 | Creative Testing — TBD (planning in progress) | All 3 | 🔴 Planning |

---

## HOW TO UPDATE THIS DOC

When you start something:
1. Change status from 🔴 → 🟡 In Progress
2. Add a "Notes" column entry if helpful

When you finish:
1. Change status from 🟡 → 🟢 Done
2. Update the Bug Summary count at the top of Bug Tracker

---

## PRIORITY ORDER

| Priority | ID | Item |
|---|---|---|
| **P0** | F-01 | Ads Manager instant load |
| **P0** | F-10, F-12 | Error Center auto-load + blink badge |
| **P0** | F-27, F-28 | Summary instant load + profit in live bar |
| **P1** | F-04 | Live mode button |
| **P1** | F-06 | Performance graph fix |
| **P1** | B-01, B-02 | Summary data bugs |
| **P1** | F-21, F-22, F-25 | P&L live + product breakdown + chargeback |
| **P1** | F-08 | Kill/Review/Scale 3d/7d |
| **P2** | F-05, F-07 | Column icon, active filters |
| **P2** | F-03 | Date picker |
| **P2** | F-09 | Edit & Duplicate |
| **P2** | F-02 | Latest Actions panel |
| **P2** | B-03, B-04, B-05, B-06 | Remaining bugs |
| **P3** | F-13–F-18 | Attribution Center rebuild |
| **P3** | F-19, F-20 | AI Recommendations upgrade |
| **P3** | F-26 | Net Profit hourly trend |

---

## TOTALS AT A GLANCE

| Category | Count |
|---|---|
| Bugs Found | 6 |
| Bugs Fixed | 0 |
| Features Planned | 29 |
| Features Done | 0 |
| In Progress | 0 |

---

## DEFINITION OF DONE

- Works end-to-end in production (not just locally)
- No console errors related to the change
- Mobile responsive where applicable
- Data verified against source (Facebook / Shopify)
