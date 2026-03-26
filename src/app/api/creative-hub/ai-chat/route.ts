import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/creative-hub/ai-chat
 *
 * Conversational AI assistant for creative strategy. Accepts a user message
 * with optional performance context (winning ads, copy, campaigns, inbox
 * creatives) and returns an AI response with action items and optional
 * batch suggestions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatRequestBody {
  storeId: string;
  productProfileId: string;
  message: string;
  context?: {
    winningAds?: Record<string, unknown>[];
    primaryTexts?: Record<string, unknown>[];
    campaigns?: Record<string, unknown>[];
    creatives?: Record<string, unknown>[];
  };
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface SuggestedBatch {
  name: string;
  creativeIds: string[];
  reason: string;
}

interface ChatResponse {
  response: string;
  actionItems?: string[];
  suggestedBatches?: SuggestedBatch[];
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert Meta Ads creative strategist with 10+ years experience managing $100M+ in annual ad spend. You analyze creative performance data and help media buyers make testing decisions.

Your responses should be:
- Data-driven (reference specific metrics when available)
- Actionable (every insight has a "do this" attached)
- Concise (media buyers are busy, keep it tight)
- Include action items that can be checked off

When suggesting batches, group creatives by:
- Similar angles together (test angle vs angle)
- Similar formats together (video vs image)
- Hook variations in same batch (test hooks within same angle)

IMPORTANT: Return your response as valid JSON matching this exact schema. No markdown, no explanation outside the JSON.

{
  "response": "Your conversational response here. Use markdown formatting for readability.",
  "actionItems": ["Specific action item 1", "Specific action item 2"],
  "suggestedBatches": [
    {
      "name": "Batch name",
      "creativeIds": ["id1", "id2"],
      "reason": "Why these are grouped together"
    }
  ]
}

Rules for the JSON:
- "response" is always required.
- "actionItems" should be included when you have concrete next steps. Omit if none.
- "suggestedBatches" should only be included when the user asks about batching, grouping, or launching creatives, AND you have creative IDs from the context. Omit otherwise.
- Keep action items short and specific (start with a verb).`;

// ---------------------------------------------------------------------------
// Build context string from provided data
// ---------------------------------------------------------------------------

function buildContextBlock(context: ChatRequestBody['context']): string {
  if (!context) return '';

  const parts: string[] = [];

  if (context.winningAds && context.winningAds.length > 0) {
    const ads = context.winningAds.slice(0, 10);
    const lines = ads.map((ad, i) => {
      const name = (ad as { name?: string }).name || 'Unknown';
      const metrics = (ad as { metrics?: Record<string, number> }).metrics || {};
      const creative = (ad as { creative?: Record<string, string> }).creative || {};
      return `${i + 1}. "${name}" | ROAS: ${(metrics.roas ?? 0).toFixed(2)}x | CPA: $${(metrics.cpa ?? 0).toFixed(2)} | CTR: ${((metrics.ctr ?? 0) * 100).toFixed(2)}% | Spend: $${(metrics.spend ?? 0).toFixed(2)} | Body: "${(creative.body ?? '').slice(0, 80)}"`;
    });
    parts.push(`TOP WINNING ADS:\n${lines.join('\n')}`);
  }

  if (context.primaryTexts && context.primaryTexts.length > 0) {
    const pts = context.primaryTexts.slice(0, 5);
    const lines = pts.map((pt, i) => {
      const text = (pt as { text?: string }).text || '';
      const roas = (pt as { combinedRoas?: number }).combinedRoas || (pt as { avgRoas?: number }).avgRoas || 0;
      const spend = (pt as { combinedSpend?: number }).combinedSpend || (pt as { totalSpend?: number }).totalSpend || 0;
      return `${i + 1}. "${text.slice(0, 100)}" | ROAS: ${roas.toFixed(2)}x | Spend: $${spend.toFixed(2)}`;
    });
    parts.push(`TOP PRIMARY TEXTS:\n${lines.join('\n')}`);
  }

  if (context.campaigns && context.campaigns.length > 0) {
    const camps = context.campaigns.slice(0, 5);
    const lines = camps.map((c, i) => {
      const name = (c as { campaignName?: string }).campaignName || (c as { name?: string }).name || 'Unknown';
      const status = (c as { effectiveStatus?: string }).effectiveStatus || (c as { status?: string }).status || 'unknown';
      const type = (c as { campaignType?: string }).campaignType || '';
      return `${i + 1}. "${name}" | Status: ${status} | Type: ${type}`;
    });
    parts.push(`LINKED CAMPAIGNS:\n${lines.join('\n')}`);
  }

  if (context.creatives && context.creatives.length > 0) {
    const creatives = context.creatives.slice(0, 15);
    const lines = creatives.map((cr, i) => {
      const id = (cr as { id?: string }).id || '';
      const name = (cr as { creativeName?: string }).creativeName || (cr as { name?: string }).name || 'Unknown';
      const format = (cr as { creativeFormat?: string }).creativeFormat || (cr as { format?: string }).format || 'unknown';
      const hook = (cr as { hook?: string }).hook || '';
      const angle = (cr as { angle?: string }).angle || '';
      const tested = (cr as { alreadyTested?: boolean }).alreadyTested ? ' [ALREADY TESTED]' : '';
      return `${i + 1}. [${id}] "${name}" | Format: ${format}${hook ? ` | Hook: ${hook}` : ''}${angle ? ` | Angle: ${angle}` : ''}${tested}`;
    });
    parts.push(`AVAILABLE CREATIVES IN INBOX:\n${lines.join('\n')}`);
  }

  return parts.length > 0 ? `\n\nCONTEXT DATA:\n${parts.join('\n\n')}` : '';
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaude(body: ChatRequestBody): Promise<ChatResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const model = process.env.ANTHROPIC_CREATIVE_MODEL || 'claude-sonnet-4-20250514';
  const contextBlock = buildContextBlock(body.context);

  // Build message history
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (body.history && body.history.length > 0) {
    // Include up to the last 10 exchanges to stay within token limits
    const recentHistory = body.history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Append the current user message with context
  const userMessage = contextBlock
    ? `${body.message}${contextBlock}`
    : body.message;
  messages.push({ role: 'user', content: userMessage });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API failed (${response.status}): ${errorBody}`);
    }

    const result = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textContent = result.content?.find((c) => c.type === 'text')?.text;
    if (!textContent) {
      throw new Error('Claude returned no text content');
    }

    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If Claude didn't return JSON, wrap the plain text response
      return { response: textContent };
    }

    const parsed = JSON.parse(jsonMatch[0]) as ChatResponse;

    // Validate required field
    if (!parsed.response || typeof parsed.response !== 'string') {
      return { response: textContent };
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Fallback response when API is unavailable
// ---------------------------------------------------------------------------

function buildFallbackResponse(message: string): ChatResponse {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('batch') || lowerMessage.includes('group') || lowerMessage.includes('launch')) {
    return {
      response:
        'AI analysis is currently unavailable. For batching creatives, a good rule of thumb is to group by angle (test angle vs angle), keep formats consistent within each batch (all video or all image), and test 3-5 creatives per batch with $20-30/day per creative.',
      actionItems: [
        'Group creatives by angle or theme',
        'Keep 3-5 creatives per test batch',
        'Set budget to $20-30/day per creative',
        'Run tests for 3-5 days minimum before making decisions',
      ],
    };
  }

  if (lowerMessage.includes('copy') || lowerMessage.includes('text') || lowerMessage.includes('headline')) {
    return {
      response:
        'AI analysis is currently unavailable. For copy testing, focus on testing different hooks (the first line of your primary text). Keep the body and CTA consistent while varying the opening angle. Test 3-4 hook variations per batch.',
      actionItems: [
        'Identify your top 3 performing hooks',
        'Create variations of each winning hook',
        'Test one variable at a time (hook OR body, not both)',
        'Use winning copy from past tests as your control',
      ],
    };
  }

  return {
    response:
      'AI analysis is currently unavailable. I can help with creative strategy once the AI service is back online. In the meantime, review your top performing ads and identify common themes in the creative, copy, and targeting.',
    actionItems: [
      'Review your top 5 ads by ROAS',
      'Identify common themes in winning creatives',
      'Check for creative fatigue on ads running 7+ days',
      'Prepare new creative variations based on winning angles',
    ],
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequestBody;

    const { storeId, productProfileId, message } = body;

    if (!storeId || !productProfileId) {
      return NextResponse.json(
        { error: 'storeId and productProfileId are required' },
        { status: 400 },
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'message is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    let chatResponse: ChatResponse;

    try {
      chatResponse = await callClaude(body);
      console.log('[ai-chat] Claude returned response successfully');
    } catch (err) {
      console.error('[ai-chat] Claude API call failed:', err);
      chatResponse = buildFallbackResponse(message);
    }

    return NextResponse.json(chatResponse);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : 'Failed to process AI chat request';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
