import { NextRequest, NextResponse } from 'next/server';
import { generatePixelSnippet, generateCheckoutSnippet } from '@/lib/pixel/generate-snippet';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const type = searchParams.get('type') ?? 'main';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const snippet = type === 'checkout'
    ? generateCheckoutSnippet(storeId, baseUrl)
    : generatePixelSnippet(storeId, baseUrl);

  return NextResponse.json({ snippet, type, storeId });
}
