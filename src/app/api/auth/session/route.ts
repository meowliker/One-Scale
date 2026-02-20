import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  createSignedSessionToken,
  getBootstrapAccessCode,
  getLoginAccessCode,
  getDashboardPassword,
  getDashboardSessionToken,
  isDashboardAuthEnabled,
  isLegacyPasswordLoginAllowed,
  ONE_SCALE_SESSION_COOKIE,
  verifySignedSessionToken,
} from '@/lib/auth/session';
import {
  authenticateUser,
  countUsers,
  createInitialAdmin,
  getUserContextById,
} from '@/app/api/lib/auth-users';

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

  let body: { email?: string; fullName?: string; password?: string; accessCode?: string; remember?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const accessCode = typeof body.accessCode === 'string' ? body.accessCode.trim() : '';
  const remember = !!body.remember;
  const maxAge = remember ? 60 * 60 * 24 * 14 : 60 * 60 * 8;
  const expiresAt = Date.now() + maxAge * 1000;
  const userCount = await countUsers();

  let user: Awaited<ReturnType<typeof authenticateUser>> = null;
  const loginAccessCode = getLoginAccessCode();

  if (userCount > 0 && loginAccessCode && !safeEqualText(accessCode, loginAccessCode)) {
    return NextResponse.json(
      { error: 'Invalid invite/access code.' },
      { status: 401 }
    );
  }

  // Preferred flow: per-user email/password auth.
  if (email) {
    if (userCount === 0) {
      const bootstrapCode = getBootstrapAccessCode();
      if (!bootstrapCode) {
        return NextResponse.json(
          { error: 'First admin setup is locked. Configure APP_BOOTSTRAP_CODE to initialize owner access.' },
          { status: 403 }
        );
      }
      if (!safeEqualText(accessCode, bootstrapCode)) {
        return NextResponse.json(
          { error: 'Invalid access code for first admin setup.' },
          { status: 401 }
        );
      }
      if (!password || password.length < 8) {
        return NextResponse.json(
          { error: 'Set a password with at least 8 characters for the first admin account.' },
          { status: 400 }
        );
      }
      user = await createInitialAdmin({
        email,
        password,
        fullName: typeof body.fullName === 'string' ? body.fullName : undefined,
        workspaceName: 'Primary Workspace',
      });
    } else {
      user = await authenticateUser(email, password);
    }
  }

  // Optional fallback for legacy shared-password mode.
  if (!user) {
    if (!isLegacyPasswordLoginAllowed()) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const expectedPassword = getDashboardPassword();
    if (!safeEqualText(password, expectedPassword)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    // Legacy mode does not have a user identity; keep previous behavior.
    const response = NextResponse.json({ success: true, legacy: true });
    response.cookies.set(ONE_SCALE_SESSION_COOKIE, getDashboardSessionToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge,
    });
    return response;
  }

  const token = await createSignedSessionToken({
    userId: user.userId,
    email: user.email,
    role: user.role,
    workspaceId: user.workspaceId,
    expiresAt,
  });

  const response = NextResponse.json({
    success: true,
    user: {
      id: user.userId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      workspaceId: user.workspaceId,
      mustResetPassword: user.mustResetPassword,
    },
  });
  response.cookies.set(ONE_SCALE_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(ONE_SCALE_SESSION_COOKIE)?.value || '';
  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const claims = await verifySignedSessionToken(token);
  if (!claims) {
    // Legacy session token support
    const expectedToken = getDashboardSessionToken();
    if (isLegacyPasswordLoginAllowed() && expectedToken && token === expectedToken) {
      return NextResponse.json({ authenticated: true, legacy: true });
    }
    return NextResponse.json({ authenticated: false });
  }

  const user = await getUserContextById(claims.userId);
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.userId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      workspaceId: user.workspaceId,
      mustResetPassword: user.mustResetPassword,
    },
  });
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
