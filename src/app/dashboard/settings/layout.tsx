'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Store,
  Plug,
  Key,
  ClipboardList,
  ChevronRight,
  Settings,
  Calculator,
} from 'lucide-react';

const settingsTabs = [
  {
    label: 'Stores',
    href: '/dashboard/settings/stores',
    icon: Store,
    description: 'Manage stores & ad accounts',
  },
  {
    label: 'Integrations',
    href: '/dashboard/settings/integrations',
    icon: Plug,
    description: 'Connect Meta, Shopify & more',
  },
  {
    label: 'API Credentials',
    href: '/dashboard/settings/credentials',
    icon: Key,
    description: 'Configure OAuth app keys',
  },
  {
    label: 'P&L Settings',
    href: '/dashboard/settings/pnl',
    icon: Calculator,
    description: 'Cost of goods, shipping & fees',
  },
  {
    label: 'Post-Purchase Survey',
    href: '/dashboard/settings/survey',
    icon: ClipboardList,
    description: 'Attribution survey builder',
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Determine if we're on the root /dashboard/settings page (no sub-page)
  const isRootSettings = pathname === '/dashboard/settings';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Settings className="h-6 w-6 text-gray-400" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account, integrations, and app configuration
        </p>
      </div>

      <div className="flex gap-6">
        {/* Left sidebar nav */}
        <nav className="w-64 shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {settingsTabs.map((tab) => {
              const isActive =
                pathname === tab.href ||
                (isRootSettings && tab.href === '/dashboard/settings/stores');
              const Icon = tab.icon;

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3.5 transition-colors border-b border-gray-100 last:border-b-0',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      isActive
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'text-sm font-medium',
                        isActive ? 'text-blue-700' : 'text-gray-900'
                      )}
                    >
                      {tab.label}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {tab.description}
                    </div>
                  </div>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isActive ? 'text-blue-400' : 'text-gray-300'
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Main content area */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
