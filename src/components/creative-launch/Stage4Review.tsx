'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  Check,
  Building2,
  Target,
  DollarSign,
  Calendar,
  ChevronDown,
  AlertCircle,
  Zap,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LaunchBatch, ClickUpCreativeSet } from '@/types/creativeLaunch';

// ── Count-up hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return value;
}

// ── Stat Pill ─────────────────────────────────────────────────────────────────

interface StatPillProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delay?: number;
}

function StatPill({ icon, label, value, prefix = '', suffix = '', delay = 0 }: StatPillProps) {
  const displayed = useCountUp(value, 600);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex flex-1 flex-col items-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-400">
        {icon}
      </div>
      <p className="text-lg font-bold tabular-nums text-text-primary">
        {prefix}{displayed.toLocaleString()}{suffix}
      </p>
      <p className="text-[11px] text-text-muted">{label}</p>
    </motion.div>
  );
}

// ── Rules section ─────────────────────────────────────────────────────────────

interface RulesSectionProps {
  rulesEnabled: boolean;
  onToggle: (v: boolean) => void;
}

function RulesSection({ rulesEnabled, onToggle }: RulesSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.25 }}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold text-text-primary">Auto-Management Rules Active</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              rulesEnabled
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-border text-text-muted'
            )}
          >
            {rulesEnabled ? 'ON' : 'OFF'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle switch */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(!rulesEnabled);
            }}
            className={cn(
              'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
              rulesEnabled ? 'bg-emerald-500' : 'bg-border'
            )}
          >
            <motion.span
              animate={{ x: rulesEnabled ? 16 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md"
            />
          </button>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-text-muted transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="rules-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-border px-4 pb-4 pt-3">
              {/* Day 3 rule */}
              <div className="flex items-start gap-3 rounded-lg border border-red-400/20 bg-red-500/5 px-3 py-2.5">
                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-bold text-red-400">
                  3
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-red-400">Day 3 Check</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    Pause ads with <span className="font-semibold text-red-400">ROAS &lt; 1.0</span>
                  </p>
                </div>
              </div>

              {/* Day 7 rule */}
              <div className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400">
                  7
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-blue-400">Day 7 Decision</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                      Kill if ROAS &lt; 1.0
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                      Keep if ROAS &gt; 1.0
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                      <Trophy className="h-2.5 w-2.5" />
                      Flag Scale if ROAS &gt; 1.3
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Batch Review Card ─────────────────────────────────────────────────────────

interface BatchReviewCardProps {
  batch: LaunchBatch;
  clickupCreatives: ClickUpCreativeSet[];
  index: number;
  launched: boolean;
}

function BatchReviewCard({ batch, clickupCreatives, index, launched }: BatchReviewCardProps) {
  const batchCreatives = clickupCreatives.filter((c) => batch.creativeIds.includes(c.id));
  const totalSpend = batch.dailyBudget * batch.testDuration;
  const clickupCount = batchCreatives.filter((c) => c.taskId).length;

  // Find selected primary text snippet
  // (We just display creatives and batch info here; copy comes from batch itself)
  const copySnippet = batch.selectedPrimaryTextId
    ? `Selected copy ID: ${batch.selectedPrimaryTextId}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className="relative overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      {/* Launched success overlay */}
      <AnimatePresence>
        {launched && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: index * 0.15 }}
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-emerald-500/10 backdrop-blur-[1px]"
          >
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20, delay: index * 0.15 + 0.1 }}
              className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-400 bg-emerald-500/20 shadow-lg shadow-emerald-500/20"
            >
              <Check className="h-7 w-7 text-emerald-400" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {batch.productImage ? (
            <img
              src={batch.productImage}
              alt={batch.productName}
              className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-background text-xl">
              📦
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text-primary">{batch.productName}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {batchCreatives.slice(0, 4).map((c) => (
                <span
                  key={c.id}
                  className="truncate rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-text-muted"
                  style={{ maxWidth: '120px' }}
                >
                  {c.name}
                </span>
              ))}
              {batchCreatives.length > 4 && (
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-text-muted">
                  +{batchCreatives.length - 4} more
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {/* Campaign row */}
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
            <span className="text-[11px] text-text-muted">Campaign:</span>
            <span
              className={cn(
                'truncate text-[11px] font-medium',
                batch.campaignMode === 'existing' ? 'text-emerald-400' : 'text-blue-400'
              )}
            >
              {batch.campaignMode === 'existing'
                ? batch.existingCampaignName ?? 'Existing campaign'
                : batch.newCampaignName ?? 'New campaign'}
            </span>
            <span
              className={cn(
                'ml-auto flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                batch.campaignMode === 'existing'
                  ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-blue-500/15 text-blue-400'
              )}
            >
              {batch.campaignMode}
            </span>
          </div>

          {/* Ad set row */}
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
            <span className="text-[11px] text-text-muted">Ad Set:</span>
            <span className="truncate text-[11px] font-medium text-text-secondary">
              {batch.adsetMode === 'existing'
                ? batch.existingAdsetName ?? 'Existing ad set'
                : batch.adsetMode === 'isolated'
                ? '1 per creative (isolated)'
                : 'New ad set'}
            </span>
          </div>

          {/* Copy preview */}
          {copySnippet && (
            <div className="flex items-start gap-2">
              <Trophy className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
              <p className="line-clamp-2 text-[11px] italic text-text-muted">
                {copySnippet}
              </p>
            </div>
          )}

          {/* Budget breakdown */}
          <div className="flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
            <span className="text-[11px] text-text-muted">
              <span className="font-medium text-text-secondary">${batch.dailyBudget}/day</span>
              <span className="text-text-muted/70"> × {batch.testDuration} days = </span>
              <span className="font-semibold text-text-primary">${totalSpend} total</span>
            </span>
          </div>

          {/* Launch date */}
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-text-muted" />
            <span className="text-[11px] text-text-muted">
              Launch: <span className="font-medium text-text-secondary">{batch.launchDate}</span>
            </span>
          </div>
        </div>

        {/* Account pills */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            { icon: <Building2 className="h-2.5 w-2.5" />, value: batch.adAccountName },
            { icon: null, value: `Page: ${batch.pageName}` },
            { icon: null, value: `Pixel: ${batch.pixelId}` },
          ].map(({ icon, value }) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-text-muted"
            >
              {icon}
              <span className="max-w-[160px] truncate">{value}</span>
            </span>
          ))}
        </div>

        {/* ClickUp notice */}
        {clickupCount > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.1 + 0.25 }}
            className="mt-3 flex items-center gap-2 rounded-lg border border-purple-400/20 bg-purple-500/5 px-3 py-2"
          >
            <Check className="h-3 w-3 flex-shrink-0 text-purple-400" />
            <p className="text-[11px] text-purple-400">
              Will mark <span className="font-semibold">{clickupCount} task{clickupCount !== 1 ? 's' : ''}</span> → &apos;Testing&apos; on launch
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Stage4ReviewProps {
  batches: LaunchBatch[];
  clickupCreatives: ClickUpCreativeSet[];
  isLaunching: boolean;
  onBack: () => void;
  onLaunch: () => void;
}

export function Stage4Review({
  batches,
  clickupCreatives,
  isLaunching,
  onBack,
  onLaunch,
}: Stage4ReviewProps) {
  const [rulesEnabled, setRulesEnabled] = useState(true);
  const [launched, setLaunched] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived stats
  const totalProducts = batches.length;
  const totalCreatives = batches.reduce((sum, b) => sum + b.creativeIds.length, 0);
  const totalAdSets =
    batches.reduce((sum, b) => {
      if (b.adsetMode === 'isolated') return sum + b.creativeIds.length;
      return sum + 1;
    }, 0);
  const totalSpend = batches.reduce((sum, b) => sum + b.dailyBudget * b.testDuration, 0);
  const totalAds = batches.reduce((sum, b) => sum + b.creativeIds.length, 0);

  // Progress animation during launch
  useEffect(() => {
    if (isLaunching) {
      setProgress(0);
      const start = performance.now();
      const duration = 2000;

      progressRef.current = setInterval(() => {
        const elapsed = performance.now() - start;
        const pct = Math.min((elapsed / duration) * 100, 98);
        setProgress(pct);
        if (pct >= 98 && progressRef.current) {
          clearInterval(progressRef.current);
        }
      }, 16);
    } else if (!isLaunching && progress > 0) {
      // Complete progress and trigger success
      setProgress(100);
      setTimeout(() => setLaunched(true), 300);
    }

    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLaunching]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={isLaunching ? { rotate: [0, -15, 15, -10, 10, 0] } : {}}
            transition={isLaunching ? { duration: 0.6, repeat: Infinity, repeatDelay: 0.4 } : {}}
          >
            <Rocket className="h-7 w-7 text-blue-400" />
          </motion.div>
          <h2 className="text-2xl font-bold text-text-primary">Ready to Launch</h2>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Review your test batch before going live
        </p>
      </motion.div>

      {/* Summary stats */}
      <div className="flex gap-3">
        <StatPill
          icon={<Building2 className="h-4 w-4" />}
          label="Products"
          value={totalProducts}
          delay={0}
        />
        <StatPill
          icon={<Zap className="h-4 w-4" />}
          label="Creatives"
          value={totalCreatives}
          delay={0.06}
        />
        <StatPill
          icon={<Target className="h-4 w-4" />}
          label="Ad Sets"
          value={totalAdSets}
          delay={0.12}
        />
        <StatPill
          icon={<DollarSign className="h-4 w-4" />}
          label="Est. Total Spend"
          value={totalSpend}
          prefix="$"
          delay={0.18}
        />
      </div>

      {/* Batch review cards */}
      <div className="flex flex-col gap-4">
        {batches.map((batch, i) => (
          <BatchReviewCard
            key={batch.productId}
            batch={batch}
            clickupCreatives={clickupCreatives}
            index={i}
            launched={launched}
          />
        ))}
      </div>

      {/* Rules section */}
      <RulesSection rulesEnabled={rulesEnabled} onToggle={setRulesEnabled} />

      {/* Warning note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3"
      >
        <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-400" />
        <p className="text-xs text-amber-400">
          This will create{' '}
          <span className="font-semibold">{totalAds} ad{totalAds !== 1 ? 's' : ''}</span> on Meta
          Ads Manager. Review the details above before proceeding.
        </p>
      </motion.div>

      {/* Footer actions */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={isLaunching}
            className={cn(
              'rounded-xl border border-border px-5 py-3.5 text-sm font-medium text-text-secondary transition-colors',
              isLaunching
                ? 'cursor-not-allowed opacity-40'
                : 'hover:bg-surface-hover'
            )}
          >
            Back
          </button>

          {/* THE LAUNCH BUTTON */}
          <motion.button
            type="button"
            onClick={!isLaunching ? onLaunch : undefined}
            disabled={isLaunching}
            whileHover={
              !isLaunching
                ? {
                    scale: 1.02,
                    boxShadow:
                      '0 0 32px rgba(99, 102, 241, 0.5), 0 0 64px rgba(147, 51, 234, 0.25)',
                  }
                : undefined
            }
            whileTap={!isLaunching ? { scale: 0.97 } : undefined}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-2.5 overflow-hidden rounded-xl px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-all duration-200',
              isLaunching
                ? 'cursor-not-allowed bg-gradient-to-r from-blue-700 to-purple-700 opacity-80'
                : 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-blue-500/30 hover:shadow-blue-500/50'
            )}
          >
            {/* Shimmer on idle */}
            {!isLaunching && (
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
                className="absolute inset-0 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              />
            )}

            <AnimatePresence mode="wait">
              {isLaunching ? (
                <motion.div
                  key="launching"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white"
                  />
                  <span>Launching to Meta…</span>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5"
                >
                  <Rocket className="h-4 w-4" />
                  <span>Launch to Meta</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Progress bar */}
        <AnimatePresence>
          {(isLaunching || progress > 0) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <motion.div
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.1, ease: 'linear' }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                />
              </div>
              <p className="mt-1.5 text-center text-[11px] text-text-muted">
                {progress < 30
                  ? 'Connecting to Meta API…'
                  : progress < 60
                  ? 'Creating campaigns…'
                  : progress < 90
                  ? 'Uploading creatives…'
                  : 'Finalizing launch…'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
