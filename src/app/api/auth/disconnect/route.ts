import { NextRequest, NextResponse } from 'next/server';
import { clearToken } from '@/app/api/lib/tokens';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, storeId } = body as {
      platform: 'meta' | 'shopify';
      storeId: string;
    };

    if (!platform || !storeId) {
      return NextResponse.json(
        { error: 'platform and storeId are required' },
        { status: 400 }
      );
    }

    if (platform !== 'meta' && platform !== 'shopify') {
      return NextResponse.json(
        { error: 'platform must be "meta" or "shopify"' },
        { status: 400 }
      );
    }

    clearToken(platform, storeId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
