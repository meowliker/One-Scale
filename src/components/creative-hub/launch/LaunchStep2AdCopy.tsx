'use client';

import { useState, useEffect } from 'react';
import {
  Plus,
  X,
  Sparkles,
  Trophy,
  Link2,
  Info,
  Type,
  AlignLeft,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type { CopyItem, WinningCopy } from '@/types/creativeHub';

const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'BUY_NOW', label: 'Buy Now' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'ORDER_NOW', label: 'Order Now' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'CONTACT_US', label: 'Contact Us' },
];

function generateId() {
  return `copy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function LaunchStep2AdCopy() {
  const { launchConfig, updateLaunchConfig, copyLibrary, fetchCopyLibrary, generateAICopy, inboxCreatives, selectedCreativeIds, profiles } =
    useCreativeHubStore();

  // Fetch the copy library for the selected product when this step mounts
  const productProfileId = launchConfig.productProfileId;
  useEffect(() => {
    if (productProfileId) {
      fetchCopyLibrary(productProfileId);
    }
  }, [productProfileId, fetchCopyLibrary]);

  const primaryTexts = launchConfig.primaryTexts || [];
  const headlines = launchConfig.headlines || [];
  const descriptions = launchConfig.descriptions || [];
  const ctaType = launchConfig.ctaType || 'SHOP_NOW';
  const advantageCreative = launchConfig.advantageCreative ?? true;
  const usePerCreativeUrls = launchConfig.usePerCreativeUrls ?? false;
  const perCreativeUrls = launchConfig.perCreativeUrls || {};

  const selectedCreatives = inboxCreatives.filter((c) => selectedCreativeIds.has(c.id));

  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiCopyResults, setAiCopyResults] = useState<
    { type: 'primary' | 'headline' | 'description'; text: string }[]
  >([]);
  const [showUrlOverrides, setShowUrlOverrides] = useState(usePerCreativeUrls);

  // ── Copy list helpers ──

  const addPrimaryText = (item: CopyItem) => {
    if (primaryTexts.length >= 5) return;
    updateLaunchConfig({ primaryTexts: [...primaryTexts, item] });
  };

  const removePrimaryText = (id: string) => {
    updateLaunchConfig({ primaryTexts: primaryTexts.filter((t) => t.id !== id) });
  };

  const addHeadline = (item: CopyItem) => {
    if (headlines.length >= 5) return;
    updateLaunchConfig({ headlines: [...headlines, item] });
  };

  const removeHeadline = (id: string) => {
    updateLaunchConfig({ headlines: headlines.filter((h) => h.id !== id) });
  };

  const addDescription = (item: CopyItem) => {
    if (descriptions.length >= 5) return;
    updateLaunchConfig({ descriptions: [...descriptions, item] });
  };

  const removeDescription = (id: string) => {
    updateLaunchConfig({ descriptions: descriptions.filter((d) => d.id !== id) });
  };

  // ── AI generation ──
  const handleGenerateAICopy = async () => {
    if (!productProfileId) return;
    setAiGenerating(true);
    try {
      // Build context from the current ad copy state for better AI suggestions
      const context = [
        primaryTexts.length > 0 ? `Existing primary texts: ${primaryTexts.map((t) => t.text).join(' | ')}` : '',
        headlines.length > 0 ? `Existing headlines: ${headlines.map((h) => h.text).join(' | ')}` : '',
      ].filter(Boolean).join('. ');

      // Get product name from the selected profile for better AI context
      const latestProfiles = useCreativeHubStore.getState().profiles;
      const selectedProfile = latestProfiles.find((p) => p.id === productProfileId);
      const productName = selectedProfile?.productName || 'Product';
      await generateAICopy(productProfileId, productName, context || 'Generate fresh ad copy suggestions');

      // After the store updates copyLibrary, populate AI results from the newly added entries
      // The store prepends new AI copies to copyLibrary, so we read from there
      const { copyLibrary: updatedLibrary } = useCreativeHubStore.getState();
      const aiCopies = updatedLibrary.filter((c) => c.isAiGenerated).slice(0, 6);

      const results: { type: 'primary' | 'headline' | 'description'; text: string }[] = [];
      for (const copy of aiCopies) {
        if (copy.primaryText) results.push({ type: 'primary', text: copy.primaryText });
        if (copy.headline) results.push({ type: 'headline', text: copy.headline });
        if (copy.description) results.push({ type: 'description', text: copy.description });
      }

      if (results.length > 0) {
        setAiCopyResults(results);
      } else {
        // Fallback: if the API didn't return structured results, show a message via the empty state
        setAiCopyResults([]);
      }
    } catch {
      // Silent fail - user sees no new results
    } finally {
      setAiGenerating(false);
    }
  };

  const totalCombinations = Math.max(primaryTexts.length, 1) * Math.max(headlines.length, 1) * Math.max(descriptions.length, 1);

  return (
    <div className="space-y-8">
      {/* Two-column layout: Winners + AI Generator */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Winner Copy Library */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-900">Winner Copy Library</h3>
          </div>

          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {copyLibrary.length > 0 ? (
              copyLibrary.map((copy) => (
                <WinnerCopyCard
                  key={copy.id}
                  copy={copy}
                  onAddPrimaryText={() =>
                    addPrimaryText({
                      id: generateId(),
                      text: copy.primaryText,
                      source: 'winner',
                      sourceRoas: copy.roas,
                      sourceCopyId: copy.id,
                    })
                  }
                  onAddHeadline={
                    copy.headline
                      ? () =>
                          addHeadline({
                            id: generateId(),
                            text: copy.headline!,
                            source: 'winner',
                            sourceRoas: copy.roas,
                            sourceCopyId: copy.id,
                          })
                      : undefined
                  }
                  ptDisabled={primaryTexts.length >= 5}
                  hlDisabled={headlines.length >= 5}
                />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <Trophy className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm text-slate-500">No winning copy found.</p>
                <p className="text-xs text-slate-400">
                  Run creative tests to build your copy library.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Copy Generator */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900">AI Copy Generator</h3>
          </div>

          <button
            onClick={handleGenerateAICopy}
            disabled={aiGenerating}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100',
              aiGenerating && 'cursor-not-allowed opacity-60'
            )}
          >
            <Sparkles className="h-4 w-4" />
            {aiGenerating ? 'Generating...' : 'Generate AI Copy Suggestions'}
          </button>

          <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
            {aiCopyResults.map((result, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <span
                  className={cn(
                    'mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase',
                    result.type === 'primary' && 'bg-blue-100 text-blue-700',
                    result.type === 'headline' && 'bg-amber-100 text-amber-700',
                    result.type === 'description' && 'bg-emerald-100 text-emerald-700'
                  )}
                >
                  {result.type === 'primary' ? 'PT' : result.type === 'headline' ? 'HL' : 'DESC'}
                </span>
                <p className="flex-1 text-xs text-slate-700">{result.text}</p>
                <button
                  onClick={() => {
                    const item: CopyItem = {
                      id: generateId(),
                      text: result.text,
                      source: 'ai_generated',
                    };
                    if (result.type === 'primary') addPrimaryText(item);
                    else if (result.type === 'headline') addHeadline(item);
                    else addDescription(item);
                  }}
                  disabled={
                    (result.type === 'primary' && primaryTexts.length >= 5) ||
                    (result.type === 'headline' && headlines.length >= 5) ||
                    (result.type === 'description' && descriptions.length >= 5)
                  }
                  className="flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Copy Lists */}
      <div className="space-y-6">
        {/* Primary Texts */}
        <CopyListSection
          icon={AlignLeft}
          title="Primary Texts"
          items={primaryTexts}
          max={5}
          onRemove={removePrimaryText}
          onAdd={(text) => addPrimaryText({ id: generateId(), text, source: 'manual' })}
        />

        {/* Headlines */}
        <CopyListSection
          icon={Type}
          title="Headlines"
          items={headlines}
          max={5}
          onRemove={removeHeadline}
          onAdd={(text) => addHeadline({ id: generateId(), text, source: 'manual' })}
        />

        {/* Descriptions */}
        <CopyListSection
          icon={FileText}
          title="Descriptions"
          items={descriptions}
          max={5}
          onRemove={removeDescription}
          onAdd={(text) => addDescription({ id: generateId(), text, source: 'manual' })}
        />
      </div>

      {/* Per-creative URL Override */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">Per-Creative URL Overrides</span>
          </label>
          <button
            onClick={() => {
              const next = !showUrlOverrides;
              setShowUrlOverrides(next);
              updateLaunchConfig({ usePerCreativeUrls: next });
            }}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              showUrlOverrides ? 'bg-blue-600' : 'bg-slate-200'
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                showUrlOverrides ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>

        {showUrlOverrides && selectedCreatives.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            {selectedCreatives.map((creative) => (
              <div key={creative.id} className="flex items-center gap-3">
                <span className="w-40 truncate text-xs font-medium text-slate-600">
                  {creative.creativeName}
                </span>
                <input
                  type="url"
                  value={perCreativeUrls[creative.id] || ''}
                  onChange={(e) =>
                    updateLaunchConfig({
                      perCreativeUrls: { ...perCreativeUrls, [creative.id]: e.target.value },
                    })
                  }
                  placeholder="https://yourstore.com/product"
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTA + Advantage+ Creative */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Call to Action</label>
          <select
            value={ctaType}
            onChange={(e) => updateLaunchConfig({ ctaType: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {CTA_OPTIONS.map((cta) => (
              <option key={cta.value} value={cta.value}>
                {cta.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            Advantage+ Creative
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const next = !advantageCreative;
                updateLaunchConfig({ advantageCreative: next });
              }}
              className={cn(
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                advantageCreative ? 'bg-blue-600' : 'bg-slate-200'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                  advantageCreative ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
            <span className="text-sm text-slate-600">
              {advantageCreative ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Let Meta optimize creative elements automatically.
          </p>
        </div>
      </div>

      {/* Combination Info Banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
        <p className="text-sm text-blue-800">
          <span className="font-semibold">{primaryTexts.length}</span> PT{primaryTexts.length !== 1 ? 's' : ''}{' '}
          &times; <span className="font-semibold">{headlines.length}</span> HL{headlines.length !== 1 ? 's' : ''}{' '}
          &times; <span className="font-semibold">{descriptions.length}</span> Desc{descriptions.length !== 1 ? 's' : ''}{' '}
          = <span className="font-bold">{totalCombinations}</span> combination{totalCombinations !== 1 ? 's' : ''} per creative
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ──

function WinnerCopyCard({
  copy,
  onAddPrimaryText,
  onAddHeadline,
  ptDisabled,
  hlDisabled,
}: {
  copy: WinningCopy;
  onAddPrimaryText: () => void;
  onAddHeadline?: () => void;
  ptDisabled: boolean;
  hlDisabled: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
          {copy.roas.toFixed(1)}x ROAS
        </span>
        {copy.isAiGenerated && (
          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
            AI
          </span>
        )}
      </div>
      <p className="line-clamp-3 text-xs text-slate-700">{copy.primaryText}</p>
      {copy.headline && (
        <p className="mt-1 text-xs font-semibold text-slate-600">{copy.headline}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onAddPrimaryText}
          disabled={ptDisabled}
          className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add PT
        </button>
        {onAddHeadline && (
          <button
            onClick={onAddHeadline}
            disabled={hlDisabled}
            className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add HL
          </button>
        )}
      </div>
    </div>
  );
}

function CopyListSection({
  icon: Icon,
  title,
  items,
  max,
  onRemove,
  onAdd,
}: {
  icon: React.ElementType;
  title: string;
  items: CopyItem[];
  max: number;
  onRemove: (id: string) => void;
  onAdd: (text: string) => void;
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState('');

  const handleAdd = () => {
    if (newText.trim()) {
      onAdd(newText.trim());
      setNewText('');
      setIsAdding(false);
    }
  };

  const sourceLabel = (source: CopyItem['source']) => {
    switch (source) {
      case 'winner':
        return 'Winner';
      case 'ai_generated':
        return 'AI';
      case 'manual':
        return 'Manual';
    }
  };

  const sourceBadgeClass = (source: CopyItem['source']) => {
    switch (source) {
      case 'winner':
        return 'bg-emerald-100 text-emerald-700';
      case 'ai_generated':
        return 'bg-violet-100 text-violet-700';
      case 'manual':
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <span className="text-xs text-slate-400">
            {items.length}/{max}
          </span>
        </div>
        {items.length < max && !isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" />
            Add Manual
          </button>
        )}
      </div>

      {items.map((item, idx) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
        >
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
            {idx + 1}
          </span>
          <p className="flex-1 text-xs text-slate-700">{item.text}</p>
          <span
            className={cn(
              'mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold',
              sourceBadgeClass(item.source)
            )}
          >
            {sourceLabel(item.source)}
            {item.sourceRoas != null && ` ${item.sourceRoas.toFixed(1)}x`}
          </span>
          <button
            onClick={() => onRemove(item.id)}
            className="flex-shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {isAdding && (
        <div className="flex items-start gap-2">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={`Enter ${title.toLowerCase().replace(/s$/, '')} text...`}
            rows={2}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewText('');
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !isAdding && (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-3 text-center text-xs text-slate-400">
          No {title.toLowerCase()} added yet. Add from winners, AI suggestions, or manually.
        </p>
      )}
    </div>
  );
}
