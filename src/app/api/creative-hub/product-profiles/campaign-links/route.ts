import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { upsertProductCampaignLink } from '@/app/api/lib/creative-hub-db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productProfileId, campaignId, campaignName, adAccountId } = body;

    if (!productProfileId || !campaignId || !adAccountId) {
      return NextResponse.json(
        { error: 'Missing required fields: productProfileId, campaignId, adAccountId' },
        { status: 400 },
      );
    }

    const linkId = randomUUID();
    await upsertProductCampaignLink({
      id: linkId,
      productProfileId,
      campaignId,
      campaignName: campaignName || '',
      campaignType: 'testing',
      adAccountId,
      isActive: true,
    });

    return NextResponse.json({
      success: true,
      link: {
        id: linkId,
        productProfileId,
        campaignId,
        campaignName,
        campaignType: 'testing',
        adAccountId,
        isActive: true,
        linkedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to link campaign';
    console.error('[campaign-links] Error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
