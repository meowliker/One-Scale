import { ThumbsUp, MessageCircle, Share2, Globe } from 'lucide-react';
import type { AdCreative, CTAType } from '@/types/campaign';

interface FacebookAdFrameProps {
  creative: AdCreative;
  children: React.ReactNode;
}

function formatCTA(ctaType: CTAType): string {
  const map: Record<CTAType, string> = {
    SHOP_NOW: 'Shop Now',
    LEARN_MORE: 'Learn More',
    SIGN_UP: 'Sign Up',
    BOOK_NOW: 'Book Now',
    CONTACT_US: 'Contact Us',
    DOWNLOAD: 'Download',
    GET_OFFER: 'Get Offer',
  };
  return map[ctaType] || ctaType;
}

export function FacebookAdFrame({ creative, children }: FacebookAdFrameProps) {
  return (
    <div className="w-full overflow-hidden rounded-lg bg-white shadow-md">
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-500">
          <span className="text-sm font-bold text-white">TC</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900">Towards Calm</span>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>Sponsored</span>
            <span>·</span>
            <Globe className="h-3 w-3" />
          </div>
        </div>
      </div>

      {/* Body text */}
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-800 leading-relaxed">{creative.body}</p>
      </div>

      {/* Media */}
      <div className="w-full">{children}</div>

      {/* Headline + CTA */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{creative.headline}</p>
          <p className="text-xs text-gray-500">towardscalm.com</p>
        </div>
        <button className="ml-3 shrink-0 rounded-md bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-300">
          {formatCTA(creative.ctaType)}
        </button>
      </div>

      {/* Engagement row */}
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2">
        <div className="flex items-center gap-1">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
            <ThumbsUp className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs text-gray-500">128</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>12 comments</span>
          <span>5 shares</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex border-t border-gray-100">
        <button className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
          <ThumbsUp className="h-4 w-4" />
          Like
        </button>
        <button className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
          <MessageCircle className="h-4 w-4" />
          Comment
        </button>
        <button className="flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>
    </div>
  );
}
