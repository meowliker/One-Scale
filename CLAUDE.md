# OneScale — Project Memory

## What is OneScale?

OneScale is a **SaaS e-commerce analytics dashboard** that unifies Meta Ads and Shopify data into a single platform. It provides campaign management, P&L tracking, creative testing, attribution, automation, and AI-powered recommendations for e-commerce store owners.

**Live at:** onescale.app

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, `src/app/`) |
| Language | TypeScript 5 |
| React | React 19 |
| Styling | Tailwind CSS 4 (custom dark/light theme via CSS variables) |
| State | Zustand 5 (13 stores, several with localStorage persistence) |
| Tables | TanStack React Table 8 |
| Charts | Recharts 3 |
| Icons | Lucide React |
| Animations | Framer Motion 12 |
| Drag & Drop | dnd-kit |
| Dates | date-fns + date-fns-tz (timezone-aware) |
| Toasts | react-hot-toast |
| Database | better-sqlite3 (local), Supabase (cloud persistence) |
| Auth | Custom HMAC-SHA256 signed session tokens (cookie-based) |

## Project Structure

```
src/
├── app/
│   ├── dashboard/          # All dashboard pages (summary, ads-manager, pnl, etc.)
│   │   ├── layout.tsx      # Dashboard shell: sidebar + header + mobile hamburger
│   │   ├── summary/        # Main dashboard with live metrics, charts, funnel
│   │   ├── ads-manager/    # Campaign/adset/ad management with table views
│   │   ├── pnl/            # Profit & loss tracking
│   │   ├── creative-testing/ # Creative A/B testing
│   │   ├── automation/     # Rule-based automation
│   │   ├── tracking/       # Pixel tracking & attribution setup
│   │   ├── attribution/    # Multi-touch attribution
│   │   ├── meta-audit/     # 360° Meta account audit
│   │   ├── settings/       # Store settings, integrations, user management
│   │   └── ...             # Other workspace pages
│   ├── api/
│   │   ├── auth/           # Session management, Meta/Shopify OAuth
│   │   ├── meta/           # Meta Ads API proxy routes (campaigns, adsets, ads, insights)
│   │   ├── shopify/        # Shopify API proxy routes (orders, customers, products)
│   │   ├── tracking/       # Server-side tracking, pixel, attribution
│   │   ├── settings/       # Store/account CRUD
│   │   ├── ai/             # AI campaign copy generation
│   │   └── admin/          # Runtime config
│   ├── login/              # Login page
│   └── layout.tsx          # Root layout with theme provider
├── components/
│   ├── layout/             # Sidebar, StoreSwitcher, UserProfile, SidebarNavItem, SidebarSection
│   ├── ui/                 # Reusable: Modal, Badge, Checkbox, DateRangePicker, Toggle, Tabs, etc.
│   ├── dashboard/          # Summary page widgets (MetricCards, Charts, FunnelBreakdown, etc.)
│   ├── ads-manager/        # Campaign table, filters, inline editing, ad preview
│   ├── creative-testing/   # Creative test components
│   ├── pnl/                # P&L dashboard components
│   └── settings/           # Settings page components
├── stores/                 # 13 Zustand stores (see below)
├── types/                  # TypeScript type definitions
├── lib/                    # Utilities (cn, formatCurrency, formatNumber, formatPercentage, etc.)
├── data/                   # Static data (navigation config, metric definitions)
└── hooks/                  # Custom React hooks
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

## Architecture Patterns

- **API routes** proxy external APIs (Meta Graph API, Shopify Admin API) — frontend never calls external APIs directly
- **Auth flow**: Login → signed session cookie → middleware validates on every request
- **OAuth**: Meta and Shopify OAuth flows with token storage in database
- **Timezone handling**: ALL date operations use the store's ad account timezone (from `getStoreTimezone()`), never the browser's local time. Default: `America/New_York`
- **Multi-tenancy**: Store-based isolation — each store has its own ad accounts and data
- **Components**: Custom UI component library (no shadcn/radix) with Lucide icons
- **Mobile**: Responsive design with mobile sidebar drawer (hamburger menu in header)

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
