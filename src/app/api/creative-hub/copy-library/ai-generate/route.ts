import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/creative-hub/copy-library/ai-generate
 *
 * Uses Claude AI to generate ad copy variations (primary texts + headlines)
 * based on product context and existing winning copies.
 * Falls back to template-based mock responses when ANTHROPIC_API_KEY is not set.
 */

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

interface GenerateResult {
  primaryTexts: string[];
  headlines: string[];
}

async function callClaudeForCopyGeneration(context: {
  productName: string;
  productDescription?: string;
  offer?: string;
  existingWinners?: Array<{ primaryText: string; headline?: string; roas?: number }>;
  targetAudience?: string;
}): Promise<GenerateResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const winnersContext = context.existingWinners?.length
    ? context.existingWinners
        .map(
          (w, i) =>
            `  ${i + 1}. Primary: "${w.primaryText}"${w.headline ? ` | Headline: "${w.headline}"` : ''}${w.roas != null ? ` | ROAS: ${w.roas.toFixed(2)}x` : ''}`,
        )
        .join('\n')
    : 'No existing winning copies available.';

  const prompt = `You are an expert Meta Ads copywriter specializing in direct-response e-commerce ads.

Product: ${context.productName}
${context.productDescription ? `Description: ${context.productDescription}` : ''}
${context.offer ? `Current Offer: ${context.offer}` : ''}
${context.targetAudience ? `Target Audience: ${context.targetAudience}` : ''}

Existing Winning Copies (use as inspiration, don't copy exactly):
${winnersContext}

Generate 5 unique primary text variations and 5 unique headline variations for Meta ads.

Primary text guidelines:
- Each should be 1-3 sentences, max 125 characters
- Use different angles: social proof, urgency, benefit-led, problem-solution, curiosity
- Include a clear call-to-action
- If there are winning copies, maintain similar tone but explore new angles

Headline guidelines:
- Each should be max 40 characters
- Punchy, attention-grabbing, benefit-focused
- Mix styles: question, statement, offer-led, curiosity-driven

Return strict JSON only:
{
  "primaryTexts": ["...", "...", "...", "...", "..."],
  "headlines": ["...", "...", "...", "...", "..."]
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_CREATIVE_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.8,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textContent = data.content?.find((c) => c.type === 'text')?.text;
  if (!textContent) return null;

  // Extract JSON from response (handle potential markdown wrapping)
  const jsonMatch = textContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]) as GenerateResult;
  if (!Array.isArray(parsed.primaryTexts) || !Array.isArray(parsed.headlines)) return null;

  return {
    primaryTexts: parsed.primaryTexts.filter((t) => typeof t === 'string' && t.trim()).slice(0, 5),
    headlines: parsed.headlines.filter((t) => typeof t === 'string' && t.trim()).slice(0, 5),
  };
}

// ---------------------------------------------------------------------------
// Fallback mock generation
// ---------------------------------------------------------------------------

function mockGeneration(productName: string, offer?: string): GenerateResult {
  return {
    primaryTexts: [
      `Discover ${productName} — the game-changer you didn't know you needed. Shop now and feel the difference.`,
      `Tired of settling? ${productName} delivers premium quality at a price that makes sense.${offer ? ` ${offer}` : ''}`,
      `Join thousands who switched to ${productName}. Your new favourite is one click away.`,
      `Stop scrolling. ${productName} is exactly what you've been looking for. Order today.`,
      `Why do 10,000+ customers love ${productName}? Try it risk-free and find out.`,
    ],
    headlines: [
      `Try ${productName} Today`,
      `${offer || 'Limited Time Offer'}`,
      `Your New Go-To ${productName}`,
      `Finally, ${productName} Done Right`,
      `${productName} — Shop Now`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.productProfileId || !body.productName) {
      return NextResponse.json(
        { error: 'productProfileId and productName are required' },
        { status: 400 }
      );
    }

    const { productName, productDescription, offer, existingWinners, targetAudience } = body;

    // Try Claude AI generation first
    let result: GenerateResult | null = null;
    try {
      result = await callClaudeForCopyGeneration({
        productName,
        productDescription,
        offer,
        existingWinners,
        targetAudience,
      });
    } catch {
      // Claude API call failed — fall back to mock
    }

    // Fall back to mock generation if Claude didn't return results
    const generated = result ?? mockGeneration(productName, offer);

    return NextResponse.json({
      primaryTexts: generated.primaryTexts,
      headlines: generated.headlines,
      source: result ? 'ai' : 'fallback',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate copy';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
