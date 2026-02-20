'use client';

import { FormEvent, Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nextPath = useMemo(() => {
    const candidate = searchParams.get('next') || '/dashboard/meta-audit';
    if (!candidate.startsWith('/')) return '/dashboard/meta-audit';
    return candidate;
  }, [searchParams]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, password, remember }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(typeof payload?.error === 'string' ? payload.error : 'Login failed.');
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0f1f] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#101833]/90 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold">OneScale</h1>
        <p className="mt-1 text-sm text-slate-300">Sign in with your profile credentials.</p>
        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-300/60"
            required
          />
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name (first admin setup only)"
            className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-300/60"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-300/60"
            required
          />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-cyan-400"
            />
            Keep me signed in
          </label>
          {error && (
            <p className="rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0f1f] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#101833]/90 p-6 shadow-2xl">
          <p className="text-sm text-slate-300">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
