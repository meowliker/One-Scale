'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  TrendingUp,
  Zap,
  Trophy,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  BarChart2,
  RefreshCw,
  ArrowRight,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActiveTest, TestAd } from '@/types/creativeLaunch';

interface Stage5MonitorProps {
  activeTests: ActiveTest[];
  launchSuccess: boolean;
  onNewBatch: () => void;
}

// ── Animated count-up number ─────────────────────────────────────────────────
function CountUp({ target, prefix = '', suffix = '', decimals = 0 }: { target: number; prefix?: string; suffix?: string; decimals?: number }) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const duration = 1200;

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * target);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  const display = value.toFixed(decimals);
  return <>{prefix}{display}{suffix}</>;
}

// ── Status badge ─────────────────────────────────────────────────────────────
const AD_STATUS_CONFIG: Record<TestAd['status'], { label: string; className: string; icon: React.ReactNode }> = {
  running: {
    label: 'Running',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    icon: <Zap className="h-2.5 w-2.5" />,
  },
  paused_day3: {
    label: 'Paused Day 3',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: <Clock className="h-2.5 w-2.5" />,
  },
  killed: {
    label: 'Killed',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
    icon: <XCircle className="h-2.5 w-2.5" />,
  },
  winner: {
    label: 'Winner ★',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: <Star className="h-2.5 w-2.5 fill-current" />,
  },
  scale_candidate: {
    label: 'Scale →',
    className: 'bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 border-purple-500/30',
    icon: <ArrowRight className="h-2.5 w-2.5" />,
  },
};

function AdStatusBadge({ status }: { status: TestAd['status'] }) {
  const config = AD_STATUS_CONFIG[status];
  return (
    <motion.span
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
        config.className
      )}
    >
      {config.icon}
      {config.label}
    </motion.span>
  );
}

// ── ROAS bar ─────────────────────────────────────────────────────────────────
function RoasBar({ roas, maxRoas }: { roas: number; maxRoas: number }) {
  const fraction = maxRoas > 0 ? Math.min(roas / maxRoas, 1) : 0;
  const widthPct = `${(fraction * 100).toFixed(1)}%`;
  const isPositive = roas >= 1.0;

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/50">
      <motion.div
        className={cn(
          'h-full rounded-full',
          isPositive
            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
            : 'bg-gradient-to-r from-red-500 to-red-400'
        )}
        initial={{ width: 0 }}
        animate={{ width: widthPct }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
      />
    </div>
  );
}

// ── Ad row ───────────────────────────────────────────────────────────────────
function AdRow({ ad, maxRoas, index }: { ad: TestAd; maxRoas: number; index: number }) {
  const roasPositive = ad.roas >= 1.0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150',
        ad.status === 'killed'
          ? 'border-red-500/10 bg-red-500/5 opacity-60'
          : ad.status === 'winner'
          ? 'border-emerald-500/20 bg-emerald-500/5'
          : ad.status === 'scale_candidate'
          ? 'border-purple-500/20 bg-purple-500/5'
          : 'border-border bg-surface-hover'
      )}
    >
      {/* Thumbnail */}
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-border/50">
        {ad.thumbnailUrl ? (
          <img src={ad.thumbnailUrl} alt={ad.creativeName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <BarChart2 className="h-4 w-4 text-text-muted/30" />
          </div>
        )}
      </div>

      {/* Creative name + ROAS bar */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-[11px] font-semibold text-text-primary">{ad.creativeName}</p>
        <RoasBar roas={ad.roas} maxRoas={maxRoas} />
      </div>

      {/* ROAS value */}
      <div className="flex-shrink-0 text-right">
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            roasPositive ? 'text-emerald-400' : 'text-red-400'
          )}
        >
          {ad.roas.toFixed(2)}x
        </span>
        <p className="text-[9px] text-text-muted">ROAS</p>
      </div>

      {/* Spend */}
      <div className="flex-shrink-0 text-right">
        <span className="text-xs font-semibold text-text-secondary tabular-nums">
          ${ad.spend.toFixed(0)}
        </span>
        <p className="text-[9px] text-text-muted">spend</p>
      </div>

      {/* CTR */}
      <div className="hidden flex-shrink-0 text-right sm:block">
        <span className="text-xs font-semibold text-text-secondary tabular-nums">
          {(ad.ctr * 100).toFixed(2)}%
        </span>
        <p className="text-[9px] text-text-muted">CTR</p>
      </div>

      {/* CPA */}
      <div className="hidden flex-shrink-0 text-right sm:block">
        <span className="text-xs font-semibold text-text-secondary tabular-nums">
          ${ad.cpa.toFixed(2)}
        </span>
        <p className="text-[9px] text-text-muted">CPA</p>
      </div>

      {/* Status badge */}
      <div className="flex-shrink-0">
        <AdStatusBadge status={ad.status} />
      </div>
    </motion.div>
  );
}

// ── Day progress bar ─────────────────────────────────────────────────────────
function DayProgress({ dayNumber, totalDays }: { dayNumber: number; totalDays: number }) {
  const progress = totalDays > 0 ? Math.min(dayNumber / totalDays, 1) : 0;
  const checkpoints = [3, 7];

  return (
    <div className="relative py-3">
      {/* Track */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border/50">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>

      {/* Checkpoint markers */}
      {checkpoints.map((cp) => {
        if (cp > totalDays) return null;
        const pct = (cp / totalDays) * 100;
        const passed = dayNumber >= cp;
        return (
          <div
            key={cp}
            className="absolute top-[6px] -translate-x-1/2 -translate-y-[3px]"
            style={{ left: `${pct}%` }}
          >
            <div
              className={cn(
                'h-3 w-3 rounded-full border-2 shadow-sm',
                passed
                  ? 'border-purple-500 bg-purple-500'
                  : 'border-border bg-surface'
              )}
            />
            <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[9px] text-text-muted">
              Day {cp}
            </span>
          </div>
        );
      })}

      {/* Current position marker */}
      <div
        className="absolute top-[6px] -translate-x-1/2 -translate-y-[3px]"
        style={{ left: `${progress * 100}%` }}
      >
        <motion.div
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="h-3 w-3 rounded-full border-2 border-blue-400 bg-blue-500 shadow shadow-blue-500/50"
        />
      </div>
    </div>
  );
}

// ── Test status badge ─────────────────────────────────────────────────────────
const TEST_STATUS_CONFIG: Record<ActiveTest['status'], { label: string; className: string }> = {
  running: { label: 'Running', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  day3_checked: { label: 'Day 3 Checked', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  completed: { label: 'Completed', className: 'bg-surface text-text-muted border-border' },
  winner_found: { label: 'Winner Found', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

// ── Test card ────────────────────────────────────────────────────────────────
function TestCard({ test, index }: { test: ActiveTest; index: number }) {
  const maxRoas = Math.max(...test.ads.map((a) => a.roas), 0.01);
  const statusConfig = TEST_STATUS_CONFIG[test.status];
  const day3Complete = test.dayNumber >= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1, ease: [0.25, 0.1, 0.25, 1] }}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      {/* Card header */}
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        {/* Product image */}
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-border/50">
          {test.productImage ? (
            <img src={test.productImage} alt={test.productName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-lg text-text-muted/30">
              📦
            </div>
          )}
        </div>

        {/* Product name + campaign */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="truncate text-sm font-bold text-text-primary">{test.productName}</p>
            {/* Day pill */}
            <span className="inline-flex items-center rounded-full bg-surface-hover border border-border px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
              Day {test.dayNumber} of {test.totalDays}
            </span>
            {/* Status */}
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                statusConfig.className
              )}
            >
              {statusConfig.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-text-muted">{test.campaignName}</p>
        </div>

        {/* Total spend */}
        <div className="flex-shrink-0 text-right">
          <div className="flex items-center gap-1 text-sm font-bold text-text-primary tabular-nums">
            <DollarSign className="h-3.5 w-3.5 text-text-muted" />
            {test.totalSpend.toFixed(0)}
          </div>
          <p className="text-[9px] text-text-muted">total spend</p>
        </div>
      </div>

      {/* Day progress */}
      <div className="border-b border-border px-4 pb-4 pt-2">
        <DayProgress dayNumber={test.dayNumber} totalDays={test.totalDays} />
      </div>

      {/* Ad rows */}
      <div className="space-y-1.5 p-4">
        {test.ads.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-muted">No ads in this test</p>
        ) : (
          test.ads.map((ad, i) => (
            <AdRow key={ad.id} ad={ad} maxRoas={maxRoas} index={i} />
          ))
        )}
      </div>

      {/* Rule engine status footer */}
      <div className="flex items-center gap-2 border-t border-border bg-surface-hover px-4 py-2.5">
        {day3Complete ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
            <span className="text-[11px] text-text-muted">
              Day 3 check: <span className="font-semibold text-emerald-400">Complete ✓</span>
            </span>
          </>
        ) : (
          <>
            <Clock className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
            <span className="text-[11px] text-text-muted">
              Next check in{' '}
              <span className="font-semibold text-text-secondary">
                {3 - test.dayNumber} day{3 - test.dayNumber !== 1 ? 's' : ''}
              </span>
            </span>
          </>
        )}
      </div>
    </motion.div>
  );
}

// ── Stats bar ────────────────────────────────────────────────────────────────
interface StatsBarProps {
  activeTests: ActiveTest[];
}

function StatsBar({ activeTests }: StatsBarProps) {
  const allAds = activeTests.flatMap((t) => t.ads);
  const adsRunning = allAds.filter((a) => a.status === 'running').length;
  const adsPausedDay3 = allAds.filter((a) => a.status === 'paused_day3').length;
  const scaleCandidates = allAds.filter((a) => a.status === 'scale_candidate').length;
  const winners = allAds.filter((a) => a.status === 'winner').length;

  const stats = [
    {
      label: 'Active Tests',
      value: activeTests.length,
      icon: <BarChart2 className="h-4 w-4" />,
      accent: 'text-blue-400',
      bgAccent: 'bg-blue-500/10 border-blue-500/20',
    },
    {
      label: 'Ads Running',
      value: adsRunning,
      icon: <Zap className="h-4 w-4" />,
      accent: 'text-emerald-400',
      bgAccent: 'bg-emerald-500/10 border-emerald-500/20',
    },
    {
      label: 'Paused (Day 3)',
      value: adsPausedDay3,
      icon: <Clock className="h-4 w-4" />,
      accent: 'text-amber-400',
      bgAccent: 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Scale Candidates',
      value: scaleCandidates,
      icon: <TrendingUp className="h-4 w-4" />,
      accent: 'text-purple-400',
      bgAccent: 'bg-purple-500/10 border-purple-500/20',
    },
    {
      label: 'Winners',
      value: winners,
      icon: <Trophy className="h-4 w-4" />,
      accent: 'text-yellow-400',
      bgAccent: 'bg-yellow-500/10 border-yellow-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.07, ease: [0.25, 0.1, 0.25, 1] }}
          className={cn(
            'flex items-center gap-3 rounded-xl border p-3',
            stat.bgAccent
          )}
        >
          <div className={cn('flex-shrink-0', stat.accent)}>{stat.icon}</div>
          <div className="min-w-0">
            <div className={cn('text-xl font-bold tabular-nums', stat.accent)}>
              <CountUp target={stat.value} />
            </div>
            <p className="truncate text-[10px] text-text-muted">{stat.label}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Success banner ────────────────────────────────────────────────────────────
function SuccessBanner({ totalAds }: { totalAds: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  const checkItems = [
    `${totalAds} ads are now live on Meta Ads Manager`,
    'ClickUp tasks updated to "Testing"',
    'Monitoring activated — rule engine is watching',
  ];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 via-surface to-surface shadow-xl shadow-emerald-500/10"
          style={{
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Top shimmer bar */}
          <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />

          <div className="px-6 py-5">
            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 bg-clip-text text-3xl font-extrabold text-transparent"
            >
              🚀 Launch Successful!
            </motion.h2>

            {/* Check items with stagger */}
            <div className="mt-4 space-y-2">
              {checkItems.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.3 + i * 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="flex items-center gap-2.5"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 25,
                      delay: 0.35 + i * 0.2,
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                  </motion.div>
                  <span className="text-sm text-text-secondary">{item}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function Stage5Monitor({ activeTests, launchSuccess, onNewBatch }: Stage5MonitorProps) {
  const isFirstRender = useRef(true);
  const [showSuccess] = useState(() => launchSuccess);
  const totalAds = activeTests.flatMap((t) => t.ads).length;

  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Live Test Monitor</h2>
          <p className="mt-1 text-sm text-text-muted">
            Real-time performance across all active creative tests
          </p>
        </div>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          className="flex-shrink-0"
        >
          <RefreshCw className="h-4 w-4 text-text-muted/50" />
        </motion.div>
      </div>

      {/* Success banner — only on first render when launchSuccess is true */}
      {showSuccess && <SuccessBanner totalAds={totalAds} />}

      {/* Stats bar */}
      <StatsBar activeTests={activeTests} />

      {/* Test cards grid */}
      {activeTests.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface py-20 text-center"
        >
          <AlertTriangle className="h-10 w-10 text-text-muted/30" />
          <div>
            <p className="text-sm font-semibold text-text-secondary">No active tests</p>
            <p className="mt-1 text-xs text-text-muted">Launch a batch to start monitoring</p>
          </div>
        </motion.div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {activeTests.map((test, i) => (
            <TestCard key={test.id} test={test} index={i} />
          ))}
        </div>
      )}

      {/* Launch new batch CTA */}
      <div className="flex justify-center pt-2">
        <motion.button
          onClick={onNewBatch}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 dark:shadow-purple-600/25 dark:hover:shadow-purple-600/40"
        >
          <Rocket className="h-4 w-4" />
          Launch New Batch
        </motion.button>
      </div>
    </div>
  );
}
