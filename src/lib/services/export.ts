import { asc, desc, eq } from 'drizzle-orm';
import Papa from 'papaparse';

import { type Db, schema } from '@/lib/db';
import { COLUMNS, HEADERS, leadToRow } from '@/lib/leads/csv';
import { type LeadFilters } from '@/lib/leads/filters';
import { formatCityNeighborhood } from '@/lib/normalize';

import { leadWhere } from './lead-list';

const { leads, niches, regions } = schema;

/**
 * CSV with the 39 English column headers, UTF-8 with BOM, honoring the filters.
 */
export async function exportLeadsCsv(
  db: Db,
  f: LeadFilters,
  delimiter: ',' | ';' = ';',
): Promise<string> {
  const rows = await db
    .select({ lead: leads, niche: niches, region: regions })
    .from(leads)
    .innerJoin(niches, eq(niches.id, leads.nicheId))
    .innerJoin(regions, eq(regions.id, leads.regionId))
    .where(leadWhere(f))
    .orderBy(desc(leads.score), asc(leads.id));
  const data = rows.map(({ lead, niche, region }) => {
    const row = leadToRow(lead, niche, formatCityNeighborhood(region));

    return COLUMNS.map((c) => row[c.label] ?? '');
  });

  return `\uFEFF${Papa.unparse({ fields: HEADERS, data }, { delimiter, newline: '\r\n', quotes: true })}`;
}
