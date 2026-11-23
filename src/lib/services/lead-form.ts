import { type Db } from '@/lib/db';
import { parseLeadRow } from '@/lib/leads/csv';
import { parseCityNeighborhood } from '@/lib/normalize';

import { type LeadValues, resolveNiche, resolveRegion } from './leads';

export type LeadInput =
  | { error: string; ok: false }
  | { nicheId?: number; ok: true; regionId?: number; values: LeadValues };

/**
 * Linha com os cabeçalhos da planilha (formulário, REST, MCP) → valores do
 * banco. Os mesmos conversores da importação: a tela e o CSV nunca divergem.
 */
export async function prepareLeadInput(db: Db, row: Record<string, string>): Promise<LeadInput> {
  const p = parseLeadRow(row);

  if (p.errors.length) return { ok: false, error: p.errors.join('; ') };

  let nicheId: number | undefined;
  let regionId: number | undefined;

  if (p.nicheName !== undefined) {
    const n = await resolveNiche(db, p.nicheName);

    if (!n) return { ok: false, error: `Nicho desconhecido: "${p.nicheName}"` };

    nicheId = n.id;
  }

  if (p.place !== undefined) {
    const place = parseCityNeighborhood(p.place);

    if (!place)
      return { ok: false, error: 'Use o formato "Bairro, Cidade/UF" (ex.: Xaxim, Curitiba/PR)' };

    regionId = (await resolveRegion(db, place)).id;
  }

  const { id: _id, ...values } = p.values;

  return { ok: true, values: values as LeadValues, nicheId, regionId };
}
