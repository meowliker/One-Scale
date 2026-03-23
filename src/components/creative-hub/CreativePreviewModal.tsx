'use client';

import {
  Image as ImageIcon,
  Video,
  LayoutGrid,
  ExternalLink,
  Hash,
  User,
  Type,
  Maximize2,
  RatioIcon,
  Link2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { UploadProgressBar } from './UploadProgressBar';
import type { InboxCreative } from '@/types/creativeHub';

interface CreativePreviewModalProps {
  creative: InboxCreative | null;
  isOpen: boolean;
  onClose: () => void;
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

const uploadStatusLabels: Record<string, { label: string; style: string }> = {
  pending: { label: 'Pending Upload', style: 'bg-gray-100 text-gray-600' },
  uploading: { label: 'Uploading...', style: 'bg-blue-50 text-blue-700' },
  ready: { label: 'Ready to Launch', style: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Upload Failed', style: 'bg-red-50 text-red-700' },
};

export function CreativePreviewModal({
  creative,
  isOpen,
  onClose,
}: CreativePreviewModalProps) {
  if (!creative) return null;

  const FormatIcon = formatIcons[creative.creativeFormat] || ImageIcon;
  const statusInfo = uploadStatusLabels[creative.uploadStatus];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Creative Preview" size="lg">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left: Preview */}
        <div className="flex items-center justify-center rounded-xl bg-gray-100 overflow-hidden min-h-[280px]">
          {creative.creativeFormat === 'video' && creative.driveUrl ? (
            <video
              src={creative.driveUrl}
              controls
              className="max-h-[400px] w-full object-contain"
              poster={creative.thumbnailUrl || undefined}
            />
          ) : creative.thumbnailUrl ? (
            <img
              src={creative.thumbnailUrl}
              alt={creative.creativeName}
              className="max-h-[400px] w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <FormatIcon className="h-16 w-16" />
              <span className="text-sm">No preview available</span>
            </div>
          )}
        </div>

        {/* Right: Metadata */}
        <div className="space-y-4">
          {/* Name and format */}
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              {creative.creativeName}
            </h3>
            <span
              className={cn(
                'mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
                formatBadgeStyles[creative.creativeFormat]
              )}
            >
              <FormatIcon className="h-3 w-3" />
              {creative.creativeFormat.charAt(0).toUpperCase() +
                creative.creativeFormat.slice(1)}
            </span>
          </div>

          {/* Metadata list */}
          <div className="space-y-3">
            {creative.hook && (
              <MetadataRow icon={Type} label="Hook" value={creative.hook} />
            )}
            {creative.angle && (
              <MetadataRow icon={Hash} label="Angle" value={creative.angle} />
            )}
            {creative.creator && (
              <MetadataRow icon={User} label="Creator" value={creative.creator} />
            )}
            {creative.driveUrl && (
              <MetadataRow
                icon={Link2}
                label="Drive Link"
                value={
                  <a
                    href={creative.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </a>
                }
              />
            )}
            <MetadataRow
              icon={Hash}
              label="ClickUp ID"
              value={creative.clickupTaskId}
            />
          </div>

          {/* Upload Status */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">
                Upload Status
              </span>
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
                  statusInfo.style
                )}
              >
                {statusInfo.label}
              </span>
            </div>
            {(creative.uploadStatus === 'uploading' ||
              creative.uploadStatus === 'ready' ||
              creative.uploadStatus === 'failed') && (
              <UploadProgressBar
                progress={creative.uploadProgress}
                status={
                  creative.uploadStatus as 'uploading' | 'ready' | 'failed'
                }
              />
            )}
            {creative.uploadError && (
              <p className="text-xs text-red-600">{creative.uploadError}</p>
            )}
          </div>

          {/* Past test result */}
          {creative.alreadyTested && creative.pastTestResult && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-xs font-medium text-amber-700 mb-1">
                Previously Tested
              </p>
              <div className="flex items-center gap-3 text-xs text-amber-800">
                <span>
                  ROAS:{' '}
                  <span className="font-semibold">
                    {creative.pastTestResult.roas.toFixed(2)}x
                  </span>
                </span>
                <span className="capitalize">
                  {creative.pastTestResult.status}
                </span>
                <span className="text-amber-600">
                  {creative.pastTestResult.testDate}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function MetadataRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Type;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-dimmed" />
      <div className="min-w-0">
        <span className="text-xs text-text-dimmed">{label}</span>
        <p className="text-sm text-text-primary break-words">{value}</p>
      </div>
    </div>
  );
}
