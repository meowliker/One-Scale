'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { prefetchRouteData } from '@/lib/prefetch';
import { useStoreStore } from '@/stores/storeStore';
import type { NavItem } from '@/types/navigation';

interface SidebarNavItemProps {
  item: NavItem;
  isCollapsed: boolean;
  isActive: boolean;
}

export function SidebarNavItem({ item, isCollapsed, isActive }: SidebarNavItemProps) {
  const Icon = item.icon;
  const router = useRouter();
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  // Prefetch both Next.js route chunks AND React Query data on hover
  const handleMouseEnter = useCallback(() => {
    router.prefetch(item.href);
    prefetchRouteData(item.href, activeStoreId);
  }, [router, item.href, activeStoreId]);

  return (
    <Link
      href={item.href}
      prefetch={true}
      onMouseEnter={handleMouseEnter}
      className={cn(
        'relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors duration-150',
        isActive
          ? 'text-primary'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        isCollapsed && 'justify-center px-2'
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-md bg-primary/10"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <Icon className={cn('relative z-[1] h-[18px] w-[18px] shrink-0', isActive ? 'text-primary' : 'text-text-muted')} />
      {!isCollapsed && <span className="relative z-[1] truncate">{item.label}</span>}
    </Link>
  );
}
