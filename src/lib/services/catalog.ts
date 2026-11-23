import { asc, sql } from 'drizzle-orm';

import { type Db, schema } from '@/lib/db';
import { formatCityNeighborhood } from '@/lib/normalize';

const { niches, regions, leads } = schema;

/**
 * Opções dos selects e do datalist de região.
 */
export async function getCatalog(db: Db) {
  const [n, r, s] = await Promise.all([
    db.select({ id: niches.id, name: niches.name }).from(niches).orderBy(asc(niches.name)),
    db.select().from(regions).orderBy(asc(regions.label)),
    db
      .selectDistinct({ s: leads.dataSource })
      .from(leads)
      .where(sql`${leads.dataSource} is not null`),
  ]);

  return {
    niches: n,
    regions: r.map((x) => ({ id: x.id, label: x.label, place: formatCityNeighborhood(x) })),
    sources: s.map((x) => x.s!).sort(),
  };
}
