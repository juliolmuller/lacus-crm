import { and, eq, or } from 'drizzle-orm';
import { TransactionRollbackError, is } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { parseLeadRow } from '@/lib/leads/csv';
import { dncEvidence } from '@/lib/leads/dnc';
import { statusLabel, type ContactStatus } from '@/lib/leads/labels';
import { normalizeName, parseCityNeighborhood } from '@/lib/normalize';
import { createDeal, stageKeyForStatus } from './deals';
import { changedFields, createLead, resolveRegion, updateLead, type LeadValues } from './leads';

const { leads, niches, deals, interactions } = schema;

export type ImportOptions = { insertOnly: boolean; dryRun: boolean; dataSource?: string };
export type RowOutcome = {
  line: number;
  name: string;
  action: 'create' | 'update' | 'unchanged' | 'skip' | 'error';
  reason?: string;
  changed?: string[];
};
export type ImportReport = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: number;
  deals: number;
  interactions: number;
  rows: RowOutcome[];
  scoreDivergences: { line: number; name: string; sheet: number; computed: number }[];
  ticketMismatches: { line: number; name: string; sheet: string; niche: string | null }[];
  newRegions: string[];
  dncCandidates: { id: string; name: string; status: string; evidence: string[] }[];
};

export const emptyReport = (): ImportReport => ({
  created: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  errors: 0,
  deals: 0,
  interactions: 0,
  rows: [],
  scoreDivergences: [],
  ticketMismatches: [],
  newRegions: [],
  dncCandidates: [],
});

/** Dry-run = a mesma importação, numa transação que é desfeita no fim. */
export async function inRollbackableTx<T>(db: Db, dryRun: boolean, fn: (tx: Db) => Promise<T>) {
  let result!: T;
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx);
      if (dryRun) tx.rollback();
    });
  } catch (e) {
    // `is` compara o entityKind: `instanceof` falha se o bundler duplicar o drizzle-orm
    if (!is(e, TransactionRollbackError)) throw e;
  }
  return result;
}

const CHANNEL_TYPE: Record<string, 'whatsapp' | 'call' | 'email' | 'instagram_dm' | 'in_person'> = {
  whatsapp: 'whatsapp',
  ligacao: 'call',
  telefone: 'call',
  ligar: 'call',
  email: 'email',
  instagram: 'instagram_dm',
  presencial: 'in_person',
};

async function ensureHistory(tx: Db, lead: typeof leads.$inferSelect, report: ImportReport) {
  if (lead.lastContactAt) {
    const [has] = await tx
      .select({ id: interactions.id })
      .from(interactions)
      .where(
        and(
          eq(interactions.leadId, lead.id),
          eq(interactions.createdBy, 'import'),
          eq(interactions.occurredAt, lead.lastContactAt),
        ),
      )
      .limit(1);
    if (!has) {
      const channel = lead.channel?.trim() ?? '';
      await tx.insert(interactions).values({
        leadId: lead.id,
        type: CHANNEL_TYPE[normalizeName(channel)] ?? 'note',
        direction: 'outbound',
        summary:
          [channel && `Contato por ${channel}`, lead.responseOrObjection]
            .filter(Boolean)
            .join(': ') || 'Contato importado da planilha',
        occurredAt: lead.lastContactAt,
        createdBy: 'import',
      });
      report.interactions++;
    }
  }
}

/** Negociação de importação (D4 e SPEC 6.2): só se o lead ainda não tem nenhuma. */
export async function ensureImportDeal(
  tx: Db,
  lead: typeof leads.$inferSelect,
  report: ImportReport,
) {
  const stageKey = stageKeyForStatus(lead.contactStatus);
  if (!stageKey || lead.doNotContact) return;
  const [has] = await tx
    .select({ id: deals.id })
    .from(deals)
    .where(eq(deals.leadId, lead.id))
    .limit(1);
  if (has) return;
  const d = await createDeal(tx, {
    leadId: lead.id,
    title: lead.name,
    stageKey,
    value: lead.proposalValue,
    source: 'import',
  });
  if (d) report.deals++;
}

const NEEDS_DEAL: ContactStatus[] = ['negotiating', 'client', 'lost'];

/** Importa as linhas (cabeçalhos canônicos) da aba Leads. Cada linha roda num SAVEPOINT. */
export async function importLeads(
  db: Db,
  rows: Record<string, string>[],
  opts: ImportOptions,
): Promise<ImportReport> {
  const report = emptyReport();
  await inRollbackableTx(db, opts.dryRun, async (tx) => {
    const allNiches = await tx.select().from(niches);
    const nicheByName = new Map(allNiches.map((n) => [normalizeName(n.name), n]));
    const known = new Set(
      (await tx.select({ l: schema.regions.label }).from(schema.regions)).map((r) => r.l),
    );

    for (const [i, raw] of rows.entries()) {
      const line = i + 2; // linha 1 = cabeçalho
      const p = parseLeadRow(raw);
      const name = String(p.values.name ?? raw['Nome do negócio'] ?? '').trim();
      const done = (r: Omit<RowOutcome, 'line' | 'name'>) => {
        report.rows.push({ line, name, ...r });
        if (r.action === 'create') report.created++;
        else if (r.action === 'update') report.updated++;
        else if (r.action === 'unchanged') report.unchanged++;
        else if (r.action === 'skip') report.skipped++;
        else report.errors++;
      };
      if (p.errors.length) {
        done({ action: 'error', reason: p.errors.join('; ') });
        continue;
      }
      try {
        const outcome = await tx.transaction(async (sp) => {
          const id = p.values.id as string | undefined;
          const placeId = p.values.placeId as string | null | undefined;
          const [existing] =
            id || placeId
              ? await sp
                  .select()
                  .from(leads)
                  .where(
                    or(
                      id ? eq(leads.id, id) : undefined,
                      placeId ? eq(leads.placeId, placeId) : undefined,
                    ),
                  )
                  .limit(1)
              : [];
          const niche = p.nicheName
            ? (nicheByName.get(normalizeName(p.nicheName)) ?? null)
            : undefined;
          if (niche === null) throw new Error(`nicho desconhecido "${p.nicheName}"`);
          let regionId: number | undefined;
          if (p.place) {
            const place = parseCityNeighborhood(p.place);
            if (!place) throw new Error(`"Cidade / bairro" inválido: "${p.place}"`);
            if (!known.has(place.label)) {
              known.add(place.label);
              report.newRegions.push(place.label);
            }
            regionId = (await resolveRegion(sp, place)).id;
          }
          const { id: _id, ...values } = p.values;
          void _id;
          const data: LeadValues = {
            ...(values as LeadValues),
            dataSource: opts.dataSource ?? 'import_sheet',
          };

          let lead: typeof leads.$inferSelect;
          let result: Omit<RowOutcome, 'line' | 'name'>;
          if (existing) {
            if (opts.insertOnly)
              return { r: { action: 'skip', reason: 'já existe (somente novos)' } as const };
            delete data.dataSource; // a origem do cadastro original não muda
            // Top leads vence no status: lead priorizado (priority definida) não volta ao status da aba Leads
            if (existing.priority != null) delete data.contactStatus;
            const patch: LeadValues & { nicheId?: number; regionId?: number } = {
              ...data,
              ...(niche ? { nicheId: niche.id } : {}),
              ...(regionId ? { regionId } : {}),
            };
            const changed = changedFields(existing, patch);
            if (changed.length) {
              lead = await updateLead(sp, existing.id, patch);
              result = { action: 'update', changed };
            } else {
              lead = existing;
              result = { action: 'unchanged' };
            }
          } else {
            if (!name) throw new Error('Nome do negócio é obrigatório');
            if (!niche) throw new Error('Nicho é obrigatório');
            if (!regionId) throw new Error('Cidade / bairro é obrigatório');
            const created = await createLead(sp, {
              values: { ...data, id: id, name } as LeadValues & { name: string },
              nicheId: niche.id,
              regionId,
            });
            if (!created.ok)
              return {
                r: {
                  action: 'skip',
                  reason:
                    created.reason === 'suppressed'
                      ? 'na lista de supressão'
                      : `duplicata de "${created.duplicates[0]!.name}" (${created.duplicates[0]!.reasons.join(', ')})`,
                } as const,
              };
            lead = created.lead;
            result = { action: 'create' };
          }
          await ensureHistory(sp, lead, report);
          if (NEEDS_DEAL.includes(lead.contactStatus) || lead.proposalValue != null)
            await ensureImportDeal(sp, lead, report);
          return { r: result, lead, niche };
        });
        done(outcome.r);
        if ('lead' in outcome && outcome.lead) {
          const { lead } = outcome;
          const nicheRow = allNiches.find((n) => n.id === lead.nicheId) ?? null;
          if (p.sheetScore != null && p.sheetScore !== lead.score)
            report.scoreDivergences.push({ line, name, sheet: p.sheetScore, computed: lead.score });
          if (p.ticket !== undefined && p.ticket !== (nicheRow?.ticket ?? null))
            report.ticketMismatches.push({
              line,
              name,
              sheet: p.ticket ?? '',
              niche: nicheRow?.ticket ?? null,
            });
          const evidence = dncEvidence(lead);
          if (evidence.length && ['lost', 'discarded'].includes(lead.contactStatus))
            report.dncCandidates.push({
              id: lead.id,
              name: lead.name,
              status: statusLabel[lead.contactStatus],
              evidence,
            });
        }
      } catch (e) {
        done({ action: 'error', reason: (e as Error).message });
      }
    }
  });
  return report;
}
