import { NextRequest, NextResponse } from 'next/server';
import type { CreativeAiTagSet, InboxCreative } from '@/types/creativeHub';
import { generateGeminiText, getGeminiConfig } from '@/app/api/lib/gemini';

interface TaggingRequestBody {
  storeId?: string;
  productProfileId?: string;
  productName?: string;
  creatives?: InboxCreative[];
}

interface TaskTaggingUnit {
  taskId: string;
  taskName: string;
  creativeIds: string[];
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

function deriveFallbackTags(task: TaskTaggingUnit): CreativeAiTagSet {
  const haystack = [
    task.taskName,
    task.taskContext.description,
    task.taskContext.creator,
    ...task.taskContext.assignees,
    ...task.taskContext.tags,
    ...task.taskContext.customFields.map((field) => `${field.name} ${field.value}`),
    ...task.creatives.map((creative) => `${creative.creativeName} ${creative.driveParentFolderName || ''}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const awarenessStage =
    /retarget|remarket|testimonial|review|social proof/.test(haystack)
      ? 'Consideration'
      : /offer|buy|cta|download|free/.test(haystack)
        ? 'Conversion'
        : /problem|pain|attention|hook/.test(haystack)
          ? 'Awareness'
          : 'Mid-funnel';

  const targetAge =
    /kid|child|parent|mom|dad|family|caregiver/.test(haystack)
      ? 'Parents / caregivers'
      : /student|teen/.test(haystack)
        ? 'Teens / students'
        : 'Broad adult';

  const persona =
    /teacher|homeschool/.test(haystack)
      ? 'Teacher / homeschool buyer'
      : /grandparent/.test(haystack)
        ? 'Grandparent buyer'
        : /parent|mom|dad|family|caregiver/.test(haystack)
          ? 'Parent / caregiver'
          : 'General buyer';

  const gender =
    /mom|mother|women|girl/.test(haystack)
      ? 'Female skew'
      : /dad|father|men|boy/.test(haystack)
        ? 'Male skew'
        : 'All gender';

  const angle =
    /social proof|testimonial|review/.test(haystack)
      ? 'Social proof'
      : /problem|pain|struggle/.test(haystack)
        ? 'Problem / solution'
        : /offer|discount|free|save/.test(haystack)
          ? 'Offer driven'
          : /benefit|learn|grow|result/.test(haystack)
            ? 'Benefit led'
            : 'General angle';

  return {
    awarenessStage,
    targetAge,
    persona,
    gender,
    angle,
    confidence: 'low',
    rationale: 'Fallback heuristic tags were used because Gemini tagging was unavailable.',
    source: 'fallback',
  };
}

function buildTaskUnits(creatives: InboxCreative[]): TaskTaggingUnit[] {
  const map = new Map<string, TaskTaggingUnit>();

  for (const creative of creatives) {
    if (!creative.clickupTaskId) continue;
    const existing = map.get(creative.clickupTaskId);
    if (existing) {
      existing.creativeIds.push(creative.id);
      existing.creatives.push({
        id: creative.id,
        creativeName: creative.creativeName,
        creativeFormat: creative.creativeFormat,
        uploadedAt: creative.uploadedAt,
        driveParentFolderName: creative.driveParentFolderName,
        driveMimeType: creative.driveMimeType,
      });
      continue;
    }

    map.set(creative.clickupTaskId, {
      taskId: creative.clickupTaskId,
      taskName: creative.clickupTaskName,
      creativeIds: [creative.id],
      creatives: [
        {
          id: creative.id,
          creativeName: creative.creativeName,
          creativeFormat: creative.creativeFormat,
          uploadedAt: creative.uploadedAt,
          driveParentFolderName: creative.driveParentFolderName,
          driveMimeType: creative.driveMimeType,
        },
      ],
      taskContext: {
        description: creative.clickupDescription,
        tags: creative.clickupTags || [],
        customFields: (creative.clickupCustomFields || []).map((field) => ({
          name: field.name,
          value: field.value,
          type: field.type,
        })),
        creator: creative.clickupTaskContext?.creator?.username || creative.creator,
        assignees: (creative.clickupTaskContext?.assignees || creative.clickupAssignees || [])
          .map((person) => person.username)
          .filter(Boolean),
        dueDate: creative.clickupTaskContext?.dueDate,
        startDate: creative.clickupTaskContext?.startDate,
        status: creative.clickupTaskContext?.status?.name || creative.clickupTaskStatus,
        listName: creative.clickupTaskContext?.list?.name || creative.clickupListName,
        folderName: creative.clickupTaskContext?.folder?.name,
        spaceName: creative.clickupTaskContext?.space?.name,
      },
    });
  }

  return [...map.values()];
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TaggingRequestBody;
    const creatives = Array.isArray(body.creatives) ? body.creatives : [];

    if (!body.storeId || !body.productProfileId) {
      return NextResponse.json({ error: 'Missing required fields: storeId, productProfileId' }, { status: 400 });
    }

    const taskUnits = buildTaskUnits(creatives);
    if (taskUnits.length === 0) {
      return NextResponse.json({ tags: {}, meta: { source: 'fallback', model: 'none', taskCount: 0 } });
    }

    if (!getGeminiConfig('gemini-2.0-flash')) {
      const fallbackTags = Object.fromEntries(
        taskUnits.flatMap((task) => {
          const tags = deriveFallbackTags(task);
          return task.creativeIds.map((creativeId) => [creativeId, tags]);
        }),
      );
      return NextResponse.json({
        tags: fallbackTags,
        meta: { source: 'fallback', model: 'rule-based', taskCount: taskUnits.length },
      });
    }

    const promptPayload = taskUnits.slice(0, 80).map((task) => ({
      taskId: task.taskId,
      taskName: task.taskName,
      creatives: task.creatives,
      taskContext: task.taskContext,
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const { text, model, apiKeySource } = await generateGeminiText({
        systemInstruction: `You are a senior media buyer and creative strategist with 10+ years of experience.
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

Return ONLY a valid JSON array with this exact shape:
[
  {
    "taskId": "string",
    "awarenessStage": "string",
    "targetAge": "string",
    "persona": "string",
    "gender": "string",
    "angle": "string",
    "confidence": "high|medium|low",
    "rationale": "string"
  }
]`,
        userPrompt: `Product: ${body.productName || 'Unknown product'}

Classify these ClickUp creative tasks:
${JSON.stringify(promptPayload, null, 2)}`,
        defaultModel: 'gemini-2.0-flash',
        maxOutputTokens: 4096,
        temperature: 0.2,
        signal: controller.signal,
      });

      const jsonText = extractJsonArray(text);
      if (!jsonText) {
        throw new Error('Gemini tagging returned no JSON payload');
      }

      const parsed = JSON.parse(jsonText) as Array<{
        taskId: string;
        awarenessStage: string;
        targetAge: string;
        persona: string;
        gender: string;
        angle: string;
        confidence?: string;
        rationale?: string;
      }>;

      const taskMap = new Map(taskUnits.map((task) => [task.taskId, task]));
      const tags = Object.fromEntries(
        parsed.flatMap((item) => {
          const task = taskMap.get(item.taskId);
          if (!task) return [];
          const tagSet: CreativeAiTagSet = {
            awarenessStage: item.awarenessStage || 'Unknown',
            targetAge: item.targetAge || 'Unknown',
            persona: item.persona || 'Unknown',
            gender: item.gender || 'Unknown',
            angle: item.angle || 'Unknown',
            confidence: item.confidence || 'medium',
            rationale: item.rationale || undefined,
            source: 'gemini',
          };
          return task.creativeIds.map((creativeId) => [creativeId, tagSet]);
        }),
      );

      for (const task of taskUnits) {
        for (const creativeId of task.creativeIds) {
          if (!tags[creativeId]) {
            tags[creativeId] = deriveFallbackTags(task);
          }
        }
      }

      return NextResponse.json({
        tags,
        meta: {
          source: 'gemini',
          model,
          apiKeySource,
          taskCount: taskUnits.length,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate creative AI tags' },
      { status: 500 },
    );
  }
}
