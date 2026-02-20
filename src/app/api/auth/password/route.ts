import { NextRequest, NextResponse } from 'next/server';
import { changeUserPassword } from '@/app/api/lib/auth-users';
import { readSessionFromRequest } from '@/lib/auth/request-session';

export async function POST(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session.authenticated || session.legacy || !session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const currentPassword = body.currentPassword || '';
  const newPassword = body.newPassword || '';
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Current password and new password are required.' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
  }

  try {
    changeUserPassword({
      userId: session.userId,
      currentPassword,
      newPassword,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to change password';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
