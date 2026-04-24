'use client';

import { useState } from 'react';
import { X, Rocket } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import { WizardStepIndicator } from './launch/WizardStepIndicator';
import { LaunchStep1Campaign } from './launch/LaunchStep1Campaign';
import { LaunchStep2AdCopy } from './launch/LaunchStep2AdCopy';
import { LaunchStep3Settings } from './launch/LaunchStep3Settings';
import { LaunchStep4Review } from './launch/LaunchStep4Review';

const STEPS = ['Campaign', 'Ad Copy', 'Settings', 'Review & Launch'];

export function LaunchWizard() {
  const { activeStoreId } = useStoreStore();
  const {
    launchWizardOpen,
    closeLaunchWizard,
    launchStep,
    setLaunchStep,
    launchConfig,
    executeLaunch,
  } = useCreativeHubStore();

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!launchWizardOpen) return null;

  const currentStep = launchStep - 1; // Convert 1-based to 0-based for indicator
  const isScheduledLaunch = launchConfig.launchTime === 'scheduled';

  const handleBack = () => {
    if (launchStep > 1) {
      setLaunchStep((launchStep - 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleNext = () => {
    if (launchStep < 4) {
      // Step validation
      if (launchStep === 1 && !launchConfig.productProfileId) {
        toast.error('Select a product profile to continue.');
        return;
      }
      setLaunchStep((launchStep + 1) as 1 | 2 | 3 | 4);
    }
  };

  const handleLaunch = async () => {
    if (!activeStoreId) {
      toast.error('No active store selected.');
      return;
    }
    if (!launchConfig.productProfileId) {
      toast.error('Select a product profile first.');
      return;
    }

    setIsSubmitting(true);
    try {
      await executeLaunch(activeStoreId);
      toast.success(
        isScheduledLaunch
          ? `Creative test scheduled for ${launchConfig.scheduledDate || 'selected date'} ${launchConfig.scheduledTime || '09:00'}.`
          : launchConfig.launchStatus === 'ACTIVE'
            ? 'Creative test launched on Meta!'
            : 'Creative test created in paused mode.',
        { duration: 5000 }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to launch creative test';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
            <Rocket className="h-4 w-4 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Launch Creative Test</h1>
            <p className="text-xs text-slate-500">
              Step {launchStep} of 4 &middot; {STEPS[currentStep]}
            </p>
          </div>
        </div>
        <button
          onClick={closeLaunchWizard}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step Indicator */}
      <div className="border-b border-slate-100 px-6 py-3">
        <WizardStepIndicator currentStep={currentStep} steps={STEPS} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="min-h-[400px] rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-200/40 backdrop-blur">
            {launchStep === 1 && <LaunchStep1Campaign />}
            {launchStep === 2 && <LaunchStep2AdCopy />}
            {launchStep === 3 && <LaunchStep3Settings />}
            {launchStep === 4 && <LaunchStep4Review />}
          </div>
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="border-t border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            {launchStep > 1 && (
              <button
                onClick={handleBack}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={closeLaunchWizard}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            {launchStep < 4 ? (
              <button
                onClick={handleNext}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleLaunch}
                disabled={isSubmitting}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-colors',
                  isSubmitting
                    ? 'cursor-not-allowed bg-emerald-400 shadow-emerald-300/20'
                    : 'bg-emerald-600 shadow-emerald-500/20 hover:bg-emerald-700'
                )}
              >
                <Rocket className="h-4 w-4" />
                {isSubmitting
                  ? isScheduledLaunch
                    ? 'Scheduling...'
                    : 'Launching...'
                  : isScheduledLaunch
                    ? 'Schedule Test'
                    : 'Launch Test on Meta'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
