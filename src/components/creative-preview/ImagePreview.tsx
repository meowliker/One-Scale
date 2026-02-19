import { Image } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  alt: string;
}

export function ImagePreview({ src, alt }: ImagePreviewProps) {
  // Since mock data uses placeholder paths, show a styled placeholder
  return (
    <div className="relative w-full overflow-hidden rounded-lg">
      <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/70 shadow-sm">
            <Image className="h-7 w-7 text-indigo-400" />
          </div>
          <span className="text-sm font-medium text-indigo-400">Image Preview</span>
          {alt && (
            <span className="max-w-[200px] truncate text-xs text-indigo-300">{alt}</span>
          )}
        </div>
      </div>
    </div>
  );
}
