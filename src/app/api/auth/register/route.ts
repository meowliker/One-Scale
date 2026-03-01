import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  createSignedSessionToken,
  isDashboardAuthEnabled,
  ONE_SCALE_SESSION_COOKIE,
} from '@/lib/auth/session';
import { registerUser } from '@/app/api/lib/auth-users';

function getSignupCode(): string {
  return (process.env.APP_SIGNUP_CODE || '').trim();
}

export async function POST(request: NextRequest) {
  try {
    if (!isDashboardAuthEnabled()) {
      return NextResponse.json({ error: 'Auth is not enabled.' }, { status: 503 });
    }

    let body: {
      email?: string;
      password?: string;
      fullName?: string;
      workspaceName?: string;
      signupCode?: string;
      remember?: boolean;
    } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const signupCode = typeof body.signupCode === 'string' ? body.signupCode.trim() : '';
    const remember = !!body.remember;

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    // If APP_SIGNUP_CODE is set, require it
    const expectedCode = getSignupCode();
    if (expectedCode) {
      const codeBuffer = Buffer.from(signupCode, 'utf8');
      const expectedBuffer = Buffer.from(expectedCode, 'utf8');
      if (codeBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(codeBuffer, expectedBuffer)) {
        return NextResponse.json({ error: 'Invalid signup code.' }, { status: 401 });
      }
    }

    const user = await registerUser({
      email,
      password,
      fullName: typeof body.fullName === 'string' ? body.fullName : undefined,
      workspaceName: typeof body.workspaceName === 'string' ? body.workspaceName : undefined,
    });

    const maxAge = remember ? 60 * 60 * 24 * 14 : 60 * 60 * 8;
    const expiresAt = Date.now() + maxAge * 1000;

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
