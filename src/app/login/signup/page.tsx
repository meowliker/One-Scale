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
    'w-full rounded-lg border border-black/[0.1] bg-[#f5f5f7] px-3 py-2.5 text-sm text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-colors';

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-[#1d1d1f]">Create an account</h1>
        <p className="mt-1 text-sm text-[#86868b]">
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
            <p className="rounded-lg border border-[#ff3b30]/20 bg-[#ff3b30]/8 px-3 py-2 text-sm text-[#ff3b30]">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#0071e3] px-3 py-2.5 text-sm font-medium text-white hover:bg-[#0077ED] disabled:opacity-60 transition-colors"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-[#86868b]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#0071e3] hover:underline">
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
        <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-black/[0.06] bg-white p-8 shadow-sm">
            <p className="text-sm text-[#86868b]">Loading...</p>
          </div>
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
