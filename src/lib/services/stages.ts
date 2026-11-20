import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { stageColors } from '@/lib/funnel/status-sync';
import { contactStatuses } from '@/lib/leads/labels';
import { normalizeName } from '@/lib/normalize';
import { DealError } from './deals';

const { dealStages, deals } = schema;

export const stageInput = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(40),
  color: z.enum(stageColors),
  defaultProbability: z.number().int().min(0).max(100).nullable(),
  leadStatus: z.enum(contactStatuses).nullable(),
});
export type StageInput = z.infer<typeof stageInput>;

export const listStages = (db: Db) =>
  db
    .select({
      stage: dealStages,
      open: sql<number>`(select count(*)::int from ${deals} where ${deals.stageId} = "deal_stages"."id")`,
    })
    .from(dealStages)
    .orderBy(asc(dealStages.sort));

/** Nova etapa aberta, antes das colunas Ganho/Perdido (que ficam sempre no fim). */
export async function createStage(db: Db, input: StageInput) {
  return db.transaction(async (tx) => {
    const all = await tx.select().from(dealStages).orderBy(asc(dealStages.sort));
    const slug =
      normalizeName(input.name)
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'etapa';
    let key = slug;
    for (let i = 2; all.some((s) => s.key === key); i++) key = `${slug}_${i}`;
    const firstClosed = all.find((s) => s.isWon || s.isLost);
    const sort = firstClosed ? firstClosed.sort : (all.at(-1)?.sort ?? 0) + 1;
    // abre espaço antes de Ganho/Perdido
    await tx
      .update(dealStages)
      .set({ sort: sql`${dealStages.sort} + 1` })
      .where(sql`${dealStages.sort} >= ${sort}`);
    const [s] = await tx
      .insert(dealStages)
      .values({ key, sort, ...input })
      .returning();
    return s!;
  });
}

export async function updateStage(db: Db, id: number, input: StageInput) {
  const [s] = await db.update(dealStages).set(input).where(eq(dealStages.id, id)).returning();
  if (!s) throw new DealError('STAGE_NOT_FOUND', 'Etapa não encontrada.');
  return s;
}

/** Arquivar exige coluna vazia e não vale para a última etapa Ganho/Perdido. */
export async function archiveStage(db: Db, id: number, archived: boolean) {
  const [s] = await db.select().from(dealStages).where(eq(dealStages.id, id));
  if (!s) throw new DealError('STAGE_NOT_FOUND', 'Etapa não encontrada.');
  if (archived) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(deals)
      .where(and(eq(deals.stageId, id), eq(deals.status, 'open')));
    if (n > 0)
      throw new DealError('USE_CLOSE', 'Mova as negociações desta etapa antes de arquivar.');
    if (s.isWon || s.isLost) {
      const others = await db
        .select({ id: dealStages.id })
        .from(dealStages)
        .where(
          and(
            eq(s.isWon ? dealStages.isWon : dealStages.isLost, true),
            isNull(dealStages.archivedAt),
          ),
        );
      if (others.length < 2)
        throw new DealError('USE_CLOSE', 'É preciso manter uma etapa de Ganho e uma de Perdido.');
    }
  }
  await db
    .update(dealStages)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(dealStages.id, id));
}

/** Nova ordem (ids na ordem desejada). Etapas arquivadas mantêm o lugar relativo no fim da lista. */
export async function reorderStages(db: Db, ids: number[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries())
      await tx
        .update(dealStages)
        .set({ sort: i + 1 })
        .where(eq(dealStages.id, id));
  });
}
