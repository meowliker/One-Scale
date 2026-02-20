'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, RefreshCcw, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

type Role = 'owner' | 'admin' | 'member' | 'viewer';

interface TeamUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
}

interface TeamUsersResponse {
  users: TeamUser[];
}

interface TeamCreateResponse {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: Role;
  };
  temporaryPassword: string | null;
  temporaryPasswordNote: string | null;
}

const roleOptions: Array<{ value: Role; label: string }> = [
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Admin' },
];

export function TeamUsersManager() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [customPasswordEnabled, setCustomPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/users');
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to load users');
      }
      setUsers((body as TeamUsersResponse).users || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setTempPassword(null);
    try {
      const payload: {
        email: string;
        fullName?: string;
        role: Role;
        password?: string;
      } = {
        email: email.trim().toLowerCase(),
        role,
      };
      if (fullName.trim()) payload.fullName = fullName.trim();
      if (customPasswordEnabled && password.trim()) payload.password = password.trim();

      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to create user');
      }

      const created = body as TeamCreateResponse;
      if (created.temporaryPassword) {
        setTempPassword(created.temporaryPassword);
        toast.success('User created with temporary password.');
      } else {
        toast.success('User added to workspace.');
      }
      setEmail('');
      setFullName('');
      setPassword('');
      setCustomPasswordEnabled(false);
      await fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create user';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onCopyTempPassword = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      toast.success('Temporary password copied.');
    } catch {
      toast.error('Failed to copy temporary password.');
    }
  };

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    if (customPasswordEnabled && password.trim().length < 8) return false;
    return true;
  }, [email, customPasswordEnabled, password]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-base font-semibold text-gray-900">Add Team Member</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create a user profile and share individual login credentials. Data remains workspace scoped.
        </p>

        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
            required
          />
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name (optional)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500"
          >
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={customPasswordEnabled}
              onChange={(e) => setCustomPasswordEnabled(e.target.checked)}
              className="accent-blue-600"
            />
            Set custom password now
          </label>
          {customPasswordEnabled && (
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min 8 chars)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 md:col-span-2"
              minLength={8}
              required
            />
          )}

          <div className="md:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {submitting ? 'Creating...' : 'Create User'}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </form>

        {tempPassword && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Temporary Password</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <code className="rounded bg-white px-2 py-1 text-sm text-amber-900">{tempPassword}</code>
              <button
                type="button"
                onClick={() => void onCopyTempPassword()}
                className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-800">
              Share this once. User should change password after first sign-in.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Workspace Users</h3>
          <button
            type="button"
            onClick={() => void fetchUsers()}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">No users in this workspace yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-2 py-2 text-gray-900">{user.fullName || '—'}</td>
                    <td className="px-2 py-2 text-gray-700">{user.email}</td>
                    <td className="px-2 py-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-700">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className={user.isActive ? 'text-emerald-600' : 'text-gray-500'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
