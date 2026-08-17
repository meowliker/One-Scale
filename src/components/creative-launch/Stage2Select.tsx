'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Play, ExternalLink, ChevronDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductProfile, ClickUpCreativeSet } from '@/types/creativeLaunch';

interface Stage2SelectProps {
  products: ProductProfile[];
  clickupCreatives: ClickUpCreativeSet[];
  selectedCreativeIds: string[];
  onToggle: (id: string) => void;
  onSelectAllForProduct: (productId: string) => void;
  onClearForProduct: (productId: string) => void;
  onBack: () => void;
  onProceed: () => void;
}

// ── Format badge ─────────────────────────────────────────────────────────────
const FORMAT_STYLES: Record<ClickUpCreativeSet['format'], string> = {
  video: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  image: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  carousel: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

function FormatBadge({ format }: { format: ClickUpCreativeSet['format'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
        FORMAT_STYLES[format]
      )}
    >
      {format}
    </span>
  );
}

// ── Creative card ─────────────────────────────────────────────────────────────
interface CreativeCardProps {
  creative: ClickUpCreativeSet;
  isSelected: boolean;
  onToggle: () => void;
}

function CreativeCard({ creative, isSelected, onToggle }: CreativeCardProps) {
  const formattedDate = new Date(creative.dateAdded).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onToggle}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-xl border bg-surface transition-all duration-200',
        isSelected
          ? 'border-blue-500/60 shadow-lg shadow-blue-500/10 dark:border-purple-500/60 dark:shadow-purple-600/10'
          : 'border-border hover:border-border/80 hover:shadow-md'
      )}
      style={
        isSelected
          ? {
              boxShadow:
                '0 0 0 2px rgba(59,130,246,0.35), 0 4px 16px rgba(59,130,246,0.12)',
            }
          : undefined
      }
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-surface-hover">
        {creative.thumbnailUrl ? (
          <img
            src={creative.thumbnailUrl}
            alt={creative.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800/60 to-slate-900/60">
            <Play className="h-8 w-8 text-text-muted/30" />
          </div>
        )}

        {/* Format badge — top left */}
        <div className="absolute left-2 top-2">
          <FormatBadge format={creative.format} />
        </div>

        {/* Play icon overlay for video */}
        {creative.format === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-80">
              <Play className="ml-0.5 h-4 w-4 fill-white text-white" />
            </div>
          </div>
        )}

        {/* Selected checkmark — top right corner */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute right-2 top-2"
            >
              <CheckCircle2 className="h-5 w-5 fill-blue-600 text-white drop-shadow dark:fill-purple-600" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selected overlay tint */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-blue-600/10 dark:bg-purple-600/10"
            />
          )}
        </AnimatePresence>
      </div>

      {/* Card body */}
      <div className="space-y-2 p-3">
        {/* Name */}
        <p className="truncate text-xs font-semibold text-text-primary">{creative.name}</p>

        {/* Hook */}
        <p className="truncate text-[11px] italic text-text-muted">{`"${creative.hook}"`}</p>

        {/* Angle pill */}
        <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-secondary">
          {creative.angle}
        </span>

        {/* Footer row */}
        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[10px] text-text-muted">{formattedDate}</span>
          <a
            href={creative.driveLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-500 hover:text-blue-400 dark:text-purple-400 dark:hover:text-purple-300"
          >
            Drive
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// ── Product section ───────────────────────────────────────────────────────────
interface ProductSectionProps {
  product: ProductProfile;
  creatives: ClickUpCreativeSet[];
  selectedCreativeIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

function ProductSection({
  product,
  creatives,
  selectedCreativeIds,
  onToggle,
  onSelectAll,
  onClear,
}: ProductSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const selectedCount = creatives.filter((c) => selectedCreativeIds.includes(c.id)).length;
  const allSelected = creatives.length > 0 && selectedCount === creatives.length;

  if (creatives.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-hover"
      >
        {/* Product thumbnail */}
        <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg bg-surface-hover">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-text-muted/30">
              📦
            </div>
          )}
        </div>

        {/* Product name + count */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{product.name}</p>
        </div>

        {/* Selected count */}
        <span className="flex-shrink-0 text-xs text-text-muted">
          <span className={cn('font-semibold', selectedCount > 0 ? 'text-text-primary' : '')}>
            {selectedCount}
          </span>
          /{creatives.length} selected
        </span>

        {/* Select All / Clear */}
        <div className="flex flex-shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {allSelected ? (
            <button
              onClick={onClear}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              Clear
            </button>
          ) : (
            <button
              onClick={onSelectAll}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-purple-400 dark:hover:bg-purple-500/10"
            >
              Select All
            </button>
          )}
        </div>

        {/* Chevron */}
        <motion.div
          animate={{ rotate: isExpanded ? 0 : -90 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex-shrink-0"
        >
          <ChevronDown className="h-4 w-4 text-text-muted" />
        </motion.div>
      </button>

      {/* Creative grid — animated expand/collapse */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: {
                  transition: {
                    staggerChildren: 0.06,
                    delayChildren: 0.04,
                  },
                },
              }}
              className="grid grid-cols-2 gap-3 p-4 pt-1 sm:grid-cols-3 lg:grid-cols-4"
            >
              {creatives.map((creative) => (
                <CreativeCard
                  key={creative.id}
                  creative={creative}
                  isSelected={selectedCreativeIds.includes(creative.id)}
                  onToggle={() => onToggle(creative.id)}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function Stage2Select({
  products,
  clickupCreatives,
  selectedCreativeIds,
  onToggle,
  onSelectAllForProduct,
  onClearForProduct,
  onBack,
  onProceed,
}: Stage2SelectProps) {
  // Group creatives by productId
  const creativesByProduct = (productId: string) =>
    clickupCreatives.filter((c) => c.productId === productId);

  // Products that actually have creatives
  const productsWithCreatives = products.filter(
    (p) => creativesByProduct(p.id).length > 0
  );

  const totalSelected = selectedCreativeIds.length;
  const selectedProductCount = productsWithCreatives.filter(
    (p) => creativesByProduct(p.id).some((c) => selectedCreativeIds.includes(c.id))
  ).length;

  const canProceed = totalSelected > 0;

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-text-primary">Select Creatives to Test</h2>
            <AnimatePresence>
              {totalSelected > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="inline-flex items-center rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-2.5 py-0.5 text-xs font-bold text-white shadow"
                >
                  {totalSelected} selected
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Choose which creatives to include in this launch batch
          </p>
        </div>

        {/* Back button */}
        <button
          onClick={onBack}
          className="flex-shrink-0 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          ← Back
        </button>
      </div>

      {/* Product sections */}
      <div className="flex flex-col gap-4">
        {productsWithCreatives.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface py-16 text-center">
            <Play className="h-10 w-10 text-text-muted/30" />
            <p className="text-sm text-text-muted">No creatives found. Sync ClickUp first.</p>
          </div>
        ) : (
          productsWithCreatives.map((product) => (
            <ProductSection
              key={product.id}
              product={product}
              creatives={creativesByProduct(product.id)}
              selectedCreativeIds={selectedCreativeIds}
              onToggle={onToggle}
              onSelectAll={() => onSelectAllForProduct(product.id)}
              onClear={() => onClearForProduct(product.id)}
            />
          ))
        )}
      </div>

      {/* Sticky bottom bar */}
      <AnimatePresence>
        {canProceed && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-4 border-t border-border bg-surface/90 px-6 py-4 backdrop-blur-md md:left-[var(--sidebar-width,240px)]"
          >
            <p className="text-sm text-text-secondary">
              <span className="font-semibold text-text-primary">{totalSelected} creative{totalSelected !== 1 ? 's' : ''}</span>{' '}
              selected across{' '}
              <span className="font-semibold text-text-primary">{selectedProductCount} product{selectedProductCount !== 1 ? 's' : ''}</span>
            </p>

            <motion.button
              onClick={onProceed}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 dark:shadow-purple-600/25 dark:hover:shadow-purple-600/40"
            >
              Configure
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
