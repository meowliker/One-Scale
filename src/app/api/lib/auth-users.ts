import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { getDb } from '@/app/api/lib/db';
import type { AppSessionRole } from '@/lib/auth/session';

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: number;
  must_reset_password: number;
  created_at: string;
}

interface AppWorkspaceMember {
  workspace_id: string;
  role: AppSessionRole;
}

export interface AuthenticatedUserContext {
  userId: string;
  email: string;
  fullName: string | null;
  role: AppSessionRole;
  workspaceId: string;
  mustResetPassword: boolean;
}

let authSchemaReady = false;

function ensureAuthSchema(): void {
  if (authSchemaReady) return;
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_reset_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner', 'admin', 'member', 'viewer')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS workspace_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(workspace_id, store_id),
      UNIQUE(store_id)
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_members_user
      ON workspace_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_stores_workspace
      ON workspace_stores(workspace_id);
  `);
  const userColumns = db.pragma('table_info(app_users)') as Array<{ name: string }>;
  if (!userColumns.some((col) => col.name === 'must_reset_password')) {
    db.exec('ALTER TABLE app_users ADD COLUMN must_reset_password INTEGER NOT NULL DEFAULT 0');
  }
  authSchemaReady = true;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

function getMembership(userId: string): AppWorkspaceMember | null {
  ensureAuthSchema();
  const db = getDb();
  return (
    db.prepare(
      `SELECT workspace_id, role
       FROM workspace_members
       WHERE user_id = ?
       ORDER BY CASE role
         WHEN 'owner' THEN 0
         WHEN 'admin' THEN 1
         WHEN 'member' THEN 2
         ELSE 3
       END, created_at ASC
       LIMIT 1`
    ).get(userId) as AppWorkspaceMember | undefined
  ) || null;
}

function getUserByEmail(email: string): (AppUser & { password_hash: string }) | null {
  ensureAuthSchema();
  const db = getDb();
  return (
    db.prepare('SELECT * FROM app_users WHERE email = ? LIMIT 1')
      .get(normalizeEmail(email)) as (AppUser & { password_hash: string }) | undefined
  ) || null;
}

function ensureWorkspaceExists(workspaceId: string, name = 'Workspace'): void {
  ensureAuthSchema();
  if (!workspaceId) return;
  const db = getDb();
  const existing = db.prepare('SELECT id FROM workspaces WHERE id = ? LIMIT 1').get(workspaceId) as
    | { id: string }
    | undefined;
  if (existing) return;
  db.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)').run(workspaceId, name);
}

export function countUsers(): number {
  ensureAuthSchema();
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM app_users').get() as { count: number } | undefined;
  return row?.count || 0;
}

export function createInitialAdmin(input: {
  email: string;
  password: string;
  fullName?: string;
  workspaceName?: string;
}): AuthenticatedUserContext {
  ensureAuthSchema();
  const db = getDb();
  const email = normalizeEmail(input.email);
  const existing = getUserByEmail(email);
  if (existing) {
    throw new Error('User already exists for this email.');
  }

  const userId = randomUUID();
  const workspaceId = randomUUID();
  const workspaceName = (input.workspaceName || 'Default Workspace').trim();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO app_users (id, email, password_hash, full_name, is_active, must_reset_password)
      VALUES (?, ?, ?, ?, 1, 0)
    `).run(userId, email, hashPassword(input.password), input.fullName?.trim() || null);

    db.prepare(`
      INSERT INTO workspaces (id, name)
      VALUES (?, ?)
    `).run(workspaceId, workspaceName || 'Default Workspace');

    db.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (?, ?, 'owner')
    `).run(workspaceId, userId);
  });
  tx();

  return {
    userId,
    email,
    fullName: input.fullName?.trim() || null,
    role: 'owner',
    workspaceId,
    mustResetPassword: false,
  };
}

export function authenticateUser(email: string, password: string): AuthenticatedUserContext | null {
  ensureAuthSchema();
  const user = getUserByEmail(email);
  if (!user || !user.is_active) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  const membership = getMembership(user.id);
  if (!membership) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    role: membership.role,
    workspaceId: membership.workspace_id,
    mustResetPassword: !!user.must_reset_password,
  };
}

export function getUserContextById(userId: string): AuthenticatedUserContext | null {
  ensureAuthSchema();
  const db = getDb();
  const user = db.prepare(`
    SELECT id, email, full_name, is_active, must_reset_password
    FROM app_users
    WHERE id = ?
    LIMIT 1
  `).get(userId) as {
    id: string;
    email: string;
    full_name: string | null;
    is_active: number;
    must_reset_password: number;
  } | undefined;
  if (!user || !user.is_active) return null;
  const membership = getMembership(user.id);
  if (!membership) return null;
  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    role: membership.role,
    workspaceId: membership.workspace_id,
    mustResetPassword: !!user.must_reset_password,
  };
}

export function listWorkspaceUsers(workspaceId: string): Array<{
  id: string;
  email: string;
  fullName: string | null;
  role: AppSessionRole;
  isActive: boolean;
}> {
  ensureAuthSchema();
  ensureWorkspaceExists(workspaceId);
  const db = getDb();
  const rows = db.prepare(`
    SELECT u.id, u.email, u.full_name, u.is_active, m.role
    FROM workspace_members m
    JOIN app_users u ON u.id = m.user_id
    WHERE m.workspace_id = ?
    ORDER BY
      CASE m.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'member' THEN 2
        ELSE 3
      END,
      u.email ASC
  `).all(workspaceId) as Array<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: number;
    role: AppSessionRole;
  }>;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: !!row.is_active,
  }));
}

export function createWorkspaceUser(input: {
  workspaceId: string;
  email: string;
  password?: string;
  fullName?: string;
  role?: AppSessionRole;
}): { id: string; email: string; fullName: string | null; role: AppSessionRole; temporaryPassword: string | null } {
  ensureAuthSchema();
  ensureWorkspaceExists(input.workspaceId);
  const db = getDb();
  const email = normalizeEmail(input.email);
  const role = input.role || 'member';
  const existing = getUserByEmail(email);

  if (existing) {
    const membership = db.prepare(
      'SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ? LIMIT 1'
    ).get(input.workspaceId, existing.id) as { 1: number } | undefined;
    if (membership) {
      throw new Error('User is already in this workspace.');
    }
    try {
      db.prepare(`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (?, ?, ?)
      `).run(input.workspaceId, existing.id, role);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add user to workspace.';
      if (message.toLowerCase().includes('foreign key')) {
        throw new Error('Workspace context is missing. Refresh and retry.');
      }
      throw error;
    }
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
  const insertTransaction = db.transaction(() => {
    db.prepare(`
      INSERT INTO app_users (id, email, password_hash, full_name, is_active, must_reset_password)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(userId, email, hashPassword(password), input.fullName?.trim() || null, generatedTemporary ? 1 : 0);
    db.prepare(`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (?, ?, ?)
    `).run(input.workspaceId, userId, role);
  });

  try {
    insertTransaction();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user.';
    if (message.toLowerCase().includes('foreign key')) {
      throw new Error('Workspace context is missing. Refresh and retry.');
    }
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

export function changeUserPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): void {
  ensureAuthSchema();
  const db = getDb();
  const user = db.prepare(
    'SELECT id, password_hash FROM app_users WHERE id = ? LIMIT 1'
  ).get(input.userId) as { id: string; password_hash: string } | undefined;
  if (!user) throw new Error('User not found.');
  if (!verifyPassword(input.currentPassword, user.password_hash)) {
    throw new Error('Current password is incorrect.');
  }
  db.prepare(
    'UPDATE app_users SET password_hash = ?, must_reset_password = 0 WHERE id = ?'
  ).run(hashPassword(input.newPassword), input.userId);
}

export function linkStoreToWorkspace(workspaceId: string, storeId: string): void {
  ensureAuthSchema();
  ensureWorkspaceExists(workspaceId);
  const db = getDb();
  db.prepare(`
    INSERT INTO workspace_stores (workspace_id, store_id)
    VALUES (?, ?)
    ON CONFLICT(workspace_id, store_id) DO NOTHING
  `).run(workspaceId, storeId);
}

export function listStoreIdsForWorkspace(workspaceId: string): string[] {
  ensureAuthSchema();
  const db = getDb();
  const rows = db.prepare(`
    SELECT store_id
    FROM workspace_stores
    WHERE workspace_id = ?
  `).all(workspaceId) as Array<{ store_id: string }>;
  return rows.map((row) => row.store_id);
}

export function canWorkspaceAccessStore(workspaceId: string, storeId: string): boolean {
  ensureAuthSchema();
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM workspace_stores WHERE workspace_id = ? AND store_id = ? LIMIT 1'
  ).get(workspaceId, storeId) as { 1: number } | undefined;
  return !!row;
}
