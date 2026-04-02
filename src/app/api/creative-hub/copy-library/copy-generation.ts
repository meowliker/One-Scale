import type {
  CopyRewriteAnalysis,
  CopyRewriteSuggestion,
  CopyRewriteTargeting,
  CreativeCopyGenerationResponse,
} from '@/types/creativeHub';

type CopySource = CreativeCopyGenerationResponse['source'];

export interface CopyGenerationContext {
  productName: string;
  productDescription?: string;
  offer?: string;
  targetAudience?: string;
  selectionContext?: string;
  selectedPrimaryTexts?: string[];
  selectedHeadlines?: string[];
  selectedDescriptions?: string[];
  profitabilityFloor?: number;
  existingWinners?: Array<{
    primaryText: string;
    headline?: string;
    description?: string;
    roas?: number;
    cpa?: number;
    ctr?: number;
  }>;
}

interface ParsedCopySuggestion {
  id?: string;
  title?: string;
  summary?: string;
  confidence?: number;
  intent?: CopyRewriteSuggestion['intent'];
  targeting?: Partial<CopyRewriteTargeting>;
  primaryTexts?: unknown;
  headlines?: unknown;
  descriptions?: unknown;
  bestFor?: unknown;
  watchouts?: unknown;
  winningSignals?: unknown;
}

interface ParsedCopyResponse {
  analysis?: Partial<CopyRewriteAnalysis> & {
    winningAudience?: Partial<CopyRewriteTargeting>;
  };
  suggestions?: ParsedCopySuggestion[];
  primaryTexts?: unknown;
  headlines?: unknown;
  descriptions?: unknown;
}

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

const COPY_OPTION_LIMIT = 8;
const WINNING_SIGNAL_LIMIT = 6;

function firstEnvValue(keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function mergeUnique(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }

  return result;
}

function normalizeTextArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return mergeUnique(
    value.map((item) => (typeof item === 'string' ? item : '')).filter(Boolean),
    limit,
  );
}

function clampConfidence(value: unknown, fallback = 78): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  if (numeric <= 1) return Math.round(numeric * 100);
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeTargeting(
  value: Partial<CopyRewriteTargeting> | undefined,
  fallback: CopyRewriteTargeting,
): CopyRewriteTargeting {
  return {
    persona: value?.persona?.trim() || fallback.persona,
    ageGroup: value?.ageGroup?.trim() || fallback.ageGroup,
    gender: value?.gender?.trim() || fallback.gender,
    awarenessStage: value?.awarenessStage?.trim() || fallback.awarenessStage,
    angle: value?.angle?.trim() || fallback.angle,
    rationale: value?.rationale?.trim() || fallback.rationale,
  };
}

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function isMeaningfulAudienceHint(value?: string): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^mixed\b/i.test(normalized)) return false;
  if (/^(not set|unknown|n\/a)$/i.test(normalized)) return false;
  if (
    /^[A-Z][a-z]+(?:\s[A-Z][a-z]+){0,2}$/.test(normalized) &&
    !/(parent|parents|teacher|teachers|family|families|kids|children|buyers|women|men|moms|dads|students|caregiver)/i.test(normalized)
  ) {
    return false;
  }
  return true;
}

function getTopWinner(context: CopyGenerationContext) {
  return [...(context.existingWinners || [])].sort(
    (left, right) => (right.roas || 0) - (left.roas || 0),
  )[0];
}

function normalizeAngleLabel(angle: string): string {
  return angle
    .replace(/^(benchmark-preserving|persona-led|new challenger)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferAudienceFromContext(context: CopyGenerationContext): CopyRewriteTargeting {
  const audienceHint = isMeaningfulAudienceHint(context.targetAudience)
    ? context.targetAudience?.trim()
    : '';
  const combined = [
    context.productName,
    context.productDescription,
    context.offer,
    audienceHint,
    context.selectionContext,
    ...(context.existingWinners || []).flatMap((winner) => [
      winner.primaryText,
      winner.headline,
      winner.description,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const parentOrFamily =
    hasKeyword(combined, ['parent', 'parents', 'mom', 'moms', 'mother', 'dad', 'fami', 'caregiver']);
  const childProduct = hasKeyword(combined, ['kid', 'kids', 'child', 'children', 'homeschool', 'teacher']);
  const learningProduct = hasKeyword(combined, ['lesson', 'skills', 'printable', 'workbook', 'activities']);
  const urgency = hasKeyword(combined, ['free today', 'today only', 'limited', 'now', 'download']);
  const proof = hasKeyword(combined, ['winner', 'winning', 'best', 'roas', 'result', 'proof']);

  let persona = audienceHint || 'Direct-response buyers';
  if (parentOrFamily && childProduct) {
    persona = 'Parents of kids 3-14';
  } else if (hasKeyword(combined, ['teacher', 'homeschool'])) {
    persona = 'Homeschool parents and teachers';
  } else if (hasKeyword(combined, ['student', 'students'])) {
    persona = 'Students and self-learners';
  }

  let ageGroup = '25-44';
  if (hasKeyword(combined, ['teacher', 'homeschool'])) {
    ageGroup = '25-54';
  } else if (hasKeyword(combined, ['student', 'students', 'young adults'])) {
    ageGroup = '18-34';
  } else if (!parentOrFamily && hasKeyword(combined, ['women', 'female', 'moms'])) {
    ageGroup = '24-44';
  }

  let gender = 'All genders';
  if (hasKeyword(combined, ['mom', 'moms', 'mother', 'women', 'female'])) {
    gender = 'Female skew';
  } else if (hasKeyword(combined, ['dad', 'dads', 'men', 'male'])) {
    gender = 'Male skew';
  }

  let awarenessStage = 'Problem-aware';
  if (urgency || hasKeyword(combined, ['shop now', 'download', 'claim', 'get offer'])) {
    awarenessStage = 'Most aware';
  } else if (hasKeyword(combined, ['learn', 'build', 'guide', 'system', 'skills'])) {
    awarenessStage = 'Solution aware';
  } else if (proof) {
    awarenessStage = 'Product aware';
  }

  let angle = 'Outcome-led transformation';
  if (childProduct && learningProduct) {
    angle = 'Build confidence and real-world skills';
  } else if (urgency) {
    angle = 'Urgent offer-led conversion';
  } else if (proof) {
    angle = 'Winner-preserving challenger';
  }

  return {
    persona,
    ageGroup,
    gender,
    awarenessStage,
    angle,
    rationale: parentOrFamily
      ? 'The strongest signals point to family-focused direct response copy.'
      : 'The winner history and selected creative context suggest a direct-response audience that needs a clearer first read.',
  };
}

function buildWinningSignals(context: CopyGenerationContext, audience: CopyRewriteTargeting): string[] {
  const topWinner = getTopWinner(context);
  const selectionLines = (context.selectionContext || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((line) => line.replace(/^\d+\.\s*/, ''));
  const signals = [
    isMeaningfulAudienceHint(context.targetAudience)
      ? `Audience cue: ${context.targetAudience?.trim()}`
      : null,
    audience.persona ? `Persona cue: ${audience.persona}` : null,
    audience.awarenessStage ? `Awareness cue: ${audience.awarenessStage}` : null,
    topWinner?.primaryText ? `Top winner starts with: ${topWinner.primaryText.slice(0, 80)}` : null,
    topWinner?.headline ? `Top winner headline: ${topWinner.headline.slice(0, 80)}` : null,
    selectionLines[0] ? `Selection cue: ${selectionLines[0].slice(0, 80)}` : null,
    selectionLines[1] ? `Selection cue: ${selectionLines[1].slice(0, 80)}` : null,
  ];

  return mergeUnique(
    [
      ...signals,
      ...(context.selectedPrimaryTexts || []).slice(0, 3).map((value) => `Selected primary text: ${value}`),
      ...(context.selectedHeadlines || []).slice(0, 3).map((value) => `Selected headline: ${value}`),
      ...(context.selectedDescriptions || []).slice(0, 3).map((value) => `Selected description: ${value}`),
    ],
    WINNING_SIGNAL_LIMIT,
  );
}

function buildFallbackLineSet(
  context: CopyGenerationContext,
  targeting: CopyRewriteTargeting,
  angle: string,
  intent: CopyRewriteSuggestion['intent'],
): Pick<CopyRewriteSuggestion, 'primaryTexts' | 'headlines' | 'descriptions'> {
  const topWinner = getTopWinner(context);
  const productName = context.productName || 'your product';
  const offer = context.offer || topWinner?.headline || 'the offer';
  const target = targeting.persona.toLowerCase();
  const audience = targeting.persona || (targeting.ageGroup ? `${targeting.ageGroup} buyers` : target);
  const coreAngle = normalizeAngleLabel(angle) || 'real-world skills';
  const outcomePhrase = coreAngle.replace(/^build\s+/i, '').toLowerCase();
  const topWinnerPrimary = topWinner?.primaryText?.trim();
  const topWinnerHeadline = topWinner?.headline?.trim();
  const productShort = productName.replace(/\s*\([^)]*\)\s*/g, '').trim();

  const primaryTexts = mergeUnique(
    [
      intent === 'control_plus_challenger'
        ? topWinnerPrimary ||
          `Parents are already responding to ${productShort}. Keep the control readable and let challengers test one sharper hook at a time.`
        : null,
      `Parents who want more independent kids are using ${productShort} to build ${outcomePhrase} at home without making it feel like homework.`,
      `If ${audience.toLowerCase()} is the right audience, show how ${productShort} helps kids practice ${outcomePhrase} in real life, not just read about it.`,
      `This version keeps the offer clear for ${target} and gives Meta one strong promise to test: real skills, faster buy-in, and a cleaner first read.`,
      `Lead with the strongest outcome, keep ${offer.toLowerCase()} easy to understand, and let the creative do the rest.`,
      context.selectionContext
        ? `The current creative batch looks better suited to a specific parent-facing promise than a broad generic message.`
        : null,
    ],
    COPY_OPTION_LIMIT,
  );

  const headlines = mergeUnique(
    [
      topWinnerHeadline,
      intent === 'control_plus_challenger' ? `Keep the Winner, Test the Challenger` : null,
      `Help Kids Build Real-Life Skills`,
      `A Simpler Way to Build Confidence`,
      `${productShort} for Busy Parents`,
      `Teach Life Skills That Actually Stick`,
    ],
    COPY_OPTION_LIMIT,
  );

  const descriptions = mergeUnique(
    [
      topWinner?.description?.trim() || null,
      `Best when the first job is to test one clear promise and keep the benchmark easy to read.`,
      `Use this when ${targeting.awarenessStage.toLowerCase()} buyers need a clearer reason to click.`,
      `Pair with a tighter structure so Meta can isolate whether the offer or the hook is doing the work.`,
      `A strong fit when you want sharper parent-facing copy without losing the original winning intent.`,
      `Keep the first read practical, specific, and easy to match to the creative.`,
    ],
    COPY_OPTION_LIMIT,
  );

  return { primaryTexts, headlines, descriptions };
}

function buildSuggestion(
  context: CopyGenerationContext,
  analysis: CopyRewriteAnalysis,
  intent: CopyRewriteSuggestion['intent'],
  overrides: Partial<CopyRewriteSuggestion> = {},
): CopyRewriteSuggestion {
  const fallbackTargeting = analysis.winningAudience;
  const targeting = normalizeTargeting(overrides.targeting, fallbackTargeting);
  const angle = targeting.angle || fallbackTargeting.angle;
  const lines = buildFallbackLineSet(context, targeting, angle, intent);

  return {
    id: overrides.id || intent,
    title: overrides.title || 'Rewrite option',
    summary:
      overrides.summary ||
      'Review-first suggestion built from the strongest available signals.',
    confidence: clampConfidence(overrides.confidence, 78),
    intent,
    targeting,
    primaryTexts: mergeUnique([...(overrides.primaryTexts || []), ...lines.primaryTexts], COPY_OPTION_LIMIT),
    headlines: mergeUnique([...(overrides.headlines || []), ...lines.headlines], COPY_OPTION_LIMIT),
    descriptions: mergeUnique([...(overrides.descriptions || []), ...lines.descriptions], COPY_OPTION_LIMIT),
    bestFor: mergeUnique(overrides.bestFor || [], 4),
    watchouts: mergeUnique(overrides.watchouts || [], 4),
    winningSignals: mergeUnique(overrides.winningSignals || analysis.winningSignals, WINNING_SIGNAL_LIMIT),
  };
}

function buildFallbackResponse(context: CopyGenerationContext): CreativeCopyGenerationResponse {
  const winningAudience = inferAudienceFromContext(context);
  const winningSignals = buildWinningSignals(context, winningAudience);
  const analysis: CopyRewriteAnalysis = {
    winningAudience,
    winningSignals,
    notes: [
      'Review-first copy suggestions are meant to be inspected before any selection is applied.',
      'Use the control_plus_challenger option when the strongest winner still deserves a benchmark.',
      'Use persona_match and new_angle options when you want the rewrite to shift audience or awareness without becoming generic.',
    ],
  };

  const suggestions: CopyRewriteSuggestion[] = [
    buildSuggestion(context, analysis, 'control_plus_challenger', {
      id: 'control-plus-challenger',
      title: 'Control + challenger rewrite',
      summary: 'Keep the winning story recognizable while testing a tighter challenger around it.',
      confidence: 92,
      targeting: {
        ...winningAudience,
        awarenessStage: 'Most aware',
        angle: `Benchmark-preserving ${winningAudience.angle.toLowerCase()}`,
      },
      bestFor: ['Winner protection', 'Control-vs-challenger testing'],
      watchouts: ['Do not spread the message across too many angles', 'Keep the control easy to recognize'],
    }),
    buildSuggestion(context, analysis, 'persona_match', {
      id: 'persona-match',
      title: 'Persona match rewrite',
      summary: 'Shift the copy toward the audience that looks most responsive in the last 30 days.',
      confidence: 84,
      targeting: {
        ...winningAudience,
        awarenessStage: 'Problem aware',
        angle: `Persona-led ${winningAudience.angle.toLowerCase()}`,
      },
      bestFor: ['Audience-fit improvement', 'Creative reset without losing the offer'],
      watchouts: ['Avoid sounding like a generic audience segment', 'Keep the first line highly specific'],
    }),
    buildSuggestion(context, analysis, 'new_angle', {
      id: 'new-angle',
      title: 'New angle challenger',
      summary: 'Test a cleaner challenger angle without drifting away from the profitable floor.',
      confidence: 78,
      targeting: {
        ...winningAudience,
        awarenessStage: 'Solution aware',
        angle: `New challenger ${winningAudience.angle.toLowerCase()}`,
      },
      bestFor: ['Angle exploration', 'Fresh copy testing'],
      watchouts: ['Do not reuse the same opening hook too often', 'Watch that the new angle still fits the product'],
    }),
  ];

  return {
    source: 'fallback',
    model: 'rule-based',
    productName: context.productName,
    profitabilityFloor: context.profitabilityFloor ?? 1.2,
    workflowMode: 'review_first',
    analysis,
    suggestions,
    primaryTexts: suggestions[0].primaryTexts,
    headlines: suggestions[0].headlines,
    descriptions: suggestions[0].descriptions,
  };
}

function buildPrompt(context: CopyGenerationContext, analysis: CopyRewriteAnalysis): string {
  const productName = context.productName || 'your product';
  const profitabilityFloor = (context.profitabilityFloor ?? 1.2).toFixed(1);
  const winnersContext = context.existingWinners?.length
    ? context.existingWinners
        .map(
          (w, i) =>
            `  ${i + 1}. Primary: "${w.primaryText}"${w.headline ? ` | Headline: "${w.headline}"` : ''}${w.description ? ` | Description: "${w.description}"` : ''}${w.roas != null ? ` | ROAS: ${w.roas.toFixed(2)}x` : ''}${w.cpa != null ? ` | CPA: $${w.cpa.toFixed(2)}` : ''}${w.ctr != null ? ` | CTR: ${(w.ctr * 100).toFixed(2)}%` : ''}`,
        )
        .join('\n')
    : 'No existing winning copies available.';

  const selectedCopyContext = mergeUnique(
    [
      ...(context.selectedPrimaryTexts || []).slice(0, 5).map((text) => `  - Primary text: ${text}`),
      ...(context.selectedHeadlines || []).slice(0, 5).map((text) => `  - Headline: ${text}`),
      ...(context.selectedDescriptions || []).slice(0, 5).map((text) => `  - Description: ${text}`),
    ],
    15,
  ).join('\n');

  return `You are a senior Meta media buyer and direct-response copy strategist.

Goal:
- Return review-first copy rewrite options, not an auto-apply bundle.
- Infer the strongest likely persona, age group, gender skew, awareness stage, and angle from the available winner data.
- Keep the output grounded in the winning data and selected creative context.
- Do not produce generic filler or repetitive "free today" variations unless the winner data truly supports them.

Product: ${productName}
${context.productDescription ? `Product description: ${context.productDescription}` : ''}
${context.offer ? `Current offer: ${context.offer}` : ''}
${context.targetAudience ? `Target audience hint: ${context.targetAudience}` : ''}
${context.selectionContext ? `Current creative selection context:\n${context.selectionContext}` : ''}
${selectedCopyContext ? `\nCurrently selected copy to improve:\n${selectedCopyContext}` : ''}

Business rule:
- Treat ${profitabilityFloor}x ROAS as the profitable floor for this digital product workflow.

Existing winning copies:
${winnersContext}

Return 3 structured rewrite options:
1. control_plus_challenger
2. persona_match
3. new_angle

Each suggestion must include:
- id
- title
- summary
- confidence as an integer from 0 to 100
- intent
- targeting { persona, ageGroup, gender, awarenessStage, angle, rationale }
- 6 to 8 primaryTexts
- 6 to 8 headlines
- 6 to 8 descriptions
- bestFor
- watchouts

The analysis block must include:
- winningAudience
- winningSignals
- notes

Output strict JSON only with this shape:
{
  "analysis": {
    "winningAudience": {
      "persona": "...",
      "ageGroup": "...",
      "gender": "...",
      "awarenessStage": "...",
      "angle": "...",
      "rationale": "..."
    },
    "winningSignals": ["...", "..."],
    "notes": ["...", "..."]
  },
  "suggestions": [
    {
      "id": "control-plus-challenger",
      "title": "...",
      "summary": "...",
      "confidence": 92,
      "intent": "control_plus_challenger",
      "targeting": {
        "persona": "...",
        "ageGroup": "...",
        "gender": "...",
        "awarenessStage": "...",
        "angle": "...",
        "rationale": "..."
      },
      "primaryTexts": ["...", "...", "..."],
      "headlines": ["...", "...", "..."],
      "descriptions": ["...", "...", "..."],
      "bestFor": ["...", "..."],
      "watchouts": ["...", "..."]
    }
  ]
}`;
}

function normalizeSuggestion(
  suggestion: ParsedCopySuggestion,
  fallback: CopyRewriteSuggestion,
): CopyRewriteSuggestion {
  const targeting = normalizeTargeting(suggestion.targeting, fallback.targeting);

  return {
    id: suggestion.id?.trim() || fallback.id,
    title: suggestion.title?.trim() || fallback.title,
    summary: suggestion.summary?.trim() || fallback.summary,
    confidence: clampConfidence(suggestion.confidence, fallback.confidence),
    intent: suggestion.intent || fallback.intent,
    targeting,
    primaryTexts: mergeUnique([...(normalizeTextArray(suggestion.primaryTexts, COPY_OPTION_LIMIT)), ...fallback.primaryTexts], COPY_OPTION_LIMIT),
    headlines: mergeUnique([...(normalizeTextArray(suggestion.headlines, COPY_OPTION_LIMIT)), ...fallback.headlines], COPY_OPTION_LIMIT),
    descriptions: mergeUnique([...(normalizeTextArray(suggestion.descriptions, COPY_OPTION_LIMIT)), ...fallback.descriptions], COPY_OPTION_LIMIT),
    bestFor: mergeUnique(
      normalizeTextArray(suggestion.bestFor, 4).length > 0 ? normalizeTextArray(suggestion.bestFor, 4) : fallback.bestFor,
      4,
    ),
    watchouts: mergeUnique(
      normalizeTextArray(suggestion.watchouts, 4).length > 0 ? normalizeTextArray(suggestion.watchouts, 4) : fallback.watchouts,
      4,
    ),
    winningSignals: mergeUnique(
      normalizeTextArray(suggestion.winningSignals, WINNING_SIGNAL_LIMIT).length > 0
        ? normalizeTextArray(suggestion.winningSignals, WINNING_SIGNAL_LIMIT)
        : fallback.winningSignals || [],
      WINNING_SIGNAL_LIMIT,
    ),
  };
}

async function callClaudeForCopyGeneration(
  context: CopyGenerationContext,
): Promise<CreativeCopyGenerationResponse | null> {
  const apiKey = firstEnvValue(ANTHROPIC_API_KEY_ALIASES);
  if (!apiKey) return null;

  const winningAudience = inferAudienceFromContext(context);
  const winningSignals = buildWinningSignals(context, winningAudience);
  const analysis: CopyRewriteAnalysis = {
    winningAudience,
    winningSignals,
    notes: [
      'Claude should return review-first options that can be inspected before any apply action.',
      'The strongest suggestion should preserve the winning control logic while the other options shift persona or angle.',
      'If the data is ambiguous, infer the most likely audience and lower the confidence rather than writing generic copy.',
    ],
  };

  const prompt = buildPrompt(context, analysis);
  const model = firstEnvValue(ANTHROPIC_MODEL_ALIASES) || 'claude-sonnet-4-20250514';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

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
        max_tokens: 2400,
        temperature: 0.75,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude copy generation failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textContent = data.content?.find((item) => item.type === 'text')?.text;
    if (!textContent) return null;

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as ParsedCopyResponse;
    const fallback = buildFallbackResponse(context);
    const parsedSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

    const normalizedSuggestions: CopyRewriteSuggestion[] = [
      normalizeSuggestion(
        parsedSuggestions[0] || {},
        fallback.suggestions[0],
      ),
      normalizeSuggestion(
        parsedSuggestions[1] || {},
        fallback.suggestions[1],
      ),
      normalizeSuggestion(
        parsedSuggestions[2] || {},
        fallback.suggestions[2],
      ),
    ];

    const normalizedAnalysis: CopyRewriteAnalysis = {
      winningAudience: normalizeTargeting(parsed.analysis?.winningAudience, fallback.analysis.winningAudience),
      winningSignals: mergeUnique(
        [
          ...(normalizeTextArray(parsed.analysis?.winningSignals, WINNING_SIGNAL_LIMIT)),
          ...fallback.analysis.winningSignals,
        ],
        WINNING_SIGNAL_LIMIT,
      ),
      notes: mergeUnique(
        [
          ...(normalizeTextArray(parsed.analysis?.notes, 6)),
          ...fallback.analysis.notes,
        ],
        6,
      ),
    };

    return {
      source: 'ai',
      model,
      productName: context.productName,
      profitabilityFloor: context.profitabilityFloor ?? 1.2,
      workflowMode: 'review_first',
      analysis: normalizedAnalysis,
      suggestions: normalizedSuggestions,
      primaryTexts: normalizedSuggestions[0].primaryTexts,
      headlines: normalizedSuggestions[0].headlines,
      descriptions: normalizedSuggestions[0].descriptions,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateCreativeCopy(
  context: CopyGenerationContext,
): Promise<CreativeCopyGenerationResponse> {
  const aiCopy = await callClaudeForCopyGeneration(context).catch(() => null);
  return aiCopy ?? buildFallbackResponse(context);
}
