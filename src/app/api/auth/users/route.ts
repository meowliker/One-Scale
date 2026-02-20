import { NextRequest, NextResponse } from 'next/server';
import {
  createWorkspaceUser,
  listWorkspaceUsers,
} from '@/app/api/lib/auth-users';
import { readSessionFromRequest } from '@/lib/auth/request-session';

function canManageUsers(role: 'owner' | 'admin' | 'member' | 'viewer' | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session.authenticated || session.legacy || !session.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    users: await listWorkspaceUsers(session.workspaceId),
  });
}

export async function POST(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session.authenticated || session.legacy || !session.workspaceId || !canManageUsers(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { email?: string; password?: string; fullName?: string; role?: 'owner' | 'admin' | 'member' | 'viewer' } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : undefined;
  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }
  if (password && password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  try {
    const created = await createWorkspaceUser({
      workspaceId: session.workspaceId,
      email,
      password,
      fullName: body.fullName,
      role: body.role || 'member',
    });
    return NextResponse.json({
      user: {
        id: created.id,
        email: created.email,
        fullName: created.fullName,
        role: created.role,
      },
      temporaryPassword: created.temporaryPassword,
      temporaryPasswordNote: created.temporaryPassword
        ? 'Share this temporary password securely. User must change it after first sign-in.'
        : null,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create user';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
