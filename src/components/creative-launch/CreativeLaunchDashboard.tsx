'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  BarChart2,
  TrendingUp,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Play,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  Settings,
  ExternalLink,
  Package,
  Calendar,
  X,
  Link2,
  Save,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import { useCreativeLaunchStore } from '@/stores/creativeLaunchStore';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Stage3Configure } from './Stage3Configure';
import { Stage4Review } from './Stage4Review';

// ── Types ────────────────────────────────────────────────────────────────────

interface ClickUpCreative {
  id: string;
  taskId: string;
  name: string;
  productName: string;
  productId?: string;
  status: string;
  format: 'video' | 'image' | 'carousel';
  hook?: string;
  angle?: string;
  thumbnailUrl?: string;
  driveLink?: string;
  dateAdded: string;
  listName: string;
  listId: string;
}

interface TestingAd {
  id: string;
  adId: string;
  adName: string;
  creativeName: string;
  productName: string;
  productId?: string;
  campaignName: string;
  adsetName: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED';
  thumbnailUrl?: string;
  // Metrics
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  // Test info
  dayNumber: number;
  startDate: string;
  testStatus: 'running' | 'day3_review' | 'winner' | 'killed' | 'scaling';
}

interface MainProduct {
  id: string;
  name: string;
}

interface ProductSummary {
  productId: string;
  productName: string;
  readyCount: number;
  testingCount: number;
  spend: number;
  roas: number;
  winners: number;
  killed: number;
  readyToLaunch: ClickUpCreative[];
  currentlyTesting: TestingAd[];
}

interface DashboardData {
  readyToLaunch: ClickUpCreative[];
  currentlyTesting: TestingAd[];
  mainProducts: MainProduct[];
  productSummaries: ProductSummary[];
  summary: {
    totalReady: number;
    totalTesting: number;
    totalSpend: number;
    avgRoas: number;
    winners: number;
    killed: number;
  };
}

type TabType = 'pipeline' | 'performance';

interface ProductLinksResponse {
  linksByProduct: Record<string, string[]>;
}

// ── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  accent: string;
  bgAccent: string;
}

function StatCard({ label, value, icon, trend, accent, bgAccent }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('rounded-xl border p-4', bgAccent)}
    >
      <div className="flex items-start justify-between">
        <div className={cn('p-2 rounded-lg', bgAccent)}>
          <div className={accent}>{icon}</div>
        </div>
        {trend && (
          <div className={cn('flex items-center gap-0.5 text-xs font-medium', trend.isPositive ? 'text-emerald-500' : 'text-red-500')}>
            {trend.isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className={cn('text-2xl font-bold tabular-nums', accent)}>{value}</p>
        <p className="text-xs text-text-muted mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}

// ── Tab Button ───────────────────────────────────────────────────────────────

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}

function TabButton({ active, onClick, icon, label, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200',
        active
          ? 'text-primary'
          : 'text-text-muted hover:text-text-secondary'
      )}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className={cn(
          'ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
          active ? 'bg-primary/15 text-primary' : 'bg-surface-hover text-text-muted'
        )}>
          {count}
        </span>
      )}
      {active && (
        <motion.div
          layoutId="activeTab"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
        />
      )}
    </button>
  );
}

// ── Creative Card (Pipeline) ─────────────────────────────────────────────────

interface CreativeCardProps {
  creative: ClickUpCreative;
  onLaunch?: () => void;
}

function CreativeCard({ creative, onLaunch }: CreativeCardProps) {
  const formatBadge = {
    video: { label: 'Video', className: 'bg-pink-500/15 text-pink-400 border-pink-500/30' },
    image: { label: 'Image', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    carousel: { label: 'Carousel', className: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  }[creative.format];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-xl border border-border bg-surface overflow-hidden hover:border-primary/30 transition-colors"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-surface-hover overflow-hidden">
        {creative.thumbnailUrl ? (
          <img src={creative.thumbnailUrl} alt={creative.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BarChart2 className="h-8 w-8 text-text-muted/30" />
          </div>
        )}
        {/* Format badge */}
        <span className={cn('absolute top-2 right-2 rounded-md border px-2 py-0.5 text-[10px] font-semibold', formatBadge.className)}>
          {formatBadge.label}
        </span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <div>
          <p className="text-sm font-semibold text-text-primary truncate">{creative.name}</p>
          <p className="text-[11px] text-text-muted truncate">{creative.productName}</p>
        </div>

        {creative.hook && (
          <p className="text-[11px] text-text-secondary line-clamp-2">&ldquo;{creative.hook}&rdquo;</p>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-[10px] text-text-muted">{creative.listName}</span>
          {creative.driveLink && (
            <a
              href={creative.driveLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            >
              View <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Testing Ad Row ───────────────────────────────────────────────────────────

interface TestingAdRowProps {
  ad: TestingAd;
  index: number;
}

function TestingAdRow({ ad, index }: TestingAdRowProps) {
  const statusConfig = {
    running: { label: 'Running', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: <Play className="h-2.5 w-2.5" /> },
    day3_review: { label: 'Day 3 Review', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: <Clock className="h-2.5 w-2.5" /> },
    winner: { label: 'Winner', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: <CheckCircle2 className="h-2.5 w-2.5" /> },
    killed: { label: 'Killed', className: 'bg-red-500/15 text-red-400 border-red-500/30', icon: <AlertCircle className="h-2.5 w-2.5" /> },
    scaling: { label: 'Scaling', className: 'bg-purple-500/15 text-purple-400 border-purple-500/30', icon: <TrendingUp className="h-2.5 w-2.5" /> },
  }[ad.testStatus];

  const roasPositive = ad.roas >= 1.0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        'grid grid-cols-12 gap-4 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-surface-hover transition-colors',
        ad.testStatus === 'killed' && 'opacity-60'
      )}
    >
      {/* Creative Info - 3 cols */}
      <div className="col-span-3 flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-surface-hover overflow-hidden">
          {ad.thumbnailUrl ? (
            <img src={ad.thumbnailUrl} alt={ad.creativeName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BarChart2 className="h-4 w-4 text-text-muted/30" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-text-primary truncate">{ad.creativeName}</p>
          <p className="text-[10px] text-text-muted truncate">{ad.productName}</p>
        </div>
      </div>

      {/* Status - 1 col */}
      <div className="col-span-1">
        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold', statusConfig.className)}>
          {statusConfig.icon}
          {statusConfig.label}
        </span>
      </div>

      {/* Day - 1 col */}
      <div className="col-span-1 text-center">
        <span className="text-xs font-medium text-text-secondary">Day {ad.dayNumber}</span>
      </div>

      {/* Spend - 1 col */}
      <div className="col-span-1 text-right">
        <span className="text-xs font-semibold text-text-primary tabular-nums">${ad.spend.toFixed(0)}</span>
        <p className="text-[9px] text-text-muted">spend</p>
      </div>

      {/* Impressions - 1 col */}
      <div className="col-span-1 text-right">
        <span className="text-xs font-semibold text-text-secondary tabular-nums">{(ad.impressions / 1000).toFixed(1)}K</span>
        <p className="text-[9px] text-text-muted">impr.</p>
      </div>

      {/* CTR - 1 col */}
      <div className="col-span-1 text-right">
        <span className="text-xs font-semibold text-text-secondary tabular-nums">{(ad.ctr * 100).toFixed(2)}%</span>
        <p className="text-[9px] text-text-muted">CTR</p>
      </div>

      {/* CPC - 1 col */}
      <div className="col-span-1 text-right">
        <span className="text-xs font-semibold text-text-secondary tabular-nums">${ad.cpc.toFixed(2)}</span>
        <p className="text-[9px] text-text-muted">CPC</p>
      </div>

      {/* ROAS - 1 col */}
      <div className="col-span-1 text-right">
        <span className={cn('text-sm font-bold tabular-nums', roasPositive ? 'text-emerald-400' : 'text-red-400')}>
          {ad.roas.toFixed(2)}x
        </span>
        <p className="text-[9px] text-text-muted">ROAS</p>
      </div>
    </motion.div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ type, onConnect }: { type: 'pipeline' | 'performance'; onConnect?: () => void }) {
  if (type === 'pipeline') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Rocket className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">No Creatives Ready</h3>
        <p className="text-sm text-text-muted max-w-md mb-6">
          Connect ClickUp and mark creatives as &ldquo;Ready to Launch&rdquo; to see them here.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Settings className="h-4 w-4" />
          Connect ClickUp
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
        <BarChart2 className="h-8 w-8 text-blue-400" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">No Active Tests</h3>
      <p className="text-sm text-text-muted max-w-md">
        Launch creatives from the Pipeline tab to start testing and see performance metrics here.
      </p>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

export function CreativeLaunchDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('pipeline');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<DashboardData>({
    readyToLaunch: [],
    currentlyTesting: [],
    mainProducts: [],
    productSummaries: [],
    summary: {
      totalReady: 0,
      totalTesting: 0,
      totalSpend: 0,
      avgRoas: 0,
      winners: 0,
      killed: 0,
    },
  });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showLaunchFlow, setShowLaunchFlow] = useState(false);
  const [showProductLinksPanel, setShowProductLinksPanel] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [linksByProduct, setLinksByProduct] = useState<Record<string, string[]>>({});
  const [isLinksLoading, setIsLinksLoading] = useState(false);
  const [savingLinksProductId, setSavingLinksProductId] = useState<string | null>(null);
  const [suggestingLinksProductId, setSuggestingLinksProductId] = useState<string | null>(null);

  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchDashboardData = async (showRefresh = false) => {
    if (!activeStoreId) return;

    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch(`/api/creative-launch/dashboard?storeId=${encodeURIComponent(activeStoreId)}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch dashboard data');
      }

      setData({
        readyToLaunch: json.readyToLaunch || [],
        currentlyTesting: json.currentlyTesting || [],
        mainProducts: json.mainProducts || [],
        productSummaries: json.productSummaries || [],
        summary: json.summary || {
          totalReady: 0,
          totalTesting: 0,
          totalSpend: 0,
          avgRoas: 0,
          winners: 0,
          killed: 0,
        },
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (mounted && activeStoreId) {
      fetchDashboardData();
    }
  }, [mounted, activeStoreId]);

  // Filter creatives based on search
  const filteredReadyToLaunch = useMemo(() => {
    if (!searchQuery.trim()) return data.readyToLaunch;
    const q = searchQuery.toLowerCase();
    return data.readyToLaunch.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.productName.toLowerCase().includes(q) ||
        c.hook?.toLowerCase().includes(q)
    );
  }, [data.readyToLaunch, searchQuery]);

  const filteredTesting = useMemo(() => {
    if (!searchQuery.trim()) return data.currentlyTesting;
    const q = searchQuery.toLowerCase();
    return data.currentlyTesting.filter(
      (a) =>
        a.creativeName.toLowerCase().includes(q) ||
        a.productName.toLowerCase().includes(q) ||
        a.campaignName.toLowerCase().includes(q)
    );
  }, [data.currentlyTesting, searchQuery]);

  const productsForLinkSetup = useMemo(() => {
    if (data.productSummaries.length > 0) {
      return data.productSummaries.map((row) => ({
        id: row.productId,
        name: row.productName,
      }));
    }

    const byProduct = new Map<string, { id: string; name: string }>();
    for (const creative of data.readyToLaunch) {
      const productId = creative.productId || `product_${creative.productName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      if (!byProduct.has(productId)) {
        byProduct.set(productId, { id: productId, name: creative.productName });
      }
    }
    return [...byProduct.values()];
  }, [data.productSummaries, data.readyToLaunch]);

  const fetchProductLinks = async () => {
    if (!activeStoreId || productsForLinkSetup.length === 0) {
      setLinksByProduct({});
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
          productIds: productsForLinkSetup.map((row) => row.id),
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to load product links');
      }
      const data = await response.json() as ProductLinksResponse;
      setLinksByProduct(data.linksByProduct || {});
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load product links';
      toast.error(message);
    } finally {
      setIsLinksLoading(false);
    }
  };

  useEffect(() => {
    if (!showProductLinksPanel) return;
    fetchProductLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProductLinksPanel, activeStoreId, productsForLinkSetup.length]);

  const saveLinksForProduct = async (productId: string, productName: string) => {
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
          productLinks: linksByProduct[productId] || [],
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to save links');
      }
      toast.success(`Saved links for ${productName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save links';
      toast.error(message);
    } finally {
      setSavingLinksProductId(null);
    }
  };

  const suggestLinksForProduct = async (productId: string, productName: string) => {
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
        throw new Error('Failed to suggest links');
      }
      const data = await response.json() as { links?: string[] };
      const links = Array.isArray(data.links) ? data.links : [];
      if (links.length === 0) {
        toast('No Shopify suggestions found');
        return;
      }
      setLinksByProduct((prev) => ({
        ...prev,
        [productId]: links,
      }));
      toast.success(`Suggested links for ${productName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to suggest links';
      toast.error(message);
    } finally {
      setSuggestingLinksProductId(null);
    }
  };

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-surface rounded-lg" />
        <div className="grid grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-surface rounded-xl" />
          ))}
        </div>
        <div className="h-96 bg-surface rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <span className="text-2xl">🚀</span> Creative Launch
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Manage your creative pipeline and track testing performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProductLinksPanel(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Product Links
          </button>
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* All Products Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Ready to Launch"
          value={data.summary.totalReady}
          icon={<Rocket className="h-4 w-4" />}
          accent="text-primary"
          bgAccent="bg-primary/10 border-primary/20"
        />
        <StatCard
          label="Currently Testing"
          value={data.summary.totalTesting}
          icon={<Zap className="h-4 w-4" />}
          accent="text-blue-400"
          bgAccent="bg-blue-500/10 border-blue-500/20"
        />
        <StatCard
          label="Total Spend"
          value={`$${data.summary.totalSpend.toFixed(0)}`}
          icon={<DollarSign className="h-4 w-4" />}
          accent="text-amber-400"
          bgAccent="bg-amber-500/10 border-amber-500/20"
        />
        <StatCard
          label="Avg. ROAS"
          value={`${data.summary.avgRoas.toFixed(2)}x`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="text-emerald-400"
          bgAccent="bg-emerald-500/10 border-emerald-500/20"
        />
        <StatCard
          label="Winners"
          value={data.summary.winners}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="text-emerald-400"
          bgAccent="bg-emerald-500/10 border-emerald-500/20"
        />
        <StatCard
          label="Killed"
          value={data.summary.killed}
          icon={<AlertCircle className="h-4 w-4" />}
          accent="text-red-400"
          bgAccent="bg-red-500/10 border-red-500/20"
        />
      </div>

      {/* Product-wise Summary Cards */}
      {data.productSummaries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">By Product</h2>
            <button
              onClick={() => router.push('/dashboard/creative-launch/launch')}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Rocket className="h-3.5 w-3.5" />
              Launch Creatives
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {data.productSummaries.map((ps) => (
              <div
                key={ps.productId}
                className="rounded-lg border border-border bg-surface p-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-text-primary truncate">{ps.productName}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-primary tabular-nums">{ps.readyCount}</p>
                    <p className="text-[10px] text-text-muted">Ready</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-400 tabular-nums">{ps.testingCount}</p>
                    <p className="text-[10px] text-text-muted">Testing</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-400 tabular-nums">{ps.winners}</p>
                    <p className="text-[10px] text-text-muted">Winners</p>
                  </div>
                  <div>
                    <p className={cn('text-lg font-bold tabular-nums', ps.roas >= 1 ? 'text-emerald-400' : 'text-red-400')}>
                      {ps.roas.toFixed(1)}x
                    </p>
                    <p className="text-[10px] text-text-muted">ROAS</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs + Search Row */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-0">
        <div className="flex items-center gap-1">
          <TabButton
            active={activeTab === 'pipeline'}
            onClick={() => setActiveTab('pipeline')}
            icon={<Rocket className="h-4 w-4" />}
            label="Pipeline"
            count={data.summary.totalReady}
          />
          <TabButton
            active={activeTab === 'performance'}
            onClick={() => setActiveTab('performance')}
            icon={<BarChart2 className="h-4 w-4" />}
            label="Testing"
            count={data.summary.totalTesting}
          />
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-sm text-text-muted">{error}</p>
          <button onClick={() => fetchDashboardData()} className="mt-3 text-xs text-primary hover:underline">
            Try again
          </button>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === 'pipeline' ? (
            <motion.div
              key="pipeline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {data.productSummaries.length === 0 && filteredReadyToLaunch.length === 0 ? (
                <EmptyState type="pipeline" />
              ) : (
                data.productSummaries.map((ps) => {
                  const isExpanded = expandedProducts.has(ps.productId);
                  const creatives = ps.readyToLaunch.filter((c) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return c.name.toLowerCase().includes(q) || c.hook?.toLowerCase().includes(q);
                  });
                  if (creatives.length === 0 && searchQuery.trim()) return null;

                  return (
                    <div key={ps.productId} className="rounded-lg border border-border bg-surface overflow-hidden">
                      <button
                        onClick={() => {
                          const next = new Set(expandedProducts);
                          if (isExpanded) next.delete(ps.productId);
                          else next.add(ps.productId);
                          setExpandedProducts(next);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Package className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium text-text-primary">{ps.productName}</span>
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            {ps.readyCount} ready
                          </span>
                        </div>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border px-4 py-3">
                          {creatives.length === 0 ? (
                            <p className="text-xs text-text-muted py-4 text-center">No creatives ready for this product</p>
                          ) : (
                            <div className="space-y-2">
                              {creatives.map((creative) => (
                                <MinimalCreativeRow key={creative.id} creative={creative} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </motion.div>
          ) : (
            <motion.div
              key="performance"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {data.productSummaries.length === 0 && filteredTesting.length === 0 ? (
                <EmptyState type="performance" />
              ) : (
                data.productSummaries.map((ps) => {
                  const isExpanded = expandedProducts.has(ps.productId);
                  const ads = ps.currentlyTesting.filter((a) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return a.creativeName.toLowerCase().includes(q) || a.campaignName.toLowerCase().includes(q);
                  });
                  if (ads.length === 0 && searchQuery.trim()) return null;

                  return (
                    <div key={ps.productId} className="rounded-lg border border-border bg-surface overflow-hidden">
                      <button
                        onClick={() => {
                          const next = new Set(expandedProducts);
                          if (isExpanded) next.delete(ps.productId);
                          else next.add(ps.productId);
                          setExpandedProducts(next);
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Package className="h-4 w-4 text-blue-400" />
                          <span className="text-sm font-medium text-text-primary">{ps.productName}</span>
                          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                            {ps.testingCount} testing
                          </span>
                          {ps.winners > 0 && (
                            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                              {ps.winners} winner{ps.winners > 1 ? 's' : ''}
                            </span>
                          )}
                          <span className={cn('text-xs font-semibold', ps.roas >= 1 ? 'text-emerald-400' : 'text-red-400')}>
                            {ps.roas.toFixed(2)}x ROAS
                          </span>
                        </div>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-text-muted" /> : <ChevronRight className="h-4 w-4 text-text-muted" />}
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border">
                          {ads.length === 0 ? (
                            <p className="text-xs text-text-muted py-4 text-center">No ads testing for this product</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border bg-surface-hover/50">
                                    <th className="px-3 py-2 text-left font-medium text-text-muted">Status</th>
                                    <th className="px-3 py-2 text-left font-medium text-text-muted">Ad Name</th>
                                    <th className="px-3 py-2 text-center font-medium text-text-muted">Day</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">Spend</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">Impr.</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">Clicks</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">CTR</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">CPC</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">CPM</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">Purch.</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">Revenue</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">CPA</th>
                                    <th className="px-3 py-2 text-right font-medium text-text-muted">ROAS</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {ads.map((ad) => (
                                    <TestingAdTableRow key={ad.id} ad={ad} />
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {showProductLinksPanel && (
        <ProductLinksPanel
          products={productsForLinkSetup}
          linksByProduct={linksByProduct}
          isLoading={isLinksLoading}
          savingProductId={savingLinksProductId}
          suggestingProductId={suggestingLinksProductId}
          onClose={() => setShowProductLinksPanel(false)}
          onRefresh={fetchProductLinks}
          onLinksChange={(productId, links) => {
            setLinksByProduct((prev) => ({
              ...prev,
              [productId]: links,
            }));
          }}
          onSaveProduct={saveLinksForProduct}
          onSuggestProduct={suggestLinksForProduct}
        />
      )}

      {/* Schedule Creative Modal */}
      {showScheduleModal && (
        <ScheduleCreativeModal
          products={data.mainProducts}
          productSummaries={data.productSummaries}
          onClose={() => setShowScheduleModal(false)}
        />
      )}

      {/* Launch Flow Modal */}
      {showLaunchFlow && (
        <LaunchFlowModal
          creatives={data.readyToLaunch}
          onClose={() => {
            setShowLaunchFlow(false);
            // Refresh data after closing launch flow
            fetchDashboardData(true);
          }}
        />
      )}
    </div>
  );
}

// ── Minimal Creative Row ──────────────────────────────────────────────────────

function MinimalCreativeRow({ creative }: { creative: ClickUpCreative }) {
  const formatBadge = {
    video: { label: 'Video', className: 'bg-pink-500/15 text-pink-400' },
    image: { label: 'Image', className: 'bg-purple-500/15 text-purple-400' },
    carousel: { label: 'Carousel', className: 'bg-indigo-500/15 text-indigo-400' },
  }[creative.format];

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-hover transition-colors">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold', formatBadge.className)}>
          {formatBadge.label}
        </span>
        <span className="text-xs font-medium text-text-primary truncate">{creative.name}</span>
        {creative.hook && (
          <span className="text-[10px] text-text-muted truncate max-w-[200px]">&ldquo;{creative.hook}&rdquo;</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-text-muted">{creative.dateAdded}</span>
        {creative.driveLink && (
          <a
            href={creative.driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
          >
            View <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Testing Ad Table Row ───────────────────────────────────────────────────────

function TestingAdTableRow({ ad }: { ad: TestingAd }) {
  const statusConfig = {
    running: { label: 'Running', className: 'bg-blue-500/15 text-blue-400' },
    day3_review: { label: 'Day 3', className: 'bg-amber-500/15 text-amber-400' },
    winner: { label: 'Winner', className: 'bg-emerald-500/15 text-emerald-400' },
    killed: { label: 'Killed', className: 'bg-red-500/15 text-red-400' },
    scaling: { label: 'Scaling', className: 'bg-purple-500/15 text-purple-400' },
  }[ad.testStatus];

  const formatCurrency = (val: number) => val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val.toFixed(2)}`;
  const formatNumber = (val: number) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(0);

  return (
    <tr className={cn('hover:bg-surface-hover/50 transition-colors', ad.testStatus === 'killed' && 'opacity-60')}>
      <td className="px-3 py-2">
        <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap', statusConfig.className)}>
          {statusConfig.label}
        </span>
      </td>
      <td className="px-3 py-2 max-w-[200px]">
        <span className="text-text-primary font-medium truncate block" title={ad.creativeName}>
          {ad.creativeName}
        </span>
      </td>
      <td className="px-3 py-2 text-center text-text-muted tabular-nums">{ad.dayNumber}</td>
      <td className="px-3 py-2 text-right text-text-primary font-semibold tabular-nums">{formatCurrency(ad.spend)}</td>
      <td className="px-3 py-2 text-right text-text-muted tabular-nums">{formatNumber(ad.impressions)}</td>
      <td className="px-3 py-2 text-right text-text-muted tabular-nums">{formatNumber(ad.clicks)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className={cn(ad.ctr >= 0.01 ? 'text-emerald-400' : ad.ctr >= 0.005 ? 'text-amber-400' : 'text-red-400')}>
          {(ad.ctr * 100).toFixed(2)}%
        </span>
      </td>
      <td className="px-3 py-2 text-right text-text-muted tabular-nums">{formatCurrency(ad.cpc)}</td>
      <td className="px-3 py-2 text-right text-text-muted tabular-nums">{formatCurrency(ad.cpm)}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className={cn(ad.purchases > 0 ? 'text-emerald-400 font-semibold' : 'text-text-muted')}>
          {ad.purchases}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className={cn(ad.revenue > 0 ? 'text-emerald-400 font-semibold' : 'text-text-muted')}>
          {formatCurrency(ad.revenue)}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-text-muted tabular-nums">
        {ad.purchases > 0 ? formatCurrency(ad.cpa) : '-'}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span className={cn('font-bold', ad.roas >= 2 ? 'text-emerald-400' : ad.roas >= 1 ? 'text-amber-400' : 'text-red-400')}>
          {ad.roas.toFixed(2)}x
        </span>
      </td>
    </tr>
  );
}

// ── Product Links Panel ──────────────────────────────────────────────────────

function ProductLinksPanel({
  products,
  linksByProduct,
  isLoading,
  savingProductId,
  suggestingProductId,
  onClose,
  onRefresh,
  onLinksChange,
  onSaveProduct,
  onSuggestProduct,
}: {
  products: Array<{ id: string; name: string }>;
  linksByProduct: Record<string, string[]>;
  isLoading: boolean;
  savingProductId: string | null;
  suggestingProductId: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onLinksChange: (productId: string, links: string[]) => void;
  onSaveProduct: (productId: string, productName: string) => Promise<void> | void;
  onSuggestProduct: (productId: string, productName: string) => Promise<void> | void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Product Link Settings</h3>
            <p className="mt-1 text-xs text-text-muted">
              Add one or more links per product. Product Setup uses these links to match ad accounts, BM, pages, IG, and pixels.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              Refresh
            </button>
            <button onClick={onClose} className="rounded-md p-1.5 text-text-muted hover:bg-surface-hover">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface-hover/40 p-4 text-sm text-text-muted">
            No products found yet.
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((product) => {
              const value = (linksByProduct[product.id] || []).join('\n');
              const isSaving = savingProductId === product.id;
              const isSuggesting = suggestingProductId === product.id;
              return (
                <div key={product.id} className="rounded-lg border border-border bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary">{product.name}</p>
                    <span className="text-[11px] text-text-muted">
                      {(linksByProduct[product.id] || []).length} link{(linksByProduct[product.id] || []).length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    value={value}
                    onChange={(e) => {
                      const links = e.target.value
                        .split('\n')
                        .map((row) => row.trim())
                        .filter(Boolean);
                      onLinksChange(product.id, links);
                    }}
                    placeholder="https://yourstore.com/products/your-handle"
                    className="w-full rounded-lg border border-border bg-surface-hover/20 px-3 py-2 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    Use one URL per line. These are cached and used for future auto-mapping.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => onSuggestProduct(product.id, product.name)}
                      disabled={isSuggesting}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                    >
                      {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Suggest from Shopify
                    </button>
                    <button
                      onClick={() => onSaveProduct(product.id, product.name)}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Schedule Creative Modal ───────────────────────────────────────────────────

function ScheduleCreativeModal({
  products,
  productSummaries,
  onClose,
}: {
  products: MainProduct[];
  productSummaries: ProductSummary[];
  onClose: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);

  const selectedSummary = productSummaries.find((ps) => ps.productId === selectedProduct);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Schedule Creative</h3>
            <p className="text-xs text-text-muted mt-0.5">Select a product to see ready-to-test creatives</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="h-4 w-4 text-text-muted" />
          </button>
        </div>

        {/* Product Selection */}
        <div className="px-5 py-3 border-b border-border">
          <label className="text-xs font-medium text-text-muted mb-2 block">Select Product</label>
          <select
            value={selectedProduct || ''}
            onChange={(e) => setSelectedProduct(e.target.value || null)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">-- Choose a product --</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Creatives List */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {!selectedProduct ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-10 w-10 text-text-muted/30 mb-3" />
              <p className="text-sm text-text-muted">Select a product to see available creatives</p>
            </div>
          ) : !selectedSummary || selectedSummary.readyToLaunch.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Rocket className="h-10 w-10 text-text-muted/30 mb-3" />
              <p className="text-sm text-text-muted">No creatives ready to test for this product</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted mb-3">
                {selectedSummary.readyToLaunch.length} creative{selectedSummary.readyToLaunch.length > 1 ? 's' : ''} ready to test
              </p>
              {selectedSummary.readyToLaunch.map((creative) => (
                <div
                  key={creative.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                      'rounded px-1.5 py-0.5 text-[9px] font-semibold',
                      creative.format === 'video' ? 'bg-pink-500/15 text-pink-400' :
                      creative.format === 'carousel' ? 'bg-indigo-500/15 text-indigo-400' :
                      'bg-purple-500/15 text-purple-400'
                    )}>
                      {creative.format.charAt(0).toUpperCase() + creative.format.slice(1)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{creative.name}</p>
                      {creative.hook && (
                        <p className="text-[10px] text-text-muted truncate">&ldquo;{creative.hook}&rdquo;</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {creative.driveLink && (
                      <a
                        href={creative.driveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </a>
                    )}
                    <button className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors">
                      Schedule
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Launch Flow Modal ─────────────────────────────────────────────────────────

interface LaunchFlowModalProps {
  creatives: ClickUpCreative[];
  onClose: () => void;
}

interface MetaAssets {
  campaigns: Array<{ id: string; name: string; status: string; objective: string; dailyBudget: number | null; spend30d: number; roas30d: number }>;
  adsets: Array<{ id: string; name: string; campaignId: string; status: string; dailyBudget: number | null }>;
  pages: Array<{ id: string; name: string; instagramId: string | null }>;
  pixels: Array<{ id: string; name: string }>;
  adAccounts: Array<{ id: string; name: string }>;
}

function LaunchFlowModal({ creatives, onClose }: LaunchFlowModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [formatFilter, setFormatFilter] = useState<Set<'video' | 'image' | 'carousel'>>(new Set(['video', 'image', 'carousel']));
  const [currentStage, setCurrentStage] = useState<'select' | 'configure' | 'review'>('select');
  const [metaAssets, setMetaAssets] = useState<MetaAssets | null>(null);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  
  const launchStore = useCreativeLaunchStore();
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProduct = (productName: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productName)) next.delete(productName);
      else next.add(productName);
      return next;
    });
  };

  const toggleFormat = (format: 'video' | 'image' | 'carousel') => {
    setFormatFilter(prev => {
      const next = new Set(prev);
      if (next.has(format)) next.delete(format);
      else next.add(format);
      return next;
    });
  };

  const selectAllForProduct = (productName: string, filteredCreatives: ClickUpCreative[]) => {
    const productCreativeIds = filteredCreatives.map(c => c.id);
    setSelectedIds(prev => new Set([...prev, ...productCreativeIds]));
  };

  const clearSelectionForProduct = (productName: string, filteredCreatives: ClickUpCreative[]) => {
    const productCreativeIds = new Set(filteredCreatives.map(c => c.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      productCreativeIds.forEach(id => next.delete(id));
      return next;
    });
  };

  // Filter creatives by format
  const filteredCreatives = creatives.filter(c => formatFilter.has(c.format));

  // Group by product
  const byProduct = new Map<string, ClickUpCreative[]>();
  for (const c of filteredCreatives) {
    const existing = byProduct.get(c.productName) || [];
    byProduct.set(c.productName, [...existing, c]);
  }

  // Count by format
  const formatCounts = {
    video: creatives.filter(c => c.format === 'video').length,
    image: creatives.filter(c => c.format === 'image').length,
    carousel: creatives.filter(c => c.format === 'carousel').length,
  };

  // Handle proceeding to configure stage
  const handleProceedToConfigure = async () => {
    setIsLoadingAssets(true);
    
    try {
      // Get the first selected creative's product name for filtering campaigns
      const firstSelectedId = Array.from(selectedIds)[0];
      const firstCreative = creatives.find(c => c.id === firstSelectedId);
      const productName = firstCreative?.productName || '';
      
      // Fetch Meta assets (campaigns, adsets, pages, pixels) with product filter
      if (activeStoreId) {
        const url = new URL('/api/creative-launch/meta-assets', window.location.origin);
        url.searchParams.set('storeId', activeStoreId);
        if (productName) {
          url.searchParams.set('productName', productName);
        }
        
        const res = await fetch(url.toString());
        if (res.ok) {
          const assets = await res.json();
          setMetaAssets(assets);
        }
      }
      
      // Fetch data for the store if not already loaded
      if (launchStore.products.length === 0 && activeStoreId) {
        await launchStore.fetchData(activeStoreId);
      }
      
      // Set selected creatives in the store - use proper state update
      const selectedArray = Array.from(selectedIds);
      // Clear and set via store action would be better, but for now:
      while (launchStore.selectedCreativeIds.length > 0) {
        launchStore.selectedCreativeIds.pop();
      }
      selectedArray.forEach(id => {
        launchStore.selectedCreativeIds.push(id);
      });
      
      // Initialize batches from selection
      launchStore.initBatchesFromSelection();
      
      // Move to configure stage
      setCurrentStage('configure');
    } catch (err) {
      console.error('Failed to load Meta assets:', err);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  // If we're in configure stage, show Stage3Configure
  if (currentStage === 'configure') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-surface rounded-xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col border border-border shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface">
            <div>
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                Configure Launch
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Configure campaign settings for {selectedIds.size} creative{selectedIds.size !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
              <X className="h-4 w-4 text-text-muted" />
            </button>
          </div>

          {/* Stage3Configure Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <Stage3Configure
              batches={launchStore.batches}
              products={launchStore.products}
              clickupCreatives={launchStore.clickupCreatives}
              availableCampaigns={metaAssets?.campaigns.map(c => ({
                id: c.id,
                name: c.name,
                status: c.status,
                accountId: metaAssets.adAccounts[0]?.id || '',
                adAccountName: metaAssets.adAccounts[0]?.name || '',
                spend: c.spend30d?.toFixed(0) || '0',
                roas: c.roas30d?.toFixed(2) || '0',
              })) || []}
              availableAdsets={metaAssets?.adsets.map(a => ({
                id: a.id,
                campaignId: a.campaignId,
                name: a.name,
                status: a.status,
                budget: a.dailyBudget ? `$${a.dailyBudget}/day` : 'No budget',
              })) || []}
              onUpdateBatch={launchStore.updateBatch}
              onBack={() => setCurrentStage('select')}
              onProceed={() => setCurrentStage('review')}
            />
          </div>
        </div>
      </div>
    );
  }

  // If we're in review stage, show Stage4Review
  if (currentStage === 'review') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div
          className="bg-surface rounded-xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col border border-border shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface">
            <div>
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                Review & Launch
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Review your configuration before launching
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
              <X className="h-4 w-4 text-text-muted" />
            </button>
          </div>

          {/* Stage4Review Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <Stage4Review
              batches={launchStore.batches}
              clickupCreatives={launchStore.clickupCreatives.map(c => ({
                id: c.id,
                taskId: c.taskId,
                productId: c.productId,
                productName: c.productName,
                name: c.name,
                hook: c.hook,
                angle: c.angle,
                format: c.format,
                thumbnailUrl: c.thumbnailUrl,
                driveLink: c.driveLink,
                notes: c.notes,
                dateAdded: c.dateAdded,
              }))}
              isLaunching={isLaunching}
              onBack={() => setCurrentStage('configure')}
              onLaunch={async () => {
                setIsLaunching(true);
                // TODO: Implement actual Meta API launch
                await new Promise(resolve => setTimeout(resolve, 2000));
                setIsLaunching(false);
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-surface rounded-xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col border border-border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface">
          <div>
            <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              Launch Creatives
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              Select creatives to launch to Meta Ads
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <X className="h-4 w-4 text-text-muted" />
          </button>
        </div>

        {/* Format Filters */}
        <div className="px-5 py-3 border-b border-border bg-surface-hover/30 flex items-center gap-4">
          <span className="text-xs font-medium text-text-muted">Filter:</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={formatFilter.has('video')}
              onChange={() => toggleFormat('video')}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs text-text-secondary">Video ({formatCounts.video})</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={formatFilter.has('image')}
              onChange={() => toggleFormat('image')}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs text-text-secondary">Image ({formatCounts.image})</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={formatFilter.has('carousel')}
              onChange={() => toggleFormat('carousel')}
              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs text-text-secondary">Carousel ({formatCounts.carousel})</span>
          </label>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredCreatives.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Rocket className="h-10 w-10 text-text-muted" />
              <p className="mt-3 text-sm text-text-muted">No creatives match the selected filters</p>
            </div>
          ) : (
            Array.from(byProduct.entries()).map(([productName, productCreatives]) => {
              const isExpanded = expandedProducts.has(productName);
              const selectedCount = productCreatives.filter(c => selectedIds.has(c.id)).length;
              
              return (
                <div key={productName} className="border border-border rounded-lg overflow-hidden">
                  {/* Product Header - Collapsed by default */}
                  <div className="flex items-center justify-between px-4 py-3 bg-surface-hover/50">
                    <button
                      onClick={() => toggleProduct(productName)}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                      <ChevronRight className={cn('h-4 w-4 text-text-muted transition-transform', isExpanded && 'rotate-90')} />
                      <Package className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-text-primary">{productName}</span>
                      <span className="text-xs text-text-muted">({productCreatives.length})</span>
                    </button>
                    <div className="flex items-center gap-3">
                      {selectedCount > 0 && (
                        <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">
                          {selectedCount} selected
                        </span>
                      )}
                      {/* Select All / Clear - Only visible when expanded */}
                      {isExpanded && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); selectAllForProduct(productName, productCreatives); }}
                            className="text-xs text-primary hover:underline"
                          >
                            Select All
                          </button>
                          <span className="text-text-muted">|</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); clearSelectionForProduct(productName, productCreatives); }}
                            className="text-xs text-text-muted hover:text-text-secondary"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Product Creatives - Only show when expanded */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      <div className="divide-y divide-border max-h-60 overflow-y-auto">
                        {productCreatives.map(creative => (
                          <label
                            key={creative.id}
                            className={cn(
                              'flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors',
                              selectedIds.has(creative.id) ? 'bg-primary/5' : 'hover:bg-surface-hover/50'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(creative.id)}
                              onChange={() => toggleSelection(creative.id)}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <div className={cn(
                              'rounded px-1.5 py-0.5 text-[9px] font-semibold',
                              creative.format === 'video' ? 'bg-pink-500/15 text-pink-400' :
                              creative.format === 'carousel' ? 'bg-indigo-500/15 text-indigo-400' :
                              'bg-purple-500/15 text-purple-400'
                            )}>
                              {creative.format.charAt(0).toUpperCase() + creative.format.slice(1)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-text-primary truncate">{creative.name}</p>
                              {creative.hook && (
                                <p className="text-[10px] text-text-muted truncate">&ldquo;{creative.hook}&rdquo;</p>
                              )}
                            </div>
                            {creative.driveLink && (
                              <a
                                href={creative.driveLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between bg-surface">
          <p className="text-sm text-text-muted">
            {selectedIds.size} creative{selectedIds.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={selectedIds.size === 0 || isLoadingAssets}
              onClick={handleProceedToConfigure}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoadingAssets ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Continue to Configure
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
