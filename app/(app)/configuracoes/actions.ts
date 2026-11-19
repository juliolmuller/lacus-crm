'use server';

import { fail, type Result } from '@/lib/action-result';
import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import {
  archiveStage,
  createStage,
  reorderStages,
  stageInput,
  updateStage,
} from '@/lib/services/stages';

export async function saveStageAction(id: number | null, input: unknown): Promise<Result> {
  await requireOwner();
  const p = stageInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Dados inválidos' };
  try {
    if (id) await updateStage(getDb(), id, p.data);
    else await createStage(getDb(), p.data);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveStageAction(id: number, archived: boolean): Promise<Result> {
  await requireOwner();
  try {
    await archiveStage(getDb(), id, archived);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reorderStagesAction(ids: number[]): Promise<Result> {
  await requireOwner();
  try {
    await reorderStages(getDb(), ids);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
