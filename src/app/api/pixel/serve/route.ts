import { NextRequest, NextResponse } from 'next/server';
import { generatePixelSnippet } from '@/lib/pixel/generate-snippet';

// Shopify calls this URL to load the pixel JS via Script Tag
// Returns raw JavaScript (not JSON)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return new NextResponse('// OneScale pixel: missing storeId', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';

  // Generate the raw JS (strip the <script> tags — Shopify just needs the JS)
  const fullSnippet = generatePixelSnippet(storeId, baseUrl);
  const jsOnly = fullSnippet
    .replace(/<!-- .*? -->/g, '')
    .replace(/<\/?script>/g, '')
    .trim();

  return new NextResponse(jsOnly, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
