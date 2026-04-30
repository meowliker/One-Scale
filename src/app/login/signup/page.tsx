'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupCodeRequired, setSignupCodeRequired] = useState(false);

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then((res) => res.json())
      .then((data) => setSignupCodeRequired(!!data.signupCodeRequired))
      .catch(() => {});
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          fullName: fullName || undefined,
          workspaceName: workspaceName || undefined,
          signupCode: signupCode || undefined,
          remember,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(typeof payload?.error === 'string' ? payload.error : 'Registration failed.');
        return;
      }
      // Redirect to credentials page so they can set up their Meta/Shopify app
      router.replace('/dashboard/settings/credentials');
      router.refresh();
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-dimmed outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-md">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Create an account</h1>
        <p className="mt-1 text-sm text-text-muted">
          Set up your own workspace with separate credentials.
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
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            className={inputClass}
            required
            minLength={8}
          />
          <input
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Workspace name (optional)"
            className={inputClass}
          />
          {signupCodeRequired && (
            <input
              type="text"
              value={signupCode}
              onChange={(e) => setSignupCode(e.target.value)}
              placeholder="Signup code"
              className={inputClass}
              required
            />
          )}
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
            <p className="rounded-xl border border-red-300/35 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60 transition-colors"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-md">
            <p className="text-sm text-text-muted">Loading...</p>
          </div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
