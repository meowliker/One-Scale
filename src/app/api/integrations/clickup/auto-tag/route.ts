import { NextRequest, NextResponse } from 'next/server';
import {
  CLICKUP_SCRIPT_BANK_LIST_ID,
  CLICKUP_SCRIPT_BANK_WORKSPACE_ID,
  fetchClickUpTask,
  generateGeminiScriptBankTags,
  getClickUpTaskToken,
  shouldSkipAutoTagWebhook,
  writeScriptBankTagsToClickUp,
} from '@/app/api/lib/clickup-auto-tagging';

interface ClickUpAutoTagBody {
  storeId?: string;
  taskId?: string;
  task_id?: string;
  listId?: string;
  list_id?: string;
  parent_id?: string;
  event?: string;
  team_id?: string;
  history_items?: Array<Record<string, unknown>>;
}

function resolveTaskId(body: ClickUpAutoTagBody): string | null {
  const historyTaskId = body.history_items?.find((item) => {
    const taskIdValue = item.task_id;
    const parentIdValue = item.parent_id;
    return typeof taskIdValue === 'string' || typeof parentIdValue === 'string';
  });

  return (
    body.taskId ||
    body.task_id ||
    (typeof historyTaskId?.task_id === 'string' ? historyTaskId.task_id : null) ||
    (typeof historyTaskId?.parent_id === 'string' ? historyTaskId.parent_id : null)
  );
}

function resolveListId(body: ClickUpAutoTagBody): string | null {
  return body.listId || body.list_id || body.parent_id || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ClickUpAutoTagBody;
    const taskId = resolveTaskId(body);
    const listId = resolveListId(body);

    if (!taskId) {
      return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
    }

    if (body.event && !['taskCreated', 'taskUpdated'].includes(body.event)) {
      return NextResponse.json({ ok: true, skipped: true, reason: `Ignored event ${body.event}` });
    }

    if (body.team_id && body.team_id !== CLICKUP_SCRIPT_BANK_WORKSPACE_ID) {
      return NextResponse.json({ ok: true, skipped: true, reason: `Ignored workspace ${body.team_id}` });
    }

    if (listId && listId !== CLICKUP_SCRIPT_BANK_LIST_ID) {
      return NextResponse.json({ ok: true, skipped: true, reason: `Ignored list ${listId}` });
    }

    if (shouldSkipAutoTagWebhook(body.history_items)) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Webhook only changed auto-tag fields' });
    }

    const token = getClickUpTaskToken(body.storeId);
    if (!token) {
      return NextResponse.json({ error: 'ClickUp API key is not configured' }, { status: 400 });
    }

    const task = await fetchClickUpTask(taskId, token);
    if (task.list.id !== CLICKUP_SCRIPT_BANK_LIST_ID) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `Task belongs to list ${task.list.id}`,
      });
    }

    const { tags, plainTextDescription, model, apiKeySource } = await generateGeminiScriptBankTags(task);
    const updates = await writeScriptBankTagsToClickUp(task.id, tags, token);

    return NextResponse.json({
      ok: true,
      taskId: task.id,
      listId: task.list.id,
      model,
      apiKeySource,
      plainTextDescription,
      tags,
      updates,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to auto-tag ClickUp task' },
      { status: 500 },
    );
  }
}
