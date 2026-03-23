'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, BookOpen, RefreshCw, Download } from 'lucide-react';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { CopyCard } from '@/components/creative-hub/CopyCard';
import toast from 'react-hot-toast';

interface CopyLibraryTabProps {
  storeId: string;
}

type SortOption = 'roas' | 'cpa' | 'date' | 'spend';

export function CopyLibraryTab({ storeId }: CopyLibraryTabProps) {
  const {
    copyLibrary,
    profiles,
    fetchCopyLibrary,
    fetchAllCopyLibrary,
    autoPopulateCopyLibrary,
    generateAICopy,
  } = useCreativeHubStore();
  const [productFilter, setProductFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('roas');
  const [generating, setGenerating] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch copy library on mount and when product filter changes
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (productFilter !== 'all') {
          await fetchCopyLibrary(productFilter);
        } else {
          await fetchAllCopyLibrary(storeId);
        }
      } finally {
        setLoading(false);
      }
    };
    if (profiles.length > 0) {
      load();
    }
  }, [productFilter, profiles, storeId, fetchCopyLibrary, fetchAllCopyLibrary]);

  const handleGenerateAI = async () => {
    const targetProfile =
      productFilter !== 'all'
        ? profiles.find((p) => p.id === productFilter)
        : profiles[0];
    if (!targetProfile) return;
    setGenerating(true);
    try {
      await generateAICopy(
        targetProfile.id,
        targetProfile.productName,
        'Generate high-performing ad copy variations',
      );
      toast.success('AI copy generated!');
    } catch {
      toast.error('Failed to generate AI copy');
    } finally {
      setGenerating(false);
    }
  };

  const handleAutoPopulate = async () => {
    const targetProfiles =
      productFilter !== 'all'
        ? profiles.filter((p) => p.id === productFilter)
        : profiles;
    if (targetProfiles.length === 0) return;

    setPopulating(true);
    let totalSaved = 0;
    let totalSkipped = 0;
    let totalAds = 0;
    try {
      for (const profile of targetProfiles) {
        try {
          const result = await autoPopulateCopyLibrary(storeId, profile.id);
          totalSaved += result.saved;
          totalSkipped += result.skipped;
          totalAds += result.totalAdsFound;
        } catch (err) {
          console.error(`[CopyLibrary] Auto-populate failed for ${profile.productName}:`, err);
        }
      }

      if (totalSaved > 0) {
        toast.success(`Saved ${totalSaved} winning copies from ${totalAds} ads`);
        // Refresh the library
        if (productFilter !== 'all') {
          await fetchCopyLibrary(productFilter);
        } else {
          await fetchAllCopyLibrary(storeId);
        }
      } else if (totalSkipped > 0) {
        toast.success(`All ${totalSkipped} top copies already in library`);
      } else if (totalAds === 0) {
        toast('No ads with copy data found. Run auto-discover first.', { icon: 'ℹ️' });
      } else {
        toast('No new copies to add', { icon: 'ℹ️' });
      }
    } catch {
      toast.error('Failed to auto-populate copy library');
    } finally {
      setPopulating(false);
    }
  };

  const sorted = useMemo(() => {
    const result =
      productFilter !== 'all'
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
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">Copy Library</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoPopulate}
            disabled={populating || profiles.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {populating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {populating ? 'Populating...' : 'Auto-Populate from Ads'}
          </button>
          <button
            onClick={handleGenerateAI}
            disabled={generating || profiles.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            {generating ? 'Generating...' : 'Generate AI Copy'}
          </button>
        </div>
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

        {loading && (
          <RefreshCw className="h-4 w-4 animate-spin text-text-dimmed" />
        )}
      </div>

      {/* Grid */}
      {sorted.length === 0 && !loading ? (
        <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-text-dimmed" />
          <p className="mt-4 text-sm text-text-secondary">
            No winning copies saved yet. Click &quot;Auto-Populate from Ads&quot; to
            import top-performing ad copy, or complete creative tests to build your
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
