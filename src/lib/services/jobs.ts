import { and, eq, gte, lt, notExists, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { addBusinessDays, spDateTime, spYmd } from '@/lib/followups/business-days';
import { syncReminders, type SyncContext } from './calendar-sync';
import { applyRules, businessCalendar } from './rules';

const { jobRuns, reminders, deals, dealStageHistory, interactions, prospectingQueue, leads } =
  schema;

const STALLED_DAYS = 10;
const REPLAY_HOURS = 48;
const LEASE_MINUTES = 30;

/** Reaplica regras de eventos recentes (só cria; `dedupe_key` evita duplicatas). */
async function reapplyRules(db: Db, now: Date) {
  const since = new Date(now.getTime() - REPLAY_HOURS * 3_600_000);
  let n = 0;
  const inters = await db.select().from(interactions).where(gte(interactions.createdAt, since));
  for (const i of inters)
    n += (
      await db.transaction((tx) =>
        applyRules(
          tx,
          { type: 'interaction_logged', interactionId: i.id, leadId: i.leadId, dealId: i.dealId },
          { replay: true, now },
        ),
      )
    ).length;
  const hist = await db
    .select({ h: dealStageHistory, leadId: deals.leadId })
    .from(dealStageHistory)
    .innerJoin(deals, eq(deals.id, dealStageHistory.dealId))
    .where(and(gte(dealStageHistory.movedAt, since), eq(deals.status, 'open')));
  for (const { h, leadId } of hist)
    n += (
      await db.transaction((tx) =>
        applyRules(
          tx,
          {
            type: h.fromStageId == null ? 'deal_created' : 'deal_stage_entered',
            dealId: h.dealId,
            leadId,
            stageId: h.toStageId,
            fromStageId: h.fromStageId,
            historyId: h.id,
            source: h.source,
          },
          { replay: true, now },
        ),
      )
    ).length;
  return n;
}

/** "Negociação parada": aberta há mais de 10 dias úteis na mesma etapa e sem lembrete aberto. */
async function createStalled(db: Db, now: Date) {
  const cal = await businessCalendar(db);
  const today = spYmd(now);
  // folga de calendário (10 dias úteis < 10 dias corridos); o corte exato é feito em dias úteis abaixo
  const candidates = await db
    .select({ d: deals })
    .from(deals)
    .innerJoin(leads, eq(leads.id, deals.leadId))
    .where(
      and(
        eq(deals.status, 'open'),
        eq(leads.doNotContact, false),
        lt(deals.stageEnteredAt, new Date(now.getTime() - STALLED_DAYS * 86_400_000)),
        notExists(
          db
            .select({ one: sql`1` })
            .from(reminders)
            .where(and(eq(reminders.dealId, deals.id), eq(reminders.status, 'open'))),
        ),
      ),
    );
  let n = 0;
  for (const { d } of candidates) {
    if (addBusinessDays(spYmd(d.stageEnteredAt), STALLED_DAYS, cal) >= today) continue;
    const created = await db
      .insert(reminders)
      .values({
        leadId: d.leadId,
        dealId: d.id,
        title: 'Destravar negociação',
        dueAt: spDateTime(addBusinessDays(today, 1, cal), '09:30'),
        source: 'rule',
        // uma vez por permanência na etapa
        dedupeKey: `stalled:${d.id}:${d.stageEnteredAt.toISOString()}`,
      })
      .onConflictDoNothing({ target: reminders.dedupeKey })
      .returning({ id: reminders.id });
    n += created.length;
  }
  return n;
}

/** Leases da fila vencidos (30 min) voltam a ficar livres. */
async function releaseLeases(db: Db, now: Date) {
  const freed = await db
    .update(prospectingQueue)
    .set({ claimedAt: null })
    .where(
      and(
        eq(prospectingQueue.status, 'pending'),
        lt(prospectingQueue.claimedAt, new Date(now.getTime() - LEASE_MINUTES * 60_000)),
      ),
    )
    .returning({ p: prospectingQueue.position });
  return freed.length;
}

/**
 * Job `followups` (SPEC 11). Idempotente por `executionId` (`ce-id` dos Schedules ou `X-Run-Id`):
 * a segunda chamada com o mesmo id não faz nada. Cada etapa falha isoladamente.
 */
export async function runFollowupsJob(
  db: Db,
  ctx: SyncContext,
  opts: { executionId?: string | null; now?: Date } = {},
) {
  const now = opts.now ?? new Date();
  const [run] = await db
    .insert(jobRuns)
    .values({ job: 'followups', executionId: opts.executionId ?? null })
    .onConflictDoNothing({ target: jobRuns.executionId })
    .returning();
  if (!run) return { duplicate: true as const };

  const stats: Record<string, unknown> = {};
  const errors: string[] = [];
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      stats[name] = await fn();
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  await step('reapplied', () => reapplyRules(db, now));
  await step('stalled', () => createStalled(db, now));
  await step('sync', () => syncReminders(db, ctx, { mode: 'job', now }));
  await step('leasesReleased', () => releaseLeases(db, now));
  await db
    .update(jobRuns)
    .set({
      finishedAt: new Date(),
      status: errors.length ? 'error' : 'ok',
      stats,
      error: errors.join('; ') || null,
    })
    .where(eq(jobRuns.id, run.id));
  return { duplicate: false as const, status: errors.length ? 'error' : 'ok', stats, errors };
}
