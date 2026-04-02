export interface GeminiConfig {
  apiKey: string;
  model: string;
  apiKeySource: string;
}

export function getGeminiConfig(defaultModel = 'gemini-2.0-flash'): GeminiConfig | null {
  const candidates = [
    ['GEMINI_API_KEY', process.env.GEMINI_API_KEY],
    ['GOOGLE_AI_API_KEY', process.env.GOOGLE_AI_API_KEY],
  ] as const;

  for (const [apiKeySource, value] of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return {
        apiKey: value.trim(),
        model: process.env.GEMINI_MODEL?.trim() || defaultModel,
        apiKeySource,
      };
    }
  }

  return null;
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export async function generateGeminiText(input: {
  systemInstruction: string;
  userPrompt: string;
  defaultModel?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<{
  text: string;
  model: string;
  apiKeySource: string;
}> {
  const config = getGeminiConfig(input.defaultModel);
  if (!config) {
    throw new Error('Gemini API key is not configured');
  }

  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`);
  url.searchParams.set('key', config.apiKey);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: input.systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: input.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxOutputTokens ?? 4096,
        responseMimeType: 'application/json',
      },
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Gemini request failed (${response.status}): ${errorBody.slice(0, 400)}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = (result.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return {
    text: stripCodeFence(text),
    model: config.model,
    apiKeySource: config.apiKeySource,
  };
}

export async function generateGeminiJson<T>(input: {
  systemInstruction: string;
  userPrompt: string;
  responseSchema?: Record<string, unknown>;
  defaultModel?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<{
  data: T;
  model: string;
  apiKeySource: string;
}> {
  const config = getGeminiConfig(input.defaultModel);
  if (!config) {
    throw new Error('Gemini API key is not configured');
  }

  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`);
  url.searchParams.set('key', config.apiKey);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: input.systemInstruction }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: input.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxOutputTokens ?? 4096,
        responseMimeType: 'application/json',
        ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
      },
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Gemini request failed (${response.status}): ${errorBody.slice(0, 400)}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = (result.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return {
    data: JSON.parse(stripCodeFence(text)) as T,
    model: config.model,
    apiKeySource: config.apiKeySource,
  };
}

interface GeminiCreativeTaskPayload {
  taskId: string;
  taskName: string;
  creatives: Array<{
    id: string;
    creativeName: string;
    creativeFormat: string;
    uploadedAt?: string;
    driveParentFolderName?: string;
    driveMimeType?: string;
  }>;
  taskContext: {
    description?: string;
    tags: string[];
    customFields: Array<{ name: string; value: string; type?: string }>;
    creator?: string;
    assignees: string[];
    dueDate?: string;
    startDate?: string;
    status?: string;
    listName?: string;
    folderName?: string;
    spaceName?: string;
  };
}

interface GeminiCreativeTaskClassification {
  taskId: string;
  awarenessStage: string;
  targetAge: string;
  persona: string;
  gender: string;
  angle: string;
  confidence: string;
  rationale: string;
}

export async function classifyCreativeTasksWithGemini(
  tasks: GeminiCreativeTaskPayload[],
  productName?: string,
): Promise<{
  parsed: GeminiCreativeTaskClassification[];
  meta: { source: 'gemini'; model: string; apiKeySource: string };
}> {
  const systemInstruction = `You are a senior media buyer and creative strategist with 10+ years of experience.
For each ClickUp creative task, classify the task into five advertiser-facing AI columns:
1. awarenessStage
2. targetAge
3. persona
4. gender
5. angle

Rules:
- Use the full ClickUp task context, custom fields, tags, creator notes, and asset metadata.
- If one task has multiple creatives, return one shared classification for that task.
- Be concrete and use short values that fit well in a table cell.
- Do not hallucinate detailed demographic specificity unless the task context supports it.
- Confidence must be one of: high, medium, low.
- rationale must be one short sentence grounded in the provided ClickUp context.
- Return only valid JSON.`;

  const userPrompt = `Product: ${productName || 'Unknown product'}

Classify these ClickUp creative tasks:
${JSON.stringify(tasks, null, 2)}`;

  const result = await generateGeminiJson<GeminiCreativeTaskClassification[]>({
    systemInstruction,
    userPrompt,
    responseSchema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['taskId', 'awarenessStage', 'targetAge', 'persona', 'gender', 'angle', 'confidence', 'rationale'],
        properties: {
          taskId: { type: 'string' },
          awarenessStage: { type: 'string' },
          targetAge: { type: 'string' },
          persona: { type: 'string' },
          gender: { type: 'string' },
          angle: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          rationale: { type: 'string' },
        },
      },
    },
  });

  return {
    parsed: result.data,
    meta: {
      source: 'gemini',
      model: result.model,
      apiKeySource: result.apiKeySource,
    },
  };
}
