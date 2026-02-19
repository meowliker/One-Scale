'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NextImage from 'next/image';
import { ExternalLink, Image as ImageIcon, RefreshCw, Sparkles, Upload, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useCampaignCreateStore } from '@/stores/campaignCreateStore';
import { useStoreStore } from '@/stores/storeStore';
import { generateCampaignCopyOptions, type CampaignCopyField } from '@/services/campaignCreateAI';
import { getCampaignSetupOptions, uploadCampaignAsset } from '@/services/campaignPublish';
import type { CTAType } from '@/types/campaign';
import { WinnerChip } from './WinnerChip';

const CTA_OPTIONS: { value: CTAType; label: string }[] = [
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'BOOK_NOW', label: 'Book Now' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'GET_OFFER', label: 'Get Offer' },
];

const AI_FIELDS: CampaignCopyField[] = ['primaryText', 'headline', 'description', 'cta'];
const DEFAULT_CONVERSION_EVENTS = [
  'PURCHASE',
  'ADD_TO_CART',
  'INITIATE_CHECKOUT',
  'LEAD',
  'COMPLETE_REGISTRATION',
  'VIEW_CONTENT',
  'SEARCH',
] as const;

const EMPTY_AI_OPTIONS: Record<CampaignCopyField, string[]> = {
  primaryText: [],
  headline: [],
  description: [],
  cta: [],
};
const DEFAULT_HEADLINE_SEEDS = [
  'Feel Better, Starting Today',
  'Backed by Real Customer Results',
  'A Smarter Daily Routine',
  'Simple Change, Better Outcomes',
  'Start Your Best Week Now',
];
const DEFAULT_PRIMARY_TEXT_SEEDS = [
  'Built from winning structures: clear hook, benefit-led promise, and one direct next step.',
  'Use this variant to test a sharper value proposition with a cleaner call to action.',
  'Winner-inspired copy format designed to improve click quality and conversion intent.',
  'Lead with the core benefit, support with proof, and close with one simple action.',
  'Optimized test variant shaped from your recent top-performing ad patterns.',
];

function ctaLabel(cta: CTAType): string {
  return CTA_OPTIONS.find((o) => o.value === cta)?.label ?? cta;
}

function ctaTypeFromLabel(value: string): CTAType {
  const lower = value.toLowerCase().trim();
  const match = CTA_OPTIONS.find((option) => option.label.toLowerCase() === lower);
  return match?.value || 'LEARN_MORE';
}

function fieldTitle(field: CampaignCopyField): string {
  if (field === 'primaryText') return 'Primary Text';
  if (field === 'headline') return 'Headline';
  if (field === 'description') return 'Description';
  return 'CTA';
}

function buildFinalDestinationUrl(baseUrl: string, urlTags: string): string {
  const base = baseUrl.trim();
  const tags = urlTags.trim();
  if (!base) return '';
  if (!tags) return base;
  return base.includes('?') ? `${base}&${tags}` : `${base}?${tags}`;
}

function seedOptions(
  field: CampaignCopyField,
  aiContext: { topHeadlines: string[]; topPrimaryTexts: string[]; topCtas: string[]; winningAngles: string[] }
): string[] {
  if (field === 'headline') {
    return [...aiContext.topHeadlines, ...DEFAULT_HEADLINE_SEEDS]
      .filter((value, index, arr) => value && arr.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
      .slice(0, 5);
  }
  if (field === 'primaryText') {
    return [...aiContext.topPrimaryTexts, ...DEFAULT_PRIMARY_TEXT_SEEDS]
      .filter((value, index, arr) => value && arr.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index)
      .slice(0, 5);
  }
  if (field === 'cta') {
    return [...aiContext.topCtas, 'Shop Now', 'Learn More', 'Get Offer'].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 5);
  }
  const angle = aiContext.winningAngles[0] || 'Benefit';
  const sample = aiContext.topPrimaryTexts[0] || aiContext.topHeadlines[0] || `${angle} winner`;
  return [
    sample.slice(0, 60),
    `Best ${angle} angle in new variant`,
    'Winner-inspired hook with clear action',
    'Optimized from recent top performer',
    'Sharper benefit framing for scale',
  ].map((value) => value.slice(0, 60));
}

export function CreativeStep() {
  const { activeStoreId, stores } = useStoreStore();
  const {
    creative,
    objective,
    setCreative,
    winnerChips,
    ourCopyOptions,
    aiContext,
    setupOptions,
    setupOptionsLoading,
    setupOptionsError,
    setSetupOptions,
    setSetupOptionsLoading,
    setSetupOptionsError,
    publishSettings,
    setPublishSettings,
    uploadedAsset,
    setUploadedAsset,
  } = useCampaignCreateStore();

  const [aiOptions, setAiOptions] = useState<Record<CampaignCopyField, string[]>>(EMPTY_AI_OPTIONS);
  const [loadingField, setLoadingField] = useState<Partial<Record<CampaignCopyField, boolean>>>({});
  const [providerLabel, setProviderLabel] = useState<'OpenAI' | 'Fallback' | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const lastAutoSeedKeyRef = useRef('__unseeded__');
  const didAutoSetupFetchRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewSrc = uploadedAsset?.localPreviewUrl || uploadedAsset?.thumbnailUrl || '';
  const finalDestinationUrl = buildFinalDestinationUrl(publishSettings.destinationUrl, publishSettings.urlTags);

  const fallbackAccounts = useMemo(() => {
    const activeStore = stores.find((store) => store.id === activeStoreId);
    return (activeStore?.adAccounts || [])
      .filter((account) => account.platform === 'meta' && account.isActive)
      .map((account) => ({
        id: account.accountId || account.id,
        name: account.name,
      }));
  }, [activeStoreId, stores]);

  const accountOptions = useMemo(() => {
    const combined = [...(setupOptions?.accounts || []), ...fallbackAccounts];
    const map = new Map<string, { id: string; name: string }>();
    for (const account of combined) {
      const id = (account.id || '').trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, { id, name: account.name || id });
    }
    return [...map.values()];
  }, [fallbackAccounts, setupOptions?.accounts]);

  const winnerSummary = useMemo(
    () => Object.values(winnerChips).flatMap((chip) => (chip ? [`${chip.title}: ${chip.value}`] : [])),
    [winnerChips]
  );

  const regenerateField = useCallback(async (field: CampaignCopyField) => {
    setLoadingField((prev) => ({ ...prev, [field]: true }));
    try {
      const result = await generateCampaignCopyOptions({
        field,
        count: 5,
        objective: objective || 'CONVERSIONS',
        winnerSummary,
        topHeadlines: aiContext.topHeadlines,
        topPrimaryTexts: aiContext.topPrimaryTexts,
        topCtas: aiContext.topCtas,
        winningAngles: aiContext.winningAngles,
      });

      setAiOptions((prev) => ({ ...prev, [field]: result.options.slice(0, 5) }));
      setProviderLabel(result.provider === 'openai' ? 'OpenAI' : 'Fallback');
    } finally {
      setLoadingField((prev) => ({ ...prev, [field]: false }));
    }
  }, [aiContext.topCtas, aiContext.topHeadlines, aiContext.topPrimaryTexts, aiContext.winningAngles, objective, winnerSummary]);

  const refreshSetupOptions = useCallback(async (accountId?: string) => {
    setSetupOptionsLoading(true);
    try {
      const options = await getCampaignSetupOptions(accountId);
      setSetupOptions(options);
      setSetupOptionsError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch Meta setup options';
      setSetupOptionsError(message);
    } finally {
      setSetupOptionsLoading(false);
    }
  }, [setSetupOptions, setSetupOptionsError, setSetupOptionsLoading]);

  async function handleAccountChange(accountId: string) {
    setPublishSettings({ accountId, pageId: '', instagramActorId: '', pixelId: '', customConversionId: '' });
    await refreshSetupOptions(accountId);
  }

  async function handleFileUpload(file: File) {
    if (!publishSettings.accountId) {
      toast.error('Select an ad account before uploading creative assets.');
      return;
    }

    setUploadingAsset(true);
    try {
      const localPreviewUrl = URL.createObjectURL(file);
      const uploaded = await uploadCampaignAsset({
        accountId: publishSettings.accountId,
        mediaType: creative.type,
        file,
      });

      setUploadedAsset({ ...uploaded, localPreviewUrl });
      toast.success(`${creative.type === 'image' ? 'Image' : 'Video'} uploaded to Meta.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Creative upload failed';
      toast.error(message);
    } finally {
      setUploadingAsset(false);
    }
  }

  function applyAICopy(field: CampaignCopyField, value: string) {
    if (field === 'headline') {
      setCreative({ headline: value.slice(0, 40) });
      return;
    }
    if (field === 'primaryText') {
      setCreative({ body: value.slice(0, 125) });
      return;
    }
    if (field === 'description') {
      setCreative({ description: value.slice(0, 60) });
      return;
    }
    setCreative({ ctaType: ctaTypeFromLabel(value) });
  }

  useEffect(() => {
    const seedKey = [
      aiContext.topHeadlines.join('|'),
      aiContext.topPrimaryTexts.join('|'),
      aiContext.topCtas.join('|'),
      aiContext.winningAngles.join('|'),
    ].join('||');
    if (lastAutoSeedKeyRef.current === seedKey) return;
    lastAutoSeedKeyRef.current = seedKey;

    setAiOptions({
      headline: seedOptions('headline', aiContext),
      primaryText: seedOptions('primaryText', aiContext),
      description: seedOptions('description', aiContext),
      cta: seedOptions('cta', aiContext),
    });
    void Promise.all(AI_FIELDS.map((field) => regenerateField(field)));
  }, [aiContext, regenerateField]);

  useEffect(() => {
    if (didAutoSetupFetchRef.current) return;
    if (!activeStoreId) return;
    if (setupOptions || setupOptionsLoading) return;
    if (setupOptionsError) return;
    didAutoSetupFetchRef.current = true;
    void refreshSetupOptions();
  }, [activeStoreId, refreshSetupOptions, setupOptions, setupOptionsError, setupOptionsLoading]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Design your ad creative</h2>
        <p className="text-sm text-gray-500 mt-1">
          Use last 30-day winners to autopopulate copy, then refine with AI.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {winnerChips.creative && <WinnerChip title={winnerChips.creative.title} value={winnerChips.creative.value} />}
          {winnerChips.copy && <WinnerChip title={winnerChips.copy.title} value={winnerChips.copy.value} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Our Copy (Merged from 30d Winners)</h3>
            <span className="text-xs text-gray-500">Deduped + merged metrics</span>
          </div>

          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {ourCopyOptions.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
                No merged winner copy found yet for the last 30 days.
              </div>
            )}

            {ourCopyOptions.map((option) => {
              const selected =
                creative.headline.trim() === option.headline.trim() &&
                creative.body.trim() === option.primaryText.trim();

              return (
                <button
                  key={option.id}
                  onClick={() =>
                    setCreative({
                      headline: option.headline.slice(0, 40),
                      body: option.primaryText.slice(0, 125),
                      ctaType: option.ctaType,
                    })
                  }
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-all',
                    selected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {option.headline || 'Untitled Headline'}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                        {option.primaryText || `Winner fallback: ${option.headline}`}
                      </p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-700">
                      {option.ads} ads
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2 text-[11px]">
                    <div className="rounded bg-gray-50 px-2 py-1">
                      <p className="text-gray-500">Spend</p>
                      <p className="font-semibold text-gray-900">${Math.round(option.spend).toLocaleString('en-US')}</p>
                    </div>
                    <div className="rounded bg-gray-50 px-2 py-1">
                      <p className="text-gray-500">ROAS</p>
                      <p className="font-semibold text-gray-900">{option.roas.toFixed(2)}x</p>
                    </div>
                    <div className="rounded bg-gray-50 px-2 py-1">
                      <p className="text-gray-500">CTR</p>
                      <p className="font-semibold text-gray-900">{option.ctr.toFixed(2)}%</p>
                    </div>
                    <div className="rounded bg-gray-50 px-2 py-1">
                      <p className="text-gray-500">CPC</p>
                      <p className="font-semibold text-gray-900">${option.cpc.toFixed(2)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">AI Copy Lab</h3>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Sparkles className="h-3.5 w-3.5" />
              {providerLabel ? `${providerLabel} suggestions` : 'Generating 5 options per field'}
            </div>
          </div>

          <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
            {AI_FIELDS.map((field) => {
              const options = aiOptions[field] || [];
              const loading = loadingField[field] === true;

              return (
                <div key={field} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                      {fieldTitle(field)}
                    </p>
                    <button
                      type="button"
                      onClick={() => regenerateField(field)}
                      disabled={loading}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
                        loading
                          ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      )}
                    >
                      <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
                      Regenerate 5
                    </button>
                  </div>

                  <div className="space-y-2">
                    {options.length === 0 && (
                      <p className="text-xs text-gray-500">No options yet.</p>
                    )}

                    {options.map((option) => {
                      const selected =
                        field === 'headline'
                          ? creative.headline.trim() === option.trim()
                          : field === 'primaryText'
                            ? creative.body.trim() === option.trim()
                            : field === 'description'
                              ? creative.description.trim() === option.trim()
                              : ctaLabel(creative.ctaType).toLowerCase() === option.trim().toLowerCase();

                      return (
                        <button
                          key={`${field}-${option}`}
                          onClick={() => applyAICopy(field, option)}
                          className={cn(
                            'w-full rounded-md border px-2.5 py-2 text-left text-xs transition-all',
                            selected
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          )}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        <div className="col-span-3 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Creative Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (creative.type !== 'image') setUploadedAsset(null);
                  setCreative({ type: 'image' });
                }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  creative.type === 'image'
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                )}
              >
                <ImageIcon className="w-4 h-4" />
                Image
              </button>
              <button
                onClick={() => {
                  if (creative.type !== 'video') setUploadedAsset(null);
                  setCreative({ type: 'video' });
                }}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  creative.type === 'video'
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                )}
              >
                <Video className="w-4 h-4" />
                Video
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload {creative.type === 'image' ? 'Image' : 'Video'}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={creative.type === 'image' ? 'image/*' : 'video/*'}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
                e.currentTarget.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAsset}
              className={cn(
                'w-full border-2 border-dashed border-gray-300 rounded-xl p-8 text-center transition-colors',
                uploadingAsset ? 'cursor-not-allowed bg-gray-50 text-gray-400' : 'hover:border-gray-400'
              )}
            >
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                {uploadingAsset
                  ? 'Uploading to Meta...'
                  : (
                    <>
                      Drop your file here or <span className="text-blue-600 font-medium">click to upload</span>
                    </>
                  )}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {creative.type === 'image'
                  ? 'PNG, JPG or WebP. Max 30MB.'
                  : 'MP4 or MOV. Max 4GB.'}
              </p>
            </button>
            {uploadedAsset && (
              <p className="mt-2 text-xs text-emerald-700">
                Uploaded: {uploadedAsset.fileName} {uploadedAsset.mediaType === 'image' ? '(image hash ready)' : '(video ID ready)'}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Headline</label>
              <span className={cn('text-xs', creative.headline.length > 40 ? 'text-red-500' : 'text-gray-400')}>
                {creative.headline.length}/40
              </span>
            </div>
            <input
              type="text"
              value={creative.headline}
              onChange={(e) => setCreative({ headline: e.target.value.slice(0, 40) })}
              placeholder="Write a compelling headline"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Primary Text</label>
              <span className={cn('text-xs', creative.body.length > 125 ? 'text-red-500' : 'text-gray-400')}>
                {creative.body.length}/125
              </span>
            </div>
            <textarea
              value={creative.body}
              onChange={(e) => setCreative({ body: e.target.value.slice(0, 125) })}
              placeholder="Describe your product or offer"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Description</label>
              <span className={cn('text-xs', creative.description.length > 60 ? 'text-red-500' : 'text-gray-400')}>
                {creative.description.length}/60
              </span>
            </div>
            <input
              type="text"
              value={creative.description}
              onChange={(e) => setCreative({ description: e.target.value.slice(0, 60) })}
              placeholder="Short supporting line"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Call to Action</label>
            <select
              value={creative.ctaType}
              onChange={(e) => setCreative({ ctaType: e.target.value as CTAType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {CTA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Meta Publish Settings</h4>
                <p className="mt-1 text-xs text-gray-500">These are pulled from your connected Meta account and existing winners.</p>
              </div>
              <button
                type="button"
                onClick={() => void refreshSetupOptions(publishSettings.accountId || undefined)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                disabled={setupOptionsLoading}
              >
                <RefreshCw className={cn('h-3 w-3', setupOptionsLoading && 'animate-spin')} />
                Refresh
              </button>
            </div>
            {setupOptionsError && <p className="mt-2 text-xs text-amber-700">{setupOptionsError}</p>}

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Ad Account</label>
                <select
                  value={publishSettings.accountId}
                  onChange={(e) => void handleAccountChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  disabled={setupOptionsLoading}
                >
                  <option value="">Select account</option>
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                {accountOptions.length === 0 && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    No account list yet. Check active store/ad account mapping in Settings.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Facebook Page</label>
                <select
                  value={publishSettings.pageId}
                  onChange={(e) => setPublishSettings({ pageId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Select page</option>
                  {(setupOptions?.pages || []).map((page) => (
                    <option key={page.id} value={page.id}>{page.name}</option>
                  ))}
                </select>
                {(setupOptions?.pages || []).length === 0 && (
                  <input
                    value={publishSettings.pageId}
                    onChange={(e) => setPublishSettings({ pageId: e.target.value })}
                    placeholder="Or paste Facebook Page ID"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Instagram (optional)</label>
                <select
                  value={publishSettings.instagramActorId}
                  onChange={(e) => setPublishSettings({ instagramActorId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">No Instagram actor</option>
                  {(setupOptions?.instagramAccounts || []).map((ig) => (
                    <option key={ig.id} value={ig.id}>@{ig.username}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Pixel (recommended)</label>
                <select
                  value={publishSettings.pixelId}
                  onChange={(e) => setPublishSettings({ pixelId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">No pixel</option>
                  {(setupOptions?.pixels || []).map((pixel) => (
                    <option key={pixel.id} value={pixel.id}>{pixel.name}</option>
                  ))}
                </select>
                {(setupOptions?.pixels || []).length === 0 && (
                  <input
                    value={publishSettings.pixelId}
                    onChange={(e) => setPublishSettings({ pixelId: e.target.value })}
                    placeholder="Or paste Pixel ID"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Conversion Event</label>
                <select
                  value={publishSettings.conversionEvent}
                  onChange={(e) => setPublishSettings({ conversionEvent: e.target.value as typeof publishSettings.conversionEvent })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {(setupOptions?.conversionEvents?.length ? setupOptions.conversionEvents : DEFAULT_CONVERSION_EVENTS).map((event) => (
                    <option key={event} value={event}>{event}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Custom Conversion (optional)</label>
                <select
                  value={publishSettings.customConversionId}
                  onChange={(e) => setPublishSettings({ customConversionId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {(setupOptions?.customConversions || []).map((conversion) => (
                    <option key={conversion.id} value={conversion.id}>{conversion.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Campaign Name</label>
                <input
                  value={publishSettings.campaignName}
                  onChange={(e) => setPublishSettings({ campaignName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Ad Set Name</label>
                <input
                  value={publishSettings.adSetName}
                  onChange={(e) => setPublishSettings({ adSetName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Ad Name</label>
                <input
                  value={publishSettings.adName}
                  onChange={(e) => setPublishSettings({ adName: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Destination URL</label>
                <input
                  value={publishSettings.destinationUrl}
                  onChange={(e) => setPublishSettings({ destinationUrl: e.target.value })}
                  placeholder="https://yourstore.com/product"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">URL Tags / UTM (editable)</label>
                <textarea
                  value={publishSettings.urlTags}
                  onChange={(e) => setPublishSettings({ urlTags: e.target.value })}
                  rows={2}
                  placeholder="utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Final URL preview:
                  <span className="ml-1 break-all text-gray-700">{finalDestinationUrl || 'Set destination URL to preview.'}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Ad Preview</label>
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="flex items-center gap-2 p-3 border-b border-gray-100">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <span className="text-white text-xs font-bold">Ad</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">Your Brand</p>
                <p className="text-[10px] text-gray-500">Sponsored</p>
              </div>
            </div>

            <div className="px-3 py-2">
              <p className="text-xs text-gray-800 leading-relaxed">
                {creative.body || 'Your ad primary text will appear here...'}
              </p>
            </div>

            <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
              {creative.type === 'image' && previewSrc ? (
                <NextImage
                  src={previewSrc}
                  alt="Creative preview"
                  width={800}
                  height={800}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : creative.type === 'video' && uploadedAsset?.localPreviewUrl ? (
                <video src={uploadedAsset.localPreviewUrl} className="h-full w-full object-cover" muted loop controls />
              ) : creative.type === 'image' ? (
                <ImageIcon className="w-12 h-12 text-gray-300" />
              ) : (
                <Video className="w-12 h-12 text-gray-300" />
              )}
            </div>

            <div className="p-3 border-t border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {creative.headline || 'Your headline here'}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {creative.description || publishSettings.destinationUrl || 'yourbrand.com'}
                  </p>
                </div>
                <button className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-[10px] font-semibold rounded-md flex-shrink-0">
                  {ctaLabel(creative.ctaType)}
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
