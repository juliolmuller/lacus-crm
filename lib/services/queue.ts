import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';

const { prospectingQueue: q, niches, regions } = schema;

export const LEASE_MS = 30 * 60_000;

const itemSelect = {
  position: q.position,
  sortOrder: q.sortOrder,
  status: q.status,
  executedAt: q.executedAt,
  leadsAdded: q.leadsAdded,
  notes: q.notes,
  skippedAt: q.skippedAt,
  claimedAt: q.claimedAt,
  claimedRunId: q.claimedRunId,
  attempts: q.attempts,
  regionId: q.regionId,
  regionLabel: regions.label,
  nicheId: q.nicheId,
  nicheName: niches.name,
};
const base = (db: Db) =>
  db
    .select(itemSelect)
    .from(q)
    .innerJoin(regions, eq(regions.id, q.regionId))
    .innerJoin(niches, eq(niches.id, q.nicheId));

export type QueueItem = Awaited<ReturnType<typeof listQueue>>[number];
export const listQueue = (db: Db) => base(db).orderBy(asc(q.sortOrder));

const getItem = async (db: Db, position: number) =>
  (await base(db).where(eq(q.position, position)))[0] ?? null;

/** Dados do nicho que a rotina usa (termos, ticket, notas). */
const withNiche = async (db: Db, item: Awaited<ReturnType<typeof getItem>>) => {
  if (!item) return null;
  const [niche] = await db.select().from(niches).where(eq(niches.id, item.nicheId));
  return { ...item, niche: niche! };
};

/**
 * Próximo item `pending`, não pulado e sem lease ativo, na ordem de `sort_order`; marca `claimed_at`.
 * Idempotente por `runId`: quem repete o claim recebe o mesmo item (mesmo se já concluído).
 * `null` se a fila estiver vazia.
 */
export async function claimNext(db: Db, runId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const [mine] = await tx.select({ p: q.position }).from(q).where(eq(q.claimedRunId, runId));
    if (mine) return withNiche(tx, await getItem(tx, mine.p));
    const expired = new Date(now.getTime() - LEASE_MS);
    const [next] = await tx
      .select({ p: q.position })
      .from(q)
      .where(
        and(
          eq(q.status, 'pending'),
          isNull(q.skippedAt),
          or(isNull(q.claimedAt), sql`${q.claimedAt} < ${expired.toISOString()}::timestamptz`),
        ),
      )
      .orderBy(asc(q.sortOrder))
      .limit(1)
      .for('update', { skipLocked: true });
    if (!next) return null;
    await tx
      .update(q)
      .set({ claimedAt: now, claimedRunId: runId, attempts: sql`coalesce(${q.attempts}, 0) + 1` })
      .where(eq(q.position, next.p));
    return withNiche(tx, await getItem(tx, next.p));
  });
}

export type CompleteInput = {
  position: number;
  runId: string;
  status: 'done' | 'error';
  leadsAdded?: number;
  notes?: string | null;
};

/** Idempotente: só o item ainda `pending` muda; repetir (mesmo `runId`) devolve o estado atual. */
export async function completeItem(db: Db, input: CompleteInput, now = new Date()) {
  await db
    .update(q)
    .set({
      status: input.status,
      executedAt: now,
      leadsAdded: input.leadsAdded ?? 0,
      notes: input.notes ?? null,
      claimedAt: null,
    })
    .where(and(eq(q.position, input.position), eq(q.status, 'pending')));
  return getItem(db, input.position);
}

/** Reordena: `positions` na nova ordem de execução (só `sort_order` muda). */
export async function reorderQueue(db: Db, positions: number[]) {
  if (!positions.length) return;
  await db.execute(sql`
    update prospecting_queue p set sort_order = v.ord
    from (values ${sql.join(
      positions.map((pos, i) => sql`(${pos}::int, ${i + 1}::int)`),
      sql`, `,
    )}) as v(pos, ord)
    where p.position = v.pos`);
}

export async function moveToTop(db: Db, position: number) {
  await db.execute(
    sql`update prospecting_queue set sort_order = (select coalesce(min(sort_order), 1) - 1 from prospecting_queue) where position = ${position}`,
  );
}

export const skipItem = (db: Db, position: number, skip: boolean) =>
  db
    .update(q)
    .set({ skippedAt: skip ? new Date() : null })
    .where(eq(q.position, position));

/** Item com erro volta para a fila (sem lease e sem o `runId` anterior). */
export const markPending = (db: Db, position: number) =>
  db
    .update(q)
    .set({ status: 'pending', executedAt: null, claimedAt: null, claimedRunId: null })
    .where(eq(q.position, position));
