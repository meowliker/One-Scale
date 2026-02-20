import { NextRequest } from 'next/server';
import {
  getDashboardSessionToken,
  isLegacyPasswordLoginAllowed,
  ONE_SCALE_SESSION_COOKIE,
  verifySignedSessionToken,
} from '@/lib/auth/session';

export async function readSessionFromRequest(request: NextRequest): Promise<{
  authenticated: boolean;
  legacy: boolean;
  userId?: string;
  email?: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
  workspaceId?: string;
}> {
  const token = request.cookies.get(ONE_SCALE_SESSION_COOKIE)?.value || '';
  if (!token) return { authenticated: false, legacy: false };

  const claims = await verifySignedSessionToken(token);
  if (claims) {
    return {
      authenticated: true,
      legacy: false,
      userId: claims.userId,
      email: claims.email,
      role: claims.role,
      workspaceId: claims.workspaceId,
    };
  }

  const expected = getDashboardSessionToken();
  if (isLegacyPasswordLoginAllowed() && expected && token === expected) {
    return { authenticated: true, legacy: true };
  }

  return { authenticated: false, legacy: false };
}
