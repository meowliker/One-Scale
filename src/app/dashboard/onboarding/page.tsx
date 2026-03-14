'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store,
  BarChart3,
  Settings,
  Code2,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { useStoreStore } from '@/stores/storeStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { cn } from '@/lib/utils';
import { fadeInUp, staggerContainer, ease } from '@/lib/motion';

// ── Step definitions ────────────────────────────────────────────────────────

interface OnboardingStep {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  skippable: boolean;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'shopify',
    title: 'Connect Shopify',
    subtitle: 'Link your Shopify store to sync orders, products & revenue',
    icon: Store,
    skippable: false,
  },
  {
    id: 'meta',
    title: 'Connect Meta Ads',
    subtitle: 'Connect your Facebook & Instagram ad accounts',
    icon: BarChart3,
    skippable: true,
  },
  {
    id: 'configure',
    title: 'Configure Store',
    subtitle: 'Review auto-detected settings for your store',
    icon: Settings,
    skippable: true,
  },
  {
    id: 'pixel',
    title: 'Install Tracking Pixel',
    subtitle: 'Enable first-party attribution for accurate tracking',
    icon: Code2,
    skippable: true,
  },
];

// ── Animation variants ──────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease },
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.98,
    transition: { duration: 0.25, ease },
  },
};

const checkVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 500,
      damping: 25,
      delay: 0.1,
    },
  },
};

// ── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({
  steps,
  currentStep,
  completedSteps,
}: {
  steps: OnboardingStep[];
  currentStep: number;
  completedSteps: Set<string>;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.has(step.id);
        const isCurrent = index === currentStep;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center gap-2">
            <motion.div
              className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors duration-300',
                isCompleted
                  ? 'border-emerald-500 bg-emerald-500'
                  : isCurrent
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-surface'
              )}
              animate={isCurrent ? { scale: [1, 1.06, 1] } : {}}
              transition={
                isCurrent
                  ? { repeat: Infinity, duration: 2.5, ease: 'easeInOut' }
                  : {}
              }
            >
              {isCompleted ? (
                <motion.div
                  variants={checkVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <Check className="h-4.5 w-4.5 text-white" />
                </motion.div>
              ) : (
                <Icon
                  className={cn(
                    'h-4.5 w-4.5',
                    isCurrent ? 'text-primary' : 'text-text-muted'
                  )}
                />
              )}
            </motion.div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-8 rounded-full transition-colors duration-300',
                  isCompleted ? 'bg-emerald-500' : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Connect Shopify ─────────────────────────────────────────────────

function ConnectShopifyStep({
  storeId,
  onComplete,
}: {
  storeId: string;
  onComplete: () => void;
}) {
  const [shopDomain, setShopDomain] = useState('');
  const isShopifyConnected = useConnectionStore((s) => s.isShopifyConnected());

  const handleConnect = useCallback(() => {
    if (!shopDomain.trim()) return;
    const domain = shopDomain.includes('.myshopify.com')
      ? shopDomain.trim()
      : `${shopDomain.trim()}.myshopify.com`;
    window.location.href = `/api/auth/shopify?storeId=${encodeURIComponent(storeId)}&shop=${encodeURIComponent(domain)}`;
  }, [shopDomain, storeId]);

  if (isShopifyConnected) {
    return (
      <div className="text-center py-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"
        >
          <Check className="h-8 w-8 text-emerald-500" />
        </motion.div>
        <h3 className="text-lg font-semibold text-text-primary">
          Shopify Connected
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Your store is syncing orders and products.
        </p>
        <button
          onClick={onComplete}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-primary">
          Shopify Store Domain
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              placeholder="your-store"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-text-muted">
              .myshopify.com
            </span>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Enter your Shopify store domain (e.g., my-brand or my-brand.myshopify.com)
        </p>
      </div>

      <button
        onClick={handleConnect}
        disabled={!shopDomain.trim()}
        className={cn(
          'w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-all active:scale-[0.98]',
          shopDomain.trim()
            ? 'bg-[#96bf48] text-white hover:brightness-110 shadow-sm'
            : 'bg-surface-hover text-text-muted cursor-not-allowed'
        )}
      >
        <Store className="h-4 w-4" />
        Connect Shopify
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Step 2: Connect Meta ────────────────────────────────────────────────────

function ConnectMetaStep({
  storeId,
  onComplete,
  onSkip,
}: {
  storeId: string;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const isMetaConnected = useConnectionStore((s) => s.isMetaConnected());

  if (isMetaConnected) {
    return (
      <div className="text-center py-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"
        >
          <Check className="h-8 w-8 text-emerald-500" />
        </motion.div>
        <h3 className="text-lg font-semibold text-text-primary">
          Meta Ads Connected
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Your ad accounts are linked and syncing data.
        </p>
        <button
          onClick={onComplete}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const handleConnect = () => {
    window.location.href = `/api/auth/meta?storeId=${encodeURIComponent(storeId)}`;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-surface-hover/50 p-4">
          <h4 className="text-sm font-medium text-text-primary mb-1">
            What you will get
          </h4>
          <ul className="space-y-1.5 text-xs text-text-secondary">
            <li className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary" />
              Real-time campaign performance metrics
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary" />
              Ad spend tracking across all accounts
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary" />
              ROAS and attribution analytics
            </li>
          </ul>
        </div>
      </div>

      <button
        onClick={handleConnect}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-6 py-3 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] shadow-sm"
      >
        <BarChart3 className="h-4 w-4" />
        Connect Meta Ads
        <ExternalLink className="h-3.5 w-3.5" />
      </button>

      <button
        onClick={onSkip}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-6 py-2.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        <SkipForward className="h-3.5 w-3.5" />
        Skip for now
      </button>
    </div>
  );
}

// ── Step 3: Configure Store ─────────────────────────────────────────────────

function ConfigureStoreStep({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [timezone, setTimezone] = useState('America/New_York');
  const [currency, setCurrency] = useState('USD');

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];

  const currencies = [
    { code: 'USD', label: 'US Dollar ($)' },
    { code: 'EUR', label: 'Euro (\u20AC)' },
    { code: 'GBP', label: 'British Pound (\u00A3)' },
    { code: 'CAD', label: 'Canadian Dollar (C$)' },
    { code: 'AUD', label: 'Australian Dollar (A$)' },
    { code: 'INR', label: 'Indian Rupee (\u20B9)' },
    { code: 'JPY', label: 'Japanese Yen (\u00A5)' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          Auto-detected from your Shopify store. Override if needed.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-primary">
            Currency
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none"
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={onComplete}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] shadow-sm"
      >
        Save & Continue
        <ChevronRight className="h-4 w-4" />
      </button>

      <button
        onClick={onSkip}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-6 py-2.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        <SkipForward className="h-3.5 w-3.5" />
        Skip for now
      </button>
    </div>
  );
}

// ── Step 4: Install Pixel ───────────────────────────────────────────────────

function InstallPixelStep({
  storeId,
  onComplete,
  onSkip,
}: {
  storeId: string;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInstall = useCallback(async () => {
    if (installing) return;
    setInstalling(true);
    setError(null);
    try {
      const res = await fetch('/api/shopify/register-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || 'Installation failed'
        );
      }
      setInstalled(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to install pixel'
      );
    } finally {
      setInstalling(false);
    }
  }, [storeId, installing]);

  if (installed) {
    return (
      <div className="text-center py-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"
        >
          <Check className="h-8 w-8 text-emerald-500" />
        </motion.div>
        <h3 className="text-lg font-semibold text-text-primary">
          Pixel Installed
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          First-party tracking is active. Attribution data will start flowing
          shortly.
        </p>
        <button
          onClick={onComplete}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-surface-hover/50 p-4">
          <h4 className="text-sm font-medium text-text-primary mb-1">
            Why install a pixel?
          </h4>
          <ul className="space-y-1.5 text-xs text-text-secondary">
            <li className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary" />
              First-party tracking bypasses ad blockers
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary" />
              Accurate order attribution to ad campaigns
            </li>
            <li className="flex items-center gap-2">
              <div className="h-1 w-1 rounded-full bg-primary" />
              One-click install directly to your Shopify theme
            </li>
          </ul>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-500 font-medium">{error}</p>
        </div>
      )}

      <button
        onClick={handleInstall}
        disabled={installing}
        className={cn(
          'w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-medium transition-all active:scale-[0.98] shadow-sm',
          installing
            ? 'bg-surface-hover text-text-muted cursor-not-allowed'
            : 'bg-primary text-white hover:brightness-110'
        )}
      >
        {installing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Installing...
          </>
        ) : (
          <>
            <Code2 className="h-4 w-4" />
            Install Pixel
          </>
        )}
      </button>

      <button
        onClick={onSkip}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-6 py-2.5 text-sm text-text-muted hover:text-text-secondary transition-colors"
      >
        <SkipForward className="h-3.5 w-3.5" />
        Skip for now
      </button>
    </div>
  );
}

// ── Main onboarding page ────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(
    new Set()
  );

  const storeId = activeStoreId || 'default';

  const markComplete = useCallback(
    (stepId: string) => {
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        next.add(stepId);
        return next;
      });
    },
    []
  );

  const goNext = useCallback(() => {
    const step = STEPS[currentStep];
    markComplete(step.id);
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      router.push('/dashboard/summary');
    }
  }, [currentStep, markComplete, router]);

  const skipStep = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      router.push('/dashboard/summary');
    }
  }, [currentStep, router]);

  const isLastStep = currentStep === STEPS.length - 1;
  const allComplete =
    completedSteps.size === STEPS.length ||
    (isLastStep && completedSteps.has(STEPS[STEPS.length - 1].id));
  const step = STEPS[currentStep];
  const Icon = step.icon;

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="w-full max-w-lg space-y-8"
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center space-y-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            Welcome to OneScale
          </h1>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Let&apos;s get your store connected in just a few minutes. You can
            always change these settings later.
          </p>
        </motion.div>

        {/* Step indicator */}
        <motion.div variants={fadeInUp}>
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            completedSteps={completedSteps}
          />
        </motion.div>

        {/* Step card */}
        <motion.div variants={fadeInUp}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step.id}
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="apple-card rounded-2xl border border-border bg-surface p-8"
            >
              {/* Step header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {step.title}
                  </h2>
                  <p className="text-xs text-text-muted">{step.subtitle}</p>
                </div>
              </div>

              {/* Step content */}
              {step.id === 'shopify' && (
                <ConnectShopifyStep storeId={storeId} onComplete={goNext} />
              )}
              {step.id === 'meta' && (
                <ConnectMetaStep
                  storeId={storeId}
                  onComplete={goNext}
                  onSkip={skipStep}
                />
              )}
              {step.id === 'configure' && (
                <ConfigureStoreStep onComplete={goNext} onSkip={skipStep} />
              )}
              {step.id === 'pixel' && (
                <InstallPixelStep
                  storeId={storeId}
                  onComplete={goNext}
                  onSkip={skipStep}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Step counter + Go to Dashboard */}
        <motion.div
          variants={fadeInUp}
          className="flex items-center justify-between"
        >
          <span className="text-xs text-text-muted">
            Step {currentStep + 1} of {STEPS.length}
          </span>

          {allComplete && (
            <motion.button
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => router.push('/dashboard/summary')}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110 active:scale-[0.98] shadow-sm"
            >
              <Sparkles className="h-4 w-4" />
              Go to Dashboard
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
