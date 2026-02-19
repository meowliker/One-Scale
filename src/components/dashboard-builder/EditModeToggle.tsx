'use client';

import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardLayoutStore } from '@/stores/dashboardLayoutStore';

export function EditModeToggle() {
  const { isEditMode, toggleEditMode } = useDashboardLayoutStore();

  return (
    <button
      onClick={toggleEditMode}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
        isEditMode
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      )}
    >
      {isEditMode ? (
        'Done Editing'
      ) : (
        <>
          <Settings className="h-4 w-4" />
          Customize
        </>
      )}
    </button>
  );
}
