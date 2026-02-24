'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { RefreshButton } from '@/components/ui/RefreshButton';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:justify-end md:px-8">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="flex items-center justify-center rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors md:hidden min-h-[44px] min-w-[44px]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <RefreshButton />
        </header>
        <main className="flex-1 overflow-auto bg-background p-3 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
