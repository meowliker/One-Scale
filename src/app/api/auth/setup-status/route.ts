import { NextResponse } from 'next/server';
import { countUsers } from '@/app/api/lib/auth-users';

export async function GET() {
  try {
    const userCount = await countUsers();
    const signupCode = (process.env.APP_SIGNUP_CODE || '').trim();
    return NextResponse.json({
      isFirstSetup: userCount === 0,
      signupCodeRequired: signupCode.length > 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check account setup status.';
    console.error('[auth/setup-status] Failed to check setup status:', message);
    return NextResponse.json(
      {
        isFirstSetup: false,
        signupCodeRequired: false,
        error: 'Unable to verify existing accounts. Please check the auth database connection and try again.',
      },
      { status: 503 }
    );
  }
}
