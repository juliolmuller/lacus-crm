'use server';

import { z } from 'zod';

import { fail, type Result } from '@/lib/action-result';
import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { spDateTime } from '@/lib/followups/business-days';
import { snoozeDue, snoozePresets } from '@/lib/followups/snooze';
import { syncAfterResponse, syncContext } from '@/lib/google/context';
import { interactionTypes, outcomeLabel } from '@/lib/leads/labels';
import { syncReminders } from '@/lib/services/calendar-sync';
import { updateLead } from '@/lib/services/leads';
import {
  cancelReminder,
  completeReminder,
  createReminder,
  snoozeReminder,
  updateReminder,
} from '@/lib/services/reminders';
import { businessCalendar } from '@/lib/services/rules';

const uuid = z.string().uuid();
// "2026-11-20T09:30" (datetime-local) é sempre horário de São Paulo
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Data e hora inválidas');
const when = z.union([z.enum(snoozePresets), z.object({ at: localDateTime })]);
type When = z.infer<typeof when>;

const toDate = async (w: When): Promise<Date> =>
  typeof w === 'string'
    ? snoozeDue(w, new Date(), await businessCalendar(getDb()))
    : spDateTime(w.at.slice(0, 10), w.at.slice(11, 16));

const bad = (e: z.ZodError): { error: string; ok: false } => ({
  ok: false as const,
  error: e.issues[0]?.message ?? 'Dados inválidos',
});

export async function createReminderAction(input: unknown): Promise<Result> {
  await requireOwner();

  const p = z
    .object({
      leadId: uuid,
      dealId: uuid.nullable().optional(),
      title: z.string().trim().min(2, 'Dê um título ao lembrete').max(200),
      notes: z.string().optional(),
      when,
    })
    .safeParse(input);

  if (!p.success) return bad(p.error);

  try {
    await createReminder(getDb(), {
      leadId: p.data.leadId,
      dealId: p.data.dealId,
      title: p.data.title,
      notes: p.data.notes?.trim() || null,
      dueAt: await toDate(p.data.when),
    });
    syncAfterResponse();

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const interaction = z.object({
  type: z.enum(interactionTypes),
  direction: z.enum(['outbound', 'inbound', 'internal']),
  outcome: z.enum(Object.keys(outcomeLabel) as [keyof typeof outcomeLabel]).nullable(),
  summary: z.string().trim().min(2, 'Resuma a interação').max(300),
  body: z.string().trim().max(5000).nullable().optional(),
  meetingOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  resumeInDays: z.number().int().min(1).max(250).optional(),
});

export async function completeReminderAction(
  id: string,
  input: unknown,
): Promise<Result<{ created: number; suggestion: { leadId: string } | null }>> {
  await requireOwner();

  const p = z.object({ interaction: interaction.nullable() }).safeParse(input);

  if (!uuid.safeParse(id).success || !p.success) return { ok: false, error: 'Dados inválidos' };

  try {
    const r = await completeReminder(getDb(), id, { interaction: p.data.interaction ?? undefined });

    syncAfterResponse();

    return { ok: true, suggestion: r.suggestion, created: r.reminderIds.length };
  } catch (e) {
    return fail(e);
  }
}

export async function snoozeReminderAction(id: string, to: unknown): Promise<Result> {
  await requireOwner();

  const p = when.safeParse(to);

  if (!uuid.safeParse(id).success || !p.success) return { ok: false, error: 'Dados inválidos' };

  try {
    await snoozeReminder(
      getDb(),
      id,
      typeof p.data === 'string' ? p.data : { at: await toDate(p.data) },
    );
    syncAfterResponse();

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateReminderAction(id: string, input: unknown): Promise<Result> {
  await requireOwner();

  const p = z
    .object({
      title: z.string().trim().min(2, 'Dê um título ao lembrete').max(200),
      notes: z.string(),
      at: localDateTime,
    })
    .safeParse(input);

  if (!uuid.safeParse(id).success || !p.success)
    return p.success ? { ok: false, error: 'Dados inválidos' } : bad(p.error);

  try {
    await updateReminder(getDb(), id, {
      title: p.data.title,
      notes: p.data.notes.trim() || null,
      dueAt: await toDate({ at: p.data.at }),
    });
    syncAfterResponse();

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelReminderAction(id: string): Promise<Result> {
  await requireOwner();

  try {
    await cancelReminder(getDb(), uuid.parse(id));
    syncAfterResponse();

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Sugestão depois do 3º follow-up sem resposta (SPEC 11).
 */
export async function markNoResponseAction(leadId: string): Promise<Result> {
  await requireOwner();

  try {
    await updateLead(getDb(), uuid.parse(leadId), { contactStatus: 'no_response' });

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * "Tentar de novo" do status de sincronização: roda o outbox na hora.
 */
export async function syncNowAction(): Promise<Result<{ errors: number; synced: number }>> {
  await requireOwner();

  try {
    const s = await syncReminders(getDb(), syncContext(), { mode: 'job' });

    return { ok: true, synced: s.synced + s.deleted, errors: s.errors };
  } catch (e) {
    return fail(e);
  }
}
