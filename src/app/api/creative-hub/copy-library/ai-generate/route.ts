import { NextRequest, NextResponse } from 'next/server';
import { generateCreativeCopy } from '../copy-generation';

/**
 * POST /api/creative-hub/copy-library/ai-generate
 *
 * Uses Claude AI to generate review-first ad copy suggestions with targeting metadata.
 * Falls back to template-based mock responses when ANTHROPIC_API_KEY is not set.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.productProfileId || !body.productName) {
      return NextResponse.json(
        { error: 'productProfileId and productName are required' },
        { status: 400 },
      );
    }

    const generated = await generateCreativeCopy({
      productName: body.productName,
      productDescription: body.productDescription,
      offer: body.offer,
      targetAudience: body.targetAudience,
      selectionContext: body.selectionContext,
      selectedPrimaryTexts: Array.isArray(body.selectedPrimaryTexts) ? body.selectedPrimaryTexts : [],
      selectedHeadlines: Array.isArray(body.selectedHeadlines) ? body.selectedHeadlines : [],
      selectedDescriptions: Array.isArray(body.selectedDescriptions) ? body.selectedDescriptions : [],
      profitabilityFloor: body.profitabilityFloor,
      existingWinners: body.existingWinners,
    });

    return NextResponse.json(generated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate copy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
