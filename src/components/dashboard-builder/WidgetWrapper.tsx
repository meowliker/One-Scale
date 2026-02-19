'use client';

import { useState } from 'react';
import { GripVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WidgetConfig } from '@/types/dashboard';

export interface WidgetWrapperProps {
  widget: WidgetConfig;
  isEditMode: boolean;
  children: React.ReactNode;
  onRemove: () => void;
}

export function WidgetWrapper({ widget, isEditMode, children, onRemove }: WidgetWrapperProps) {
  const [title, setTitle] = useState(widget.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  return (
    <div
      className={cn(
        'rounded-lg bg-white shadow-sm',
        isEditMode
          ? 'border-2 border-dashed border-blue-300 ring-1 ring-blue-100'
          : 'border border-gray-200'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          {isEditMode && (
            <GripVertical className="h-4 w-4 cursor-grab text-gray-400 hover:text-gray-600" />
          )}
          {isEditMode && isEditingTitle ? (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
              }}
              className="rounded border border-gray-300 px-2 py-0.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          ) : (
            <h3
              className={cn(
                'text-sm font-medium text-gray-900',
                isEditMode && 'cursor-text hover:text-blue-600'
              )}
              onClick={() => {
                if (isEditMode) setIsEditingTitle(true);
              }}
            >
              {title}
            </h3>
          )}
        </div>
        {isEditMode && (
          <button
            onClick={onRemove}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4">{children}</div>
    </div>
  );
}
