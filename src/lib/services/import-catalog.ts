import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { sha256 } from '@/lib/hash';
import { parseContactDate, parseDate, parseNumber } from '@/lib/leads/csv';
import { dncEvidence } from '@/lib/leads/dnc';
import { statusLabel, contactStatuses } from '@/lib/leads/labels';
import { parseNichesCsv } from '@/lib/niches';
import { normalizeName, parseCityNeighborhood } from '@/lib/normalize';
import {
  ensureImportDeal,
  emptyReport,
  inRollbackableTx,
  type ImportOptions,
  type ImportReport,
} from './import';
import { resolveNiche, resolveRegion, updateLead } from './leads';

const { niches, regions, prospectingQueue, apiUsageLog, leads } = schema;

/** Relatório simples dos importadores de catálogo (sem score, deals ou histórico). */
export type CatalogReport = Pick<
  ImportReport,
  'created' | 'updated' | 'unchanged' | 'skipped' | 'errors'
> & {
  messages: string[];
};
const blank = (): CatalogReport => ({
  created: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  errors: 0,
  messages: [],
});

const changedKeys = (cur: Record<string, unknown>, next: Record<string, unknown>) =>
  Object.keys(next).filter((k) => (cur[k] ?? null) !== (next[k] ?? null));

/** Nichos: cria os que faltam e atualiza os campos que mudaram. Nunca inventa ticket nem abertura. */
export async function importNiches(db: Db, csv: string, opts: Pick<ImportOptions, 'dryRun'>) {
  const rep = blank();
  await inRollbackableTx(db, opts.dryRun, async (tx) => {
    for (const n of parseNichesCsv(csv)) {
      const cur = await resolveNiche(tx, n.name);
      if (!cur) {
        await tx.insert(niches).values(n);
        rep.created++;
      } else if (changedKeys(cur, n).length) {
        await tx.update(niches).set(n).where(eq(niches.id, cur.id));
        rep.updated++;
      } else rep.unchanged++;
    }
  });
  return rep;
}

/** Cidades/Regiões: label "PR - Pato Branco" + ID da planilha da cidade. */
export async function importRegions(
  db: Db,
  rows: Record<string, string>[],
  opts: Pick<ImportOptions, 'dryRun'>,
) {
  const rep = blank();
  await inRollbackableTx(db, opts.dryRun, async (tx) => {
    for (const [i, r] of rows.entries()) {
      const place = parseCityNeighborhood(r['Cidade']);
      const sheetId = r['ID da planilha']?.trim() || null;
      if (!place) {
        rep.errors++;
        rep.messages.push(`linha ${i + 2}: cidade inválida "${r['Cidade']}"`);
        continue;
      }
      const [cur] = await tx.select().from(regions).where(eq(regions.label, place.label));
      if (!cur) {
        await resolveRegion(tx, place, sheetId);
        rep.created++;
      } else if (sheetId && cur.sourceSheetId !== sheetId) {
        await tx.update(regions).set({ sourceSheetId: sheetId }).where(eq(regions.id, cur.id));
        rep.updated++;
      } else rep.unchanged++;
    }
  });
  return rep;
}

const QUEUE_STATUS = {
  pendente: 'pending',
  concluido: 'done',
  'sem resultados': 'done',
  erro: 'error',
} as const;

/** Fila: `position` = coluna Ordem; reimportar não mexe em `sort_order` (reordenação do usuário). */
export async function importQueue(
  db: Db,
  rows: Record<string, string>[],
  opts: Pick<ImportOptions, 'dryRun'>,
) {
  const rep = blank();
  await inRollbackableTx(db, opts.dryRun, async (tx) => {
    for (const [i, r] of rows.entries()) {
      try {
        const position = Math.round(parseNumber(r['Ordem'] ?? ''));
        const place = parseCityNeighborhood(r['Cidade']);
        if (!place) throw new Error(`cidade inválida "${r['Cidade']}"`);
        const niche = await resolveNiche(tx, r['Nicho'] ?? '');
        if (!niche) throw new Error(`nicho desconhecido "${r['Nicho']}"`);
        const status = QUEUE_STATUS[normalizeName(r['Status'] ?? '') as keyof typeof QUEUE_STATUS];
        if (!status) throw new Error(`status desconhecido "${r['Status']}"`);
        const region = await resolveRegion(
          tx,
          place,
          r['ID da planilha da cidade']?.trim() || null,
        );
        const date = r['Data de execução']?.trim();
        const next = {
          regionId: region.id,
          nicheId: niche.id,
          status,
          executedAt: date ? parseContactDate(date) : null,
          leadsAdded: r['Leads adicionados']?.trim()
            ? Math.round(parseNumber(r['Leads adicionados']!))
            : 0,
          notes: r['Observações']?.trim() || null,
        };
        const [cur] = await tx
          .select()
          .from(prospectingQueue)
          .where(eq(prospectingQueue.position, position));
        if (!cur) {
          await tx.insert(prospectingQueue).values({ position, sortOrder: position, ...next });
          rep.created++;
        } else if (
          changedKeys(
            { ...cur, executedAt: cur.executedAt?.getTime() ?? null },
            { ...next, executedAt: next.executedAt?.getTime() ?? null },
          ).length
        ) {
          await tx
            .update(prospectingQueue)
            .set(next)
            .where(eq(prospectingQueue.position, position));
          rep.updated++;
        } else rep.unchanged++;
      } catch (e) {
        rep.errors++;
        rep.messages.push(`linha ${i + 2}: ${(e as Error).message}`);
      }
    }
  });
  return rep;
}

/**
 * Uso da API: as 4 primeiras linhas da aba trazem o limite diário; o cabeçalho da tabela começa em "Data".
 * `rows` vem do CSV bruto (matriz). O run_id é um hash do conteúdo, então reimportar não duplica.
 */
export async function importApiUsage(
  db: Db,
  matrix: string[][],
  opts: Pick<ImportOptions, 'dryRun'>,
) {
  const rep = blank();
  const head = matrix.findIndex((r) => r[0]?.trim() === 'Data');
  if (head < 0) throw new Error('Cabeçalho "Data" não encontrado na aba Uso da API');
  const limit = matrix.find((r) => normalizeName(r[0] ?? '').startsWith('limite diario'))?.[1];
  if (limit) rep.messages.push(`limite diário na planilha: ${limit}`);
  await inRollbackableTx(db, opts.dryRun, async (tx) => {
    for (const [i, r] of matrix.slice(head + 1).entries()) {
      if (!r[0]?.trim()) continue;
      try {
        const [h, m] = (r[1] ?? '').trim().split(':');
        const order = r[2]?.trim();
        const values = {
          day: parseDate(r[0]),
          at: `${h!.padStart(2, '0')}:${m}:00`,
          queuePosition: order && order !== '-' ? Math.round(parseNumber(order)) : null,
          requests: Math.round(parseNumber(r[3] ?? '0')),
          leadsSaved: Math.round(parseNumber(r[4] ?? '0')),
          note: r[5]?.trim() || null,
        };
        const runId = `import:${sha256(JSON.stringify(values)).slice(0, 24)}`;
        const ins = await tx
          .insert(apiUsageLog)
          .values({ ...values, runId })
          .onConflictDoNothing({ target: apiUsageLog.runId })
          .returning({ id: apiUsageLog.id });
        if (ins.length) rep.created++;
        else rep.unchanged++;
      } catch (e) {
        rep.errors++;
        rep.messages.push(`linha ${head + i + 2}: ${(e as Error).message}`);
      }
    }
  });
  return rep;
}

/**
 * Top leads sobrepõe prioridade, session_url e status (o do Top leads vence) e cria a negociação
 * da etapa equivalente quando o lead não tem nenhuma (PLAN D4, histórico source='import').
 */
export async function importTopLeads(
  db: Db,
  rows: Record<string, string>[],
  opts: Pick<ImportOptions, 'dryRun'>,
) {
  const report = emptyReport();
  const byLabel = new Map(contactStatuses.map((s) => [normalizeName(statusLabel[s]), s]));
  await inRollbackableTx(db, opts.dryRun, async (tx) => {
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      const name = r['Lead'] ?? '';
      const done = (
        action: 'update' | 'unchanged' | 'error',
        reason?: string,
        changed?: string[],
      ) => {
        report.rows.push({ line, name, action, reason, changed });
        if (action === 'update') report.updated++;
        else if (action === 'unchanged') report.unchanged++;
        else report.errors++;
      };
      try {
        const id = r['ID do lead']?.trim().toLowerCase();
        const [lead] = id ? await tx.select().from(leads).where(eq(leads.id, id)) : [];
        if (!lead) throw new Error('lead não existe no CRM (importe a aba Leads antes)');
        const status = byLabel.get(normalizeName(r['Status do contato'] ?? ''));
        if (!status) throw new Error(`status desconhecido "${r['Status do contato']}"`);
        const priority = r['Prioridade']?.trim() ? Math.round(parseNumber(r['Prioridade']!)) : null;
        const patch = {
          priority,
          sessionUrl: r['Link da sessão']?.trim() || null,
          contactStatus: status,
        };
        const changed = Object.entries(patch)
          .filter(([k, v]) => ((lead as Record<string, unknown>)[k] ?? null) !== v)
          .map(([k]) => k);
        const cur = changed.length ? await updateLead(tx, lead.id, patch) : lead;
        const before = report.deals;
        await ensureImportDeal(tx, cur, report);
        const evidence = dncEvidence({
          notes: [cur.notes, r['Observações']].join(' '),
          responseOrObjection: cur.responseOrObjection,
          nextAction: cur.nextAction,
        });
        if (evidence.length && ['lost', 'discarded'].includes(cur.contactStatus))
          report.dncCandidates.push({
            id: cur.id,
            name: cur.name,
            status: statusLabel[cur.contactStatus],
            evidence,
          });
        if (changed.length || report.deals > before) done('update', undefined, changed);
        else done('unchanged');
      } catch (e) {
        done('error', (e as Error).message);
      }
    }
  });
  return report;
}
