import { and, eq, inArray, isNotNull, like } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { planFollowups, type FollowupEvent, type RuleRow } from '@/lib/followups/engine';
import { cadence, cancelOn } from '@/lib/validation/followups';
import { parseSetting, settingDefaults } from '@/lib/validation/settings';

const { followupRules, interactions, leads, reminders, settings } = schema;

type Source = 'ui' | 'mcp' | 'rule' | 'import';

export type RuleEvent =
  | {
      type: 'deal_created';
      dealId: string;
      leadId: string;
      stageId: number;
      historyId?: number;
      source?: Source;
    }
  | {
      type: 'deal_stage_entered';
      dealId: string;
      leadId: string;
      stageId: number;
      fromStageId: number | null;
      historyId?: number;
      source?: Source;
    }
  | {
      type: 'interaction_logged';
      interactionId: string;
      leadId: string;
      dealId: string | null;
      /** data da reunião (AAAA-MM-DD) e "retomar em N dias úteis", informados na interação */
      meetingOn?: string;
      resumeInDays?: number;
    };

export async function loadRules(db: Db): Promise<RuleRow[]> {
  const rows = await db
    .select()
    .from(followupRules)
    .where(eq(followupRules.active, true))
    .orderBy(followupRules.sort, followupRules.id);
  return rows.flatMap((r) => {
    const c = cadence.safeParse(r.cadence);
    const o = cancelOn.safeParse(r.cancelOn);
    return c.success && o.success ? [{ ...r, cadence: c.data, cancelOn: o.data }] : [];
  });
}

export async function businessCalendar(db: Db) {
  const [row] = await db.select().from(settings).where(eq(settings.key, 'business_calendar'));
  return parseSetting('business_calendar', row?.value ?? settingDefaults.business_calendar);
}

/**
 * Motor de follow-ups (SPEC 11): na mesma transação do evento, cancela lembretes (cancel_on e
 * cadência substituída) e cria os novos, com `dedupe_key` (reaplicar não duplica). Devolve os ids
 * criados. Eventos da importação e leads "Não contatar" não geram nada. `replay` (job) só cria.
 */
export async function applyRules(
  tx: Db,
  event: RuleEvent,
  opts: { replay?: boolean; now?: Date } = {},
): Promise<string[]> {
  const [lead] = await tx.select().from(leads).where(eq(leads.id, event.leadId));
  if (!lead || lead.doNotContact) return [];
  const now = opts.now ?? new Date();

  let fe: FollowupEvent;
  if (event.type === 'interaction_logged') {
    const [i] = await tx
      .select()
      .from(interactions)
      .where(eq(interactions.id, event.interactionId));
    if (!i || i.createdBy === 'import') return [];
    fe = {
      kind: 'interaction_logged',
      anchor: i.id,
      dealId: event.dealId,
      type: i.type,
      direction: i.direction,
      outcome: i.outcome,
      at: i.occurredAt,
      now,
      leadStatus: lead.contactStatus,
      meetingOn: event.meetingOn,
      resumeInDays: event.resumeInDays,
    };
  } else {
    if (event.source === 'import') return [];
    fe = {
      kind: event.type,
      anchor: String(event.historyId ?? event.dealId),
      dealId: event.dealId,
      stageId: event.stageId,
      at: now,
    };
  }

  const rules = await loadRules(tx);
  const open = await tx
    .select({ id: reminders.id, ruleId: reminders.ruleId, dealId: reminders.dealId })
    .from(reminders)
    .where(
      and(eq(reminders.leadId, lead.id), eq(reminders.status, 'open'), isNotNull(reminders.ruleId)),
    );
  const keys = await tx
    .select({ k: reminders.dedupeKey })
    .from(reminders)
    .where(and(eq(reminders.leadId, lead.id), like(reminders.dedupeKey, 'rule:%')));
  const plan = planFollowups({
    event: fe,
    rules,
    open,
    existingKeys: new Set(keys.flatMap((x) => (x.k ? [x.k] : []))),
    calendar: await businessCalendar(tx),
    replay: opts.replay,
  });

  if (plan.cancel.length)
    await tx
      .update(reminders)
      .set({ status: 'canceled', syncStatus: 'pending' })
      .where(inArray(reminders.id, plan.cancel));
  if (!plan.create.length) return [];
  const created = await tx
    .insert(reminders)
    .values(
      plan.create.map((p) => ({
        leadId: lead.id,
        dealId: fe.dealId,
        title: p.title,
        dueAt: p.dueAt,
        source: 'rule' as const,
        ruleId: p.ruleId,
        dedupeKey: p.dedupeKey,
      })),
    )
    .onConflictDoNothing({ target: reminders.dedupeKey })
    .returning({ id: reminders.id });
  return created.map((c) => c.id);
}
