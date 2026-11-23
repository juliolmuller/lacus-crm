'use server';

import { z, ZodError } from 'zod';

import { fail, type Result } from '@/lib/action-result';
import { requireOwner } from '@/lib/auth/dal';
import { SCOPES } from '@/lib/auth/mcp-resources';
import { getDb } from '@/lib/db';
import { syncContext } from '@/lib/google/context';
import { revokeGoogleToken } from '@/lib/google/oauth';
import { disconnectGoogle, resyncAll } from '@/lib/services/calendar-sync';
import { revokeConnector } from '@/lib/services/connectors';
import {
  deleteRule,
  deleteTemplate,
  ruleInput,
  saveRule,
  saveSetting,
  saveTemplate,
  templateInput,
} from '@/lib/services/followup-settings';
import { recomputeAllScores } from '@/lib/services/leads';
import { previewBandChanges, saveScoreSettings } from '@/lib/services/score-settings';
import {
  archiveStage,
  createStage,
  reorderStages,
  stageInput,
  updateStage,
} from '@/lib/services/stages';
import { createToken, revokeToken } from '@/lib/services/tokens';
import { scoreThresholds, scoreWeights } from '@/lib/validation/settings';

export async function saveStageAction(id: null | number, input: unknown): Promise<Result> {
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

const zerr = (e: unknown): { error: string; ok: false } =>
  e instanceof ZodError
    ? { ok: false as const, error: e.issues[0]?.message ?? 'Dados inválidos' }
    : fail(e);

export async function saveRuleAction(id: null | number, input: unknown): Promise<Result> {
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

export async function saveTemplateAction(id: null | number, input: unknown): Promise<Result> {
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
  Result<{ deleted: number; errors: number; synced: number }>
> {
  await requireOwner();

  try {
    const s = await resyncAll(getDb(), syncContext());

    return { ok: true, synced: s.synced, deleted: s.deleted, errors: s.errors };
  } catch (e) {
    return fail(e);
  }
}

const tokenInput = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao token').max(80),
  scopes: z.array(z.enum(SCOPES)).min(1, 'Escolha ao menos um escopo'),
  expiresInDays: z.number().int().min(1).max(3650).nullable(),
});

/**
 * Devolve o token completo só desta vez; no banco fica apenas o hash.
 */
export async function createTokenAction(input: unknown): Promise<Result<{ token: string }>> {
  await requireOwner();

  try {
    const p = tokenInput.parse(input);
    const { token } = await createToken(getDb(), {
      name: p.name,
      scopes: p.scopes,
      expiresAt: p.expiresInDays ? new Date(Date.now() + p.expiresInDays * 86_400_000) : null,
    });

    return { ok: true, token };
  } catch (e) {
    return zerr(e);
  }
}

export async function revokeTokenAction(id: string): Promise<Result> {
  await requireOwner();

  try {
    await revokeToken(getDb(), id);

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeConnectorAction(clientId: string): Promise<Result> {
  await requireOwner();

  try {
    await revokeConnector(getDb(), clientId);

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const scoreInput = z.object({ weights: scoreWeights, thresholds: scoreThresholds });

export async function previewScoreAction(
  input: unknown,
): Promise<Result<{ changed: number; total: number }>> {
  await requireOwner();

  const p = scoreInput.safeParse(input);

  if (!p.success) return { ok: false, error: 'Valores inválidos' };

  try {
    return { ok: true, ...(await previewBandChanges(getDb(), p.data)) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveScoreAction(input: unknown): Promise<Result> {
  await requireOwner();

  try {
    await saveScoreSettings(getDb(), scoreInput.parse(input));

    return { ok: true };
  } catch (e) {
    return e instanceof Error && !(e instanceof ZodError)
      ? { ok: false, error: e.message }
      : zerr(e);
  }
}

/**
 * Recalcula o score de todos os leads (lotes de 500 por transação).
 */
export async function recomputeScoresAction(): Promise<Result<{ changed: number }>> {
  await requireOwner();

  try {
    return { ok: true, changed: await recomputeAllScores(getDb()) };
  } catch (e) {
    return fail(e);
  }
}
