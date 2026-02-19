export const ONE_SCALE_SESSION_COOKIE = 'onescale_session';

export function getDashboardPassword(): string {
  return (process.env.APP_DASHBOARD_PASSWORD || '').trim();
}

export function getDashboardSessionToken(): string {
  const explicit = (process.env.APP_DASHBOARD_TOKEN || '').trim();
  if (explicit) return explicit;
  // Fallback for local/dev usage only.
  return getDashboardPassword();
}

export function isDashboardAuthEnabled(): boolean {
  return getDashboardPassword().length > 0;
}
