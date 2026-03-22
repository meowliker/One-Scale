'use client';

import { useState, useMemo } from 'react';
import { Check, Video, Image, Layers, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductProfile, ClickUpCreativeSet } from '@/types/creativeLaunch';

interface LaunchSelectStepProps {
  products: ProductProfile[];
  clickupCreatives: ClickUpCreativeSet[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

export function LaunchSelectStep({
  products,
  clickupCreatives,
  selectedIds,
  onSelectionChange,
}: LaunchSelectStepProps) {
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [formatFilter, setFormatFilter] = useState<Set<'video' | 'image' | 'carousel'>>(
    new Set(['video', 'image', 'carousel'])
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Group creatives by product
  const creativesByProduct = useMemo(() => {
    const grouped = new Map<string, ClickUpCreativeSet[]>();
    for (const creative of clickupCreatives) {
      const productName = creative.productName || 'Unknown Product';
      if (!grouped.has(productName)) {
        grouped.set(productName, []);
      }
      grouped.get(productName)!.push(creative);
    }
    return grouped;
  }, [clickupCreatives]);

  const toggleProduct = (productName: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productName)) next.delete(productName);
      else next.add(productName);
      return next;
    });
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const selectAllForProduct = (productName: string) => {
    const productCreatives = creativesByProduct.get(productName) || [];
    const filtered = productCreatives.filter(c => formatFilter.has(c.format));
    const ids = filtered.map(c => c.id);
    onSelectionChange(new Set([...selectedIds, ...ids]));
  };

  const clearSelectionForProduct = (productName: string) => {
    const productCreatives = creativesByProduct.get(productName) || [];
    const productIds = new Set(productCreatives.map(c => c.id));
    const next = new Set(selectedIds);
    productIds.forEach(id => next.delete(id));
    onSelectionChange(next);
  };

  const toggleFormat = (format: 'video' | 'image' | 'carousel') => {
    setFormatFilter(prev => {
      const next = new Set(prev);
      if (next.has(format)) next.delete(format);
      else next.add(format);
      return next;
    });
  };

  const formatCounts = useMemo(() => ({
    video: clickupCreatives.filter(c => c.format === 'video').length,
    image: clickupCreatives.filter(c => c.format === 'image').length,
    carousel: clickupCreatives.filter(c => c.format === 'carousel').length,
  }), [clickupCreatives]);

  const FormatIcon = ({ format }: { format: 'video' | 'image' | 'carousel' }) => {
    if (format === 'video') return <Video className="h-3.5 w-3.5" />;
    if (format === 'image') return <Image className="h-3.5 w-3.5" />;
    return <Layers className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Select Creatives to Launch</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose which creatives you want to launch to Meta Ads. Selected: {selectedIds.size}
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search creatives..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {(['video', 'image', 'carousel'] as const).map(format => (
            <button
              key={format}
              onClick={() => toggleFormat(format)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                formatFilter.has(format)
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              )}
            >
              <FormatIcon format={format} />
              {format.charAt(0).toUpperCase() + format.slice(1)} ({formatCounts[format]})
            </button>
          ))}
        </div>
      </div>

      {/* Products and Creatives */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {Array.from(creativesByProduct.entries()).map(([productName, productCreatives]) => {
          const isExpanded = expandedProducts.has(productName);
          const filteredCreatives = productCreatives.filter(
            c => formatFilter.has(c.format) &&
            (searchQuery === '' || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
          );
          const selectedCount = filteredCreatives.filter(c => selectedIds.has(c.id)).length;
          const product = products.find(p => p.name === productName);

          return (
            <div key={productName} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Product Header */}
              <button
                onClick={() => toggleProduct(productName)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-lg">
                    📦
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-slate-900">{productName}</p>
                    <p className="text-xs text-slate-500">
                      {filteredCreatives.length} creative{filteredCreatives.length !== 1 ? 's' : ''} available
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {selectedCount > 0 && (
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {selectedCount} selected
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50">
                  {/* Select All / Clear */}
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => selectAllForProduct(productName)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={() => clearSelectionForProduct(productName)}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Creatives Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {filteredCreatives.map(creative => {
                      const isSelected = selectedIds.has(creative.id);
                      return (
                        <button
                          key={creative.id}
                          onClick={() => toggleSelection(creative.id)}
                          className={cn(
                            'relative rounded-lg border-2 p-2 text-left transition-all',
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          )}
                        >
                          {/* Selection indicator */}
                          <div
                            className={cn(
                              'absolute top-2 right-2 h-5 w-5 rounded-full flex items-center justify-center transition-colors',
                              isSelected ? 'bg-blue-500' : 'bg-slate-200'
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>

                          {/* Thumbnail */}
                          <div className="aspect-square rounded-md bg-slate-100 mb-2 overflow-hidden">
                            {creative.thumbnailUrl ? (
                              <img
                                src={creative.thumbnailUrl}
                                alt={creative.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <FormatIcon format={creative.format} />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <p className="text-xs font-medium text-slate-900 truncate pr-6">
                            {creative.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                                creative.format === 'video'
                                  ? 'bg-purple-100 text-purple-700'
                                  : creative.format === 'image'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-orange-100 text-orange-700'
                              )}
                            >
                              <FormatIcon format={creative.format} />
                              {creative.format}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {filteredCreatives.length === 0 && (
                    <p className="text-center text-sm text-slate-500 py-4">
                      No creatives match your filters
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {creativesByProduct.size === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500">No creatives available to launch.</p>
            <p className="text-sm text-slate-400 mt-1">
              Add creatives in ClickUp with "Ready to Launch" status.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
