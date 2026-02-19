import { NextRequest, NextResponse } from 'next/server';
import { setMetaAccount } from '@/app/api/lib/tokens';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, accountId, accountName } = body as {
      storeId: string;
      accountId: string;
      accountName: string;
    };

    if (!storeId || !accountId || !accountName) {
      return NextResponse.json(
        { error: 'storeId, accountId, and accountName are required' },
        { status: 400 }
      );
    }

    await setMetaAccount(storeId, accountId, accountName);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save account selection' },
      { status: 500 }
    );
  }
}
