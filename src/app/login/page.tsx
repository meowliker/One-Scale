'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFirstSetup, setIsFirstSetup] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data?.error === 'string' ? data.error : 'Unable to verify account setup.');
        }
        setIsFirstSetup(!!data.isFirstSetup);
      })
      .catch(() => {
        setError('Unable to verify account setup. Please check the auth database connection and try again.');
        setIsFirstSetup(false);
      });
  }, []);

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
        body: JSON.stringify({ email, fullName: isFirstSetup ? fullName : undefined, password, accessCode, remember }),
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

  const inputClass =
    'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dimmed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-md">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">OneScale</h1>
        <p className="mt-1 text-sm text-text-muted">
          {isFirstSetup === null
            ? 'Loading...'
            : isFirstSetup
              ? 'Create your admin account to get started.'
              : 'Sign in with your credentials.'}
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={inputClass}
            required
          />
          {isFirstSetup && (
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className={inputClass}
            />
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={inputClass}
            required
          />
          <input
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder={isFirstSetup ? 'Setup code' : 'Invite / access code (if required)'}
            className={inputClass}
          />
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Keep me signed in
          </label>
          {error && (
            <p className="rounded-xl border border-red-300/35 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || isFirstSetup === null}
            className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-colors"
          >
            {loading
              ? 'Signing in...'
              : isFirstSetup
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>
        {isFirstSetup === false && (
          <p className="mt-4 text-center text-sm text-text-muted">
            {"Don't have an account? "}
            <Link href="/login/signup" className="text-primary hover:underline">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-md">
          <p className="text-sm text-text-muted">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
