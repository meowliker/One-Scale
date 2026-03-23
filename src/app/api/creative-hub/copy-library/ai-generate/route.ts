import { NextRequest, NextResponse } from 'next/server';

// POST /api/creative-hub/copy-library/ai-generate
// Placeholder: actual Claude API integration will be added in Task 18
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.productProfileId || !body.productName) {
      return NextResponse.json(
        { error: 'productProfileId and productName are required' },
        { status: 400 }
      );
    }

    const { productName, productDescription, offer, existingWinners } = body;

    // Build context string for future AI prompt
    const _context = [
      `Product: ${productName}`,
      productDescription ? `Description: ${productDescription}` : null,
      offer ? `Offer: ${offer}` : null,
      existingWinners?.length
        ? `Existing winners: ${existingWinners.length} copies provided`
        : null,
    ]
      .filter(Boolean)
      .join('. ');

    // Mock response — will be replaced with Claude API call in Task 18
    const primaryTexts = [
      `Discover ${productName} — the game-changer you didn't know you needed. Shop now and feel the difference.`,
      `Tired of settling? ${productName} delivers premium quality at a price that makes sense.${offer ? ` ${offer}` : ''}`,
      `Join thousands who switched to ${productName}. Your new favourite is one click away.`,
    ];

    const headlines = [
      `Try ${productName} Today`,
      `${offer || 'Limited Time Offer'}`,
      `Your New Go-To ${productName}`,
    ];

    return NextResponse.json({ primaryTexts, headlines });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate copy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
