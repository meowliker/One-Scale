import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaAdAccounts } from '@/app/api/lib/meta-client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    const accounts = await fetchMetaAdAccounts(token.accessToken);
    return NextResponse.json({ data: accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch accounts';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
