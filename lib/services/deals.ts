import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { keyBetween, needsRebalance, rebalanceKeys } from '@/lib/funnel/fractional';
import { DNC_REASON, syncedStatus } from '@/lib/funnel/status-sync';
import type { ContactStatus } from '@/lib/leads/labels';
import { applyRules } from './rules';
import { setDoNotContact } from './leads';

const { deals, dealStages, dealStageHistory, leads, niches, regions, interactions, reminders } =
  schema;

type Source = 'ui' | 'mcp' | 'rule' | 'import';
export type Deal = typeof deals.$inferSelect;
export type Stage = typeof dealStages.$inferSelect;

export class DealError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'STAGE_NOT_FOUND' | 'DO_NOT_CONTACT' | 'OPEN_EXISTS' | 'USE_CLOSE',
    message: string,
  ) {
    super(message);
  }
}

/** PLAN D4: etapa equivalente ao status do lead. `discarded` não vira negociação. */
export const stageKeyForStatus = (s: ContactStatus) =>
  (
    ({
      new: 'to_diagnose',
      to_contact: 'to_diagnose',
      contacted: 'contacted',
      no_response: 'contacted',
      replied: 'talking',
      negotiating: 'negotiating',
      client: 'won',
      lost: 'lost',
      discarded: null,
    }) as const
  )[s];

const pgCode = (e: unknown) =>
  ((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) as
    string | undefined;
const pgMessage = (e: unknown) =>
  String((e as { cause?: { message?: string } }).cause?.message ?? (e as Error).message);

/** Traduz os erros do banco que a interface precisa explicar. */
function translate(e: unknown): never {
  if (pgMessage(e).includes('LEAD_DO_NOT_CONTACT'))
    throw new DealError('DO_NOT_CONTACT', 'Este lead está marcado como Não contatar.');
  if (pgCode(e) === '23505')
    throw new DealError('OPEN_EXISTS', 'Este lead já tem uma negociação aberta.');
  throw e;
}

async function stageBy(db: Db, where: ReturnType<typeof eq>) {
  const [s] = await db.select().from(dealStages).where(where);
  if (!s) throw new DealError('STAGE_NOT_FOUND', 'Etapa não encontrada.');
  return s;
}

const closedStage = async (db: Db, kind: 'won' | 'lost') => {
  const [s] = await db
    .select()
    .from(dealStages)
    .where(
      and(
        eq(kind === 'won' ? dealStages.isWon : dealStages.isLost, true),
        isNull(dealStages.archivedAt),
      ),
    )
    .orderBy(asc(dealStages.sort))
    .limit(1);
  if (!s) throw new DealError('STAGE_NOT_FOUND', 'Etapa não encontrada.');
  return s;
};

async function lockDeal(tx: Db, id: string) {
  const [d] = await tx.select().from(deals).where(eq(deals.id, id)).for('update');
  if (!d) throw new DealError('NOT_FOUND', 'Negociação não encontrada.');
  return d;
}

/** Entrar numa etapa define o status do lead, só para frente (PLAN D3). */
async function syncLeadStatus(tx: Db, leadId: string, stage: Stage, force = false) {
  const [lead] = await tx
    .select({ status: leads.contactStatus })
    .from(leads)
    .where(eq(leads.id, leadId));
  const next = lead && syncedStatus(lead.status, stage.leadStatus, force);
  if (next)
    await tx
      .update(leads)
      .set({ contactStatus: next, contactStatusChangedAt: new Date() })
      .where(eq(leads.id, leadId));
}

/** Reescreve as chaves da coluna (abertas) mantendo a ordem. */
async function rebalance(tx: Db, stageId: number) {
  const rows = await tx
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.stageId, stageId))
    .orderBy(asc(deals.position));
  const keys = rebalanceKeys(rows.length);
  for (const [i, r] of rows.entries())
    await tx.update(deals).set({ position: keys[i]! }).where(eq(deals.id, r.id));
}

const positionOf = async (tx: Db, id: string | null | undefined, stageId: number) => {
  if (!id) return null;
  const [r] = await tx
    .select({ p: deals.position })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.stageId, stageId)));
  return r?.p ?? null;
};

async function lastPosition(tx: Db, stageId: number, exceptId?: string) {
  const [last] = await tx
    .select({ position: deals.position })
    .from(deals)
    .where(and(eq(deals.stageId, stageId), exceptId ? ne(deals.id, exceptId) : undefined))
    .orderBy(desc(deals.position))
    .limit(1);
  return last?.position ?? null;
}

/** Posição entre os vizinhos `prevId` (acima) e `nextId` (abaixo); sem vizinhos, vai para o fim. */
async function positionBetween(
  tx: Db,
  stageId: number,
  dealId: string,
  prevId?: string | null,
  nextId?: string | null,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let prev = await positionOf(tx, prevId, stageId);
    const next = await positionOf(tx, nextId, stageId);
    if (prev === null && next === null) prev = await lastPosition(tx, stageId, dealId);
    const key = keyBetween(prev, next);
    if (key) return key;
    await rebalance(tx, stageId); // vizinhos fora de ordem ou iguais
  }
  return keyBetween(await lastPosition(tx, stageId, dealId), null)!;
}

type Neighbors = { prevId?: string | null; nextId?: string | null };

/** Cria a negociação (padrão: A diagnosticar), no fim da etapa, com histórico e sincronia de status. */
export async function createDeal(
  db: Db,
  input: {
    leadId: string;
    title?: string;
    stageKey?: string;
    value?: string | null;
    serviceType?: string | null;
    source: Source;
  },
) {
  return db.transaction(async (tx) => {
    const stage = await stageBy(tx, eq(dealStages.key, input.stageKey ?? 'to_diagnose'));
    const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId));
    if (!lead) throw new DealError('NOT_FOUND', 'Lead não encontrado.');
    if (lead.doNotContact)
      throw new DealError('DO_NOT_CONTACT', 'Este lead está marcado como Não contatar.');
    const closed = stage.isWon || stage.isLost;
    if (!closed) {
      const [open] = await tx
        .select({ id: deals.id })
        .from(deals)
        .where(and(eq(deals.leadId, lead.id), eq(deals.status, 'open')))
        .limit(1);
      if (open) throw new DealError('OPEN_EXISTS', 'Este lead já tem uma negociação aberta.');
    }
    const now = new Date();
    let deal: Deal;
    try {
      // savepoint: um erro do trigger/índice não aborta a transação do chamador
      [deal] = (await tx.transaction(async (sp) =>
        sp
          .insert(deals)
          .values({
            leadId: lead.id,
            stageId: stage.id,
            title: input.title?.trim() || lead.name,
            position: keyBetween(await lastPosition(sp, stage.id), null)!,
            value: input.value ?? null,
            serviceType: input.serviceType ?? null,
            probability: stage.defaultProbability,
            status: stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open',
            wonAt: stage.isWon ? now : null,
            lostAt: stage.isLost ? now : null,
          })
          .returning(),
      )) as [Deal];
    } catch (e) {
      translate(e);
    }
    const [hist] = await tx
      .insert(dealStageHistory)
      .values({ dealId: deal.id, fromStageId: null, toStageId: stage.id, source: input.source })
      .returning({ id: dealStageHistory.id });
    // a importação respeita o status que veio da planilha
    if (input.source !== 'import') await syncLeadStatus(tx, lead.id, stage);
    await applyRules(tx, {
      type: 'deal_created',
      dealId: deal.id,
      leadId: lead.id,
      stageId: stage.id,
      historyId: hist!.id,
      source: input.source,
    });
    return deal;
  });
}

/** Move/reordena uma negociação aberta (ou reabre uma encerrada) para uma etapa aberta. */
export async function moveDeal(
  db: Db,
  input: { dealId: string; stageId: number; source?: Source } & Neighbors,
) {
  return db.transaction(async (tx) => {
    const to = await stageBy(tx, eq(dealStages.id, input.stageId));
    if (to.isWon || to.isLost)
      throw new DealError('USE_CLOSE', 'Use o diálogo de Ganho ou Perdido.');
    const deal = await lockDeal(tx, input.dealId);
    return moveTx(tx, deal, to, input, input.source ?? 'ui');
  });
}

async function moveTx(tx: Db, deal: Deal, to: Stage, n: Neighbors, source: Source) {
  const changedStage = deal.stageId !== to.id;
  const reopened = deal.status !== 'open';
  const position = await positionBetween(tx, to.id, deal.id, n.prevId, n.nextId);
  let updated: Deal;
  try {
    [updated] = (await tx.transaction(async (sp) =>
      sp
        .update(deals)
        .set({
          stageId: to.id,
          position,
          ...(changedStage
            ? { stageEnteredAt: new Date(), probability: to.defaultProbability }
            : {}),
          ...(reopened ? { status: 'open', wonAt: null, lostAt: null, lostReason: null } : {}),
        })
        .where(eq(deals.id, deal.id))
        .returning(),
    )) as [Deal];
  } catch (e) {
    translate(e);
  }
  if (needsRebalance(position)) await rebalance(tx, to.id);
  let reminderIds: string[] = [];
  if (changedStage) {
    const [hist] = await tx
      .insert(dealStageHistory)
      .values({ dealId: deal.id, fromStageId: deal.stageId, toStageId: to.id, source })
      .returning({ id: dealStageHistory.id });
    await syncLeadStatus(tx, deal.leadId, to, reopened);
    reminderIds = await applyRules(tx, {
      type: 'deal_stage_entered',
      dealId: deal.id,
      leadId: deal.leadId,
      stageId: to.id,
      fromStageId: deal.stageId,
      historyId: hist!.id,
      source,
    });
  }
  return { deal: updated, fromStageId: deal.stageId, changedStage, reminderIds };
}

/** Efeito do D3 numa interação: leva a negociação aberta para `stageKey`, se ela ainda estiver antes. */
export async function advanceOpenDeal(tx: Db, leadId: string, stageKey: string) {
  const [open] = await tx
    .select({ deal: deals, sort: dealStages.sort })
    .from(deals)
    .innerJoin(dealStages, eq(dealStages.id, deals.stageId))
    .where(and(eq(deals.leadId, leadId), eq(deals.status, 'open')));
  const [target] = await tx.select().from(dealStages).where(eq(dealStages.key, stageKey));
  if (!open || !target || open.sort >= target.sort) return;
  await moveTx(tx, open.deal, target, {}, 'rule');
}

async function closeTx(
  tx: Db,
  deal: Deal,
  kind: 'won' | 'lost',
  patch: Partial<typeof deals.$inferInsert>,
) {
  const stage = await closedStage(tx, kind);
  const changedStage = deal.stageId !== stage.id;
  const now = new Date();
  const [updated] = await tx
    .update(deals)
    .set({
      stageId: stage.id,
      status: kind,
      position: keyBetween(await lastPosition(tx, stage.id, deal.id), null)!,
      probability: stage.defaultProbability,
      stageEnteredAt: changedStage ? now : deal.stageEnteredAt,
      wonAt: kind === 'won' ? (patch.wonAt ?? now) : null,
      lostAt: kind === 'lost' ? now : null,
      ...(kind === 'won' ? { lostReason: null } : {}),
      ...patch,
    })
    .where(eq(deals.id, deal.id))
    .returning();
  const [hist] = changedStage
    ? await tx
        .insert(dealStageHistory)
        .values({ dealId: deal.id, fromStageId: deal.stageId, toStageId: stage.id, source: 'ui' })
        .returning({ id: dealStageHistory.id })
    : [];
  await syncLeadStatus(tx, deal.leadId, stage, true);
  await applyRules(tx, {
    type: 'deal_stage_entered',
    dealId: deal.id,
    leadId: deal.leadId,
    stageId: stage.id,
    fromStageId: deal.stageId,
    historyId: hist?.id,
    source: 'ui',
  });
  return updated!;
}

/** Ganho: valor final e data; o lead vira Cliente. */
export async function winDeal(
  db: Db,
  input: { dealId: string; value?: string | null; wonAt?: Date },
) {
  return db.transaction(async (tx) => {
    const deal = await lockDeal(tx, input.dealId);
    return closeTx(tx, deal, 'won', {
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.wonAt ? { wonAt: input.wonAt } : {}),
    });
  });
}

/** Perda: motivo (+ texto livre); o lead vira Perdido. "Não contatar" aplica o fluxo da SPEC 4.4. */
export async function loseDeal(
  db: Db,
  input: { dealId: string; reason: string; note?: string | null },
) {
  return db.transaction(async (tx) => {
    const deal = await lockDeal(tx, input.dealId);
    const note = input.note?.trim();
    const updated = await closeTx(tx, deal, 'lost', {
      lostReason: note ? `${input.reason}: ${note}` : input.reason,
    });
    if (input.reason === DNC_REASON)
      await setDoNotContact(tx, deal.leadId, {
        reason: note || 'Perda por "Não contatar"',
        optOut: true,
      });
    return updated;
  });
}

export async function updateDeal(
  db: Db,
  id: string,
  patch: Partial<
    Pick<
      typeof deals.$inferInsert,
      'title' | 'value' | 'probability' | 'serviceType' | 'expectedCloseOn' | 'notes'
    >
  >,
) {
  const [d] = await db.update(deals).set(patch).where(eq(deals.id, id)).returning();
  if (!d) throw new DealError('NOT_FOUND', 'Negociação não encontrada.');
  return d;
}

const CLOSED_LIMIT = 30;

export type BoardCard = {
  id: string;
  leadId: string;
  stageId: number;
  title: string;
  leadName: string;
  niche: string;
  place: string;
  value: string | null;
  score: number;
  whatsapp: string | null;
  daysInStage: number;
  status: 'open' | 'won' | 'lost';
};
export type BoardStage = Stage & { count: number; total: string };

/** Colunas = etapas não arquivadas. Abertas: todas, por posição; encerradas: as 30 mais recentes. */
export async function listBoard(db: Db) {
  const stages = await db
    .select()
    .from(dealStages)
    .where(isNull(dealStages.archivedAt))
    .orderBy(asc(dealStages.sort));
  const ids = stages.map((s) => s.id);
  const select = {
    id: deals.id,
    leadId: deals.leadId,
    stageId: deals.stageId,
    title: deals.title,
    value: deals.value,
    status: deals.status,
    enteredAt: deals.stageEnteredAt,
    leadName: leads.name,
    score: leads.score,
    phone: leads.phoneE164,
    hasWhatsapp: leads.hasWhatsapp,
    niche: niches.name,
    neighborhood: regions.neighborhood,
    city: regions.city,
  };
  const base = () =>
    db
      .select(select)
      .from(deals)
      .innerJoin(leads, eq(leads.id, deals.leadId))
      .innerJoin(niches, eq(niches.id, leads.nicheId))
      .innerJoin(regions, eq(regions.id, leads.regionId));
  const [open, totals, ...closed] = await Promise.all([
    base()
      .where(and(inArray(deals.stageId, ids), eq(deals.status, 'open')))
      .orderBy(asc(deals.position)),
    db
      .select({
        stageId: deals.stageId,
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(${deals.value}), 0)::text`,
      })
      .from(deals)
      .where(inArray(deals.stageId, ids))
      .groupBy(deals.stageId),
    ...stages
      .filter((s) => s.isWon || s.isLost)
      .map((s) =>
        base()
          .where(and(eq(deals.stageId, s.id), ne(deals.status, 'open')))
          .orderBy(desc(deals.stageEnteredAt))
          .limit(CLOSED_LIMIT),
      ),
  ]);
  const now = Date.now();
  const toCard = (r: (typeof open)[number]): BoardCard => ({
    id: r.id,
    leadId: r.leadId,
    stageId: r.stageId,
    title: r.title,
    leadName: r.leadName,
    niche: r.niche,
    place: r.neighborhood ?? r.city,
    value: r.value,
    score: r.score,
    whatsapp: r.hasWhatsapp ? r.phone : null,
    daysInStage: Math.max(0, Math.floor((now - r.enteredAt.getTime()) / 86_400_000)),
    status: r.status,
  });
  const byStage = new Map(totals.map((t) => [t.stageId, t]));
  return {
    stages: stages.map((s): BoardStage => ({
      ...s,
      count: byStage.get(s.id)?.count ?? 0,
      total: byStage.get(s.id)?.total ?? '0',
    })),
    cards: [...open, ...closed.flat()].map(toCard),
  };
}

export type TimelineItem =
  | { kind: 'interaction'; at: Date; id: string; row: typeof interactions.$inferSelect }
  | { kind: 'stage'; at: Date; id: string; from: string | null; to: string; source: Source }
  | { kind: 'reminder'; at: Date; id: string; row: typeof reminders.$inferSelect };

/** Drawer da negociação: o deal, o lead e a linha do tempo unificada (interações do lead + etapas + lembretes). */
export async function getDealDetail(db: Db, id: string) {
  const [row] = await db
    .select({ deal: deals, stage: dealStages, lead: leads, niche: niches.name })
    .from(deals)
    .innerJoin(dealStages, eq(dealStages.id, deals.stageId))
    .innerJoin(leads, eq(leads.id, deals.leadId))
    .innerJoin(niches, eq(niches.id, leads.nicheId))
    .where(eq(deals.id, id));
  if (!row) return null;
  const [ints, hist, rems, stages] = await Promise.all([
    db
      .select()
      .from(interactions)
      .where(eq(interactions.leadId, row.deal.leadId))
      .orderBy(desc(interactions.occurredAt))
      .limit(100),
    db
      .select()
      .from(dealStageHistory)
      .where(eq(dealStageHistory.dealId, id))
      .orderBy(desc(dealStageHistory.movedAt)),
    db.select().from(reminders).where(eq(reminders.dealId, id)).orderBy(desc(reminders.dueAt)),
    db.select().from(dealStages).orderBy(asc(dealStages.sort)),
  ]);
  const name = new Map(stages.map((s) => [s.id, s.name]));
  const timeline: TimelineItem[] = [
    ...ints.map((r): TimelineItem => ({ kind: 'interaction', at: r.occurredAt, id: r.id, row: r })),
    ...hist.map((h): TimelineItem => ({
      kind: 'stage',
      at: h.movedAt,
      id: `h${h.id}`,
      from: h.fromStageId ? (name.get(h.fromStageId) ?? null) : null,
      to: name.get(h.toStageId) ?? '?',
      source: h.source,
    })),
    ...rems.map((r): TimelineItem => ({ kind: 'reminder', at: r.dueAt, id: r.id, row: r })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return { ...row, timeline };
}
export type DealDetail = NonNullable<Awaited<ReturnType<typeof getDealDetail>>>;
