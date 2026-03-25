# OneScale — Project Memory

## What is OneScale?

OneScale is a **SaaS e-commerce analytics dashboard** that unifies Meta Ads and Shopify data into a single platform. It provides campaign management, P&L tracking, creative testing, creative hub (automated creative testing & launching), attribution, automation, and AI-powered recommendations for e-commerce store owners.

**Live at:** onescale.app

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, `src/app/`) |
| Language | TypeScript 5 |
| React | React 19 |
| Styling | Tailwind CSS 4 (custom dark/light theme via CSS variables) |
| State | Zustand 5 (15 stores, several with localStorage persistence) |
| Tables | TanStack React Table 8 |
| Data Fetching | TanStack React Query 5 |
| Virtualization | TanStack React Virtual 3 |
| Charts | Recharts 3 |
| Icons | Lucide React |
| Animations | Framer Motion 12 |
| Drag & Drop | dnd-kit |
| Dates | date-fns 4 + date-fns-tz 3 (timezone-aware) |
| Toasts | react-hot-toast |
| Database | better-sqlite3 (local), Supabase (cloud persistence) |
| Auth | Custom HMAC-SHA256 signed session tokens (cookie-based) |

## Project Structure

```
src/
├── app/
│   ├── dashboard/              # All dashboard pages (27 pages)
│   │   ├── layout.tsx          # Dashboard shell: sidebar + header + mobile hamburger
│   │   ├── summary/            # Main dashboard with live metrics, charts, funnel
│   │   ├── ads-manager/        # Campaign/adset/ad management with table views
│   │   ├── pnl/                # Profit & loss tracking
│   │   ├── creative-testing/   # Creative A/B testing
│   │   ├── creative-hub/       # Creative Hub: product profiles, inbox, tests, copy library
│   │   ├── creative-launch/    # Creative launch dashboard
│   │   ├── creative-analysis/  # Creative performance analysis
│   │   ├── ai-assistant/       # AI-powered assistant
│   │   ├── ai-copy/            # AI copy generation
│   │   ├── automation/         # Rule-based automation
│   │   ├── tracking/           # Pixel tracking & attribution setup
│   │   ├── attribution/        # Multi-touch attribution
│   │   ├── meta-audit/         # 360° Meta account audit
│   │   ├── audiences/          # Audience management
│   │   ├── benchmarks/         # Performance benchmarks
│   │   ├── customer-retention/ # Customer retention analytics
│   │   ├── day-parting/        # Day-parting analysis & scheduling
│   │   ├── marketing-acquisition/ # Marketing acquisition funnel
│   │   ├── store-overview/     # Store overview dashboard
│   │   ├── website-conversion/ # Website conversion analytics
│   │   ├── reports/            # Report generation
│   │   ├── data/               # Data management
│   │   ├── favorites/          # Saved favorites
│   │   ├── onboarding/         # User onboarding flow
│   │   ├── help/               # Help & documentation
│   │   └── settings/           # Store settings, integrations, user management
│   ├── api/
│   │   ├── auth/               # Session management, Meta/Shopify OAuth
│   │   ├── meta/               # Meta Ads API proxy (28 sub-routes)
│   │   ├── shopify/            # Shopify API proxy (10 sub-routes)
│   │   ├── tracking/           # Server-side tracking, pixel, attribution (25+ routes)
│   │   ├── creative-hub/       # Creative Hub API (25 endpoints)
│   │   ├── creative-launch/    # Creative Launch API
│   │   ├── intelligence/       # Product classification & store intelligence (11 routes)
│   │   ├── pnl/                # P&L calculations & breakdowns (10 routes)
│   │   ├── prism/              # Prism analytics & insights (8 routes)
│   │   ├── cron/               # 18 scheduled sync tasks
│   │   ├── dashboard/          # Consolidated dashboard data
│   │   ├── integrations/       # ClickUp integration
│   │   ├── export/             # Data export (PnL, products)
│   │   ├── sync/               # Data sync & cache refresh
│   │   ├── pixel/              # Pixel serving & snippets
│   │   ├── settings/           # Store/account CRUD
│   │   ├── ai/                 # AI campaign copy generation
│   │   ├── admin/              # Runtime config & admin tools (21 sub-routes)
│   │   └── debug/              # Debug endpoints
│   ├── login/                  # Login page
│   └── layout.tsx              # Root layout with theme provider
├── components/
│   ├── layout/                 # Sidebar, StoreSwitcher, UserProfile, SidebarNavItem
│   ├── ui/                     # Reusable: Modal, Badge, Checkbox, DateRangePicker, Toggle, Tabs
│   ├── dashboard/              # Summary page widgets (MetricCards, Charts, FunnelBreakdown)
│   ├── ads-manager/            # Campaign table, filters, inline editing, ad preview
│   ├── creative-testing/       # Creative test components
│   ├── creative-hub/           # Creative Hub components (24 files — see below)
│   ├── pnl/                    # P&L dashboard components
│   └── settings/               # Settings page components
├── stores/                     # 15 Zustand stores (see below)
├── types/                      # TypeScript type definitions
├── lib/                        # Utilities & subsystems (see below)
└── data/                       # Static data (navigation, metric definitions, 27 mock data files)
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/dashboard/layout.tsx` | Dashboard shell — sidebar + mobile hamburger + header |
| `src/components/layout/Sidebar.tsx` | Main sidebar with responsive mobile drawer |
| `src/components/layout/StoreSwitcher.tsx` | Multi-store dropdown selector |
| `src/data/navigation.ts` | All sidebar nav items and sections config |
| `src/data/metricDefinitions.ts` | 60+ metric definitions with formatting rules |
| `middleware.ts` | Auth guard — validates session tokens, protects dashboard/API routes |
| `src/lib/auth/session.ts` | Session token creation/verification (HMAC-SHA256) |
| `src/lib/timezone.ts` | All timezone-aware date operations |
| `src/lib/utils.ts` | `cn()` classname helper, formatting functions |

## Zustand Stores

| Store | Key State | Persisted? |
|-------|-----------|-----------|
| `storeStore` | Active store, ad accounts, multi-store management | Yes (`multi-store`) |
| `campaignStore` | Selected campaigns/adsets/ads, expansion state | No |
| `dateRangeStore` | Selected date range, comparison mode | No |
| `themeStore` | Light/dark theme | Yes (`theme-preference`) |
| `smartFilterStore` | Campaign segments & filters | Yes (`smart-filters`) |
| `columnPresetStore` | Visible columns & presets | Yes (`column-presets`) |
| `dashboardLayoutStore` | Widget positions, edit mode | Yes (`dashboard-layout`) |
| `sectionOrderStore` | Dashboard section ordering, saved views | Yes (`section-order`) |
| `connectionStore` | Meta/Shopify connection status | No |
| `dataFetchStore` | Refresh state & timestamps | No |
| `aiChatStore` | AI chat messages, recommendations | No |
| `campaignCreateStore` | Multi-step campaign creation wizard | No |
| `creativeScheduleStore` | Scheduled creatives & tests | Yes (`creative-schedule`) |
| `creativeHubStore` | Product profiles, inbox, tests, copy library, launch wizard, AI insights | No |
| `creativeLaunchStore` | Creative launch dashboard state | No |

## Library Subsystems (`src/lib/`)

| Subsystem | Files | Purpose |
|-----------|-------|---------|
| `lib/intelligence/` | 29 files | Product classification (masterClassifier, llmClassifier, storeTypeDetector, etc.) |
| `lib/pnl/` | 19 files | P&L engine (expenseEngine, chargebackCalculator, universalCalculator, etc.) |
| `lib/prism/` | 6 files | Analytics (adAttribution, anomalyDetector, financialProfiler, etc.) |
| `lib/attribution/` | 4 files | Attribution engine (currencyHandler, metaSpendAttributor, productClassifier) |
| `lib/auth/` | 3 files | Auth (session, request-session, workspace) |
| `lib/db/` | 1 file | Supabase client |
| `lib/onboarding/` | orchestrator + stages | Onboarding flow |
| `lib/pixel/` | 1 file | Pixel snippet generation |

## Creative Hub Feature

The Creative Hub is a comprehensive creative testing & management system with 24 components, 25 API endpoints, and its own database layer.

### Key Components
- **ProductProfilesTab** — Product configuration with Meta account linking
- **CreativeInboxTab** — ClickUp creative sync, upload to Meta
- **ActiveTestsTab / CompletedTestsTab** — Live & historical test tracking
- **CopyLibraryTab** — Winning copy management with AI generation
- **LaunchWizard** (4 steps) — Campaign creation: campaign → copy → settings → review

### API Routes (`/api/creative-hub/`)
- **Product Profiles**: CRUD + auto-discover from Meta campaigns
- **Creative Inbox**: ClickUp sync, asset upload, Drive link validation
- **Tests**: Active/completed, metrics, review status, AI actions/evaluation
- **Launch**: Execute, health-check, status, retry, rollback
- **Copy Library**: CRUD, auto-populate from Meta, AI generate, AI analyze
- **Winning Ads & AI Insights**: Aggregate top performers, Claude-powered analysis

### Database (`src/app/api/lib/creative-hub-db.ts`)
Dual persistence (SQLite local + Supabase cloud). Tables: `product_profiles`, `product_campaign_links`, `creative_tests`, `creative_test_items`, `test_ad_copy`, `copy_library`, `fatigue_alerts`.

### Key Types (`src/types/creativeHub.ts`)
`ProductProfile`, `InboxCreative`, `LaunchConfig`, `CreativeTest`, `CreativeTestItem`, `WinningCopy`, `FatigueAlert`, `WinningAdsData`, `AIInsightsData`

## Architecture Patterns

- **API routes** proxy external APIs (Meta Graph API, Shopify Admin API) — frontend never calls external APIs directly
- **Auth flow**: Login → signed session cookie → middleware validates on every request
- **OAuth**: Meta and Shopify OAuth flows with token storage in database
- **Timezone handling**: ALL date operations use the store's ad account timezone (from `getStoreTimezone()`), never the browser's local time. Default: `America/New_York`
- **Multi-tenancy**: Store-based isolation — each store has its own ad accounts and data
- **Components**: Custom UI component library (no shadcn/radix) with Lucide icons
- **Mobile**: Responsive design with mobile sidebar drawer (hamburger menu in header)
- **Dual persistence**: SQLite (local dev) + Supabase (cloud/Vercel) with auto-detection
- **AI integration**: Claude API for copy generation, creative insights, and test evaluation
- **ClickUp integration**: Creative asset ingestion from design workflow
- **Cron jobs**: 18 scheduled tasks for syncing Meta spend, Shopify orders, product classification, etc.

## Auth System

- Dashboard auth can be toggled via env vars (`DASHBOARD_PASSWORD` or `LOGIN_ACCESS_CODE`)
- Session tokens: HMAC-SHA256 signed, stored in `session_token` cookie
- Public routes (no auth required): `/api/auth/*`, `/api/shopify/webhooks`, `/api/tracking/pixel`, `/api/tracking/collect`
- Protected: all `/dashboard/*` and other `/api/*` routes

## Known Issues & Fixes

### Mobile sidebar not opening (fixed)
- **Problem**: `hidden` and `flex` Tailwind classes conflicted when `mobileOpen` was true
- **Fix**: Conditional class application — `mobileOpen ? 'flex fixed ...' : 'hidden md:flex'`
- **File**: `src/components/layout/Sidebar.tsx`

### StoreSwitcher null guard (fixed)
- **Problem**: Could crash if store data was null/undefined
- **Fix**: Added null guards in `StoreSwitcher.tsx`

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run start        # Start production server
```
