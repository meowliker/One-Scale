'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Package,
  Video,
  Image,
  Layers,
  ExternalLink,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Rocket,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';

interface Creative {
  id: string;
  taskId: string;
  name: string;
  productName: string;
  status: string;
  format: 'video' | 'image' | 'carousel';
  hook?: string;
  thumbnailUrl?: string;
  driveLink?: string;
  dateAdded: string;
  listName: string;
}

interface ProductGroup {
  productName: string;
  listName: string;
  creatives: Creative[];
}

const formatConfig = {
  video: { label: 'Video', icon: Video, className: 'bg-pink-50 text-pink-700 border-pink-200' },
  image: { label: 'Image', icon: Image, className: 'bg-purple-50 text-purple-700 border-purple-200' },
  carousel: { label: 'Carousel', icon: Layers, className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

export function ClickUpCreativesPanel() {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  async function fetchCreatives() {
    if (!activeStoreId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/creative-launch/dashboard?storeId=${encodeURIComponent(activeStoreId)}`);
      
      let data: { readyToLaunch?: Creative[]; currentlyTesting?: Array<{ id: string; creativeName: string; productName: string; testStatus: string; thumbnailUrl?: string }>; error?: string } = { readyToLaunch: [], currentlyTesting: [] };
      try {
        const text = await res.text();
        if (text) {
          data = JSON.parse(text);
        }
      } catch {
        data = { readyToLaunch: [], currentlyTesting: [] };
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch creatives');
      }

      const allCreatives = [...(data.readyToLaunch || []), ...(data.currentlyTesting || []).map((t: { id: string; creativeName: string; productName: string; testStatus: string; thumbnailUrl?: string }) => ({
        id: t.id,
        taskId: t.id,
        name: t.creativeName,
        productName: t.productName,
        status: t.testStatus,
        format: 'image' as const,
        thumbnailUrl: t.thumbnailUrl,
        dateAdded: new Date().toISOString().split('T')[0],
        listName: 'Testing',
      }))];

      setCreatives(allCreatives);

      // Auto-expand all products
      const productNames = new Set(allCreatives.map((c: Creative) => c.productName));
      setExpandedProducts(productNames);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCreatives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId]);

  // Group creatives by product
  const productGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? creatives.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.productName.toLowerCase().includes(q) ||
            c.hook?.toLowerCase().includes(q)
        )
      : creatives;

    const groups = new Map<string, ProductGroup>();

    for (const creative of filtered) {
      const key = creative.productName;
      if (!groups.has(key)) {
        groups.set(key, {
          productName: creative.productName,
          listName: creative.listName,
          creatives: [],
        });
      }
      groups.get(key)!.creatives.push(creative);
    }

    return Array.from(groups.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [creatives, search]);

  function toggleProduct(productName: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productName)) {
        next.delete(productName);
      } else {
        next.add(productName);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
        <span className="ml-2 text-sm text-gray-500">Loading creatives...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
        <p className="text-sm text-gray-500">{error}</p>
        <button
          onClick={fetchCreatives}
          className="mt-3 text-sm text-purple-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (creatives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
          <Rocket className="h-6 w-6 text-purple-500" />
        </div>
        <p className="text-sm font-medium text-gray-700">No Creatives Found</p>
        <p className="text-xs text-gray-500 mt-1 max-w-xs">
          Mark tasks as &ldquo;Ready to Launch&rdquo; in ClickUp to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search creatives by name, product, or hook..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <button
          onClick={fetchCreatives}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{productGroups.length} product{productGroups.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{creatives.length} creative{creatives.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Product Groups */}
      <div className="space-y-3">
        {productGroups.map((group) => {
          const isExpanded = expandedProducts.has(group.productName);
          const readyCount = group.creatives.filter((c) => c.status.toLowerCase().includes('ready')).length;
          const testingCount = group.creatives.filter((c) => c.status.toLowerCase().includes('test')).length;

          return (
            <div key={group.productName} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              {/* Product Header */}
              <button
                onClick={() => toggleProduct(group.productName)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  )}
                  <Package className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium text-gray-900">{group.productName}</span>
                  <span className="text-xs text-gray-400">({group.listName})</span>
                </div>
                <div className="flex items-center gap-2">
                  {readyCount > 0 && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      {readyCount} ready
                    </span>
                  )}
                  {testingCount > 0 && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      {testingCount} testing
                    </span>
                  )}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                    {group.creatives.length} total
                  </span>
                </div>
              </button>

              {/* Creatives Grid */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {group.creatives.map((creative) => {
                      const format = formatConfig[creative.format];
                      const FormatIcon = format.icon;

                      return (
                        <div
                          key={creative.id}
                          className="group rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-purple-300 transition-colors"
                        >
                          {/* Thumbnail */}
                          <div className="relative aspect-video bg-gray-100">
                            {creative.thumbnailUrl ? (
                              <img
                                src={creative.thumbnailUrl}
                                alt={creative.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FormatIcon className="h-6 w-6 text-gray-300" />
                              </div>
                            )}
                            {/* Format badge */}
                            <span className={cn(
                              'absolute top-1.5 right-1.5 rounded border px-1.5 py-0.5 text-[9px] font-medium',
                              format.className
                            )}>
                              {format.label}
                            </span>
                            {/* Status badge */}
                            <span className={cn(
                              'absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium',
                              creative.status.toLowerCase().includes('ready')
                                ? 'bg-emerald-500 text-white'
                                : creative.status.toLowerCase().includes('test')
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-500 text-white'
                            )}>
                              {creative.status}
                            </span>
                          </div>

                          {/* Content */}
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-900 truncate" title={creative.name}>
                              {creative.name}
                            </p>
                            {creative.hook && (
                              <p className="text-[10px] text-gray-500 truncate mt-0.5" title={creative.hook}>
                                {creative.hook}
                              </p>
                            )}
                            {creative.driveLink && (
                              <a
                                href={creative.driveLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[10px] text-purple-600 hover:underline mt-1"
                              >
                                View <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
