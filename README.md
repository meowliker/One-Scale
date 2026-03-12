# OneScale

**SaaS e-commerce analytics dashboard** that unifies **Meta Ads** and **Shopify** data into a single platform for e-commerce store owners.

**Live at:** [onescale.app](https://onescale.app)

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16 |
| Language | TypeScript | 5 |
| UI | React | 19 |
| Styling | Tailwind CSS (CSS variable theming, light/dark) | 4 |
| State | Zustand (13 stores, selective localStorage persistence) | 5 |
| Tables | TanStack React Table | 8 |
| Virtual Scrolling | @tanstack/react-virtual | 3.13 |
| Charts | Recharts | 3 |
| Data Fetching | @tanstack/react-query (with persistence) | 5.90 |
| Icons | Lucide React | — |
| Animations | Framer Motion | 12 |
| Drag & Drop | dnd-kit (core, sortable, utilities) | — |
| Dates | date-fns + date-fns-tz (timezone-aware) | 4.1 / 3.2 |
| Toasts | react-hot-toast | 2.6 |
| Database | better-sqlite3 (local) / Supabase Postgres (cloud) | — |
| Auth | Custom HMAC-SHA256 signed session tokens (cookie) | — |
| Build | Turbopack + Webpack (externals for native addons) | — |
| Deployment | Vercel | — |

---

## Project Structure

```
One-Scale/
├── src/
│   ├── app/                              # Next.js App Router
│   │   ├── layout.tsx                    # Root layout (ThemeProvider, QueryProvider)
│   │   ├── globals.css                   # Global styles, CSS theme variables, tooltip classes
│   │   ├── login/                        # Login page
│   │   ├── dashboard/                    # All dashboard pages
│   │   │   ├── layout.tsx                # Dashboard shell (sidebar + header + mobile drawer)
│   │   │   ├── summary/                  # Main analytics — metrics, charts, funnel
│   │   │   ├── ads-manager/              # Campaign/adset/ad management tables
│   │   │   ├── pnl/                      # Profit & loss tracking + waterfall chart
│   │   │   ├── creative-testing/         # A/B creative testing
│   │   │   ├── creative-analysis/        # Creative performance analysis
│   │   │   ├── automation/               # Rule-based automation
│   │   │   ├── tracking/                 # Pixel tracking setup
│   │   │   ├── attribution/              # Multi-touch attribution
│   │   │   ├── meta-audit/               # 360-degree Meta account audit
│   │   │   ├── ai-assistant/             # AI recommendations chat
│   │   │   ├── ai-copy/                  # AI campaign copy generation
│   │   │   ├── audiences/                # Audience management
│   │   │   ├── day-parting/              # Time-based optimization
│   │   │   ├── store-overview/           # Store performance metrics
│   │   │   └── settings/                 # Store settings, integrations, users
│   │   └── api/                          # API routes
│   │       ├── auth/                     # Session management, Meta/Shopify OAuth, status
│   │       ├── meta/                     # Meta Ads API proxy (campaigns, adsets, ads, insights)
│   │       ├── shopify/                  # Shopify API proxy (orders, customers, products)
│   │       ├── tracking/                 # Server-side tracking, pixel, attribution, cron
│   │       ├── settings/                 # Store/account CRUD
│   │       ├── ai/                       # AI copy generation
│   │       ├── attribution/              # Campaign revenue attribution
│   │       ├── dashboard/                # Store overview data
│   │       ├── admin/                    # Runtime config
│   │       └── lib/                      # Shared API utilities
│   ├── components/
│   │   ├── layout/                       # Sidebar, StoreSwitcher, UserProfile, SidebarNavItem
│   │   ├── ui/                           # Reusable: Modal, Badge, DateRangePicker, Toggle, Tabs, Checkbox
│   │   ├── ads-manager/                  # Campaign table, filters, inline editing, ad preview
│   │   ├── analytics/                    # Dashboard metrics, charts, funnels
│   │   ├── pnl/                          # P&L dashboard, waterfall chart
│   │   ├── creative-testing/             # A/B test components
│   │   ├── creative-analysis/            # Creative performance
│   │   ├── ai/                           # AI chat, copy generation UI
│   │   ├── automation/                   # Automation rules UI
│   │   ├── campaign-create/              # Multi-step campaign creation wizard
│   │   ├── integrations/                 # Integration management
│   │   ├── settings/                     # Settings page components
│   │   └── providers/                    # QueryProvider, ThemeProvider
│   ├── stores/                           # Zustand state stores (13 total)
│   │   ├── storeStore.ts                 # Multi-store management (persisted)
│   │   ├── campaignStore.ts              # Campaign selection & expansion state
│   │   ├── dateRangeStore.ts             # Date range & comparison mode
│   │   ├── themeStore.ts                 # Light/dark theme (persisted)
│   │   ├── smartFilterStore.ts           # Campaign filters (persisted)
│   │   ├── columnPresetStore.ts          # Table column visibility (persisted)
│   │   ├── dashboardLayoutStore.ts       # Widget positions (persisted)
│   │   ├── sectionOrderStore.ts          # Dashboard section ordering (persisted)
│   │   ├── connectionStore.ts            # Meta/Shopify connection status
│   │   ├── dataFetchStore.ts             # Refresh timestamps
│   │   ├── aiChatStore.ts                # AI chat messages
│   │   ├── campaignCreateStore.ts        # Campaign wizard state
│   │   └── creativeScheduleStore.ts      # Scheduled creatives (persisted)
│   ├── services/                         # Business logic
│   │   ├── adsManager.ts                 # Campaign/adset/ad loading
│   │   ├── analytics.ts                  # Blended metrics & time series
│   │   ├── pnl.ts                        # P&L calculations
│   │   ├── metaAudit.ts                  # Meta account audit logic
│   │   ├── creativeAnalysis.ts           # Creative performance
│   │   ├── campaignPublish.ts            # Campaign creation/publishing
│   │   ├── ai.ts                         # AI service integration
│   │   └── withMockFallback.ts           # Mock data fallback for dev
│   ├── types/                            # TypeScript type definitions (21 files)
│   │   ├── store.ts                      # Store, AdAccount
│   │   ├── campaign.ts                   # Campaign, AdSet, Ad, metrics
│   │   ├── metrics.ts                    # MetricKey, MetricDefinition
│   │   ├── analytics.ts                  # Analytics types
│   │   ├── pnl.ts                        # P&L entry types
│   │   └── automation.ts                 # Automation rule types
│   ├── lib/                              # Utilities
│   │   ├── auth/session.ts               # HMAC-SHA256 token creation/verification
│   │   ├── db/                           # Database utilities (Supabase client)
│   │   ├── timezone.ts                   # Timezone-aware date operations
│   │   ├── utils.ts                      # cn(), formatCurrency, formatNumber, formatPercentage, formatROAS
│   │   ├── metrics.ts                    # Metric definitions & formatting
│   │   ├── motion.ts                     # Framer Motion animation configs
│   │   ├── prefetch.ts                   # React Query prefetch utilities
│   │   ├── queryClient.ts               # React Query configuration
│   │   └── dateUtils.ts                  # Date helper functions
│   ├── data/                             # Static data (28 mock files)
│   │   ├── navigation.ts                # Sidebar nav config
│   │   ├── metricDefinitions.ts         # 60+ metric definitions with formatting rules
│   │   ├── mockCampaigns.ts             # Mock campaign data
│   │   └── ...                          # Mock data for dev (pnl, audit, etc.)
│   └── hooks/                            # Custom React hooks
├── supabase/
│   └── schema.sql                        # Postgres schema (stores, users, workspaces, connections, etc.)
├── scripts/
│   ├── run-parallel-checks.mjs           # Run lint, typecheck, test in parallel
│   ├── run-tests.mjs                     # Test runner
│   ├── export-sqlite-to-supabase.mjs     # Export local DB to Supabase seed
│   └── test-creative-load.mjs            # Creative load test
├── docs/plans/                           # Feature planning templates
├── public/                               # Static assets
├── middleware.ts                         # Auth guard — validates session, protects routes
├── next.config.ts                        # better-sqlite3 externals, Turbopack, watch ignores
├── tsconfig.json                         # Target ES2017, strict, @/* path alias
├── vercel.json                           # 60s function timeout, daily cron, security headers
├── eslint.config.mjs                     # ESLint config
└── CLAUDE.md                             # Project memory (detailed context for Claude Code)
```

---

## Architecture

### Data Flow

```
Browser  -->  Next.js API Routes  -->  Meta Graph API / Shopify Admin API
   |               |
   |          Supabase / SQLite (tokens, stores, snapshots)
   |
Zustand stores  <--  React Query (caching + persistence)
```

- **Frontend never calls external APIs directly** — all Meta/Shopify calls go through `/api/` proxy routes
- **React Query** handles caching, refetching, and offline persistence
- **Zustand** manages UI state; 7 of 13 stores persist to localStorage

### Auth System

- **Session tokens**: HMAC-SHA256 signed, stored in `onescale_session` cookie
- **Middleware** (`middleware.ts`): Validates token on every request to protected routes
- **Public routes** (no auth): `/api/auth/*`, `/api/shopify/webhooks`, `/api/tracking/pixel`, `/api/tracking/collect`
- **Protected routes**: All `/dashboard/*` and other `/api/*` routes
- **Login toggle**: Controlled by env vars (`APP_DASHBOARD_PASSWORD`, `APP_LOGIN_ACCESS_CODE`, `APP_REQUIRE_LOGIN`)

### Multi-Tenancy

- **Store-based isolation**: Each store has its own ad accounts, connections, and data
- `StoreSwitcher` component in sidebar for switching between stores
- Active store tracked in `storeStore` (persisted)

### Timezone Handling (Critical)

- **ALL date operations** must use the store's ad account timezone via `getStoreTimezone()`, **never** the browser's local time
- Default timezone: `America/New_York`
- Uses `date-fns-tz` for all timezone conversions
- Ensures consistency between Shopify orders, Meta insights, and dashboard displays

### Styling & Theming

- **Tailwind CSS 4** with CSS custom properties for theming
- **Light/dark mode** controlled by `themeStore`
- **Apple Design Palette**:
  - Light: `#f5f5f7` background, `#ffffff` surface, `#1d1d1f` text
  - Dark: `#0f172a` background, `#1e293b` surface, `#f1f5f9` text
  - Primary: `#0071e3` (light), `#7c5cfc` (dark)
- **Custom UI component library** (no shadcn/radix) with Lucide icons
- **Tooltip styling**: Shared `.onescale-tooltip` class with light/dark variants
- **Chart colors**: Static values (blue, purple, emerald, amber, rose, cyan)
- **Mobile responsive** with hamburger menu drawer sidebar

---

## Key Features

| Feature | Route | Description |
|---------|-------|-------------|
| Dashboard Summary | `/dashboard/summary` | Live metrics cards, time series charts, date comparison, funnel breakdown, Shopify revenue overlay |
| Ads Manager | `/dashboard/ads-manager` | Hierarchical campaign/adset/ad table, virtual scrolling (10,000+ rows), inline editing, ad preview, smart filters, column presets, drag-to-reorder |
| P&L Dashboard | `/dashboard/pnl` | Waterfall chart (Revenue -> Costs -> Net Profit), daily/product P&L, refund tracking, Shopify fee deductions |
| Creative Testing | `/dashboard/creative-testing` | A/B test creation, creative performance comparison, scheduled deployments |
| Creative Analysis | `/dashboard/creative-analysis` | Creative performance metrics and analysis |
| Automation | `/dashboard/automation` | Rule-based campaign adjustments (ROAS thresholds, spend limits, schedules), decision queue & approval |
| Tracking | `/dashboard/tracking` | Pixel tracking setup and configuration |
| Attribution | `/dashboard/attribution` | Multi-touch attribution models |
| Meta Audit | `/dashboard/meta-audit` | 360-degree account audit, policy violations, health metrics, recommendations |
| AI Assistant | `/dashboard/ai-assistant` | AI-powered recommendations chat |
| AI Copy | `/dashboard/ai-copy` | AI campaign copy generation (multi-variant) |
| Store Overview | `/dashboard/store-overview` | Store-level performance metrics |
| Settings | `/dashboard/settings` | Store config, integrations (Meta/Shopify OAuth), user management |

---

## Database

### Local Development
- **SQLite** via `better-sqlite3` (native C++ addon)
- Export to Supabase seed: `npm run db:export-supabase-seed`

### Production
- **Supabase** (Postgres) — schema in `supabase/schema.sql`
- Key tables: `stores`, `app_users`, `workspaces`, `workspace_members`, `connections`, `store_ad_accounts`, `app_credentials`, `meta_endpoint_snapshots`, `decision_rulesets`, `decision_queue_runs`, `decision_queue_items`
- Toggle via `DB_PROVIDER` env var (`sqlite` or `supabase`)

---

## Environment Variables

### Required for Deployment

| Variable | Purpose |
|----------|---------|
| `APP_DASHBOARD_PASSWORD` | Team login password |
| `APP_DASHBOARD_TOKEN` | Session token value (stored in cookie) |
| `APP_ENCRYPTION_KEY` | Token encryption secret (32+ chars) |
| `TOKEN_ENCRYPTION_SECRET` | Compatibility alias for `APP_ENCRYPTION_KEY` |

### Optional

| Variable | Purpose |
|----------|---------|
| `APP_REQUIRE_LOGIN` | Force auth gate (default: enabled if password set) |
| `APP_ALLOW_LEGACY_PASSWORD_LOGIN` | Allow legacy password-only login |
| `APP_BOOTSTRAP_CODE` | Initial setup access code |
| `APP_LOGIN_ACCESS_CODE` | Alternative login code |
| `DB_PROVIDER` | `sqlite` (default) or `supabase` |
| `TEST_STORE_ID` | Required for running tests |

---

## Commands

```bash
# Development
npm run dev                  # Start dev server (Turbopack)
npm run build                # Production Next.js build
npm run start                # Start production server

# Quality Checks
npm run lint                 # ESLint
npm run lint:fix             # Auto-fix ESLint issues
npm run typecheck            # TypeScript type checking
npm run test                 # Run tests (skips if TEST_STORE_ID not set)
npm run check                # Sequential: lint -> typecheck -> test -> build
npm run check:parallel       # Parallel: lint/typecheck/test, then build

# Database
npm run db:export-supabase-seed  # Export SQLite to Supabase seed SQL

# Performance
npm run test:creative-load   # Creative loading performance test
```

---

## Deployment (Vercel)

1. Import GitHub repo into Vercel
2. Set required environment variables
3. Deploys automatically on push
4. API functions have 60-second timeout (`vercel.json`)
5. Cron job: `/api/tracking/cron-backfill` runs daily at 6 AM UTC
6. Security headers configured: `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`

---

## Development Workflow

### Before Pushing
```bash
npm run check:parallel       # Full quality gate
```

### Bug Fix Flow
1. Reproduce and isolate (`npm run dev`)
2. Add logging or minimal failing case
3. Fix smallest root cause first
4. Run `npm run lint && npm run typecheck && npm run test`
5. Run `npm run check:parallel`

### New Feature Flow
1. Write a one-page mini spec in `docs/plans/` (problem, scope, API changes, test plan)
2. Build in thin slices: data/service layer -> UI layer -> edge cases
3. Validate: happy path, empty/loading/error states, regression on related pages
4. Run `npm run check:parallel`

---

## Critical Rules

1. **Always read files before editing** — understand existing code first
2. **Build before deploying** — `npx next build` must pass with zero errors
3. **Timezone**: Always use `getStoreTimezone()` for date operations, never browser local time
4. **API proxy pattern**: Frontend never calls Meta/Shopify APIs directly — always through `/api/` routes
5. **Custom components**: No shadcn/radix — the project has its own UI component library
6. **Rate limit toasts**: Deduplicated via `id: 'rate-limit'` + 120-second time guard
7. **Virtual scrolling**: Used for tables with 10,000+ rows (`@tanstack/react-virtual`)
8. **Mock fallback**: Services use `withMockFallback()` for dev without live OAuth connections
9. **Store isolation**: All data operations scoped to the active store from `storeStore`
10. **Persistence selectivity**: Only 7 of 13 Zustand stores persist to localStorage (to avoid data bloat)
