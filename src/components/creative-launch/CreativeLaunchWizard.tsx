'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useStoreStore } from '@/stores/storeStore';
import { useCreativeLaunchStore } from '@/stores/creativeLaunchStore';
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';
import type { ProductLaunchPlan, ProductMapping } from '@/types/creativeLaunch';

// Step components
import { LaunchSelectStep } from './wizard/LaunchSelectStep';
import { LaunchProductSetupStep } from './wizard/LaunchProductSetupStep';
import { LaunchProductLinksSidebar } from './wizard/LaunchProductLinksSidebar';
import { LaunchCampaignStep } from './wizard/LaunchCampaignStep';
import { LaunchTargetingStep } from './wizard/LaunchTargetingStep';
import { LaunchBudgetStep } from './wizard/LaunchBudgetStep';
import { LaunchCreativeStep } from './wizard/LaunchCreativeStep';
import { LaunchReviewStep } from './wizard/LaunchReviewStep';

const STEPS = ['Select', 'Product Setup', 'Campaign', 'Targeting', 'Budget', 'Creative', 'Review'];

interface WinnerCopyItem {
  id: string;
  primaryText: string;
  headline: string;
  cta: string;
  roas: number;
  spend: number;
}

interface WinningTargeting {
  ageMin: number;
  ageMax: number;
  genders: number[];
  locations: string[];
  interests: Array<{ id: string; name: string }>;
  source: string;
}

interface MetaAssets {
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    objective: string;
    dailyBudget: number | null;
    spend30d: number;
    roas30d: number;
  }>;
  adsets: Array<{
    id: string;
    name: string;
    campaignId: string;
    status: string;
    dailyBudget: number | null;
    targeting?: {
      age_min?: number;
      age_max?: number;
      genders?: number[];
      geo_locations?: { countries?: string[] };
      flexible_spec?: Array<{ interests?: Array<{ id: string; name: string }> }>;
    };
  }>;
  pages: Array<{ id: string; name: string; instagramId: string | null }>;
  pixels: Array<{ id: string; name: string }>;
  adAccounts: Array<{ id: string; name: string }>;
  winnerCopy?: WinnerCopyItem[];
  winningTargeting?: WinningTargeting;
}

interface LaunchApiResponse {
  ok: boolean;
  summary: {
    total: number;
    queued: number;
    failed: number;
  };
  results: Array<{
    productId: string;
    productName: string;
    status: 'queued' | 'failed';
    errors: string[];
    warnings: string[];
  }>;
}

function buildLaunchPlans(
  mappings: ProductMapping[],
  productCreativeIds: Map<string, string[]>
): Record<string, ProductLaunchPlan> {
  const out: Record<string, ProductLaunchPlan> = {};
  for (const mapping of mappings) {
    out[mapping.productId] = {
      productId: mapping.productId,
      productName: mapping.productName,
      creativeIds: productCreativeIds.get(mapping.productId) || [],
      mapping: {
        adAccountId: mapping.adAccountId,
        adAccountName: mapping.adAccountName,
        businessManagerId: mapping.businessManagerId,
        businessManagerName: mapping.businessManagerName,
        pageId: mapping.pageId,
        pageName: mapping.pageName,
        instagramId: mapping.instagramId,
        instagramUsername: mapping.instagramUsername,
        pixelId: mapping.pixelId,
        pixelName: mapping.pixelName,
        destinationUrl: mapping.destinationUrl,
        productLinks: mapping.productLinks,
        utmTemplate: mapping.utmTemplate,
      },
    };
  }
  return out;
}

interface ProductLinksResponse {
  linksByProduct: Record<string, string[]>;
}

// Step indicator component
function WizardStepIndicator({ currentStep, steps }: { currentStep: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300',
                  isCompleted
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : isCurrent
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-slate-100 text-slate-400'
                )}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : index + 1}
              </div>
              <span
                className={cn(
                  'mt-2 text-xs font-medium',
                  isCompleted || isCurrent ? 'text-slate-700' : 'text-slate-400'
                )}
              >
                {step}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'mx-2 h-0.5 w-16 transition-colors duration-300',
                  index < currentStep ? 'bg-emerald-500' : 'bg-slate-200'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CreativeLaunchWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeStoreId } = useStoreStore();
  const launchStore = useCreativeLaunchStore();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [metaAssets, setMetaAssets] = useState<MetaAssets | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [selectedCreativeIds, setSelectedCreativeIds] = useState<Set<string>>(new Set());
  const [campaignConfig, setCampaignConfig] = useState({
    mode: 'existing' as 'existing' | 'new',
    campaignId: '',
    campaignName: '',
    adsetMode: 'existing' as 'existing' | 'new' | 'isolated',
    adsetId: '',
    adsetName: '',
    destinationUrl: '',
  });
  const [targetingConfig, setTargetingConfig] = useState({
    ageMin: 18,
    ageMax: 65,
    genders: [] as number[],
    locations: ['US'] as string[],
    interests: [] as Array<{ id: string; name: string }>,
  });
  const [budgetConfig, setBudgetConfig] = useState({
    budgetType: 'daily' as 'daily' | 'lifetime',
    dailyBudget: 50,
    lifetimeBudget: 500,
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP' as string,
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    noEndDate: true,
  });
  const [creativeConfig, setCreativeConfig] = useState({
    primaryText: '',
    headline: '',
    description: '',
    ctaType: 'SHOP_NOW' as string,
    mediaUrl: '',
    mediaType: 'image' as 'image' | 'video',
  });
  const [launchAsPaused, setLaunchAsPaused] = useState(false);
  const [productMappings, setProductMappings] = useState<ProductMapping[]>([]);
  const [launchPlanByProduct, setLaunchPlanByProduct] = useState<Record<string, ProductLaunchPlan>>({});
  const [isMappingsLoading, setIsMappingsLoading] = useState(false);
  const [mappingsError, setMappingsError] = useState<string | null>(null);
  const [productLinksDraft, setProductLinksDraft] = useState<Record<string, string[]>>({});
  const [isLinksLoading, setIsLinksLoading] = useState(false);
  const [savingLinksProductId, setSavingLinksProductId] = useState<string | null>(null);
  const [suggestingLinksProductId, setSuggestingLinksProductId] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    let cancelled = false;
    
    async function loadData() {
      if (!activeStoreId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Fetch creatives/products and Meta assets in parallel for faster loading
        const [discoverRes, metaRes] = await Promise.all([
          fetch(`/api/creative-launch/discover?storeId=${encodeURIComponent(activeStoreId)}`)
            .catch(err => {
              console.warn('Failed to fetch creatives:', err);
              return null;
            }),
          fetch(`/api/creative-launch/meta-assets?storeId=${encodeURIComponent(activeStoreId)}`)
            .catch(err => {
              console.warn('Failed to fetch Meta assets:', err);
              return null;
            }),
        ]);
        
        // Process discover response for destination URL
        if (discoverRes && discoverRes.ok) {
          try {
            const discoverData = await discoverRes.json();
            // Update store with the data
            if (discoverData.products) {
              // The store will be updated via fetchData, but we need destinationUrl now
              if (!cancelled && discoverData.destinationUrl) {
                setCampaignConfig(prev => ({
                  ...prev,
                  destinationUrl: discoverData.destinationUrl,
                }));
              }
            }
          } catch (parseErr) {
            console.warn('Failed to parse discover data:', parseErr);
          }
        }
        
        // Also call the store's fetchData to update the store state
        await launchStore.fetchData(activeStoreId).catch(err => {
          console.warn('Failed to update store:', err);
        });

        if (cancelled) return;

        // Process Meta assets response
        if (metaRes && metaRes.ok) {
          try {
            const assets = await metaRes.json();
            if (!cancelled) {
              setMetaAssets(assets);
              
              // Auto-populate targeting from winning adsets
              if (assets.winningTargeting) {
                setTargetingConfig({
                  ageMin: assets.winningTargeting.ageMin || 18,
                  ageMax: assets.winningTargeting.ageMax || 65,
                  genders: assets.winningTargeting.genders || [],
                  locations: assets.winningTargeting.locations || ['US'],
                  interests: assets.winningTargeting.interests || [],
                });
              }
              
              // Auto-populate creative config from winner copy
              if (assets.winnerCopy && assets.winnerCopy.length > 0) {
                const bestWinner = assets.winnerCopy[0];
                setCreativeConfig(prev => ({
                  ...prev,
                  primaryText: bestWinner.primaryText || '',
                  headline: bestWinner.headline || '',
                  ctaType: bestWinner.cta || 'SHOP_NOW',
                }));
              }
            }
          } catch (parseErr) {
            console.warn('Failed to parse Meta assets:', parseErr);
          }
        }

        // Set loading to false even if some calls failed - we can still show the UI
        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load data:', err);
          setError('Failed to load data. Please try again.');
          setIsLoading(false);
        }
      }
    }

    loadData();
    
    return () => {
      cancelled = true;
    };
  }, [activeStoreId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select creatives from URL params
  useEffect(() => {
    const creativeIds = searchParams.get('creatives');
    if (creativeIds) {
      setSelectedCreativeIds(new Set(creativeIds.split(',')));
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedCreativeIds.size > 0) return;
    if (searchParams.get('creatives')) return;
    if (launchStore.clickupCreatives.length === 0) return;
    setSelectedCreativeIds(new Set(launchStore.clickupCreatives.map((row) => row.id)));
  }, [launchStore.clickupCreatives, searchParams, selectedCreativeIds.size]);

  const selectedProducts = useMemo(() => {
    const selectedCreatives = launchStore.clickupCreatives.filter((c) => selectedCreativeIds.has(c.id));
    const ids = [...new Set(selectedCreatives.map((c) => c.productId))];
    return ids.map((id) => {
      const product = launchStore.products.find((row) => row.id === id);
      return {
        id,
        name: product?.name || selectedCreatives.find((c) => c.productId === id)?.productName || id,
      };
    });
  }, [launchStore.clickupCreatives, launchStore.products, selectedCreativeIds]);

  const fetchSavedProductLinks = useCallback(async () => {
    if (!activeStoreId || selectedProducts.length === 0) {
      setProductLinksDraft({});
      return;
    }
    setIsLinksLoading(true);
    try {
      const response = await fetch('/api/creative-launch/product-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get-links',
          storeId: activeStoreId,
          productIds: selectedProducts.map((row) => row.id),
        }),
      });
      if (response.ok) {
        const data = await response.json() as ProductLinksResponse;
        setProductLinksDraft(data.linksByProduct || {});
      }
    } catch (err) {
      console.warn('Failed to fetch saved product links:', err);
    } finally {
      setIsLinksLoading(false);
    }
  }, [activeStoreId, selectedProducts]);

  useEffect(() => {
    fetchSavedProductLinks();
  }, [fetchSavedProductLinks]);

  // Fetch product mappings when moving to Product Setup step
  const handleMappingsChange = useCallback((nextMappings: ProductMapping[]) => {
    setProductMappings(nextMappings);
    const selectedCreatives = launchStore.clickupCreatives.filter(c => selectedCreativeIds.has(c.id));
    const productCreativeIds = new Map<string, string[]>();
    for (const creative of selectedCreatives) {
      const current = productCreativeIds.get(creative.productId) || [];
      productCreativeIds.set(creative.productId, [...current, creative.id]);
    }
    setLaunchPlanByProduct(buildLaunchPlans(nextMappings, productCreativeIds));
  }, [launchStore.clickupCreatives, selectedCreativeIds]);

  const fetchProductMappings = useCallback(async (): Promise<number> => {
    if (!activeStoreId || selectedCreativeIds.size === 0) return 0;
    
    setIsMappingsLoading(true);
    setMappingsError(null);
    try {
      // Get unique products from selected creatives
      const selectedCreatives = launchStore.clickupCreatives.filter(c => selectedCreativeIds.has(c.id));
      if (selectedCreatives.length === 0) {
        handleMappingsChange([]);
        return 0;
      }
      const productIds = [...new Set(selectedCreatives.map(c => c.productId))];
      
      // Get product details from launchStore.products
      const products = productIds.map(pid => {
        const product = launchStore.products.find(p => p.id === pid);
        return {
          id: pid,
          name: product?.name || pid,
          image: product?.image || '',
          shopifyUrl: product?.shopifyUrl || '',
          landingUrl: product?.landingUrl || '',
          productLinks: productLinksDraft[pid] || [],
        };
      });
      
      const res = await fetch('/api/creative-launch/product-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: activeStoreId,
          products,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        const mappings = data.mappings || [];
        handleMappingsChange(mappings);
        
        // Auto-populate campaign config from first mapping
        if (mappings.length > 0) {
          const firstMapping = mappings[0];
          setCampaignConfig(prev => ({
            ...prev,
            destinationUrl: firstMapping.destinationUrl || prev.destinationUrl,
          }));
        }
        return mappings.length;
      } else {
        const data = await res.json().catch(() => ({}));
        const message = typeof data.error === 'string' ? data.error : 'Failed to fetch product mappings';
        setMappingsError(message);
        handleMappingsChange([]);
        toast.error(message);
        return 0;
      }
    } catch (err) {
      console.warn('Failed to fetch product mappings:', err);
      setMappingsError('Failed to fetch product mappings');
      handleMappingsChange([]);
      toast.error('Failed to fetch product mappings');
      return 0;
    } finally {
      setIsMappingsLoading(false);
    }
  }, [activeStoreId, selectedCreativeIds, launchStore.clickupCreatives, launchStore.products, productLinksDraft, handleMappingsChange]);

  const handleProductLinksChange = useCallback((productId: string, links: string[]) => {
    setProductLinksDraft((prev) => ({
      ...prev,
      [productId]: links,
    }));
  }, []);

  const handleSaveProductLinks = useCallback(async (productId: string, productName: string) => {
    if (!activeStoreId) return;
    setSavingLinksProductId(productId);
    try {
      const response = await fetch('/api/creative-launch/product-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-links',
          storeId: activeStoreId,
          productId,
          productName,
          productLinks: productLinksDraft[productId] || [],
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to save product links');
      }
      toast.success(`Saved links for ${productName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save product links';
      toast.error(message);
    } finally {
      setSavingLinksProductId(null);
    }
  }, [activeStoreId, productLinksDraft]);

  const handleSuggestProductLinks = useCallback(async (productId: string, productName: string) => {
    if (!activeStoreId) return;
    setSuggestingLinksProductId(productId);
    try {
      const response = await fetch('/api/creative-launch/product-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'suggest-links',
          storeId: activeStoreId,
          productName,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to suggest links');
      }
      const data = await response.json() as { links?: string[] };
      if (!data.links || data.links.length === 0) {
        toast('No Shopify suggestions found');
        return;
      }
      setProductLinksDraft((prev) => ({
        ...prev,
        [productId]: data.links || [],
      }));
      toast.success(`Suggested links added for ${productName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to suggest links';
      toast.error(message);
    } finally {
      setSuggestingLinksProductId(null);
    }
  }, [activeStoreId]);

  const handleNext = useCallback(async () => {
    if (currentStep === 0) {
      const selectedCreatives = launchStore.clickupCreatives.filter(c => selectedCreativeIds.has(c.id));
      if (selectedCreatives.length === 0) {
        toast.error('Please select at least one valid creative to launch.');
        return;
      }
    }
    
    // Fetch product mappings when moving from Select to Product Setup
    if (currentStep === 0) {
      const mappingCount = await fetchProductMappings();
      if (mappingCount === 0) {
        toast.error('No product mappings available. Check selected creatives and product links.');
        return;
      }
    }
    
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, selectedCreativeIds, fetchProductMappings, launchStore.clickupCreatives]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleLaunch = async () => {
    if (!activeStoreId) {
      toast.error('Select a store before launching.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedCreatives = launchStore.clickupCreatives.filter(c => selectedCreativeIds.has(c.id));
      const productCreativeIds = new Map<string, string[]>();
      for (const creative of selectedCreatives) {
        const current = productCreativeIds.get(creative.productId) || [];
        productCreativeIds.set(creative.productId, [...current, creative.id]);
      }

      const payloadProducts: ProductLaunchPlan[] = productMappings.map((mapping) => {
        const plan = launchPlanByProduct[mapping.productId];
        if (plan) {
          return {
            ...plan,
            creativeIds: productCreativeIds.get(mapping.productId) || plan.creativeIds,
          };
        }

        return {
          productId: mapping.productId,
          productName: mapping.productName,
          creativeIds: productCreativeIds.get(mapping.productId) || [],
          mapping: {
            adAccountId: mapping.adAccountId,
            adAccountName: mapping.adAccountName,
            businessManagerId: mapping.businessManagerId,
            businessManagerName: mapping.businessManagerName,
            pageId: mapping.pageId,
            pageName: mapping.pageName,
            instagramId: mapping.instagramId,
            instagramUsername: mapping.instagramUsername,
            pixelId: mapping.pixelId,
            pixelName: mapping.pixelName,
            destinationUrl: mapping.destinationUrl,
            productLinks: mapping.productLinks,
            utmTemplate: mapping.utmTemplate,
          },
        };
      });

      const response = await fetch('/api/creative-launch/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: activeStoreId,
          products: payloadProducts,
          campaignConfig,
          targetingConfig,
          budgetConfig,
          creativeConfig,
          launchAsPaused,
        }),
      });

      const data = await response.json() as LaunchApiResponse & { error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to launch creatives');
      }

      if (data.summary.failed > 0 && data.summary.queued > 0) {
        toast.success(`Queued ${data.summary.queued} products. ${data.summary.failed} failed validation.`);
      } else if (data.summary.failed > 0) {
        toast.error(`Launch failed for ${data.summary.failed} products.`);
      } else {
        toast.success('Creatives queued successfully!', { duration: 5000, icon: '🚀' });
      }

      if (data.summary.queued > 0) {
        router.push('/dashboard/creative-launch');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to launch creatives';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-600">Loading creatives and Meta assets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-center">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <WizardStepIndicator currentStep={currentStep} steps={STEPS} />

      <div className="min-h-[500px] rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-200/40 backdrop-blur">
        {currentStep === 0 && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.7fr_1fr]">
            <LaunchSelectStep
              products={launchStore.products}
              clickupCreatives={launchStore.clickupCreatives}
              selectedIds={selectedCreativeIds}
              onSelectionChange={setSelectedCreativeIds}
            />
            <LaunchProductLinksSidebar
              products={selectedProducts}
              linksByProduct={productLinksDraft}
              isLoading={isLinksLoading}
              savingProductId={savingLinksProductId}
              suggestingProductId={suggestingLinksProductId}
              onLinksChange={handleProductLinksChange}
              onSaveProduct={handleSaveProductLinks}
              onSuggestLinks={handleSuggestProductLinks}
            />
          </div>
        )}
        {currentStep === 1 && (
          <LaunchProductSetupStep
            storeId={activeStoreId}
            mappings={productMappings}
            onMappingsChange={handleMappingsChange}
            isLoading={isMappingsLoading}
            error={mappingsError}
          />
        )}
        {currentStep === 2 && (
          <LaunchCampaignStep
            config={campaignConfig}
            onConfigChange={setCampaignConfig}
            campaigns={metaAssets?.campaigns || []}
            adsets={metaAssets?.adsets || []}
          />
        )}
        {currentStep === 3 && (
          <LaunchTargetingStep
            config={targetingConfig}
            onConfigChange={setTargetingConfig}
            selectedAdset={metaAssets?.adsets.find(a => a.id === campaignConfig.adsetId)}
          />
        )}
        {currentStep === 4 && (
          <LaunchBudgetStep
            config={budgetConfig}
            onConfigChange={setBudgetConfig}
          />
        )}
        {currentStep === 5 && (
          <LaunchCreativeStep
            config={creativeConfig}
            onConfigChange={setCreativeConfig}
            selectedCreatives={launchStore.clickupCreatives.filter(c => selectedCreativeIds.has(c.id))}
            products={launchStore.products}
            winnerCopy={metaAssets?.winnerCopy}
          />
        )}
        {currentStep === 6 && (
          <LaunchReviewStep
            selectedCreatives={launchStore.clickupCreatives.filter(c => selectedCreativeIds.has(c.id))}
            campaignConfig={campaignConfig}
            targetingConfig={targetingConfig}
            budgetConfig={budgetConfig}
            creativeConfig={creativeConfig}
            campaigns={metaAssets?.campaigns || []}
            launchAsPaused={launchAsPaused}
            onLaunchAsPausedChange={setLaunchAsPaused}
          />
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200/80 pt-6">
        <div>
          {currentStep > 0 && (
            <button
              onClick={handleBack}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Back
            </button>
          )}
        </div>
        <button
          onClick={currentStep === STEPS.length - 1 ? handleLaunch : handleNext}
          disabled={isSubmitting}
          className={cn(
            'rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-colors',
            isSubmitting && 'cursor-not-allowed opacity-70',
            currentStep === STEPS.length - 1
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/20 hover:from-emerald-700 hover:to-teal-700'
              : 'bg-blue-600 shadow-blue-500/20 hover:bg-blue-700'
          )}
        >
          {currentStep === STEPS.length - 1
            ? isSubmitting
              ? 'Launching...'
              : launchAsPaused
                ? 'Launch as Paused'
                : 'Launch to Meta'
            : 'Next'}
        </button>
      </div>
    </div>
  );
}
