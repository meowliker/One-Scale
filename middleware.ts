import { NextRequest, NextResponse } from 'next/server';
import {
  isDashboardAuthEnabled,
  ONE_SCALE_SESSION_COOKIE,
  verifySignedSessionToken,
  getDashboardSessionToken,
} from '@/lib/auth/session';

const PUBLIC_API_PREFIXES = [
  '/api/auth/meta',
  '/api/auth/shopify',
  '/api/auth/status',
  '/api/auth/session',
  '/api/shopify/webhooks',
  '/api/tracking/pixel',
  '/api/tracking/collect',
];

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  if (!isDashboardAuthEnabled()) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (pathname === '/login') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/') && isPublicApiPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ONE_SCALE_SESSION_COOKIE)?.value || '';
  if (token) {
    const claims = await verifySignedSessionToken(token);
    if (claims) {
      return NextResponse.next();
    }
  }

  // Backward-compatible legacy cookie validation.
  const expectedToken = getDashboardSessionToken();
  if (token && expectedToken && token === expectedToken) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
