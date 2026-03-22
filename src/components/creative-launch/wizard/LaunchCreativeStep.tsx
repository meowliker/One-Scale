'use client';

import { useState, useMemo } from 'react';
import { RefreshCw, Image, Video, Sparkles, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductProfile, ClickUpCreativeSet } from '@/types/creativeLaunch';

interface CreativeConfig {
  primaryText: string;
  headline: string;
  description: string;
  ctaType: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
}

interface WinnerCopy {
  id: string;
  primaryText: string;
  headline: string;
  cta: string;
  roas: number;
  spend: number;
}

interface LaunchCreativeStepProps {
  config: CreativeConfig;
  onConfigChange: (config: CreativeConfig) => void;
  selectedCreatives: ClickUpCreativeSet[];
  products: ProductProfile[];
  winnerCopy?: WinnerCopy[];
}

const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'BUY_NOW', label: 'Buy Now' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'ORDER_NOW', label: 'Order Now' },
  { value: 'BOOK_NOW', label: 'Book Now' },
  { value: 'CONTACT_US', label: 'Contact Us' },
];

const AI_COPY_SUGGESTIONS = [
  'Lead with the main benefit, back it up with proof, and end with a clean next step',
  'Use concise, high-clarity messaging that improves click quality and conversion intent',
  'Position the value first, reduce friction, and guide readers to take action quickly',
  'Make the offer easier to understand so more qualified people click with intent',
  'Get clearer results with a direct message, stronger benefit, and one action-focused CTA',
];

const AI_HEADLINE_SUGGESTIONS = [
  'Trusted by People Like You',
  'Transform Your Results Today',
  'The Smart Choice for You',
  'See the Difference Now',
  'Your Success Starts Here',
];

export function LaunchCreativeStep({
  config,
  onConfigChange,
  selectedCreatives,
  products,
  winnerCopy: winnerCopyProp,
}: LaunchCreativeStepProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Get winner copy from props or products
  const winnerCopy = useMemo(() => {
    // Prefer winner copy from API (passed as prop)
    if (winnerCopyProp && winnerCopyProp.length > 0) {
      return winnerCopyProp;
    }
    // Fallback to products' winner copy library
    for (const product of products) {
      if (product.winnerCopyLibrary && product.winnerCopyLibrary.length > 0) {
        return product.winnerCopyLibrary;
      }
    }
    return [];
  }, [winnerCopyProp, products]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    // Simulate AI regeneration
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRegenerating(false);
  };

  const applyAiSuggestion = (text: string, field: 'primaryText' | 'headline') => {
    onConfigChange({ ...config, [field]: text });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Design Your Ad Creative</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use last 30-day winners to autopopulate copy, then refine with AI.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Copy */}
        <div className="space-y-6">
          {/* Winner Copy Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-700">
                Our Copy (Merged from 30d Winners)
              </h3>
              <span className="text-xs text-slate-400">Deduped + merged metrics</span>
            </div>
            
            {winnerCopy.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {winnerCopy.slice(0, 5).map((copy, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onConfigChange({
                      ...config,
                      primaryText: copy.primaryText || '',
                      headline: copy.headline || '',
                    })}
                    className="w-full text-left rounded-lg border border-slate-100 bg-slate-50 p-3 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                  >
                    <p className="text-sm text-slate-700 line-clamp-2">{copy.primaryText}</p>
                    {copy.headline && (
                      <p className="text-xs text-slate-500 mt-1 font-medium">{copy.headline}</p>
                    )}
                    {copy.roas && (
                      <span className="inline-block mt-1 text-xs text-green-600 font-medium">
                        {copy.roas.toFixed(2)}x ROAS
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400">
                <p className="text-sm">No merged winner copy found yet for the last 30 days.</p>
              </div>
            )}
          </div>

          {/* AI Copy Lab */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                AI Copy Lab
              </h3>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
              >
                <RefreshCw className={cn('h-3 w-3', isRegenerating && 'animate-spin')} />
                Regenerate 5
              </button>
            </div>

            {/* Primary Text Suggestions */}
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-500 mb-2">PRIMARY TEXT</p>
              <div className="space-y-2">
                {AI_COPY_SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyAiSuggestion(suggestion, 'primaryText')}
                    className="w-full text-left rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-purple-200 hover:bg-purple-50 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {/* Headline Suggestions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500">HEADLINE</p>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate 5
                </button>
              </div>
              <div className="space-y-2">
                {AI_HEADLINE_SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyAiSuggestion(suggestion, 'headline')}
                    className="w-full text-left rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-purple-200 hover:bg-purple-50 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Preview & Inputs */}
        <div className="space-y-6">
          {/* Creative Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Creative Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onConfigChange({ ...config, mediaType: 'image' })}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  config.mediaType === 'image'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                )}
              >
                <Image className="h-4 w-4" />
                Image
              </button>
              <button
                type="button"
                onClick={() => onConfigChange({ ...config, mediaType: 'video' })}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  config.mediaType === 'video'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                )}
              >
                <Video className="h-4 w-4" />
                Video
              </button>
            </div>
          </div>

          {/* Primary Text Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">Primary Text</label>
              <button
                type="button"
                onClick={() => handleCopy(config.primaryText, 'primaryText')}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                {copiedField === 'primaryText' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedField === 'primaryText' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              value={config.primaryText}
              onChange={(e) => onConfigChange({ ...config, primaryText: e.target.value })}
              placeholder="Enter your primary text..."
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Headline Input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Headline</label>
            <input
              type="text"
              value={config.headline}
              onChange={(e) => onConfigChange({ ...config, headline: e.target.value })}
              placeholder="Enter headline..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* CTA */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Call to Action</label>
            <select
              value={config.ctaType}
              onChange={(e) => onConfigChange({ ...config, ctaType: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {CTA_OPTIONS.map(cta => (
                <option key={cta.value} value={cta.value}>{cta.label}</option>
              ))}
            </select>
          </div>

          {/* Ad Preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-3">Ad Preview</h3>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              {/* Preview Header */}
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                  Ad
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Your Brand</p>
                  <p className="text-xs text-slate-400">Sponsored</p>
                </div>
              </div>

              {/* Preview Text */}
              <p className="text-sm text-slate-700 mb-3 line-clamp-3">
                {config.primaryText || 'Your primary text will appear here...'}
              </p>

              {/* Preview Media */}
              <div className="aspect-square rounded-lg bg-slate-100 mb-3 flex items-center justify-center">
                {selectedCreatives[0]?.thumbnailUrl ? (
                  <img
                    src={selectedCreatives[0].thumbnailUrl}
                    alt="Preview"
                    className="h-full w-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="text-slate-400 text-center">
                    {config.mediaType === 'video' ? (
                      <Video className="h-12 w-12 mx-auto mb-2" />
                    ) : (
                      <Image className="h-12 w-12 mx-auto mb-2" />
                    )}
                    <p className="text-xs">Media preview</p>
                  </div>
                )}
              </div>

              {/* Preview Headline & CTA */}
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">
                  {config.headline || 'Your headline'}
                </p>
                <span className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white">
                  {CTA_OPTIONS.find(c => c.value === config.ctaType)?.label || 'Shop Now'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
