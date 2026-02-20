import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';

/**
 * Fetch Meta Ad preview iframe URL.
 * Uses the /previews endpoint to get a renderable iframe.
 *
 * GET /api/meta/ad-preview?storeId=xxx&adId=123456
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const adId = searchParams.get('adId');
  const requestedAdFormat = searchParams.get('adFormat')?.trim();

  if (!storeId || !adId) {
    return NextResponse.json(
      { error: 'storeId and adId are required' },
      { status: 400 }
    );
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json(
      { error: 'Not authenticated with Meta' },
      { status: 401 }
    );
  }

  try {
    const preferredFormats = [
      'MOBILE_FEED_STANDARD',
      'INSTAGRAM_STANDARD',
      'DESKTOP_FEED_STANDARD',
    ];
    const formatsToTry = requestedAdFormat
      ? [requestedAdFormat, ...preferredFormats.filter((format) => format !== requestedAdFormat)]
      : preferredFormats;
    const errors: string[] = [];

    for (const adFormat of formatsToTry) {
      try {
        const previewData = await fetchFromMeta<{
          data: { body: string }[];
        }>(token.accessToken, `/${adId}/previews`, {
          ad_format: adFormat,
        });

        if (!previewData.data?.[0]?.body) {
          errors.push(`${adFormat}: empty preview body`);
          continue;
        }

        // Extract iframe src from the HTML body
        const body = previewData.data[0].body;
        const srcMatch = body.match(/src="([^"]+)"/);
        const iframeSrc = srcMatch?.[1]?.replace(/&amp;/g, '&');

        return NextResponse.json({
          html: body,
          iframeSrc: iframeSrc || null,
          adFormatUsed: adFormat,
          attemptedFormats: formatsToTry,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown preview error';
        errors.push(`${adFormat}: ${message}`);
      }
    }

    return NextResponse.json(
      {
        error: 'No preview available for supported formats',
        attemptedFormats: formatsToTry,
        details: errors,
      },
      { status: 404 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch ad preview';
    console.error('[ad-preview] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
