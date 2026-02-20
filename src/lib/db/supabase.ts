export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  dbUrl: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    dbUrl: process.env.SUPABASE_DB_URL || '',
  };
}

export function isSupabaseConfigured(): boolean {
  const cfg = getSupabaseConfig();
  return !!(cfg.url && cfg.serviceRoleKey && cfg.dbUrl);
}
