'use server';

import { ZodError } from 'zod';
import { fail, type Result } from '@/lib/action-result';
import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { syncContext } from '@/lib/google/context';
import { revokeGoogleToken } from '@/lib/google/oauth';
import { disconnectGoogle, resyncAll } from '@/lib/services/calendar-sync';
import {
  deleteRule,
  deleteTemplate,
  ruleInput,
  saveRule,
  saveSetting,
  saveTemplate,
  templateInput,
} from '@/lib/services/followup-settings';
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

const zerr = (e: unknown) =>
  e instanceof ZodError
    ? { ok: false as const, error: e.issues[0]?.message ?? 'Dados inválidos' }
    : fail(e);

export async function saveRuleAction(id: number | null, input: unknown): Promise<Result> {
  await requireOwner();
  try {
    await saveRule(getDb(), id, ruleInput.parse(input));
    return { ok: true };
  } catch (e) {
    return zerr(e);
  }
}

export async function deleteRuleAction(id: number): Promise<Result> {
  await requireOwner();
  try {
    await deleteRule(getDb(), id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveTemplateAction(id: number | null, input: unknown): Promise<Result> {
  await requireOwner();
  try {
    await saveTemplate(getDb(), id, templateInput.parse(input));
    return { ok: true };
  } catch (e) {
    // chave repetida
    if (String((e as { cause?: { code?: string } }).cause?.code) === '23505')
      return { ok: false, error: 'Já existe um modelo com essa chave' };
    return zerr(e);
  }
}

export async function deleteTemplateAction(id: number): Promise<Result> {
  await requireOwner();
  try {
    await deleteTemplate(getDb(), id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveProfileAction(input: unknown): Promise<Result> {
  await requireOwner();
  try {
    await saveSetting(getDb(), 'owner_profile', input);
    return { ok: true };
  } catch (e) {
    return zerr(e);
  }
}

export async function saveCalendarDefaultsAction(minutes: number[]): Promise<Result> {
  await requireOwner();
  try {
    await saveSetting(getDb(), 'calendar_defaults', { popupReminderMinutes: minutes });
    return { ok: true };
  } catch (e) {
    return zerr(e);
  }
}

export async function disconnectGoogleAction(): Promise<Result> {
  await requireOwner();
  try {
    const ctx = syncContext();
    await disconnectGoogle(getDb(), revokeGoogleToken, ctx.keys);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resyncGoogleAction(): Promise<
  Result<{ synced: number; deleted: number; errors: number }>
> {
  await requireOwner();
  try {
    const s = await resyncAll(getDb(), syncContext());
    return { ok: true, synced: s.synced, deleted: s.deleted, errors: s.errors };
  } catch (e) {
    return fail(e);
  }
}
