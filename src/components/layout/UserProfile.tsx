import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserProfileProps {
  isCollapsed: boolean;
}

export function UserProfile({ isCollapsed }: UserProfileProps) {
  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3',
      isCollapsed && 'justify-center px-2'
    )}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-sm font-medium text-white">
        G
      </div>
      {!isCollapsed && (
        <>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">Gaurav</p>
            <p className="truncate text-xs text-text-muted">gauravpataila@gmail.com</p>
          </div>
          <button className="text-text-muted hover:text-text-secondary">
            <LogOut className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
