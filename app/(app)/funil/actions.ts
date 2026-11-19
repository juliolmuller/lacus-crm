'use server';

import { z } from 'zod';
import { fail, type Result } from '@/lib/action-result';
import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { lossReasons } from '@/lib/funnel/status-sync';
import { parseContactDate, parseDate, parseNumber } from '@/lib/leads/csv';
import { createDeal, loseDeal, moveDeal, updateDeal, winDeal } from '@/lib/services/deals';
import { logInteraction } from '@/lib/services/interactions';

/** "1.500,00" → "1500.00"; vazio → null. */
const money = (s: string) => (s.trim() ? parseNumber(s).toFixed(2) : null);
const uuid = z.string().uuid();

/** Erros de parse de data/número (mensagem já em pt-BR) vão para o usuário; o resto, para o log. */
const formError = (e: unknown) =>
  e instanceof Error && /inválid|inexistente/.test(e.message)
    ? { ok: false as const, error: e.message }
    : fail(e);

const moveSchema = z.object({
  dealId: uuid,
  stageId: z.number().int(),
  prevId: uuid.nullable(),
  nextId: uuid.nullable(),
});

export async function moveDealAction(input: unknown): Promise<Result<{ reminders: number }>> {
  await requireOwner();
  const p = moveSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Movimento inválido' };
  try {
    const r = await moveDeal(getDb(), p.data);
    return { ok: true, reminders: r.reminderIds.length };
  } catch (e) {
    return fail(e);
  }
}

export async function winDealAction(dealId: string, value: string, date: string): Promise<Result> {
  await requireOwner();
  try {
    await winDeal(getDb(), {
      dealId: uuid.parse(dealId),
      value: money(value),
      wonAt: date ? parseContactDate(parseDate(date)) : undefined,
    });
    return { ok: true };
  } catch (e) {
    return formError(e);
  }
}

export async function loseDealAction(
  dealId: string,
  reason: string,
  note: string,
): Promise<Result> {
  await requireOwner();
  const p = z
    .object({ dealId: uuid, reason: z.enum(lossReasons), note: z.string().max(500) })
    .safeParse({ dealId, reason, note });
  if (!p.success) return { ok: false, error: 'Escolha o motivo da perda' };
  try {
    await loseDeal(getDb(), p.data);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createDealAction(leadId: string): Promise<Result<{ id: string }>> {
  await requireOwner();
  try {
    const d = await createDeal(getDb(), { leadId: uuid.parse(leadId), source: 'ui' });
    return { ok: true, id: d.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateDealAction(id: string, fd: FormData): Promise<Result> {
  await requireOwner();
  const f = (k: string) => String(fd.get(k) ?? '').trim();
  try {
    const probability = f('probability');
    await updateDeal(getDb(), uuid.parse(id), {
      title: f('title') || undefined,
      value: money(f('value')),
      probability: probability
        ? Math.min(100, Math.max(0, Math.round(parseNumber(probability))))
        : null,
      serviceType: f('serviceType') || null,
      expectedCloseOn: f('expectedCloseOn') ? parseDate(f('expectedCloseOn')) : null,
      notes: f('notes') || null,
    });
    return { ok: true };
  } catch (e) {
    return formError(e);
  }
}

const interactionSchema = z.object({
  leadId: uuid,
  type: z.enum([
    'whatsapp',
    'call',
    'email',
    'instagram_dm',
    'in_person',
    'meeting',
    'proposal',
    'note',
  ]),
  direction: z.enum(['outbound', 'inbound', 'internal']),
  outcome: z
    .enum([
      'no_answer',
      'replied',
      'interested',
      'not_interested',
      'asked_later',
      'meeting_set',
      'proposal_requested',
      'opt_out',
    ])
    .nullable(),
  summary: z.string().trim().min(1, 'Descreva a interação').max(300),
  body: z.string().trim().max(5000).nullable(),
});

/** Criação rápida de interação (drawer do lead e da negociação). */
export async function logInteractionAction(input: unknown): Promise<Result> {
  await requireOwner();
  const p = interactionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Dados inválidos' };
  try {
    await logInteraction(getDb(), { ...p.data, createdBy: 'user' });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
