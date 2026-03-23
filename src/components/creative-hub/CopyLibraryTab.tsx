'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, BookOpen } from 'lucide-react';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { CopyCard } from '@/components/creative-hub/CopyCard';
import type { WinningCopy } from '@/types/creativeHub';

interface CopyLibraryTabProps {
  storeId: string;
}

type SortOption = 'roas' | 'cpa' | 'date' | 'spend';

export function CopyLibraryTab({ storeId }: CopyLibraryTabProps) {
  const { copyLibrary, profiles, fetchCopyLibrary, generateAICopy } =
    useCreativeHubStore();
  const [productFilter, setProductFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('roas');
  const [generating, setGenerating] = useState(false);

  // Fetch copy library when product filter changes
  useEffect(() => {
    if (productFilter !== 'all') {
      fetchCopyLibrary(productFilter);
    } else if (profiles.length > 0) {
      // Fetch for the first profile as default
      fetchCopyLibrary(profiles[0].id);
    }
  }, [productFilter, profiles, fetchCopyLibrary]);

  const handleGenerateAI = async () => {
    const targetProfileId =
      productFilter !== 'all' ? productFilter : profiles[0]?.id;
    if (!targetProfileId) return;
    setGenerating(true);
    try {
      await generateAICopy(targetProfileId, 'Generate high-performing ad copy');
    } finally {
      setGenerating(false);
    }
  };

  const sorted = useMemo(() => {
    const result = productFilter !== 'all'
      ? copyLibrary.filter((c) => c.productProfileId === productFilter)
      : [...copyLibrary];

    switch (sortBy) {
      case 'roas':
        result.sort((a, b) => b.roas - a.roas);
        break;
      case 'cpa':
        result.sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
        break;
      case 'date':
        result.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case 'spend':
        result.sort((a, b) => b.totalSpend - a.totalSpend);
        break;
    }

    return result;
  }, [copyLibrary, productFilter, sortBy]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Copy Library</h2>
        <button
          onClick={handleGenerateAI}
          disabled={generating || profiles.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          {generating ? 'Generating...' : 'Generate AI Copy'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="all">All Products</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.productName}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="roas">Sort by ROAS</option>
          <option value="cpa">Sort by CPA</option>
          <option value="date">Sort by Date</option>
          <option value="spend">Sort by Spend</option>
        </select>
      </div>

      {/* Grid */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-text-dimmed" />
          <p className="mt-4 text-sm text-text-secondary">
            No winning copies saved yet. Complete some creative tests to build your
            library.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sorted.map((copy) => (
            <CopyCard key={copy.id} copy={copy} />
          ))}
        </div>
      )}
    </div>
  );
}
