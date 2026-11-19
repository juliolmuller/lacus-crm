import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import type { LeadFilters } from '@/lib/leads/filters';
import { normalizeName } from '@/lib/normalize';

const { leads, niches, regions, deals, reminders } = schema;

const escapeLike = (v: string) => v.replace(/[\\%_]/g, '\\$&');

/** Ordenações com chave sem nulos, para o cursor (keyset) ser exato. `type` é o cast do valor do cursor. */
const SORT_SQL = {
  score: { expr: sql`${leads.score}`, type: 'int' },
  name: { expr: sql`${leads.name}`, type: 'text' },
  updated: { expr: sql`${leads.updatedAt}`, type: 'timestamptz' },
  included: { expr: sql`coalesce(${leads.includedAt}, date '1970-01-01')`, type: 'date' },
  contact: {
    expr: sql`coalesce(${leads.lastContactAt}, 'epoch'::timestamptz)`,
    type: 'timestamptz',
  },
  priority: { expr: sql`coalesce(${leads.priority}, 0)`, type: 'int' },
} as const;

export function leadWhere(f: LeadFilters): SQL | undefined {
  const c: (SQL | undefined)[] = [];
  const q = f.q.trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    const like = `%${escapeLike(q)}%`;
    c.push(
      or(
        ilike(leads.nameNormalized, `%${escapeLike(normalizeName(q))}%`), // GIN trigram
        ilike(leads.instagram, like),
        ilike(regions.neighborhood, like),
        digits.length >= 4 ? ilike(leads.phoneE164, `%${digits}%`) : undefined,
      ),
    );
  }
  if (f.status.length) c.push(inArray(leads.contactStatus, f.status));
  if (f.niche) c.push(eq(leads.nicheId, f.niche));
  if (f.region) c.push(eq(leads.regionId, f.region));
  if (f.smin != null) c.push(gte(leads.score, f.smin));
  if (f.smax != null) c.push(lte(leads.score, f.smax));
  if (f.site.length) c.push(inArray(leads.websiteStatus, f.site));
  if (f.wa) c.push(eq(leads.hasWhatsapp, f.wa === 'yes'));
  if (f.dnc === 'hide') c.push(eq(leads.doNotContact, false));
  if (f.dnc === 'only') c.push(eq(leads.doNotContact, true));
  if (f.deal) {
    const open = sql`exists (select 1 from ${deals} where ${deals.leadId} = ${leads.id} and ${deals.status} = 'open')`;
    c.push(f.deal === 'open' ? open : sql`not ${open}`);
  }
  if (f.overdue)
    c.push(
      sql`exists (select 1 from ${reminders} where ${reminders.leadId} = ${leads.id} and ${reminders.status} = 'open' and ${reminders.dueAt} < now())`,
    );
  if (f.from) c.push(gte(leads.includedAt, f.from));
  if (f.to) c.push(lte(leads.includedAt, f.to));
  if (f.source) c.push(eq(leads.dataSource, f.source));
  return and(...c);
}

export type LeadListRow = Awaited<ReturnType<typeof listLeads>>['rows'][number];

const encode = (v: { v: string; id: string }) =>
  Buffer.from(JSON.stringify(v)).toString('base64url');
const decode = (s: string) =>
  JSON.parse(Buffer.from(s, 'base64url').toString()) as { v: string; id: string };

/** Página de leads com cursor keyset (valor da ordenação + id). 50 por página. */
export async function listLeads(db: Db, f: LeadFilters, cursor?: string | null, limit = 50) {
  const sort = SORT_SQL[f.sort];
  const order = f.dir === 'asc' ? asc : desc;
  const after = cursor ? decode(cursor) : null;
  const cmp = f.dir === 'asc' ? sql`>` : sql`<`;
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      score: leads.score,
      contactStatus: leads.contactStatus,
      websiteStatus: leads.websiteStatus,
      mapsRating: leads.mapsRating,
      mapsReviews: leads.mapsReviews,
      hasWhatsapp: leads.hasWhatsapp,
      nextAction: leads.nextAction,
      lastContactAt: leads.lastContactAt,
      priority: leads.priority,
      doNotContact: leads.doNotContact,
      nicheName: niches.name,
      regionLabel: regions.label,
      sortValue: sql<string>`(${sort.expr})::text`,
    })
    .from(leads)
    .innerJoin(niches, eq(niches.id, leads.nicheId))
    .innerJoin(regions, eq(regions.id, leads.regionId))
    .where(
      and(
        leadWhere(f),
        after
          ? sql`(${sort.expr}, ${leads.id}) ${cmp} (${after.v}::${sql.raw(sort.type)}, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(order(sort.expr), order(leads.id))
    .limit(limit + 1);
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: more && last ? encode({ v: last.sortValue, id: last.id }) : null,
  };
}

export const countLeads = async (db: Db, f: LeadFilters) => {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(regions, eq(regions.id, leads.regionId))
    .where(leadWhere(f));
  return r?.n ?? 0;
};
