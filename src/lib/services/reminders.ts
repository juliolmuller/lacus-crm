import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { spDateTime, spYmd } from '@/lib/followups/business-days';
import { snoozeDue, type SnoozePreset } from '@/lib/followups/snooze';
import { renderTemplate, templateValues } from '@/lib/followups/templates';
import { whatsappUrl } from '@/lib/leads/links';
import { cadence } from '@/lib/validation/followups';
import { getSetting } from './followup-settings';
import { logInteraction, type InteractionInput } from './interactions';
import { businessCalendar } from './rules';

const { reminders, leads, followupRules, messageTemplates, niches, regions } = schema;

export class ReminderError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'DO_NOT_CONTACT' | 'NOT_OPEN',
    message: string,
  ) {
    super(message);
  }
}

const pgMessage = (e: unknown) =>
  String((e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message);

export type ReminderInput = {
  leadId: string;
  dealId?: string | null;
  title: string;
  notes?: string | null;
  dueAt: Date;
  durationMin?: number;
  source?: 'manual' | 'mcp';
};

export async function createReminder(db: Db, input: ReminderInput) {
  try {
    // savepoint: o erro do trigger não aborta a transação do chamador
    const [r] = await db.transaction((tx) =>
      tx
        .insert(reminders)
        .values({
          leadId: input.leadId,
          dealId: input.dealId ?? null,
          title: input.title.trim(),
          notes: input.notes ?? null,
          dueAt: input.dueAt,
          durationMin: input.durationMin ?? 15,
          source: input.source ?? 'manual',
        })
        .returning(),
    );
    return r!;
  } catch (e) {
    if (pgMessage(e).includes('LEAD_DO_NOT_CONTACT'))
      throw new ReminderError('DO_NOT_CONTACT', 'Este lead está marcado como Não contatar.');
    throw e;
  }
}

async function lockOpen(tx: Db, id: string) {
  const [r] = await tx.select().from(reminders).where(eq(reminders.id, id)).for('update');
  if (!r) throw new ReminderError('NOT_FOUND', 'Lembrete não encontrado.');
  if (r.status !== 'open') throw new ReminderError('NOT_OPEN', 'Este lembrete já foi encerrado.');
  return r;
}

export async function updateReminder(
  db: Db,
  id: string,
  patch: Partial<Pick<ReminderInput, 'title' | 'notes' | 'dueAt' | 'durationMin'>>,
) {
  return db.transaction(async (tx) => {
    await lockOpen(tx, id);
    const [r] = await tx
      .update(reminders)
      .set({ ...patch, syncStatus: 'pending', syncAttempts: 0, syncError: null })
      .where(eq(reminders.id, id))
      .returning();
    return r!;
  });
}

export async function snoozeReminder(
  db: Db,
  id: string,
  to: SnoozePreset | { at: Date },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    await lockOpen(tx, id);
    const dueAt = typeof to === 'object' ? to.at : snoozeDue(to, now, await businessCalendar(tx));
    const [r] = await tx
      .update(reminders)
      .set({
        dueAt,
        snoozeCount: sql`${reminders.snoozeCount} + 1`,
        syncStatus: 'pending',
        syncAttempts: 0,
        syncError: null,
      })
      .where(eq(reminders.id, id))
      .returning();
    return r!;
  });
}

export async function cancelReminder(db: Db, id: string) {
  return db.transaction(async (tx) => {
    await lockOpen(tx, id);
    await tx
      .update(reminders)
      .set({ status: 'canceled', syncStatus: 'pending', syncAttempts: 0, syncError: null })
      .where(eq(reminders.id, id));
  });
}

/** Passo da cadência a que o lembrete pertence (`rule:{id}:step:{i}:anchor:…`). */
export const stepOf = (dedupeKey: string | null) => {
  const m = dedupeKey?.match(/^rule:(\d+):step:(\d+):/);
  return m ? { ruleId: Number(m[1]), index: Number(m[2]) } : null;
};

/**
 * Conclui o lembrete (opcionalmente registrando uma interação junto). Se era o último passo de uma
 * cadência marcada com `suggestStatus` e o lead segue sem resposta, devolve a sugestão.
 */
export async function completeReminder(
  db: Db,
  id: string,
  opts: { interaction?: Omit<InteractionInput, 'leadId' | 'dealId'> } = {},
) {
  return db.transaction(async (tx) => {
    const r = await lockOpen(tx, id);
    await tx
      .update(reminders)
      .set({
        status: 'done',
        completedAt: new Date(),
        syncStatus: 'pending',
        syncAttempts: 0,
        syncError: null,
      })
      .where(eq(reminders.id, id));
    const logged = opts.interaction
      ? await logInteraction(tx, { ...opts.interaction, leadId: r.leadId, dealId: r.dealId })
      : null;
    let suggestion: { leadId: string; status: 'no_response' } | null = null;
    const step = stepOf(r.dedupeKey);
    if (step) {
      const [rule] = await tx.select().from(followupRules).where(eq(followupRules.id, step.ruleId));
      const steps = cadence.safeParse(rule?.cadence);
      const [lead] = await tx.select().from(leads).where(eq(leads.id, r.leadId));
      if (
        steps.success &&
        step.index === steps.data.length - 1 &&
        steps.data[step.index]?.suggestStatus === 'no_response' &&
        lead?.contactStatus === 'contacted'
      )
        suggestion = { leadId: lead.id, status: 'no_response' };
    }
    return { reminderIds: logged?.reminderIds ?? [], suggestion };
  });
}

export type ReminderTab = 'overdue' | 'today' | 'upcoming' | 'done';

export const reminderRow = {
  id: reminders.id,
  leadId: reminders.leadId,
  dealId: reminders.dealId,
  title: reminders.title,
  notes: reminders.notes,
  dueAt: reminders.dueAt,
  durationMin: reminders.durationMin,
  status: reminders.status,
  source: reminders.source,
  syncStatus: reminders.syncStatus,
  syncError: reminders.syncError,
  dedupeKey: reminders.dedupeKey,
  completedAt: reminders.completedAt,
  leadName: leads.name,
  phone: leads.phoneE164,
  hasWhatsapp: leads.hasWhatsapp,
};
export type ReminderRow = Awaited<ReturnType<typeof listReminders>>['rows'][number];

/** Atrasados: venceram antes de agora; Hoje: o resto do dia em São Paulo; Próximos: dias seguintes. */
export async function listReminders(db: Db, tab: ReminderTab, now = new Date()) {
  const startTomorrow = spDateTime(
    new Date(Date.parse(`${spYmd(now)}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
    '00:00',
  );
  const where = {
    overdue: and(eq(reminders.status, 'open'), lt(reminders.dueAt, now)),
    today: and(
      eq(reminders.status, 'open'),
      gte(reminders.dueAt, now),
      lt(reminders.dueAt, startTomorrow),
    ),
    upcoming: and(eq(reminders.status, 'open'), gte(reminders.dueAt, startTomorrow)),
    done: eq(reminders.status, 'done'),
  }[tab];
  const rows = await db
    .select(reminderRow)
    .from(reminders)
    .innerJoin(leads, eq(leads.id, reminders.leadId))
    .where(where)
    .orderBy(tab === 'done' ? desc(reminders.completedAt) : asc(reminders.dueAt))
    .limit(tab === 'done' ? 50 : 200);
  const [c] = await db
    .select({
      overdue: sql<number>`count(*) filter (where ${reminders.dueAt} < ${now.toISOString()}::timestamptz)`,
      today: sql<number>`count(*) filter (where ${reminders.dueAt} >= ${now.toISOString()}::timestamptz and ${reminders.dueAt} < ${startTomorrow.toISOString()}::timestamptz)`,
    })
    .from(reminders)
    .where(eq(reminders.status, 'open'));
  return { rows, counts: { overdue: Number(c?.overdue ?? 0), today: Number(c?.today ?? 0) } };
}

/** Próximo vencimento aberto por lead (cartões do funil). */
export async function nextDueByLead(db: Db, leadIds: string[]) {
  if (!leadIds.length) return new Map<string, Date>();
  const rows = await db
    .select({ leadId: reminders.leadId, due: sql<Date>`min(${reminders.dueAt})` })
    .from(reminders)
    .where(and(eq(reminders.status, 'open'), inArray(reminders.leadId, leadIds)))
    .groupBy(reminders.leadId);
  return new Map(rows.map((r) => [r.leadId, new Date(r.due)]));
}

/**
 * Link do WhatsApp de cada lembrete: se o passo da cadência tem modelo e a mensagem renderiza sem
 * variáveis faltando, o texto vai junto (`?text=`); senão, abre a conversa em branco.
 */
export async function whatsappLinks(db: Db, rows: ReminderRow[], now = new Date()) {
  const out = new Map<string, string | null>();
  const withStep = rows.map((r) => ({ r, step: stepOf(r.dedupeKey) }));
  const ruleIds = [...new Set(withStep.flatMap((x) => (x.step ? [x.step.ruleId] : [])))];
  const rules = ruleIds.length
    ? await db.select().from(followupRules).where(inArray(followupRules.id, ruleIds))
    : [];
  const keyOf = (s: { ruleId: number; index: number } | null) => {
    if (!s) return undefined;
    const c = cadence.safeParse(rules.find((x) => x.id === s.ruleId)?.cadence);
    return c.success ? c.data[s.index]?.templateKey : undefined;
  };
  const keys = [...new Set(withStep.flatMap((x) => keyOf(x.step) ?? []))];
  const templates = keys.length
    ? await db.select().from(messageTemplates).where(inArray(messageTemplates.key, keys))
    : [];
  const profile = templates.length ? await getSetting(db, 'owner_profile') : {};
  for (const { r, step } of withStep) {
    const base = whatsappUrl(r.phone);
    const tpl = templates.find((t) => t.key === keyOf(step));
    let url = base;
    if (base && tpl) {
      const [x] = await db
        .select({ lead: leads, niche: niches, region: regions })
        .from(leads)
        .innerJoin(niches, eq(niches.id, leads.nicheId))
        .innerJoin(regions, eq(regions.id, leads.regionId))
        .where(eq(leads.id, r.leadId));
      if (x) {
        const m = renderTemplate(tpl.body, templateValues(x.lead, x.niche, x.region, profile), now);
        if (!m.blocked) url = whatsappUrl(r.phone, m.text);
      }
    }
    out.set(r.id, url);
  }
  return out;
}
