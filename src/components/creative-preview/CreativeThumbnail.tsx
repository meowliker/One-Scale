'use client';

import { Image, Video, Layers, Play } from 'lucide-react';
import type { AdCreative } from '@/types/campaign';
import { cn } from '@/lib/utils';

interface CreativeThumbnailProps {
  creative: AdCreative;
  onClick: () => void;
  size?: 'sm' | 'md';
}

const sizeMap = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
};

const iconSizeMap = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
};

const playIconSizeMap = {
  sm: 'h-2.5 w-2.5',
  md: 'h-3 w-3',
};

function getTypeIcon(type: AdCreative['type'], iconClass: string) {
  switch (type) {
    case 'video':
      return <Video className={iconClass} />;
    case 'carousel':
      return <Layers className={iconClass} />;
    case 'image':
    default:
      return <Image className={iconClass} />;
  }
}

export function CreativeThumbnail({ creative, onClick, size = 'sm' }: CreativeThumbnailProps) {
  const isVideo = creative.type === 'video';

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center justify-center overflow-hidden rounded-md transition-all duration-150',
        'cursor-pointer hover:scale-105 hover:shadow-md',
        'bg-gradient-to-br from-gray-100 to-gray-200',
        sizeMap[size]
      )}
    >
      <span className="text-gray-500 transition-colors group-hover:text-gray-700">
        {getTypeIcon(creative.type, iconSizeMap[size])}
      </span>

      {/* Video play overlay */}
      {isVideo && (
        <div className="absolute bottom-0.5 right-0.5 flex items-center justify-center rounded-full bg-black/60 p-0.5">
          <Play className={cn('text-white', playIconSizeMap[size])} />
        </div>
      )}
    </button>
  );
}
