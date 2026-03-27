import { NextRequest, NextResponse } from 'next/server';
import { clearToken } from '@/app/api/lib/tokens';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId } = body as { storeId: string };

    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId is required' },
        { status: 400 }
      );
    }

    await clearToken('google_drive', storeId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to disconnect Google Drive' },
      { status: 500 }
    );
  }
}
