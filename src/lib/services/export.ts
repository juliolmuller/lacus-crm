import { asc, desc, eq } from 'drizzle-orm';
import Papa from 'papaparse';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { HEADERS, leadToRow } from '@/lib/leads/csv';
import type { LeadFilters } from '@/lib/leads/filters';
import { formatCityNeighborhood } from '@/lib/normalize';
import { leadWhere } from './lead-list';

const { leads, niches, regions } = schema;

/** CSV com os 39 cabeçalhos da planilha, UTF-8 com BOM, respeitando os filtros. */
export async function exportLeadsCsv(db: Db, f: LeadFilters, delimiter: ';' | ',' = ';') {
  const rows = await db
    .select({ lead: leads, niche: niches, region: regions })
    .from(leads)
    .innerJoin(niches, eq(niches.id, leads.nicheId))
    .innerJoin(regions, eq(regions.id, leads.regionId))
    .where(leadWhere(f))
    .orderBy(desc(leads.score), asc(leads.id));
  const data = rows.map(({ lead, niche, region }) => {
    const row = leadToRow(lead, niche, formatCityNeighborhood(region));
    return HEADERS.map((h) => row[h] ?? '');
  });
  return (
    '﻿' + Papa.unparse({ fields: HEADERS, data }, { delimiter, newline: '\r\n', quotes: true })
  );
}
