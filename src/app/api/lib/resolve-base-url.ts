import { NextRequest } from 'next/server';

/**
 * Resolves the public base URL for the current deployment.
 *
 * This function exists because NEXT_PUBLIC_APP_URL may be stale or point
 * to a different Vercel alias.  We check Vercel's auto-populated env vars
 * first so that webhooks and internal service-to-service calls always
 * reach the *actual* deployment.
 *
 * Priority:
 *   1. Explicit override (body / query param)
 *   2. WEBHOOK_BASE_URL           — dedicated override for webhook/pixel URLs
 *   3. VERCEL_PROJECT_PRODUCTION_URL — auto-set by Vercel in production
 *   4. VERCEL_URL                 — auto-set by Vercel for each deployment
 *   5. NEXT_PUBLIC_APP_URL        — user-configured
 *   6. NEXT_PUBLIC_API_BASE_URL   — user-configured
 *   7. Request origin (Host header)
 */
export function resolveDeploymentBaseUrl(
  request: NextRequest,
  overrideBaseUrl?: string,
): string {
  if (overrideBaseUrl) {
    const trimmed = overrideBaseUrl.trim().replace(/\/+$/, '');
    if (trimmed) return ensureHttps(trimmed);
  }

  const candidates = [
    process.env.WEBHOOK_BASE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
  ];

  for (const raw of candidates) {
    if (raw && raw.trim()) {
      const trimmed = raw.trim().replace(/\/+$/, '');
      if (trimmed) return ensureHttps(trimmed);
    }
  }

  return new URL(request.url).origin;
}

/** Prepend https:// if no protocol present (Vercel env vars omit protocol). */
function ensureHttps(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}
