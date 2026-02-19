import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getDashboardPassword,
  getDashboardSessionToken,
  isDashboardAuthEnabled,
  ONE_SCALE_SESSION_COOKIE,
} from '@/lib/auth/session';

function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!isDashboardAuthEnabled()) {
    return NextResponse.json({ error: 'Dashboard password is not configured.' }, { status: 503 });
  }

  let body: { password?: string; remember?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  const expectedPassword = getDashboardPassword();
  if (!safeEqualText(password, expectedPassword)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  const maxAge = body.remember ? 60 * 60 * 24 * 14 : 60 * 60 * 8;
  response.cookies.set(ONE_SCALE_SESSION_COOKIE, getDashboardSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(ONE_SCALE_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
