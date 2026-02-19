import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import { getStoreAdAccounts } from '@/app/api/lib/db';

/**
 * Proxy Meta video source URLs through our server.
 * Meta's CDN blocks direct <video> access from browsers (CORS).
 *
 * The Graph API /{videoId}?fields=source often fails with permission errors
 * for ad videos. Instead, we search through the store's mapped ad accounts
 * via /{adAccountId}/advideos to find the video source URL.
 *
 * GET /api/meta/video-proxy?storeId=xxx&videoId=123456
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const videoId = searchParams.get('videoId');

  if (!storeId || !videoId) {
    return NextResponse.json(
      { error: 'storeId and videoId are required' },
      { status: 400 }
    );
  }

  const token = getMetaToken(storeId);
  if (!token) {
    return NextResponse.json(
      { error: 'Not authenticated with Meta' },
      { status: 401 }
    );
  }

  try {
    let sourceUrl: string | null = null;

    // Strategy 1: Try direct video fetch (works for Page videos)
    try {
      const videoData = await fetchFromMeta<{
        source?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      }>(token.accessToken, `/${videoId}`, {
        fields: 'source',
      });
      if (videoData.source) {
        sourceUrl = videoData.source;
      }
    } catch {
      // Direct fetch failed (permission error) — try ad account route
    }

    // Strategy 2: Search through mapped ad accounts' advideos
    if (!sourceUrl) {
      const adAccounts = getStoreAdAccounts(storeId);
      for (const account of adAccounts) {
        if (!account.is_active) continue;
        try {
          // Fetch advideos from this ad account and look for our video
          const videosData = await fetchFromMeta<{
            data: { id: string; source?: string }[];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            paging?: any;
          }>(token.accessToken, `/${account.ad_account_id}/advideos`, {
            fields: 'id,source',
            limit: '200',
          });

          const match = videosData.data?.find((v) => v.id === videoId);
          if (match?.source) {
            sourceUrl = match.source;
            break;
          }

          // If not found in first page, check next pages (up to 2 more)
          let nextUrl = videosData.paging?.next;
          let pageCount = 0;
          while (!sourceUrl && nextUrl && pageCount < 2) {
            pageCount++;
            const nextRes = await fetch(nextUrl);
            if (!nextRes.ok) break;
            const nextData = await nextRes.json() as {
              data: { id: string; source?: string }[];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              paging?: any;
            };
            const nextMatch = nextData.data?.find((v: { id: string }) => v.id === videoId);
            if (nextMatch?.source) {
              sourceUrl = nextMatch.source;
              break;
            }
            nextUrl = nextData.paging?.next;
          }

          if (sourceUrl) break;
        } catch {
          // This ad account didn't work, try next one
          continue;
        }
      }
    }

    if (!sourceUrl) {
      return NextResponse.json(
        { error: 'Video source not available. The video may be from an unlinked ad account.' },
        { status: 404 }
      );
    }

    // Stream the video from Meta's CDN through our server
    const videoResponse = await fetch(sourceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!videoResponse.ok) {
      return NextResponse.json(
        { error: `Failed to fetch video: ${videoResponse.status}` },
        { status: 502 }
      );
    }

    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    const contentLength = videoResponse.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    };
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    // Stream the video body through
    return new NextResponse(videoResponse.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to proxy video';
    console.error('[video-proxy] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
