'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useCampaignCreateStore } from '@/stores/campaignCreateStore';
import { useStoreStore } from '@/stores/storeStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { cn } from '@/lib/utils';
import { todayInTimezone } from '@/lib/timezone';
import { getCampaignCreateAnalysis } from '@/services/campaignCreateInsights';
import { getCampaignSetupOptions, publishCampaign } from '@/services/campaignPublish';
import type { CampaignObjective } from '@/types/campaign';
import { WizardStepIndicator } from './WizardStepIndicator';
import { ObjectiveStep } from './ObjectiveStep';
import { TargetingStep } from './TargetingStep';
import { BudgetScheduleStep } from './BudgetScheduleStep';
import { CreativeStep } from './CreativeStep';
import { ReviewStep } from './ReviewStep';

const STEPS = ['Objective', 'Targeting', 'Budget', 'Creative', 'Review'];

function parseRecommendedObjective(value: string | undefined): CampaignObjective | null {
  const objective = (value || '').split('•')[0]?.trim().toUpperCase();
  if (
    objective === 'CONVERSIONS' ||
    objective === 'TRAFFIC' ||
    objective === 'REACH' ||
    objective === 'ENGAGEMENT' ||
    objective === 'APP_INSTALLS' ||
    objective === 'VIDEO_VIEWS' ||
    objective === 'LEAD_GENERATION' ||
    objective === 'BRAND_AWARENESS'
  ) {
    return objective;
  }
  return null;
}

function normalizeHttpUrl(value: string | undefined): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`;
  return '';
}

export function CampaignCreateWizard() {
  const router = useRouter();
  const { activeStoreId, stores, fetchStores } = useStoreStore();
  const { refreshStatus } = useConnectionStore();
  const {
    currentStep,
    nextStep,
    prevStep,
    reset,
    creative,
    setCreative,
    setAnalysisLoading,
    setAnalysisError,
    setAnalysisData,
    analysisLoading,
    analysisError,
    objective,
    setObjective,
    targeting,
    setTargeting,
    budget,
    schedule,
    setSchedule,
    publishSettings,
    setPublishSettings,
    uploadedAsset,
    setSetupOptions,
    setSetupOptionsError,
    setSetupOptionsLoading,
  } = useCampaignCreateStore();
  const loadedStoreRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalysis() {
      if (stores.length === 0) {
        await fetchStores().catch(() => undefined);
      }
      const resolvedStoreId = activeStoreId || useStoreStore.getState().activeStoreId;
      if (!resolvedStoreId) {
        setAnalysisLoading(false);
        setSetupOptionsLoading(false);
        return;
      }

      if (loadedStoreRef.current === resolvedStoreId) return;
      loadedStoreRef.current = resolvedStoreId;

      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        void refreshStatus(resolvedStoreId).catch(() => undefined);
        const analysisData = await getCampaignCreateAnalysis();
        if (cancelled) return;

        setAnalysisData(analysisData);
        setSchedule({ startDate: todayInTimezone() });
        if (
          analysisData.recommendedTargeting &&
          targeting.interests.length === 0 &&
          targeting.locations.length <= 1
        ) {
          setTargeting({
            ageMin: analysisData.recommendedTargeting.ageMin,
            ageMax: analysisData.recommendedTargeting.ageMax,
            genders: analysisData.recommendedTargeting.genders,
            locations: analysisData.recommendedTargeting.locations,
            interests: analysisData.recommendedTargeting.interests,
          });
        }
        const bestCopy = analysisData.ourCopyOptions[0];
        if (bestCopy && !creative.headline && !creative.body) {
          setCreative({
            headline: bestCopy.headline,
            body: bestCopy.primaryText,
            ctaType: bestCopy.ctaType,
          });
        }
        if (!objective) {
          const recommended = analysisData.recommendedObjective ||
            parseRecommendedObjective(analysisData.winnerChips.objective?.value);
          if (recommended) {
            setObjective(recommended);
          }
        }
        const isDefaultCampaignName = /^Campaign \d{4}-\d{2}-\d{2}$/.test(publishSettings.campaignName);
        const isDefaultAdSetName = /^Ad Set \d{4}-\d{2}-\d{2}$/.test(publishSettings.adSetName);
        const isDefaultAdName = /^Ad \d{4}-\d{2}-\d{2}$/.test(publishSettings.adName);
        if (analysisData.recommendedNames) {
          setPublishSettings({
            campaignName:
              analysisData.recommendedNames.campaignName && isDefaultCampaignName
                ? `${analysisData.recommendedNames.campaignName} | New`
                : publishSettings.campaignName,
            adSetName:
              analysisData.recommendedNames.adSetName && isDefaultAdSetName
                ? `${analysisData.recommendedNames.adSetName} | Test`
                : publishSettings.adSetName,
            adName:
              analysisData.recommendedNames.adName && isDefaultAdName
                ? `${analysisData.recommendedNames.adName} | Variant`
                : publishSettings.adName,
          });
        }
        const shouldSetDestination =
          !publishSettings.destinationUrl ||
          publishSettings.destinationUrl === 'https://yourstore.com/product';
        const shouldSetUrlTags =
          !publishSettings.urlTags ||
          publishSettings.urlTags.includes('{{adset.name}}');
        const fallbackStoreDomainUrl = normalizeHttpUrl(
          useStoreStore.getState().stores.find((store) => store.id === resolvedStoreId)?.domain
        );
        if (analysisData.recommendedDestinationUrl || analysisData.recommendedUrlTags) {
          setPublishSettings({
            destinationUrl: shouldSetDestination
              ? (analysisData.recommendedDestinationUrl || fallbackStoreDomainUrl || publishSettings.destinationUrl)
              : publishSettings.destinationUrl,
            urlTags: shouldSetUrlTags
              ? (analysisData.recommendedUrlTags || publishSettings.urlTags)
              : publishSettings.urlTags,
          });
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load winner insights';
          setAnalysisError(message);
        }
      } finally {
        setAnalysisLoading(false);
      }
      if (cancelled) return;

      const activeStore = useStoreStore.getState().stores.find((store) => store.id === resolvedStoreId);
      const fallbackMetaAccount =
        activeStore?.adAccounts.find((account) => account.platform === 'meta' && account.isActive)?.accountId ||
        activeStore?.adAccounts.find((account) => account.platform === 'meta')?.accountId ||
        '';
      if (!publishSettings.accountId && fallbackMetaAccount) {
        setPublishSettings({ accountId: fallbackMetaAccount });
      }

      setSetupOptionsLoading(true);
      setSetupOptionsError(null);
      try {
        const setupData = await getCampaignSetupOptions(fallbackMetaAccount || undefined);
        if (!cancelled) {
          setSetupOptions(setupData);
          setSetupOptionsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Campaign setup options unavailable';
          setSetupOptionsError(message);
        }
      } finally {
        setSetupOptionsLoading(false);
      }
    }

    loadAnalysis();
    return () => {
      cancelled = true;
      setAnalysisLoading(false);
      setSetupOptionsLoading(false);
    };
    }, [
    activeStoreId,
    creative.body,
    creative.headline,
    fetchStores,
    stores.length,
    refreshStatus,
    objective,
    publishSettings.adName,
    publishSettings.adSetName,
    publishSettings.campaignName,
    publishSettings.accountId,
    publishSettings.destinationUrl,
    publishSettings.urlTags,
    setAnalysisData,
    setAnalysisError,
    setAnalysisLoading,
    setCreative,
    setObjective,
    setPublishSettings,
    setSchedule,
    setSetupOptions,
    setSetupOptionsError,
    setSetupOptionsLoading,
    setTargeting,
    targeting.interests.length,
    targeting.locations.length,
  ]);

  const handleLaunch = async () => {
    if (!objective) {
      toast.error('Select a campaign objective first.');
      return;
    }

    if (!publishSettings.accountId) {
      toast.error('Select an ad account before publishing.');
      return;
    }

    if (!publishSettings.pageId) {
      toast.error('Select a Facebook page before publishing.');
      return;
    }

    if (!publishSettings.destinationUrl) {
      toast.error('Enter a destination URL before publishing.');
      return;
    }

    if (!uploadedAsset) {
      toast.error('Upload a creative asset before publishing.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await publishCampaign({
        objective,
        targeting: {
          ...targeting,
          customAudiences: [],
        },
        budget,
        schedule,
        creative,
        settings: publishSettings,
        asset: uploadedAsset,
      });

      if (result.warnings.length > 0) {
        toast((t) => (
          <span>
            Created with warnings: {result.warnings[0]}
            <button className="ml-2 underline" onClick={() => toast.dismiss(t.id)}>
              close
            </button>
          </span>
        ));
      }

      toast.success(
        result.status === 'ACTIVE'
          ? 'Campaign published and active.'
          : 'Campaign created in paused mode.',
        { duration: 5000, icon: '🚀' }
      );
      reset();
      router.push('/dashboard/ads-manager');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish campaign';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 4) {
      handleLaunch();
    } else {
      nextStep();
    }
  };

  return (
    <div className="space-y-8">
      {(analysisLoading || analysisError) && (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-sm shadow-sm',
            analysisError
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-blue-200 bg-blue-50 text-blue-700'
          )}
        >
          {analysisError
            ? `Winner insights unavailable (${analysisError}). You can still continue manually.`
            : 'Loading last 30-day winners for objective, audience, creative, and copy...'}
        </div>
      )}

      <WizardStepIndicator currentStep={currentStep} steps={STEPS} />

      <div className="min-h-[400px] rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-200/40 backdrop-blur">
        {currentStep === 0 && <ObjectiveStep />}
        {currentStep === 1 && <TargetingStep />}
        {currentStep === 2 && <BudgetScheduleStep />}
        {currentStep === 3 && <CreativeStep />}
        {currentStep === 4 && <ReviewStep />}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200/80 pt-6">
        <div>
          {currentStep > 0 && (
            <button
              onClick={prevStep}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Back
            </button>
          )}
        </div>
        <button
          onClick={handleNext}
          disabled={isSubmitting}
          className={cn(
            'rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-colors',
            isSubmitting && 'cursor-not-allowed opacity-70',
            currentStep === 4
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-blue-600 hover:bg-blue-700'
          )}
        >
          {currentStep === 4
            ? (isSubmitting
              ? 'Publishing...'
              : (publishSettings.publishNow ? 'Create & Publish Campaign' : 'Create Paused Campaign'))
            : 'Next'}
        </button>
      </div>
    </div>
  );
}
