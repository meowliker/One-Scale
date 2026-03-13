'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Check,
  Trophy,
  Zap,
  DollarSign,
  Calendar,
  Target,
  Building2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  LaunchBatch,
  ProductProfile,
  ClickUpCreativeSet,
  MockCampaign,
  MockAdset,
  WinnerCopy,
} from '@/types/creativeLaunch';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getDefaultCampaignName(productName: string): string {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'short' });
  const year = now.getFullYear();
  return `Creative Test — ${productName} — ${month} ${year}`;
}

// ── Toggle Pill Group ─────────────────────────────────────────────────────────

interface TogglePillGroupProps<T extends string> {
  options: { value: T; label: string }[];
  selected: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

function TogglePillGroup<T extends string>({
  options,
  selected,
  onChange,
  size = 'md',
}: TogglePillGroupProps<T>) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border bg-background p-0.5">
      {options.map((opt) => (
        <motion.button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          whileTap={{ scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={cn(
            'flex-1 rounded-md font-medium transition-all duration-200',
            size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
            selected === opt.value
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-sm'
              : 'text-text-muted hover:text-text-secondary'
          )}
        >
          {opt.label}
        </motion.button>
      ))}
    </div>
  );
}

// ── Searchable Dropdown ───────────────────────────────────────────────────────

interface DropdownOption {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

interface SearchableDropdownProps {
  options: DropdownOption[];
  selectedId: string | undefined;
  onSelect: (id: string, label: string) => void;
  placeholder?: string;
}

function SearchableDropdown({
  options,
  selectedId,
  onSelect,
  placeholder = 'Select…',
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase())
  );
  const selected = options.find((o) => o.id === selectedId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs text-text-primary transition-colors hover:border-blue-400/50 focus:outline-none"
      >
        <span className={cn(!selected && 'text-text-muted')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 text-text-muted transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-xl"
          >
            <div className="border-b border-border p-2">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-md bg-background px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-text-muted">No results</p>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onSelect(opt.id, opt.label);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-hover',
                      opt.id === selectedId && 'bg-blue-500/10 text-blue-400'
                    )}
                  >
                    <span className="truncate text-text-primary">{opt.label}</span>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {opt.sublabel && (
                        <span className="text-[10px] text-text-muted">{opt.sublabel}</span>
                      )}
                      {opt.badge && (
                        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-500">
                          {opt.badge}
                        </span>
                      )}
                      {opt.id === selectedId && <Check className="h-3 w-3 text-blue-400" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

// ── Winner Copy Card ──────────────────────────────────────────────────────────

interface WinnerCopyCardProps {
  copy: WinnerCopy;
  isSelected: boolean;
  maxRoas: number;
  onSelect: () => void;
}

function WinnerCopyCard({ copy, isSelected, maxRoas, onSelect }: WinnerCopyCardProps) {
  const roasBarWidth = maxRoas > 0 ? Math.min((copy.roas / maxRoas) * 100, 100) : 0;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        'relative w-full rounded-lg border p-3 text-left transition-all duration-200',
        isSelected
          ? 'border-blue-500/60 bg-gradient-to-br from-blue-500/10 to-purple-500/10 shadow-sm shadow-blue-500/10'
          : 'border-border bg-surface hover:border-border/80 hover:bg-surface-hover'
      )}
    >
      {/* Selected indicator */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600"
          >
            <Check className="h-2.5 w-2.5 text-white" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary text snippet */}
      <p className="line-clamp-2 pr-6 text-[11px] leading-relaxed text-text-secondary">
        {copy.primaryText}
      </p>

      {/* Headline */}
      <p className="mt-1 truncate text-[10px] font-medium text-text-muted">
        {copy.headline}
      </p>

      {/* Meta row */}
      <div className="mt-2 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">
          <Trophy className="h-2.5 w-2.5" />
          {copy.roas.toFixed(2)}x ROAS
        </span>
        <span className="text-[10px] text-text-muted">
          ${copy.spend.toLocaleString()} spent
        </span>
        <span className="text-[10px] text-text-muted">{copy.daysRunning}d</span>
      </div>

      {/* ROAS bar */}
      <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-border/50">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${roasBarWidth}%` }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
        />
      </div>
    </motion.button>
  );
}

// ── Product Config Panel ──────────────────────────────────────────────────────

interface ProductConfigPanelProps {
  batch: LaunchBatch;
  product: ProductProfile;
  creatives: ClickUpCreativeSet[];
  availableCampaigns: MockCampaign[];
  availableAdsets: MockAdset[];
  onUpdate: (updates: Partial<LaunchBatch>) => void;
  index: number;
}

function ProductConfigPanel({
  batch,
  product,
  creatives,
  availableCampaigns,
  availableAdsets,
  onUpdate,
  index,
}: ProductConfigPanelProps) {
  const productCampaigns = availableCampaigns.filter(
    (c) => c.accountId === batch.adAccountId
  );
  const filteredAdsets = availableAdsets.filter(
    (a) => a.campaignId === batch.existingCampaignId
  );

  const maxRoas =
    product.winnerCopyLibrary.length > 0
      ? Math.max(...product.winnerCopyLibrary.map((c) => c.roas))
      : 1;

  const campaignOptions: DropdownOption[] = productCampaigns.map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: `$${c.spend}`,
    badge: `${c.roas}x`,
  }));

  const adsetOptions: DropdownOption[] = filteredAdsets.map((a) => ({
    id: a.id,
    label: a.name,
    sublabel: a.budget,
  }));

  // Hinted campaign for AI banner
  const hintCampaign = productCampaigns[0];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      {/* Panel header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-background text-lg">
            📦
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{batch.productName}</p>
          <p className="text-[11px] text-text-muted">
            {batch.creativeIds.length} creative{batch.creativeIds.length !== 1 ? 's' : ''} selected
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
          <Check className="h-2.5 w-2.5" />
          Auto-filled
        </span>
      </div>

      {/* Panel body — 2 columns */}
      <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
        {/* LEFT: Campaign Setup */}
        <div className="space-y-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <Target className="h-3 w-3" />
            Where to test
          </p>

          {/* Campaign mode toggle */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-text-secondary">Campaign</label>
            <TogglePillGroup
              options={[
                { value: 'existing', label: 'Existing Campaign' },
                { value: 'new', label: 'New Campaign' },
              ]}
              selected={batch.campaignMode}
              onChange={(v) => onUpdate({ campaignMode: v })}
            />
            <AnimatePresence mode="wait">
              {batch.campaignMode === 'existing' ? (
                <motion.div
                  key="existing-campaign"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <SearchableDropdown
                    options={campaignOptions}
                    selectedId={batch.existingCampaignId}
                    onSelect={(id, label) =>
                      onUpdate({
                        existingCampaignId: id,
                        existingCampaignName: label,
                        existingAdsetId: undefined,
                        existingAdsetName: undefined,
                      })
                    }
                    placeholder="Select campaign…"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="new-campaign"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <input
                    type="text"
                    value={batch.newCampaignName ?? getDefaultCampaignName(batch.productName)}
                    onChange={(e) => onUpdate({ newCampaignName: e.target.value })}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                    placeholder="Campaign name…"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Ad set mode toggle */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-text-secondary">Ad Set</label>
            <TogglePillGroup
              options={[
                { value: 'existing', label: 'Existing' },
                { value: 'new', label: 'New' },
                { value: 'isolated', label: 'Isolated' },
              ]}
              selected={batch.adsetMode}
              onChange={(v) => onUpdate({ adsetMode: v })}
              size="sm"
            />
            <AnimatePresence mode="wait">
              {batch.adsetMode === 'existing' && (
                <motion.div
                  key="existing-adset"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <SearchableDropdown
                    options={adsetOptions}
                    selectedId={batch.existingAdsetId}
                    onSelect={(id, label) =>
                      onUpdate({ existingAdsetId: id, existingAdsetName: label })
                    }
                    placeholder={
                      batch.existingCampaignId
                        ? adsetOptions.length === 0
                          ? 'No ad sets in this campaign'
                          : 'Select ad set…'
                        : 'Select a campaign first'
                    }
                  />
                </motion.div>
              )}
              {batch.adsetMode === 'isolated' && (
                <motion.div
                  key="isolated-note"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="rounded-lg border border-blue-400/20 bg-blue-500/5 px-3 py-2 text-[11px] text-blue-400">
                    1 ad set per creative — ideal for clean split testing
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Budget + Duration + Launch Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-[11px] font-medium text-text-secondary">
                <DollarSign className="h-3 w-3" />
                Daily Budget
              </label>
              <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30">
                <span className="border-r border-border px-2 py-2 text-xs text-text-muted">$</span>
                <input
                  type="number"
                  min={1}
                  value={batch.dailyBudget}
                  onChange={(e) => onUpdate({ dailyBudget: Number(e.target.value) })}
                  className="flex-1 bg-transparent px-2 py-2 text-xs text-text-primary focus:outline-none"
                />
                <span className="pr-2 text-[10px] text-text-muted">/day</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-[11px] font-medium text-text-secondary">
                <Calendar className="h-3 w-3" />
                Duration
              </label>
              <select
                value={batch.testDuration}
                onChange={(e) => onUpdate({ testDuration: Number(e.target.value) })}
                className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-xs text-text-primary focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              >
                {[3, 5, 7, 14].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-[11px] font-medium text-text-secondary">
              <Calendar className="h-3 w-3" />
              Launch Date
            </label>
            <input
              type="date"
              value={batch.launchDate || getTomorrow()}
              onChange={(e) => onUpdate({ launchDate: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
          </div>
        </div>

        {/* RIGHT: Copy & Account */}
        <div className="space-y-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <Trophy className="h-3 w-3" />
            Winner Copy Library
          </p>

          {product.winnerCopyLibrary.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-6 text-center">
              <AlertCircle className="h-5 w-5 text-text-muted" />
              <p className="text-xs text-text-muted">No winner copy in library</p>
              <p className="text-[10px] text-text-muted/70">Add copy from Settings → Product Profiles</p>
            </div>
          ) : (
            <div className="space-y-2">
              {product.winnerCopyLibrary.map((copy) => (
                <WinnerCopyCard
                  key={copy.id}
                  copy={copy}
                  isSelected={batch.selectedPrimaryTextId === copy.id}
                  maxRoas={maxRoas}
                  onSelect={() =>
                    onUpdate({
                      selectedPrimaryTextId: copy.id,
                      selectedHeadlineId: copy.id,
                    })
                  }
                />
              ))}
            </div>
          )}

          {/* Account details */}
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              <Building2 className="h-3 w-3" />
              Account Details
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Account', value: batch.adAccountName },
                { label: 'Page', value: batch.pageName },
                { label: 'Pixel', value: batch.pixelId },
                { label: 'Event', value: batch.conversionEvent || 'Purchase' },
              ].map(({ label, value }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-text-muted"
                >
                  <span className="font-medium text-text-secondary">{label}:</span>
                  <span className="max-w-[120px] truncate">{value}</span>
                </span>
              ))}
            </div>
            <p className="text-[10px] text-text-muted/70">
              Auto-populated from product profile • Edit in Settings
            </p>
          </div>

          {/* Destination URL */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-text-secondary">Destination URL</label>
            <input
              type="url"
              value={batch.destinationUrl}
              onChange={(e) => onUpdate({ destinationUrl: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
              placeholder="https://…"
            />
          </div>
        </div>
      </div>

      {/* AI hint banner */}
      {hintCampaign && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.1 + 0.3, duration: 0.3 }}
          className="mx-4 mb-4 flex items-start gap-2 rounded-lg border border-blue-400/20 bg-blue-500/5 px-3 py-2"
        >
          <Zap className="mt-0.5 h-3 w-3 flex-shrink-0 text-blue-400" />
          <p className="text-[11px] text-blue-400">
            <span className="font-semibold">AI recommends</span> testing in existing campaign —{' '}
            {hintCampaign.name} has 90-day purchase history
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Stage3ConfigureProps {
  batches: LaunchBatch[];
  products: ProductProfile[];
  clickupCreatives: ClickUpCreativeSet[];
  availableCampaigns: MockCampaign[];
  availableAdsets: MockAdset[];
  onUpdateBatch: (productId: string, updates: Partial<LaunchBatch>) => void;
  onBack: () => void;
  onProceed: () => void;
}

export function Stage3Configure({
  batches,
  products,
  clickupCreatives,
  availableCampaigns,
  availableAdsets,
  onUpdateBatch,
  onBack,
  onProceed,
}: Stage3ConfigureProps) {
  const canProceed = batches.every((b) => {
    if (b.campaignMode === 'existing' && !b.existingCampaignId) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <h2 className="text-2xl font-bold text-text-primary">Configure Your Tests</h2>
        <p className="mt-1 text-sm text-text-muted">
          Auto-populated from your product profiles
        </p>
      </motion.div>

      {/* Panels */}
      <div className="flex flex-col gap-5">
        {batches.map((batch, i) => {
          const product = products.find((p) => p.id === batch.productId);
          if (!product) return null;
          const creatives = clickupCreatives.filter(
            (c) => c.productId === batch.productId && batch.creativeIds.includes(c.id)
          );

          return (
            <ProductConfigPanel
              key={batch.productId}
              batch={batch}
              product={product}
              creatives={creatives}
              availableCampaigns={availableCampaigns}
              availableAdsets={availableAdsets}
              onUpdate={(updates) => onUpdateBatch(batch.productId, updates)}
              index={i}
            />
          );
        })}
      </div>

      {/* Footer actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: batches.length * 0.1 + 0.1 }}
        className="flex items-center gap-3"
      >
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-border px-5 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
        >
          Back
        </button>
        <motion.button
          type="button"
          onClick={canProceed ? onProceed : undefined}
          disabled={!canProceed}
          whileHover={canProceed ? { scale: 1.02 } : undefined}
          whileTap={canProceed ? { scale: 0.97 } : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            'flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold text-white shadow-lg transition-shadow duration-200',
            canProceed
              ? 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-blue-500/25 hover:shadow-blue-500/40'
              : 'cursor-not-allowed bg-border text-text-muted shadow-none'
          )}
        >
          Review Launch
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      </motion.div>
    </div>
  );
}
