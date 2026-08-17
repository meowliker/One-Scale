'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, DragEvent, ReactNode, SetStateAction } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { fromZonedTime } from 'date-fns-tz';
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAccountOnlyCampaignLink } from '@/lib/creative-hub/account-links';
import { CreativePreviewModal } from '@/components/creative-hub/CreativePreviewModal';
import {
  ExternalLaunchErrorPage,
  type ExternalLaunchIssue,
} from '@/components/creative-hub/launch-creative/ExternalLaunchErrorPage';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import type {
  BidStrategy,
  ClickUpFieldValue,
  CopyItem,
  CreativeFormat,
  InboxCreative,
  LaunchConfig,
  ProductCampaignLink,
  ProductProfile,
  TargetingSpec,
  VideoThumbnailSelection,
} from '@/types/creativeHub';

type SortKey = 'created' | 'due' | 'name' | 'status' | 'format' | 'folder' | 'age';
type SortDirection = 'asc' | 'desc';
type FilterValue = 'all' | string;
type LaunchCreativeStep = 'creatives' | 'campaign' | 'batching' | 'copy' | 'config' | 'review';
type CampaignMode = 'existing' | 'new';
type CampaignStructure = 'ABO' | 'CBO';
type AdSetMode = 'existing' | 'new';
type BatchMode = 'single' | 'multiple';
type SplitPreset = 'one_per_adset' | 'three_per_adset' | 'folder_split' | 'manual';
type CopyDraftSource = 'winner' | 'inherited' | 'manual' | 'ai';
type LaunchTiming = 'immediate' | 'scheduled';
type LaunchProgressDisplayStage = LaunchUploadStage | 'waiting';

interface InboxResponse {
  creatives?: InboxCreative[];
  cached?: boolean;
  cacheMeta?: { lastSyncedAt?: string | null };
  lastSyncedAt?: string | null;
  syncedAt?: string | null;
  error?: string;
  notConnected?: boolean;
  notConfigured?: boolean;
}

interface MetaCampaignOption {
  campaignId: string;
  campaignName: string;
  campaignType: ProductCampaignLink['campaignType'];
  adAccountId?: string;
  objective?: string;
  effectiveStatus?: string;
  isActive: boolean;
  linkedAt?: string;
  startDate?: string;
  updatedTime?: string;
  campaignDailyBudget?: number;
  campaignLifetimeBudget?: number | null;
  campaignBidStrategy?: string;
}

interface MetaAdSetOption {
  id: string;
  name: string;
  status?: string;
  spend?: number;
  dailyBudget?: number;
  lifetimeBudget?: number | null;
  bidStrategy?: string | null;
  bidAmount?: number | null;
  optimizationGoal?: string | null;
  billingEvent?: string | null;
  attributionSpec?: Array<{ event_type?: string; window_days?: number }> | null;
  promotedObject?: Record<string, unknown> | null;
  updatedTime?: string;
  startDate?: string;
  targeting?: {
    locations?: string[];
    excludedLocations?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: number[];
    publisherPlatforms?: string[];
    facebookPositions?: string[];
    instagramPositions?: string[];
    customAudiences?: { id: string; name?: string }[];
    excludedCustomAudiences?: { id: string; name?: string }[];
    flexibleSpec?: TargetingSpec['flexibleSpec'];
  };
}

interface InheritedAdSettings {
  sourceAdId: string;
  sourceAdName: string;
  sourceAdSetId: string;
  sourceAdSetName: string;
  sourceMode: 'selected_adset' | 'latest_adset';
  sourceAdCount?: number;
  sourceCampaignId?: string;
  sourceCampaignName?: string;
  updatedAt?: string;
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  ctaType?: string;
  destinationUrl?: string;
  urlTags?: string;
}

interface BatchPlanItem {
  id: string;
  name: string;
  creativeIds: string[];
  ads?: AdPlanItem[];
  existingAdSetId?: string;
  existingAdSetName?: string;
}

interface AdPlanItem {
  id: string;
  name: string;
  creativeIds: string[];
}

interface CopyDraftItem {
  id: string;
  text: string;
  selected: boolean;
  source: CopyDraftSource;
}

interface AiCopyVariantsResponse {
  primaryTexts?: string[];
  headlines?: string[];
  descriptions?: string[];
  model?: string;
  error?: string;
}

interface LaunchConfigDraft {
  launchStatus: 'ACTIVE' | 'PAUSED';
  launchPaused: boolean;
  launchTiming: LaunchTiming;
  scheduledAt: string;
  dailyBudget: string;
  adSetDailyMinSpend: string;
  adSetDailyMaxSpend: string;
  bidStrategy: BidStrategy;
  bidAmount: string;
  optimizationGoal: string;
  billingEvent: string;
  conversionEvent: string;
  advantageCreative: boolean;
  useTestDuration: boolean;
  testDuration: string;
  attribution: string;
  destinationUrl: string;
  urlTags: string;
  ageMin: string;
  ageMax: string;
  gender: 'all' | 'male' | 'female';
  includeLocations: string[];
  excludeLocations: string[];
}

interface ThumbnailDraft extends VideoThumbnailSelection {
  previewUrl?: string;
  uploading?: boolean;
  framePreparing?: boolean;
  framePickerOpen?: boolean;
  videoPreviewUrl?: string;
  error?: string;
}

type LaunchUploadStage = 'queued' | 'downloading' | 'uploading' | 'ready' | 'skipped' | 'error';

interface LaunchUploadProgress {
  creativeId: string;
  creativeName: string;
  stage: LaunchUploadStage;
  progress: number;
  message: string;
  error?: string;
}

interface LaunchSubmitResult {
  testId?: string;
  status?: string;
  scheduledFor?: string;
  campaignId?: string;
  items?: Array<Record<string, unknown>>;
  externalCallback?: {
    attempted: boolean;
    delivered: boolean;
    error?: string;
  };
  clickupSync?: {
    attempted: number;
    updated: number;
    failed: number;
    errors?: string[];
  };
  googleSheetSync?: {
    configured?: boolean;
    attempted: number;
    updated: number;
    failed: number;
    notFound?: number;
    notUpdatedTaskNames?: string[];
    errors?: string[];
  };
  error?: string;
}

interface UploadResponse {
  creativeId?: string;
  metaAssetId?: string;
  metaAssetType?: 'IMAGE' | 'VIDEO' | string;
  thumbnailUrl?: string;
  error?: string;
}

interface LaunchAdAccountOption {
  accountId: string;
  name: string;
  currency: string;
  campaignCount: number;
}

interface ExternalLaunchContext {
  source: string;
  storeId: string;
  productId: string;
  clickupTaskIds: string[];
  launchId: string;
  returnUrl: string;
  callbackUrl: string;
}

const formatIcons: Record<CreativeFormat, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  carousel: LayoutGrid,
};

const formatLabels: Record<CreativeFormat, string> = {
  image: 'Image',
  video: 'Video',
  carousel: 'Carousel',
};

const futureSteps = ['Creative selection', 'Campaign + ad sets', 'Batching', 'Copy', 'Launch config', 'Review'];

const COUNTRY_CODES = [
  'AF', 'AX', 'AL', 'DZ', 'AS', 'AD', 'AO', 'AI', 'AQ', 'AG', 'AR', 'AM', 'AW', 'AU', 'AT', 'AZ',
  'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ', 'BJ', 'BM', 'BT', 'BO', 'BQ', 'BA', 'BW', 'BV', 'BR',
  'IO', 'BN', 'BG', 'BF', 'BI', 'CV', 'KH', 'CM', 'CA', 'KY', 'CF', 'TD', 'CL', 'CN', 'CX', 'CC',
  'CO', 'KM', 'CG', 'CD', 'CK', 'CR', 'CI', 'HR', 'CU', 'CW', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO',
  'EC', 'EG', 'SV', 'GQ', 'ER', 'EE', 'SZ', 'ET', 'FK', 'FO', 'FJ', 'FI', 'FR', 'GF', 'PF', 'TF',
  'GA', 'GM', 'GE', 'DE', 'GH', 'GI', 'GR', 'GL', 'GD', 'GP', 'GU', 'GT', 'GG', 'GN', 'GW', 'GY',
  'HT', 'HM', 'VA', 'HN', 'HK', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IM', 'IL', 'IT', 'JM',
  'JP', 'JE', 'JO', 'KZ', 'KE', 'KI', 'KP', 'KR', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY',
  'LI', 'LT', 'LU', 'MO', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT', 'MH', 'MQ', 'MR', 'MU', 'YT', 'MX',
  'FM', 'MD', 'MC', 'MN', 'ME', 'MS', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NC', 'NZ', 'NI',
  'NE', 'NG', 'NU', 'NF', 'MK', 'MP', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH',
  'PN', 'PL', 'PT', 'PR', 'QA', 'RE', 'RO', 'RU', 'RW', 'BL', 'SH', 'KN', 'LC', 'MF', 'PM', 'VC',
  'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SX', 'SK', 'SI', 'SB', 'SO', 'ZA', 'GS',
  'SS', 'ES', 'LK', 'SD', 'SR', 'SJ', 'SE', 'CH', 'SY', 'TW', 'TJ', 'TZ', 'TH', 'TL', 'TG', 'TK',
  'TO', 'TT', 'TN', 'TR', 'TM', 'TC', 'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UM', 'UY', 'UZ', 'VU',
  'VE', 'VN', 'VG', 'VI', 'WF', 'EH', 'YE', 'ZM', 'ZW',
];

const COUNTRY_OPTIONS = (() => {
  const displayNames =
    typeof Intl !== 'undefined' && 'DisplayNames' in Intl
      ? new Intl.DisplayNames(undefined, { type: 'region' })
      : null;

  return uniqueTexts([
    'Worldwide',
    ...COUNTRY_CODES.map((code) => displayNames?.of(code) || code),
  ]).sort(compareText);
})();

const COUNTRY_NAME_BY_CODE = (() => {
  const displayNames =
    typeof Intl !== 'undefined' && 'DisplayNames' in Intl
      ? new Intl.DisplayNames(undefined, { type: 'region' })
      : null;
  const map = new Map<string, string>();
  for (const code of COUNTRY_CODES) {
    map.set(code, displayNames?.of(code) || code);
  }
  map.set('UK', map.get('GB') || 'United Kingdom');
  return map;
})();

const COUNTRY_LOOKUP = (() => {
  const map = new Map<string, string>();
  for (const country of COUNTRY_OPTIONS) {
    map.set(country.toLowerCase(), country);
  }
  for (const [code, country] of COUNTRY_NAME_BY_CODE.entries()) {
    map.set(code.toLowerCase(), country);
  }
  return map;
})();

function parseDateValue(value?: string): number | null {
  if (!value) return null;
  const asNumber = Number(value);
  const date = Number.isFinite(asNumber) && value.length >= 10 ? new Date(asNumber) : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

function formatShortDate(value?: string): string {
  const time = parseDateValue(value);
  if (!time) return '—';
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(time);
}

function formatRelativeDays(value?: string): string {
  const time = parseDateValue(value);
  if (!time) return '—';
  const diff = Date.now() - time;
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return '1d';
  return `${days}d`;
}

function fieldValue(fields: ClickUpFieldValue[] | undefined, names: string[]): string {
  if (!fields?.length) return '';
  const needles = names.map((name) => name.toLowerCase());
  const match = fields.find((field) => {
    const name = field.name.toLowerCase();
    return needles.some((needle) => name.includes(needle));
  });
  return match?.value?.trim() || '';
}

function getCreativeCreatedAt(creative: InboxCreative): string | undefined {
  return creative.uploadedAt || creative.driveCreatedAt || creative.clickupCreatedAt;
}

function getGroupCreatedAt(creatives: InboxCreative[]): string | undefined {
  const createdTimes = creatives
    .map((creative) => getCreativeCreatedAt(creative))
    .map((value) => ({ value, time: parseDateValue(value) }))
    .filter((entry): entry is { value: string; time: number } => Boolean(entry.value && entry.time));

  if (!createdTimes.length) return undefined;

  createdTimes.sort((a, b) => a.time - b.time);
  return createdTimes[0].value;
}

function getGroupName(creative: InboxCreative): string {
  if (creative.sourceType === 'clickup_attachment') {
    return (
      creative.clickupTaskName ||
      creative.clickupTaskContext?.folder?.name ||
      creative.creativeName ||
      'Ungrouped creatives'
    );
  }

  return (
    creative.driveParentFolderName ||
    creative.clickupTaskName ||
    creative.clickupTaskContext?.folder?.name ||
    creative.creativeName ||
    'Ungrouped creatives'
  );
}

function getOrigin(creative: InboxCreative): string {
  return fieldValue(creative.clickupCustomFields, ['origin', 'brief', 'source']) || creative.angle || '—';
}

function getFunnel(creative: InboxCreative): string {
  return fieldValue(creative.clickupCustomFields, ['funnel', 'stage']) || '—';
}

function getHook(creative: InboxCreative): string {
  return creative.hook || fieldValue(creative.clickupCustomFields, ['hook', 'pattern']) || '—';
}

function getEditor(creative: InboxCreative): string {
  return (
    fieldValue(creative.clickupCustomFields, ['editor', 'edited by', 'video editor', 'creative editor']) ||
    creative.clickupAssignees?.[0]?.username ||
    creative.creator ||
    creative.clickupTaskContext?.creator?.username ||
    '—'
  );
}

function getReviewer(creative: InboxCreative): string {
  const customReviewer = fieldValue(creative.clickupCustomFields, [
    'reviewer',
    'reviewed by',
    'review by',
    'creative reviewer',
    'qa reviewer',
    'approval owner',
  ]);
  if (customReviewer) return customReviewer;

  const editor = getEditor(creative);
  const fallbackReviewers = [
    ...(creative.clickupTaskContext?.watchers || []),
    ...(creative.clickupAssignees || []).slice(1),
  ]
    .map((person) => person.username)
    .filter((name, index, names) => name && name !== editor && names.indexOf(name) === index);

  return fallbackReviewers[0] || '—';
}

function getStatusLabel(creative: InboxCreative): string {
  return creative.clickupTaskStatus || 'Ready to Launch';
}

function getCreativeName(creative: InboxCreative): string {
  return creative.clickupAttachmentName || creative.creativeName || creative.clickupTaskName || 'Creative';
}

function isVideoCreative(creative: InboxCreative): boolean {
  return creative.creativeFormat === 'video' || creative.metaAssetType === 'VIDEO';
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function getSortValue(creative: InboxCreative, sortKey: SortKey): string | number {
  switch (sortKey) {
    case 'created':
      return parseDateValue(getCreativeCreatedAt(creative)) ?? 0;
    case 'due':
      return parseDateValue(creative.clickupTaskContext?.dueDate) ?? 0;
    case 'status':
      return getStatusLabel(creative);
    case 'format':
      return creative.creativeFormat;
    case 'folder':
      return getGroupName(creative);
    case 'age':
      return parseDateValue(creative.clickupUpdatedAt || creative.clickupCreatedAt) ?? 0;
    case 'name':
    default:
      return getCreativeName(creative);
  }
}

function summarizeFormats(creatives: InboxCreative[]): string {
  const counts = creatives.reduce<Record<string, number>>((acc, creative) => {
    acc[creative.creativeFormat] = (acc[creative.creativeFormat] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([format, count]) => `${count} ${formatLabels[format as CreativeFormat] || format}`)
    .join(' · ');
}

function productNameById(profiles: ProductProfile[], id?: string): string {
  if (!id) return 'All products';
  return profiles.find((profile) => profile.id === id)?.productName || 'Selected product';
}

function inferCreativeTypeLabel(creatives: InboxCreative[]): string {
  const formats = Array.from(new Set(creatives.map((creative) => creative.creativeFormat)));
  if (formats.length === 0) return 'Creative';
  if (formats.length > 1) return 'Mixed';
  return formatLabels[formats[0]] || 'Creative';
}

function shortProductCampaignName(productName: string): string {
  const cleaned = productName.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  const firstMeaningfulWord = cleaned.split(/\s+/).find((word) => /[a-z0-9]/i.test(word));
  return firstMeaningfulWord || cleaned || 'Product';
}

function formatCampaignNameDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
}

function buildDefaultCampaignName(
  productName: string,
  creatives: InboxCreative[],
  structure: CampaignStructure,
): string {
  return `${shortProductCampaignName(productName)} ${inferCreativeTypeLabel(creatives)} | ${structure} ${formatCampaignNameDate()}`;
}

function inferCampaignType(campaignName?: string): ProductCampaignLink['campaignType'] {
  const name = String(campaignName || '').toLowerCase();
  if (name.includes('retarget')) return 'retargeting';
  if (name.includes('scale')) return 'scaling';
  return 'testing';
}

function isCboCampaign(campaign?: MetaCampaignOption): boolean {
  return Boolean(
    campaign &&
      ((campaign.campaignDailyBudget ?? 0) > 0 || (campaign.campaignLifetimeBudget ?? 0) > 0),
  );
}

function getStatusText(status?: string, isActive?: boolean): string {
  if (status) return status.replaceAll('_', ' ');
  return isActive ? 'ACTIVE' : 'PAUSED';
}

function campaignMatchesSearch(campaign: MetaCampaignOption, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) return true;
  return [
    campaign.campaignName,
    campaign.campaignId,
    campaign.adAccountId,
    campaign.effectiveStatus,
    campaign.objective,
    campaign.campaignBidStrategy,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearch);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function formatBudget(value?: number | null, currency = 'USD'): string {
  if (!Number.isFinite(value || NaN)) return 'Not set';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDate(value?: string): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getCampaignStatus(row: Record<string, unknown>): string | undefined {
  const policyInfo = asRecord(row.policyInfo);
  return (
    asString(policyInfo?.effectiveStatus) ||
    asString(policyInfo?.configuredStatus) ||
    asString(row.effectiveStatus) ||
    asString(row.effective_status) ||
    asString(row.configuredStatus) ||
    asString(row.configured_status) ||
    asString(row.status)
  );
}

function normalizeCampaign(row: Record<string, unknown>, fallbackAccountId?: string): MetaCampaignOption | null {
  const campaignId = asString(row.id) || asString(row.campaign_id) || asString(row.campaignId);
  if (!campaignId) return null;

  const campaignName =
    asString(row.name) ||
    asString(row.campaign_name) ||
    asString(row.campaignName) ||
    'Untitled campaign';
  const effectiveStatus = getCampaignStatus(row);
  const campaignDailyBudget = asNumber(row.dailyBudget) ?? asNumber(row.daily_budget) ?? asNumber(row.campaignDailyBudget);
  const campaignLifetimeBudget =
    asNumber(row.lifetimeBudget) ??
    asNumber(row.lifetime_budget) ??
    asNumber(row.campaignLifetimeBudget) ??
    null;

  return {
    campaignId,
    campaignName,
    campaignType: inferCampaignType(campaignName),
    adAccountId: normalizeMetaAdAccountId(asString(row.ad_account_id) || asString(row.adAccountId) || fallbackAccountId),
    objective: asString(row.objective),
    effectiveStatus,
    isActive: String(effectiveStatus || '').toUpperCase() === 'ACTIVE',
    startDate: asString(row.startDate) || asString(row.start_time),
    updatedTime: asString(row.updatedTime) || asString(row.updated_time),
    campaignDailyBudget,
    campaignLifetimeBudget,
    campaignBidStrategy:
      asString(row.bidStrategy) ||
      asString(row.bid_strategy) ||
      asString(row.campaignBidStrategy) ||
      asString(row.campaign_bid_strategy),
  };
}

function normalizeMetaAdAccountId(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed.replace(/^act_/, '')}`;
}

function normalizeExternalId(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function parseExternalTaskIds(searchParams: ReturnType<typeof useSearchParams>): string[] {
  const rawValues = [
    searchParams.get('clickupTaskIds'),
    searchParams.get('taskIds'),
    searchParams.get('clickupTaskId'),
    searchParams.get('taskId'),
  ];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of rawValues) {
    for (const part of String(raw || '').split(',')) {
      const id = part.trim();
      const key = normalizeExternalId(id);
      if (!id || seen.has(key)) continue;
      seen.add(key);
      ids.push(id);
    }
  }
  return ids;
}

function buildExternalLaunchContext(searchParams: ReturnType<typeof useSearchParams>): ExternalLaunchContext | null {
  const source = searchParams.get('source') || '';
  const clickupTaskIds = parseExternalTaskIds(searchParams);
  const hasExternalSignal = source.toLowerCase() === 'immuvi' || clickupTaskIds.length > 0;
  if (!hasExternalSignal) return null;

  return {
    source: source || 'external',
    storeId: searchParams.get('storeId') || '',
    productId:
      searchParams.get('productProfileId') ||
      searchParams.get('productId') ||
      searchParams.get('immuviProductId') ||
      searchParams.get('shopifyProductId') ||
      '',
    clickupTaskIds,
    launchId: searchParams.get('launchId') || '',
    returnUrl: searchParams.get('returnUrl') || '',
    callbackUrl: searchParams.get('callbackUrl') || '',
  };
}

function findProfileForExternalProduct(profiles: ProductProfile[], productId: string): ProductProfile | undefined {
  const normalizedProductId = normalizeExternalId(productId);
  if (!normalizedProductId) return undefined;
  return profiles.find((profile) =>
    normalizeExternalId(profile.id) === normalizedProductId ||
    normalizeExternalId(profile.shopifyProductId) === normalizedProductId ||
    normalizeExternalId(profile.productName) === normalizedProductId
  );
}

function findCreativesForExternalTasks(creatives: InboxCreative[], taskIds: string[]): InboxCreative[] {
  const taskSet = new Set(taskIds.map(normalizeExternalId));
  if (taskSet.size === 0) return [];
  return creatives.filter((creative) => {
    const taskId = normalizeExternalId(creative.clickupTaskId);
    return taskId && taskSet.has(taskId);
  });
}

function formatExternalTaskList(taskIds: string[]): string {
  if (taskIds.length === 0) return 'None provided';
  return taskIds.join(', ');
}

function isRawMetaAdAccountLabel(value?: string | null): boolean {
  const text = value?.trim();
  if (!text) return false;
  return /^act_\d+$/i.test(text) || /^\d{8,}$/.test(text);
}

function readableAdAccountName(value?: string | null, fallback = 'Meta ad account'): string {
  const text = value?.trim();
  if (!text || isRawMetaAdAccountLabel(text)) return fallback;
  return text;
}

function normalizeAdSet(row: Record<string, unknown>): MetaAdSetOption | null {
  const id = asString(row.id) || asString(row.adset_id) || asString(row.adsetId);
  if (!id) return null;
  const metrics = asRecord(row.metrics);
  const targeting = asRecord(row.targeting);
  const geoLocations = asRecord(targeting?.geo_locations);
  const excludedGeoLocations = asRecord(targeting?.excluded_geo_locations);
  const promotedObject = asRecord(row.promotedObject) || asRecord(row.promoted_object);
  const locations = uniqueLocations([
    ...normalizeLocationArray(targeting?.locations),
    ...normalizeLocationArray(targeting?.countries),
    ...normalizeLocationArray(geoLocations?.countries),
  ]);
  const excludedLocations = uniqueLocations([
    ...normalizeLocationArray(targeting?.excludedLocations),
    ...normalizeLocationArray(targeting?.excluded_locations),
    ...normalizeLocationArray(excludedGeoLocations?.countries),
  ]);

  return {
    id,
    name: asString(row.name) || asString(row.adset_name) || asString(row.adsetName) || 'Untitled ad set',
    status: asString(row.status) || asString(row.effectiveStatus) || asString(row.effective_status),
    spend: asNumber(metrics?.spend) ?? asNumber(row.spend),
    dailyBudget: asNumber(row.dailyBudget) ?? asNumber(row.daily_budget),
    lifetimeBudget: asNumber(row.lifetimeBudget) ?? asNumber(row.lifetime_budget) ?? null,
    bidStrategy: asString(row.bidStrategy) || asString(row.bid_strategy) || null,
    bidAmount: asNumber(row.bidAmount) ?? asNumber(row.bid_amount) ?? null,
    optimizationGoal: asString(row.optimizationGoal) || asString(row.optimization_goal) || null,
    billingEvent: asString(row.billingEvent) || asString(row.billing_event) || null,
    attributionSpec: Array.isArray(row.attributionSpec)
      ? row.attributionSpec as Array<{ event_type?: string; window_days?: number }>
      : Array.isArray(row.attribution_spec)
        ? row.attribution_spec as Array<{ event_type?: string; window_days?: number }>
        : null,
    promotedObject,
    updatedTime: asString(row.updatedTime) || asString(row.updated_time),
    startDate: asString(row.startDate) || asString(row.start_time),
    targeting: {
      locations,
      excludedLocations,
      ageMin: asNumber(targeting?.ageMin) ?? asNumber(targeting?.age_min),
      ageMax: asNumber(targeting?.ageMax) ?? asNumber(targeting?.age_max),
      genders: normalizeGenderArray(targeting?.genders),
      publisherPlatforms: normalizeStringArray(targeting?.publisherPlatforms || targeting?.publisher_platforms),
      facebookPositions: normalizeStringArray(targeting?.facebookPositions || targeting?.facebook_positions),
      instagramPositions: normalizeStringArray(targeting?.instagramPositions || targeting?.instagram_positions),
      customAudiences: normalizeAudienceArray(targeting?.customAudiences || targeting?.custom_audiences),
      excludedCustomAudiences: normalizeAudienceArray(targeting?.excludedCustomAudiences || targeting?.excluded_custom_audiences),
      flexibleSpec: normalizeFlexibleSpec(targeting?.flexibleSpec || targeting?.flexible_spec),
    },
  };
}

function uniqueTexts(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const texts: string[] = [];
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    texts.push(text);
  }
  return texts;
}

function normalizeLocationName(value?: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  const key = text.toLowerCase();
  return COUNTRY_LOOKUP.get(key) || COUNTRY_NAME_BY_CODE.get(text.toUpperCase()) || text;
}

function uniqueLocations(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const locations: string[] = [];
  for (const value of values) {
    const location = normalizeLocationName(value);
    const key = location.toLowerCase();
    if (!location || seen.has(key)) continue;
    seen.add(key);
    locations.push(location);
  }
  return locations;
}

function getAdUpdatedAt(row: Record<string, unknown>): string | undefined {
  return asString(row.updatedAt) || asString(row.updated_time) || asString(row.createdAt) || asString(row.created_time);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueTexts(value.map((item) => {
    if (typeof item === 'string') return item;
    const record = asRecord(item);
    return asString(record?.text) || asString(record?.value) || asString(record?.name);
  }));
}

function normalizeNestedCreativeStrings(parent: Record<string, unknown> | null | undefined, key: string): string[] {
  if (!parent) return [];
  const direct = normalizeStringArray(parent[key]);
  if (direct.length) return direct;

  const snakeCase = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  if (snakeCase !== key) {
    return normalizeStringArray(parent[snakeCase]);
  }

  return [];
}

function normalizeLocationArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueLocations(value.map((item) => {
    if (typeof item === 'string') return item;
    const record = asRecord(item);
    return asString(record?.name) || asString(record?.key) || asString(record?.country_code);
  }));
}

function normalizeGenderArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const genders = value
    .map((item) => {
      if (typeof item === 'number') return item;
      const text = String(item || '').trim().toLowerCase();
      if (text === 'male' || text === 'men' || text === '1') return 1;
      if (text === 'female' || text === 'women' || text === '2') return 2;
      return undefined;
    })
    .filter((item): item is number => item === 1 || item === 2);
  return Array.from(new Set(genders));
}

function normalizeAudienceArray(value: unknown): { id: string; name?: string }[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const audiences: { id: string; name?: string }[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const id = asString(record?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    audiences.push({ id, name: asString(record?.name) });
  }
  return audiences;
}

function normalizeFlexibleSpec(value: unknown): TargetingSpec['flexibleSpec'] {
  if (!Array.isArray(value)) return undefined;
  const specs: NonNullable<TargetingSpec['flexibleSpec']> = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const interests = normalizeAudienceArray(record.interests)
      .filter((audience): audience is { id: string; name: string } => Boolean(audience.name));
    const behaviors = normalizeAudienceArray(record.behaviors)
      .filter((audience): audience is { id: string; name: string } => Boolean(audience.name));
    if (interests.length || behaviors.length) {
      specs.push({ interests, behaviors });
    }
  }
  return specs.length ? specs : undefined;
}

function normalizeAttributionLabel(value: unknown): string {
  if (!Array.isArray(value)) return '7-day click, 1-day engagement';
  const hasClick7 = value.some((item) => {
    const record = asRecord(item);
    return String(record?.event_type || '').toUpperCase() === 'CLICK_THROUGH' && asNumber(record?.window_days) === 7;
  });
  const hasClick1 = value.some((item) => {
    const record = asRecord(item);
    return String(record?.event_type || '').toUpperCase() === 'CLICK_THROUGH' && asNumber(record?.window_days) === 1;
  });
  const hasView1 = value.some((item) => {
    const record = asRecord(item);
    return String(record?.event_type || '').toUpperCase() === 'VIEW_THROUGH' && asNumber(record?.window_days) === 1;
  });
  const hasEngagedView1 = value.some((item) => {
    const record = asRecord(item);
    return String(record?.event_type || '').toUpperCase() === 'ENGAGED_VIDEO_VIEW' && asNumber(record?.window_days) === 1;
  });

  if (hasClick7 && hasEngagedView1) return '7-day click, 1-day engagement';
  if (hasClick7 && hasView1) return '7-day click, 1-day view';
  if (hasClick1 && hasView1) return '1-day click, 1-day view';
  if (hasClick1) return '1-day click';
  if (hasClick7) return '7-day click';
  return '7-day click, 1-day engagement';
}

function normalizeInheritedAdSettings(
  row: Record<string, unknown>,
  sourceAdSet: MetaAdSetOption,
  sourceMode: InheritedAdSettings['sourceMode'],
): InheritedAdSettings | null {
  const sourceAdId = asString(row.id) || asString(row.ad_id);
  if (!sourceAdId) return null;
  const creative = asRecord(row.creative);
  const assetFeedSpec = asRecord(creative?.assetFeedSpec) || asRecord(creative?.asset_feed_spec);
  const objectStorySpec = asRecord(creative?.objectStorySpec) || asRecord(creative?.object_story_spec);
  const linkData = asRecord(objectStorySpec?.linkData) || asRecord(objectStorySpec?.link_data);
  const videoData = asRecord(objectStorySpec?.videoData) || asRecord(objectStorySpec?.video_data);
  const primaryText =
    asString(creative?.body) ||
    asString(linkData?.message) ||
    asString(videoData?.message) ||
    asString(row.primaryText) ||
    asString(row.primary_text);
  const headline =
    asString(creative?.headline) ||
    asString(creative?.title) ||
    asString(linkData?.name) ||
    asString(videoData?.title) ||
    asString(row.headline);
  const description =
    asString(creative?.description) ||
    asString(creative?.linkDescription) ||
    asString(creative?.link_description) ||
    asString(linkData?.description) ||
    asString(row.description);
  const descriptions = uniqueTexts([
    ...normalizeNestedCreativeStrings(creative, 'descriptions'),
    ...normalizeNestedCreativeStrings(assetFeedSpec, 'descriptions'),
    description,
  ]);

  return {
    sourceAdId,
    sourceAdName: asString(row.name) || asString(row.ad_name) || 'Latest ad',
    sourceAdSetId: sourceAdSet.id,
    sourceAdSetName: sourceAdSet.name,
    sourceMode,
    updatedAt: getAdUpdatedAt(row),
    primaryTexts: uniqueTexts([
      ...normalizeNestedCreativeStrings(creative, 'primaryTexts'),
      ...normalizeNestedCreativeStrings(assetFeedSpec, 'bodies'),
      primaryText,
    ]),
    headlines: uniqueTexts([
      ...normalizeNestedCreativeStrings(creative, 'headlines'),
      ...normalizeNestedCreativeStrings(assetFeedSpec, 'titles'),
      headline,
    ]),
    descriptions,
    ctaType: asString(creative?.ctaType),
    destinationUrl: asString(creative?.destinationUrl),
    urlTags: asString(creative?.urlTags),
  };
}

function mergeInheritedAdSettings(settings: InheritedAdSettings[]): InheritedAdSettings | null {
  const validSettings = settings.filter((item) =>
    item.primaryTexts.length > 0 || item.headlines.length > 0 || item.descriptions.length > 0,
  );
  const first = validSettings[0] || settings[0];
  if (!first) return null;

  const uniqueAdSetNames = uniqueTexts(settings.map((item) => item.sourceAdSetName));
  const sourceAdCount = settings.length;

  return {
    ...first,
    sourceAdId: settings.map((item) => item.sourceAdId).join(','),
    sourceAdName: sourceAdCount > 1 ? `${sourceAdCount} latest ads` : first.sourceAdName,
    sourceAdSetId: settings.map((item) => item.sourceAdSetId).join(','),
    sourceAdSetName:
      sourceAdCount > 1
        ? `${uniqueAdSetNames.length} latest ad set${uniqueAdSetNames.length === 1 ? '' : 's'}`
        : first.sourceAdSetName,
    sourceAdCount,
    updatedAt: first.updatedAt,
    primaryTexts: uniqueTexts(settings.flatMap((item) => item.primaryTexts)),
    headlines: uniqueTexts(settings.flatMap((item) => item.headlines)),
    descriptions: uniqueTexts(settings.flatMap((item) => item.descriptions)),
    ctaType: settings.find((item) => item.ctaType)?.ctaType,
    destinationUrl: settings.find((item) => item.destinationUrl)?.destinationUrl,
    urlTags: settings.find((item) => item.urlTags)?.urlTags,
  };
}

function sortByLatest<T>(items: T[], getDate: (item: T) => string | undefined): T[] {
  return [...items].sort((a, b) => (parseDateValue(getDate(b)) ?? 0) - (parseDateValue(getDate(a)) ?? 0));
}

function uniqueStableId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createCopyDraft(text: string, source: CopyDraftSource, selected = true): CopyDraftItem {
  return {
    id: uniqueStableId(`${source}-copy`),
    text,
    selected,
    source,
  };
}

function copyDraftsFromTexts(texts: string[] | undefined, source: CopyDraftSource, selected = true): CopyDraftItem[] {
  return uniqueTexts(texts || []).map((text) => createCopyDraft(text, source, selected));
}

function preserveVisibleSelectedIds(current: Set<string>, creatives: InboxCreative[]): Set<string> {
  if (current.size === 0) return current;
  const availableIds = new Set(creatives.map((creative) => creative.id));
  const next = new Set<string>();
  for (const id of current) {
    if (availableIds.has(id)) next.add(id);
  }
  return next;
}

function selectedCopyTexts(items: CopyDraftItem[]): string[] {
  return uniqueTexts(items.filter((item) => item.selected).map((item) => item.text));
}

function visibleOurCopyTexts(items: CopyDraftItem[]): string[] {
  return uniqueTexts(
    items
      .filter((item) => item.source === 'inherited' || item.source === 'manual')
      .map((item) => item.text),
  );
}

function replaceAiCopyDrafts(
  current: CopyDraftItem[],
  texts: Array<string | undefined>,
  selected = false,
): CopyDraftItem[] {
  return [
    ...current.filter((item) => item.source !== 'ai'),
    ...uniqueTexts(texts).slice(0, 3).map((text) => createCopyDraft(text, 'ai', selected)),
  ];
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function locationKey(value: string): string {
  return normalizeLocationName(value).toLowerCase();
}

function sourceLabel(source: CopyDraftSource): string {
  if (source === 'ai') return 'AI';
  if (source === 'manual') return 'Custom';
  if (source === 'winner') return 'Winner';
  return 'Latest ad';
}

function ctaLabel(value?: string): string {
  if (!value) return 'LEARN_MORE';
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

function readableCtaLabel(value?: string): string {
  return ctaLabel(value)
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function createInitialLaunchConfigDraft(
  inheritedSettings: InheritedAdSettings | null,
  sourceAdSet?: MetaAdSetOption,
  sourceCampaign?: MetaCampaignOption,
  profile?: ProductProfile,
): LaunchConfigDraft {
  const includeLocations = uniqueLocations(sourceAdSet?.targeting?.locations || []);
  const excludeLocations = uniqueLocations(sourceAdSet?.targeting?.excludedLocations || [])
    .filter((location) => !includeLocations.some((included) => included.toLowerCase() === location.toLowerCase()));
  const genders = sourceAdSet?.targeting?.genders || [];
  const gender = genders.includes(1) && !genders.includes(2)
    ? 'male'
    : genders.includes(2) && !genders.includes(1)
      ? 'female'
      : 'all';
  const inheritedBidStrategy =
    normalizeBidStrategyForLaunch(sourceAdSet?.bidStrategy || profile?.defaultBidStrategy);

  return {
    launchStatus: 'ACTIVE',
    launchPaused: false,
    launchTiming: 'immediate',
    scheduledAt: '',
    dailyBudget: sourceCampaign?.campaignDailyBudget
      ? String(sourceCampaign.campaignDailyBudget)
      : sourceAdSet?.dailyBudget
        ? String(sourceAdSet.dailyBudget)
        : '',
    adSetDailyMinSpend: '',
    adSetDailyMaxSpend: '',
    bidStrategy: normalizeBidStrategyForLaunch(sourceCampaign?.campaignBidStrategy || inheritedBidStrategy),
    bidAmount: sourceAdSet?.bidAmount ? String(sourceAdSet.bidAmount) : '',
    optimizationGoal: sourceAdSet?.optimizationGoal || 'OFFSITE_CONVERSIONS',
    billingEvent: sourceAdSet?.billingEvent || 'IMPRESSIONS',
    conversionEvent: asString(sourceAdSet?.promotedObject?.custom_event_type) || profile?.conversionEvent || 'PURCHASE',
    advantageCreative: false,
    useTestDuration: false,
    testDuration: '',
    attribution: normalizeAttributionLabel(sourceAdSet?.attributionSpec),
    destinationUrl: inheritedSettings?.destinationUrl || '',
    urlTags: inheritedSettings?.urlTags || '',
    ageMin: String(sourceAdSet?.targeting?.ageMin || 18),
    ageMax: String(sourceAdSet?.targeting?.ageMax || 65),
    gender,
    includeLocations,
    excludeLocations,
  };
}

function parseLocationInput(value: string): string[] {
  return uniqueLocations(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean));
}

function shortCopyPreview(text: string, maxLength = 170): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function readableAdSetName(value: string): string {
  return value
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferAdSetName(creatives: InboxCreative[], productName: string, fallback = 'Ad Set'): string {
  if (creatives.length === 0) return `${productName || 'Product'} ${fallback}`;
  const groups = Array.from(new Set(creatives.map(getGroupName).filter(Boolean)));
  if (groups.length === 1 && groups[0] !== 'Ungrouped creatives') return readableAdSetName(groups[0]);
  if (creatives.length === 1) return readableAdSetName(getCreativeName(creatives[0]));
  return `${productName || 'Product'} ${fallback}`;
}

function chunkCreatives<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createSingleMediaAds(creatives: InboxCreative[], prefix = 'ad'): AdPlanItem[] {
  return creatives.map((creative, index) => ({
    id: uniqueStableId(`${prefix}-${index + 1}`),
    name: readableAdSetName(getCreativeName(creative)) || `Ad ${index + 1}`,
    creativeIds: [creative.id],
  }));
}

function createMultiMediaAdsFromIds(creativeIds: string[], baseName = 'Ad'): AdPlanItem[] {
  return chunkCreatives(creativeIds, 10).map((chunk, index) => ({
    id: uniqueStableId('multi-media-ad'),
    name: index === 0 ? baseName : `${baseName} ${index + 1}`,
    creativeIds: chunk,
  }));
}

function flattenAdCreativeIds(ads?: AdPlanItem[]): string[] {
  return [...new Set((ads || []).flatMap((ad) => ad.creativeIds).filter(Boolean))];
}

function hasDynamicCreativeMultiAdConflict(ads: Array<Pick<AdPlanItem, 'creativeIds'>>): boolean {
  const activeAds = ads.filter((ad) => (ad.creativeIds || []).length > 0);
  return activeAds.length > 1 && activeAds.some((ad) => (ad.creativeIds || []).length > 1);
}

function getAdMediaFormat(creative: InboxCreative): 'image' | 'video' | 'carousel' | string {
  return creative.creativeFormat || 'image';
}

function findBatchPlanValidationErrors(
  batchPlan: BatchPlanItem[],
  creativeById: Map<string, InboxCreative>,
): string[] {
  const errors: string[] = [];

  for (const batch of batchPlan) {
    const activeAds = (batch.ads || [])
      .map((ad) => ({
        ...ad,
        creatives: ad.creativeIds
          .map((creativeId) => creativeById.get(creativeId))
          .filter((creative): creative is InboxCreative => Boolean(creative)),
      }))
      .filter((ad) => ad.creatives.length > 0);

    if (hasDynamicCreativeMultiAdConflict(activeAds)) {
      errors.push(
        `${batch.name}: dynamic ad sets can only have one ad. Move the extra ad into another ad set.`,
      );
    }

    for (const ad of activeAds) {
      const formats = [...new Set(ad.creatives.map(getAdMediaFormat))];
      if (formats.length > 1) {
        errors.push(
          `${batch.name} / ${ad.name}: an ad can only have same-format media.`,
        );
      }
    }
  }

  return errors;
}

function normalizeBatchAds(batch: BatchPlanItem, creativeById: Map<string, InboxCreative>): AdPlanItem[] {
  const allowedIds = new Set(batch.creativeIds);
  const normalizedAds = (batch.ads || [])
    .map((ad, index) => ({
      ...ad,
      name: ad.name?.trim() || `Ad ${index + 1}`,
      creativeIds: ad.creativeIds.filter((creativeId) => allowedIds.has(creativeId)).slice(0, 10),
    }))
    .filter((ad) => ad.creativeIds.length > 0);

  const assignedIds = new Set(flattenAdCreativeIds(normalizedAds));
  const missingCreatives = batch.creativeIds
    .filter((creativeId) => !assignedIds.has(creativeId))
    .map((creativeId) => creativeById.get(creativeId))
    .filter((creative): creative is InboxCreative => Boolean(creative));

  if (normalizedAds.length === 0) {
    return createSingleMediaAds(missingCreatives, batch.id);
  }

  return [
    ...normalizedAds,
    ...createSingleMediaAds(missingCreatives, batch.id),
  ];
}

function createBatchPlan(args: {
  adSetMode: AdSetMode;
  batchMode: BatchMode;
  preset: SplitPreset;
  creatives: InboxCreative[];
  productName: string;
  selectedAdSet?: MetaAdSetOption;
}): BatchPlanItem[] {
  const { adSetMode, batchMode, preset, creatives, productName, selectedAdSet } = args;
  if (creatives.length === 0) return [];

  if (adSetMode === 'existing') {
    return [{
      id: selectedAdSet?.id ? `existing-${selectedAdSet.id}` : uniqueStableId('existing-adset'),
      name: selectedAdSet?.name || inferAdSetName(creatives, productName),
      creativeIds: creatives.map((creative) => creative.id),
      ads: createSingleMediaAds(creatives, 'existing-ad'),
      existingAdSetId: selectedAdSet?.id,
      existingAdSetName: selectedAdSet?.name,
    }];
  }

  if (batchMode === 'single') {
    return [{
      id: 'new-single-adset',
      name: inferAdSetName(creatives, productName),
      creativeIds: creatives.map((creative) => creative.id),
      ads: createSingleMediaAds(creatives, 'single-adset-ad'),
    }];
  }

  if (preset === 'folder_split') {
    const groups = new Map<string, InboxCreative[]>();
    for (const creative of creatives) {
      const groupName = getGroupName(creative);
      const list = groups.get(groupName) || [];
      list.push(creative);
      groups.set(groupName, list);
    }
    return Array.from(groups.entries()).map(([groupName, groupCreatives], index) => ({
      id: `folder-${index}-${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32)}`,
      name: readableAdSetName(groupName) || `${productName || 'Product'} Ad Set ${index + 1}`,
      creativeIds: groupCreatives.map((creative) => creative.id),
      ads: createSingleMediaAds(groupCreatives, `folder-${index}-ad`),
    }));
  }

  const chunkSize = preset === 'one_per_adset' ? 1 : 3;
  return chunkCreatives(creatives, chunkSize).map((chunk, index) => ({
    id: `${preset}-${index + 1}`,
    name: chunk.length === 1
      ? readableAdSetName(getCreativeName(chunk[0]))
      : `${inferAdSetName(chunk, productName, 'Ad Set')} ${index + 1}`,
    creativeIds: chunk.map((creative) => creative.id),
    ads: createSingleMediaAds(chunk, `${preset}-${index + 1}-ad`),
  }));
}

function getReadyCreatives(source: InboxCreative[], productId?: string): InboxCreative[] {
  return source.filter((creative) => {
    if (productId && creative.productProfileId !== productId) return false;
    return (
      creative.uploadStatus === 'ready' ||
      !!creative.driveUrl ||
      !!creative.driveContentUrl ||
      !!creative.driveDownloadUrl ||
      !!creative.clickupAttachmentUrl
    );
  });
}

function getDriveLink(creative: InboxCreative): string | undefined {
  return (
    creative.driveParentFolderUrl ||
    creative.driveUrl ||
    creative.drivePreviewUrl ||
    creative.driveContentUrl ||
    creative.driveDownloadUrl
  );
}

function getGroupLinks(creatives: InboxCreative[]): {
  driveLink?: string;
  clickupLink?: string;
} {
  const driveCreative = creatives.find((creative) => getDriveLink(creative));
  return {
    driveLink: driveCreative ? getDriveLink(driveCreative) : undefined,
    clickupLink: creatives.find((creative) => creative.clickupTaskUrl)?.clickupTaskUrl,
  };
}

function getCreativeUploadSourceUrl(creative: InboxCreative): string {
  return (
    creative.driveDownloadUrl ||
    creative.driveContentUrl ||
    creative.driveUrl ||
    creative.clickupAttachmentUrl ||
    ''
  );
}

function mapCopySourceToLaunch(source: CopyDraftSource): CopyItem['source'] {
  if (source === 'ai') return 'ai_generated';
  if (source === 'manual') return 'manual';
  return 'winner';
}

function copyDraftsToLaunchItems(items: CopyDraftItem[]): CopyItem[] {
  return items
    .filter((item) => item.selected && item.text.trim())
    .map((item, index) => ({
      id: item.id || `copy-${index + 1}`,
      text: item.text.trim(),
      source: mapCopySourceToLaunch(item.source),
    }));
}

function parseScheduledAtForLaunch(scheduledAt: string): { scheduledDate?: string; scheduledTime?: string } {
  if (!scheduledAt) return {};
  const [date, rawTime] = scheduledAt.split('T');
  if (!date) return {};
  return {
    scheduledDate: date,
    scheduledTime: rawTime ? rawTime.slice(0, 5) : '00:00',
  };
}

function parseScheduledAtInTimezone(scheduledAt: string, timezone: string): Date | null {
  const { scheduledDate, scheduledTime } = parseScheduledAtForLaunch(scheduledAt);
  if (!scheduledDate) return null;

  try {
    const scheduledDateTime = fromZonedTime(
      `${scheduledDate}T${scheduledTime || '00:00'}:00`,
      timezone,
    );
    return Number.isNaN(scheduledDateTime.getTime()) ? null : scheduledDateTime;
  } catch {
    return null;
  }
}

function formatCurrentTimeInTimezone(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
      timeZoneName: 'short',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date());
  }
}

function attributionToLaunchValue(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.includes('7-day click') && normalized.includes('engagement')) return '7d_click_1d_engagement';
  if (normalized.includes('7-day click') && normalized.includes('view')) return '7d_click_1d_view';
  if (normalized.includes('1-day click') && normalized.includes('view')) return '1d_click_1d_view';
  if (normalized.includes('1-day click')) return '1d_click';
  if (normalized.includes('7-day click')) return '7d_click';
  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || '7d_click_1d_engagement';
}

function locationToCountryCode(location: string): string | undefined {
  const normalized = normalizeLocationName(location);
  if (!normalized) return undefined;
  if (normalized.toLowerCase() === 'worldwide') return 'WORLDWIDE';

  const upper = normalized.toUpperCase();
  if (COUNTRY_NAME_BY_CODE.has(upper)) return upper === 'UK' ? 'GB' : upper;

  for (const [code, name] of COUNTRY_NAME_BY_CODE.entries()) {
    if (name.toLowerCase() === normalized.toLowerCase()) return code === 'UK' ? 'GB' : code;
  }

  return undefined;
}

function locationsToCountryCodes(locations: string[]): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const location of locations) {
    const code = locationToCountryCode(location);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

function buildLaunchTargeting(
  draft: LaunchConfigDraft,
  sourceAdSet?: MetaAdSetOption,
): TargetingSpec | undefined {
  const includedCodes = locationsToCountryCodes(draft.includeLocations);
  const includedCodeSet = new Set(includedCodes.filter((code) => code !== 'WORLDWIDE'));
  const excludedCodes = locationsToCountryCodes(draft.excludeLocations)
    .filter((code) => code !== 'WORLDWIDE' && !includedCodeSet.has(code));

  const ageMin = Number.parseInt(draft.ageMin, 10);
  const ageMax = Number.parseInt(draft.ageMax, 10);
  const genders = draft.gender === 'male' ? [1] : draft.gender === 'female' ? [2] : undefined;

  return {
    ageMin: Number.isFinite(ageMin) ? Math.max(13, Math.min(99, ageMin)) : sourceAdSet?.targeting?.ageMin || 18,
    ageMax: Number.isFinite(ageMax) ? Math.max(13, Math.min(99, ageMax)) : sourceAdSet?.targeting?.ageMax || 65,
    genders,
    geoLocations: includedCodes.length > 0 ? { countries: includedCodes } : undefined,
    excludedGeoLocations: excludedCodes.length > 0 ? { countries: excludedCodes } : undefined,
    customAudiences: sourceAdSet?.targeting?.customAudiences,
    excludedCustomAudiences: sourceAdSet?.targeting?.excludedCustomAudiences,
    flexibleSpec: sourceAdSet?.targeting?.flexibleSpec,
    publisherPlatforms: sourceAdSet?.targeting?.publisherPlatforms,
    facebookPositions: sourceAdSet?.targeting?.facebookPositions,
    instagramPositions: sourceAdSet?.targeting?.instagramPositions,
  };
}

function parseMoneyInput(value: string): number | undefined {
  const parsed = Number.parseFloat(value.replace(/[^0-9.]+/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeBidStrategyForLaunch(value?: string): BidStrategy {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'LOWEST_COST' || normalized === 'HIGHEST_VOLUME_OR_VALUE' || normalized === 'HIGHEST_VOLUME') {
    return 'LOWEST_COST_WITHOUT_CAP';
  }
  if (normalized === 'BID_CAP') return 'LOWEST_COST_WITH_BID_CAP';
  if (normalized === 'MINIMUM_ROAS') return 'LOWEST_COST_WITH_MIN_ROAS';
  if (normalized === 'COST_PER_RESULT_GOAL' || normalized === 'TARGET_COST') return 'COST_CAP';
  if (normalized === 'ROAS_GOAL') return 'LOWEST_COST_WITH_MIN_ROAS';
  if (normalized === 'HIGHEST_VOLUME_OR_VALUE') return 'LOWEST_COST_WITHOUT_CAP';
  if (
    normalized === 'LOWEST_COST_WITHOUT_CAP' ||
    normalized === 'LOWEST_COST_WITH_BID_CAP' ||
    normalized === 'COST_CAP' ||
    normalized === 'LOWEST_COST_WITH_MIN_ROAS'
  ) {
    return normalized as BidStrategy;
  }
  return 'LOWEST_COST_WITHOUT_CAP';
}

function readableBidStrategy(value?: string): string {
  const normalized = normalizeBidStrategyForLaunch(value);
  if (normalized === 'COST_CAP') return 'Cost per result goal';
  if (normalized === 'LOWEST_COST_WITH_MIN_ROAS') return 'ROAS goal';
  if (normalized === 'LOWEST_COST_WITH_BID_CAP') return 'Bid cap';
  return 'Highest volume or value';
}

function formatScheduledLabel(value?: string): string {
  if (!value) return 'the selected scheduled time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function extractLaunchErrorFromResult(data: LaunchSubmitResult): string {
  if (data.error) return data.error;

  const failedItems = (data.items || []).filter((item) => {
    const launchStatus = asString(item.launchStatus) || asString(item.launch_status) || asString(item.status);
    return String(launchStatus || '').toLowerCase().includes('fail') ||
      Boolean(asString(item.reviewFeedback) || asString(item.review_feedback) || asString(item.error));
  });

  if (failedItems.length > 0) {
    return failedItems
      .map((item) => {
        const name =
          asString(item.creativeName) ||
          asString(item.creative_name) ||
          asString(item.name) ||
          'Creative';
        const message =
          asString(item.reviewFeedback) ||
          asString(item.review_feedback) ||
          asString(item.error) ||
          'Launch failed';
        return `${name}: ${message}`;
      })
      .join('\n');
  }

  if (data.status === 'partial') {
    return 'Some creatives failed to launch. No item-level error was returned by the launch API.';
  }

  return 'Launch failed. No error message was returned by the launch API.';
}

export default function LaunchCreativeSelectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const externalLaunchContext = useMemo(() => buildExternalLaunchContext(searchParams), [searchParams]);
  const isImmuviLaunch = externalLaunchContext?.source.toLowerCase() === 'immuvi';
  const initialProductId =
    searchParams.get('productProfileId') ||
    searchParams.get('productId') ||
    externalLaunchContext?.productId ||
    'all';
  const storeIdFromUrl = searchParams.get('storeId') || '';

  const { activeStoreId, stores, error: storesError, fetchStores, setActiveStore } = useStoreStore();
  const profiles = useCreativeHubStore((state) => state.profiles);
  const fetchProfiles = useCreativeHubStore((state) => state.fetchProfiles);

  const [creatives, setCreatives] = useState<InboxCreative[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [currentStep, setCurrentStep] = useState<LaunchCreativeStep>('creatives');
  const [campaignMode, setCampaignMode] = useState<CampaignMode>('existing');
  const [newCampaignStructure, setNewCampaignStructure] = useState<CampaignStructure>('CBO');
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignNameTouched, setNewCampaignNameTouched] = useState(false);
  const [adSetMode, setAdSetMode] = useState<AdSetMode>('new');
  const [campaigns, setCampaigns] = useState<MetaCampaignOption[]>([]);
  const [campaignsScopeKey, setCampaignsScopeKey] = useState('');
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [selectedAdAccountId, setSelectedAdAccountId] = useState('');
  const [storeAdAccountOptions, setStoreAdAccountOptions] = useState<Array<{ accountId: string; name: string; currency: string }>>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [adSets, setAdSets] = useState<MetaAdSetOption[]>([]);
  const [adSetsCampaignId, setAdSetsCampaignId] = useState('');
  const [adSetsLoading, setAdSetsLoading] = useState(false);
  const [adSetsError, setAdSetsError] = useState<string | null>(null);
  const [selectedAdSetId, setSelectedAdSetId] = useState('');
  const [inheritedSettings, setInheritedSettings] = useState<InheritedAdSettings | null>(null);
  const [inheritedSettingsLoading, setInheritedSettingsLoading] = useState(false);
  const [inheritedSettingsError, setInheritedSettingsError] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState<BatchMode>('single');
  const [splitPreset, setSplitPreset] = useState<SplitPreset>('three_per_adset');
  const [batchPlan, setBatchPlan] = useState<BatchPlanItem[]>([]);
  const [draggedCreativeId, setDraggedCreativeId] = useState<string | null>(null);
  const [primaryTextDrafts, setPrimaryTextDrafts] = useState<CopyDraftItem[]>([]);
  const [headlineDrafts, setHeadlineDrafts] = useState<CopyDraftItem[]>([]);
  const [descriptionDrafts, setDescriptionDrafts] = useState<CopyDraftItem[]>([]);
  const [ctaDraft, setCtaDraft] = useState('LEARN_MORE');
  const [copyInitKey, setCopyInitKey] = useState('');
  const [aiCopyLoading, setAiCopyLoading] = useState(false);
  const [aiCopyError, setAiCopyError] = useState<string | null>(null);
  const [aiCopyStatus, setAiCopyStatus] = useState<string | null>(null);
  const [aiCopyGenerationKey, setAiCopyGenerationKey] = useState('');
  const [launchConfigDraft, setLaunchConfigDraft] = useState<LaunchConfigDraft>(() => createInitialLaunchConfigDraft(null));
  const [launchConfigInitKey, setLaunchConfigInitKey] = useState('');
  const [query, setQuery] = useState('');
  const [productFilter, setProductFilter] = useState<FilterValue>(initialProductId);
  const [statusFilter, setStatusFilter] = useState<FilterValue>('all');
  const [formatFilter, setFormatFilter] = useState<FilterValue>('all');
  const [funnelFilter, setFunnelFilter] = useState<FilterValue>('all');
  const [showSelectedTasksOnly, setShowSelectedTasksOnly] = useState(() => Boolean(isImmuviLaunch));
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readyTasksWithoutAssets, setReadyTasksWithoutAssets] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [previewCreative, setPreviewCreative] = useState<InboxCreative | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, LaunchUploadProgress>>({});
  const [externalLaunchIssue, setExternalLaunchIssue] = useState<ExternalLaunchIssue | null>(null);
  const [externalLaunchNotice, setExternalLaunchNotice] = useState<string | null>(null);
  const [thumbnailDrafts, setThumbnailDrafts] = useState<Record<string, ThumbnailDraft>>({});
  const [clockTick, setClockTick] = useState(0);
  const campaignsRequestIdRef = useRef(0);
  const inheritedSettingsRequestIdRef = useRef(0);
  const aiCopyRequestKeyRef = useRef('');
  const aiCopyRequestIdRef = useRef(0);
  const externalSelectionAppliedKeyRef = useRef('');

  const selectedProductId = productFilter === 'all' ? undefined : productFilter;
  const resolvedStoreIdForView = storeIdFromUrl || activeStoreId;
  const activeStore = stores.find((store) => store.id === resolvedStoreIdForView);
  const selectedCreatives = useMemo(
    () => creatives.filter((creative) => selectedIds.has(creative.id)),
    [creatives, selectedIds],
  );
  const selectedClickUpTaskIds = useMemo(() => {
    const taskIds = new Set<string>();
    for (const creative of selectedCreatives) {
      const taskId = normalizeExternalId(creative.clickupTaskId);
      if (taskId) taskIds.add(taskId);
    }
    return taskIds;
  }, [selectedCreatives]);
  const externalLaunchKey = useMemo(
    () => externalLaunchContext
      ? [
          externalLaunchContext.source,
          externalLaunchContext.storeId,
          externalLaunchContext.productId,
          externalLaunchContext.clickupTaskIds.join(','),
          externalLaunchContext.launchId,
        ].join('|')
      : '',
    [externalLaunchContext],
  );
  const launchProductId =
    selectedProductId ||
    selectedCreatives[0]?.productProfileId ||
    (initialProductId !== 'all' ? initialProductId : undefined);
  const selectedProfile = profiles.find((profile) => profile.id === launchProductId);
  const selectedCampaign = campaigns.find((campaign) => campaign.campaignId === selectedCampaignId);
  const selectedCampaignLink = selectedProfile?.campaignLinks?.find(
    (link) => !isAccountOnlyCampaignLink(link) && link.campaignId === selectedCampaignId,
  );
  const selectedCampaignAccountId = normalizeMetaAdAccountId(
    selectedCampaign?.adAccountId || selectedCampaignLink?.adAccountId,
  );
  const linkedAdAccounts = useMemo(() => {
    const accountMap = new Map<string, LaunchAdAccountOption>();
    const addAccount = (accountId?: string | null, campaignCount = 0, currency?: string | null) => {
      const normalizedId = normalizeMetaAdAccountId(accountId);
      if (!normalizedId) return;
      const hydratedAccount =
        storeAdAccountOptions.find((account) => normalizeMetaAdAccountId(account.accountId) === normalizedId) ||
        activeStore?.adAccounts?.find((account) => normalizeMetaAdAccountId(account.accountId) === normalizedId);
      const existing = accountMap.get(normalizedId);
      const fallbackName = existing?.name || `Meta ad account ${accountMap.size + 1}`;
      accountMap.set(normalizedId, {
        accountId: normalizedId,
        name: readableAdAccountName(hydratedAccount?.name || existing?.name, fallbackName),
        currency: hydratedAccount?.currency || existing?.currency || currency || selectedProfile?.adAccountCurrency || 'USD',
        campaignCount: (existing?.campaignCount || 0) + campaignCount,
      });
    };

    const primaryAccountId = normalizeMetaAdAccountId(selectedProfile?.adAccountId);
    addAccount(primaryAccountId, 0, selectedProfile?.adAccountCurrency);
    for (const link of selectedProfile?.campaignLinks ?? []) {
      addAccount(link.adAccountId, 1);
    }
    return Array.from(accountMap.values());
  }, [activeStore?.adAccounts, selectedProfile, storeAdAccountOptions]);
  const linkedAdAccountIds = useMemo(
    () => linkedAdAccounts.map((account) => account.accountId),
    [linkedAdAccounts],
  );
  const expectedCampaignScopeAccountIds = useMemo(
    () => campaignMode === 'new'
      ? ([selectedAdAccountId].filter(Boolean) as string[])
      : linkedAdAccountIds.length > 0
        ? linkedAdAccountIds
        : ([normalizeMetaAdAccountId(selectedProfile?.adAccountId)].filter(Boolean) as string[]),
    [campaignMode, linkedAdAccountIds, selectedAdAccountId, selectedProfile?.adAccountId],
  );
  const expectedCampaignScopeKey = `${campaignMode}:${expectedCampaignScopeAccountIds.join(',')}`;
  const campaignsReadyForScope = campaignsScopeKey === expectedCampaignScopeKey;
  const selectedLaunchAdAccount = linkedAdAccounts.find((account) => account.accountId === selectedAdAccountId);
  const launchAdAccountId =
    campaignMode === 'existing'
      ? selectedCampaignAccountId
      : normalizeMetaAdAccountId(selectedAdAccountId || selectedProfile?.adAccountId);
  const launchCurrency = selectedLaunchAdAccount?.currency || selectedProfile?.adAccountCurrency || 'USD';
  const launchTimezone = useMemo(() => {
    const matchingAccount = activeStore?.adAccounts?.find((account) => {
      const accountId = normalizeMetaAdAccountId(account.accountId);
      return accountId && launchAdAccountId && accountId === launchAdAccountId;
    });
    if (matchingAccount?.timezone) return matchingAccount.timezone;

    const activeAccount = activeStore?.adAccounts?.find((account) => account.isActive && account.timezone);
    if (activeAccount?.timezone) return activeAccount.timezone;
    return activeStore?.adAccounts?.[0]?.timezone || 'America/New_York';
  }, [activeStore, launchAdAccountId]);
  const currentLaunchTimeLabel = useMemo(() => {
    void clockTick;
    return formatCurrentTimeInTimezone(launchTimezone);
  }, [clockTick, launchTimezone]);
  const templateCampaigns = useMemo(() => {
    if (!campaignsReadyForScope) return [];
    if (campaignMode !== 'new' || !selectedAdAccountId) return campaigns;
    return campaigns.filter(
      (campaign) => normalizeMetaAdAccountId(campaign.adAccountId) === selectedAdAccountId,
    );
  }, [campaignMode, campaigns, campaignsReadyForScope, selectedAdAccountId]);
  const latestTemplateCampaign =
    sortByLatest(templateCampaigns, (campaign) => campaign.updatedTime || campaign.startDate || campaign.linkedAt)[0];
  const sourceCampaignForAdSets = campaignMode === 'existing' ? selectedCampaign : latestTemplateCampaign;
  const sourceCampaignAccountId = normalizeMetaAdAccountId(sourceCampaignForAdSets?.adAccountId);
  const sourceCampaignMatchesLaunchAccount =
    campaignMode !== 'new' ||
    !selectedAdAccountId ||
    (!!sourceCampaignAccountId && sourceCampaignAccountId === selectedAdAccountId);
  const adSetSourceCampaignId =
    sourceCampaignMatchesLaunchAccount
      ? campaignMode === 'existing' ? selectedCampaignId : latestTemplateCampaign?.campaignId || ''
      : '';
  const adSetsReadyForSource = Boolean(adSetSourceCampaignId) && adSetsCampaignId === adSetSourceCampaignId;
  const selectedAdSet = adSetsReadyForSource
    ? adSets.find((adSet) => adSet.id === selectedAdSetId)
    : undefined;
  const latestAdSet =
    adSetsReadyForSource
      ? sortByLatest(adSets, (adSet) => adSet.updatedTime || adSet.startDate)[0]
      : undefined;
  const inheritedCopySourceAdSets = useMemo(() => {
    if (!adSetsReadyForSource) return [];
    if (campaignMode === 'existing' && adSetMode === 'existing') {
      return selectedAdSet ? [selectedAdSet] : [];
    }
    return sortByLatest(adSets, (adSet) => adSet.updatedTime || adSet.startDate).slice(0, 8);
  }, [adSetMode, adSets, adSetsReadyForSource, campaignMode, selectedAdSet]);
  const inheritedCopySourceAdSet =
    campaignMode === 'existing' && adSetMode === 'existing'
        ? selectedAdSet
        : latestAdSet;
  const productNameForFlow = selectedProfile?.productName || productNameById(profiles, launchProductId);
  const campaignStructure: CampaignStructure =
    campaignMode === 'new' ? newCampaignStructure : isCboCampaign(selectedCampaign) ? 'CBO' : 'ABO';
  const stepIndexByName: Record<LaunchCreativeStep, number> = {
    creatives: 0,
    campaign: 1,
    batching: 2,
    copy: 3,
    config: 4,
    review: 5,
  };
  const stepIndex = stepIndexByName[currentStep];
  const stepNameByIndex = futureSteps.map((_, index) =>
    (Object.keys(stepIndexByName) as LaunchCreativeStep[]).find((step) => stepIndexByName[step] === index),
  ) as LaunchCreativeStep[];
  const canNavigateToStep = (targetStep: LaunchCreativeStep): boolean => {
    const targetIndex = stepIndexByName[targetStep];
    if (targetIndex <= stepIndex) return true;
    if (targetStep === 'campaign') return selectedIds.size > 0;
    if (targetStep === 'batching') {
      return selectedIds.size > 0 && (
        campaignMode === 'new'
          ? Boolean(newCampaignName.trim())
          : Boolean(selectedCampaignId) && (adSetMode === 'new' || Boolean(selectedAdSetId))
      );
    }
    if (targetStep === 'copy') return batchPlan.some((batch) => batch.creativeIds.length > 0);
    if (targetStep === 'config') {
      return selectedCopyTexts(primaryTextDrafts).length > 0 && selectedCopyTexts(headlineDrafts).length > 0;
    }
    if (targetStep === 'review') return currentStep === 'review';
    return false;
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [currentStep]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!resolvedStoreIdForView) {
      setStoreAdAccountOptions([]);
      return;
    }

    let active = true;
    const loadStoreAdAccounts = async () => {
      try {
        const response = await fetch(
          `/api/settings/stores/ad-accounts?storeId=${encodeURIComponent(resolvedStoreIdForView)}`,
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Failed to load ad accounts (${response.status})`);
        if (!active) return;
        const accounts = Array.isArray(data.accounts) ? data.accounts : [];
        setStoreAdAccountOptions(accounts.map((account: unknown) => {
          const record = asRecord(account);
          return {
            accountId: normalizeMetaAdAccountId(asString(record?.accountId) || asString(record?.id)) || '',
            name: readableAdAccountName(asString(record?.name)),
            currency: asString(record?.currency) || 'USD',
          };
        }).filter((account: { accountId: string }) => Boolean(account.accountId)));
      } catch {
        if (active) setStoreAdAccountOptions([]);
      }
    };

    void loadStoreAdAccounts();

    return () => {
      active = false;
    };
  }, [resolvedStoreIdForView]);

  useEffect(() => {
    const preferredAccountId = normalizeMetaAdAccountId(selectedProfile?.adAccountId);
    const fallbackAccountId = preferredAccountId || linkedAdAccountIds[0] || '';

    setSelectedAdAccountId((current) => {
      if (current && linkedAdAccountIds.includes(current)) return current;
      return fallbackAccountId;
    });
  }, [linkedAdAccountIds, selectedProfile?.adAccountId]);

  const loadCreatives = useCallback(async (forceRefresh = false) => {
    const externalTaskIds = externalLaunchContext?.clickupTaskIds ?? [];
    const cachedReadyCreatives = getReadyCreatives(
      useCreativeHubStore.getState().inboxCreatives,
      selectedProductId,
    );

    const hasInstantCreatives = !forceRefresh && cachedReadyCreatives.length > 0;

    if (hasInstantCreatives) {
      setCreatives(cachedReadyCreatives);
      setSelectedIds((current) => preserveVisibleSelectedIds(current, cachedReadyCreatives));
      setCollapsedGroups(new Set(cachedReadyCreatives.map(getGroupName)));
      setLastSyncedAt(useCreativeHubStore.getState().inboxLastSyncedAt);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    setExternalLaunchIssue(null);

    try {
      if (storeIdFromUrl) {
        await fetchStores();
        const availableStores = useStoreStore.getState().stores;
        const requestedStore = availableStores.find((store) => store.id === storeIdFromUrl);
        if (!requestedStore) {
          setCreatives([]);
          setSelectedIds(new Set());
          setLoading(false);
          setExternalLaunchIssue({
            title: 'Store Not Found',
            message:
              'The requested store was not found in this workspace, or it is not linked to your OneScale login.',
            details: [
              { label: 'Requested store ID', value: storeIdFromUrl },
              { label: 'Source', value: externalLaunchContext?.source || 'direct link' },
              { label: 'ClickUp tasks', value: formatExternalTaskList(externalTaskIds) },
            ],
          });
          return;
        }

        if (useStoreStore.getState().activeStoreId !== storeIdFromUrl) {
          setActiveStore(storeIdFromUrl);
        }

        const metaAccounts = (requestedStore.adAccounts || []).filter((account) => account.platform === 'meta');
        if (metaAccounts.length === 0) {
          setCreatives([]);
          setSelectedIds(new Set());
          setLoading(false);
          setExternalLaunchIssue({
            title: 'Meta is not linked for this store',
            message:
              'The store exists in OneScale, but no Meta ad account is linked to it. Link a Meta ad account before launching creatives from Immuvi.',
            details: [
              { label: 'Store', value: requestedStore.name || storeIdFromUrl },
              { label: 'Store ID', value: storeIdFromUrl },
              { label: 'ClickUp tasks', value: formatExternalTaskList(externalTaskIds) },
            ],
          });
          return;
        }
      } else if (!activeStoreId) {
        await fetchStores();
      }

      const resolvedStoreId = storeIdFromUrl || useStoreStore.getState().activeStoreId;
      if (!resolvedStoreId) {
        setCreatives([]);
        setSelectedIds(new Set());
        setLoading(false);
        setError('No active store found. Go back to Creative Hub and choose a store.');
        return;
      }

      await fetchProfiles(resolvedStoreId);
      const latestProfiles = useCreativeHubStore.getState().profiles;
      let effectiveProductId = selectedProductId;

      if (externalLaunchContext) {
        if (!externalLaunchContext.productId) {
          setCreatives([]);
          setSelectedIds(new Set());
          setLoading(false);
          setExternalLaunchIssue({
            title: 'Product link is missing',
            message:
              'The Immuvi launch link did not include a OneScale product id, so OneScale cannot safely choose the product to launch from.',
            details: [
              { label: 'Store ID', value: resolvedStoreId },
              { label: 'Expected parameter', value: 'productProfileId' },
              { label: 'ClickUp tasks', value: formatExternalTaskList(externalTaskIds) },
            ],
          });
          return;
        }

        const requestedProfile = findProfileForExternalProduct(latestProfiles, externalLaunchContext.productId);
        if (!requestedProfile) {
          setCreatives([]);
          setSelectedIds(new Set());
          setLoading(false);
          setExternalLaunchIssue({
            title: 'Product link is wrong',
            message:
              'The product id in the Immuvi launch link does not match any product profile linked to this OneScale store.',
            details: [
              { label: 'Requested product ID', value: externalLaunchContext.productId },
              { label: 'Store ID', value: resolvedStoreId },
              {
                label: 'Available products',
                value: latestProfiles.length > 0
                  ? latestProfiles.slice(0, 6).map((profile) => `${profile.productName} (${profile.id})`)
                  : 'No product profiles found',
              },
              { label: 'ClickUp tasks', value: formatExternalTaskList(externalTaskIds) },
            ],
          });
          return;
        }

        effectiveProductId = requestedProfile.id;
        if (productFilter !== requestedProfile.id) {
          setProductFilter(requestedProfile.id);
        }
      }

      const params = new URLSearchParams({ storeId: resolvedStoreId });
      if (forceRefresh) params.set('refresh', '1');
      if (effectiveProductId) params.set('productId', effectiveProductId);

      const res = await fetch(`/api/creative-hub/inbox?${params.toString()}`);
      const data = (await res.json()) as InboxResponse;
      if (!res.ok) {
        throw new Error(data.error || `Failed to fetch creatives (${res.status})`);
      }

      const allProductReadyTasks = (data.creatives || []).filter((creative) =>
        !effectiveProductId || creative.productProfileId === effectiveProductId
      );
      const readyCreatives = getReadyCreatives(data.creatives || [], effectiveProductId);

      if (externalLaunchContext && externalTaskIds.length > 0) {
        const foundTaskIds = new Set(
          allProductReadyTasks
            .map((creative) => normalizeExternalId(creative.clickupTaskId))
            .filter(Boolean),
        );
        const missingTaskIds = externalTaskIds.filter((taskId) => !foundTaskIds.has(normalizeExternalId(taskId)));
        if (missingTaskIds.length > 0) {
          const foundTaskNames = uniqueTexts(
            allProductReadyTasks.map((creative) => creative.clickupTaskName || creative.clickupTaskId),
          );
          const requestedProfile = effectiveProductId
            ? latestProfiles.find((profile) => profile.id === effectiveProductId)
            : undefined;
          setCreatives([]);
          setSelectedIds(new Set());
          setLoading(false);
          setExternalLaunchIssue({
            title: 'ClickUp tasks were not found',
            message:
              'OneScale found the store and product, but one or more ClickUp tasks from the Immuvi link do not exist in that product launch queue.',
            details: [
              { label: 'Product', value: requestedProfile ? `${requestedProfile.productName} (${requestedProfile.id})` : effectiveProductId || 'Unknown' },
              { label: 'Requested tasks', value: formatExternalTaskList(externalTaskIds) },
              { label: 'Missing tasks', value: formatExternalTaskList(missingTaskIds) },
              { label: 'Found tasks in product', value: foundTaskNames.length > 0 ? foundTaskNames.join(', ') : 'None' },
            ],
          });
          return;
        }
      }

      setCreatives(readyCreatives);
      setReadyTasksWithoutAssets(Math.max(0, allProductReadyTasks.length - readyCreatives.length));
      if (externalTaskIds.length > 0 && externalSelectionAppliedKeyRef.current !== externalLaunchKey) {
        const matchedCreatives = findCreativesForExternalTasks(readyCreatives, externalTaskIds);
        if (matchedCreatives.length > 0) {
          setSelectedIds(new Set(matchedCreatives.map((creative) => creative.id)));
          externalSelectionAppliedKeyRef.current = externalLaunchKey;
          const matchedTaskCount = new Set(matchedCreatives.map((creative) => normalizeExternalId(creative.clickupTaskId))).size;
          setExternalLaunchNotice(
            `Selected ${matchedCreatives.length} creative${matchedCreatives.length !== 1 ? 's' : ''} from ${matchedTaskCount} ClickUp task${matchedTaskCount !== 1 ? 's' : ''}.`,
          );
          const matchedProductIds = uniqueTexts(matchedCreatives.map((creative) => creative.productProfileId));
          if (productFilter === 'all' && matchedProductIds.length === 1) {
            setProductFilter(matchedProductIds[0]);
          }
        } else {
          setSelectedIds(new Set());
          externalSelectionAppliedKeyRef.current = externalLaunchKey;
          setExternalLaunchNotice(
            `No ready creative media was found for ClickUp task${externalTaskIds.length !== 1 ? 's' : ''}: ${formatExternalTaskList(externalTaskIds)}. Refresh from ClickUp after the task is ready and has media attached.`,
          );
        }
      } else {
        setSelectedIds((current) => preserveVisibleSelectedIds(current, readyCreatives));
      }
      setCollapsedGroups(new Set(readyCreatives.map(getGroupName)));
      setLastSyncedAt(data.lastSyncedAt || data.syncedAt || data.cacheMeta?.lastSyncedAt || null);
      useCreativeHubStore.setState({
        inboxCreatives: readyCreatives,
        inboxLastSyncedAt: data.lastSyncedAt || data.syncedAt || data.cacheMeta?.lastSyncedAt || null,
        inboxError: data.error || null,
        inboxNotConnected: !!data.notConnected,
        inboxNotConfigured: !!data.notConfigured,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ready creatives');
      if (!hasInstantCreatives) {
        setCreatives([]);
        setReadyTasksWithoutAssets(0);
        setSelectedIds(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, [
    activeStoreId,
    externalLaunchContext,
    externalLaunchKey,
    fetchProfiles,
    fetchStores,
    productFilter,
    selectedProductId,
    setActiveStore,
    storeIdFromUrl,
  ]);

  useEffect(() => {
    void loadCreatives();
  }, [loadCreatives]);

  useEffect(() => {
    if (isImmuviLaunch) {
      setShowSelectedTasksOnly(true);
    }
  }, [isImmuviLaunch]);

  useEffect(() => {
    if (campaignMode !== 'new') return;
    if (newCampaignNameTouched && newCampaignName.trim()) return;
    setNewCampaignName(buildDefaultCampaignName(productNameForFlow, selectedCreatives, newCampaignStructure));
  }, [
    campaignMode,
    newCampaignName,
    newCampaignNameTouched,
    newCampaignStructure,
    productNameForFlow,
    selectedCreatives,
  ]);

  const loadCampaigns = useCallback(async () => {
    const requestId = campaignsRequestIdRef.current + 1;
    campaignsRequestIdRef.current = requestId;
    const isCurrentRequest = () => campaignsRequestIdRef.current === requestId;

    if (!resolvedStoreIdForView || !selectedProfile?.adAccountId) {
      setCampaigns([]);
      setCampaignsScopeKey('');
      setSelectedCampaignId('');
      setCampaignsError(selectedProfile ? 'This product profile has no Meta ad account configured.' : null);
      return;
    }
    if (campaignMode === 'new' && !selectedAdAccountId) {
      setCampaigns([]);
      setCampaignsScopeKey('');
      setSelectedCampaignId('');
      setCampaignsError('Choose an ad account before loading campaigns.');
      return;
    }

    setCampaignsLoading(true);
    setCampaignsError(null);

    try {
      const rowsById = new Map<string, MetaCampaignOption>();
      const campaignAccountIds = campaignMode === 'new'
        ? ([selectedAdAccountId].filter(Boolean) as string[])
        : linkedAdAccountIds.length > 0
          ? linkedAdAccountIds
          : ([normalizeMetaAdAccountId(selectedProfile.adAccountId)].filter(Boolean) as string[]);
      const requestScopeKey = `${campaignMode}:${campaignAccountIds.join(',')}`;
      if (campaignMode !== 'new') {
        for (const link of selectedProfile.campaignLinks || []) {
          if (isAccountOnlyCampaignLink(link)) continue;
          if (!link.campaignId) continue;
          const linkAccountId = normalizeMetaAdAccountId(link.adAccountId || selectedProfile.adAccountId);
          rowsById.set(link.campaignId, {
            campaignId: link.campaignId,
            campaignName: link.campaignName || 'Untitled campaign',
            campaignType: link.campaignType || inferCampaignType(link.campaignName),
            adAccountId: linkAccountId,
            effectiveStatus: link.effectiveStatus,
            isActive: link.effectiveStatus
              ? link.effectiveStatus.toUpperCase() === 'ACTIVE'
              : link.isActive,
            linkedAt: link.linkedAt,
            campaignDailyBudget: link.campaignDailyBudget,
            campaignLifetimeBudget: link.campaignLifetimeBudget,
            campaignBidStrategy: link.campaignBidStrategy,
          });
        }
      }

      for (const accountId of campaignAccountIds) {
        const cachedParams = new URLSearchParams({
          storeId: resolvedStoreIdForView,
          preferCache: '1',
          accountId,
        });
        const cachedResponse = await fetch(`/api/meta/campaigns?${cachedParams.toString()}`);
        const cachedData = await cachedResponse.json();
        const cachedRows = Array.isArray(cachedData.data) ? cachedData.data : [];

        for (const row of cachedRows) {
          const record = asRecord(row);
          const campaign = record ? normalizeCampaign(record, accountId) : null;
          if (!campaign) continue;
          rowsById.set(campaign.campaignId, { ...rowsById.get(campaign.campaignId), ...campaign });
        }
      }

      // Use live campaigns as a freshness pass, matching the old Launch Config dropdown behavior.
      try {
        for (const accountId of campaignAccountIds) {
          const liveParams = new URLSearchParams({
            storeId: resolvedStoreIdForView,
            forceLive: '1',
            accountId,
          });
          const liveResponse = await fetch(`/api/meta/campaigns?${liveParams.toString()}`);
          const liveData = await liveResponse.json();
          const liveRows = Array.isArray(liveData.data) ? liveData.data : [];

          for (const row of liveRows) {
            const record = asRecord(row);
            const campaign = record ? normalizeCampaign(record, accountId) : null;
            if (!campaign) continue;
            rowsById.set(campaign.campaignId, { ...rowsById.get(campaign.campaignId), ...campaign });
          }
        }
      } catch {
        // Cached/linked campaigns are still useful if Meta live refresh is unavailable.
      }

      const allowedAccountIds = new Set(
        campaignAccountIds
          .map((accountId) => normalizeMetaAdAccountId(accountId))
          .filter((accountId): accountId is string => Boolean(accountId)),
      );
      const nextCampaigns = Array.from(rowsById.values()).filter((campaign) => {
        if (campaignMode !== 'new' || allowedAccountIds.size === 0) return true;
        const accountId = normalizeMetaAdAccountId(campaign.adAccountId);
        return !!accountId && allowedAccountIds.has(accountId);
      }).sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return compareText(a.campaignName, b.campaignName);
      });

      if (!isCurrentRequest()) return;
      setCampaigns(nextCampaigns);
      setCampaignsScopeKey(requestScopeKey);
      setSelectedCampaignId((current) => {
        if (current && nextCampaigns.some((campaign) => campaign.campaignId === current)) return current;
        return nextCampaigns[0]?.campaignId || '';
      });
    } catch (err) {
      if (!isCurrentRequest()) return;
      setCampaigns([]);
      setCampaignsScopeKey('');
      setSelectedCampaignId('');
      setCampaignsError(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      if (isCurrentRequest()) setCampaignsLoading(false);
    }
  }, [campaignMode, linkedAdAccountIds, resolvedStoreIdForView, selectedAdAccountId, selectedProfile]);

  useEffect(() => {
    if (['campaign', 'batching', 'copy', 'config', 'review'].includes(currentStep)) {
      void loadCampaigns();
    }
  }, [currentStep, loadCampaigns]);

  useEffect(() => {
    if (!selectedCampaignId) {
      setAdSets([]);
      setAdSetsCampaignId('');
      setSelectedAdSetId('');
      return;
    }
    setSelectedAdSetId('');
  }, [selectedCampaignId]);

  useEffect(() => {
    const shouldLoadAdSets =
      !!adSetSourceCampaignId &&
      !!resolvedStoreIdForView &&
      (
        (campaignMode === 'existing' && ['campaign', 'batching', 'copy', 'config', 'review'].includes(currentStep)) ||
        (campaignMode === 'new' && ['batching', 'copy', 'config', 'review'].includes(currentStep))
      );

    if (!shouldLoadAdSets) {
      if (!adSetSourceCampaignId) {
        setAdSets([]);
        setAdSetsCampaignId('');
        setAdSetsError(null);
      }
      return;
    }

    let active = true;
    const loadAdSets = async () => {
      setAdSetsLoading(true);
      setAdSetsError(null);

      try {
        const params = new URLSearchParams({
          storeId: resolvedStoreIdForView,
          campaignId: adSetSourceCampaignId,
        });
        const response = await fetch(`/api/meta/adsets?${params.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `Failed to load ad sets (${response.status})`);
        }
        const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.adsets) ? data.adsets : [];
        const nextAdSets: MetaAdSetOption[] = rows
          .map((row: unknown) => {
            const record = asRecord(row);
            return record ? normalizeAdSet(record) : null;
          })
          .filter((row: MetaAdSetOption | null): row is MetaAdSetOption => Boolean(row))
          .sort((a: MetaAdSetOption, b: MetaAdSetOption) => compareText(a.name, b.name));

        if (!active) return;
        setAdSets(nextAdSets);
        setAdSetsCampaignId(adSetSourceCampaignId);
        setSelectedAdSetId((current) => {
          if (current && nextAdSets.some((adSet) => adSet.id === current)) return current;
          return nextAdSets[0]?.id || '';
        });
      } catch (err) {
        if (!active) return;
        setAdSets([]);
        setAdSetsCampaignId('');
        setSelectedAdSetId('');
        setAdSetsError(err instanceof Error ? err.message : 'Failed to load ad sets');
      } finally {
        if (active) setAdSetsLoading(false);
      }
    };

    void loadAdSets();

    return () => {
      active = false;
    };
  }, [adSetSourceCampaignId, campaignMode, currentStep, resolvedStoreIdForView]);

  useEffect(() => {
    const sourceAdSet = inheritedCopySourceAdSet;
    const sourceAdSets =
      inheritedCopySourceAdSets.length > 0
        ? inheritedCopySourceAdSets
        : sourceAdSet
          ? [sourceAdSet]
          : [];
    const sourceMode: InheritedAdSettings['sourceMode'] =
      campaignMode === 'existing' && adSetMode === 'existing' ? 'selected_adset' : 'latest_adset';
    const requestId = inheritedSettingsRequestIdRef.current + 1;
    inheritedSettingsRequestIdRef.current = requestId;
    const isCurrentRequest = () => inheritedSettingsRequestIdRef.current === requestId;

    if (
      !resolvedStoreIdForView ||
      sourceAdSets.length === 0
    ) {
      setInheritedSettings(null);
      setInheritedSettingsError(null);
      setInheritedSettingsLoading(false);
      return;
    }

    let active = true;
    const loadInheritedSettings = async () => {
      setInheritedSettings(null);
      setInheritedSettingsLoading(true);
      setInheritedSettingsError(null);
      if (currentStep === 'copy') {
        setPrimaryTextDrafts([]);
        setHeadlineDrafts([]);
        setDescriptionDrafts([]);
        setCopyInitKey('');
      }

      try {
        if (sourceAdSets.length === 0) {
          setInheritedSettings(null);
          setInheritedSettingsError('No ad set was found for the selected source campaign.');
          return;
        }

        const inheritedCandidates: InheritedAdSettings[] = [];
        const sourceErrors: string[] = [];

        for (const candidateAdSet of sourceAdSets) {
          const params = new URLSearchParams({
            storeId: resolvedStoreIdForView,
            adsetId: candidateAdSet.id,
            mode: 'basic',
            preferCache: '0',
            forceLive: '1',
          });
          const response = await fetch(`/api/meta/ads?${params.toString()}`);
          const data = await response.json();
          if (!response.ok) {
            sourceErrors.push(data.error || `Failed to load latest ad (${response.status})`);
            continue;
          }

          const rows = Array.isArray(data.data) ? data.data : [];
          const latestAd = sortByLatest(rows, (row: unknown) => {
            const record = asRecord(row);
            return record ? getAdUpdatedAt(record) : undefined;
          })[0];
          const record = asRecord(latestAd);
          const nextSettings = record ? normalizeInheritedAdSettings(record, candidateAdSet, sourceMode) : null;
          if (nextSettings) inheritedCandidates.push(nextSettings);
        }

        const mergedSettings = mergeInheritedAdSettings(inheritedCandidates);
        if (!active || !isCurrentRequest()) return;
        setInheritedSettings(mergedSettings);
        if (!mergedSettings) {
          setInheritedSettingsError(
            sourceErrors.length > 0
              ? `${sourceErrors[0]}. No cached ad copy was found in the selected campaign ad sets.`
              : 'No ads found in the selected campaign ad sets yet.',
          );
        }
      } catch (err) {
        if (!active || !isCurrentRequest()) return;
        setInheritedSettings(null);
        setInheritedSettingsError(err instanceof Error ? err.message : 'Failed to inherit latest ad settings');
      } finally {
        if (active && isCurrentRequest()) setInheritedSettingsLoading(false);
      }
    };

    void loadInheritedSettings();

    return () => {
      active = false;
    };
  }, [
    adSetMode,
    campaignMode,
    currentStep,
    inheritedCopySourceAdSet,
    inheritedCopySourceAdSets,
    resolvedStoreIdForView,
  ]);

  // Keep the inherited Meta template available for the future batching/review steps
  // without showing the debug-style settings panel in the current selection flow.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      'creativeHub.launchCreative.inheritedSettings',
      JSON.stringify({
        settings: inheritedSettings,
        loading: inheritedSettingsLoading,
        error: inheritedSettingsError,
        adSetMode,
        campaignId: selectedCampaignId,
        adSetId: (adSetMode === 'existing' ? selectedAdSet : latestAdSet)?.id || null,
      }),
    );
  }, [
    adSetMode,
    inheritedSettings,
    inheritedSettingsError,
    inheritedSettingsLoading,
    latestAdSet,
    selectedAdSet,
    selectedCampaignId,
  ]);

  useEffect(() => {
    if (currentStep !== 'batching') return;

    setBatchPlan((previousPlan) => {
      if (adSetMode === 'existing' || splitPreset !== 'manual') {
        return createBatchPlan({
          adSetMode,
          batchMode,
          preset: splitPreset,
          creatives: selectedCreatives,
          productName: selectedProfile?.productName || productNameById(profiles, launchProductId),
          selectedAdSet,
        });
      }

      if (batchMode === 'single' && previousPlan.length !== 1) {
        return createBatchPlan({
          adSetMode,
          batchMode,
          preset: 'manual',
          creatives: selectedCreatives,
          productName: selectedProfile?.productName || productNameById(profiles, launchProductId),
          selectedAdSet,
        });
      }

      const selectedIdSet = new Set(selectedCreatives.map((creative) => creative.id));
      const creativeById = new Map(selectedCreatives.map((creative) => [creative.id, creative]));
      const cleanedPlan = previousPlan
        .map((batch) => ({
          ...batch,
          creativeIds: batch.creativeIds.filter((creativeId) => selectedIdSet.has(creativeId)),
        }))
        .map((batch) => ({
          ...batch,
          ads: normalizeBatchAds(batch, creativeById),
        }))
        .filter((batch) => batch.creativeIds.length > 0 || adSetMode === 'new');

      const assignedIds = new Set(cleanedPlan.flatMap((batch) => batch.creativeIds));
      const missingIds = selectedCreatives
        .map((creative) => creative.id)
        .filter((creativeId) => !assignedIds.has(creativeId));

      if (cleanedPlan.length === 0) {
        return createBatchPlan({
          adSetMode,
          batchMode,
          preset: batchMode === 'multiple' ? 'three_per_adset' : 'manual',
          creatives: selectedCreatives,
          productName: selectedProfile?.productName || productNameById(profiles, launchProductId),
          selectedAdSet,
        });
      }

      if (missingIds.length > 0) {
        cleanedPlan[0] = {
          ...cleanedPlan[0],
          creativeIds: [...cleanedPlan[0].creativeIds, ...missingIds],
          ads: [
            ...(cleanedPlan[0].ads || []),
            ...createSingleMediaAds(
              missingIds
                .map((creativeId) => creativeById.get(creativeId))
                .filter((creative): creative is InboxCreative => Boolean(creative)),
              cleanedPlan[0].id,
            ),
          ],
        };
      }

      return cleanedPlan;
    });
  }, [
    adSetMode,
    batchMode,
    currentStep,
    launchProductId,
    profiles,
    selectedAdSet,
    selectedCreatives,
    selectedProfile?.productName,
    splitPreset,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      'creativeHub.launchCreative.batchPlan',
      JSON.stringify({
        adSetMode,
        batchMode,
        splitPreset,
        campaignMode,
        campaignId: selectedCampaignId,
        newCampaignName,
        newCampaignStructure,
        selectedAdSetId,
        batches: batchPlan,
      }),
    );
  }, [adSetMode, batchMode, batchPlan, campaignMode, newCampaignName, newCampaignStructure, selectedAdSetId, selectedCampaignId, splitPreset]);

  useEffect(() => {
    if (currentStep !== 'copy' || inheritedSettingsLoading) return;

    const sourceAdSetId = inheritedSettings?.sourceAdSetId || selectedAdSet?.id || latestAdSet?.id || '';
    if (!sourceAdSetId) {
      const noSourceKey = [
        'manual-copy',
        campaignMode === 'new' ? selectedAdAccountId || 'no-launch-account' : selectedCampaignId || 'no-campaign',
        'no-adset',
      ].join(':');
      if (copyInitKey === noSourceKey) return;
      setPrimaryTextDrafts([]);
      setHeadlineDrafts([]);
      setDescriptionDrafts([]);
      setCtaDraft('LEARN_MORE');
      setAiCopyLoading(false);
      setAiCopyError(null);
      setAiCopyStatus(null);
      setAiCopyGenerationKey('');
      aiCopyRequestKeyRef.current = '';
      aiCopyRequestIdRef.current += 1;
      setCopyInitKey(noSourceKey);
      return;
    }

    const sourceKey = [
      inheritedSettings?.sourceAdId || 'manual-copy',
      campaignMode === 'new' ? selectedAdAccountId || 'no-launch-account' : selectedCampaignId || 'no-campaign',
      sourceAdSetId,
    ].join(':');
    if (copyInitKey === sourceKey) return;

    setPrimaryTextDrafts(() => {
      const inherited = copyDraftsFromTexts(inheritedSettings?.primaryTexts, 'inherited', true);
      return inherited;
    });
    setHeadlineDrafts(() => {
      const inherited = copyDraftsFromTexts(inheritedSettings?.headlines, 'inherited', true);
      return inherited;
    });
    setDescriptionDrafts(() => {
      return copyDraftsFromTexts(inheritedSettings?.descriptions, 'inherited', true);
    });
    setCtaDraft(ctaLabel(inheritedSettings?.ctaType));
    setAiCopyLoading(false);
    setAiCopyError(null);
    setAiCopyStatus(null);
    setAiCopyGenerationKey('');
    aiCopyRequestKeyRef.current = '';
    aiCopyRequestIdRef.current += 1;
    setCopyInitKey(sourceKey);
  }, [
    copyInitKey,
    currentStep,
    inheritedSettings,
    inheritedSettingsLoading,
    campaignMode,
    latestAdSet?.id,
    selectedAdAccountId,
    selectedAdSet?.id,
    selectedCampaignId,
  ]);

  useEffect(() => {
    if (currentStep !== 'config' || inheritedSettingsLoading) return;
    const sourceAdSet = adSetMode === 'existing' && campaignMode === 'existing' ? selectedAdSet : latestAdSet;
    const sourceCampaign = campaignMode === 'existing' ? selectedCampaign : latestTemplateCampaign;
    const settingsForConfig = sourceAdSet ? inheritedSettings : null;
    const targetingSignature = [
      sourceCampaign?.campaignDailyBudget || '',
      sourceCampaign?.campaignBidStrategy || '',
      sourceAdSet?.targeting?.locations?.join(',') || '',
      sourceAdSet?.targeting?.excludedLocations?.join(',') || '',
      sourceAdSet?.targeting?.ageMin || '',
      sourceAdSet?.targeting?.ageMax || '',
      sourceAdSet?.targeting?.genders?.join(',') || '',
      sourceAdSet?.bidStrategy || '',
      sourceAdSet?.bidAmount || '',
      sourceAdSet?.optimizationGoal || '',
      sourceAdSet?.billingEvent || '',
    ].join('|');
    const sourceKey = [
      settingsForConfig?.sourceAdId || 'manual-config',
      campaignMode === 'new' ? selectedAdAccountId || 'no-launch-account' : selectedCampaignId || 'no-campaign',
      sourceAdSet?.id || 'no-adset',
      targetingSignature,
    ].join(':');
    if (launchConfigInitKey === sourceKey) return;

    setLaunchConfigDraft(createInitialLaunchConfigDraft(settingsForConfig, sourceAdSet, sourceCampaign, selectedProfile));
    setLaunchConfigInitKey(sourceKey);
  }, [
    adSetMode,
    campaignMode,
    currentStep,
    inheritedSettings,
    inheritedSettingsLoading,
    latestAdSet,
    latestTemplateCampaign,
    launchConfigInitKey,
    selectedAdAccountId,
    selectedAdSet,
    selectedCampaign,
    selectedCampaignId,
    selectedProfile,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(
      'creativeHub.launchCreative.copyPlan',
      JSON.stringify({
        sourceAdId: inheritedSettings?.sourceAdId || null,
        sourceAdName: inheritedSettings?.sourceAdName || null,
        sourceAdSetId: inheritedSettings?.sourceAdSetId || null,
        sourceAdSetName: inheritedSettings?.sourceAdSetName || null,
        cta: ctaDraft,
        primaryTexts: selectedCopyTexts(primaryTextDrafts),
        headlines: selectedCopyTexts(headlineDrafts),
        descriptions: selectedCopyTexts(descriptionDrafts),
        allPrimaryTextDrafts: primaryTextDrafts,
        allHeadlineDrafts: headlineDrafts,
        allDescriptionDrafts: descriptionDrafts,
      }),
    );
  }, [ctaDraft, descriptionDrafts, headlineDrafts, inheritedSettings, primaryTextDrafts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sourceAdSet = adSetMode === 'existing' ? selectedAdSet : latestAdSet;
    window.sessionStorage.setItem(
      'creativeHub.launchCreative.launchConfig',
      JSON.stringify({
        campaignMode,
        adSetMode,
        campaign: selectedCampaign || null,
        newCampaignName: campaignMode === 'new' ? newCampaignName : null,
        newCampaignStructure: campaignMode === 'new' ? newCampaignStructure : null,
        sourceAdSet: sourceAdSet || null,
        selectedAdSet: selectedAdSet || null,
        inheritedSettings,
        editableSettings: launchConfigDraft,
        cta: ctaDraft,
        batchPlan,
        creativeCount: selectedCreatives.length,
        copyCounts: {
          primaryTexts: selectedCopyTexts(primaryTextDrafts).length,
          headlines: selectedCopyTexts(headlineDrafts).length,
          descriptions: selectedCopyTexts(descriptionDrafts).length,
        },
      }),
    );
  }, [
    adSetMode,
    batchPlan,
    campaignMode,
    ctaDraft,
    descriptionDrafts,
    headlineDrafts,
    inheritedSettings,
    launchConfigDraft,
    latestAdSet,
    newCampaignName,
    newCampaignStructure,
    primaryTextDrafts,
    selectedAdSet,
    selectedCampaign,
    selectedCreatives.length,
  ]);

  const filterOptions = useMemo(() => {
    const statuses = new Set<string>();
    const formats = new Set<string>();
    const funnels = new Set<string>();
    for (const creative of creatives) {
      statuses.add(getStatusLabel(creative));
      formats.add(creative.creativeFormat);
      const funnel = getFunnel(creative);
      if (funnel !== '—') funnels.add(funnel);
    }
    return {
      statuses: Array.from(statuses).sort(compareText),
      formats: Array.from(formats).sort(compareText),
      funnels: Array.from(funnels).sort(compareText),
    };
  }, [creatives]);

  const filteredCreatives = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = creatives.filter((creative) => {
      if (showSelectedTasksOnly) {
        const taskId = normalizeExternalId(creative.clickupTaskId);
        if (!taskId || !selectedClickUpTaskIds.has(taskId)) return false;
      }
      if (productFilter !== 'all' && creative.productProfileId !== productFilter) return false;
      if (statusFilter !== 'all' && getStatusLabel(creative) !== statusFilter) return false;
      if (formatFilter !== 'all' && creative.creativeFormat !== formatFilter) return false;
      if (funnelFilter !== 'all' && getFunnel(creative) !== funnelFilter) return false;

      if (!normalizedQuery) return true;
      const haystack = [
        creative.creativeName,
        creative.clickupTaskName,
        creative.productName,
        creative.clickupListName,
        creative.driveParentFolderName,
        getOrigin(creative),
        getFunnel(creative),
        getHook(creative),
        getStatusLabel(creative),
        getEditor(creative),
        getReviewer(creative),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    return filtered.sort((a, b) => {
      const aValue = getSortValue(a, sortKey);
      const bValue = getSortValue(b, sortKey);
      const result = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : compareText(String(aValue), String(bValue));
      return sortDirection === 'asc' ? result : -result;
    });
  }, [
    creatives,
    formatFilter,
    funnelFilter,
    productFilter,
    query,
    selectedClickUpTaskIds,
    showSelectedTasksOnly,
    sortDirection,
    sortKey,
    statusFilter,
  ]);

  const groupedCreatives = useMemo(() => {
    const groups = new Map<string, InboxCreative[]>();
    for (const creative of filteredCreatives) {
      const groupName = getGroupName(creative);
      const list = groups.get(groupName) || [];
      list.push(creative);
      groups.set(groupName, list);
    }
    return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
  }, [filteredCreatives]);

  const visibleIds = useMemo(() => filteredCreatives.map((creative) => creative.id), [filteredCreatives]);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const toggleCreative = (creativeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(creativeId)) next.delete(creativeId);
      else next.add(creativeId);
      return next;
    });
  };

  const toggleGroup = (groupName: string, groupCreatives: InboxCreative[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allGroupSelected = groupCreatives.every((creative) => next.has(creative.id));
      for (const creative of groupCreatives) {
        if (allGroupSelected) next.delete(creative.id);
        else next.add(creative.id);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const toggleCollapse = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  const continueWithSelection = () => {
    if (selectedIds.size === 0) return;
    setCurrentStep('campaign');
  };

  const handleAdAccountChange = (accountId: string) => {
    const normalizedAccountId = normalizeMetaAdAccountId(accountId);
    setSelectedAdAccountId(normalizedAccountId || '');
    setCampaigns([]);
    setCampaignsScopeKey('');
    setSelectedCampaignId('');
    setAdSets([]);
    setAdSetsCampaignId('');
    setSelectedAdSetId('');
    setInheritedSettings(null);
    setInheritedSettingsError(null);
    setPrimaryTextDrafts([]);
    setHeadlineDrafts([]);
    setDescriptionDrafts([]);
    setCopyInitKey('');
    setLaunchConfigInitKey('');
    setCampaignSearch('');
  };

  const resetCampaignDependentState = () => {
    setAdSets([]);
    setAdSetsCampaignId('');
    setSelectedAdSetId('');
    setInheritedSettings(null);
    setInheritedSettingsError(null);
    setPrimaryTextDrafts([]);
    setHeadlineDrafts([]);
    setDescriptionDrafts([]);
    setCopyInitKey('');
    setLaunchConfigInitKey('');
  };

  const handleSelectedCampaignChange = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    const campaign = campaigns.find((item) => item.campaignId === campaignId);
    setCampaignSearch(campaign?.campaignName || '');
    resetCampaignDependentState();
  };

  const handleCampaignSearchChange = (value: string) => {
    setCampaignSearch(value);
    if (campaignMode !== 'existing') return;

    const matches = campaigns.filter((campaign) => campaignMatchesSearch(campaign, value));
    if (matches.length === 1 && matches[0].campaignId !== selectedCampaignId) {
      handleSelectedCampaignChange(matches[0].campaignId);
    }
  };

  const continueToBatching = () => {
    if (campaignMode === 'new') {
      if (!newCampaignName.trim()) return;
      setAdSetMode('new');
      setSelectedAdSetId('');
      setCurrentStep('batching');
      return;
    }
    if (!selectedCampaignId) return;
    if (adSetMode === 'existing' && !selectedAdSetId) return;
    setCurrentStep('batching');
  };

  const renameBatch = (batchId: string, name: string) => {
    setSplitPreset('manual');
    setBatchPlan((plan) => plan.map((batch) => (batch.id === batchId ? { ...batch, name } : batch)));
  };

  const applySplitPreset = (preset: SplitPreset) => {
    setBatchMode('multiple');
    setSplitPreset(preset);
  };

  const moveCreativeToBatch = (creativeId: string, targetBatchId: string) => {
    setSplitPreset('manual');
    setBatchPlan((plan) => plan.map((batch) => {
      const withoutCreative = batch.creativeIds.filter((id) => id !== creativeId);
      const adsWithoutCreative = (batch.ads || []).map((ad) => ({
        ...ad,
        creativeIds: ad.creativeIds.filter((id) => id !== creativeId),
      }));
      if (batch.id !== targetBatchId) return { ...batch, creativeIds: withoutCreative, ads: adsWithoutCreative };

      const targetAds = adsWithoutCreative.length > 0
        ? adsWithoutCreative
        : [{ id: uniqueStableId('ad'), name: 'Ad 1', creativeIds: [] }];
      targetAds[0] = {
        ...targetAds[0],
        creativeIds: [...targetAds[0].creativeIds, creativeId].slice(0, 10),
      };
      return { ...batch, creativeIds: [...withoutCreative, creativeId], ads: targetAds };
    }));
  };

  const addAdToBatch = (batchId: string) => {
    setSplitPreset('manual');
    setBatchPlan((plan) => plan.map((batch) => {
      if (batch.id !== batchId) return batch;
      const nextAds = batch.ads || [];
      return {
        ...batch,
        ads: [
          ...nextAds,
          {
            id: uniqueStableId('ad'),
            name: `Ad ${nextAds.length + 1}`,
            creativeIds: [],
          },
        ],
      };
    }));
  };

  const renameAd = (batchId: string, adId: string, name: string) => {
    setSplitPreset('manual');
    setBatchPlan((plan) => plan.map((batch) => (
      batch.id === batchId
        ? {
            ...batch,
            ads: (batch.ads || []).map((ad) => (ad.id === adId ? { ...ad, name } : ad)),
          }
        : batch
    )));
  };

  const deleteAdFromBatch = (batchId: string, adId: string) => {
    setSplitPreset('manual');
    setBatchPlan((plan) => plan.map((batch) => {
      if (batch.id !== batchId || (batch.ads || []).length <= 1) return batch;
      const deletedAd = batch.ads?.find((ad) => ad.id === adId);
      const remainingAds = (batch.ads || []).filter((ad) => ad.id !== adId);
      if (!deletedAd || remainingAds.length === 0) return batch;
      const [fallbackAd, ...restAds] = remainingAds;
      return {
        ...batch,
        ads: [
          {
            ...fallbackAd,
            creativeIds: [...fallbackAd.creativeIds, ...deletedAd.creativeIds].slice(0, 10),
          },
          ...restAds,
        ],
      };
    }));
  };

  const moveCreativeToAd = (batchId: string, adId: string, creativeId: string) => {
    setSplitPreset('manual');
    setBatchPlan((plan) => plan.map((batch) => {
      if (batch.id !== batchId) return batch;
      const ads = batch.ads?.length
        ? batch.ads
        : batch.creativeIds.map((id, index) => ({ id: uniqueStableId('ad'), name: `Ad ${index + 1}`, creativeIds: [id] }));
      const targetAd = ads.find((ad) => ad.id === adId);
      const alreadyInTargetAd = Boolean(targetAd?.creativeIds.includes(creativeId));
      if (!targetAd || (!alreadyInTargetAd && targetAd.creativeIds.length >= 10)) return batch;
      return {
        ...batch,
        ads: ads.map((ad) => {
          const withoutCreative = ad.creativeIds.filter((id) => id !== creativeId);
          if (ad.id !== adId) return { ...ad, creativeIds: withoutCreative };
          return {
            ...ad,
            creativeIds: [...withoutCreative, creativeId].slice(0, 10),
          };
        }),
      };
    }));
  };

  const groupBatchCreativesIntoOneAd = (batchId: string) => {
    setSplitPreset('manual');
    setBatchPlan((plan) => plan.map((batch) => {
      if (batch.id !== batchId) return batch;
      return {
        ...batch,
        ads: createMultiMediaAdsFromIds(batch.creativeIds, batch.ads?.[0]?.name || 'Ad 1'),
      };
    }));
  };

  const splitBatchCreativesIntoAds = (batchId: string) => {
    setSplitPreset('manual');
    const selectedCreativeById = new Map(selectedCreatives.map((creative) => [creative.id, creative]));
    setBatchPlan((plan) => plan.map((batch) => {
      if (batch.id !== batchId) return batch;
      return {
        ...batch,
        ads: createSingleMediaAds(
          batch.creativeIds
            .map((creativeId) => selectedCreativeById.get(creativeId))
            .filter((creative): creative is InboxCreative => Boolean(creative)),
          batch.id,
        ),
      };
    }));
  };

  const addManualBatch = () => {
    setBatchMode('multiple');
    setSplitPreset('manual');
    setBatchPlan((plan) => [
      ...plan,
      {
        id: uniqueStableId('manual-adset'),
        name: `${selectedProfile?.productName || productNameById(profiles, launchProductId)} Ad Set ${plan.length + 1}`,
        creativeIds: [],
      },
    ]);
  };

  const deleteBatch = (batchId: string) => {
    setBatchMode('multiple');
    setSplitPreset('manual');
    setBatchPlan((plan) => {
      if (plan.length <= 1) return plan;

      const deletedBatch = plan.find((batch) => batch.id === batchId);
      const remainingBatches = plan.filter((batch) => batch.id !== batchId);
      if (!deletedBatch || remainingBatches.length === 0) return plan;

      const [fallbackBatch, ...restBatches] = remainingBatches;
      return [
        {
          ...fallbackBatch,
          creativeIds: [...fallbackBatch.creativeIds, ...deletedBatch.creativeIds],
          ads: [...(fallbackBatch.ads || []), ...(deletedBatch.ads || [])],
        },
        ...restBatches,
      ];
    });
  };

  const setThumbnailMode = (creativeId: string, source: VideoThumbnailSelection['source']) => {
    setThumbnailDrafts((current) => ({
      ...current,
      [creativeId]: {
        ...(current[creativeId] || { source }),
        source,
        framePickerOpen: source === 'manual' ? current[creativeId]?.framePickerOpen : false,
        error: undefined,
      },
    }));
  };

  const prepareFramePicker = (creative: InboxCreative) => {
    if (!resolvedStoreIdForView) {
      setThumbnailDrafts((current) => ({
        ...current,
        [creative.id]: {
          ...(current[creative.id] || { source: 'manual' }),
          source: 'manual',
          framePreparing: false,
          error: 'Missing store for video preview.',
        },
      }));
      return;
    }

    const sourceUrl = getCreativeUploadSourceUrl(creative);
    if (!sourceUrl) {
      setThumbnailDrafts((current) => ({
        ...current,
        [creative.id]: {
          ...(current[creative.id] || { source: 'manual' }),
          source: 'manual',
          framePreparing: false,
          error: 'No video source URL found for frame selection.',
        },
      }));
      return;
    }

    const previewUrl = `/api/creative-hub/launch/video-preview?${new URLSearchParams({
      storeId: resolvedStoreIdForView,
      sourceUrl,
    }).toString()}`;

    setThumbnailDrafts((current) => ({
      ...current,
      [creative.id]: {
        ...(current[creative.id] || { source: 'manual' }),
        source: 'manual',
        videoPreviewUrl: previewUrl,
        framePickerOpen: true,
        framePreparing: false,
        error: undefined,
      },
    }));
  };

  const uploadManualThumbnail = async (creative: InboxCreative, file: File) => {
    if (!launchAdAccountId || !resolvedStoreIdForView) {
      setThumbnailDrafts((current) => ({
        ...current,
        [creative.id]: {
          ...(current[creative.id] || { source: 'manual' }),
          source: 'manual',
          fileName: file.name,
          error: 'Missing store or Meta ad account for thumbnail upload.',
        },
      }));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setThumbnailDrafts((current) => ({
      ...current,
      [creative.id]: {
        ...(current[creative.id] || { source: 'manual' }),
        source: 'manual',
        fileName: file.name,
        previewUrl,
        imageUrl: previewUrl,
        uploading: true,
        framePickerOpen: false,
        error: undefined,
      },
    }));

    try {
      const form = new FormData();
      form.set('storeId', resolvedStoreIdForView);
      form.set('adAccountId', launchAdAccountId);
      form.set('creativeId', creative.id);
      form.set('file', file);

      const response = await fetch('/api/creative-hub/launch/thumbnail', {
        method: 'POST',
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        imageHash?: string;
        thumbnailUrl?: string;
        fileName?: string;
        error?: string;
      };

      if (!response.ok || !data.imageHash) {
        throw new Error(data.error || `Thumbnail upload failed (${response.status})`);
      }

      setThumbnailDrafts((current) => ({
        ...current,
        [creative.id]: {
          ...(current[creative.id] || { source: 'manual' }),
          source: 'manual',
          imageHash: data.imageHash,
          imageUrl: data.thumbnailUrl || previewUrl,
          previewUrl: data.thumbnailUrl || previewUrl,
          fileName: data.fileName || file.name,
          uploading: false,
          framePickerOpen: false,
          error: undefined,
        },
      }));
    } catch (err) {
      setThumbnailDrafts((current) => ({
        ...current,
        [creative.id]: {
          ...(current[creative.id] || { source: 'manual' }),
          source: 'manual',
          fileName: file.name,
          previewUrl,
          imageUrl: previewUrl,
          uploading: false,
          framePickerOpen: false,
          error: err instanceof Error ? err.message : 'Failed to upload thumbnail',
        },
      }));
    }
  };

  const generateAiCopy = useCallback(async (
    generationKey: string,
    seeds: {
      primaryTexts: string[];
      headlines: string[];
      descriptions: string[];
      avoidPrimaryTexts?: string[];
      avoidHeadlines?: string[];
      avoidDescriptions?: string[];
      variationSeed?: string;
    },
  ) => {
    const primaryTextSeeds = uniqueTexts(seeds.primaryTexts);
    const headlineSeeds = uniqueTexts(seeds.headlines);
    const descriptionSeeds = uniqueTexts(seeds.descriptions);
    const avoidPrimaryTextSeeds = uniqueTexts(seeds.avoidPrimaryTexts || []);
    const avoidHeadlineSeeds = uniqueTexts(seeds.avoidHeadlines || []);
    const avoidDescriptionSeeds = uniqueTexts(seeds.avoidDescriptions || []);
    if (primaryTextSeeds.length === 0 && headlineSeeds.length === 0 && descriptionSeeds.length === 0) {
      aiCopyRequestIdRef.current += 1;
      setAiCopyLoading(false);
      setAiCopyError('AI Copy Lab needs fetched Meta copy before Claude can generate variants.');
      setAiCopyStatus(null);
      setAiCopyGenerationKey(generationKey);
      aiCopyRequestKeyRef.current = generationKey;
      return;
    }

    const requestId = aiCopyRequestIdRef.current + 1;
    aiCopyRequestIdRef.current = requestId;
    setAiCopyGenerationKey(generationKey);
    aiCopyRequestKeyRef.current = generationKey;
    setAiCopyLoading(true);
    setAiCopyError(null);
    setAiCopyStatus('Claude is generating up to 3 primary texts, headlines, and descriptions...');
    setPrimaryTextDrafts((items) => items.filter((item) => item.source !== 'ai'));
    setHeadlineDrafts((items) => items.filter((item) => item.source !== 'ai'));
    setDescriptionDrafts((items) => items.filter((item) => item.source !== 'ai'));

    try {
      const response = await fetch('/api/creative-hub/launch/ai-copy-variants', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selectedProfile?.productName || productNameById(profiles, launchProductId),
          sourceAdName: inheritedSettings?.sourceAdName,
          sourceAdSetName: inheritedSettings?.sourceAdSetName,
          primaryTexts: primaryTextSeeds,
          headlines: headlineSeeds,
          descriptions: descriptionSeeds,
          avoidPrimaryTexts: avoidPrimaryTextSeeds,
          avoidHeadlines: avoidHeadlineSeeds,
          avoidDescriptions: avoidDescriptionSeeds,
          variationSeed: seeds.variationSeed || `${generationKey}:${Date.now()}`,
        }),
      });
      const data = (await response.json()) as AiCopyVariantsResponse;
      if (!response.ok) {
        throw new Error(data.error || `Failed to generate AI copy (${response.status})`);
      }

      const primarySuggestions = uniqueTexts(data.primaryTexts || []);
      const headlineSuggestions = uniqueTexts(data.headlines || []);
      const descriptionSuggestions = uniqueTexts(data.descriptions || []);

      const addedCount = primarySuggestions.length + headlineSuggestions.length + descriptionSuggestions.length;
      if (addedCount === 0) {
        throw new Error('Claude did not return any usable AI copy variants.');
      }

      if (aiCopyRequestIdRef.current !== requestId) return;

      setPrimaryTextDrafts((items) => replaceAiCopyDrafts(items, primarySuggestions, false));
      setHeadlineDrafts((items) => replaceAiCopyDrafts(items, headlineSuggestions, false));
      setDescriptionDrafts((items) => replaceAiCopyDrafts(items, descriptionSuggestions, false));

      setAiCopyStatus(`Claude added ${addedCount} suggestion${addedCount !== 1 ? 's' : ''}. Select the ones you want to launch.`);
    } catch (err) {
      if (aiCopyRequestIdRef.current !== requestId) return;
      setAiCopyError(err instanceof Error ? err.message : 'Failed to generate AI copy');
      setAiCopyStatus(null);
    } finally {
      if (aiCopyRequestIdRef.current === requestId) {
        setAiCopyLoading(false);
      }
    }
  }, [inheritedSettings, launchProductId, profiles, selectedProfile]);

  const regenerateAiCopy = useCallback(() => {
    const primaryTextSeeds = visibleOurCopyTexts(primaryTextDrafts);
    const headlineSeeds = visibleOurCopyTexts(headlineDrafts);
    const descriptionSeeds = visibleOurCopyTexts(descriptionDrafts);
    const avoidPrimaryTextSeeds = uniqueTexts(
      primaryTextDrafts.filter((item) => item.source === 'ai').map((item) => item.text),
    );
    const avoidHeadlineSeeds = uniqueTexts(
      headlineDrafts.filter((item) => item.source === 'ai').map((item) => item.text),
    );
    const avoidDescriptionSeeds = uniqueTexts(
      descriptionDrafts.filter((item) => item.source === 'ai').map((item) => item.text),
    );
    const variationSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const generationKey = [
      copyInitKey,
      inheritedSettings?.sourceAdId || 'no-source-ad',
      primaryTextSeeds.join('|'),
      headlineSeeds.join('|'),
      descriptionSeeds.join('|'),
      variationSeed,
    ].join('::');

    void generateAiCopy(
      generationKey,
      {
        primaryTexts: primaryTextSeeds,
        headlines: headlineSeeds,
        descriptions: descriptionSeeds,
        avoidPrimaryTexts: avoidPrimaryTextSeeds,
        avoidHeadlines: avoidHeadlineSeeds,
        avoidDescriptions: avoidDescriptionSeeds,
        variationSeed,
      },
    );
  }, [
    copyInitKey,
    descriptionDrafts,
    generateAiCopy,
    headlineDrafts,
    inheritedSettings?.sourceAdId,
    primaryTextDrafts,
  ]);

  useEffect(() => {
    if (currentStep !== 'copy') return;
    if (inheritedSettingsLoading) return;
    if (aiCopyLoading) return;
    if (!inheritedSettings) return;

    const primaryTextSeeds = visibleOurCopyTexts(primaryTextDrafts);
    const headlineSeeds = visibleOurCopyTexts(headlineDrafts);
    const descriptionSeeds = visibleOurCopyTexts(descriptionDrafts);
    const generationKey = [
      copyInitKey,
      inheritedSettings.sourceAdId || 'no-source-ad',
      primaryTextSeeds.join('|'),
      headlineSeeds.join('|'),
      descriptionSeeds.join('|'),
    ].join('::');

    if (!generationKey || aiCopyGenerationKey === generationKey) return;
    void generateAiCopy(generationKey, {
      primaryTexts: primaryTextSeeds,
      headlines: headlineSeeds,
      descriptions: descriptionSeeds,
    });
  }, [
    aiCopyGenerationKey,
    aiCopyLoading,
    copyInitKey,
    currentStep,
    descriptionDrafts,
    generateAiCopy,
    headlineDrafts,
    inheritedSettings,
    inheritedSettingsLoading,
    primaryTextDrafts,
  ]);

  const updateCreativeUploadProgress = (
    creative: InboxCreative,
    patch: Partial<LaunchUploadProgress>,
  ) => {
    setUploadProgress((current) => {
      const previous = current[creative.id];
      const hasErrorPatch = Object.prototype.hasOwnProperty.call(patch, 'error');
      return {
        ...current,
        [creative.id]: {
          creativeId: previous?.creativeId || creative.id,
          creativeName: previous?.creativeName || getCreativeName(creative),
          stage: patch.stage ?? previous?.stage ?? 'queued',
          progress: patch.progress ?? previous?.progress ?? 0,
          message: patch.message ?? previous?.message ?? 'Queued',
          error: hasErrorPatch ? patch.error : previous?.error,
        },
      };
    });
  };

  const uploadCreativeWithProgress = async (creative: InboxCreative): Promise<InboxCreative> => {
    if (creative.metaAssetId) {
      updateCreativeUploadProgress(creative, {
        stage: 'skipped',
        progress: 100,
        message: 'Already uploaded to Meta',
      });
      return creative;
    }

    const sourceUrl = getCreativeUploadSourceUrl(creative);
    if (!sourceUrl) {
      const message = `No downloadable media URL found for "${getCreativeName(creative)}".`;
      updateCreativeUploadProgress(creative, {
        stage: 'error',
        progress: 100,
        message,
        error: message,
      });
      throw new Error(message);
    }

    if (!launchAdAccountId || !resolvedStoreIdForView) {
      const message = 'Missing store or Meta ad account for upload.';
      updateCreativeUploadProgress(creative, {
        stage: 'error',
        progress: 100,
        message,
        error: message,
      });
      throw new Error(message);
    }

    updateCreativeUploadProgress(creative, {
      stage: 'downloading',
      progress: 12,
      message: 'Downloading media source...',
    });

    let simulatedProgress = 12;
    const progressTimer = window.setInterval(() => {
      simulatedProgress = Math.min(88, simulatedProgress + (simulatedProgress < 45 ? 7 : 4));
      updateCreativeUploadProgress(creative, {
        stage: simulatedProgress < 55 ? 'downloading' : 'uploading',
        progress: simulatedProgress,
        message: simulatedProgress < 55 ? 'Downloading media source...' : 'Uploading to Meta...',
      });
    }, 700);

    try {
      const response = await fetch('/api/creative-hub/inbox/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creativeId: creative.id,
          creativeName: getCreativeName(creative),
          driveUrl: sourceUrl,
          adAccountId: launchAdAccountId,
          storeId: resolvedStoreIdForView,
          mediaTypeHint: creative.creativeFormat,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as UploadResponse;

      if (!response.ok) {
        throw new Error(data.error || `Upload failed with HTTP ${response.status}`);
      }
      if (!data.metaAssetId) {
        throw new Error('Upload succeeded but Meta did not return an asset id.');
      }

      const updatedCreative: InboxCreative = {
        ...creative,
        metaAssetId: data.metaAssetId,
        metaAssetType: data.metaAssetType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        thumbnailUrl: data.thumbnailUrl || creative.thumbnailUrl,
        uploadStatus: 'ready',
        uploadProgress: 100,
        uploadError: undefined,
      };

      setCreatives((current) =>
        current.map((item) => (item.id === creative.id ? updatedCreative : item)),
      );
      updateCreativeUploadProgress(creative, {
        stage: 'ready',
        progress: 100,
        message: data.metaAssetType === 'VIDEO' ? 'Uploaded to Meta; processing may continue' : 'Ready in Meta',
        error: undefined,
      });

      return updatedCreative;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload creative';
      updateCreativeUploadProgress(creative, {
        stage: 'error',
        progress: 100,
        message,
        error: message,
      });
      throw new Error(`${getCreativeName(creative)}: ${message}`);
    } finally {
      window.clearInterval(progressTimer);
    }
  };

  const uploadSelectedCreatives = async (): Promise<InboxCreative[]> => {
    const uploadedCreatives: InboxCreative[] = [];
    for (const creative of selectedCreatives) {
      uploadedCreatives.push(await uploadCreativeWithProgress(creative));
    }
    return uploadedCreatives;
  };

  const buildLaunchConfig = (uploadedCreatives: InboxCreative[]): LaunchConfig => {
    if (!selectedProfile) {
      throw new Error('Select a product profile before launching.');
    }
    if (!resolvedStoreIdForView) {
      throw new Error('No active store found for this launch.');
    }
    if (campaignMode === 'existing' && !selectedCampaign) {
      throw new Error('Select an existing campaign before launching.');
    }
    if (campaignMode === 'existing' && !selectedCampaignAccountId) {
      throw new Error('The selected campaign is missing its owning ad account. Refresh campaigns and select it again before launching.');
    }
    if (campaignMode === 'new' && !newCampaignName.trim()) {
      throw new Error('Enter a campaign name before launching.');
    }
    if (campaignMode === 'new' && adSetMode === 'existing') {
      throw new Error('New campaigns must create new ad sets. Switch the ad set mode to New Ad Sets.');
    }
    if (adSetMode === 'existing' && !selectedAdSet) {
      throw new Error('Select an existing ad set before launching.');
    }

    if (launchConfigDraft.launchTiming === 'scheduled') {
      if (!launchConfigDraft.scheduledAt) {
        throw new Error('Choose a future scheduled launch time before launching.');
      }
      const scheduledDate = parseScheduledAtInTimezone(launchConfigDraft.scheduledAt, launchTimezone);
      if (!scheduledDate || scheduledDate.getTime() <= Date.now()) {
        throw new Error(`Scheduled launch time must be in the future for ${launchTimezone}.`);
      }
      if (adSetMode === 'existing') {
        throw new Error(
          'Meta cannot apply a future start time to ads inside an already-existing ad set. Choose New Ad Sets for scheduled launch, or launch into the existing ad set immediately.',
        );
      }
    }

    const primaryTexts = copyDraftsToLaunchItems(primaryTextDrafts);
    const headlines = copyDraftsToLaunchItems(headlineDrafts);
    const descriptions = copyDraftsToLaunchItems(descriptionDrafts);
    if (primaryTexts.length === 0) {
      throw new Error('Select or write at least one primary text before launching.');
    }
    if (headlines.length === 0) {
      throw new Error('Select or write at least one headline before launching.');
    }

    const destinationUrl =
      launchConfigDraft.destinationUrl ||
      inheritedSettings?.destinationUrl ||
      selectedProfile.destinationUrl ||
      '';
    if (!destinationUrl) {
      throw new Error('Destination URL is required before launching.');
    }

    const selectedCreativeIds = uploadedCreatives.map((creative) => creative.id);
    const assignedIds = new Set(batchPlan.flatMap((batch) => batch.creativeIds));
    const unassignedIds = selectedCreativeIds.filter((creativeId) => !assignedIds.has(creativeId));
    if (unassignedIds.length > 0) {
      throw new Error(`${unassignedIds.length} selected creative${unassignedIds.length === 1 ? ' is' : 's are'} not assigned to any ad set.`);
    }
    const launchPlanErrors = findBatchPlanValidationErrors(
      batchPlan,
      new Map(uploadedCreatives.map((creative) => [creative.id, creative])),
    );
    if (launchPlanErrors.length > 0) {
      throw new Error(launchPlanErrors.join('\n'));
    }

    const dailyBudget =
      parseMoneyInput(launchConfigDraft.dailyBudget) ||
      selectedCampaign?.campaignDailyBudget ||
      selectedAdSet?.dailyBudget ||
      latestAdSet?.dailyBudget ||
      selectedProfile.defaultBudget ||
      1;
    const sourceAdSetForLaunch = adSetMode === 'existing' ? selectedAdSet : latestAdSet;
    const bidStrategy =
      campaignMode === 'new'
        ? launchConfigDraft.bidStrategy
        : normalizeBidStrategyForLaunch(
            selectedCampaign?.campaignBidStrategy ||
            sourceAdSetForLaunch?.bidStrategy ||
            selectedProfile.defaultBidStrategy,
          );
    const draftBidAmount = ['COST_CAP', 'LOWEST_COST_WITH_MIN_ROAS'].includes(launchConfigDraft.bidStrategy)
      ? parseMoneyInput(launchConfigDraft.bidAmount)
      : undefined;
    const bidAmount =
      campaignMode === 'new'
        ? draftBidAmount
        : sourceAdSetForLaunch?.bidAmount || selectedProfile.defaultBidAmount;
    const adSetDailyMinSpend = parseMoneyInput(launchConfigDraft.adSetDailyMinSpend);
    const adSetDailyMaxSpend = parseMoneyInput(launchConfigDraft.adSetDailyMaxSpend);
    const testDuration = Number.parseInt(launchConfigDraft.testDuration, 10);
    const useTestDuration = launchConfigDraft.useTestDuration && Number.isFinite(testDuration) && testDuration > 0;
    const launchStatus = launchConfigDraft.launchPaused ? 'PAUSED' : 'ACTIVE';
    const scheduledParts = parseScheduledAtForLaunch(launchConfigDraft.scheduledAt);
    const videoThumbnails: Record<string, VideoThumbnailSelection> = {};
    for (const creative of uploadedCreatives) {
      if (!isVideoCreative(creative)) continue;
      const thumbnailDraft = thumbnailDrafts[creative.id];
      if (!thumbnailDraft || thumbnailDraft.source === 'video') {
        videoThumbnails[creative.id] = { source: 'video' };
        continue;
      }
      if (thumbnailDraft.uploading) {
        throw new Error(`Thumbnail for "${getCreativeName(creative)}" is still uploading.`);
      }
      if (!thumbnailDraft.imageHash) {
        throw new Error(`Upload a manual thumbnail for "${getCreativeName(creative)}" or switch it back to video thumbnail.`);
      }
      videoThumbnails[creative.id] = {
        source: 'manual',
        imageHash: thumbnailDraft.imageHash,
        imageUrl: thumbnailDraft.imageUrl,
        fileName: thumbnailDraft.fileName,
      };
    }

    const launchBatches =
      adSetMode === 'new'
        ? batchPlan
            .filter((batch) => batch.creativeIds.length > 0)
            .map((batch) => {
              const creativeById = new Map(uploadedCreatives.map((creative) => [creative.id, creative]));
              const normalizedAds = normalizeBatchAds(batch, creativeById);
              return {
                id: batch.id,
                name: batch.name,
                creativeIds: batch.creativeIds,
                ads: normalizedAds.map((ad) => ({
                  id: ad.id,
                  name: ad.name,
                  creativeIds: ad.creativeIds,
                })),
                dailyBudget: campaignStructure === 'ABO' ? dailyBudget : undefined,
                dailyMinSpend: campaignStructure === 'CBO' ? adSetDailyMinSpend : undefined,
                dailyMaxSpend: campaignStructure === 'CBO' ? adSetDailyMaxSpend : undefined,
              };
            })
        : undefined;

    const existingAdsetAssignments =
      adSetMode === 'existing'
        ? batchPlan.reduce<Record<string, string[]>>((acc, batch) => {
            const adSetId = batch.existingAdSetId || selectedAdSet?.id;
            if (adSetId && batch.creativeIds.length > 0) {
              acc[adSetId] = [...(acc[adSetId] || []), ...batch.creativeIds];
            }
            return acc;
          }, {})
        : undefined;

    const existingAdsetAdGroups =
      adSetMode === 'existing'
        ? batchPlan.reduce<Record<string, AdPlanItem[]>>((acc, batch) => {
            const adSetId = batch.existingAdSetId || selectedAdSet?.id;
            const creativeById = new Map(uploadedCreatives.map((creative) => [creative.id, creative]));
            const ads = normalizeBatchAds(batch, creativeById)
              .map((ad) => ({
                id: ad.id,
                name: ad.name,
                creativeIds: ad.creativeIds.filter((creativeId) => batch.creativeIds.includes(creativeId)),
              }))
              .filter((ad) => ad.creativeIds.length > 0);
            if (adSetId && ads.length > 0) {
              acc[adSetId] = [...(acc[adSetId] || []), ...ads];
            }
            return acc;
          }, {})
        : undefined;

    const dynamicCreativeConflicts =
      adSetMode === 'new'
        ? (launchBatches || [])
            .filter((batch) => hasDynamicCreativeMultiAdConflict(batch.ads || []))
            .map((batch) => batch.name)
        : Object.entries(existingAdsetAdGroups || {})
            .filter(([, ads]) => hasDynamicCreativeMultiAdConflict(ads))
            .map(([adSetId]) => selectedAdSet?.id === adSetId ? selectedAdSet.name : `ad set ${adSetId}`);

    if (dynamicCreativeConflicts.length > 0) {
      throw new Error(
        `Dynamic adsets can only have one ad. Create another ad set for: ${dynamicCreativeConflicts.join(', ')}.`,
      );
    }

    return {
      productProfileId: selectedProfile.id,
      selectedCreativeIds,
      selectedCreativeSnapshots: uploadedCreatives,
      campaignMode,
      existingCampaignId: campaignMode === 'existing' ? selectedCampaign?.campaignId : undefined,
      newCampaignName: campaignMode === 'new' ? newCampaignName.trim() : undefined,
      adsetMode: adSetMode === 'existing' ? 'existing_adsets' : 'new_adsets',
      adsetDistribution: adSetMode === 'new' && (launchBatches?.length || 0) > 1 ? 'distribute' : 'all_to_one',
      existingAdsetAssignments,
      existingAdsetAdGroups,
      structure: campaignStructure,
      adAccountId: launchAdAccountId || selectedProfile.adAccountId,
      pageId: selectedProfile.pageId,
      instagramActorId: selectedProfile.instagramActorId,
      pixelId: selectedProfile.pixelId,
      conversionEvent: launchConfigDraft.conversionEvent || selectedProfile.conversionEvent,
      destinationUrl,
      dailyBudget,
      adSetDailyMinSpend,
      adSetDailyMaxSpend,
      testDuration: useTestDuration ? testDuration : 0,
      useTestDuration,
      bidStrategy,
      bidAmount,
      roasFloor: bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' ? bidAmount : undefined,
      optimizationGoal: launchConfigDraft.optimizationGoal || 'OFFSITE_CONVERSIONS',
      billingEvent: launchConfigDraft.billingEvent || 'IMPRESSIONS',
      launchStatus,
      adLaunchStatus: launchStatus,
      customTargeting: buildLaunchTargeting(launchConfigDraft, adSetMode === 'existing' ? selectedAdSet : latestAdSet),
      primaryTexts,
      headlines,
      descriptions,
      ctaType: ctaLabel(ctaDraft),
      advantageCreative: launchConfigDraft.advantageCreative,
      usePerCreativeUrls: false,
      videoThumbnails: Object.keys(videoThumbnails).length > 0 ? videoThumbnails : undefined,
      launchTime: launchConfigDraft.launchTiming === 'scheduled' ? 'scheduled' : 'immediately',
      scheduledDate: scheduledParts.scheduledDate,
      scheduledTime: scheduledParts.scheduledTime,
      attributionWindow: attributionToLaunchValue(launchConfigDraft.attribution),
      utmTemplate: launchConfigDraft.urlTags || inheritedSettings?.urlTags || selectedProfile.utmTemplate,
      batches: launchBatches,
      batchStrategy: 'manual',
      launchMode: 'quick',
    };
  };

  const handleLaunch = async () => {
    if (launching) return;
    setLaunching(true);
    setLaunchError(null);
    setLaunchSuccess(null);
    setUploadProgress({});

    try {
      // Validate the launch plan before starting any potentially slow media downloads.
      buildLaunchConfig(selectedCreatives);
      const uploadedCreatives = await uploadSelectedCreatives();
      const launchConfig = buildLaunchConfig(uploadedCreatives);
      const response = await fetch('/api/creative-hub/launch/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: resolvedStoreIdForView,
          launchConfig,
          externalLaunch: externalLaunchContext
            ? {
                source: externalLaunchContext.source,
                launchId: externalLaunchContext.launchId,
                returnUrl: externalLaunchContext.returnUrl,
                callbackUrl: externalLaunchContext.callbackUrl,
                clickupTaskIds: externalLaunchContext.clickupTaskIds,
              }
            : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as LaunchSubmitResult;

      if (!response.ok) {
        throw new Error(data.error || `Launch failed with HTTP ${response.status}`);
      }
      if (data.status === 'partial') {
        throw new Error(extractLaunchErrorFromResult(data));
      }

      const successMessage = data.status === 'scheduled' || launchConfig.launchTime === 'scheduled'
        ? `Launch scheduled for ${formatScheduledLabel(data.scheduledFor || launchConfigDraft.scheduledAt)}. Meta ad sets were created with the future start time.`
        : `Launch created successfully for ${selectedCreatives.length} creative${selectedCreatives.length !== 1 ? 's' : ''}.`;
      const clickupWarning = data.clickupSync && data.clickupSync.failed > 0
        ? ` ClickUp status sync had ${data.clickupSync.failed} warning${data.clickupSync.failed !== 1 ? 's' : ''}; the Meta launch was still created.`
        : '';
      const googleSheetWarning = data.googleSheetSync && data.googleSheetSync.failed > 0
        ? ` Launch successful, but Google Sheet was not updated for ${data.googleSheetSync.failed} task${data.googleSheetSync.failed !== 1 ? 's' : ''}: ${(data.googleSheetSync.notUpdatedTaskNames || []).join(', ') || 'Unknown task'}.`
        : '';
      const callbackWarning = data.externalCallback?.error
        ? ` Immuvi callback warning: ${data.externalCallback.error}`
        : '';
      setLaunchSuccess(`${successMessage}${clickupWarning}${googleSheetWarning}${callbackWarning}`);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  if (externalLaunchIssue) {
    return <ExternalLaunchErrorPage issue={externalLaunchIssue} />;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-[1.5rem] border border-slate-200 bg-white px-6 py-6 shadow-sm sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <Sparkles className="h-3.5 w-3.5" />
                Creative Hub launch flow
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                Launch creatives
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Choose the ClickUp creatives you want to move into launch setup. Your selection stays attached to the existing config, batching, and publish flow.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 px-3 py-1.5">
                Store: {activeStore?.name || 'Resolving store'}
              </span>
              <span className="rounded-full border border-slate-200 px-3 py-1.5">
                Last refresh: {lastSyncedAt ? formatShortDate(lastSyncedAt) : '—'}
              </span>
              <Link
                href="/dashboard/creative-hub"
                className="rounded-full border border-slate-200 px-3 py-1.5 font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                Back to Creative Hub
              </Link>
            </div>
          </div>
        </section>

        {externalLaunchContext && (
          <section
            className={cn(
              'rounded-2xl border px-5 py-4 text-sm shadow-sm',
              externalLaunchNotice?.startsWith('No ready creative')
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900',
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold">
                  Opened from {externalLaunchContext.source === 'immuvi' ? 'Immuvi' : externalLaunchContext.source}
                </p>
                <p className="mt-1 leading-6">
                  {externalLaunchNotice || 'Resolving the requested store and ClickUp task selection...'}
                </p>
              </div>
              {externalLaunchContext.clickupTaskIds.length > 0 && (
                <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold ring-1 ring-current/10">
                  {externalLaunchContext.clickupTaskIds.length} task{externalLaunchContext.clickupTaskIds.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </section>
        )}

        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-6">
              {futureSteps.map((step, index) => {
                const targetStep = stepNameByIndex[index];
                const canJump = Boolean(targetStep && canNavigateToStep(targetStep));
                return (
                <button
                  key={step}
                  type="button"
                  disabled={!canJump}
                  onClick={() => {
                    if (targetStep) setCurrentStep(targetStep);
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-2xl text-left transition',
                    canJump ? 'cursor-pointer hover:bg-white/80' : 'cursor-not-allowed opacity-80',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                      index === stepIndex
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : index < stepIndex
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-300 bg-white text-slate-500',
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <p className={cn('truncate text-xs font-semibold', index === stepIndex ? 'text-blue-700' : 'text-slate-500')}>
                      {step}
                    </p>
                    <p className="hidden text-[11px] text-slate-400 sm:block">
                      {index === stepIndex ? 'Current step' : index < stepIndex ? 'Completed' : 'Coming next'}
                    </p>
                  </span>
                  {index < futureSteps.length - 1 && <div className="hidden h-px flex-1 bg-slate-200 lg:block" />}
                </button>
              );
              })}
            </div>
          </div>
        </section>

        {currentStep === 'creatives' ? (
        <section className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Step 1 · Creative selection
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">
                  Ready-to-launch creatives
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Showing {filteredCreatives.length} of {creatives.length} creatives for {productNameById(profiles, selectedProductId)}.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[680px] xl:grid-cols-[1fr_160px_140px_140px]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search task, hook, origin, editor..."
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  />
                </label>
                <select
                  value={productFilter}
                  onChange={(event) => setProductFilter(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="all">All products</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.productName}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="all">All status</option>
                  {filterOptions.statuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <select
                  value={formatFilter}
                  onChange={(event) => setFormatFilter(event.target.value)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="all">All formats</option>
                  {filterOptions.formats.map((format) => (
                    <option key={format} value={format}>{formatLabels[format as CreativeFormat] || format}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <select
                  value={funnelFilter}
                  onChange={(event) => setFunnelFilter(event.target.value)}
                  className="bg-transparent text-xs outline-none"
                >
                  <option value="all">All funnels</option>
                  {filterOptions.funnels.map((funnel) => (
                    <option key={funnel} value={funnel}>{funnel}</option>
                  ))}
                </select>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                <ArrowUpDown className="h-3.5 w-3.5" />
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="bg-transparent text-xs outline-none"
                >
                  <option value="created">Sort: created</option>
                  <option value="due">Sort: due</option>
                  <option value="name">Sort: name</option>
                  <option value="status">Sort: status</option>
                  <option value="format">Sort: format</option>
                  <option value="folder">Sort: folder</option>
                  <option value="age">Sort: age in status</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortDirection((value) => (value === 'asc' ? 'desc' : 'asc'))}
                  className="rounded-full px-2 py-0.5 text-slate-500 hover:bg-white hover:text-slate-800"
                >
                  {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                </button>
              </div>
              <button
                type="button"
                onClick={toggleAllVisible}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {allVisibleSelected ? 'Clear' : 'Select All'}
              </button>
              <button
                type="button"
                onClick={() => void loadCreatives(true)}
                className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Refresh from ClickUp
              </button>
              <div className="ml-auto flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={showSelectedTasksOnly}
                    onChange={(event) => setShowSelectedTasksOnly(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Show selected tasks
                </label>
                <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                  {selectedIds.size} selected
                </span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              Loading ClickUp creatives...
            </div>
          ) : error || storesError ? (
            <div className="m-6 rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-800">
              <p className="font-semibold">Could not load creative selection.</p>
              <p className="mt-1">{error || storesError}</p>
              <button
                type="button"
                onClick={() => void loadCreatives()}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Try again
              </button>
            </div>
          ) : groupedCreatives.length === 0 ? (
            <div className="m-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
              <Table2 className="mx-auto h-8 w-8 text-slate-400" />
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                {readyTasksWithoutAssets > 0 ? 'Ready tasks need media links' : 'No ready creatives found'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {readyTasksWithoutAssets > 0
                  ? `${readyTasksWithoutAssets} ClickUp Ready to Launch task${readyTasksWithoutAssets !== 1 ? 's were' : ' was'} found, but no launchable Drive link or media attachment was detected. Add a Drive/asset/file/url custom field or attach the creative media, then refresh ClickUp.`
                  : 'Try changing the filters, or refresh ClickUp after moving tasks to Ready to Launch.'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden">
              <div className="hidden grid-cols-[42px_88px_minmax(220px,1.35fr)_minmax(150px,0.8fr)_100px_minmax(150px,0.9fr)_150px_104px_150px_150px_116px_116px_150px] border-b border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 xl:grid">
                <span />
                <span>Source</span>
                <span>Creative / asset</span>
                <span>Origin</span>
                <span>Funnel</span>
                <span>Hook</span>
                <span>Status</span>
                <span>Age</span>
                <span>Editor</span>
                <span>Reviewer</span>
                <span>Created</span>
                <span>Due</span>
                <span>Links</span>
              </div>

              <div className="divide-y divide-slate-200">
                {groupedCreatives.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.name);
                  const groupSelectedCount = group.items.filter((creative) => selectedIds.has(creative.id)).length;
                  const groupAllSelected = groupSelectedCount === group.items.length;
                  const groupLinks = getGroupLinks(group.items);
                  const groupCreatedAt = getGroupCreatedAt(group.items);

                  return (
                    <div key={group.name} className="bg-white">
                      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleCollapse(group.name)}
                          className="rounded-lg p-1 text-slate-500 transition hover:bg-white hover:text-slate-900"
                          aria-label={isCollapsed ? 'Expand group' : 'Collapse group'}
                        >
                          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <input
                          type="checkbox"
                          checked={groupAllSelected}
                          ref={(input) => {
                            if (input) input.indeterminate = groupSelectedCount > 0 && !groupAllSelected;
                          }}
                          onChange={() => toggleGroup(group.name, group.items)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
                          <p className="truncate text-sm font-semibold text-slate-900">{group.name}</p>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                            {group.items.length} creative{group.items.length !== 1 ? 's' : ''}
                          </span>
                          <span className="hidden text-xs text-slate-500 sm:inline">{summarizeFormats(group.items)}</span>
                          {groupCreatedAt && (
                            <span className="hidden rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200 md:inline">
                              Created {formatShortDate(groupCreatedAt)}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-slate-500">
                          {groupSelectedCount}/{group.items.length} selected
                        </span>
                        <GroupLinkActions
                          driveLink={groupLinks.driveLink}
                          clickupLink={groupLinks.clickupLink}
                        />
                      </div>

                      {!isCollapsed && group.items.map((creative) => (
                        <CreativeTableRow
                          key={creative.id}
                          creative={creative}
                          selected={selectedIds.has(creative.id)}
                          onToggle={() => toggleCreative(creative.id)}
                          onPreview={() => setPreviewCreative(creative)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-5 py-4 shadow-[0_-12px_30px_rgba(15,23,42,0.06)] backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-slate-500">
              {selectedIds.size} creative{selectedIds.size !== 1 ? 's' : ''} selected for the launch flow.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard/creative-hub')}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={continueWithSelection}
                disabled={selectedIds.size === 0}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
                  selectedIds.size === 0
                    ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                    : 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700',
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                Select Creatives
              </button>
            </div>
          </div>
        </section>
        ) : currentStep === 'campaign' ? (
          <CampaignAdSetSelectionStep
            adSetMode={adSetMode}
            adSets={adSets}
            adSetsError={adSetsError}
            adSetsLoading={adSetsLoading}
            campaignMode={campaignMode}
            campaigns={campaigns}
            campaignsError={campaignsError}
            campaignsLoading={campaignsLoading}
            campaignSearch={campaignSearch}
            currency={launchCurrency}
            linkedAdAccounts={linkedAdAccounts}
            newCampaignName={newCampaignName}
            newCampaignStructure={newCampaignStructure}
            onAdSetModeChange={setAdSetMode}
            onAdAccountChange={handleAdAccountChange}
            onBack={() => setCurrentStep('creatives')}
            onCampaignModeChange={(mode) => {
              setCampaignMode(mode);
              setCampaigns([]);
              setCampaignsScopeKey('');
              setSelectedCampaignId('');
              resetCampaignDependentState();
              if (mode === 'new') {
                setAdSetMode('new');
              }
            }}
            onCampaignSearchChange={handleCampaignSearchChange}
            onContinue={continueToBatching}
            onNewCampaignNameChange={(value) => {
              setNewCampaignNameTouched(true);
              setNewCampaignName(value);
            }}
            onNewCampaignStructureChange={(structure) => {
              setNewCampaignStructure(structure);
              setAdSetMode('new');
            }}
            onRefreshCampaigns={() => void loadCampaigns()}
            onSelectedAdSetChange={setSelectedAdSetId}
            onSelectedCampaignChange={handleSelectedCampaignChange}
            productName={productNameForFlow}
            selectedAdSet={selectedAdSet}
            selectedAdSetId={selectedAdSetId}
            selectedAdAccountId={selectedAdAccountId}
            selectedCampaign={selectedCampaign}
            selectedCampaignId={selectedCampaignId}
            selectedCreativeCount={selectedIds.size}
          />
        ) : currentStep === 'batching' ? (
          <BatchingStep
            adSetMode={adSetMode}
            batchMode={batchMode}
            batchPlan={batchPlan}
            draggedCreativeId={draggedCreativeId}
            onAddManualBatch={addManualBatch}
            onApplySplitPreset={applySplitPreset}
            onBack={() => setCurrentStep('campaign')}
            onBatchModeChange={(mode) => {
              setBatchMode(mode);
              setSplitPreset(mode === 'single' ? 'manual' : 'three_per_adset');
            }}
            onContinue={() => setCurrentStep('copy')}
            onDragEnd={() => setDraggedCreativeId(null)}
            onDragStart={setDraggedCreativeId}
            onDeleteBatch={deleteBatch}
            onAddAdToBatch={addAdToBatch}
            onDeleteAdFromBatch={deleteAdFromBatch}
            onGroupBatchCreatives={groupBatchCreativesIntoOneAd}
            onMoveCreativeToAd={moveCreativeToAd}
            onMoveCreative={moveCreativeToBatch}
            onRenameAd={renameAd}
            onRenameBatch={renameBatch}
            onSplitBatchCreatives={splitBatchCreativesIntoAds}
            campaignDisplayName={campaignMode === 'new' ? newCampaignName : selectedCampaign?.campaignName}
            productName={selectedProfile?.productName || productNameById(profiles, launchProductId)}
            selectedAdSet={selectedAdSet}
            selectedCampaign={selectedCampaign}
            selectedCreatives={selectedCreatives}
            splitPreset={splitPreset}
          />
        ) : currentStep === 'copy' ? (
          <CopySelectionStep
            aiCopyError={aiCopyError}
            aiCopyLoading={aiCopyLoading}
            aiCopyStatus={aiCopyStatus}
            ctaDraft={ctaDraft}
            descriptionDrafts={descriptionDrafts}
            headlineDrafts={headlineDrafts}
            inheritedSettings={inheritedSettings}
            inheritedSettingsError={inheritedSettingsError}
            inheritedSettingsLoading={inheritedSettingsLoading}
            onBack={() => setCurrentStep('batching')}
            onContinue={() => setCurrentStep('config')}
            onRegenerateAiCopy={regenerateAiCopy}
            primaryTextDrafts={primaryTextDrafts}
            previewCreative={selectedCreatives[0]}
            productName={selectedProfile?.productName || productNameById(profiles, launchProductId)}
            selectedCreativeCount={selectedIds.size}
            selectedPrimaryTextCount={selectedCopyTexts(primaryTextDrafts).length}
            selectedHeadlineCount={selectedCopyTexts(headlineDrafts).length}
            setCtaDraft={setCtaDraft}
            setDescriptionDrafts={setDescriptionDrafts}
            setHeadlineDrafts={setHeadlineDrafts}
            setPrimaryTextDrafts={setPrimaryTextDrafts}
          />
        ) : currentStep === 'config' ? (
          <LaunchConfigStep
            adSetMode={adSetMode}
            campaignMode={campaignMode}
            inheritedSettings={inheritedSettings}
            inheritedSettingsError={inheritedSettingsError}
            inheritedSettingsLoading={inheritedSettingsLoading}
            latestAdSet={latestAdSet}
            launchConfigDraft={launchConfigDraft}
            onBack={() => setCurrentStep('copy')}
            onContinue={() => setCurrentStep('review')}
            onPrepareFramePicker={prepareFramePicker}
            onThumbnailFileChange={(creative, file) => void uploadManualThumbnail(creative, file)}
            onThumbnailModeChange={setThumbnailMode}
            campaignStructure={campaignStructure}
            productName={productNameForFlow}
            selectedAdSet={selectedAdSet}
            selectedCreativeCount={selectedIds.size}
            selectedCreatives={selectedCreatives}
            setLaunchConfigDraft={setLaunchConfigDraft}
            thumbnailDrafts={thumbnailDrafts}
          />
        ) : (
          <ReviewLaunchStep
            adSetMode={adSetMode}
            batchPlan={batchPlan}
            ctaDraft={ctaDraft}
            currency={launchCurrency}
            descriptionDrafts={descriptionDrafts}
            headlineDrafts={headlineDrafts}
            inheritedSettings={inheritedSettings}
            latestAdSet={latestAdSet}
            launchConfigDraft={launchConfigDraft}
            launchError={launchError}
            launching={launching}
            campaignMode={campaignMode}
            campaignStructure={campaignStructure}
            currentLaunchTimeLabel={currentLaunchTimeLabel}
            newCampaignName={newCampaignName}
            onBack={() => setCurrentStep('config')}
            onLaunch={() => void handleLaunch()}
            previewCreative={selectedCreatives[0]}
            primaryTextDrafts={primaryTextDrafts}
            productName={selectedProfile?.productName || productNameById(profiles, launchProductId)}
            selectedAdSet={selectedAdSet}
            selectedCampaign={selectedCampaign}
            selectedCreatives={selectedCreatives}
            setLaunchConfigDraft={setLaunchConfigDraft}
            thumbnailDrafts={thumbnailDrafts}
            uploadProgress={uploadProgress}
          />
        )}
      </div>

      <CreativePreviewModal
        creative={previewCreative}
        isOpen={previewCreative !== null}
        onClose={() => setPreviewCreative(null)}
      />

      {launchSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-slate-950">
              Creative Launch Successful
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{launchSuccess}</p>
            <button
              type="button"
              onClick={() => router.push('/dashboard/creative-hub')}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700"
            >
              Launch more creatives
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function CampaignAdSetSelectionStep({
  adSetMode,
  adSets,
  adSetsError,
  adSetsLoading,
  campaignMode,
  campaigns,
  campaignsError,
  campaignsLoading,
  campaignSearch,
  currency,
  linkedAdAccounts,
  newCampaignName,
  newCampaignStructure,
  onAdSetModeChange,
  onAdAccountChange,
  onBack,
  onCampaignModeChange,
  onCampaignSearchChange,
  onContinue,
  onNewCampaignNameChange,
  onNewCampaignStructureChange,
  onRefreshCampaigns,
  onSelectedAdSetChange,
  onSelectedCampaignChange,
  productName,
  selectedAdSet,
  selectedAdSetId,
  selectedAdAccountId,
  selectedCampaign,
  selectedCampaignId,
  selectedCreativeCount,
}: {
  adSetMode: AdSetMode;
  adSets: MetaAdSetOption[];
  adSetsError: string | null;
  adSetsLoading: boolean;
  campaignMode: CampaignMode;
  campaigns: MetaCampaignOption[];
  campaignsError: string | null;
  campaignsLoading: boolean;
  campaignSearch: string;
  currency: string;
  linkedAdAccounts: Array<{ accountId: string; name: string; currency: string; campaignCount: number }>;
  newCampaignName: string;
  newCampaignStructure: CampaignStructure;
  onAdSetModeChange: (mode: AdSetMode) => void;
  onAdAccountChange: (accountId: string) => void;
  onBack: () => void;
  onCampaignModeChange: (mode: CampaignMode) => void;
  onCampaignSearchChange: (value: string) => void;
  onContinue: () => void;
  onNewCampaignNameChange: (value: string) => void;
  onNewCampaignStructureChange: (structure: CampaignStructure) => void;
  onRefreshCampaigns: () => void;
  onSelectedAdSetChange: (id: string) => void;
  onSelectedCampaignChange: (id: string) => void;
  productName: string;
  selectedAdSet?: MetaAdSetOption;
  selectedAdSetId: string;
  selectedAdAccountId: string;
  selectedCampaign?: MetaCampaignOption;
  selectedCampaignId: string;
  selectedCreativeCount: number;
}) {
  const campaignComboboxRef = useRef<HTMLDivElement | null>(null);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);
  const visibleCampaigns = campaigns.filter((campaign) => campaignMatchesSearch(campaign, campaignSearch));
  const selectedCampaignVisible = Boolean(
    selectedCampaign && visibleCampaigns.some((campaign) => campaign.campaignId === selectedCampaign.campaignId),
  );
  const campaignOptions =
    selectedCampaign && !selectedCampaignVisible
      ? [selectedCampaign, ...visibleCampaigns]
      : visibleCampaigns;
  const canContinue =
    campaignMode === 'new'
      ? Boolean(newCampaignName.trim()) && Boolean(selectedAdAccountId)
      : Boolean(selectedCampaignId) && (adSetMode === 'new' || Boolean(selectedAdSetId));
  const campaignPlaceholder = campaignsLoading
    ? 'Loading campaigns...'
    : campaigns.length === 0
      ? 'No campaigns found'
      : 'Search or select a campaign';

  useEffect(() => {
    if (!campaignDropdownOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!campaignComboboxRef.current?.contains(event.target as Node)) {
        setCampaignDropdownOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [campaignDropdownOpen]);

  const selectCampaignFromCombobox = (campaign: MetaCampaignOption) => {
    onSelectedCampaignChange(campaign.campaignId);
    setCampaignDropdownOpen(false);
  };

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Step 2 · Campaign and ad sets
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">
              Select where these creatives should launch
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Choose an existing campaign or create a new campaign shell. Existing campaigns reuse their Meta settings; new campaigns continue into batching next.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              {productName}
            </span>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              {selectedCreativeCount} creative{selectedCreativeCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Campaign mode</h3>
              <p className="mt-1 text-sm text-slate-500">Use a current campaign, or name a new ABO/CBO campaign for this launch.</p>
            </div>
            <button
              type="button"
              onClick={onRefreshCampaigns}
              disabled={campaignsLoading || campaignMode !== 'existing' || linkedAdAccounts.length === 0}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {campaignsLoading ? 'Refreshing...' : 'Refresh campaigns'}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ModeButton
              active={campaignMode === 'existing'}
              description="Add creatives into a campaign that already exists in Meta."
              icon={<FolderOpen className="h-5 w-5" />}
              label="Existing Campaign"
              onClick={() => onCampaignModeChange('existing')}
            />
            <ModeButton
              active={campaignMode === 'new'}
              description="Name a new campaign and choose ABO or CBO."
              icon={<Sparkles className="h-5 w-5" />}
              label="New Campaign"
              onClick={() => onCampaignModeChange('new')}
            />
          </div>
        </div>

        {campaignMode === 'new' ? (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {linkedAdAccounts.length > 1 ? (
              <div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-950">Launch ad account</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Choose which linked Meta ad account should receive this new campaign.
                    </p>
                  </div>
                  <label className="block w-full lg:w-[360px]">
                    <span className="sr-only">Select launch ad account</span>
                    <select
                      value={selectedAdAccountId}
                      onChange={(event) => onAdAccountChange(event.target.value)}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                    >
                      {linkedAdAccounts.map((account) => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {linkedAdAccounts.map((account) => (
                    <span
                      key={account.accountId}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-semibold',
                        account.accountId === selectedAdAccountId
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-500',
                      )}
                    >
                      {account.name}
                      {account.campaignCount > 0 ? ` · ${account.campaignCount} campaign${account.campaignCount !== 1 ? 's' : ''}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Launch ad account</p>
                  <p className="mt-1 text-xs text-slate-500">This new campaign will use the linked product ad account.</p>
                </div>
                <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {linkedAdAccounts[0]?.name || 'No ad account'}
                </span>
              </div>
            )}

            <label className="block">
              <span className="text-sm font-semibold text-slate-900">Campaign name</span>
              <input
                value={newCampaignName}
                onChange={(event) => onNewCampaignNameChange(event.target.value)}
                placeholder="Example: Phonics Image | CBO 20 May"
                className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Default format: Product Type | Campaign Type Date. You can edit it before continuing.
              </span>
            </label>

            <div>
              <span className="text-sm font-semibold text-slate-900">Campaign structure</span>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {(['CBO', 'ABO'] as CampaignStructure[]).map((structure) => (
                  <button
                    key={structure}
                    type="button"
                    onClick={() => onNewCampaignStructureChange(structure)}
                    className={cn(
                      'rounded-2xl border px-4 py-3 text-left transition',
                      newCampaignStructure === structure
                        ? 'border-blue-300 bg-blue-50 text-blue-800 shadow-sm shadow-blue-500/10'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <p className="text-sm font-semibold">{structure}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {structure === 'CBO' ? 'Budget at campaign level.' : 'Budget per ad set.'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-600">
              New campaign launches create new ad sets, so the next step will take you straight into batching.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div ref={campaignComboboxRef} className="relative">
              <label className="block">
                <span className="text-sm font-semibold text-slate-900">Campaign</span>
                <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={campaignSearch}
                  onChange={(event) => {
                    onCampaignSearchChange(event.target.value);
                    setCampaignDropdownOpen(true);
                  }}
                  onFocus={() => setCampaignDropdownOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && campaignOptions[0]) {
                      event.preventDefault();
                      selectCampaignFromCombobox(campaignOptions[0]);
                    }
                    if (event.key === 'ArrowDown') {
                      setCampaignDropdownOpen(true);
                    }
                    if (event.key === 'Escape') {
                      setCampaignDropdownOpen(false);
                    }
                  }}
                  placeholder={campaignPlaceholder}
                  disabled={campaignsLoading || campaigns.length === 0}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-12 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                />
                  <button
                    type="button"
                    onClick={() => setCampaignDropdownOpen((open) => !open)}
                    disabled={campaignsLoading || campaigns.length === 0}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Show campaigns"
                  >
                    <ChevronDown className={cn('h-4 w-4 transition', campaignDropdownOpen && 'rotate-180')} />
                  </button>
                </div>
              </label>
              {campaignDropdownOpen && (
                <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
                  {campaignOptions.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">
                      {campaignsLoading ? 'Loading campaigns...' : 'No campaigns match this search.'}
                    </div>
                  ) : (
                    campaignOptions.map((campaign) => {
                      const isSelected = campaign.campaignId === selectedCampaignId;
                      return (
                        <button
                          key={campaign.campaignId}
                          type="button"
                          onClick={() => selectCampaignFromCombobox(campaign)}
                          className={cn(
                            'flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left transition',
                            isSelected ? 'bg-blue-50 text-blue-900' : 'text-slate-800 hover:bg-slate-50',
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{campaign.campaignName}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {isCboCampaign(campaign) ? 'CBO' : 'ABO'} · {getStatusText(campaign.effectiveStatus, campaign.isActive)}
                              {campaign.adAccountId ? ` · ${campaign.adAccountId}` : ''}
                            </span>
                          </span>
                          {isSelected && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {campaignsError && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {campaignsError}
              </div>
            )}

            {selectedCampaign && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{selectedCampaign.campaignName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Campaign properties will be reused automatically.
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                    {isCboCampaign(selectedCampaign) ? 'CBO' : 'ABO'}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryTile label="Status" value={getStatusText(selectedCampaign.effectiveStatus, selectedCampaign.isActive)} />
                  <SummaryTile label="Objective" value={selectedCampaign.objective || 'From campaign'} />
                  <SummaryTile
                    label="Budget"
                    value={
                      isCboCampaign(selectedCampaign)
                        ? `${formatBudget(selectedCampaign.campaignDailyBudget || selectedCampaign.campaignLifetimeBudget, currency)}`
                        : 'Ad set level'
                    }
                  />
                  <SummaryTile label="Bid strategy" value={selectedCampaign.campaignBidStrategy || 'From campaign'} />
                </div>
              </div>
            )}
          </div>
        )}

        {campaignMode === 'existing' && (
        <div className="border-t border-slate-100 pt-6">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-950">Ad set mode</h3>
            <p className="mt-1 text-sm text-slate-500">Choose whether creatives go into current ad sets or into new ad sets under the selected campaign.</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ModeButton
              active={adSetMode === 'existing'}
              description="Pick from ad sets already inside the selected campaign."
              icon={<FolderOpen className="h-5 w-5" />}
              label="Existing Ad Sets"
              onClick={() => onAdSetModeChange('existing')}
            />
            <ModeButton
              active={adSetMode === 'new'}
              description="Create fresh ad sets in the selected campaign."
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="New Ad Sets"
              onClick={() => onAdSetModeChange('new')}
            />
          </div>

          {adSetMode === 'existing' ? (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-900">Select ad set</span>
                <select
                  value={selectedAdSetId}
                  onChange={(event) => onSelectedAdSetChange(event.target.value)}
                  disabled={!selectedCampaignId || adSetsLoading || adSets.length === 0}
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {adSets.length === 0 ? (
                    <option value="">{adSetsLoading ? 'Loading ad sets...' : 'No ad sets found for this campaign'}</option>
                  ) : (
                    adSets.map((adSet) => (
                      <option key={adSet.id} value={adSet.id}>
                        {adSet.name} · {getStatusText(adSet.status)}
                      </option>
                    ))
                  )}
                </select>
              </label>

              {adSetsError && (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {adSetsError}
                </div>
              )}

              {selectedAdSet && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-950">{selectedAdSet.name}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <SummaryTile label="Status" value={getStatusText(selectedAdSet.status)} />
                    <SummaryTile label="Spend" value={formatBudget(selectedAdSet.spend, currency)} />
                    <SummaryTile label="Budget" value={formatBudget(selectedAdSet.dailyBudget || selectedAdSet.lifetimeBudget, currency)} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              New ad sets are selected. We will inherit copy and publish settings from the latest ad in the latest ad set from this campaign.
            </div>
          )}

        </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-slate-500">
          {campaignMode === 'new'
            ? `New campaign: ${newCampaignName || 'Name required'}`
            : selectedCampaign
              ? `Selected campaign: ${selectedCampaign.campaignName}`
              : 'Choose an existing campaign to continue.'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to creatives
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-semibold transition',
              canContinue
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-100 text-slate-400',
            )}
          >
            Continue to batching
          </button>
        </div>
      </div>
    </section>
  );
}

function BatchingStep({
  adSetMode,
  batchMode,
  batchPlan,
  campaignDisplayName,
  draggedCreativeId,
  onAddAdToBatch,
  onAddManualBatch,
  onApplySplitPreset,
  onBack,
  onBatchModeChange,
  onContinue,
  onDeleteAdFromBatch,
  onDeleteBatch,
  onDragEnd,
  onDragStart,
  onGroupBatchCreatives,
  onMoveCreativeToAd,
  onMoveCreative,
  onRenameAd,
  onRenameBatch,
  onSplitBatchCreatives,
  productName,
  selectedAdSet,
  selectedCampaign,
  selectedCreatives,
  splitPreset,
}: {
  adSetMode: AdSetMode;
  batchMode: BatchMode;
  batchPlan: BatchPlanItem[];
  campaignDisplayName?: string;
  draggedCreativeId: string | null;
  onAddAdToBatch: (batchId: string) => void;
  onAddManualBatch: () => void;
  onApplySplitPreset: (preset: SplitPreset) => void;
  onBack: () => void;
  onBatchModeChange: (mode: BatchMode) => void;
  onContinue: () => void;
  onDeleteAdFromBatch: (batchId: string, adId: string) => void;
  onDeleteBatch: (batchId: string) => void;
  onDragEnd: () => void;
  onDragStart: (creativeId: string) => void;
  onGroupBatchCreatives: (batchId: string) => void;
  onMoveCreativeToAd: (batchId: string, adId: string, creativeId: string) => void;
  onMoveCreative: (creativeId: string, targetBatchId: string) => void;
  onRenameAd: (batchId: string, adId: string, name: string) => void;
  onRenameBatch: (batchId: string, name: string) => void;
  onSplitBatchCreatives: (batchId: string) => void;
  productName: string;
  selectedAdSet?: MetaAdSetOption;
  selectedCampaign?: MetaCampaignOption;
  selectedCreatives: InboxCreative[];
  splitPreset: SplitPreset;
}) {
  const creativeById = useMemo(() => {
    const map = new Map<string, InboxCreative>();
    for (const creative of selectedCreatives) map.set(creative.id, creative);
    return map;
  }, [selectedCreatives]);
  const totalMediaOptions = batchPlan.reduce((sum, batch) => sum + batch.creativeIds.length, 0);
  const totalPlannedAds = batchPlan.reduce(
    (sum, batch) => sum + (batch.ads?.filter((ad) => ad.creativeIds.length > 0).length || batch.creativeIds.length),
    0,
  );
  const selectedCampaignName = campaignDisplayName || selectedCampaign?.campaignName || 'Selected campaign';
  const validationErrors = findBatchPlanValidationErrors(batchPlan, creativeById);
  const canContinue = validationErrors.length === 0;

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Step 3 · Batching
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">
              Arrange creatives into ad sets
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Build the ad set plan before we move into copy, review, and publishing. You can rename new ad sets and drag creatives between batches.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              {productName}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              {selectedCampaignName}
            </span>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              {totalPlannedAds} ad{totalPlannedAds !== 1 ? 's' : ''} · {totalMediaOptions} media
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6">
        {adSetMode === 'existing' ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-sm font-semibold text-slate-950">Existing ad set selected</p>
            <p className="mt-1 text-sm text-slate-600">
              All selected creatives will be added to one existing ad set: <span className="font-semibold">{selectedAdSet?.name || 'Selected ad set'}</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">New ad set layout</h3>
              <p className="mt-1 text-sm text-slate-500">Choose one ad set for all creatives or split creatives across multiple new ad sets.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ModeButton
                active={batchMode === 'single'}
                description="Place every selected creative inside one new ad set."
                icon={<CheckCircle2 className="h-5 w-5" />}
                label="Single Ad Set"
                onClick={() => onBatchModeChange('single')}
              />
              <ModeButton
                active={batchMode === 'multiple'}
                description="Split creatives into multiple new ad sets, then adjust manually."
                icon={<LayoutGrid className="h-5 w-5" />}
                label="Multiple Ad Sets"
                onClick={() => onBatchModeChange('multiple')}
              />
            </div>

            {batchMode === 'multiple' && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <SplitPresetButton
                  active={splitPreset === 'one_per_adset'}
                  label="1 ad / set"
                  onClick={() => onApplySplitPreset('one_per_adset')}
                />
                <SplitPresetButton
                  active={splitPreset === 'three_per_adset'}
                  label="3 ads / set"
                  onClick={() => onApplySplitPreset('three_per_adset')}
                />
                <SplitPresetButton
                  active={splitPreset === 'folder_split'}
                  label="Folder split"
                  onClick={() => onApplySplitPreset('folder_split')}
                />
                <button
                  type="button"
                  onClick={onAddManualBatch}
                  className="ml-auto rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Add ad set
                </button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Batch plan</h3>
              <p className="mt-1 text-sm text-slate-500">
                {batchPlan.length} ad set{batchPlan.length !== 1 ? 's' : ''} · {totalPlannedAds} ad{totalPlannedAds !== 1 ? 's' : ''} · {totalMediaOptions} media assigned
              </p>
            </div>
            {draggedCreativeId && (
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                Drop on an ad set to move
              </span>
            )}
          </div>

          {validationErrors.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">Fix batching before continuing</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {batchPlan.map((batch, index) => {
              const batchCreatives = batch.creativeIds
                .map((creativeId) => creativeById.get(creativeId))
                .filter((creative): creative is InboxCreative => Boolean(creative));
              return (
                <BatchCard
                  key={batch.id}
                  adSetMode={adSetMode}
                  batch={batch}
                  batchCreatives={batchCreatives}
                  canDelete={adSetMode === 'new' && batchPlan.length > 1}
                  index={index}
                  onDelete={() => onDeleteBatch(batch.id)}
                  onAddAd={() => onAddAdToBatch(batch.id)}
                  onDeleteAd={(adId) => onDeleteAdFromBatch(batch.id, adId)}
                  onDragEnd={onDragEnd}
                  onDragStart={onDragStart}
                  onDropCreative={(creativeId) => onMoveCreative(creativeId, batch.id)}
                  onGroupCreatives={() => onGroupBatchCreatives(batch.id)}
                  onMoveCreativeToAd={(adId, creativeId) => onMoveCreativeToAd(batch.id, adId, creativeId)}
                  onRenameAd={(adId, name) => onRenameAd(batch.id, adId, name)}
                  onRename={(name) => onRenameBatch(batch.id, name)}
                  onSplitCreatives={() => onSplitBatchCreatives(batch.id)}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-slate-500">
          Batching is saved for copy selection and launch config.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to campaign
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-semibold transition',
              canContinue
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-100 text-slate-400',
            )}
          >
            Continue to copy
          </button>
        </div>
      </div>
    </section>
  );
}

function CopySelectionStep({
  aiCopyError,
  aiCopyLoading,
  aiCopyStatus,
  ctaDraft,
  descriptionDrafts,
  headlineDrafts,
  inheritedSettings,
  inheritedSettingsError,
  inheritedSettingsLoading,
  onBack,
  onContinue,
  onRegenerateAiCopy,
  primaryTextDrafts,
  previewCreative,
  productName,
  selectedCreativeCount,
  selectedHeadlineCount,
  selectedPrimaryTextCount,
  setCtaDraft,
  setDescriptionDrafts,
  setHeadlineDrafts,
  setPrimaryTextDrafts,
}: {
  aiCopyError: string | null;
  aiCopyLoading: boolean;
  aiCopyStatus: string | null;
  ctaDraft: string;
  descriptionDrafts: CopyDraftItem[];
  headlineDrafts: CopyDraftItem[];
  inheritedSettings: InheritedAdSettings | null;
  inheritedSettingsError: string | null;
  inheritedSettingsLoading: boolean;
  onBack: () => void;
  onContinue: () => void;
  onRegenerateAiCopy: () => void;
  primaryTextDrafts: CopyDraftItem[];
  previewCreative?: InboxCreative;
  productName: string;
  selectedCreativeCount: number;
  selectedHeadlineCount: number;
  selectedPrimaryTextCount: number;
  setCtaDraft: (value: string) => void;
  setDescriptionDrafts: Dispatch<SetStateAction<CopyDraftItem[]>>;
  setHeadlineDrafts: Dispatch<SetStateAction<CopyDraftItem[]>>;
  setPrimaryTextDrafts: Dispatch<SetStateAction<CopyDraftItem[]>>;
}) {
  const canContinue = selectedPrimaryTextCount > 0 && selectedHeadlineCount > 0;
  const selectedPrimaryTexts = selectedCopyTexts(primaryTextDrafts);
  const selectedHeadlines = selectedCopyTexts(headlineDrafts);
  const previewPrimaryText =
    selectedPrimaryTexts.find((text) => text.trim().length > 40) ||
    selectedPrimaryTexts[0] ||
    primaryTextDrafts.find((item) => item.text.trim().length > 40)?.text ||
    primaryTextDrafts.find((item) => item.text.trim())?.text ||
    '';
  const previewHeadline =
    selectedHeadlines.find((text) => text.trim().length <= 80) ||
    selectedHeadlines[0] ||
    headlineDrafts.find((item) => item.text.trim())?.text ||
    productName;
  const previewDescription = selectedCopyTexts(descriptionDrafts)[0] || descriptionDrafts.find((item) => item.text.trim())?.text || '';
  const setSelectionForSources = (
    setItems: Dispatch<SetStateAction<CopyDraftItem[]>>,
    sources: CopyDraftSource[],
    selected: boolean,
  ) => {
    setItems((current) =>
      current.map((item) =>
        sources.includes(item.source) && item.text.trim() ? { ...item, selected } : item,
      ),
    );
  };
  const setCopyPanelSelection = (sources: CopyDraftSource[], selected: boolean) => {
    setSelectionForSources(setPrimaryTextDrafts, sources, selected);
    setSelectionForSources(setHeadlineDrafts, sources, selected);
    setSelectionForSources(setDescriptionDrafts, sources, selected);
  };
  const getCopyPanelSelectionState = (sources: CopyDraftSource[]) => {
    const panelItems = [...primaryTextDrafts, ...headlineDrafts, ...descriptionDrafts].filter(
      (item) => sources.includes(item.source) && item.text.trim(),
    );
    const selectedCount = panelItems.filter((item) => item.selected).length;
    return {
      allSelected: panelItems.length > 0 && selectedCount === panelItems.length,
      totalCount: panelItems.length,
    };
  };
  const ourCopySelection = getCopyPanelSelectionState(['inherited', 'manual']);
  const aiCopySelection = getCopyPanelSelectionState(['ai']);
  const aiSuggestionCount =
    primaryTextDrafts.filter((item) => item.source === 'ai').length +
    headlineDrafts.filter((item) => item.source === 'ai').length +
    descriptionDrafts.filter((item) => item.source === 'ai').length;
  const destinationUrl = inheritedSettings?.destinationUrl || 'https://example.com';
  const showInitialCopyLoading =
    inheritedSettingsLoading && primaryTextDrafts.length === 0 && headlineDrafts.length === 0 && descriptionDrafts.length === 0;
  const showCopyRefreshing = inheritedSettingsLoading && !showInitialCopyLoading;

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Step 4 · Copy selection
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">
              Select and edit launch copy
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Start from recent ad copy inherited from the latest available ad sets, then edit, add custom copy, or ask Claude for product-specific variants.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              {productName}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              {selectedCreativeCount} creative{selectedCreativeCount !== 1 ? 's' : ''}
            </span>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              {selectedPrimaryTextCount} PT · {selectedHeadlineCount} HL selected
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {inheritedSettingsLoading
                  ? 'Fetching copy from recent ads...'
                  : inheritedSettings
                    ? `Using copy from ${inheritedSettings.sourceAdName}`
                    : 'No latest ad copy found yet'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {inheritedSettings
                  ? `${inheritedSettings.sourceAdSetName} · ${formatShortDate(inheritedSettings.updatedAt)}`
                  : inheritedSettingsError || 'You can still write custom launch copy below.'}
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500">
              Select multiple options
            </span>
          </div>
          {aiCopyStatus && (
            <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {aiCopyStatus}
            </p>
          )}
          {aiCopyError && (
            <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {aiCopyError}
            </p>
          )}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Our Copy</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Merged from inherited ads and your custom launch copy.
                </p>
              </div>
              <CopyPanelActions
                allSelected={ourCopySelection.allSelected}
                badgeLabel="Deduped options"
                disabled={ourCopySelection.totalCount === 0}
                onToggleSelection={() => setCopyPanelSelection(['inherited', 'manual'], !ourCopySelection.allSelected)}
              />
            </div>
            {showCopyRefreshing && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                Refreshing copy from the latest ad...
              </div>
            )}
            <div className="mt-4 max-h-[520px] overflow-y-auto pr-1">
              {showInitialCopyLoading ? (
                <CopyLoadingState />
              ) : (
                <div className="space-y-4">
                  <CopyChoiceSection
                    emptyLabel="No inherited or custom primary text yet."
                    items={primaryTextDrafts}
                    setItems={setPrimaryTextDrafts}
                    sources={['inherited', 'manual']}
                    title="Primary text"
                  />
                  <CopyChoiceSection
                    emptyLabel="No inherited or custom headlines yet."
                    items={headlineDrafts}
                    setItems={setHeadlineDrafts}
                    sources={['inherited', 'manual']}
                    title="Headlines"
                  />
                  <CopyChoiceSection
                    emptyLabel="No inherited or custom descriptions yet."
                    items={descriptionDrafts}
                    setItems={setDescriptionDrafts}
                    sources={['inherited', 'manual']}
                    title="Descriptions"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">AI Copy Lab</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Claude suggestions based on product context and the latest inherited ad copy.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {aiCopyLoading ? (
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </span>
                ) : aiCopyError ? (
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Needs attention
                  </span>
                ) : aiSuggestionCount > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={onRegenerateAiCopy}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Regenerate
                    </button>
                    <CopyPanelActions
                      allSelected={aiCopySelection.allSelected}
                      disabled={aiCopySelection.totalCount === 0}
                      onToggleSelection={() => setCopyPanelSelection(['ai'], !aiCopySelection.allSelected)}
                    />
                  </>
                ) : (
                  <span className="inline-flex items-center justify-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Waiting
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 max-h-[520px] space-y-4 overflow-y-auto pr-1">
              <CopyChoiceSection
                emptyLabel={aiCopyLoading ? 'Generating primary text ideas...' : 'AI primary text ideas will appear automatically.'}
                items={primaryTextDrafts}
                setItems={setPrimaryTextDrafts}
                sources={['ai']}
                title="Primary text"
              />
              <CopyChoiceSection
                emptyLabel={aiCopyLoading ? 'Generating headline ideas...' : 'AI headline ideas will appear automatically.'}
                items={headlineDrafts}
                setItems={setHeadlineDrafts}
                sources={['ai']}
                title="Headlines"
              />
              <CopyChoiceSection
                emptyLabel={aiCopyLoading ? 'Generating description ideas...' : 'AI description ideas will appear automatically.'}
                items={descriptionDrafts}
                setItems={setDescriptionDrafts}
                sources={['ai']}
                title="Descriptions"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <SelectedCopyEditorSection
              helper="Edit the selected primary text variations, or add a new custom one."
              items={primaryTextDrafts}
              kind="textarea"
              minRows={4}
              setItems={setPrimaryTextDrafts}
              title="Selected primary texts"
            />

            <SelectedCopyEditorSection
              helper="Edit selected headlines. Meta usually performs best with short, direct headlines."
              items={headlineDrafts}
              kind="input"
              setItems={setHeadlineDrafts}
              title="Selected headlines"
            />

            <SelectedCopyEditorSection
              helper="Optional supporting copy. Leave empty if you do not want descriptions."
              items={descriptionDrafts}
              kind="input"
              setItems={setDescriptionDrafts}
              title="Selected descriptions"
            />

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Call to action
              </label>
              <select
                value={ctaDraft}
                onChange={(event) => setCtaDraft(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                <option value="LEARN_MORE">Learn More</option>
                <option value="SHOP_NOW">Shop Now</option>
                <option value="SIGN_UP">Sign Up</option>
                <option value="GET_OFFER">Get Offer</option>
                <option value="DOWNLOAD">Download</option>
              </select>
            </div>
          </div>

          <AdCopyPreview
            cta={ctaDraft}
            description={previewDescription}
            destinationUrl={destinationUrl}
            headline={previewHeadline}
            previewCreative={previewCreative}
            primaryText={previewPrimaryText}
            productName={productName}
            sourceAdName={inheritedSettings?.sourceAdName}
            sourceAdSetName={inheritedSettings?.sourceAdSetName}
            urlTags={inheritedSettings?.urlTags}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-slate-500">
          Selected copy is saved for the next review/publish step.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to batching
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-semibold transition',
              canContinue
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-100 text-slate-400',
            )}
          >
            {canContinue ? 'Continue to launch config' : 'Select PT + headline'}
          </button>
        </div>
      </div>
    </section>
  );
}

function LaunchConfigStep({
  adSetMode,
  campaignMode,
  campaignStructure,
  inheritedSettings,
  inheritedSettingsError,
  inheritedSettingsLoading,
  latestAdSet,
  launchConfigDraft,
  onBack,
  onContinue,
  onPrepareFramePicker,
  onThumbnailFileChange,
  onThumbnailModeChange,
  productName,
  selectedAdSet,
  selectedCreativeCount,
  selectedCreatives,
  setLaunchConfigDraft,
  thumbnailDrafts,
}: {
  adSetMode: AdSetMode;
  campaignMode: CampaignMode;
  campaignStructure: CampaignStructure;
  inheritedSettings: InheritedAdSettings | null;
  inheritedSettingsError: string | null;
  inheritedSettingsLoading: boolean;
  latestAdSet?: MetaAdSetOption;
  launchConfigDraft: LaunchConfigDraft;
  onBack: () => void;
  onContinue: () => void;
  onPrepareFramePicker: (creative: InboxCreative) => void;
  onThumbnailFileChange: (creative: InboxCreative, file: File) => void;
  onThumbnailModeChange: (creativeId: string, source: VideoThumbnailSelection['source']) => void;
  productName: string;
  selectedAdSet?: MetaAdSetOption;
  selectedCreativeCount: number;
  selectedCreatives: InboxCreative[];
  setLaunchConfigDraft: Dispatch<SetStateAction<LaunchConfigDraft>>;
  thumbnailDrafts: Record<string, ThumbnailDraft>;
}) {
  const showBudgetField =
    adSetMode === 'new' &&
    (campaignStructure === 'ABO' || campaignMode === 'new');
  const showStrategyControls = campaignMode === 'new' && adSetMode === 'new' && campaignStructure === 'CBO';
  const showAdSetSpendLimits =
    adSetMode === 'new' &&
    campaignStructure === 'CBO' &&
    launchConfigDraft.bidStrategy === 'LOWEST_COST_WITH_BID_CAP';
  const videoCreatives = selectedCreatives.filter(isVideoCreative);
  const sourceAdSet =
    adSetMode === 'existing' && campaignMode === 'existing'
      ? selectedAdSet
      : latestAdSet;
  const sourceAdSetName = sourceAdSet?.name || inheritedSettings?.sourceAdSetName;
  const sourceDescription =
    campaignMode === 'new'
      ? 'Using the latest ad from the selected launch ad account.'
      : adSetMode === 'existing'
      ? 'Using the latest ad from the selected existing ad set.'
      : 'Using the latest ad from the latest ad set in the latest available campaign.';

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Step 5 · Launch config
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">
              Adjust launch-specific settings
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Campaign, ad set, batching, and copy are already selected. The latest Meta setup is inherited here, then every launch-critical setting can be edited before review.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              {productName}
            </span>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700">
              {selectedCreativeCount} creative{selectedCreativeCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">Template source</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{sourceDescription}</p>
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                <span className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                  Ad set: <span className="font-semibold text-slate-900">{sourceAdSetName || 'Not found'}</span>
                </span>
                <span className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                  Ad: <span className="font-semibold text-slate-900">{inheritedSettings?.sourceAdName || 'Not found'}</span>
                </span>
                <span className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                  Updated: <span className="font-semibold text-slate-900">{inheritedSettings?.updatedAt ? formatDate(inheritedSettings.updatedAt) : 'Unknown'}</span>
                </span>
              </div>
            </div>
            <span className="w-fit rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
              {adSetMode === 'existing' ? 'Existing ad set' : 'New ad set template'}
            </span>
          </div>
          {inheritedSettingsLoading ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Fetching latest ad settings...
            </p>
          ) : inheritedSettingsError ? (
            <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {inheritedSettingsError}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">Editable launch settings</h3>
          <p className="mt-1 text-sm text-slate-500">
            Auto-filled from the latest source ad set/ad. Change only what should differ for this launch.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {showBudgetField && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {campaignStructure === 'CBO' ? 'Campaign daily budget' : 'Ad set daily budget'}
                </span>
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                    $
                  </span>
                  <input
                    value={launchConfigDraft.dailyBudget}
                    onChange={(event) =>
                      setLaunchConfigDraft((current) => ({ ...current, dailyBudget: event.target.value }))
                    }
                    placeholder="Use inherited budget"
                    inputMode="decimal"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pl-7 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  />
                </div>
              </label>
            )}

            {showStrategyControls && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Campaign bid strategy</span>
                <select
                  value={launchConfigDraft.bidStrategy}
                  onChange={(event) =>
                    setLaunchConfigDraft((current) => ({ ...current, bidStrategy: normalizeBidStrategyForLaunch(event.target.value) }))
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="LOWEST_COST_WITHOUT_CAP">Highest volume or value</option>
                  <option value="COST_CAP">Cost per result goal</option>
                  <option value="LOWEST_COST_WITH_MIN_ROAS">ROAS goal</option>
                  <option value="LOWEST_COST_WITH_BID_CAP">Bid cap</option>
                </select>
              </label>
            )}

            {showStrategyControls && ['COST_CAP', 'LOWEST_COST_WITH_MIN_ROAS'].includes(launchConfigDraft.bidStrategy) && (
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {launchConfigDraft.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' ? 'ROAS goal' : 'Cost per result goal'}
                </span>
                <input
                  value={launchConfigDraft.bidAmount}
                  onChange={(event) =>
                    setLaunchConfigDraft((current) => ({ ...current, bidAmount: event.target.value }))
                  }
                  placeholder={launchConfigDraft.bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' ? 'Example: 1.5' : 'Example: 15'}
                  inputMode="decimal"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                />
              </label>
            )}

            {showAdSetSpendLimits && (
              <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ad set daily minimum</span>
                  <input
                    value={launchConfigDraft.adSetDailyMinSpend}
                    onChange={(event) =>
                      setLaunchConfigDraft((current) => ({ ...current, adSetDailyMinSpend: event.target.value }))
                    }
                    placeholder="Optional"
                    inputMode="decimal"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Ad set daily maximum</span>
                  <input
                    value={launchConfigDraft.adSetDailyMaxSpend}
                    onChange={(event) =>
                      setLaunchConfigDraft((current) => ({ ...current, adSetDailyMaxSpend: event.target.value }))
                    }
                    placeholder="Optional"
                    inputMode="decimal"
                    className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  />
                </label>
              </div>
            )}

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Optimization goal</span>
              <select
                value={launchConfigDraft.optimizationGoal}
                onChange={(event) =>
                  setLaunchConfigDraft((current) => ({ ...current, optimizationGoal: event.target.value }))
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                <option value="OFFSITE_CONVERSIONS">Offsite conversions</option>
                <option value="LANDING_PAGE_VIEWS">Landing page views</option>
                <option value="LINK_CLICKS">Link clicks</option>
                <option value="REACH">Reach</option>
                <option value="IMPRESSIONS">Impressions</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Billing event</span>
              <select
                value={launchConfigDraft.billingEvent}
                onChange={(event) =>
                  setLaunchConfigDraft((current) => ({ ...current, billingEvent: event.target.value }))
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                <option value="IMPRESSIONS">Impressions</option>
                <option value="LINK_CLICKS">Link clicks</option>
                <option value="THRUPLAY">ThruPlay</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Attribution</span>
              <select
                value={launchConfigDraft.attribution}
                onChange={(event) =>
                  setLaunchConfigDraft((current) => ({ ...current, attribution: event.target.value }))
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                <option value="7-day click, 1-day engagement">7-day click, 1-day engagement</option>
                <option value="7-day click">7-day click</option>
                <option value="1-day click">1-day click</option>
                <option value="1-day click, 1-day view">1-day click, 1-day view</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Conversion event</span>
              <select
                value={launchConfigDraft.conversionEvent}
                onChange={(event) =>
                  setLaunchConfigDraft((current) => ({ ...current, conversionEvent: event.target.value }))
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              >
                <option value="PURCHASE">Purchase</option>
                <option value="INITIATE_CHECKOUT">Initiate checkout</option>
                <option value="ADD_TO_CART">Add to cart</option>
                <option value="LEAD">Lead</option>
                <option value="COMPLETE_REGISTRATION">Complete registration</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Destination URL</span>
              <input
                value={launchConfigDraft.destinationUrl}
                onChange={(event) =>
                  setLaunchConfigDraft((current) => ({ ...current, destinationUrl: event.target.value }))
                }
                placeholder="https://..."
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
            </label>

            <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Age min</span>
                <input
                  value={launchConfigDraft.ageMin}
                  onChange={(event) =>
                    setLaunchConfigDraft((current) => ({ ...current, ageMin: event.target.value }))
                  }
                  inputMode="numeric"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Age max</span>
                <input
                  value={launchConfigDraft.ageMax}
                  onChange={(event) =>
                    setLaunchConfigDraft((current) => ({ ...current, ageMax: event.target.value }))
                  }
                  inputMode="numeric"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Gender</span>
                <select
                  value={launchConfigDraft.gender}
                  onChange={(event) =>
                    setLaunchConfigDraft((current) => ({ ...current, gender: event.target.value as LaunchConfigDraft['gender'] }))
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                >
                  <option value="all">All</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
            </div>

            <label className="block md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">URL tags</span>
              <input
                value={launchConfigDraft.urlTags}
                onChange={(event) =>
                  setLaunchConfigDraft((current) => ({ ...current, urlTags: event.target.value }))
                }
                placeholder="utm_source=..."
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
              />
            </label>

            <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Test duration</span>
                <div className="mt-2 flex rounded-xl border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setLaunchConfigDraft((current) => ({ ...current, useTestDuration: false, testDuration: '' }))}
                    className={cn(
                      'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition',
                      !launchConfigDraft.useTestDuration ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    No fixed duration
                  </button>
                  <button
                    type="button"
                    onClick={() => setLaunchConfigDraft((current) => ({ ...current, useTestDuration: true, testDuration: current.testDuration || '3' }))}
                    className={cn(
                      'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition',
                      launchConfigDraft.useTestDuration ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    Set duration
                  </button>
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Duration days</span>
                <input
                  value={launchConfigDraft.testDuration}
                  onChange={(event) =>
                    setLaunchConfigDraft((current) => ({ ...current, useTestDuration: true, testDuration: event.target.value }))
                  }
                  disabled={!launchConfigDraft.useTestDuration}
                  inputMode="numeric"
                  placeholder="No fixed duration"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </label>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:col-span-2">
              <span>
                <span className="block text-sm font-semibold text-slate-950">Advantage+ creative enhancements</span>
                <span className="mt-1 block text-xs text-slate-500">Controls Meta creative degrees-of-freedom for this launch.</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={launchConfigDraft.advantageCreative}
                onClick={() => setLaunchConfigDraft((current) => ({ ...current, advantageCreative: !current.advantageCreative }))}
                className={cn('relative h-6 w-11 rounded-full transition', launchConfigDraft.advantageCreative ? 'bg-blue-600' : 'bg-slate-300')}
              >
                <span className={cn('absolute top-1 h-4 w-4 rounded-full bg-white shadow transition', launchConfigDraft.advantageCreative ? 'left-6' : 'left-1')} />
              </button>
            </label>
          </div>
        </div>

        {videoCreatives.length > 0 && (
          <VideoThumbnailSelector
            onThumbnailFileChange={onThumbnailFileChange}
            onPrepareFramePicker={onPrepareFramePicker}
            onThumbnailModeChange={onThumbnailModeChange}
            selectedCreatives={videoCreatives}
            thumbnailDrafts={thumbnailDrafts}
          />
        )}

        <LocationTargetingEditor
          excludeLocations={launchConfigDraft.excludeLocations}
          includeLocations={launchConfigDraft.includeLocations}
          onExcludeChange={(excludeLocations) =>
            setLaunchConfigDraft((current) => ({ ...current, excludeLocations }))
          }
          onIncludeChange={(includeLocations) =>
            setLaunchConfigDraft((current) => ({ ...current, includeLocations }))
          }
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-slate-500">
          Launch config is saved for the review/publish step.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to copy
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700"
          >
            Continue to review
          </button>
        </div>
      </div>
    </section>
  );
}

function ReviewLaunchStep({
  adSetMode,
  batchPlan,
  campaignMode,
  campaignStructure,
  ctaDraft,
  currency,
  currentLaunchTimeLabel,
  descriptionDrafts,
  headlineDrafts,
  inheritedSettings,
  latestAdSet,
  launchConfigDraft,
  launchError,
  launching,
  newCampaignName,
  onBack,
  onLaunch,
  previewCreative,
  primaryTextDrafts,
  productName,
  selectedAdSet,
  selectedCampaign,
  selectedCreatives,
  setLaunchConfigDraft,
  thumbnailDrafts,
  uploadProgress,
}: {
  adSetMode: AdSetMode;
  batchPlan: BatchPlanItem[];
  campaignMode: CampaignMode;
  campaignStructure: CampaignStructure;
  ctaDraft: string;
  currency: string;
  currentLaunchTimeLabel: string;
  descriptionDrafts: CopyDraftItem[];
  headlineDrafts: CopyDraftItem[];
  inheritedSettings: InheritedAdSettings | null;
  latestAdSet?: MetaAdSetOption;
  launchConfigDraft: LaunchConfigDraft;
  launchError: string | null;
  launching: boolean;
  newCampaignName: string;
  onBack: () => void;
  onLaunch: () => void;
  previewCreative?: InboxCreative;
  primaryTextDrafts: CopyDraftItem[];
  productName: string;
  selectedAdSet?: MetaAdSetOption;
  selectedCampaign?: MetaCampaignOption;
  selectedCreatives: InboxCreative[];
  setLaunchConfigDraft: Dispatch<SetStateAction<LaunchConfigDraft>>;
  thumbnailDrafts: Record<string, ThumbnailDraft>;
  uploadProgress: Record<string, LaunchUploadProgress>;
}) {
  const creativeById = useMemo(() => new Map(selectedCreatives.map((creative) => [creative.id, creative])), [selectedCreatives]);
  const adCount = useMemo(
    () => batchPlan.reduce((sum, batch) => sum + (batch.ads?.filter((ad) => ad.creativeIds.length > 0).length || batch.creativeIds.length), 0),
    [batchPlan],
  );
  const selectedPrimaryTexts = selectedCopyTexts(primaryTextDrafts);
  const selectedHeadlines = selectedCopyTexts(headlineDrafts);
  const selectedDescriptions = selectedCopyTexts(descriptionDrafts);
  const sourceAdSet = adSetMode === 'existing' ? selectedAdSet : latestAdSet;
  const campaignLabel = campaignMode === 'new' ? newCampaignName || 'New campaign' : selectedCampaign?.campaignName || 'Not selected';
  const reviewDailyBudget =
    parseMoneyInput(launchConfigDraft.dailyBudget) ||
    selectedCampaign?.campaignDailyBudget ||
    sourceAdSet?.dailyBudget;
  const reviewBidStrategy =
    campaignMode === 'new'
      ? launchConfigDraft.bidStrategy
      : selectedCampaign?.campaignBidStrategy || sourceAdSet?.bidStrategy;
  const showReviewBudget =
    adSetMode === 'new' &&
    (campaignStructure === 'ABO' || campaignMode === 'new');
  const reviewBudgetLabel =
    campaignStructure === 'CBO' ? 'Campaign budget' : 'Ad set budget';
  const manualThumbnailCount = selectedCreatives.filter((creative) =>
    isVideoCreative(creative) && thumbnailDrafts[creative.id]?.source === 'manual',
  ).length;
  const reviewValidationErrors = findBatchPlanValidationErrors(batchPlan, creativeById);
  const previewPrimaryText =
    selectedPrimaryTexts.find((text) => text.trim().length > 40) ||
    selectedPrimaryTexts[0] ||
    '';
  const previewHeadline =
    selectedHeadlines.find((text) => text.trim().length <= 80) ||
    selectedHeadlines[0] ||
    productName;
  const previewDescription = selectedDescriptions[0] || '';
  const canLaunch =
    selectedCreatives.length > 0 &&
    batchPlan.some((batch) => batch.creativeIds.length > 0) &&
    selectedPrimaryTexts.length > 0 &&
    selectedHeadlines.length > 0 &&
    reviewValidationErrors.length === 0 &&
    !launching;

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Step 6 · Review
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">
              Review the complete launch plan
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Confirm campaign, batching, copy, locations, and publish timing before this launch is wired to execution.
            </p>
          </div>
          <span className="w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            {selectedCreatives.length} media · {adCount} ad{adCount !== 1 ? 's' : ''} · {batchPlan.length} ad set{batchPlan.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Publish controls</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Choose whether Meta objects are created active or paused, and when the launch should run.
                </p>
              </div>
              <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
                <span className="text-sm font-semibold text-slate-700">Launch creatives as paused</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={launchConfigDraft.launchPaused}
                  onClick={() =>
                    setLaunchConfigDraft((current) => {
                      const launchPaused = !current.launchPaused;
                      return {
                        ...current,
                        launchPaused,
                        launchStatus: launchPaused ? 'PAUSED' : 'ACTIVE',
                      };
                    })
                  }
                  className={cn(
                    'relative h-6 w-11 rounded-full transition',
                    launchConfigDraft.launchPaused ? 'bg-blue-600' : 'bg-slate-300',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 h-4 w-4 rounded-full bg-white shadow transition',
                      launchConfigDraft.launchPaused ? 'left-6' : 'left-1',
                    )}
                  />
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setLaunchConfigDraft((current) => ({
                    ...current,
                    launchTiming: 'immediate',
                    scheduledAt: '',
                  }))
                }
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left transition',
                  launchConfigDraft.launchTiming === 'immediate'
                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <p className="text-sm font-semibold">Launch immediately</p>
                <p className="mt-1 text-xs text-slate-500">Run as soon as the launch action is confirmed.</p>
              </button>
              <button
                type="button"
                onClick={() =>
                  setLaunchConfigDraft((current) => ({
                    ...current,
                    launchTiming: 'scheduled',
                  }))
                }
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left transition',
                  launchConfigDraft.launchTiming === 'scheduled'
                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <p className="text-sm font-semibold">Schedule launch</p>
                <p className="mt-1 text-xs text-slate-500">Choose a future date and time for the launch.</p>
              </button>
            </div>

            {launchConfigDraft.launchTiming === 'scheduled' && (
              <label className="mt-4 block">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Scheduled time</span>
                  <span className="text-xs font-medium text-slate-500">
                    Store time: {currentLaunchTimeLabel}
                  </span>
                </span>
                <input
                  type="datetime-local"
                  value={launchConfigDraft.scheduledAt}
                  onChange={(event) =>
                    setLaunchConfigDraft((current) => ({ ...current, scheduledAt: event.target.value }))
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                />
              </label>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-950">Launch overview</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SummaryTile label="Campaign" value={campaignLabel} />
              <SummaryTile label="Structure" value={campaignStructure} />
              <SummaryTile label="Ad set mode" value={adSetMode === 'existing' ? 'Existing ad set' : 'New ad sets'} />
              <SummaryTile label="Source ad set" value={sourceAdSet?.name || 'Not found'} />
              <SummaryTile label="Template ad" value={inheritedSettings?.sourceAdName || 'Not found'} />
              {showReviewBudget && (
                <SummaryTile label={reviewBudgetLabel} value={formatBudget(reviewDailyBudget, currency)} />
              )}
              {campaignStructure === 'CBO' && (
                <SummaryTile label="Bid strategy" value={readableBidStrategy(reviewBidStrategy || undefined)} />
              )}
              {adSetMode === 'new' && campaignStructure === 'CBO' && launchConfigDraft.bidStrategy === 'LOWEST_COST_WITH_BID_CAP' && (
                <SummaryTile
                  label="Ad set spend limit"
                  value={[
                    launchConfigDraft.adSetDailyMinSpend ? `Min ${formatBudget(parseMoneyInput(launchConfigDraft.adSetDailyMinSpend), currency)}` : '',
                    launchConfigDraft.adSetDailyMaxSpend ? `Max ${formatBudget(parseMoneyInput(launchConfigDraft.adSetDailyMaxSpend), currency)}` : '',
                  ].filter(Boolean).join(' / ') || 'Not set'}
                />
              )}
              <SummaryTile label="Attribution" value={launchConfigDraft.attribution} />
              <SummaryTile label="CTA" value={readableCtaLabel(ctaDraft)} />
              <SummaryTile label="Destination" value={launchConfigDraft.destinationUrl || inheritedSettings?.destinationUrl || 'Not set'} />
              <SummaryTile
                label="Video thumbnails"
                value={manualThumbnailCount > 0 ? `${manualThumbnailCount} manual` : 'From video'}
              />
              <SummaryTile label="Included countries" value={launchConfigDraft.includeLocations.length ? `${launchConfigDraft.includeLocations.length} selected` : 'Not set'} />
              <SummaryTile label="Excluded countries" value={launchConfigDraft.excludeLocations.length ? `${launchConfigDraft.excludeLocations.length} selected` : 'None'} />
              <SummaryTile label="Publish status" value={launchConfigDraft.launchPaused ? 'Paused' : 'Active'} />
            </div>
          </div>

          <LaunchProgressPanel
            batchPlan={batchPlan}
            launching={launching}
            progress={uploadProgress}
            selectedCreatives={selectedCreatives}
          />

          {reviewValidationErrors.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Launch plan needs attention</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {reviewValidationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {launchError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Launch failed</p>
              <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-6">
                {launchError}
              </pre>
            </div>
          )}

        </div>

        <AdCopyPreview
          cta={ctaDraft}
          description={previewDescription}
          destinationUrl={launchConfigDraft.destinationUrl || inheritedSettings?.destinationUrl || 'https://example.com'}
          headline={previewHeadline}
          previewCreative={previewCreative}
          primaryText={previewPrimaryText}
          productName={productName}
          sourceAdName={inheritedSettings?.sourceAdName}
          sourceAdSetName={inheritedSettings?.sourceAdSetName}
          urlTags={launchConfigDraft.urlTags || inheritedSettings?.urlTags}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-slate-500">
          {launching
            ? 'Uploading media and creating Meta objects. Keep this page open.'
            : 'Ready to create the Meta campaign/ad set/ad objects from this plan.'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={launching}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back to config
          </button>
          <button
            type="button"
            onClick={onLaunch}
            disabled={!canLaunch}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
              canLaunch
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-100 text-slate-400',
            )}
          >
            {launching && <Loader2 className="h-4 w-4 animate-spin" />}
            {launching
              ? 'Launching...'
              : launchConfigDraft.launchTiming === 'scheduled'
                ? 'Schedule launch'
                : `Launch ${selectedCreatives.length} creative${selectedCreatives.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </section>
  );
}

function LaunchProgressPanel({
  batchPlan,
  launching,
  progress,
  selectedCreatives,
}: {
  batchPlan: BatchPlanItem[];
  launching: boolean;
  progress: Record<string, LaunchUploadProgress>;
  selectedCreatives: InboxCreative[];
}) {
  const creativeById = useMemo(() => new Map(selectedCreatives.map((creative) => [creative.id, creative])), [selectedCreatives]);
  const plannedBatches = useMemo(() => batchPlan.map((batch) => {
    const batchCreatives = batch.creativeIds
      .map((creativeId) => creativeById.get(creativeId))
      .filter((creative): creative is InboxCreative => Boolean(creative));
    const ads = (batch.ads?.length
      ? batch.ads
      : batchCreatives.map((creative, index) => ({
          id: `${batch.id}-${creative.id}`,
          name: readableAdSetName(getCreativeName(creative)) || `Ad ${index + 1}`,
          creativeIds: [creative.id],
        }))
    ).map((ad, index) => ({
      ...ad,
      name: ad.name?.trim() || `Ad ${index + 1}`,
      creatives: ad.creativeIds
        .map((creativeId) => creativeById.get(creativeId))
        .filter((creative): creative is InboxCreative => Boolean(creative)),
    })).filter((ad) => ad.creatives.length > 0);
    return { ...batch, ads };
  }).filter((batch) => batch.ads.length > 0), [batchPlan, creativeById]);

  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const [expandedAdIds, setExpandedAdIds] = useState<Set<string>>(new Set());
  const [collapsedLaunchBatchIds, setCollapsedLaunchBatchIds] = useState<Set<string>>(new Set());
  const [collapsedLaunchAdIds, setCollapsedLaunchAdIds] = useState<Set<string>>(new Set());
  const rows = plannedBatches.flatMap((batch) =>
    batch.ads.flatMap((ad) =>
      ad.creatives.map((creative) => {
        const existing = progress[creative.id];
        return existing || {
          creativeId: creative.id,
          creativeName: getCreativeName(creative),
          stage: creative.metaAssetId ? 'skipped' : 'waiting',
          progress: creative.metaAssetId ? 100 : 0,
          message: creative.metaAssetType === 'VIDEO'
            ? 'Uploaded to Meta; processing may continue'
            : creative.metaAssetId
              ? 'Ready in Meta'
              : 'Waiting to upload',
        };
      }),
    ),
  );
  const hasProgress = Object.keys(progress).length > 0;
  const isLaunchingView = launching || hasProgress;

  if (rows.length === 0) return null;

  const completed = rows.filter((row) => row.stage === 'ready' || row.stage === 'skipped').length;
  const failed = rows.filter((row) => row.stage === 'error').length;
  const toggleBatchExpanded = (batchId: string) => {
    const setter = isLaunchingView ? setCollapsedLaunchBatchIds : setExpandedBatchIds;
    setter((current) => {
      const next = new Set(current);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };
  const toggleAdExpanded = (adId: string) => {
    const setter = isLaunchingView ? setCollapsedLaunchAdIds : setExpandedAdIds;
    setter((current) => {
      const next = new Set(current);
      if (next.has(adId)) {
        next.delete(adId);
      } else {
        next.add(adId);
      }
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="px-4 py-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">
            {isLaunchingView ? 'Launching Creatives' : 'Batch snapshot'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {isLaunchingView
              ? `${completed}/${rows.length} ready${failed ? ` · ${failed} failed` : ''}`
              : 'Ad sets are collapsed by default. Open one to see the ads and media options inside it.'}
          </p>
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-200 p-4">
        {plannedBatches.map((batch) => {
          const isBatchExpanded = isLaunchingView
            ? !collapsedLaunchBatchIds.has(batch.id)
            : expandedBatchIds.has(batch.id);
          return (
            <div key={batch.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => toggleBatchExpanded(batch.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-slate-100"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {isBatchExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <span className="truncate text-sm font-semibold text-slate-950">{batch.name}</span>
                </span>
                <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                  {batch.ads.length} ad{batch.ads.length !== 1 ? 's' : ''}
                </span>
              </button>

              {isBatchExpanded && (
                <div className="space-y-3 border-t border-slate-200 p-3">
                  {batch.ads.map((ad) => {
                    const adKey = `${batch.id}:${ad.id}`;
                    const isAdExpanded = isLaunchingView
                      ? !collapsedLaunchAdIds.has(adKey)
                      : expandedAdIds.has(adKey);
                    return (
                      <div key={ad.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <button
                          type="button"
                          onClick={() => toggleAdExpanded(adKey)}
                          className="w-full px-3 py-3 text-left transition hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              {isAdExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                              )}
                              <span className="truncate text-sm font-semibold text-slate-900">{ad.name}</span>
                            </span>
                            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                              {ad.creatives.length}/10 media
                            </span>
                          </div>
                          {!isAdExpanded && (
                            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 pl-6">
                              {ad.creatives.map((creative) => (
                                <div key={creative.id} className="flex min-w-0 max-w-[220px] items-center gap-2">
                                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                                    {creative.thumbnailUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={creative.thumbnailUrl} alt={creative.creativeName} className="h-full w-full object-cover" />
                                    ) : null}
                                  </div>
                                  <span className="truncate text-xs font-semibold text-slate-700">{getCreativeName(creative)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </button>

                        {isAdExpanded && (
                          <div className="space-y-2 border-t border-slate-100 p-3">
                            {ad.creatives.map((creative) => {
                              const row: {
                                creativeId: string;
                                creativeName: string;
                                stage: LaunchProgressDisplayStage;
                                progress: number;
                                message: string;
                                error?: string;
                              } = progress[creative.id] || {
                                creativeId: creative.id,
                                creativeName: getCreativeName(creative),
                                stage: creative.metaAssetId ? 'skipped' : 'waiting',
                                progress: creative.metaAssetId ? 100 : 0,
                                message: creative.metaAssetType === 'VIDEO'
                                  ? 'Uploaded to Meta; processing may continue'
                                  : creative.metaAssetId
                                    ? 'Ready in Meta'
                                    : 'Waiting to upload',
                              };
                              return (
                                <div key={creative.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                        {creative.thumbnailUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img src={creative.thumbnailUrl} alt={creative.creativeName} className="h-full w-full object-cover" />
                                        ) : null}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">{row.creativeName}</p>
                                        <p className={cn('mt-0.5 text-xs', row.stage === 'error' ? 'text-red-600' : 'text-slate-500')}>
                                          {row.message}
                                        </p>
                                      </div>
                                    </div>
                                    <span
                                      className={cn(
                                        'shrink-0 rounded-full px-2 py-1 text-xs font-semibold',
                                        row.stage === 'error'
                                          ? 'bg-red-100 text-red-700'
                                          : row.stage === 'ready' || row.stage === 'skipped'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : row.stage === 'waiting'
                                              ? 'bg-slate-200 text-slate-600'
                                              : 'bg-blue-100 text-blue-700',
                                      )}
                                    >
                                      {row.stage === 'skipped' ? 'ready' : row.stage}
                                    </span>
                                  </div>
                                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                                    <div
                                      className={cn(
                                        'h-full rounded-full transition-all',
                                        row.stage === 'error'
                                          ? 'bg-red-500'
                                          : row.stage === 'ready' || row.stage === 'skipped'
                                            ? 'bg-emerald-500'
                                            : row.stage === 'waiting'
                                              ? 'bg-slate-300'
                                              : 'bg-blue-600',
                                      )}
                                      style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }}
                                    />
                                  </div>
                                  {row.error && (
                                    <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-red-700">
                                      {row.error}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VideoThumbnailSelector({
  onThumbnailFileChange,
  onPrepareFramePicker,
  onThumbnailModeChange,
  selectedCreatives,
  thumbnailDrafts,
}: {
  onThumbnailFileChange: (creative: InboxCreative, file: File) => void;
  onPrepareFramePicker: (creative: InboxCreative) => void;
  onThumbnailModeChange: (creativeId: string, source: VideoThumbnailSelection['source']) => void;
  selectedCreatives: InboxCreative[];
  thumbnailDrafts: Record<string, ThumbnailDraft>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Video thumbnails</h3>
          <p className="mt-1 text-sm text-slate-500">
            Use the thumbnail from the video, or upload a manual thumbnail for each video ad.
          </p>
        </div>
        <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          {selectedCreatives.length} video{selectedCreatives.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {selectedCreatives.map((creative) => (
          <VideoThumbnailCard
            key={creative.id}
            creative={creative}
            draft={thumbnailDrafts[creative.id] || { source: 'video' }}
            onPrepareFramePicker={onPrepareFramePicker}
            onThumbnailFileChange={onThumbnailFileChange}
            onThumbnailModeChange={onThumbnailModeChange}
          />
        ))}
      </div>
    </div>
  );
}

function VideoThumbnailCard({
  creative,
  draft,
  onPrepareFramePicker,
  onThumbnailFileChange,
  onThumbnailModeChange,
}: {
  creative: InboxCreative;
  draft: ThumbnailDraft;
  onPrepareFramePicker: (creative: InboxCreative) => void;
  onThumbnailFileChange: (creative: InboxCreative, file: File) => void;
  onThumbnailModeChange: (creativeId: string, source: VideoThumbnailSelection['source']) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameTrackRef = useRef<HTMLDivElement | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [selectedFrameTime, setSelectedFrameTime] = useState(0);
  const previewUrl = draft.previewUrl || draft.imageUrl || creative.thumbnailUrl;
  const manualSelected = draft.source === 'manual';
  const framePercent = videoDuration > 0
    ? Math.max(0, Math.min(100, (selectedFrameTime / videoDuration) * 100))
    : 0;

  const seekVideoToClientX = (clientX: number) => {
    const track = frameTrackRef.current;
    const video = videoRef.current;
    if (!track || !video || videoDuration <= 0) return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextTime = ratio * videoDuration;
    video.currentTime = nextTime;
    setSelectedFrameTime(nextTime);
  };

  const formatFrameTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const remainingSeconds = whole % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const seconds = Math.max(0, Math.round(video.currentTime * 10) / 10);
      const file = new File([blob], `${getCreativeName(creative)}-${seconds}s-thumbnail.jpg`, {
        type: 'image/jpeg',
      });
      onThumbnailFileChange(creative, file);
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {previewUrl ? (
            // Dynamic thumbnails can be remote Meta/Drive URLs, so keep the plain image element.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={getCreativeName(creative)} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <Film className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-950">{getCreativeName(creative)}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => onThumbnailModeChange(creative.id, 'video')}
              className={cn(
                'rounded-xl border px-3 py-2 text-left text-xs font-semibold transition',
                draft.source !== 'manual'
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100',
              )}
            >
              From video
            </button>
            <button
              type="button"
              onClick={() => onPrepareFramePicker(creative)}
              className={cn(
                'rounded-xl border px-3 py-2 text-left text-xs font-semibold transition',
                draft.framePickerOpen
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100',
              )}
            >
              Choose frame
            </button>
            <label
              className={cn(
                'cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold transition',
                manualSelected && !draft.framePickerOpen
                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100',
              )}
            >
              <span className="inline-flex items-center gap-2">
                {draft.uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Manual image
              </span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onThumbnailFileChange(creative, file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          {manualSelected && (
            <p className="mt-2 truncate text-xs text-slate-500">
              {draft.uploading
                ? 'Uploading thumbnail to Meta...'
                : draft.imageHash
                  ? draft.fileName || 'Manual thumbnail ready'
                  : draft.framePickerOpen
                    ? 'Scrub the video and capture a frame.'
                    : 'Choose an image or frame to use as the thumbnail.'}
            </p>
          )}
          {draft.error && (
            <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-700">
              {draft.error}
            </p>
          )}
        </div>
      </div>

      {draft.framePickerOpen && draft.videoPreviewUrl && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <video
            ref={videoRef}
            src={draft.videoPreviewUrl}
            controls
            preload="metadata"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
              setSelectedFrameTime(video.currentTime || 0);
            }}
            onTimeUpdate={(event) => setSelectedFrameTime(event.currentTarget.currentTime || 0)}
            className="aspect-video w-full rounded-lg bg-black object-contain"
          />
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>{formatFrameTime(selectedFrameTime)}</span>
              <span>{formatFrameTime(videoDuration)}</span>
            </div>
            <div
              ref={frameTrackRef}
              role="slider"
              aria-label="Video frame selector"
              aria-valuemin={0}
              aria-valuemax={Math.round(videoDuration)}
              aria-valuenow={Math.round(selectedFrameTime)}
              tabIndex={0}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                seekVideoToClientX(event.clientX);
              }}
              onPointerMove={(event) => {
                if (event.buttons !== 1) return;
                seekVideoToClientX(event.clientX);
              }}
              onKeyDown={(event) => {
                const video = videoRef.current;
                if (!video || videoDuration <= 0) return;
                const step = event.shiftKey ? 1 : 0.1;
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const direction = event.key === 'ArrowRight' ? 1 : -1;
                const nextTime = Math.max(0, Math.min(videoDuration, selectedFrameTime + direction * step));
                video.currentTime = nextTime;
                setSelectedFrameTime(nextTime);
              }}
              className="relative mt-2 h-16 cursor-ew-resize rounded-xl border border-slate-200 bg-[linear-gradient(90deg,#e2e8f0,#f8fafc,#e0f2fe,#f8fafc,#e2e8f0)] p-1 outline-none transition focus:ring-4 focus:ring-blue-50"
            >
              <div className="absolute inset-x-3 top-1/2 h-px bg-slate-300" />
              <div
                className="absolute top-1 h-14 w-10 -translate-x-1/2 rounded-lg border-2 border-blue-600 bg-blue-500/10 shadow-sm shadow-blue-900/10"
                style={{ left: `${framePercent}%` }}
              >
                <div className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-blue-600" />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={captureFrame}
              className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Use current frame
            </button>
            <span className="text-xs text-slate-500">
              Pause on the exact frame, then capture it.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function LocationTargetingEditor({
  excludeLocations,
  includeLocations,
  onExcludeChange,
  onIncludeChange,
}: {
  excludeLocations: string[];
  includeLocations: string[];
  onExcludeChange: (locations: string[]) => void;
  onIncludeChange: (locations: string[]) => void;
}) {
  const [includeInput, setIncludeInput] = useState('');
  const [excludeInput, setExcludeInput] = useState('');

  useEffect(() => {
    const normalizedInclude = uniqueLocations(includeLocations);
    const includeKeys = new Set(normalizedInclude.map(locationKey));
    const normalizedExclude = uniqueLocations(excludeLocations).filter((location) => !includeKeys.has(locationKey(location)));

    if (!arraysEqual(includeLocations, normalizedInclude)) {
      onIncludeChange(normalizedInclude);
    }
    if (!arraysEqual(excludeLocations, normalizedExclude)) {
      onExcludeChange(normalizedExclude);
    }
  }, [excludeLocations, includeLocations, onExcludeChange, onIncludeChange]);

  const addLocations = (type: 'include' | 'exclude') => {
    const value = type === 'include' ? includeInput : excludeInput;
    const parsed = parseLocationInput(value);
    if (parsed.length === 0) return;
    if (type === 'include') {
      const excludeKeys = new Set(excludeLocations.map(locationKey));
      onIncludeChange(uniqueLocations([...includeLocations, ...parsed.filter((location) => !excludeKeys.has(locationKey(location)))]));
      setIncludeInput('');
    } else {
      const includeKeys = new Set(includeLocations.map(locationKey));
      onExcludeChange(uniqueLocations([...excludeLocations, ...parsed.filter((location) => !includeKeys.has(locationKey(location)))]));
      setExcludeInput('');
    }
  };

  const addSingleLocation = (type: 'include' | 'exclude', location: string) => {
    if (!location) return;
    const normalizedLocation = normalizeLocationName(location);
    if (type === 'include') {
      const excludeKeys = new Set(excludeLocations.map(locationKey));
      if (!excludeKeys.has(locationKey(normalizedLocation))) {
        onIncludeChange(uniqueLocations([...includeLocations, normalizedLocation]));
      }
    } else {
      const includeKeys = new Set(includeLocations.map(locationKey));
      if (!includeKeys.has(locationKey(normalizedLocation))) {
        onExcludeChange(uniqueLocations([...excludeLocations, normalizedLocation]));
      }
    }
  };

  const removeLocation = (type: 'include' | 'exclude', location: string) => {
    if (type === 'include') {
      onIncludeChange(includeLocations.filter((item) => locationKey(item) !== locationKey(location)));
    } else {
      onExcludeChange(excludeLocations.filter((item) => locationKey(item) !== locationKey(location)));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Location targeting</h3>
          <p className="mt-1 text-sm text-slate-500">
            Auto-filled from the source ad set targeting. Add countries one per line or comma separated.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {includeLocations.length} included
          </span>
          <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
            {excludeLocations.length} excluded
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <LocationListEditor
          input={includeInput}
          label="Include locations"
          locations={includeLocations}
          onAdd={() => addLocations('include')}
          onAddSingle={(location) => addSingleLocation('include', location)}
          onInputChange={setIncludeInput}
          onRemove={(location) => removeLocation('include', location)}
          placeholder="India, United States, GB..."
          unavailableLocations={excludeLocations}
        />
        <LocationListEditor
          input={excludeInput}
          label="Exclude locations"
          locations={excludeLocations}
          onAdd={() => addLocations('exclude')}
          onAddSingle={(location) => addSingleLocation('exclude', location)}
          onInputChange={setExcludeInput}
          onRemove={(location) => removeLocation('exclude', location)}
          placeholder="Paste exclusions, one per line or comma separated"
          unavailableLocations={includeLocations}
        />
      </div>
    </div>
  );
}

function LocationListEditor({
  input,
  label,
  locations,
  onAdd,
  onAddSingle,
  onInputChange,
  onRemove,
  placeholder,
  unavailableLocations,
}: {
  input: string;
  label: string;
  locations: string[];
  onAdd: () => void;
  onAddSingle: (location: string) => void;
  onInputChange: (value: string) => void;
  onRemove: (location: string) => void;
  placeholder: string;
  unavailableLocations: string[];
}) {
  const [selectedCountry, setSelectedCountry] = useState('');
  const unavailableKeys = useMemo(
    () => new Set([...locations, ...unavailableLocations].map(locationKey)),
    [locations, unavailableLocations],
  );
  const availableCountries = useMemo(
    () => COUNTRY_OPTIONS.filter((country) => !unavailableKeys.has(locationKey(country))),
    [unavailableKeys],
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          {locations.length}
        </span>
      </div>

      {locations.length > 0 ? (
        <div className="mb-3 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {locations.map((location) => (
            <div key={location} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0">
              <span className="text-sm font-medium text-slate-700">{location}</span>
              <button
                type="button"
                onClick={() => onRemove(location)}
                className="rounded-full px-2 py-0.5 text-sm font-semibold text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
                aria-label={`Remove ${location}`}
              >
                -
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-3 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-5 text-center text-sm text-slate-500">
          No locations selected.
        </div>
      )}

      <div className="mb-2 flex gap-2">
        <select
          value={selectedCountry}
          onChange={(event) => setSelectedCountry(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        >
          <option value="">Select country...</option>
          {availableCountries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            onAddSingle(selectedCountry);
            setSelectedCountry('');
          }}
          disabled={!selectedCountry}
          className={cn(
            'rounded-xl border px-4 text-sm font-semibold transition',
            selectedCountry
              ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
          )}
        >
          Add
        </button>
      </div>

      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          rows={2}
          placeholder={placeholder}
          className="min-h-[72px] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
        />
        <button
          type="button"
          onClick={onAdd}
          className="rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function CopyLoadingState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-950">Loading latest ad copy</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Fetching the latest ads from the selected campaign ad sets, then pulling their primary texts, headlines, descriptions, and CTA.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
              <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-slate-100" />
            <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-slate-100" />
            <div className="mt-2 h-3 w-2/3 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyPanelActions({
  allSelected,
  badgeLabel,
  disabled,
  onToggleSelection,
}: {
  allSelected: boolean;
  badgeLabel?: string;
  disabled: boolean;
  onToggleSelection: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badgeLabel && (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          {badgeLabel}
        </span>
      )}
      <button
        type="button"
        onClick={onToggleSelection}
        disabled={disabled}
        className={cn(
          'rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : allSelected
              ? 'hover:border-slate-300 hover:bg-slate-100'
              : 'hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700',
        )}
      >
        {allSelected ? 'Clear all' : 'Select all'}
      </button>
    </div>
  );
}

function CopyChoiceSection({
  emptyLabel,
  items,
  setItems,
  sources,
  title,
}: {
  emptyLabel: string;
  items: CopyDraftItem[];
  setItems: Dispatch<SetStateAction<CopyDraftItem[]>>;
  sources: CopyDraftSource[];
  title: string;
}) {
  const visibleItems = items.filter((item) => sources.includes(item.source) && item.text.trim());
  const selectedCount = visibleItems.filter((item) => item.selected && item.text.trim()).length;

  const toggleItem = (id: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)),
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          {selectedCount} selected
        </span>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-5 text-center text-sm text-slate-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleItem(item.id)}
              className={cn(
                'w-full rounded-xl border p-3 text-left transition',
                item.selected
                  ? 'border-blue-300 bg-blue-50 shadow-sm shadow-blue-100'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <span className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
                    item.selected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-300 bg-white text-slate-400',
                  )}
                >
                  {item.selected ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm leading-5 text-slate-700">
                      {shortCopyPreview(item.text || 'Untitled copy', 180)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                      {sourceLabel(item.source)}
                    </span>
                  </span>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectedCopyEditorSection({
  helper,
  items,
  kind,
  minRows = 2,
  setItems,
  title,
}: {
  helper: string;
  items: CopyDraftItem[];
  kind: 'input' | 'textarea';
  minRows?: number;
  setItems: Dispatch<SetStateAction<CopyDraftItem[]>>;
  title: string;
}) {
  const selectedCount = items.filter((item) => item.selected && item.text.trim()).length;
  const selectedItems = items.filter((item) => item.selected);

  const updateItem = (id: string, patch: Partial<CopyDraftItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, selected: false } : item)),
    );
  };

  const addItem = () => {
    setItems((current) => [...current, createCopyDraft('', 'manual', true)]);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base font-semibold tracking-[-0.01em] text-slate-950">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={addItem}
            className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            Add copy
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {selectedItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
            <p className="text-sm text-slate-500">No selected copy yet.</p>
            <button
              type="button"
              onClick={addItem}
              className="mt-3 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Write custom copy
            </button>
          </div>
        ) : (
          selectedItems.map((item) => {
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Copy variation
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-base font-semibold leading-none text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove copy variation"
                  >
                    -
                  </button>
                </div>
                {kind === 'textarea' ? (
                  <textarea
                    value={item.text}
                    onChange={(event) => updateItem(item.id, { text: event.target.value })}
                    rows={minRows}
                    placeholder="Write launch copy..."
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  />
                ) : (
                  <input
                    value={item.text}
                    onChange={(event) => updateItem(item.id, { text: event.target.value })}
                    placeholder="Write launch copy..."
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function AdCopyPreview({
  cta,
  description,
  destinationUrl,
  headline,
  previewCreative,
  primaryText,
  productName,
  sourceAdName,
  sourceAdSetName,
  urlTags,
}: {
  cta: string;
  description: string;
  destinationUrl: string;
  headline: string;
  previewCreative?: InboxCreative;
  primaryText: string;
  productName: string;
  sourceAdName?: string;
  sourceAdSetName?: string;
  urlTags?: string;
}) {
  const FormatIcon = previewCreative ? formatIcons[previewCreative.creativeFormat] || ImageIcon : ImageIcon;
  const previewUrl = destinationUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  const metaRows = [
    { label: 'Destination URL', value: destinationUrl },
    { label: 'URL tags / UTM', value: urlTags },
    { label: 'Source ad', value: sourceAdName },
    { label: 'Source ad set', value: sourceAdSetName },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value?.trim()));

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-4 xl:sticky xl:top-5 xl:self-start">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Ad Preview</p>
          <p className="mt-1 text-xs text-slate-500">Preview updates from the selected copy.</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          Meta-style
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            Ad
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold leading-5 text-slate-950">{productName || 'Your Brand'}</p>
            <p className="text-xs text-slate-500">Sponsored</p>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-5 text-slate-800">
            {primaryText || 'Select a primary text to preview the ad copy here.'}
          </p>
        </div>

        <div className="flex min-h-[260px] items-center justify-center bg-slate-50">
          {previewCreative?.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewCreative.thumbnailUrl}
              alt={previewCreative.creativeName}
              className="h-full max-h-[360px] w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <FormatIcon className="h-12 w-12" />
              <p className="text-xs font-semibold">Creative preview</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold leading-5 text-slate-950">{headline || productName}</p>
            <p className="mt-0.5 break-all text-xs leading-5 text-slate-500">
              {description || previewUrl || 'Destination URL'}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {readableCtaLabel(cta)}
          </button>
        </div>
      </div>

      {metaRows.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Meta details</p>
          <div className="mt-3 space-y-3">
            {metaRows.map((row) => (
              <div key={row.label}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{row.label}</p>
                <p className="mt-1 whitespace-pre-wrap break-all text-sm leading-5 text-slate-800">{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function SplitPresetButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
        active
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100',
      )}
    >
      {label}
    </button>
  );
}

function BatchCard({
  adSetMode,
  batch,
  batchCreatives,
  canDelete,
  index,
  onAddAd,
  onDelete,
  onDeleteAd,
  onDragEnd,
  onDragStart,
  onDropCreative,
  onGroupCreatives,
  onMoveCreativeToAd,
  onRenameAd,
  onRename,
  onSplitCreatives,
}: {
  adSetMode: AdSetMode;
  batch: BatchPlanItem;
  batchCreatives: InboxCreative[];
  canDelete: boolean;
  index: number;
  onAddAd: () => void;
  onDelete: () => void;
  onDeleteAd: (adId: string) => void;
  onDragEnd: () => void;
  onDragStart: (creativeId: string) => void;
  onDropCreative: (creativeId: string) => void;
  onGroupCreatives: () => void;
  onMoveCreativeToAd: (adId: string, creativeId: string) => void;
  onRenameAd: (adId: string, name: string) => void;
  onRename: (name: string) => void;
  onSplitCreatives: () => void;
}) {
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const creativeId = event.dataTransfer.getData('text/plain');
    if (creativeId) onDropCreative(creativeId);
  };
  const handleAdDrop = (event: DragEvent<HTMLDivElement>, adId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const creativeId = event.dataTransfer.getData('text/plain');
    if (creativeId) onMoveCreativeToAd(adId, creativeId);
  };
  const creativeById = useMemo(() => new Map(batchCreatives.map((creative) => [creative.id, creative])), [batchCreatives]);
  const ads = useMemo(() => {
    const normalizedAds = batch.ads?.length
      ? batch.ads
      : batchCreatives.map((creative, adIndex) => ({
          id: `${batch.id}-ad-${creative.id}`,
          name: readableAdSetName(getCreativeName(creative)) || `Ad ${adIndex + 1}`,
          creativeIds: [creative.id],
        }));
    return normalizedAds.map((ad, adIndex) => ({
      ...ad,
      name: ad.name || `Ad ${adIndex + 1}`,
      creatives: ad.creativeIds
        .map((creativeId) => creativeById.get(creativeId))
        .filter((creative): creative is InboxCreative => Boolean(creative)),
    }));
  }, [batch.ads, batch.id, batchCreatives, creativeById]);

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {adSetMode === 'existing' ? 'Existing ad set' : 'New ad set name'}
          </label>
          <input
            value={batch.name}
            onChange={(event) => onRename(event.target.value)}
            disabled={adSetMode === 'existing'}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50 disabled:bg-slate-100 disabled:text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            {ads.filter((ad) => ad.creatives.length > 0).length} ad{ads.filter((ad) => ad.creatives.length > 0).length !== 1 ? 's' : ''} · {batchCreatives.length} media option{batchCreatives.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-full border border-red-100 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onGroupCreatives}
          className="rounded-full border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
        >
          Group into 1 ad
        </button>
        <button
          type="button"
          onClick={onSplitCreatives}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Split into ads
        </button>
        <button
          type="button"
          onClick={onAddAd}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <Plus className="h-3.5 w-3.5" />
          Add ad
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {batchCreatives.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Drop creatives here.
          </div>
        ) : (
          ads.map((ad, adIndex) => (
            <div
              key={ad.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => handleAdDrop(event, ad.id)}
              className="rounded-xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {adIndex + 1}
                </div>
                <input
                  value={ad.name}
                  onChange={(event) => onRenameAd(ad.id, event.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
                />
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                  {ad.creatives.length}/10 media
                </span>
                {ads.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteAd(ad.id)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    aria-label="Delete ad"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {ad.creatives.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
                    Empty ad. Move media here from another ad.
                  </div>
                ) : (
                  ad.creatives.map((creative) => (
                    <BatchCreativeCard
                      key={creative.id}
                      ads={ads.map((option) => ({ id: option.id, name: option.name }))}
                      currentAdId={ad.id}
                      creative={creative}
                      onDragEnd={onDragEnd}
                      onDragStart={() => onDragStart(creative.id)}
                      onMoveToAd={(targetAdId) => onMoveCreativeToAd(targetAdId, creative.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BatchCreativeCard({
  ads,
  currentAdId,
  creative,
  onDragEnd,
  onDragStart,
  onMoveToAd,
}: {
  ads: Array<{ id: string; name: string }>;
  currentAdId: string;
  creative: InboxCreative;
  onDragEnd: () => void;
  onDragStart: () => void;
  onMoveToAd: (adId: string) => void;
}) {
  const FormatIcon = formatIcons[creative.creativeFormat] || ImageIcon;
  return (
    <div
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', creative.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="flex cursor-grab items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 active:cursor-grabbing"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {creative.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creative.thumbnailUrl} alt={creative.creativeName} className="h-full w-full object-cover" />
        ) : (
          <FormatIcon className="h-4 w-4 text-slate-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{getCreativeName(creative)}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {getGroupName(creative)} · {formatLabels[creative.creativeFormat]}
        </p>
      </div>
      {ads.length > 1 && (
        <select
          value={currentAdId}
          onChange={(event) => onMoveToAd(event.target.value)}
          className="h-8 max-w-[120px] rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          onClick={(event) => event.stopPropagation()}
          aria-label="Move media to ad"
        >
          {ads.map((ad) => (
            <option key={ad.id} value={ad.id}>{ad.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function ModeButton({
  active,
  description,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  description: string;
  icon: ReactNode;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[92px] items-center gap-4 rounded-2xl border p-4 text-left transition',
        active
          ? 'border-blue-400 bg-blue-50 text-blue-950 shadow-sm shadow-blue-100'
          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
          active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {label}
          {meta && (
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {meta}
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span>
      </span>
    </button>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-slate-800">{value}</p>
    </div>
  );
}

function CreativeTableRow({
  creative,
  selected,
  onToggle,
  onPreview,
}: {
  creative: InboxCreative;
  selected: boolean;
  onToggle: () => void;
  onPreview: () => void;
}) {
  const FormatIcon = formatIcons[creative.creativeFormat] || ImageIcon;
  const taskName = creative.clickupTaskName || creative.creativeName;
  const creativeName = getCreativeName(creative);
  const shouldShowTask = taskName && taskName !== creativeName;
  const driveLink = getDriveLink(creative);

  return (
    <div
      className={cn(
        'grid gap-3 border-b border-slate-100 px-4 py-3 text-sm transition last:border-b-0 xl:grid-cols-[42px_88px_minmax(220px,1.35fr)_minmax(150px,0.8fr)_100px_minmax(150px,0.9fr)_150px_104px_150px_150px_116px_116px_150px] xl:items-center xl:gap-0',
        selected ? 'bg-blue-50/35' : 'bg-white hover:bg-slate-50/80',
      )}
    >
      <div className="flex items-center gap-3 xl:block">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 xl:hidden">Select</span>
      </div>

      <button
        type="button"
        onClick={onPreview}
        className="flex items-center gap-2 text-left"
        title="Preview creative"
      >
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {creative.thumbnailUrl ? (
            // Dynamic Drive thumbnails are proxied/remote URLs, so keep the plain image element here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creative.thumbnailUrl} alt={creative.creativeName} className="h-full w-full object-cover" />
          ) : (
            <FormatIcon className="h-4 w-4 text-slate-400" />
          )}
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 xl:hidden">
          {formatLabels[creative.creativeFormat]}
        </span>
      </button>

      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{creativeName}</p>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
          {shouldShowTask && <span className="rounded-full bg-slate-100 px-2 py-0.5">Task: {taskName}</span>}
          {creative.productName && <span className="rounded-full bg-slate-100 px-2 py-0.5">{creative.productName}</span>}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 xl:hidden">{getStatusLabel(creative)}</span>
        </div>
      </div>

      <Cell label="Origin" value={getOrigin(creative)} />
      <Cell label="Funnel" value={getFunnel(creative)} compact />
      <Cell label="Hook" value={getHook(creative)} />
      <div>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          {getStatusLabel(creative)}
        </span>
      </div>
      <Cell label="Age" value={formatRelativeDays(creative.clickupUpdatedAt || creative.clickupCreatedAt)} compact />
      <Cell label="Editor" value={getEditor(creative)} />
      <Cell label="Reviewer" value={getReviewer(creative)} />
      <Cell label="Created" value={formatShortDate(getCreativeCreatedAt(creative))} compact />
      <Cell label="Due" value={formatShortDate(creative.clickupTaskContext?.dueDate)} compact />
      <div className="flex flex-wrap items-center gap-1.5">
        {driveLink && (
          <a
            href={driveLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Drive
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {creative.clickupTaskUrl ? (
          <a
            href={creative.clickupTaskUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            ClickUp
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="inline-flex rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400">
            ClickUp
          </span>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 xl:hidden">{label}</p>
      <p className={cn('truncate text-slate-700', compact ? 'text-xs font-medium' : 'text-sm')}>{value || '—'}</p>
    </div>
  );
}

function GroupLinkActions({
  driveLink,
  clickupLink,
}: {
  driveLink?: string;
  clickupLink?: string;
}) {
  return (
    <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
      {driveLink && (
        <a
          href={driveLink}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Drive
          <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {clickupLink ? (
        <a
          href={clickupLink}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
        >
          ClickUp
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="inline-flex rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-400">
          ClickUp
        </span>
      )}
    </div>
  );
}
