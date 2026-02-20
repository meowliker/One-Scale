'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserProfileProps {
  isCollapsed: boolean;
}

export function UserProfile({ isCollapsed }: UserProfileProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<{ fullName: string | null; email: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!res.ok) return;
        const body = await res.json().catch(() => ({}));
        const user = body?.user;
        if (!mounted || !user?.email) return;
        setProfile({
          fullName: typeof user.fullName === 'string' ? user.fullName : null,
          email: String(user.email),
        });
      } catch {
        // Keep sidebar usable even if session fetch fails.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const displayName = useMemo(() => {
    if (profile?.fullName?.trim()) return profile.fullName.trim();
    if (profile?.email) return profile.email.split('@')[0] || 'User';
    return 'User';
  }, [profile]);

  const displayEmail = profile?.email || 'user@onescale.app';
  const avatarLetter = (displayName[0] || 'U').toUpperCase();

  const onLogout = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } finally {
      router.replace('/login');
      router.refresh();
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3',
      isCollapsed && 'justify-center px-2'
    )}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-sm font-medium text-white">
        {avatarLetter}
      </div>
      {!isCollapsed && (
        <>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{displayName}</p>
            <p className="truncate text-xs text-text-muted">{displayEmail}</p>
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            disabled={loading}
            className="text-text-muted hover:text-text-secondary disabled:opacity-60"
            aria-label="Log out"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          </button>
        </>
      )}
      {isCollapsed && (
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={loading}
          className="text-text-muted hover:text-text-secondary disabled:opacity-60"
          aria-label="Log out"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
