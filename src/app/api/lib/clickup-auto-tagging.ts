import { getDb, getThirdPartyToken } from '@/app/api/lib/db';
import { generateGeminiText } from '@/app/api/lib/gemini';

export const CLICKUP_SCRIPT_BANK_LIST_ID = '901613067126';
export const CLICKUP_SCRIPT_BANK_WORKSPACE_ID = '9016762494';
export const CLICKUP_TAG_FIELD_IDS = {
  hookTitle: '19cfa2d3-ce4f-451c-90e6-8033c25fc397',
  hookText: 'fdeb64f9-3443-476d-9e97-b10c42f35179',
  hookStyle: '52886a13-477a-4440-b068-e4a56d0c9c6b',
  awarenessStage: 'd29a6366-6f8f-490e-9e3a-09843702ef0f',
  persona: '21c7d59b-8361-47ce-b16d-d358c4972dcd',
  problem: 'bb64a0f2-ac1e-4059-8e42-f379a58537b9',
} as const;

export const CLICKUP_AWARENESS_OPTION_IDS: Record<string, string> = {
  unaware: 'e506c64e-504c-4fe1-97ef-7b091e510ea0',
  'problem aware': '48b36fea-0c1a-4ff8-93e0-a16be8ed25df',
  'solution aware': '1fa187f0-4f42-4e0f-8414-641f66ae5a20',
  'product aware': '57a51621-b775-43e8-9a67-4aed72382a4a',
  'most aware': '5f0ee392-b79c-4dfa-ae23-6be8b53c3b72',
};

export interface ClickUpCustomFieldOption {
  id: string;
  name: string;
  orderindex: number;
  color?: string;
}

export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  type_config?: {
    options?: ClickUpCustomFieldOption[];
    [key: string]: unknown;
  };
}

export interface ClickUpTaskRecord {
  id: string;
  name: string;
  description?: string;
  text_content?: string;
  custom_fields: ClickUpCustomField[];
  tags: Array<{ name: string }>;
  list: { id: string; name: string };
  url?: string;
  date_created?: string;
  date_updated?: string;
}

export interface GeminiScriptBankTags {
  hook_title: string;
  hook_text: string;
  hook_style: string;
  awareness_stage: string;
  persona: string;
  problem: string;
  target_audience: string;
  targeting_age: string;
  ad_format: string;
  emotional_trigger: string;
  content_pillar: string;
  cta: string;
  ad_angle: string;
  funnel_stage: string;
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function normalizeClickUpFieldValue(field: ClickUpCustomField): string {
  if (field.value == null) return '';

  const options = field.type_config?.options || [];

  if (field.type === 'drop_down') {
    if (typeof field.value === 'string') {
      return options.find((option) => option.id === field.value)?.name || field.value;
    }
    if (typeof field.value === 'number') {
      return options.find((option) => option.orderindex === field.value)?.name || String(field.value);
    }
  }

  if (field.type === 'labels' && Array.isArray(field.value)) {
    return field.value
      .map((entry) => {
        if (typeof entry === 'string') {
          return options.find((option) => option.id === entry)?.name || entry;
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  if (Array.isArray(field.value)) {
    return field.value
      .map((entry) => {
        if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
          return String(entry);
        }
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          return normalizeString(record.name) || normalizeString(record.username) || normalizeString(record.email);
        }
        return '';
      })
      .filter(Boolean)
      .join(', ');
  }

  if (typeof field.value === 'object') {
    const record = field.value as Record<string, unknown>;
    return (
      normalizeString(record.url) ||
      normalizeString(record.value) ||
      normalizeString(record.name) ||
      normalizeString(record.username) ||
      normalizeString(record.email) ||
      JSON.stringify(record)
    );
  }

  return normalizeString(field.value);
}

export function parseClickUpDescriptionToPlainText(description?: string, textContent?: string): string {
  if (typeof textContent === 'string' && textContent.trim()) {
    return textContent.replace(/\n{3,}/g, '\n\n').trim();
  }

  if (typeof description !== 'string' || !description.trim()) {
    return '';
  }

  try {
    const parsed = JSON.parse(description) as { ops?: Array<{ insert?: unknown }> };
    if (Array.isArray(parsed.ops)) {
      const text = parsed.ops
        .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
        .join('')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (text) return text;
    }
  } catch {
    // Fall through to raw description.
  }

  return description.trim();
}

export function getClickUpTaskFieldValue(task: ClickUpTaskRecord, fieldName: string): string {
  const normalizedTarget = fieldName.trim().toLowerCase();
  const field = task.custom_fields.find((entry) => entry.name.trim().toLowerCase() === normalizedTarget);
  return field ? normalizeClickUpFieldValue(field) : '';
}

export function getClickUpTaskToken(storeId?: string): string | null {
  const envToken = process.env.CLICKUP_API_KEY?.trim();
  if (envToken) return envToken;
  if (storeId) {
    const row = getThirdPartyToken(storeId, 'clickup');
    if (row?.access_token) return row.access_token;
  }

  const db = getDb();
  const row = db
    .prepare(`SELECT store_id FROM third_party_tokens WHERE platform = 'clickup' ORDER BY updated_at DESC LIMIT 1`)
    .get() as { store_id?: string } | undefined;

  if (!row?.store_id) return null;
  return getThirdPartyToken(row.store_id, 'clickup')?.access_token || null;
}

export async function fetchClickUpTask(taskId: string, token: string): Promise<ClickUpTaskRecord> {
  const url = new URL(`https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`);
  url.searchParams.set('include_subtasks', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: token,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Failed to fetch ClickUp task ${taskId} (${response.status}): ${errorBody.slice(0, 400)}`);
  }

  return (await response.json()) as ClickUpTaskRecord;
}

export async function setClickUpCustomFieldValue(taskId: string, fieldId: string, value: string, token: string) {
  const response = await fetch(
    `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/field/${encodeURIComponent(fieldId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Failed to update ClickUp custom field ${fieldId} for task ${taskId} (${response.status}): ${errorBody.slice(0, 400)}`,
    );
  }
}

export function mapAwarenessStageToOptionId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return CLICKUP_AWARENESS_OPTION_IDS[normalized] || null;
}

export async function generateGeminiScriptBankTags(task: ClickUpTaskRecord): Promise<{
  tags: GeminiScriptBankTags;
  plainTextDescription: string;
  model: string;
  apiKeySource: string;
}> {
  const plainTextDescription = parseClickUpDescriptionToPlainText(task.description, task.text_content);
  const customFieldSummary = task.custom_fields
    .map((field) => ({
      name: field.name,
      type: field.type,
      value: normalizeClickUpFieldValue(field),
    }))
    .filter((field) => field.value)
    .slice(0, 50);

  const { text, model, apiKeySource } = await generateGeminiText({
    systemInstruction:
      'You are a Meta ads marketing expert specializing in digital product funnels. Return only valid JSON.',
    userPrompt: `Analyze this ClickUp ad script task and return ONLY a JSON object. No explanation.

TASK DATA:
- Name: ${task.name}
- Description (parsed): ${plainTextDescription || 'Not provided'}
- Product: ${getClickUpTaskFieldValue(task, 'Product') || 'Not provided'}
- Hook Style: ${getClickUpTaskFieldValue(task, 'Hook Style') || 'Not provided'}
- Tags: ${task.tags.map((tag) => tag.name).filter(Boolean).join(', ') || 'None'}
- Custom fields: ${JSON.stringify(customFieldSummary)}

Return this JSON:
{
  "hook_title": "",
  "hook_text": "",
  "hook_style": "",
  "awareness_stage": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware",
  "persona": "",
  "problem": "",
  "target_audience": "",
  "targeting_age": "",
  "ad_format": "",
  "emotional_trigger": "",
  "content_pillar": "",
  "cta": "",
  "ad_angle": "",
  "funnel_stage": "TOF | MOF | BOF"
}`,
    defaultModel: 'gemini-2.0-flash',
    maxOutputTokens: 1024,
    temperature: 0.2,
  });

  return {
    tags: JSON.parse(text) as GeminiScriptBankTags,
    plainTextDescription,
    model,
    apiKeySource,
  };
}

export async function writeScriptBankTagsToClickUp(taskId: string, tags: GeminiScriptBankTags, token: string) {
  const updates: Array<{ fieldId: string; value: string }> = [
    { fieldId: CLICKUP_TAG_FIELD_IDS.hookTitle, value: tags.hook_title || '' },
    { fieldId: CLICKUP_TAG_FIELD_IDS.hookText, value: tags.hook_text || '' },
    { fieldId: CLICKUP_TAG_FIELD_IDS.hookStyle, value: tags.hook_style || '' },
    { fieldId: CLICKUP_TAG_FIELD_IDS.persona, value: tags.persona || '' },
    { fieldId: CLICKUP_TAG_FIELD_IDS.problem, value: tags.problem || '' },
  ];

  const awarenessStageId = mapAwarenessStageToOptionId(tags.awareness_stage || '');
  if (awarenessStageId) {
    updates.push({ fieldId: CLICKUP_TAG_FIELD_IDS.awarenessStage, value: awarenessStageId });
  }

  const results = [];
  for (const update of updates) {
    await setClickUpCustomFieldValue(taskId, update.fieldId, update.value, token);
    results.push({ fieldId: update.fieldId, ok: true });
  }
  return results;
}

export function shouldSkipAutoTagWebhook(historyItems: unknown): boolean {
  if (!Array.isArray(historyItems)) return false;

  const targetFieldIds = new Set<string>(Object.values(CLICKUP_TAG_FIELD_IDS));
  return historyItems.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Record<string, unknown>;
    const fieldId =
      normalizeString(record.custom_field_id) ||
      normalizeString(record.field_id) ||
      (record.custom_field && typeof record.custom_field === 'object'
        ? normalizeString((record.custom_field as Record<string, unknown>).id)
        : '');
    return targetFieldIds.has(fieldId);
  });
}
