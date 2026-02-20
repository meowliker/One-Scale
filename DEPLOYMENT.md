# OneScale Launch Setup (Today)

## 1. Security env vars (required)
Set these in Vercel Project -> Settings -> Environment Variables:

- `APP_DASHBOARD_PASSWORD`: shared team login password
- `APP_DASHBOARD_TOKEN`: random long token (used for session cookie value)
- `APP_ENCRYPTION_KEY`: random 32+ char secret for token encryption
- `TOKEN_ENCRYPTION_SECRET`: keep same value as `APP_ENCRYPTION_KEY` for compatibility

Auth gate is enabled automatically when `APP_DASHBOARD_PASSWORD` is set.

## 2. Deploy on Vercel
1. Import GitHub repo `meowliker/One-Scale` into Vercel
2. Framework preset: Next.js
3. Root directory: `creative-analysis-dashboard` (if mono-folder repo)
4. Set env vars above + Meta/Shopify OAuth vars
5. Deploy

## 3. Supabase migration layer (phase A)
This repo now includes:

- `supabase/schema.sql`: core Postgres schema + decision queue tables
- `scripts/export-sqlite-to-supabase.mjs`: exports local SQLite to `supabase/seed.sql`

To generate seed SQL from your local DB:

```bash
npm run db:export-supabase-seed
```

Then in Supabase SQL editor:
1. run `supabase/schema.sql`
2. run generated `supabase/seed.sql`

## 4. Current runtime mode
Current production runtime is still SQLite-based (`DB_PROVIDER=sqlite` default) so existing routes remain stable.

Supabase migration assets are ready so you can move data without breaking today’s launch.
