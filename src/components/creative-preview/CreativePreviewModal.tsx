'use client';

import type { Ad } from '@/types/campaign';
import { Modal } from '@/components/ui/Modal';
import { VideoPlayer } from './VideoPlayer';
import { ImagePreview } from './ImagePreview';
import { FacebookAdFrame } from './FacebookAdFrame';
import { PreviewMetricsPanel } from './PreviewMetricsPanel';

interface CreativePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  ad: Ad | null;
}

export function CreativePreviewModal({ isOpen, onClose, ad }: CreativePreviewModalProps) {
  if (!ad) return null;

  const { creative, metrics } = ad;

  const renderMedia = () => {
    switch (creative.type) {
      case 'video':
        return <VideoPlayer src={creative.mediaUrl} poster={creative.thumbnailUrl} />;
      case 'image':
      case 'carousel':
      default:
        return <ImagePreview src={creative.mediaUrl} alt={creative.headline} />;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={ad.name} size="lg">
      <div className="flex gap-6 max-h-[70vh]">
        {/* Left column - Creative preview (60%) */}
        <div className="w-[60%] shrink-0 overflow-y-auto">
          <FacebookAdFrame creative={creative}>
            {renderMedia()}
          </FacebookAdFrame>
        </div>

        {/* Right column - Metrics panel (40%) */}
        <div className="flex-1 overflow-y-auto">
          <PreviewMetricsPanel metrics={metrics} />
        </div>
      </div>
    </Modal>
  );
}
