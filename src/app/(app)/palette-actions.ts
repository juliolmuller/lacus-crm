'use server';

import { requireOwner } from '@/lib/auth/dal';
import { getDb } from '@/lib/db';
import { parseFilters } from '@/lib/leads/filters-server';
import { listLeads } from '@/lib/services/lead-list';

/** Busca da paleta ⌘K: o mesmo serviço da lista de leads (nome por trigram, telefone por dígitos, bairro). */
export async function searchLeadsForPalette(q: string) {
  await requireOwner();
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const { rows } = await listLeads(getDb(), { ...parseFilters({}), q: term, dnc: 'show' }, null, 8);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    region: r.regionLabel,
    doNotContact: r.doNotContact,
  }));
}
