'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';

interface CopyGeneratorFormProps {
  onGenerate: (params: {
    product: string;
    tone: string;
    framework: string;
    count: number;
  }) => void;
  isLoading: boolean;
}

const tones = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'emotional', label: 'Emotional' },
  { value: 'humorous', label: 'Humorous' },
];

const frameworks = [
  {
    value: 'AIDA',
    label: 'AIDA',
    tooltip: 'Attention, Interest, Desire, Action - grabs attention then builds to a CTA',
  },
  {
    value: 'FOMO',
    label: 'FOMO',
    tooltip: 'Fear of Missing Out - creates urgency with scarcity and social proof',
  },
  {
    value: 'PAS',
    label: 'PAS',
    tooltip: 'Problem, Agitate, Solution - identifies a pain point and presents your product as the fix',
  },
  {
    value: 'BAB',
    label: 'BAB',
    tooltip: 'Before, After, Bridge - paints the transformation your product enables',
  },
  {
    value: 'FAB',
    label: 'FAB',
    tooltip: 'Features, Advantages, Benefits - leads with product specs and ties to outcomes',
  },
];

const variationCounts = [3, 5, 8];

export function CopyGeneratorForm({ onGenerate, isLoading }: CopyGeneratorFormProps) {
  const [product, setProduct] = useState('');
  const [tone, setTone] = useState('professional');
  const [framework, setFramework] = useState('AIDA');
  const [count, setCount] = useState(5);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product.trim()) return;
    onGenerate({ product: product.trim(), tone, framework, count });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product / Topic */}
      <div>
        <label htmlFor="product" className="block text-sm font-medium text-gray-700 mb-1.5">
          Product or Topic
        </label>
        <input
          id="product"
          type="text"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          placeholder="e.g., Vitamin C Serum for anti-aging skincare"
          className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
        />
      </div>

      {/* Tone Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tone</label>
        <div className="flex flex-wrap gap-2">
          {tones.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTone(t.value)}
              className={cn(
                'rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
                tone === t.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Framework Selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Copywriting Framework
        </label>
        <div className="flex flex-wrap gap-2">
          {frameworks.map((f) => (
            <Tooltip key={f.value} content={f.tooltip} position="bottom">
              <button
                type="button"
                onClick={() => setFramework(f.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
                  framework === f.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {f.label}
                <Info className={cn(
                  'h-3.5 w-3.5',
                  framework === f.value ? 'text-blue-200' : 'text-gray-400'
                )} />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Variation Count */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Number of Variations
        </label>
        <div className="flex gap-2">
          {variationCounts.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-all min-w-[48px]',
                count === n
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <button
        type="submit"
        disabled={isLoading || !product.trim()}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all',
          isLoading || !product.trim()
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-md hover:shadow-lg hover:from-blue-700 hover:to-purple-700'
        )}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate Copy
          </>
        )}
      </button>
    </form>
  );
}
