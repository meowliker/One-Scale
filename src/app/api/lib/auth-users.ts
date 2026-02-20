import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import type { AppSessionRole } from '@/lib/auth/session';

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: number | boolean;
  must_reset_password: number | boolean;
  created_at: string;
}

interface AppWorkspaceMember {
  workspace_id: string;
  role: AppSessionRole;
  created_at?: string;
}

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  fullName: string | null;
  role: AppSessionRole;
  workspaceId: string;
  mustResetPassword: boolean;
}

const ROLE_ORDER: Record<AppSessionRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
  viewer: 3,
};

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const dbProvider = (process.env.DB_PROVIDER || 'sqlite').trim().toLowerCase();
  return { url, serviceRole, anon, dbProvider };
}

function assertSupabaseAuthEnabled(): void {
  const { url, serviceRole, dbProvider } = getSupabaseConfig();
  if (dbProvider !== 'supabase') {
    throw new Error('Auth persistence requires DB_PROVIDER=supabase.');
  }
  if (!url || !serviceRole) {
    throw new Error('Supabase auth persistence is not configured. Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const { serviceRole } = getSupabaseConfig();
  const out: Record<string, string> = {
    apikey: serviceRole,
    'Content-Type': 'application/json',
    ...extra,
  };
  // Legacy keys are JWT-like and can be used as Bearer tokens.
  if (serviceRole.split('.').length === 3) {
    out.Authorization = `Bearer ${serviceRole}`;
  }
  return out;
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  assertSupabaseAuthEnabled();
  const { url } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers: {
      ...headers(),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeBool(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function generateTemporaryPassword(length = 14): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const raw = randomBytes(length);
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += alphabet[raw[i] % alphabet.length];
  }
  return output;
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const [algorithm, salt, stored] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !stored) return false;
  const candidate = scryptSync(password, salt, 64).toString('hex');
  const left = Buffer.from(candidate, 'utf8');
  const right = Buffer.from(stored, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function encodeInList(values: string[]): string {
  return values
    .map((value) => `"${value.replace(/"/g, '""')}"`)
    .join(',');
}

async function ensureWorkspaceExists(workspaceId: string, name = 'Workspace'): Promise<void> {
  if (!workspaceId) return;
  const rows = await rest<Array<{ id: string }>>(
    `/workspaces?id=eq.${encodeURIComponent(workspaceId)}&select=id&limit=1`
  );
  if (rows[0]) return;

  await rest('/workspaces', {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ id: workspaceId, name }]),
  });
}

async function getMembership(userId: string): Promise<AppWorkspaceMember | null> {
  const rows = await rest<Array<{ workspace_id: string; role: AppSessionRole; created_at: string }>>(
    `/workspace_members?user_id=eq.${encodeURIComponent(userId)}&select=workspace_id,role,created_at`
  );
  if (!rows.length) return null;

  rows.sort((a, b) => {
    const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleDiff !== 0) return roleDiff;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  return {
    workspace_id: rows[0].workspace_id,
    role: rows[0].role,
    created_at: rows[0].created_at,
  };
}

async function getUserByEmail(email: string): Promise<(AppUser & { password_hash: string }) | null> {
  const rows = await rest<Array<AppUser & { password_hash: string }>>(
    `/app_users?email=eq.${encodeURIComponent(normalizeEmail(email))}&select=*&limit=1`
  );
  return rows[0] || null;
}

export async function countUsers(): Promise<number> {
  const rows = await rest<Array<{ id: string }>>('/app_users?select=id');
  return rows.length;
}

export async function createInitialAdmin(input: {
  email: string;
  password: string;
  fullName?: string;
  workspaceName?: string;
}): Promise<AuthenticatedUserContext> {
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error('User already exists for this email.');
  }

  const userId = randomUUID();
  const workspaceId = randomUUID();
  const workspaceName = (input.workspaceName || 'Default Workspace').trim() || 'Default Workspace';

  try {
    await rest('/app_users', {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify([{
        id: userId,
        email,
        password_hash: hashPassword(input.password),
        full_name: input.fullName?.trim() || null,
        is_active: true,
        must_reset_password: false,
      }]),
    });

    await rest('/workspaces', {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify([{ id: workspaceId, name: workspaceName }]),
    });

    await rest('/workspace_members', {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify([{ workspace_id: workspaceId, user_id: userId, role: 'owner' }]),
    });
  } catch (error) {
    // Best-effort rollback for partial failures.
    await Promise.allSettled([
      rest(`/workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' }),
      rest(`/workspaces?id=eq.${encodeURIComponent(workspaceId)}`, { method: 'DELETE' }),
      rest(`/app_users?id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    ]);
    throw error;
  }

  return {
    userId,
    email,
    fullName: input.fullName?.trim() || null,
    role: 'owner',
    workspaceId,
    mustResetPassword: false,
  };
}

export async function authenticateUser(email: string, password: string): Promise<AuthenticatedUserContext | null> {
  const user = await getUserByEmail(email);
  if (!user || !normalizeBool(user.is_active)) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  const membership = await getMembership(user.id);
  if (!membership) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    role: membership.role,
    workspaceId: membership.workspace_id,
    mustResetPassword: normalizeBool(user.must_reset_password),
  };
}

export async function getUserContextById(userId: string): Promise<AuthenticatedUserContext | null> {
  const rows = await rest<Array<{ id: string; email: string; full_name: string | null; is_active: number | boolean; must_reset_password: number | boolean }>>(
    `/app_users?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,is_active,must_reset_password&limit=1`
  );
  const user = rows[0];
  if (!user || !normalizeBool(user.is_active)) return null;
  const membership = await getMembership(user.id);
  if (!membership) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    role: membership.role,
    workspaceId: membership.workspace_id,
    mustResetPassword: normalizeBool(user.must_reset_password),
  };
}

export async function listWorkspaceUsers(workspaceId: string): Promise<Array<{
  id: string;
  email: string;
  fullName: string | null;
  role: AppSessionRole;
  isActive: boolean;
}>> {
  await ensureWorkspaceExists(workspaceId);

  const members = await rest<Array<{ user_id: string; role: AppSessionRole; created_at: string }>>(
    `/workspace_members?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=user_id,role,created_at`
  );

  if (!members.length) return [];

  const userIds = [...new Set(members.map((m) => m.user_id))];
  const users = await rest<Array<{ id: string; email: string; full_name: string | null; is_active: number | boolean }>>(
    `/app_users?id=in.(${encodeURIComponent(encodeInList(userIds))})&select=id,email,full_name,is_active`
  );
  const userMap = new Map(users.map((user) => [user.id, user]));

  const rows = members
    .map((member) => {
      const user = userMap.get(member.user_id);
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: member.role,
        isActive: normalizeBool(user.is_active),
        createdAt: member.created_at,
      };
    })
    .filter((row): row is { id: string; email: string; fullName: string | null; role: AppSessionRole; isActive: boolean; createdAt: string } => !!row);

  rows.sort((a, b) => {
    const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (roleDiff !== 0) return roleDiff;
    return a.email.localeCompare(b.email);
  });

  return rows.map(({ id, email, fullName, role, isActive }) => ({ id, email, fullName, role, isActive }));
}

export async function createWorkspaceUser(input: {
  workspaceId: string;
  email: string;
  password?: string;
  fullName?: string;
  role?: AppSessionRole;
}): Promise<{ id: string; email: string; fullName: string | null; role: AppSessionRole; temporaryPassword: string | null }> {
  await ensureWorkspaceExists(input.workspaceId);

  const email = normalizeEmail(input.email);
  const role = input.role || 'member';
  const existing = await getUserByEmail(email);

  if (existing) {
    const membership = await rest<Array<{ workspace_id: string; user_id: string }>>(
      `/workspace_members?workspace_id=eq.${encodeURIComponent(input.workspaceId)}&user_id=eq.${encodeURIComponent(existing.id)}&select=workspace_id,user_id&limit=1`
    );
    if (membership[0]) {
      throw new Error('User is already in this workspace.');
    }

    await rest('/workspace_members', {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify([{ workspace_id: input.workspaceId, user_id: existing.id, role }]),
    });

    return {
      id: existing.id,
      email: existing.email,
      fullName: existing.full_name,
      role,
      temporaryPassword: null,
    };
  }

  const generatedTemporary = !input.password;
  const password = input.password || generateTemporaryPassword();
  const userId = randomUUID();

  await rest('/app_users', {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify([{
      id: userId,
      email,
      password_hash: hashPassword(password),
      full_name: input.fullName?.trim() || null,
      is_active: true,
      must_reset_password: generatedTemporary,
    }]),
  });

  try {
    await rest('/workspace_members', {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify([{ workspace_id: input.workspaceId, user_id: userId, role }]),
    });
  } catch (error) {
    await Promise.allSettled([
      rest(`/app_users?id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    ]);
    throw error;
  }

  return {
    id: userId,
    email,
    fullName: input.fullName?.trim() || null,
    role,
    temporaryPassword: generatedTemporary ? password : null,
  };
}

export async function changeUserPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const rows = await rest<Array<{ id: string; password_hash: string }>>(
    `/app_users?id=eq.${encodeURIComponent(input.userId)}&select=id,password_hash&limit=1`
  );
  const user = rows[0];
  if (!user) throw new Error('User not found.');
  if (!verifyPassword(input.currentPassword, user.password_hash)) {
    throw new Error('Current password is incorrect.');
  }

  await rest(`/app_users?id=eq.${encodeURIComponent(input.userId)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      password_hash: hashPassword(input.newPassword),
      must_reset_password: false,
    }),
  });
}

export async function linkStoreToWorkspace(workspaceId: string, storeId: string): Promise<void> {
  await ensureWorkspaceExists(workspaceId);
  await rest('/workspace_stores', {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ workspace_id: workspaceId, store_id: storeId }]),
  });
}

export async function listStoreIdsForWorkspace(workspaceId: string): Promise<string[]> {
  const rows = await rest<Array<{ store_id: string }>>(
    `/workspace_stores?workspace_id=eq.${encodeURIComponent(workspaceId)}&select=store_id`
  );
  return rows.map((row) => row.store_id);
}

export async function canWorkspaceAccessStore(workspaceId: string, storeId: string): Promise<boolean> {
  const rows = await rest<Array<{ store_id: string }>>(
    `/workspace_stores?workspace_id=eq.${encodeURIComponent(workspaceId)}&store_id=eq.${encodeURIComponent(storeId)}&select=store_id&limit=1`
  );
  return !!rows[0];
}
