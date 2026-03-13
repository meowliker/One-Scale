import { NextRequest, NextResponse } from 'next/server';
import { rest } from '@/app/api/lib/supabase-persistence';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    const rows = await rest<Array<{
      enabled: boolean;
      script_tag_id: string | null;
      shopify_domain: string | null;
      installed_at: string | null;
    }>>(
      `/pixel_settings?store_id=eq.${encodeURIComponent(storeId)}&select=enabled,script_tag_id,shopify_domain,installed_at&limit=1`
    );

    const row = rows?.[0] ?? null;
    if (!row) {
      return NextResponse.json({
        enabled: false,
        script_tag_id: null,
        shopify_domain: null,
        installed_at: null,
      });
    }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json({
      enabled: false,
      script_tag_id: null,
      shopify_domain: null,
      installed_at: null,
    });
  }
}
