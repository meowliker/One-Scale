import { NextRequest, NextResponse } from 'next/server';
import { clearToken } from '@/app/api/lib/tokens';
import type { OAuthPlatform } from '@/types/auth';

const VALID_PLATFORMS: OAuthPlatform[] = ['meta', 'shopify', 'google_drive'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, storeId } = body as {
      platform: OAuthPlatform;
      storeId: string;
    };

    if (!platform || !storeId) {
      return NextResponse.json(
        { error: 'platform and storeId are required' },
        { status: 400 }
      );
    }

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json(
        { error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` },
        { status: 400 }
      );
    }

    await clearToken(platform, storeId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
