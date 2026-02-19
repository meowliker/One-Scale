import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types/navigation';

interface SidebarNavItemProps {
  item: NavItem;
  isCollapsed: boolean;
  isActive: boolean;
}

export function SidebarNavItem({ item, isCollapsed, isActive }: SidebarNavItemProps) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-primary/10 text-primary-light border-l-2 border-primary shadow-sm shadow-primary-glow'
          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary border-l-2 border-transparent',
        isCollapsed && 'justify-center px-2'
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary-light')} />
      {!isCollapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}
