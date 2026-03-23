// Allow up to 60s on Vercel Pro plan
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getProductProfile,
  getProductCampaignLinks,
  getCopyLibrary,
  saveCopyToLibrary,
} from '@/app/api/lib/creative-hub-db';

// ── Supabase REST helper (same pattern as auto-discover) ──

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function supabaseRest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
  return res.json();
}

// ── Copy angle classification (reused from metaAudit.ts) ──

type CopyAngle =
  | 'Offer'
  | 'Problem-Solution'
  | 'Social Proof'
  | 'Urgency'
  | 'Benefit'
  | 'Objection Handling'
  | 'Educational';

function classifyAngle(text: string): CopyAngle {
  const normalized = text.toLowerCase();
  if (/\b(save|off|discount|sale|deal|offer|coupon|free shipping)\b/.test(normalized)) return 'Offer';
  if (/\bstruggling|tired of|problem|fix|solution|finally\b/.test(normalized)) return 'Problem-Solution';
  if (/\breview|rated|trusted|customers|testimonial|loved by\b/.test(normalized)) return 'Social Proof';
  if (/\blast chance|hurry|today only|ends tonight|limited\b/.test(normalized)) return 'Urgency';
  if (/\bresults|boost|improve|get better|transform|benefit\b/.test(normalized)) return 'Benefit';
  if (/\btoo expensive|worth it|risk free|guarantee|no hassle\b/.test(normalized)) return 'Objection Handling';
  return 'Educational';
}

// ── Types for snapshot data ──

interface SnapshotAd {
  id: string;
  name?: string;
  campaign_id?: string;
  campaignId?: string;
  creative?: {
    headline?: string;
    title?: string;
    body?: string;
    ctaType?: string;
    destinationUrl?: string;
  };
  metrics?: {
    roas?: number;
    spend?: number;
    ctr?: number;
    cpa?: number;
    revenue?: number;
    conversions?: number;
    impressions?: number;
    clicks?: number;
  };
}

interface AdsSnapshotRow {
  scope_id: string;
  payload_json: string;
}

interface ExtractedAd {
  adId: string;
  campaignId: string;
  headline: string;
  primaryText: string;
  ctaType: string;
  destinationUrl: string;
  roas: number;
  spend: number;
  ctr: number;
  cpa: number;
  revenue: number;
  purchases: number;
  angle: CopyAngle;
}

// ── Core auto-populate logic (exported for reuse) ──

export async function autoPopulateCopyLibrary(
  storeId: string,
  productProfileId: string,
): Promise<{ saved: number; skipped: number; total: number; errors: string[] }> {
  const errors: string[] = [];

  // 1. Read the product profile
  const profile = await getProductProfile(productProfileId);
  if (!profile || profile.storeId !== storeId) {
    throw new Error('Product profile not found or does not belong to this store');
  }

  // 2. Get linked campaigns
  const campaignLinks = await getProductCampaignLinks(productProfileId);
  if (campaignLinks.length === 0) {
    return { saved: 0, skipped: 0, total: 0, errors: ['No campaigns linked to this product profile'] };
  }

  const linkedCampaignIds = new Set(campaignLinks.map((l) => l.campaignId));

  // 3. Fetch ads data from Supabase snapshots
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { saved: 0, skipped: 0, total: 0, errors: ['Supabase not configured'] };
  }

  const adsSnapshots = await supabaseRest<AdsSnapshotRow[]>(
    `/meta_endpoint_snapshots?store_id=eq.${encodeURIComponent(storeId)}&endpoint=eq.ads&variant_key=eq.latest&select=scope_id,payload_json`,
  );

  if (adsSnapshots.length === 0) {
    return { saved: 0, skipped: 0, total: 0, errors: ['No ads snapshot data found in database'] };
  }

  // 4. Extract creative data from ads belonging to linked campaigns
  const extractedAds: ExtractedAd[] = [];

  for (const snap of adsSnapshots) {
    let ads: SnapshotAd[];
    try {
      ads = JSON.parse(snap.payload_json);
    } catch {
      continue; // skip malformed payloads
    }

    for (const ad of ads) {
      const campaignId = ad.campaign_id || ad.campaignId;
      if (!campaignId || !linkedCampaignIds.has(campaignId)) continue;

      const headline = ad.creative?.headline || ad.creative?.title || '';
      const primaryText = ad.creative?.body || '';

      // Skip ads with no copy
      if (!primaryText.trim() && !headline.trim()) continue;

      const metrics = ad.metrics || {};
      const spend = metrics.spend ?? 0;
      const revenue = metrics.revenue ?? 0;
      const roas = metrics.roas ?? (spend > 0 ? revenue / spend : 0);
      const ctr = metrics.ctr ?? 0;
      const cpa = metrics.cpa ?? 0;
      const purchases = metrics.conversions ?? 0;

      extractedAds.push({
        adId: ad.id,
        campaignId,
        headline,
        primaryText,
        ctaType: ad.creative?.ctaType || '',
        destinationUrl: ad.creative?.destinationUrl || '',
        roas,
        spend,
        ctr,
        cpa,
        revenue,
        purchases,
        angle: classifyAngle(`${headline} ${primaryText}`),
      });
    }
  }

  if (extractedAds.length === 0) {
    return { saved: 0, skipped: 0, total: 0, errors: ['No ads with creative data found for linked campaigns'] };
  }

  // 5. Rank by ROAS descending, then spend descending (same logic as metaAudit.ts)
  extractedAds.sort((a, b) => b.roas - a.roas || b.spend - a.spend);

  // 6. Deduplicate by primary text (keep highest-ROAS version)
  const seenTexts = new Set<string>();
  const uniqueAds: ExtractedAd[] = [];
  for (const ad of extractedAds) {
    const key = `${ad.primaryText.trim().toLowerCase()}||${ad.headline.trim().toLowerCase()}`;
    if (seenTexts.has(key)) continue;
    seenTexts.add(key);
    uniqueAds.push(ad);
  }

  // Take top 10
  const topAds = uniqueAds.slice(0, 10);

  // 7. Check existing copy library to avoid duplicates
  const existingCopies = await getCopyLibrary(productProfileId);
  const existingTexts = new Set(
    existingCopies.map((c) => `${c.primaryText.trim().toLowerCase()}||${(c.headline || '').trim().toLowerCase()}`),
  );

  let saved = 0;
  let skipped = 0;

  for (const ad of topAds) {
    const key = `${ad.primaryText.trim().toLowerCase()}||${ad.headline.trim().toLowerCase()}`;
    if (existingTexts.has(key)) {
      skipped++;
      continue;
    }

    try {
      await saveCopyToLibrary({
        id: randomUUID(),
        productProfileId,
        primaryText: ad.primaryText,
        headline: ad.headline || undefined,
        description: ad.angle, // Store the copy angle as description
        cta: ad.ctaType || undefined,
        sourceAdId: ad.adId,
        roas: ad.roas,
        cpa: ad.cpa || undefined,
        ctr: ad.ctr || undefined,
        totalSpend: ad.spend,
        totalRevenue: ad.revenue,
        totalPurchases: ad.purchases,
        isAiGenerated: false,
      });
      saved++;
      existingTexts.add(key); // prevent duplicates within the batch
    } catch (err) {
      errors.push(`Failed to save ad ${ad.adId}: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return { saved, skipped, total: extractedAds.length, errors };
}

// ── Route handler ──

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.storeId || !body.productProfileId) {
      return NextResponse.json(
        { error: 'storeId and productProfileId are required' },
        { status: 400 },
      );
    }

    const result = await autoPopulateCopyLibrary(body.storeId, body.productProfileId);

    return NextResponse.json({
      success: true,
      saved: result.saved,
      skipped: result.skipped,
      totalAdsFound: result.total,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to auto-populate copy library';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
