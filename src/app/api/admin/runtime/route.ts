import { NextResponse } from 'next/server';
import { isEncryptionConfigured } from '@/app/api/lib/crypto';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/db';
import { isDashboardAuthEnabled } from '@/lib/auth/session';
import { isSupabaseConfigured } from '@/lib/db/supabase';

export async function GET() {
  return NextResponse.json({
    app: 'OneScale',
    dbProvider: process.env.DB_PROVIDER || 'sqlite',
    supabasePersistenceEnabled: isSupabasePersistenceEnabled(),
    dashboardAuthEnabled: isDashboardAuthEnabled(),
    tokenEncryptionEnabled: isEncryptionConfigured(),
    supabaseConfigured: isSupabaseConfigured(),
  });
}
