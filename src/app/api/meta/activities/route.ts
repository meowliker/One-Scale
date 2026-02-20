import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getAllStores, getStoreAdAccounts } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStores, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';

// Map Meta event_type strings to our ActionType
function mapEventType(eventType: string): string | null {
  const map: Record<string, string> = {
    'update_campaign_budget': 'budget_increase',
    'update_adset_budget': 'budget_increase',
    'update_campaign_run_status': 'status_pause',
    'update_adset_run_status': 'status_pause',
    'update_ad_run_status': 'status_pause',
    'create_campaign': 'status_enable',
    'create_adset': 'status_enable',
    'create_ad': 'creative_update',
    'update_ad_creative': 'creative_update',
    'update_adset_targeting': 'audience_change',
    'update_adset_bid_info': 'bid_change',
    'update_campaign_bid_strategy': 'bid_change',
    'ad_account_update_spend_limit': 'budget_decrease',
    'update_adset_schedule': 'schedule_change',
    'update_campaign_schedule': 'schedule_change',
    'funding_event_initiate': 'budget_increase',
    'update_ad_labels': 'creative_update',
    'update_adset_optimization_goal': 'ai_optimization',
  };
  return map[eventType] || null;
}

// Determine if a status change was pause or enable
function refineStatusAction(eventType: string, extraData: unknown): string {
  if (eventType.includes('run_status')) {
    try {
      if (extraData) {
        const parsed = typeof extraData === 'string' ? JSON.parse(extraData) : extraData;
        if (parsed.new_value === 'PAUSED' || parsed.new_value === '2') return 'status_pause';
        if (parsed.new_value === 'ACTIVE' || parsed.new_value === '1') return 'status_enable';
      }
    } catch {
      // ignore parse errors
    }
  }
  return mapEventType(eventType) || 'ai_optimization';
}

// Determine if budget was increase or decrease
function refineBudgetAction(extraData: unknown): string {
  try {
    if (extraData) {
      const parsed = typeof extraData === 'string' ? JSON.parse(extraData) : extraData;
      const oldVal = parseFloat(parsed.old_value || '0');
      const newVal = parseFloat(parsed.new_value || '0');
      return newVal > oldVal ? 'budget_increase' : 'budget_decrease';
    }
  } catch {
    // ignore parse errors
  }
  return 'budget_increase';
}

// Build a human-readable activity description matching Facebook Activity History format
function buildActivityDescription(eventType: string): string {
  const descriptionMap: Record<string, string> = {
    'update_campaign_budget': 'Campaign budget updated',
    'update_adset_budget': 'Ad set budget updated',
    'update_campaign_run_status': 'Campaign status updated',
    'update_adset_run_status': 'Ad set status updated',
    'update_ad_run_status': 'Ad status updated',
    'create_campaign': 'Campaign created',
    'create_adset': 'Ad set created',
    'create_ad': 'Ad created',
    'update_ad_creative': 'Ad creative updated',
    'update_adset_targeting': 'Ad set targeting updated',
    'update_adset_bid_info': 'Bid info updated',
    'update_campaign_bid_strategy': 'Bid strategy updated',
    'ad_account_update_spend_limit': 'Account spend limit updated',
    'update_adset_schedule': 'Ad set schedule updated',
    'update_campaign_schedule': 'Campaign schedule updated',
    'funding_event_initiate': 'Funding event initiated',
    'update_ad_labels': 'Ad labels updated',
    'update_adset_optimization_goal': 'Optimization goal updated',
  };
  return descriptionMap[eventType] || eventType.replace(/_/g, ' ');
}

// Map Meta status codes/strings to human-readable labels
function formatStatusValue(value: string): string {
  const statusMap: Record<string, string> = {
    'ACTIVE': 'Active',
    'PAUSED': 'Paused',
    'DELETED': 'Deleted',
    'ARCHIVED': 'Archived',
    'PENDING_REVIEW': 'Pending Review',
    'DISAPPROVED': 'Disapproved',
    'PREAPPROVED': 'Preapproved',
    'PENDING_BILLING_INFO': 'Pending Billing Info',
    'CAMPAIGN_PAUSED': 'Campaign Paused',
    'ADSET_PAUSED': 'Ad Set Paused',
    'IN_PROCESS': 'Pending Process',
    'WITH_ISSUES': 'With Issues',
    // Numeric status codes from Meta API
    '1': 'Active',
    '2': 'Paused',
    '3': 'Deleted',
    '4': 'Archived',
  };
  return statusMap[value] || value;
}

// Build the activity details string (old -> new) matching Facebook Activity History
function buildActivityDetails(
  eventType: string,
  extraData: unknown,
): { details: string; oldValue?: string; newValue?: string } {
  let oldValue: string | undefined;
  let newValue: string | undefined;
  let details = '';

  try {
    if (extraData) {
      const extra = typeof extraData === 'string' ? JSON.parse(extraData) : extraData;
      if (extra.old_value !== undefined) oldValue = String(extra.old_value);
      if (extra.new_value !== undefined) newValue = String(extra.new_value);

      if (eventType.includes('run_status') && oldValue && newValue) {
        // Status changes: "From Pending Process to Active"
        const oldLabel = formatStatusValue(oldValue);
        const newLabel = formatStatusValue(newValue);
        details = `From ${oldLabel} to ${newLabel}`;
        oldValue = oldLabel;
        newValue = newLabel;
      } else if (eventType.includes('budget') && oldValue && newValue) {
        // Budget changes: "From $100.00 — to $200.00 Per day"
        const oldNum = parseFloat(oldValue) / 100;
        const newNum = parseFloat(newValue) / 100;
        if (!isNaN(oldNum) && !isNaN(newNum)) {
          oldValue = `$${oldNum.toFixed(2)}`;
          newValue = `$${newNum.toFixed(2)}`;
          details = `From $${oldNum.toFixed(2)} — to $${newNum.toFixed(2)} Per day`;
        } else {
          details = `From ${oldValue} to ${newValue}`;
        }
      } else if (eventType.includes('bid') && oldValue && newValue) {
        // Bid changes
        const oldNum = parseFloat(oldValue) / 100;
        const newNum = parseFloat(newValue) / 100;
        if (!isNaN(oldNum) && !isNaN(newNum)) {
          oldValue = `$${oldNum.toFixed(2)}`;
          newValue = `$${newNum.toFixed(2)}`;
          details = `From $${oldNum.toFixed(2)} — to $${newNum.toFixed(2)}`;
        } else {
          details = `From ${oldValue} to ${newValue}`;
        }
      } else if (eventType.includes('spend_limit') && oldValue && newValue) {
        // Spend limit changes
        const oldNum = parseFloat(oldValue) / 100;
        const newNum = parseFloat(newValue) / 100;
        if (!isNaN(oldNum) && !isNaN(newNum)) {
          oldValue = `$${oldNum.toFixed(2)}`;
          newValue = `$${newNum.toFixed(2)}`;
          details = `From $${oldNum.toFixed(2)} — to $${newNum.toFixed(2)}`;
        } else {
          details = `From ${oldValue} to ${newValue}`;
        }
      } else if (oldValue && newValue) {
        details = `From ${oldValue} to ${newValue}`;
      } else if (newValue) {
        details = `Set to ${newValue}`;
      }
    }
  } catch {
    // ignore parse errors
  }

  if (!details) {
    details = eventType.replace(/_/g, ' ');
  }

  return { details, oldValue, newValue };
}

interface ActivityEntry {
  event_type: string;
  event_time: string;
  object_id: string;
  object_name: string;
  extra_data: string;
  actor_name: string;
}

interface MappedAction {
  id: string;
  entityId: string;
  type: string;
  description: string;
  details: string;
  timestamp: string;
  performedBy: 'user' | 'ai' | 'rule';
  performedByName: string;
  objectName?: string;
  oldValue?: string;
  newValue?: string;
}

/**
 * Fetch activities from one ad account and return the raw mapped actions map.
 * Does NOT filter by entity IDs — returns all activities grouped by object_id.
 *
 * @param sinceDays - How many days back to fetch (default 90)
 * @param fetchLimit - Max number of activity entries to request from Meta (default 500)
 */
async function fetchAccountActivities(
  accessToken: string,
  accountId: string,
  sinceDays: number = 90,
  fetchLimit: number = 500,
): Promise<Record<string, MappedAction[]>> {
  const since = Math.floor((Date.now() - sinceDays * 24 * 60 * 60 * 1000) / 1000);
  const data = await fetchFromMeta<{
    data: ActivityEntry[];
  }>(accessToken, `/${accountId}/activities`, {
    fields: 'event_type,event_time,object_id,object_name,extra_data,actor_name',
    since: since.toString(),
    limit: String(fetchLimit),
  });

  const activities = data.data || [];
  const actionsMap: Record<string, MappedAction[]> = {};

  for (const activity of activities) {
    let actionType = mapEventType(activity.event_type);
    if (!actionType) continue;

    // Refine status and budget actions
    if (activity.event_type.includes('run_status')) {
      actionType = refineStatusAction(activity.event_type, activity.extra_data);
    } else if (activity.event_type.includes('budget')) {
      actionType = refineBudgetAction(activity.extra_data);
    }

    // Build human-readable description matching Facebook Activity History
    const description = buildActivityDescription(activity.event_type);
    const { details, oldValue, newValue } = buildActivityDetails(
      activity.event_type,
      activity.extra_data,
    );

    // Determine performedBy type
    const actorName = activity.actor_name || 'Unknown';
    let performedBy: 'user' | 'ai' | 'rule' = 'user';
    if (actorName.toLowerCase().includes('rule') || actorName.toLowerCase().includes('automated')) {
      performedBy = 'rule';
    } else if (actorName.toLowerCase().includes('system') || actorName.toLowerCase().includes('facebook')) {
      performedBy = 'ai';
    }

    const entityId = activity.object_id;
    if (!actionsMap[entityId]) actionsMap[entityId] = [];

    actionsMap[entityId].push({
      id: `activity-${activity.event_time}-${entityId}-${actionsMap[entityId].length}`,
      entityId,
      type: actionType,
      description,
      details,
      timestamp: activity.event_time,
      performedBy,
      performedByName: actorName,
      objectName: activity.object_name || undefined,
      oldValue,
      newValue,
    });
  }

  return actionsMap;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let storeId = searchParams.get('storeId');
  // Accept accountIds (comma-separated, auto-injected by apiClient) OR legacy accountId
  const accountIdsParam = searchParams.get('accountIds') || searchParams.get('accountId');

  // Optional: control time range (in days) and fetch limit for faster initial loads
  // Default: 90 days, 500 entries — use since=7&limit=50 for fast initial load
  const sinceDays = Math.min(Math.max(parseInt(searchParams.get('since') || '90', 10) || 90, 1), 365);
  const fetchLimit = Math.min(Math.max(parseInt(searchParams.get('limit') || '500', 10) || 500, 1), 1000);

  // Auto-detect storeId if not provided — find first store with a Meta connection
  if (!storeId) {
    const useSupabase = isSupabasePersistenceEnabled();
    const allStores = useSupabase ? await listPersistentStores() : getAllStores();
    const storeWithMeta = allStores.find((s) => s.metaConnected);
    if (storeWithMeta) {
      storeId = storeWithMeta.id;
    } else {
      return NextResponse.json({ error: 'No store with Meta connection found' }, { status: 400 });
    }
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  // Determine which ad accounts to fetch from:
  // 1. If accountIds/accountId provided, use those
  // 2. Otherwise, auto-detect all active Meta ad accounts for this store
  let accountIds: string[] = [];
  if (accountIdsParam) {
    accountIds = accountIdsParam.split(',').filter(Boolean);
  }
  if (accountIds.length === 0) {
    const mapped = isSupabasePersistenceEnabled()
      ? await listPersistentStoreAdAccounts(storeId)
      : getStoreAdAccounts(storeId);
    accountIds = mapped
      .filter((a) => a.platform === 'meta' && a.is_active === 1)
      .map((a) => a.ad_account_id);
  }

  if (accountIds.length === 0) {
    return NextResponse.json({ data: {} });
  }

  try {
    // Fetch activities from ALL active ad accounts in parallel
    const results = await Promise.allSettled(
      accountIds.map((acctId) => fetchAccountActivities(token.accessToken, acctId, sinceDays, fetchLimit)),
    );

    // Merge all results into a single map
    const mergedMap: Record<string, MappedAction[]> = {};
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const [entityId, actions] of Object.entries(result.value)) {
        if (!mergedMap[entityId]) {
          mergedMap[entityId] = [];
        }
        mergedMap[entityId].push(...actions);
      }
    }

    // Sort each entity's actions by timestamp (newest first) and limit to 7
    for (const id of Object.keys(mergedMap)) {
      mergedMap[id].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      mergedMap[id] = mergedMap[id].slice(0, 7);
    }

    return NextResponse.json({ data: mergedMap });
  } catch {
    // Return empty map if activity API fails
    return NextResponse.json({ data: {} });
  }
}
