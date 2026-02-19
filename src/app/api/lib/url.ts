import { NextRequest } from 'next/server';

/**
 * Derive the external-facing app URL from a Next.js request.
 *
 * When behind a reverse proxy / tunnel (ngrok, Cloudflare, Vercel, etc.)
 * the request.url will show the internal origin (e.g. http://localhost:3000).
 * We check X-Forwarded-Host / X-Forwarded-Proto headers first, which proxies
 * set to indicate the original external URL the client used.
 *
 * Priority:
 *   1. X-Forwarded-Host + X-Forwarded-Proto headers (proxy/tunnel)
 *   2. Host header (direct access, some proxies)
 *   3. request.url as fallback (local dev)
 */
export function getAppUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');

  if (forwardedHost) {
    const proto = forwardedProto || 'https';
    return `${proto}://${forwardedHost}`;
  }

  // Some proxies only set the Host header
  const host = request.headers.get('host');
  if (host && !host.startsWith('localhost')) {
    // If accessed via non-localhost host header, assume https for safety
    const proto = forwardedProto || 'https';
    return `${proto}://${host}`;
  }

  // Fallback: use request.url (works for direct local access)
  const requestUrl = new URL(request.url);
  return `${requestUrl.protocol}//${requestUrl.host}`;
}
