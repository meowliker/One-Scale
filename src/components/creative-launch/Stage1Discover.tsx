'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Zap, ArrowRight, AlertCircle, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductProfile, ClickUpCreativeSet } from '@/types/creativeLaunch';

interface Stage1DiscoverProps {
  products: ProductProfile[];
  clickupCreatives: ClickUpCreativeSet[];
  isLoading: boolean;
  onProceed: () => void;
  discoverError?: string | null;
  notConnected?: boolean;
  notConfigured?: boolean;
}

// ── Skeleton card ───────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="aspect-[4/3] w-full bg-border/60" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-3/4 rounded bg-border/60" />
        <div className="h-3 w-1/2 rounded bg-border/40" />
        <div className="mt-3 h-5 w-1/3 rounded-full bg-border/50" />
        <div className="h-3 w-2/3 rounded bg-border/30" />
      </div>
    </div>
  );
}

// ── Product card ────────────────────────────────────────────────────────────
interface ProductCardProps {
  product: ProductProfile;
}

function ProductCard({ product }: ProductCardProps) {
  const hasCreatives = product.readyCreativesCount > 0;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        'group overflow-hidden rounded-xl border bg-surface shadow-sm transition-shadow duration-200 hover:shadow-md',
        hasCreatives
          ? 'border-border hover:border-blue-400/40 dark:hover:border-purple-500/40'
          : 'border-border opacity-60'
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-hover">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-4xl text-text-muted/30">📦</span>
          </div>
        )}

        {/* Confidence badge — top right overlay */}
        <div className="absolute right-2 top-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-600/90 to-purple-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow backdrop-blur-sm">
            <Zap className="h-2.5 w-2.5" />
            {product.confidence}% confidence
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-2 p-4">
        <div>
          <p className="truncate text-sm font-semibold text-text-primary">{product.name}</p>
          <p className="truncate text-[11px] text-text-muted">{product.store}</p>
        </div>

        {/* Creatives ready badge */}
        <div className="flex items-center gap-1.5">
          {hasCreatives ? (
            <>
              <motion.span
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="inline-block h-2 w-2 rounded-full bg-emerald-500"
              />
              <span className="inline-flex items-center rounded-full border border-emerald-400/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                {product.readyCreativesCount} creatives ready
              </span>
            </>
          ) : (
            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-text-muted">
              0 ready
            </span>
          )}
        </div>

        {/* Ad account */}
        <p className="truncate text-[11px] text-text-muted" title={product.adAccountName}>
          {product.adAccountName}
        </p>

        {/* Divider + winner copy count */}
        <div className="border-t border-border pt-2">
          <p className="text-[11px] text-text-muted">
            <span className="font-medium text-text-secondary">{product.winnerCopyLibrary.length}</span>{' '}
            winner cop{product.winnerCopyLibrary.length === 1 ? 'y' : 'ies'} in library
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function Stage1Discover({
  products,
  clickupCreatives,
  isLoading,
  onProceed,
  discoverError,
  notConnected,
  notConfigured,
}: Stage1DiscoverProps) {
  const [isSyncing, setIsSyncing] = useState(true);

  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => setIsSyncing(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const showSkeleton = isLoading || isSyncing;
  const productsWithCreatives = products.filter((p) => p.readyCreativesCount > 0);
  const totalCreatives = clickupCreatives.length;
  const canProceed = productsWithCreatives.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ClickUp not-connected / not-configured banner */}
      {(notConnected || notConfigured || discoverError) && !showSkeleton && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'flex items-start gap-3 rounded-xl border px-4 py-3',
            notConnected || notConfigured
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
          )}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {notConnected ? 'ClickUp not connected' : notConfigured ? 'ClickUp list not configured' : 'Error loading data'}
            </p>
            <p className="mt-0.5 text-[12px] opacity-80">{discoverError}</p>
            {(notConnected || notConfigured) && (
              <a
                href="/dashboard/settings/integrations"
                className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium underline underline-offset-2 hover:opacity-80"
              >
                <Settings className="h-3 w-3" />
                Go to Settings → Integrations
              </a>
            )}
          </div>
        </motion.div>
      )}

      {/* ClickUp sync status bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm"
      >
        <motion.div
          animate={isSyncing ? { rotate: 360 } : { rotate: 0 }}
          transition={isSyncing ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
        >
          <RefreshCw
            className={cn(
              'h-4 w-4 transition-colors duration-300',
              isSyncing ? 'text-blue-500 dark:text-purple-400' : notConnected ? 'text-amber-500' : 'text-emerald-500'
            )}
          />
        </motion.div>
        <span className="text-sm text-text-secondary">
          {isSyncing ? (
            <span className="text-blue-600 dark:text-purple-400">Syncing with ClickUp...</span>
          ) : notConnected ? (
            <span className="text-amber-600 dark:text-amber-400">ClickUp not connected</span>
          ) : (
            <>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">ClickUp synced</span>
              <span className="mx-2 text-border">•</span>
              <span className="font-medium text-text-primary">{totalCreatives} creatives found</span>
              <span className="mx-2 text-border">•</span>
              <span className="text-text-muted">Last updated just now</span>
            </>
          )}
        </span>
      </motion.div>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">What&apos;s Ready to Test?</h2>
        <p className="mt-1 text-sm text-text-muted">
          {showSkeleton
            ? 'Fetching creatives from ClickUp...'
            : `${productsWithCreatives.length} product${productsWithCreatives.length !== 1 ? 's' : ''} have creatives ready to launch`}
        </p>
      </div>

      {/* Product grid */}
      <AnimatePresence mode="wait">
        {showSkeleton ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          >
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </motion.div>
        ) : (
          <motion.div
            key="products"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.08,
                  delayChildren: 0.05,
                },
              },
            }}
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
          >
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary + CTA */}
      {!showSkeleton && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex flex-col items-center gap-4 pt-2"
        >
          <p className="text-sm text-text-muted">
            <span className="font-semibold text-text-primary">{productsWithCreatives.length}</span>{' '}
            product{productsWithCreatives.length !== 1 ? 's' : ''} have creatives ready to launch
          </p>

          <motion.button
            onClick={canProceed ? onProceed : undefined}
            disabled={!canProceed}
            whileHover={canProceed ? { scale: 1.03 } : undefined}
            whileTap={canProceed ? { scale: 0.97 } : undefined}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold text-white shadow-lg transition-shadow duration-200',
              canProceed
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-blue-500/25 hover:shadow-blue-500/40 dark:shadow-purple-600/25 dark:hover:shadow-purple-600/40'
                : 'cursor-not-allowed bg-border text-text-muted shadow-none'
            )}
          >
            Select Creatives
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
