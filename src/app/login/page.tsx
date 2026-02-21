'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
      .then((res) => res.json())
      .then((data) => setIsFirstSetup(!!data.isFirstSetup))
      .catch(() => setIsFirstSetup(true));
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

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1d1d1f]">OneScale</h1>
        <p className="mt-1 text-sm text-[#86868b]">
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
            className="w-full rounded-lg border border-black/[0.1] bg-[#f5f5f7] px-3 py-2.5 text-sm text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-colors"
            required
          />
          {isFirstSetup && (
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-black/[0.1] bg-[#f5f5f7] px-3 py-2.5 text-sm text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-colors"
            />
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-black/[0.1] bg-[#f5f5f7] px-3 py-2.5 text-sm text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-colors"
            required
          />
          <input
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder={isFirstSetup ? 'Setup code' : 'Invite / access code (if required)'}
            className="w-full rounded-lg border border-black/[0.1] bg-[#f5f5f7] px-3 py-2.5 text-sm text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-colors"
          />
          <label className="flex items-center gap-2 text-sm text-[#86868b]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-[#0071e3]"
            />
            Keep me signed in
          </label>
          {error && (
            <p className="rounded-lg border border-[#ff3b30]/20 bg-[#ff3b30]/8 px-3 py-2 text-sm text-[#ff3b30]">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || isFirstSetup === null}
            className="w-full rounded-lg bg-[#0071e3] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#0077ED] disabled:opacity-60 transition-colors"
          >
            {loading
              ? 'Signing in...'
              : isFirstSetup
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-8 shadow-sm">
          <p className="text-sm text-[#86868b]">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
