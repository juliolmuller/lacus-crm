import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import { applyMapping, autoMapHeaders, HEADERS } from '@/lib/leads/csv';
import { parseFilters } from '@/lib/leads/filters-server';
import { exportLeadsCsv } from '@/lib/services/export';
import { importLeads } from '@/lib/services/import';
import { importApiUsage, importQueue, importTopLeads } from '@/lib/services/import-catalog';
import { listLeads } from '@/lib/services/lead-list';

import { inTx, schema } from './db';

const {
  niches,
  leads,
  deals,
  dealStageHistory,
  interactions,
  apiUsageLog,
  prospectingQueue,
  dealStages,
} = schema;

const read = (f: string): string =>
  readFileSync(`tests/fixtures/${f}`, 'utf8').replace(/^\ufeff/, '');
const table = (csv: string): Array<Record<string, string>> =>
  Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data;
const canonical = (csv: string): Array<Record<string, string>> => {
  const rows = table(csv);
  const map = autoMapHeaders(Object.keys(rows[0]!));

  return rows.map((r) => applyMapping(r, map));
};
const opts = { insertOnly: false, dryRun: false };

type Tx = Parameters<Parameters<typeof inTx>[0]>[0];
async function seed(tx: Tx): Promise<void> {
  await tx.insert(niches).values([
    { name: 'Clínicas de teste', ticket: 'high' },
    { name: 'Estúdios de teste', ticket: 'low' },
  ]);
  await tx
    .insert(dealStages)
    .values([
      { key: 'to_diagnose', name: 'A diagnosticar', color: 'stage-1', sort: 1 },
      { key: 'negotiating', name: 'Em negociação', color: 'stage-5', sort: 5 },
      { key: 'lost', name: 'Perdido', color: 'stage-lost', sort: 7, isLost: true },
    ])
    .onConflictDoNothing();
}

describe('importLeads', () => {
  it('dry-run conta sem gravar', async () => {
    await inTx(async (tx) => {
      await seed(tx);

      const r = await importLeads(tx, canonical(read('leads-sample.csv')), {
        ...opts,
        dryRun: true,
      });

      expect([r.created, r.errors]).toEqual([4, 1]);
      expect(await tx.select().from(leads)).toHaveLength(0);
    });
  });

  it('accepts the legacy pt-BR headers and gives the same result as the English ones', async () => {
    await inTx(async (tx) => {
      await seed(tx);

      const legacy = await importLeads(tx, canonical(read('leads-sample-legacy-headers.csv')), {
        ...opts,
        dryRun: true,
      });
      const english = await importLeads(tx, canonical(read('leads-sample.csv')), {
        ...opts,
        dryRun: true,
      });

      expect(legacy).toEqual(english);
      expect([english.created, english.errors]).toEqual([4, 1]);
    });
  });

  it('exports English headers and the export can be imported back', async () => {
    await inTx(async (tx) => {
      await seed(tx);
      await importLeads(tx, canonical(read('leads-sample.csv')), opts);

      const csv = (await exportLeadsCsv(tx, parseFilters({}), ',')).replace(/^\ufeff/, '');
      const rows = table(csv);

      expect(Object.keys(rows[0]!)).toEqual(HEADERS);

      const back = await importLeads(tx, canonical(csv), opts);

      expect([back.created, back.updated, back.errors]).toEqual([0, 0, 0]);
      expect(back.unchanged).toBe(4);
    });
  });

  it('cria, relata divergências e gera histórico e negociações', async () => {
    await inTx(async (tx) => {
      await seed(tx);

      const r = await importLeads(tx, canonical(read('leads-sample.csv')), opts);

      expect([r.created, r.updated, r.unchanged, r.skipped, r.errors]).toEqual([4, 0, 0, 0, 1]);
      expect(r.rows.find((x) => x.action === 'error')?.reason).toContain('nicho desconhecido');
      // 85 e 30 batem com o calculado; 40 e 99 divergem
      expect(r.scoreDivergences.map((d) => [d.sheet, d.computed])).toEqual([
        [40, 45],
        [99, 40],
      ]);
      expect(r.newRegions).toEqual([
        'PR - Curitiba - Xaxim',
        'PR - Curitiba - Boqueirão',
        'PR - Curitiba',
        'PR - Curitiba - Hauer',
      ]);
      expect(r.ticketMismatches.map((m) => [m.name, m.sheet, m.niche])).toEqual([
        ['Escritório Exemplo Dois', 'medium', 'high'],
        ['Loja Exemplo Quatro', 'high', 'low'],
      ]);

      // status desconhecido → new + nota
      const [q] = await tx.select().from(leads).where(eq(leads.name, 'Loja Exemplo Quatro'));

      expect(q).toMatchObject({ contactStatus: 'new', notes: '[status original: Em análise]' });

      // histórico: 2 leads com data de contato → 2 interações outbound 12:00 BRT
      const ints = await tx.select().from(interactions);

      expect(ints).toHaveLength(2);
      expect(ints.every((i) => i.createdBy === 'import' && i.direction === 'outbound')).toBe(true);
      expect(ints.map((i) => i.occurredAt.toISOString()).sort()).toEqual([
        '2026-11-15T15:00:00.000Z',
        '2026-11-18T15:00:00.000Z',
      ]);

      // negociações: negociando (com valor) e perdido
      const d = await tx.select().from(deals);

      expect(d.map((x) => [x.title, x.status, x.value]).sort()).toEqual([
        ['Escritório Exemplo Dois', 'open', '2500.00'],
        ['Studio Exemplo Três', 'lost', null],
      ]);
      expect((await tx.select().from(dealStageHistory)).every((h) => h.source === 'import')).toBe(
        true,
      );
    });
  });

  it('reimportar não muda nada; somente novos ignora os existentes', async () => {
    await inTx(async (tx) => {
      await seed(tx);

      const rows = canonical(read('leads-sample.csv'));

      await importLeads(tx, rows, opts);

      const before = await tx.select().from(leads).orderBy(leads.id);
      const again = await importLeads(tx, rows, opts);

      expect([
        again.created,
        again.updated,
        again.unchanged,
        again.deals,
        again.interactions,
      ]).toEqual([0, 0, 4, 0, 0]);
      expect(await tx.select().from(leads).orderBy(leads.id)).toEqual(before); // inclusive updated_at

      const only = await importLeads(tx, rows, { ...opts, insertOnly: true });

      expect([only.skipped, only.unchanged]).toEqual([4, 0]);
    });
  });

  it('atualiza só o que mudou e recalcula o score', async () => {
    await inTx(async (tx) => {
      await seed(tx);

      const rows = canonical(read('leads-sample.csv'));

      await importLeads(tx, rows, opts);

      const changed = rows.map((r) =>
        r['Nome do negócio'] === 'Clínica Exemplo Um' ? { ...r, 'Situação do site': 'Bom' } : r,
      );
      const rep = await importLeads(tx, changed, opts);

      expect([rep.updated, rep.unchanged]).toEqual([1, 3]);
      expect(rep.rows.find((x) => x.action === 'update')?.changed).toEqual(['websiteStatus']);

      const [l] = await tx.select().from(leads).where(eq(leads.name, 'Clínica Exemplo Um'));

      expect(l!.score).toBe(55);
    });
  });

  it('exportar e reimportar dá o mesmo resultado', async () => {
    await inTx(async (tx) => {
      await seed(tx);
      await importLeads(tx, canonical(read('leads-sample.csv')), opts);

      const before = await tx.select().from(leads).orderBy(leads.id);
      for (const delimiter of [';', ','] as const) {
        const csv = await exportLeadsCsv(tx, parseFilters({ dnc: 'show' }), delimiter);

        expect(csv.startsWith('﻿')).toBe(true);

        const again = await importLeads(tx, canonical(csv.replace(/^\ufeff/, '')), opts);

        expect([
          again.created,
          again.updated,
          again.unchanged,
          again.errors,
          again.deals,
          again.interactions,
        ]).toEqual([0, 0, 4, 0, 0, 0]);
        expect(await tx.select().from(leads).orderBy(leads.id)).toEqual(before);
      }
      // exportar respeitando filtros
      const filtered = await exportLeadsCsv(tx, parseFilters({ status: 'lost' }));

      expect(table(filtered.replace(/^\ufeff/, ''))).toHaveLength(1);
    });
  });
});

describe('listLeads', () => {
  it('pagina por cursor sem repetir nem perder linhas, nas duas direções', async () => {
    await inTx(async (tx) => {
      await seed(tx);
      await importLeads(tx, canonical(read('leads-sample.csv')), opts);
      for (const dir of ['asc', 'desc'] as const) {
        for (const sort of ['score', 'name', 'updated', 'priority'] as const) {
          const f = parseFilters({ sort, dir, dnc: 'show' });
          const seen: string[] = [];
          let cursor: null | string = null;

          do {
            const page: Awaited<ReturnType<typeof listLeads>> = await listLeads(tx, f, cursor, 3);

            seen.push(...page.rows.map((r) => r.id));
            cursor = page.nextCursor;
          } while (cursor);

          expect(seen).toHaveLength(4);
          expect(new Set(seen).size).toBe(4);
        }
      }
    });
  });

  it('busca por nome (sem acento), telefone em dígitos e bairro', async () => {
    await inTx(async (tx) => {
      await seed(tx);
      await importLeads(tx, canonical(read('leads-sample.csv')), opts);

      const find = async (q: string): Promise<string[]> =>
        (await listLeads(tx, parseFilters({ q }), null)).rows.map((r) => r.name);

      expect(await find('clinica exemplo')).toEqual(['Clínica Exemplo Um']);
      expect(await find('99999 0001')).toEqual(['Clínica Exemplo Um']); // só os dígitos contam
      expect(await find('(41) 99999-0001')).toEqual(['Clínica Exemplo Um']);
      expect(await find('Boqueirão')).toEqual(['Escritório Exemplo Dois']);
      expect(await find('@exemplo1')).toEqual(['Clínica Exemplo Um']);
    });
  });
});

describe('importadores de catálogo', () => {
  it('fila: cria, mapeia status e reimportar não muda; sort_order é preservado', async () => {
    await inTx(async (tx) => {
      await seed(tx);

      const rows = table(read('queue-sample.csv'));

      expect(await importQueue(tx, rows, { dryRun: false })).toMatchObject({
        created: 3,
        errors: 0,
      });

      const q = await tx.select().from(prospectingQueue).orderBy(prospectingQueue.position);

      expect(q.map((x) => [x.status, x.leadsAdded])).toEqual([
        ['done', 4],
        ['done', 0],
        ['pending', 0],
      ]);
      await tx
        .update(prospectingQueue)
        .set({ sortOrder: 99 })
        .where(eq(prospectingQueue.position, 3));
      expect(await importQueue(tx, rows, { dryRun: false })).toMatchObject({
        created: 0,
        updated: 0,
        unchanged: 3,
      });
      expect(
        (await tx.select().from(prospectingQueue).where(eq(prospectingQueue.position, 3)))[0]!
          .sortOrder,
      ).toBe(99);
    });
  });

  it('uso da API: ignora o bloco do topo, "-" vira null e reimportar não duplica', async () => {
    await inTx(async (tx) => {
      const matrix = Papa.parse<string[]>(read('api-usage-sample.csv'), {
        skipEmptyLines: false,
      }).data;

      expect(await importApiUsage(tx, matrix, { dryRun: false })).toMatchObject({ created: 3 });

      const rows = await tx.select().from(apiUsageLog).orderBy(apiUsageLog.id);

      expect(rows.map((r) => [r.queuePosition, r.at])).toEqual([
        [null, '13:10:00'],
        [1, '14:01:00'],
        [2, '06:36:00'],
      ]);
      expect(await importApiUsage(tx, matrix, { dryRun: false })).toMatchObject({
        created: 0,
        unchanged: 3,
      });
    });
  });

  it('top leads: sobrepõe prioridade/sessão/status, cria negociação (D4) e é idempotente', async () => {
    await inTx(async (tx) => {
      await seed(tx);
      await importLeads(tx, canonical(read('leads-sample.csv')), opts);
      await tx.delete(deals); // parte do zero para ver a regra D4

      const rows = table(read('top-leads-sample.csv'));
      const r = await importTopLeads(tx, rows, { dryRun: false });

      expect([r.updated, r.errors, r.deals]).toEqual([3, 1, 2]);

      const [one] = await tx
        .select()
        .from(leads)
        .where(eq(leads.id, '11111111-1111-4111-8111-111111111111'));

      expect(one).toMatchObject({ priority: 1, sessionUrl: 'https://example.com/s/1' });

      const [three] = await tx
        .select()
        .from(leads)
        .where(eq(leads.id, '33333333-3333-4333-8333-333333333333'));

      expect(three!.contactStatus).toBe('discarded');
      expect(r.dncCandidates.map((c) => c.name)).toEqual(['Studio Exemplo Três']);

      const d = await tx
        .select({ s: dealStages.key, st: deals.status })
        .from(deals)
        .innerJoin(dealStages, eq(dealStages.id, deals.stageId));

      expect(d.map((x) => x.s).sort()).toEqual(['negotiating', 'to_diagnose']); // descartado não ganha deal
      expect((await tx.select().from(dealStageHistory)).every((h) => h.source === 'import')).toBe(
        true,
      );

      const again = await importTopLeads(tx, rows, { dryRun: false });

      expect([again.updated, again.unchanged, again.deals]).toEqual([0, 3, 0]);
    });
  });
});
