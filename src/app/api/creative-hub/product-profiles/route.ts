import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getProductProfiles,
  getProductCampaignLinks,
  upsertProductProfile,
} from '@/app/api/lib/creative-hub-db';

// GET /api/creative-hub/product-profiles?storeId=X
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    const profiles = getProductProfiles(storeId);

    // Attach campaign links to each profile
    const profilesWithLinks = profiles.map((profile) => ({
      ...profile,
      campaignLinks: getProductCampaignLinks(profile.id),
    }));

    return NextResponse.json({ profiles: profilesWithLinks });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch product profiles';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/creative-hub/product-profiles
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.storeId || !body.productName || !body.adAccountId) {
      return NextResponse.json(
        { error: 'storeId, productName, and adAccountId are required' },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const profile = { ...body, id };

    upsertProductProfile(profile);

    return NextResponse.json({ profile: { ...profile, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create product profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
