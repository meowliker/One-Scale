'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Save,
  Loader2,
  Settings,
  Package,
  Globe,
  Brain,
  Target,
  Tag,
  Link2,
  LayoutGrid,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Search,
  Check,
  Unlink,
  Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAccountOnlyCampaignLink } from '@/lib/creative-hub/account-links';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import type {
  ProductProfile,
  NamingTemplate,
  TargetingPreset,
  ProductCampaignLink,
} from '@/types/creativeHub';

interface EditProductProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProductProfile | null;
  linkedCampaigns: ProductCampaignLink[];
  storeId: string;
}

type Section =
  | 'meta'
  | 'clickup'
  | 'destination'
  | 'product'
  | 'aiKill'
  | 'targeting'
  | 'naming'
  | 'campaigns';

const DEFAULT_UTM_TEMPLATE =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

const sectionConfig: { id: Section; label: string; Icon: typeof Settings }[] = [
  { id: 'meta', label: 'Meta Configuration', Icon: Settings },
  { id: 'clickup', label: 'ClickUp Integration', Icon: LayoutGrid },
  { id: 'destination', label: 'Destination & UTM', Icon: Globe },
  { id: 'product', label: 'Product Info', Icon: Package },
  { id: 'aiKill', label: 'AI Kill Thresholds', Icon: Brain },
  { id: 'targeting', label: 'Targeting Presets', Icon: Target },
  { id: 'naming', label: 'Naming Template', Icon: Tag },
  { id: 'campaigns', label: 'Linked Campaigns', Icon: Link2 },
];

function getDefaults(): Partial<ProductProfile> {
  return {
    productName: '',
    adAccountId: '',
    adAccountCurrency: 'USD',
    pageId: '',
    pageName: '',
    instagramActorId: '',
    instagramUsername: '',
    pixelId: '',
    pixelName: '',
    conversionEvent: 'PURCHASE',
    destinationUrl: '',
    utmTemplate: '',
    averageOrderValue: undefined,
    defaultBudget: 20,
    defaultDuration: 3,
    defaultBidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    defaultBidAmount: undefined,
    defaultRoasFloor: undefined,
    defaultStructure: 'ABO',
    defaultLaunchStatus: 'PAUSED',
    aiMinSpend: undefined,
    aiMinImpressions: 100,
    aiMinHours: 24,
    aiEvalFrequency: '6h',
    namingTemplate: { campaign: '{product}_{type}_{date}', adset: '{targeting}_{budget}', ad: '{creative}_{hook}' },
    targetingPresets: [],
    clickupListId: '',
    clickupListName: '',
    clickupSyncInterval: 60,
  };
}

export function EditProductProfileModal({
  isOpen,
  onClose,
  profile,
  linkedCampaigns,
  storeId,
}: EditProductProfileModalProps) {
  const saveProfile = useCreativeHubStore((s) => s.saveProfile);
  const fetchProfiles = useCreativeHubStore((s) => s.fetchProfiles);
  const stores = useStoreStore((s) => s.stores);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const activeStore = stores.find((s) => s.id === (storeId || activeStoreId));
  const adAccounts = useMemo(() => activeStore?.adAccounts ?? [], [activeStore?.adAccounts]);
  const [form, setForm] = useState<Partial<ProductProfile>>(getDefaults());
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<Section>>(
    new Set(['meta', 'clickup', 'destination'])
  );
  const [newPresetName, setNewPresetName] = useState('');

  // Meta setup options state — keyed by adAccountId for multi-account support
  const [setupOptionsMap, setSetupOptionsMap] = useState<
    Record<
      string,
      {
        pages: Array<{ id: string; name: string; instagramAccountId?: string; instagramUsername?: string }>;
        pixels: Array<{ id: string; name: string }>;
        instagramAccounts: Array<{ id: string; username: string }>;
      }
    >
  >({});
  const [optionsLoading, setOptionsLoading] = useState(false);

  // ClickUp lists state
  const [clickupLists, setClickupLists] = useState<Array<{ id: string; name: string }>>([]);
  const [clickupLoading, setClickupLoading] = useState(false);
  const [clickupConnected, setClickupConnected] = useState(true);

  // Link account dropdown state
  const [showLinkDropdown, setShowLinkDropdown] = useState(false);
  const [linkingAccountId, setLinkingAccountId] = useState<string | null>(null);
  const [unlinkingAccountId, setUnlinkingAccountId] = useState<string | null>(null);
  const [unlinkedAccountIds, setUnlinkedAccountIds] = useState<Set<string>>(new Set());
  const linkDropdownRef = useRef<HTMLDivElement>(null);

  // Derive linked ad account IDs from linkedCampaigns
  const linkedAccountIds = useMemo(() => {
    const ids = new Set<string>();
    linkedCampaigns.forEach((link) => {
      if (unlinkedAccountIds.has(link.adAccountId)) return;
      if (link.adAccountId) ids.add(link.adAccountId);
    });
    // Also include the profile's own adAccountId
    if (form.adAccountId) ids.add(form.adAccountId);
    return ids;
  }, [linkedCampaigns, form.adAccountId, unlinkedAccountIds]);

  // Derive BM info from linked campaigns
  const bmPills = useMemo(() => {
    const bms = new Map<string, string>();
    linkedCampaigns.forEach((link) => {
      if (unlinkedAccountIds.has(link.adAccountId)) return;
      if (link.bmId && link.bmName) {
        bms.set(link.bmId, link.bmName);
      }
    });
    return Array.from(bms.entries()).map(([id, name]) => ({ id, name }));
  }, [linkedCampaigns, unlinkedAccountIds]);

  // Derive linked accounts with metadata
  const linkedAccountsInfo = useMemo(() => {
    const accountMap = new Map<string, { accountId: string; name: string; currency: string; campaignCount: number }>();
    linkedCampaigns.forEach((link) => {
      if (!link.adAccountId) return;
      if (unlinkedAccountIds.has(link.adAccountId)) return;
      const existing = accountMap.get(link.adAccountId);
      if (existing) {
        if (!isAccountOnlyCampaignLink(link)) existing.campaignCount++;
      } else {
        // Find name from store ad accounts
        const storeAccount = adAccounts.find((a) => a.accountId === link.adAccountId);
        accountMap.set(link.adAccountId, {
          accountId: link.adAccountId,
          name: storeAccount?.name || link.adAccountId,
          currency: storeAccount?.currency || 'USD',
          campaignCount: isAccountOnlyCampaignLink(link) ? 0 : 1,
        });
      }
    });
    // Also include the profile's own adAccountId if not already present
    if (form.adAccountId && !accountMap.has(form.adAccountId)) {
      const storeAccount = adAccounts.find((a) => a.accountId === form.adAccountId);
      accountMap.set(form.adAccountId, {
        accountId: form.adAccountId,
        name: storeAccount?.name || form.adAccountId,
        currency: storeAccount?.currency || form.adAccountCurrency || 'USD',
        campaignCount: 0,
      });
    }
    return Array.from(accountMap.values());
  }, [linkedCampaigns, form.adAccountId, form.adAccountCurrency, adAccounts, unlinkedAccountIds]);

  // Stable string key for effect dependencies
  const linkedAccountIdsKey = useMemo(() => Array.from(linkedAccountIds).sort().join(','), [linkedAccountIds]);

  // Available accounts to link (not already linked)
  const availableAccountsToLink = useMemo(() => {
    return adAccounts.filter((a) => !linkedAccountIds.has(a.accountId));
  }, [adAccounts, linkedAccountIds]);

  const realLinkedCampaigns = useMemo(
    () => linkedCampaigns.filter((link) => !isAccountOnlyCampaignLink(link)),
    [linkedCampaigns],
  );

  // Merged setup options across all linked accounts
  const mergedSetupOptions = useMemo(() => {
    const pages: Array<{ id: string; name: string; instagramAccountId?: string; instagramUsername?: string }> = [];
    const pixels: Array<{ id: string; name: string }> = [];
    const instagramAccounts: Array<{ id: string; username: string }> = [];
    const seenPageIds = new Set<string>();
    const seenPixelIds = new Set<string>();
    const seenIgIds = new Set<string>();

    Object.values(setupOptionsMap).forEach((opts) => {
      opts.pages.forEach((p) => {
        if (!seenPageIds.has(p.id)) {
          seenPageIds.add(p.id);
          pages.push(p);
        }
      });
      opts.pixels.forEach((p) => {
        if (!seenPixelIds.has(p.id)) {
          seenPixelIds.add(p.id);
          pixels.push(p);
        }
      });
      opts.instagramAccounts.forEach((ig) => {
        if (!seenIgIds.has(ig.id)) {
          seenIgIds.add(ig.id);
          instagramAccounts.push(ig);
        }
      });
    });
    return { pages, pixels, instagramAccounts };
  }, [setupOptionsMap]);

  useEffect(() => {
    if (isOpen) {
      if (profile) {
        setForm({ ...profile });
      } else {
        setForm(getDefaults());
      }
      setExpandedSections(new Set(['meta', 'clickup', 'destination']));
      setSetupOptionsMap({});
      setUnlinkedAccountIds(new Set());
      setLinkingAccountId(null);
      setUnlinkingAccountId(null);
    }
  }, [isOpen, profile]);

  // Fetch Meta setup options for ALL linked ad accounts
  useEffect(() => {
    if (!isOpen) return;

    const accountIdsToFetch = linkedAccountIdsKey ? linkedAccountIdsKey.split(',').filter(Boolean) : [];
    if (accountIdsToFetch.length === 0) return;

    setOptionsLoading(true);
    let completed = 0;

    accountIdsToFetch.forEach((accountId) => {
      fetch(`/api/meta/campaign-setup/options?storeId=${storeId}&accountId=${accountId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data && !data.error) {
            setSetupOptionsMap((prev) => ({ ...prev, [accountId]: data }));
          }
        })
        .catch(() => {})
        .finally(() => {
          completed++;
          if (completed >= accountIdsToFetch.length) {
            setOptionsLoading(false);
          }
        });
    });
  }, [isOpen, linkedAccountIdsKey, storeId]);

  // Fetch ClickUp lists
  useEffect(() => {
    if (!isOpen) return;

    setClickupLoading(true);
    setClickupConnected(true);
    fetch(`/api/integrations/clickup/available-lists?storeId=${storeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          return fetch(`/api/integrations/clickup/list-mappings?storeId=${storeId}`)
            .then((r2) => r2.json())
            .then((fallback) => {
              if (fallback.connected && fallback.lists) {
                setClickupLists(fallback.lists.map((l: Record<string, unknown>) => ({ id: l.id as string, name: l.name as string })));
              } else {
                setClickupConnected(false);
              }
            });
        }
        if (data.lists && data.lists.length > 0) {
          setClickupLists(
            data.lists.map((l: Record<string, unknown>) => ({
              id: l.id as string,
              name: [l.space && (l.space as Record<string, string>).name, l.folder && (l.folder as Record<string, string>).name, l.name as string]
                .filter(Boolean)
                .join(' > '),
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setClickupLoading(false));
  }, [isOpen, storeId]);

  // Close link dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (linkDropdownRef.current && !linkDropdownRef.current.contains(e.target as Node)) {
        setShowLinkDropdown(false);
      }
    }
    if (showLinkDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLinkDropdown]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const toggleSection = (section: Section) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const updateField = <K extends keyof ProductProfile>(key: K, value: ProductProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateNamingTemplate = (key: keyof NamingTemplate, value: string) => {
    setForm((prev) => ({
      ...prev,
      namingTemplate: { ...(prev.namingTemplate ?? { campaign: '', adset: '', ad: '' }), [key]: value },
    }));
  };

  const addTargetingPreset = () => {
    if (!newPresetName.trim()) return;
    const preset: TargetingPreset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      targeting: {},
    };
    setForm((prev) => ({
      ...prev,
      targetingPresets: [...(prev.targetingPresets ?? []), preset],
    }));
    setNewPresetName('');
  };

  const removeTargetingPreset = (id: string) => {
    setForm((prev) => ({
      ...prev,
      targetingPresets: (prev.targetingPresets ?? []).filter((p) => p.id !== id),
    }));
  };

  const handleLinkAccount = async (accountId: string, currency: string) => {
    setUnlinkedAccountIds((prev) => {
      if (!prev.has(accountId)) return prev;
      const next = new Set(prev);
      next.delete(accountId);
      return next;
    });

    if (!profile?.id) {
      updateField('adAccountId', accountId);
      updateField('adAccountCurrency', currency);
      setShowLinkDropdown(false);
      return;
    }

    if (linkingAccountId) return;
    setLinkingAccountId(accountId);
    try {
      const account = adAccounts.find((item) => item.accountId === accountId);
      const res = await fetch('/api/creative-hub/product-profiles/campaign-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productProfileId: profile.id,
          adAccountId: accountId,
          accountName: account?.name || accountId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to link ad account');
      }
      await fetchProfiles(storeId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to link ad account');
    } finally {
      setLinkingAccountId(null);
    }
    setShowLinkDropdown(false);
  };

  const handleUnlinkAccount = async (accountId: string) => {
    if (unlinkingAccountId) return;

    const account = linkedAccountsInfo.find((item) => item.accountId === accountId);
    const remaining = linkedAccountsInfo.filter((item) => item.accountId !== accountId);
    if (remaining.length === 0) {
      window.alert('Link another ad account before unlinking the last one from this product profile.');
      return;
    }

    if (
      account?.campaignCount &&
      !window.confirm(
        `Unlink ${account.name}? This will remove ${account.campaignCount} linked campaign${account.campaignCount !== 1 ? 's' : ''} from this product profile.`,
      )
    ) {
      return;
    }

    setUnlinkingAccountId(accountId);
    const nextPrimaryAccount = form.adAccountId === accountId ? remaining[0] : null;
    try {
      if (profile?.id && account?.campaignCount) {
        const res = await fetch('/api/creative-hub/product-profiles/campaign-links', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productProfileId: profile.id,
            adAccountId: accountId,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Failed to unlink ad account');
        }
      }

      setUnlinkedAccountIds((prev) => new Set(prev).add(accountId));

      if (nextPrimaryAccount) {
        updateField('adAccountId', nextPrimaryAccount.accountId);
        updateField('adAccountCurrency', nextPrimaryAccount.currency);

        if (profile?.id) {
          await saveProfile({
            ...form,
            storeId: profile.storeId ?? storeId,
            id: profile.id,
            adAccountId: nextPrimaryAccount.accountId,
            adAccountCurrency: nextPrimaryAccount.currency,
          } as Partial<ProductProfile> & { storeId: string });
        }
      }

      if (profile?.id) {
        void fetchProfiles(storeId);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to unlink ad account');
    } finally {
      setUnlinkingAccountId(null);
    }
  };

  const handleSave = async () => {
    if (!form.productName?.trim()) return;
    setSaving(true);
    try {
      await saveProfile({
        ...form,
        storeId: profile?.storeId ?? storeId,
        id: profile?.id,
      } as Partial<ProductProfile> & { storeId: string });

      // Bidirectional ClickUp list mapping save
      const profileId = profile?.id ??
        useCreativeHubStore.getState().profiles.find(
          (p) => p.storeId === storeId && p.productName === form.productName?.trim()
        )?.id;

      if (form.clickupListId && profileId) {
        fetch('/api/integrations/clickup/list-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            listId: form.clickupListId,
            productId: profileId,
            productName: form.productName,
          }),
        }).catch(() => {});
      }

      onClose();
    } catch {
      // Error toast handled by store
    } finally {
      setSaving(false);
    }
  };

  const isNew = !profile;
  const selectCls =
    'w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
  const inputCls = selectCls;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl mx-4 rounded-xl bg-surface-elevated shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header — with product image thumbnail and bold name */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            {!isNew && form.productImage ? (
              <img
                src={form.productImage}
                alt={form.productName ?? ''}
                className="h-8 w-8 rounded-lg object-cover border border-border flex-shrink-0"
              />
            ) : !isNew ? (
              <div className="h-8 w-8 rounded-lg bg-surface-hover border border-border flex items-center justify-center flex-shrink-0">
                <ImageIcon className="h-4 w-4 text-text-dimmed" />
              </div>
            ) : null}
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {isNew ? 'New Product Profile' : 'Edit Product Profile'}
              </h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {isNew ? (
                  'Configure once, launch many times'
                ) : (
                  <span className="font-semibold text-text-primary">{form.productName}</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-dimmed hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">
          {sectionConfig.map(({ id, label, Icon }) => {
            const isExpanded = expandedSections.has(id);
            return (
              <div key={id} className={cn("border border-border rounded-lg", isExpanded ? 'overflow-visible' : 'overflow-hidden')}>
                <button
                  onClick={() => toggleSection(id)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-surface-hover/50 transition-colors"
                >
                  <Icon className="h-4 w-4 text-text-dimmed flex-shrink-0" />
                  <span className="text-sm font-medium text-text-primary flex-1">{label}</span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-text-dimmed" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-text-dimmed" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-border bg-surface-hover/20">
                    {id === 'meta' && (
                      <div className="space-y-5">
                        {/* ── Linked Ad Accounts Section ── */}
                        <div>
                          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                            Linked Ad Accounts
                          </p>
                          <div className="space-y-1.5">
                            {linkedAccountsInfo.length === 0 && (
                              <p className="text-sm text-text-dimmed italic py-2">
                                No ad accounts linked. Add one below.
                              </p>
                            )}
                            {linkedAccountsInfo.map((account) => (
                              <div
                                key={account.accountId}
                                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-surface"
                              >
                                <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                                <span className="text-sm text-text-primary flex-1 truncate">
                                  {account.name}
                                </span>
                                <span className="text-xs text-text-dimmed">
                                  ({account.currency})
                                </span>
                                {account.campaignCount > 0 && (
                                  <span className="text-[10px] text-text-dimmed bg-surface-hover px-1.5 py-0.5 rounded">
                                    {account.campaignCount} campaign{account.campaignCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleUnlinkAccount(account.accountId)}
                                  disabled={!!unlinkingAccountId}
                                  className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-text-dimmed transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/30"
                                  aria-label={`Unlink ${account.name}`}
                                  title="Unlink account"
                                >
                                  {unlinkingAccountId === account.accountId ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Unlink className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            ))}

                            {/* Link Ad Account dropdown */}
                            <div ref={linkDropdownRef} className="relative">
                              <button
                                type="button"
                                onClick={() => setShowLinkDropdown((prev) => !prev)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:border-primary/50 transition-colors"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Link Ad Account
                                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showLinkDropdown && 'rotate-180')} />
                              </button>
                              {showLinkDropdown && (
                                <div className="absolute z-50 mt-1 w-80 rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
                                  {availableAccountsToLink.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-xs text-text-dimmed">
                                      All store ad accounts are already linked.
                                    </div>
                                  ) : (
                                    <div className="max-h-[200px] overflow-y-auto py-1">
                                      {availableAccountsToLink.map((account) => (
                                        <button
                                          key={account.id}
                                          type="button"
                                          onClick={() => handleLinkAccount(account.accountId, account.currency)}
                                          disabled={!!linkingAccountId}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {linkingAccountId === account.accountId ? (
                                            <Loader2 className="h-3.5 w-3.5 text-text-dimmed flex-shrink-0 animate-spin" />
                                          ) : (
                                            <Plus className="h-3.5 w-3.5 text-text-dimmed flex-shrink-0" />
                                          )}
                                          <span className="truncate flex-1 text-text-primary">
                                            {account.name || account.accountId}
                                          </span>
                                          <span className="text-xs text-text-dimmed">
                                            ({account.currency})
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* ── BM Display (read-only pills) ── */}
                        {bmPills.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2">
                              Business Managers
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {bmPills.map((bm) => (
                                <span
                                  key={bm.id}
                                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                >
                                  {bm.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ── Page / Pixel / IG / Conversion ── */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Facebook Page — dropdown with names */}
                          <FormField label="Facebook Page">
                            {optionsLoading ? (
                              <p className="text-xs text-text-secondary py-2">Loading pages...</p>
                            ) : mergedSetupOptions.pages.length > 0 ? (
                              <select
                                value={form.pageId ?? ''}
                                onChange={(e) => {
                                  updateField('pageId', e.target.value);
                                  const page = mergedSetupOptions.pages.find((p) => p.id === e.target.value);
                                  if (page?.name) {
                                    updateField('pageName', page.name);
                                  }
                                  if (page?.instagramAccountId) {
                                    updateField('instagramActorId', page.instagramAccountId);
                                    updateField('instagramUsername', page.instagramUsername ?? '');
                                  }
                                }}
                                className={selectCls}
                              >
                                <option value="">Select a page...</option>
                                {/* Include saved page if not in options list */}
                                {form.pageId && !mergedSetupOptions.pages.some(p => p.id === form.pageId) && (
                                  <option value={form.pageId}>
                                    {form.pageName || profile?.pageName || form.pageId} (saved)
                                  </option>
                                )}
                                {mergedSetupOptions.pages.map((page) => (
                                  <option key={page.id} value={page.id}>
                                    {page.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={form.pageId ?? ''}
                                onChange={(e) => updateField('pageId', e.target.value)}
                                placeholder="Page ID"
                                className={inputCls}
                              />
                            )}
                          </FormField>

                          {/* Instagram — dropdown with @usernames */}
                          <FormField label="Instagram Account">
                            {optionsLoading ? (
                              <p className="text-xs text-text-secondary py-2">Loading...</p>
                            ) : mergedSetupOptions.instagramAccounts.length > 0 ? (
                              <select
                                value={form.instagramActorId ?? ''}
                                onChange={(e) => {
                                  updateField('instagramActorId', e.target.value);
                                  const ig = mergedSetupOptions.instagramAccounts.find((i) => i.id === e.target.value);
                                  updateField('instagramUsername', ig?.username ?? '');
                                }}
                                className={selectCls}
                              >
                                <option value="">No Instagram actor</option>
                                {/* Include saved IG if not in options list */}
                                {form.instagramActorId && !mergedSetupOptions.instagramAccounts.some(ig => ig.id === form.instagramActorId) && (
                                  <option value={form.instagramActorId}>
                                    @{form.instagramUsername || form.instagramActorId} (saved)
                                  </option>
                                )}
                                {mergedSetupOptions.instagramAccounts.map((ig) => (
                                  <option key={ig.id} value={ig.id}>
                                    @{ig.username}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={form.instagramActorId ?? ''}
                                onChange={(e) => updateField('instagramActorId', e.target.value)}
                                placeholder="Instagram actor ID"
                                className={inputCls}
                              />
                            )}
                          </FormField>

                          {/* Pixel — dropdown with names */}
                          <FormField label="Pixel">
                            {optionsLoading ? (
                              <p className="text-xs text-text-secondary py-2">Loading pixels...</p>
                            ) : mergedSetupOptions.pixels.length > 0 ? (
                              <select
                                value={form.pixelId ?? ''}
                                onChange={(e) => {
                                  updateField('pixelId', e.target.value);
                                  const pixel = mergedSetupOptions.pixels.find((p) => p.id === e.target.value);
                                  if (pixel?.name) {
                                    updateField('pixelName', pixel.name);
                                  }
                                }}
                                className={selectCls}
                              >
                                <option value="">Select a pixel...</option>
                                {/* Include saved pixel if not in options list */}
                                {form.pixelId && !mergedSetupOptions.pixels.some(p => p.id === form.pixelId) && (
                                  <option value={form.pixelId}>
                                    {form.pixelName || profile?.pixelName || form.pixelId} (saved)
                                  </option>
                                )}
                                {mergedSetupOptions.pixels.map((pixel) => (
                                  <option key={pixel.id} value={pixel.id}>
                                    {pixel.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={form.pixelId ?? ''}
                                onChange={(e) => updateField('pixelId', e.target.value)}
                                placeholder="Pixel ID"
                                className={inputCls}
                              />
                            )}
                          </FormField>

                          <FormField label="Conversion Event">
                            <select
                              value={form.conversionEvent ?? 'PURCHASE'}
                              onChange={(e) => updateField('conversionEvent', e.target.value)}
                              className={selectCls}
                            >
                              <option value="PURCHASE">Purchase</option>
                              <option value="ADD_TO_CART">Add to Cart</option>
                              <option value="INITIATE_CHECKOUT">Initiate Checkout</option>
                              <option value="LEAD">Lead</option>
                              <option value="COMPLETE_REGISTRATION">Complete Registration</option>
                              <option value="VIEW_CONTENT">View Content</option>
                            </select>
                          </FormField>
                        </div>
                      </div>
                    )}

                    {id === 'clickup' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="ClickUp List">
                          {clickupLoading ? (
                            <p className="text-xs text-text-secondary py-2">Loading lists...</p>
                          ) : !clickupConnected ? (
                            <p className="text-xs text-text-secondary py-2">
                              ClickUp not connected. Connect ClickUp in Settings &rarr; Integrations.
                            </p>
                          ) : clickupLists.length > 0 ? (
                            <ClickUpListSearchDropdown
                              lists={clickupLists}
                              selectedId={form.clickupListId ?? ''}
                              savedListId={form.clickupListId}
                              savedListName={form.clickupListName || profile?.clickupListName}
                              onSelect={(listId, listName) => {
                                updateField('clickupListId', listId);
                                const segments = listName.split(' > ');
                                updateField('clickupListName', segments[segments.length - 1] || listName);
                              }}
                              className={selectCls}
                            />
                          ) : (
                            <p className="text-xs text-text-secondary py-2">
                              No ClickUp lists found in your workspace. Add lists in ClickUp first.
                            </p>
                          )}
                        </FormField>
                        <FormField label="Sync Interval (minutes)">
                          <select
                            value={form.clickupSyncInterval ?? 60}
                            onChange={(e) => updateField('clickupSyncInterval', Number(e.target.value))}
                            className={selectCls}
                          >
                            <option value={15}>Every 15 min</option>
                            <option value={30}>Every 30 min</option>
                            <option value={60}>Every 1 hour</option>
                            <option value={360}>Every 6 hours</option>
                            <option value={1440}>Daily</option>
                          </select>
                        </FormField>
                      </div>
                    )}

                    {id === 'destination' && (
                      <div className="grid grid-cols-1 gap-4">
                        <FormField label="Destination URL">
                          <input
                            type="url"
                            value={form.destinationUrl ?? ''}
                            onChange={(e) => updateField('destinationUrl', e.target.value)}
                            placeholder="https://yourstore.com/products/..."
                            className={inputCls}
                          />
                        </FormField>
                        <FormField label="UTM Template">
                          <input
                            type="text"
                            value={form.utmTemplate || ''}
                            onChange={(e) => updateField('utmTemplate', e.target.value)}
                            placeholder={DEFAULT_UTM_TEMPLATE}
                            className={inputCls}
                          />
                          {!form.utmTemplate && (
                            <button
                              type="button"
                              onClick={() => updateField('utmTemplate', DEFAULT_UTM_TEMPLATE)}
                              className="text-[11px] text-blue-600 hover:underline mt-1"
                            >
                              Use default UTM template
                            </button>
                          )}
                          <p className="text-[11px] text-text-dimmed mt-1">
                            Available tokens: {'{{campaign.name}}'}, {'{{adset.name}}'}, {'{{ad.name}}'}, {'{{campaign.id}}'}, {'{{adset.id}}'}, {'{{ad.id}}'}
                          </p>
                        </FormField>
                      </div>
                    )}

                    {id === 'product' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="Product Name" required>
                          <input
                            type="text"
                            value={form.productName ?? ''}
                            onChange={(e) => updateField('productName', e.target.value)}
                            placeholder="e.g. Premium Moisturizer"
                            className={inputCls}
                          />
                        </FormField>
                        <FormField label="Average Order Value">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dimmed text-sm">$</span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={form.averageOrderValue ?? ''}
                              onChange={(e) =>
                                updateField('averageOrderValue', e.target.value ? Number(e.target.value) : undefined)
                              }
                              placeholder="0.00"
                              className={cn(inputCls, 'pl-7')}
                            />
                          </div>
                        </FormField>
                        <FormField label="Product Image URL" colSpan2>
                          <input
                            type="url"
                            value={form.productImage ?? ''}
                            onChange={(e) => updateField('productImage', e.target.value)}
                            placeholder="https://..."
                            className={inputCls}
                          />
                        </FormField>
                      </div>
                    )}

                    {id === 'aiKill' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label={`Min Spend Before Kill (${form.adAccountCurrency ?? 'USD'})`}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={form.aiMinSpend ?? ''}
                            onChange={(e) =>
                              updateField('aiMinSpend', e.target.value ? Number(e.target.value) : undefined)
                            }
                            placeholder="e.g. 30"
                            className={inputCls}
                          />
                        </FormField>
                        <FormField label="Min Impressions">
                          <input
                            type="number"
                            min={0}
                            value={form.aiMinImpressions ?? 100}
                            onChange={(e) => updateField('aiMinImpressions', Number(e.target.value))}
                            className={inputCls}
                          />
                        </FormField>
                        <FormField label="Min Hours Before Eval">
                          <input
                            type="number"
                            min={1}
                            value={form.aiMinHours ?? 24}
                            onChange={(e) => updateField('aiMinHours', Number(e.target.value))}
                            className={inputCls}
                          />
                        </FormField>
                        <FormField label="Evaluation Frequency">
                          <select
                            value={form.aiEvalFrequency ?? '6h'}
                            onChange={(e) => updateField('aiEvalFrequency', e.target.value)}
                            className={selectCls}
                          >
                            <option value="1h">Every 1 hour</option>
                            <option value="3h">Every 3 hours</option>
                            <option value="6h">Every 6 hours</option>
                            <option value="12h">Every 12 hours</option>
                            <option value="24h">Every 24 hours</option>
                          </select>
                        </FormField>
                      </div>
                    )}

                    {id === 'targeting' && (
                      <div className="space-y-3">
                        {(form.targetingPresets ?? []).length === 0 && (
                          <p className="text-sm text-text-dimmed italic">No targeting presets saved yet.</p>
                        )}
                        {(form.targetingPresets ?? []).map((preset) => (
                          <div
                            key={preset.id}
                            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 bg-white"
                          >
                            <GripVertical className="h-3.5 w-3.5 text-text-dimmed flex-shrink-0" />
                            <span className="text-sm text-text-primary flex-1">{preset.name}</span>
                            <button
                              onClick={() => removeTargetingPreset(preset.id)}
                              className="text-text-dimmed hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="text"
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addTargetingPreset()}
                            placeholder="New preset name..."
                            className={cn(inputCls, 'flex-1')}
                          />
                          <button
                            onClick={addTargetingPreset}
                            disabled={!newPresetName.trim()}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                              newPresetName.trim()
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-100 text-text-dimmed cursor-not-allowed'
                            )}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    {id === 'naming' && (
                      <div className="space-y-4">
                        <FormField label="Campaign Pattern">
                          <input
                            type="text"
                            value={form.namingTemplate?.campaign ?? ''}
                            onChange={(e) => updateNamingTemplate('campaign', e.target.value)}
                            placeholder="{product}_{type}_{date}"
                            className={inputCls}
                          />
                        </FormField>
                        <FormField label="Adset Pattern">
                          <input
                            type="text"
                            value={form.namingTemplate?.adset ?? ''}
                            onChange={(e) => updateNamingTemplate('adset', e.target.value)}
                            placeholder="{targeting}_{budget}"
                            className={inputCls}
                          />
                        </FormField>
                        <FormField label="Ad Pattern">
                          <input
                            type="text"
                            value={form.namingTemplate?.ad ?? ''}
                            onChange={(e) => updateNamingTemplate('ad', e.target.value)}
                            placeholder="{creative}_{hook}"
                            className={inputCls}
                          />
                        </FormField>
                        {/* Preview */}
                        <div className="rounded-lg bg-surface-hover/50 border border-border px-3 py-2.5">
                          <p className="text-[11px] font-medium text-text-dimmed uppercase tracking-wider mb-1.5">Preview</p>
                          <div className="space-y-1 text-xs text-text-secondary">
                            <p>
                              <span className="text-text-dimmed">Campaign:</span>{' '}
                              {(form.namingTemplate?.campaign ?? '{product}_{type}_{date}')
                                .replace('{product}', form.productName || 'Product')
                                .replace('{type}', 'Testing')
                                .replace('{date}', '2026-03-23')}
                            </p>
                            <p>
                              <span className="text-text-dimmed">Adset:</span>{' '}
                              {(form.namingTemplate?.adset ?? '{targeting}_{budget}')
                                .replace('{targeting}', 'Broad')
                                .replace('{budget}', String(form.defaultBudget ?? 20))}
                            </p>
                            <p>
                              <span className="text-text-dimmed">Ad:</span>{' '}
                              {(form.namingTemplate?.ad ?? '{creative}_{hook}')
                                .replace('{creative}', 'Creative-1')
                                .replace('{hook}', 'Hook-A')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {id === 'campaigns' && (
                      <div className="space-y-2">
                        {realLinkedCampaigns.length === 0 && (
                          <p className="text-sm text-text-dimmed italic">No campaigns linked to this profile.</p>
                        )}
                        {realLinkedCampaigns.map((link) => (
                          <div
                            key={link.id}
                            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 bg-surface"
                          >
                            <span className="text-sm text-text-primary flex-1 truncate">{link.campaignName}</span>
                            <span className="text-[10px] text-text-dimmed bg-surface-hover px-1.5 py-0.5 rounded">
                              {adAccounts.find((a) => a.accountId === link.adAccountId)?.name || link.adAccountId}
                            </span>
                            <select
                              value={link.campaignType}
                              className="w-28 rounded-lg border border-border bg-surface-hover px-2 py-1 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                              onChange={() => {
                                /* Campaign type change would be handled via store */
                              }}
                            >
                              <option value="testing">Testing</option>
                              <option value="scaling">Scaling</option>
                              <option value="retargeting">Retargeting</option>
                            </select>
                            <button className="text-text-dimmed hover:text-red-500 transition-colors text-xs">
                              Unlink
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.productName?.trim()}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              saving || !form.productName?.trim()
                ? 'bg-blue-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isNew ? 'Create Profile' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Reusable form field ── */

// Searchable dropdown for ClickUp lists, grouped by Space > Folder path
function ClickUpListSearchDropdown({
  lists,
  selectedId,
  savedListId,
  savedListName,
  onSelect,
  className,
}: {
  lists: Array<{ id: string; name: string }>;
  selectedId: string;
  savedListId?: string;
  savedListName?: string;
  onSelect: (listId: string, listName: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Include saved list in options if not already present
  const allLists = useMemo(() => {
    if (savedListId && !lists.some((l) => l.id === savedListId)) {
      return [
        { id: savedListId, name: savedListName || savedListId },
        ...lists,
      ];
    }
    return lists;
  }, [lists, savedListId, savedListName]);

  const filtered = useMemo(() => {
    if (!search.trim()) return allLists;
    const q = search.toLowerCase();
    return allLists.filter((l) => l.name.toLowerCase().includes(q));
  }, [allLists, search]);

  const selectedList = allLists.find((l) => l.id === selectedId);
  const displayName = selectedList?.name ?? '';

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setSearch('');
        }}
        className={cn(
          className,
          'flex items-center justify-between gap-2 text-left cursor-pointer',
          !selectedId && 'text-text-dimmed'
        )}
      >
        <span className="truncate flex-1">
          {selectedId ? displayName : 'Select a list...'}
        </span>
        <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-text-dimmed transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dimmed" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lists..."
                className="w-full rounded-md border border-border bg-surface-hover py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setOpen(false);
                  } else if (e.key === 'Enter' && filtered.length === 1) {
                    onSelect(filtered[0].id, filtered[0].name);
                    setOpen(false);
                  }
                }}
              />
            </div>
          </div>

          {/* List items */}
          <div className="max-h-[220px] overflow-y-auto py-1">
            {/* Clear selection option */}
            <button
              type="button"
              onClick={() => {
                onSelect('', '');
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover',
                !selectedId && 'text-primary font-medium'
              )}
            >
              <span className="w-4 h-4 flex-shrink-0" />
              <span className="text-text-dimmed italic">None</span>
            </button>

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-dimmed">
                No lists match &ldquo;{search}&rdquo;
              </div>
            ) : (
              filtered.map((list) => {
                const isSelected = list.id === selectedId;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => {
                      onSelect(list.id, list.name);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover',
                      isSelected && 'bg-primary/5 text-primary font-medium'
                    )}
                  >
                    <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                    <span className="truncate">{list.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  required,
  children,
  colSpan2,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  colSpan2?: boolean;
}) {
  return (
    <label className={cn('block', colSpan2 && 'col-span-2')}>
      <span className="text-xs font-medium text-text-secondary mb-1 block">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
