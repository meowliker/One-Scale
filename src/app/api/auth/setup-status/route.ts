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
  } catch {
    // If Supabase is unreachable, assume first setup so the form stays functional
    return NextResponse.json({ isFirstSetup: true, signupCodeRequired: false });
  }
}
