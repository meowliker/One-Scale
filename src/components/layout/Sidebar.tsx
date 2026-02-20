'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sidebarConfig } from '@/data/navigation';
import { SidebarNavItem } from './SidebarNavItem';
import { SidebarSection } from './SidebarSection';
import { StoreSwitcher } from './StoreSwitcher';
import { UserProfile } from './UserProfile';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-surface transition-all duration-200',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Brand */}
      <div className={cn(
        'flex items-center gap-3 border-b border-border px-4 py-4',
        isCollapsed && 'justify-center px-2'
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#0c1738] shadow-lg shadow-primary-glow">
          <Image src="/onescale-logo.svg" alt="OneScale" width={24} height={24} />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">
              {sidebarConfig.brand.name}
            </p>
            <p className="truncate text-xs text-text-muted">
              {sidebarConfig.brand.domain}
            </p>
          </div>
        )}
      </div>

      {/* Store switcher */}
      <div className={cn(
        'border-b border-border px-2 py-2',
        isCollapsed && 'px-1'
      )}>
        <StoreSwitcher isCollapsed={isCollapsed} />
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {/* Top items */}
        <div className="space-y-1">
          {sidebarConfig.topItems.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              isCollapsed={isCollapsed}
              isActive={pathname === item.href}
            />
          ))}
        </div>

        {/* Sections */}
        {sidebarConfig.sections.map((section) => (
          <div key={section.title}>
            <SidebarSection title={section.title} isCollapsed={isCollapsed} />
            <div className="space-y-1">
              {section.items.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  item={item}
                  isCollapsed={isCollapsed}
                  isActive={pathname === item.href}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border">
        <div className="px-2 py-2 space-y-1">
          {sidebarConfig.bottomItems.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              isCollapsed={isCollapsed}
              isActive={pathname === item.href}
            />
          ))}
        </div>

        <div className="border-t border-border">
          <UserProfile isCollapsed={isCollapsed} />
        </div>

        {/* Theme Toggle */}
        <div className={cn(
          'border-t border-border px-3 py-2 flex items-center',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}>
          {!isCollapsed && (
            <span className="text-xs text-text-muted">Theme</span>
          )}
          <ThemeToggle />
        </div>

        {/* Collapse toggle */}
        <div className="border-t border-border px-2 py-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors',
              isCollapsed && 'justify-center px-2'
            )}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
