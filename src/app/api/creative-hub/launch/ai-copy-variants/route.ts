import { NextRequest, NextResponse } from 'next/server';

type CopyVariantsRequest = {
  productName?: string;
  sourceAdName?: string;
  sourceAdSetName?: string;
  primaryTexts?: unknown;
  headlines?: unknown;
  descriptions?: unknown;
  avoidPrimaryTexts?: unknown;
  avoidHeadlines?: unknown;
  avoidDescriptions?: unknown;
  variationSeed?: unknown;
};

type CopyVariantsResponse = {
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  model: string;
};

const ANTHROPIC_API_KEY_ALIASES = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'ANTHROPIC_CLOUD_API_KEY',
];

const ANTHROPIC_MODEL_ALIASES = [
  'ANTHROPIC_CREATIVE_MODEL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_INSIGHTS_MODEL',
];

function firstEnvValue(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function normalizeTexts(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = typeof item === 'string' ? item.trim() : '';
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeGeneratedTexts(value: unknown, maxCount = 3): string[] {
  return normalizeTexts(value, maxCount);
}

function removeExactInputDuplicates(generated: string[], inputs: string[]): string[] {
  const inputKeys = new Set(inputs.map((item) => item.trim().toLowerCase()).filter(Boolean));
  return generated.filter((item) => !inputKeys.has(item.trim().toLowerCase()));
}

function extractTextContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (!block || typeof block !== 'object') return '';
      const record = block as Record<string, unknown>;
      return record.type === 'text' && typeof record.text === 'string' ? record.text : '';
    })
    .join('\n')
    .trim();
}

function parseClaudeJson(text: string): CopyVariantsResponse {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Claude did not return JSON.');

  const parsed = JSON.parse(match[0]) as Partial<CopyVariantsResponse>;
  return {
    primaryTexts: normalizeGeneratedTexts(parsed.primaryTexts),
    headlines: normalizeGeneratedTexts(parsed.headlines),
    descriptions: normalizeGeneratedTexts(parsed.descriptions),
    model: typeof parsed.model === 'string' ? parsed.model : '',
  };
}

function numberedList(label: string, values: string[]): string {
  if (values.length === 0) return `${label}:\nNone provided`;
  return `${label}:\n${values.map((value, index) => `${index + 1}. ${value}`).join('\n')}`;
}

function buildPrompt(input: {
  productName: string;
  sourceAdName?: string;
  sourceAdSetName?: string;
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  avoidPrimaryTexts: string[];
  avoidHeadlines: string[];
  avoidDescriptions: string[];
  variationSeed: string;
}): string {
  return [
    'You are an expert direct-response Meta ads copywriter.',
    '',
    'Generate new copy that feels similar in angle, tone, offer, structure, and intent to the fetched Meta copy, but is not a direct copy or rewrite.',
    'Keep it suitable for Meta ads.',
    'The fetched Meta copy is the source of truth. Use the product label only as light context if it conflicts with the fetched copy.',
    '',
    'Rules:',
    '- Generate up to 3 primaryTexts, up to 3 headlines, and up to 3 descriptions.',
    '- Keep the same product/service, offer, CTA style, and audience intent.',
    '- Do not invent unsupported claims.',
    '- Do not mention discounts unless the input copy mentions discounts.',
    '- Keep the language simple, high-converting, and native to Meta ads.',
    '- Primary texts can be slightly longer and emotional.',
    '- Headlines should be short and click-friendly.',
    '- Descriptions should be short supporting lines.',
    '- Do not repeat any input sentence exactly.',
    '- Do not repeat or lightly paraphrase any previous AI suggestions listed below.',
    '- Preserve emojis only if they fit the style of the input.',
    '- Return only valid JSON with keys primaryTexts, headlines, descriptions.',
    '',
    `Product context: ${input.productName}`,
    `Source ad: ${input.sourceAdName || 'Latest fetched ad'}`,
    `Source ad set: ${input.sourceAdSetName || 'Latest fetched ad set'}`,
    `Variation seed: ${input.variationSeed}`,
    '',
    numberedList('Primary texts', input.primaryTexts),
    '',
    numberedList('Headlines', input.headlines),
    '',
    numberedList('Descriptions', input.descriptions),
    '',
    numberedList('Previous AI primary texts to avoid', input.avoidPrimaryTexts),
    '',
    numberedList('Previous AI headlines to avoid', input.avoidHeadlines),
    '',
    numberedList('Previous AI descriptions to avoid', input.avoidDescriptions),
    '',
    'Return JSON only in this shape:',
    '{"primaryTexts":["...","...","..."],"headlines":["...","...","..."],"descriptions":["...","...","..."]}',
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CopyVariantsRequest;
    const productName = typeof body.productName === 'string' && body.productName.trim()
      ? body.productName.trim()
      : 'Selected product';
    const primaryTexts = normalizeTexts(body.primaryTexts);
    const headlines = normalizeTexts(body.headlines);
    const descriptions = normalizeTexts(body.descriptions);
    const avoidPrimaryTexts = normalizeTexts(body.avoidPrimaryTexts, 12);
    const avoidHeadlines = normalizeTexts(body.avoidHeadlines, 12);
    const avoidDescriptions = normalizeTexts(body.avoidDescriptions, 12);
    const variationSeed = typeof body.variationSeed === 'string' && body.variationSeed.trim()
      ? body.variationSeed.trim()
      : `${Date.now()}`;

    if (primaryTexts.length === 0 && headlines.length === 0 && descriptions.length === 0) {
      return NextResponse.json(
        { error: 'No fetched copy was provided for Claude to learn from.' },
        { status: 400 },
      );
    }

    const apiKey = firstEnvValue(ANTHROPIC_API_KEY_ALIASES);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured. AI Copy Lab cannot generate copy.' },
        { status: 500 },
      );
    }

    const model = firstEnvValue(ANTHROPIC_MODEL_ALIASES) || 'claude-sonnet-4-20250514';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1400,
          temperature: 0.95,
          messages: [
            {
              role: 'user',
              content: buildPrompt({
                productName,
                sourceAdName: body.sourceAdName,
                sourceAdSetName: body.sourceAdSetName,
                primaryTexts,
                headlines,
                descriptions,
                avoidPrimaryTexts,
                avoidHeadlines,
                avoidDescriptions,
                variationSeed,
              }),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Claude API failed (${response.status}): ${errorBody.slice(0, 600)}`);
      }

      const data = await response.json() as { content?: unknown };
      const textContent = extractTextContent(data.content);
      if (!textContent) throw new Error('Claude returned no text content.');

      const parsed = parseClaudeJson(textContent);
      const generated = {
        primaryTexts: removeExactInputDuplicates(parsed.primaryTexts, [...primaryTexts, ...avoidPrimaryTexts]),
        headlines: removeExactInputDuplicates(parsed.headlines, [...headlines, ...avoidHeadlines]),
        descriptions: removeExactInputDuplicates(parsed.descriptions, [...descriptions, ...avoidDescriptions]),
      };
      if (generated.primaryTexts.length + generated.headlines.length + generated.descriptions.length === 0) {
        throw new Error('Claude did not return any usable AI copy variants.');
      }

      return NextResponse.json({
        ...generated,
        model,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate AI copy variants.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
