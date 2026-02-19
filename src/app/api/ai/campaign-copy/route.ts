import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

type CopyField = 'primaryText' | 'headline' | 'description' | 'cta';

interface CampaignCopyRequest {
  field: CopyField;
  count?: number;
  objective?: string;
  winnerSummary?: string[];
  topHeadlines?: string[];
  topPrimaryTexts?: string[];
  topCtas?: string[];
  winningAngles?: string[];
}

const CTA_LABELS = [
  'Shop Now',
  'Learn More',
  'Sign Up',
  'Book Now',
  'Contact Us',
  'Download',
  'Get Offer',
];

function clampCount(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(8, Math.round(value)));
}

function dedupe(options: string[], count: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const trimmed = option.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= count) break;
  }
  return out;
}

function parseModelOptions(raw: string, count: number): string[] {
  try {
    const parsed = JSON.parse(raw) as { options?: string[] };
    if (Array.isArray(parsed.options)) {
      return dedupe(parsed.options, count);
    }
  } catch {
    // Ignore parse errors and try line parsing fallback.
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, '').trim())
    .filter(Boolean);
  return dedupe(lines, count);
}

function fallbackTemplates(field: CopyField): string[] {
  if (field === 'headline') {
    return [
      'Feel Better, Starting Today',
      'A Simpler Path to Better Results',
      'Trusted by People Like You',
      'Make Progress Without Overthinking',
      'Start Stronger Today',
    ];
  }

  if (field === 'description') {
    return [
      'Clear value with one simple next step.',
      'Made for faster, higher-quality clicks.',
      'Benefit-first message with clean CTA.',
      'Simple, direct, and conversion-focused.',
      'Built to improve response quality.',
    ];
  }

  if (field === 'cta') {
    return [...CTA_LABELS];
  }

  return [
    'Get clearer results with a direct message, stronger benefit, and one action-focused CTA.',
    'Make the offer easier to understand so more qualified people click with intent.',
    'Lead with the main benefit, back it with proof, and end with a clean next step.',
    'Use concise, high-clarity messaging that improves click quality and conversion intent.',
    'Position the value first, reduce friction, and guide readers to take action quickly.',
  ];
}

function toHeadlineVariant(seed: string): string[] {
  const base = seed.trim();
  if (!base) return [];
  const compact = base.length > 34 ? `${base.slice(0, 34).trim()}...` : base;
  const hasToday = /\btoday\b/i.test(compact);
  return [
    compact,
    hasToday ? `${compact} Now` : `${compact} Today`,
    `Try ${compact}`.slice(0, 40),
    `${compact} - Start Now`.slice(0, 40),
    `Your ${compact}`.slice(0, 40),
    `${compact} for Better Results`.slice(0, 40),
    `${compact} for Busy Schedules`.slice(0, 40),
  ]
    .map((value) => value.replace(/\s+/g, ' ').trim().slice(0, 40))
    .filter(Boolean);
}

function toPrimaryVariant(seed: string): string[] {
  const base = seed.trim();
  if (!base) return [];
  const trimmed = base.slice(0, 125);
  return [
    trimmed,
    `${trimmed} Start now and see the difference.`.slice(0, 125),
    `${trimmed} Get the core benefit with less friction and a clearer next step.`.slice(0, 125),
    `${trimmed} Designed for faster decisions and better-quality clicks.`.slice(0, 125),
    `${trimmed} Keep it simple: clear value, clear action, better response.`.slice(0, 125),
  ];
}

function toDescriptionVariant(seed: string): string[] {
  const base = seed.trim();
  const trimmed = base ? base.slice(0, 48) : 'Simple high-clarity message';
  return [
    `${trimmed}`.slice(0, 60),
    'Clear value and direct next step'.slice(0, 60),
    'Benefit-first structure with clean CTA'.slice(0, 60),
    'Short and easy to act on'.slice(0, 60),
    'Improved readability for better response'.slice(0, 60),
  ];
}

function shuffle<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function cleanOptionText(value: string): string {
  return value
    .replace(/\b(?:same winner angle|winner(?:-inspired)?|top performer|new angle|built from)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[|:,\-.\s]+|[|:,\-.\s]+$/g, '')
    .trim();
}

function buildFallbackOptions(input: CampaignCopyRequest, count: number): string[] {
  const templates = shuffle(fallbackTemplates(input.field));
  const topHeadlines = (input.topHeadlines || []).filter(Boolean);
  const topPrimaryTexts = (input.topPrimaryTexts || []).filter(Boolean);
  const topCtas = (input.topCtas || []).filter(Boolean);

  let merged: string[] = [];
  if (input.field === 'headline') {
    merged = [
      ...topHeadlines.flatMap((seed) => toHeadlineVariant(seed)),
      ...templates,
    ];
  } else if (input.field === 'primaryText') {
    merged = [
      ...topPrimaryTexts.flatMap((seed) => toPrimaryVariant(seed)),
      ...templates,
    ];
  } else if (input.field === 'description') {
    const source = topPrimaryTexts.length > 0 ? topPrimaryTexts : topHeadlines;
    merged = [
      ...source.flatMap((seed) => toDescriptionVariant(seed)),
      ...templates,
    ];
  } else {
    merged = shuffle([...topCtas, ...CTA_LABELS]);
  }

  const options = dedupe(shuffle(merged.map((value) => cleanOptionText(value))), count);
  if (options.length >= count) return options;

  const pad = templates
    .map((value) => cleanOptionText(value))
    .filter((x) => x && !options.includes(x))
    .slice(0, count - options.length);
  return [...options, ...pad].slice(0, count);
}

function fieldRules(field: CopyField): string {
  if (field === 'headline') return 'Each option must be <= 40 characters.';
  if (field === 'primaryText') return 'Each option must be <= 125 characters.';
  if (field === 'description') return 'Each option should be <= 60 characters.';
  return `Each option must be one of: ${CTA_LABELS.join(', ')}.`;
}

function buildPrompt(input: CampaignCopyRequest, count: number): string {
  const summary = [
    `Objective: ${input.objective || 'Conversions'}`,
    `Winner summary: ${(input.winnerSummary || []).join(' | ') || 'n/a'}`,
    `Top headlines: ${(input.topHeadlines || []).join(' | ') || 'n/a'}`,
    `Top primary texts: ${(input.topPrimaryTexts || []).join(' | ') || 'n/a'}`,
    `Top CTAs: ${(input.topCtas || []).join(' | ') || 'n/a'}`,
    `Winning angles: ${(input.winningAngles || []).join(' | ') || 'n/a'}`,
  ].join('\n');

  return [
    'You are an expert Meta performance copywriter.',
    `Generate ${count} distinct ${input.field} options for a new campaign using only the provided 30-day performance context.`,
    'Use top winners as inspiration and preserve semantic relevance to winner examples.',
    'Avoid near-duplicates and avoid repeating exact top examples.',
    fieldRules(input.field),
    'Return strict JSON only with this schema: {"options":["...","..."]}.',
    '',
    summary,
  ].join('\n');
}

async function generateWithOpenAI(input: CampaignCopyRequest, count: number): Promise<string[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_CAMPAIGN_COPY_MODEL || 'gpt-4.1-mini';
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You return compact JSON and never include markdown.',
        },
        {
          role: 'user',
          content: buildPrompt(input, count),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI generation failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = parseModelOptions(content, count);
  return parsed.length > 0 ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const input = await request.json() as CampaignCopyRequest;
    if (!input?.field || !['primaryText', 'headline', 'description', 'cta'].includes(input.field)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
    }

    const count = clampCount(input.count);
    const fallback = buildFallbackOptions(input, count);

    try {
      const generated = await generateWithOpenAI(input, count);
      if (generated && generated.length > 0) {
        return NextResponse.json({
          options: dedupe(generated.map((value) => cleanOptionText(value)), count),
          provider: 'openai',
        });
      }
    } catch {
      // Safe fallback below.
    }

    return NextResponse.json({ options: fallback, provider: 'fallback' });
  } catch {
    return NextResponse.json({ error: 'Failed to generate campaign copy options' }, { status: 500 });
  }
}
