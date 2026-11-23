import { desc, sql } from 'drizzle-orm';

import { type Db, schema } from '@/lib/db';

const { suppressionList } = schema;

/**
 * Lista de supressão (SPEC 4.3): total e as 50 entradas mais recentes. Telefone
 * e nome só existem como hash.
 */
export async function listSuppression(db: Db) {
  const [[count], rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(suppressionList),
    db
      .select({
        id: suppressionList.id,
        placeId: suppressionList.placeId,
        hasPhone: sql<boolean>`${suppressionList.phoneE164Hash} is not null`,
        reason: suppressionList.reason,
        createdAt: suppressionList.createdAt,
      })
      .from(suppressionList)
      .orderBy(desc(suppressionList.createdAt), desc(suppressionList.id))
      .limit(50),
  ]);

  return { total: count?.n ?? 0, rows };
}
