import { NextRequest, NextResponse } from 'next/server';
import { getConnectionStatus } from '@/app/api/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const status = getConnectionStatus(storeId);
  return NextResponse.json(status);
}
