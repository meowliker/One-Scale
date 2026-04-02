'use client';

import {
  Image as ImageIcon,
  Video,
  LayoutGrid,
  Eye,
  CheckCircle,
  Link2Off,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxCreative } from '@/types/creativeHub';

interface InboxCreativeRowProps {
  creative: InboxCreative;
  isSelected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
}

const formatIcons: Record<string, typeof ImageIcon> = {
  video: Video,
  image: ImageIcon,
  carousel: LayoutGrid,
};

const formatBadgeStyles: Record<string, string> = {
  video: 'bg-red-50 text-red-700',
  image: 'bg-blue-50 text-blue-700',
  carousel: 'bg-purple-50 text-purple-700',
};

/**
 * Inbox status is derived from whether the creative has a Drive URL:
 * - driveUrl present -> "Ready" (green)
 * - driveUrl missing -> "No Link" (gray)
 * Upload to Meta happens only during launch (Step 4 of Launch Wizard).
 */
function getInboxStatus(creative: InboxCreative): {
  label: string;
  style: string;
  icon: typeof CheckCircle;
} {
  if (creative.driveUrl) {
    return {
      label: 'Ready',
      style: 'bg-emerald-50 text-emerald-700',
      icon: CheckCircle,
    };
  }
  return {
    label: 'No Link',
    style: 'bg-gray-100 text-gray-500',
    icon: Link2Off,
  };
}

export function InboxCreativeRow({
  creative,
  isSelected,
  onToggleSelect,
  onPreview,
}: InboxCreativeRowProps) {
  const FormatIcon = formatIcons[creative.creativeFormat] || ImageIcon;
  const status = getInboxStatus(creative);
  const StatusIcon = status.icon;

  return (
    <div
      className={cn(
        'group rounded-xl border px-3 py-3 transition-all',
        isSelected
          ? 'border-blue-300 bg-blue-50/30 shadow-sm shadow-blue-500/5'
          : 'border-border bg-surface-elevated hover:border-gray-300'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <label className="flex-shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        </label>

        {/* Thumbnail */}
        <div className="flex-shrink-0 h-12 w-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
          {creative.thumbnailUrl ? (
            <img
              src={creative.thumbnailUrl}
              alt={creative.creativeName}
              className="h-full w-full object-cover"
            />
          ) : (
            <FormatIcon className="h-4 w-4 text-gray-400" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">
              {creative.creativeName}
            </p>
            {/* Format badge */}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium flex-shrink-0',
                formatBadgeStyles[creative.creativeFormat]
              )}
            >
              <FormatIcon className="h-2.5 w-2.5" />
              {creative.creativeFormat.charAt(0).toUpperCase() +
                creative.creativeFormat.slice(1)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-text-secondary">
            {creative.clickupListName && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium">
                {creative.clickupListName}
              </span>
            )}
            {creative.driveParentFolderName && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium">
                Folder: {creative.driveParentFolderName}
              </span>
            )}
            {creative.creator && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium">
                Creator: {creative.creator}
              </span>
            )}
          </div>
          {creative.hook && (
            <p className="text-xs text-text-secondary truncate mt-1.5 max-w-2xl">
              {creative.hook}
            </p>
          )}
        </div>

        {/* Status badge */}
        <div className="flex-shrink-0">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
              status.style
            )}
          >
            <StatusIcon className="h-3 w-3" />
            {status.label}
          </span>
        </div>

        {/* Preview button */}
        <button
          onClick={onPreview}
          className="flex-shrink-0 rounded-lg p-1.5 text-text-dimmed opacity-0 group-hover:opacity-100 hover:bg-surface-hover hover:text-text-secondary transition-all"
          title="Preview creative"
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
