'use client';

import {
  Image as ImageIcon,
  Video,
  LayoutGrid,
  Eye,
  CheckCircle,
  AlertCircle,
  RotateCw,
  Upload,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UploadProgressBar } from './UploadProgressBar';
import type { InboxCreative } from '@/types/creativeHub';

interface InboxCreativeRowProps {
  creative: InboxCreative;
  isSelected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onRetry?: () => void;
  onSkip?: () => void;
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

const statusBadge: Record<
  string,
  { label: string; style: string; icon?: typeof CheckCircle }
> = {
  pending: { label: 'Pending', style: 'bg-gray-100 text-gray-600' },
  uploading: { label: 'Uploading', style: 'bg-blue-50 text-blue-700' },
  ready: {
    label: 'Ready',
    style: 'bg-emerald-50 text-emerald-700',
    icon: CheckCircle,
  },
  failed: {
    label: 'Failed',
    style: 'bg-red-50 text-red-700',
    icon: AlertCircle,
  },
};

const pastTestStatusColors: Record<string, string> = {
  winner: 'text-emerald-700',
  killed: 'text-red-700',
  inconclusive: 'text-amber-700',
};

export function InboxCreativeRow({
  creative,
  isSelected,
  onToggleSelect,
  onPreview,
  onRetry,
  onSkip,
}: InboxCreativeRowProps) {
  const FormatIcon = formatIcons[creative.creativeFormat] || ImageIcon;
  const status = statusBadge[creative.uploadStatus];
  const StatusIcon = status.icon;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        isSelected
          ? 'border-blue-300 bg-blue-50/30'
          : 'border-border bg-surface-elevated hover:border-gray-300'
      )}
    >
      <div className="flex items-center gap-4">
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
            <FormatIcon className="h-5 w-5 text-gray-400" />
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
          {creative.hook && (
            <p className="text-sm text-text-secondary truncate mt-0.5">
              {creative.hook}
            </p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            {(creative.angle || creative.creator) && (
              <p className="text-xs text-text-dimmed truncate">
                {[creative.angle, creative.creator].filter(Boolean).join(' / ')}
              </p>
            )}
            <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-text-dimmed">
              {creative.clickupTaskId}
            </span>
          </div>

          {/* Already tested badge + past result */}
          {creative.alreadyTested && (
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                Already Tested
              </span>
              {creative.pastTestResult && (
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    pastTestStatusColors[creative.pastTestResult.status]
                  )}
                >
                  {creative.pastTestResult.roas.toFixed(2)}x ROAS &middot;{' '}
                  <span className="capitalize">
                    {creative.pastTestResult.status}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Upload progress for uploading state */}
          {creative.uploadStatus === 'uploading' && (
            <div className="mt-1.5 max-w-[200px]">
              <UploadProgressBar
                progress={creative.uploadProgress}
                status="uploading"
                showLabel
              />
            </div>
          )}

          {/* Upload error + action buttons */}
          {creative.uploadStatus === 'failed' && creative.uploadError && (
            <div className="mt-1.5 space-y-1">
              <p className="text-xs text-red-600">{creative.uploadError}</p>
              <div className="flex items-center gap-1.5">
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    <RotateCw className="h-2.5 w-2.5" />
                    Retry
                  </button>
                )}
                <button
                  onClick={onPreview}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  <Upload className="h-2.5 w-2.5" />
                  Upload Manually
                </button>
                {onSkip && (
                  <button
                    onClick={onSkip}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-text-dimmed hover:bg-surface-hover transition-colors"
                  >
                    <SkipForward className="h-2.5 w-2.5" />
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div className="flex-shrink-0">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
              status.style
            )}
          >
            {StatusIcon && <StatusIcon className="h-3 w-3" />}
            {status.label}
          </span>
        </div>

        {/* Preview button */}
        <button
          onClick={onPreview}
          className="flex-shrink-0 rounded-lg p-2 text-text-dimmed hover:bg-surface-hover hover:text-text-secondary transition-colors"
          title="Preview creative"
        >
          <Eye className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
