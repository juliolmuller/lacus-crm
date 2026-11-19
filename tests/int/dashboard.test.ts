import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Db } from '@/lib/db';
import { getDashboard, kpis, funnel, type DashboardFilters } from '@/lib/services/dashboard';
import { inTx, schema } from './db';

const {
  leads,
  niches,
  regions,
  dealStages,
  deals,
  dealStageHistory,
  interactions,
  reminders,
  prospectingQueue,
  apiUsageLog,
  googleConnections,
} = schema;

// Quinta-feira 19/11/2026, 12:00 em São Paulo.
const NOW = new Date('2026-11-19T15:00:00Z');
const at = (s: string) => new Date(s);
const all: DashboardFilters = { period: 'all' };

const D2 = [
  ['to_diagnose', 'A diagnosticar', 1, 5],
  ['to_contact', 'A abordar', 2, 10],
  ['contacted', 'Abordado', 3, 20],
  ['talking', 'Em conversa', 4, 35],
  ['negotiating', 'Em negociação', 5, 60],
  ['won', 'Ganho', 6, 100],
  ['lost', 'Perdido', 7, 0],
] as const;

/** Mundo fixo (SQL à mão): os números esperados abaixo foram contados na mão, linha por linha. */
async function world(tx: Db) {
  const [A, B] = await tx
    .insert(niches)
    .values([
      { name: 'Nicho A', ticket: 'alto' },
      { name: 'Nicho B', ticket: 'baixo' },
    ])
    .returning();
  const [R1, R2, R3] = await tx
    .insert(regions)
    .values([
      { state: 'PR', city: 'Curitiba', neighborhood: 'Xaxim', label: 'PR - Curitiba - Xaxim' },
      { state: 'PR', city: 'Curitiba', neighborhood: 'Batel', label: 'PR - Curitiba - Batel' },
      { state: 'PR', city: 'Pinhais', label: 'PR - Pinhais' },
    ])
    .returning();
  const stages = await tx
    .insert(dealStages)
    .values(
      D2.map(([key, name, sort, p]) => ({
        key,
        name,
        sort,
        color: 'stage-1',
        isWon: key === 'won',
        isLost: key === 'lost',
        defaultProbability: p,
      })),
    )
    .returning();
  const st = Object.fromEntries(stages.map((s) => [s.key, s.id])) as Record<string, number>;

  const mk = (
    n: number,
    niche: { id: number },
    region: { id: number },
    o: Partial<typeof leads.$inferInsert>,
  ) => ({
    name: `Lead ${n}`,
    nameNormalized: `lead ${n}`,
    nicheId: niche.id,
    regionId: region.id,
    ...o,
  });
  const [L1, L2, L3, L4, L5, , L7] = await tx
    .insert(leads)
    .values([
      mk(1, A!, R1!, { contactStatus: 'contacted', score: 80, includedAt: '2026-11-10' }),
      mk(2, A!, R1!, { contactStatus: 'replied', score: 60, includedAt: '2026-11-15' }),
      mk(3, B!, R2!, { contactStatus: 'new', score: 30, includedAt: '2026-11-18', priority: 2 }),
      mk(4, B!, R2!, {
        contactStatus: 'to_contact',
        score: 75,
        includedAt: '2026-09-01',
        priority: 1,
      }),
      mk(5, A!, R2!, { contactStatus: 'lost', score: 20, includedAt: '2026-10-01' }),
      mk(6, A!, R1!, {
        contactStatus: 'new',
        score: 90,
        includedAt: '2026-11-17',
        doNotContact: true,
      }),
      mk(7, B!, R1!, {
        contactStatus: 'new',
        score: 50,
        includedAt: '2026-11-19',
        dataSource: 'mcp',
        createdAt: at('2026-11-19T14:00:00Z'),
      }),
    ])
    .returning();

  const ix = (
    lead: { id: string },
    type: 'whatsapp' | 'call' | 'note',
    direction: 'outbound' | 'inbound' | 'internal',
    when: string,
  ) => ({
    leadId: lead.id,
    type,
    direction,
    summary: `${type} ${direction}`,
    occurredAt: at(when),
  });
  await tx.insert(interactions).values([
    ix(L1!, 'whatsapp', 'outbound', '2026-11-10T13:00:00Z'),
    ix(L1!, 'whatsapp', 'inbound', '2026-11-11T13:00:00Z'),
    ix(L2!, 'call', 'outbound', '2026-11-16T13:00:00Z'),
    ix(L2!, 'whatsapp', 'inbound', '2026-11-16T14:00:00Z'),
    ix(L3!, 'whatsapp', 'outbound', '2026-11-18T13:00:00Z'),
    ix(L4!, 'whatsapp', 'outbound', '2026-09-01T13:00:00Z'),
    ix(L4!, 'whatsapp', 'inbound', '2026-09-02T13:00:00Z'),
    ix(L5!, 'note', 'internal', '2026-11-01T13:00:00Z'), // nota não conta como contato
    ix(L5!, 'whatsapp', 'inbound', '2026-11-02T13:00:00Z'), // inbound sem outbound
  ]);

  const deal = (
    lead: { id: string },
    stage: string,
    n: number,
    o: Partial<typeof deals.$inferInsert>,
  ) => ({
    leadId: lead.id,
    stageId: st[stage]!,
    title: `Deal ${n}`,
    position: `a${n}`,
    ...o,
  });
  const [D1, D2_, D3, D4, D5, D6] = await tx
    .insert(deals)
    .values([
      deal(L1!, 'talking', 1, { value: '1000', createdAt: at('2026-11-01T12:00:00Z') }),
      deal(L2!, 'negotiating', 2, {
        value: '2000',
        probability: 50,
        createdAt: at('2026-11-02T12:00:00Z'),
      }),
      deal(L3!, 'contacted', 3, { createdAt: at('2026-11-18T12:00:00Z') }),
      deal(L4!, 'won', 4, {
        status: 'won',
        value: '3000',
        wonAt: at('2026-11-05T12:00:00Z'),
        createdAt: at('2026-10-25T12:00:00Z'),
      }),
      deal(L5!, 'lost', 5, {
        status: 'lost',
        value: '500',
        lostAt: at('2026-10-01T12:00:00Z'),
        createdAt: at('2026-09-20T12:00:00Z'),
      }),
      deal(L7!, 'won', 6, {
        status: 'won',
        value: '800',
        wonAt: at('2026-09-15T12:00:00Z'),
        createdAt: at('2026-09-05T12:00:00Z'),
      }),
    ])
    .returning();

  // Histórico: D2 pulou "A abordar"; D6 pulou até Ganho; D5 foi perdido depois de Abordado.
  const path = (d: { id: string }, keys: string[], day: string) =>
    keys.map((k, i) => ({
      dealId: d.id,
      fromStageId: i ? st[keys[i - 1]!]! : null,
      toStageId: st[k]!,
      movedAt: at(`${day}T${String(10 + i).padStart(2, '0')}:00:00Z`),
    }));
  await tx
    .insert(dealStageHistory)
    .values([
      ...path(D1!, ['to_diagnose', 'to_contact', 'contacted', 'talking'], '2026-11-03'),
      ...path(D2_!, ['to_diagnose', 'contacted', 'talking', 'negotiating'], '2026-11-04'),
      ...path(D3!, ['to_diagnose', 'to_contact', 'contacted'], '2026-11-18'),
      ...path(D4!, ['to_contact', 'contacted', 'talking', 'negotiating', 'won'], '2026-10-26'),
      ...path(D5!, ['to_diagnose', 'to_contact', 'contacted', 'lost'], '2026-09-21'),
      ...path(D6!, ['to_diagnose', 'to_contact', 'won'], '2026-09-06'),
    ]);

  const rem = (lead: { id: string }, title: string, due: string, o: object = {}) => ({
    leadId: lead.id,
    title,
    dueAt: at(due),
    ...o,
  });
  await tx
    .insert(reminders)
    .values([
      rem(L1!, 'R1 atrasado', '2026-11-18T12:00:00Z'),
      rem(L2!, 'R2 atrasado', '2026-11-19T11:00:00Z'),
      rem(L1!, 'R3 hoje', '2026-11-19T20:00:00Z'),
      rem(L3!, 'R4 próximo', '2026-11-21T12:00:00Z'),
      rem(L3!, 'R5 próximo', '2026-11-26T12:00:00Z'),
      rem(L3!, 'R6 fora dos 7 dias', '2026-11-27T12:00:00Z'),
      rem(L4!, 'R7 feito', '2026-11-18T12:00:00Z', { status: 'done' }),
      rem(L4!, 'R8 cancelado', '2026-11-18T12:00:00Z', { status: 'canceled' }),
    ]);

  await tx.insert(apiUsageLog).values([
    { day: '2026-11-19', at: '09:00', requests: 20, leadsSaved: 5 },
    { day: '2026-11-19', at: '10:00', requests: 15, leadsSaved: 3 },
    { day: '2026-11-17', at: '09:00', requests: 10, leadsSaved: 2 },
    { day: '2026-11-05', at: '09:00', requests: 99, leadsSaved: 9 }, // fora dos 14 dias
  ]);
  const q = (
    position: number,
    sortOrder: number,
    region: { id: number },
    niche: { id: number },
    o: object,
  ) => ({
    position,
    sortOrder,
    regionId: region.id,
    nicheId: niche.id,
    ...o,
  });
  await tx.insert(prospectingQueue).values([
    q(1, 5, R1!, A!, { status: 'done' }),
    q(2, 4, R1!, B!, { status: 'error' }),
    q(3, 2, R2!, A!, {}),
    q(4, 1, R2!, B!, { skippedAt: at('2026-11-18T12:00:00Z') }), // pulado: não é o próximo
    q(5, 3, R3!, A!, {}),
  ]);
  return { A: A!, B: B!, R1: R1!, R2: R2!, st };
}

describe('dashboard: números batem com o SQL à mão', () => {
  it('KPIs por período: novos, abordados, resposta, ganho, valor em aberto, score', async () => {
    await inTx(async (tx) => {
      await world(tx);
      const k30 = await kpis(tx, { period: 30 }, NOW);
      expect(k30.newLeads).toBe(5); // L1, L2, L3, L6, L7 (L4 e L5 são mais antigos)
      expect(k30.contacted).toBe(3); // L1, L2, L3
      expect(k30.responseRate).toEqual({ rate: 2 / 3, replied: 2, contacted: 3 });
      expect(k30.winRate).toEqual({ rate: 1, won: 1, lost: 0 });
      // aberto: 1000 (prob. da etapa 35%) + 2000 (prob. 50%) + sem valor
      expect(k30.openValue).toEqual({ value: 3000, weighted: 1350, deals: 3 });
      // L3 (30), L4 (75), L7 (50); L6 tem "Não contatar"
      expect(k30.avgScore).toBeCloseTo(155 / 3);

      const k7 = await kpis(tx, { period: 7 }, NOW);
      expect(k7.newLeads).toBe(4);
      expect(k7.responseRate).toEqual({ rate: 1 / 2, replied: 1, contacted: 2 });
      expect(k7.winRate).toEqual({ rate: null, won: 0, lost: 0 });

      const k90 = await kpis(tx, { period: 90 }, NOW);
      expect(k90.newLeads).toBe(7);
      expect(k90.winRate).toEqual({ rate: 2 / 3, won: 2, lost: 1 });

      const kAll = await kpis(tx, all, NOW);
      expect(kAll.responseRate).toEqual({ rate: 3 / 4, replied: 3, contacted: 4 });
    });
  });

  it('denominador zero vira null, e zero respostas é 0% (não null)', async () => {
    await inTx(async (tx) => {
      const { A, B, R2 } = await world(tx);
      // só L5 (inbound sem outbound): ninguém foi abordado
      const none = await kpis(tx, { period: 'all', niche: A.id, region: R2.id }, NOW);
      expect(none.contacted).toBe(0);
      expect(none.responseRate).toEqual({ rate: null, replied: 0, contacted: 0 });
      // nicho B, 7 dias: L3 foi abordado e não respondeu
      const zero = await kpis(tx, { period: 7, niche: B.id }, NOW);
      expect(zero.responseRate).toEqual({ rate: 0, replied: 0, contacted: 1 });
    });
  });

  it('banco vazio: tudo zerado, taxas e score nulos, sem erro', async () => {
    await inTx(async (tx) => {
      const d = await getDashboard(tx, { period: 30 }, NOW);
      expect(d.kpis).toEqual({
        newLeads: 0,
        contacted: 0,
        responseRate: { rate: null, replied: 0, contacted: 0 },
        winRate: { rate: null, won: 0, lost: 0 },
        openValue: { value: 0, weighted: 0, deals: 0 },
        avgScore: null,
      });
      expect(d.funnel).toEqual([]);
      expect(d.bestNext).toEqual([]);
      expect(d.activity).toEqual([]);
      expect(d.distributions.status).toEqual([]);
      expect(d.prospecting.series).toHaveLength(14);
      expect(d.prospecting.requestsToday).toBe(0);
      expect(d.prospecting.next).toBeNull();
      expect(d.followups.counts).toEqual({ overdue: 0, today: 0, next7: 0 });
    });
  });

  it('follow-ups: atrasados, hoje e próximos 7 dias (e o filtro de nicho)', async () => {
    await inTx(async (tx) => {
      const { B } = await world(tx);
      const d = await getDashboard(tx, all, NOW);
      expect(d.followups.counts).toEqual({ overdue: 2, today: 1, next7: 2 });
      expect(d.followups.overdue.map((r) => r.title)).toEqual(['R1 atrasado', 'R2 atrasado']);
      expect(d.followups.today.map((r) => r.title)).toEqual(['R3 hoje']);
      expect(d.followups.next7.map((r) => r.title)).toEqual(['R4 próximo', 'R5 próximo']);
      const b = await getDashboard(tx, { period: 'all', niche: B.id }, NOW);
      expect(b.followups.counts).toEqual({ overdue: 0, today: 0, next7: 2 });
    });
  });

  it('funil: barras por etapa e conversão sobre o histórico (com etapas puladas)', async () => {
    await inTx(async (tx) => {
      await world(tx);
      const f = await funnel(tx, all, NOW);
      const by = Object.fromEntries(f.map((s) => [s.key, s]));
      expect(f.map((s) => s.key)).toEqual(D2.map(([k]) => k));
      expect([by.talking!.count, by.talking!.value]).toEqual([1, 1000]);
      expect([by.negotiating!.count, by.negotiating!.value]).toEqual([1, 2000]);
      expect([by.contacted!.count, by.contacted!.value]).toEqual([1, 0]);
      expect([by.won!.count, by.won!.value]).toEqual([2, 3800]);
      expect([by.lost!.count, by.lost!.value]).toEqual([1, 500]);
      // chegaram a cada etapa: 6, 6, 6, 4, 3, 2 (D2 e D6 pularam etapas, D5 foi perdido em Abordado)
      expect(f.filter((s) => !s.isLost).map((s) => s.reached)).toEqual([6, 6, 6, 4, 3, 2]);
      expect(f.filter((s) => s.toNext).map((s) => s.toNext!.rate)).toEqual([
        1,
        1,
        4 / 6,
        3 / 4,
        2 / 3,
      ]);
      expect(by.won!.toNext).toBeNull();
      expect(by.lost!.toNext).toBeNull();

      // 30 dias: coorte = deals criados desde 21/10 (D1 a D4); ganho/perdido só do período
      const f30 = await funnel(tx, { period: 30 }, NOW);
      const b30 = Object.fromEntries(f30.map((s) => [s.key, s]));
      expect(f30.filter((s) => !s.isLost).map((s) => s.reached)).toEqual([4, 4, 4, 3, 2, 1]);
      expect(f30.filter((s) => s.toNext).map((s) => s.toNext!.rate)).toEqual([
        1,
        1,
        3 / 4,
        2 / 3,
        1 / 2,
      ]);
      expect([b30.won!.count, b30.won!.value]).toEqual([1, 3000]);
      expect(b30.lost!.count).toBe(0);
    });
  });

  it('funil sem deals: conversão nula (0 ÷ 0), nunca NaN', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await tx.delete(deals);
      const f = await funnel(tx, all, NOW);
      expect(f.filter((s) => s.toNext).map((s) => s.toNext!.rate)).toEqual([
        null,
        null,
        null,
        null,
        null,
      ]);
    });
  });

  it('distribuições: status, nicho, região e faixa de score (limiares 70/40)', async () => {
    await inTx(async (tx) => {
      await world(tx);
      const d = (await getDashboard(tx, all, NOW)).distributions;
      expect(d.status).toEqual([
        { status: 'new', count: 3 },
        { status: 'to_contact', count: 1 },
        { status: 'contacted', count: 1 },
        { status: 'replied', count: 1 },
        { status: 'lost', count: 1 },
      ]);
      expect(d.niche).toEqual([
        { label: 'Nicho A', count: 4 },
        { label: 'Nicho B', count: 3 },
      ]);
      expect(d.region).toEqual([
        { label: 'PR - Curitiba - Xaxim', count: 4 },
        { label: 'PR - Curitiba - Batel', count: 3 },
      ]);
      expect(d.score).toMatchObject({ high: 3, mid: 2, low: 2 });

      const d30 = (await getDashboard(tx, { period: 30 }, NOW)).distributions;
      expect(d30.status.map((s) => [s.status, s.count])).toEqual([
        ['new', 3],
        ['contacted', 1],
        ['replied', 1],
      ]);
      expect(d30.niche).toEqual([
        { label: 'Nicho A', count: 3 },
        { label: 'Nicho B', count: 2 },
      ]);
    });
  });

  it('distribuição de nicho mostra só o top 10', async () => {
    await inTx(async (tx) => {
      const [R] = await tx
        .insert(regions)
        .values({ state: 'PR', city: 'X', label: 'PR - X' })
        .returning();
      const ns = await tx
        .insert(niches)
        .values(Array.from({ length: 12 }, (_, i) => ({ name: `N${String(i).padStart(2, '0')}` })))
        .returning();
      await tx.insert(leads).values(
        ns.flatMap((x, i) =>
          Array.from({ length: i + 1 }, (_, j) => ({
            name: `L${i}-${j}`,
            nicheId: x.id,
            regionId: R!.id,
          })),
        ),
      );
      const d = (await getDashboard(tx, all, NOW)).distributions;
      expect(d.niche).toHaveLength(10);
      expect(d.niche[0]).toEqual({ label: 'N11', count: 12 });
      expect(d.niche[9]).toEqual({ label: 'N02', count: 3 });
    });
  });

  it('prospecção: uso de hoje × orçamento (estourado), sparkline de 14 dias e fila', async () => {
    await inTx(async (tx) => {
      await world(tx);
      const p = (await getDashboard(tx, all, NOW)).prospecting;
      expect(p.budget).toBe(30); // padrão
      expect([p.requestsToday, p.savedToday, p.overBudget]).toEqual([35, 8, true]);
      expect(p.series).toHaveLength(14);
      expect(p.series[0]!.day).toBe('2026-11-06');
      expect(p.series[13]).toEqual({ day: '2026-11-19', requests: 35, saved: 8 });
      expect(p.series[11]).toEqual({ day: '2026-11-17', requests: 10, saved: 2 });
      expect(p.series.reduce((s, d) => s + d.requests, 0)).toBe(45); // o dia 05/11 fica de fora
      expect(p.queue).toEqual({ pending: 2, done: 1, error: 1, skipped: 1 });
      expect(p.next).toEqual({ position: 3, region: 'PR - Curitiba - Batel', niche: 'Nicho A' });
    });
  });

  it('orçamento exatamente no limite não é "passou"', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await tx.insert(apiUsageLog).values({ day: '2026-11-19', at: '11:00', requests: -5 });
      const p = (await getDashboard(tx, all, NOW)).prospecting;
      expect([p.requestsToday, p.overBudget]).toEqual([30, false]);
    });
  });

  it('melhores próximos: new/to_contact, sem "Não contatar", priority 1 primeiro e depois score', async () => {
    await inTx(async (tx) => {
      await world(tx);
      const best = (await getDashboard(tx, all, NOW)).bestNext;
      // L4 (prioridade 1), L3 (prioridade 2), L7 (sem prioridade); L6 é "Não contatar"
      expect(best.map((b) => b.name)).toEqual(['Lead 4', 'Lead 3', 'Lead 7']);
    });
  });

  it('melhores próximos: no máximo 5, empate de prioridade desempata por score', async () => {
    await inTx(async (tx) => {
      const [N] = await tx.insert(niches).values({ name: 'N' }).returning();
      const [R] = await tx
        .insert(regions)
        .values({ state: 'PR', city: 'X', label: 'PR - X' })
        .returning();
      await tx.insert(leads).values(
        [10, 90, 50, 70, 30, 80, 60].map((score) => ({
          name: `S${score}`,
          nicheId: N!.id,
          regionId: R!.id,
          score,
        })),
      );
      const best = (await getDashboard(tx, all, NOW)).bestNext;
      expect(best.map((b) => b.score)).toEqual([90, 80, 70, 60, 50]);
    });
  });

  it('atividade recente: mistura interações, movimentos e leads do MCP, do mais novo ao mais antigo', async () => {
    await inTx(async (tx) => {
      const { B } = await world(tx);
      const a = (await getDashboard(tx, all, NOW)).activity;
      expect(a).toHaveLength(15);
      expect(a.map((x) => x.at.getTime())).toEqual(
        [...a.map((x) => x.at.getTime())].sort((x, y) => y - x),
      );
      expect(a[0]).toMatchObject({ kind: 'mcp_lead', leadName: 'Lead 7' });
      expect(new Set(a.map((x) => x.kind))).toEqual(new Set(['mcp_lead', 'interaction', 'move']));
      const b = (await getDashboard(tx, { period: 'all', niche: B.id }, NOW)).activity;
      expect(b.every((x) => ['Lead 3', 'Lead 4', 'Lead 7'].includes(x.leadName))).toBe(true);
    });
  });

  it('alertas: fila com erro, orçamento estourado, Google e lembretes sem sincronizar', async () => {
    await inTx(async (tx) => {
      await world(tx);
      const base = (await getDashboard(tx, all, NOW)).alerts.map((a) => a.kind);
      expect(base).toEqual(['queue_errors', 'over_budget']);

      const [g] = await tx
        .insert(googleConnections)
        .values({ googleEmail: 'a@b.c', refreshTokenEnc: 'x', status: 'active' })
        .returning();
      await tx.execute(sql`update reminders set sync_status = 'error' where title = 'R1 atrasado'`);
      expect((await getDashboard(tx, all, NOW)).alerts.map((a) => a.kind)).toEqual([
        'sync_errors',
        'queue_errors',
        'over_budget',
      ]);
      await tx.execute(
        sql`update google_connections set status = 'needs_reauth' where id = ${g!.id}`,
      );
      expect((await getDashboard(tx, all, NOW)).alerts.map((a) => a.kind)).toEqual([
        'google_reauth',
        'queue_errors',
        'over_budget',
      ]);
    });
  });
});

describe('dashboard: desempenho', () => {
  it('5.000 leads com deals, interações e lembretes: a tela inteira em < 1,5 s (banco aquecido)', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await tx
        .insert(niches)
        .values(
          Array.from({ length: 17 }, (_, i) => ({ name: `Nicho ${i}`, ticket: 'medio' as const })),
        );
      await tx.insert(regions).values(
        Array.from({ length: 40 }, (_, i) => ({
          state: 'PR',
          city: 'Curitiba',
          neighborhood: `Bairro ${i}`,
          label: `PR - Curitiba - Bairro ${i}`,
        })),
      );
      // ~5.000 leads com status, score, inclusão e nicho/região variados
      await tx.execute(sql`
        insert into leads (name, name_normalized, niche_id, region_id, score, contact_status, included_at, priority, do_not_contact, data_source)
        select 'Perf ' || g, 'perf ' || g,
               (select id from niches order by id offset (g % 19) limit 1),
               (select id from regions order by id offset (g % 43) limit 1),
               (g * 7) % 100,
               (array['new','to_contact','contacted','no_response','replied','negotiating','client','lost','discarded'])[1 + g % 9]::contact_status,
               date '2026-11-19' - (g % 120),
               case when g % 10 = 0 then g % 50 end,
               g % 97 = 0,
               case when g % 13 = 0 then 'mcp' else 'import_sheet' end
        from generate_series(1, 5000) g`);
      // ~1.500 deals (um aberto por lead), com histórico de 1 a 4 etapas
      await tx.execute(sql`
        insert into deals (lead_id, stage_id, title, position, value, status, won_at, lost_at, created_at)
        select l.id, s.id, 'Perf deal ' || l.rn, 'p' || l.rn, (l.rn % 40) * 250,
               case when s.is_won then 'won'::deal_status when s.is_lost then 'lost'::deal_status else 'open'::deal_status end,
               case when s.is_won then timestamptz '2026-11-01' end,
               case when s.is_lost then timestamptz '2026-10-15' end,
               timestamptz '2026-11-19' - (l.rn % 90) * interval '1 day'
        from (select id, row_number() over (order by id) rn from leads where name like 'Perf %' and not do_not_contact) l
        join deal_stages s on s.sort = 1 + l.rn % 7
        where l.rn % 3 = 0`);
      await tx.execute(sql`
        insert into deal_stage_history (deal_id, from_stage_id, to_stage_id, moved_at, source)
        select d.id, null, s.id, d.created_at + (s.sort * interval '1 hour'), 'ui'
        from deals d join deal_stages s on s.sort <= (select sort from deal_stages where id = d.stage_id)
        where d.title like 'Perf deal %'`);
      // ~15.000 interações e ~3.000 lembretes
      await tx.execute(sql`
        insert into interactions (lead_id, type, direction, summary, occurred_at)
        select l.id, (array['whatsapp','call','email','note'])[1 + k % 4]::interaction_type,
               (case when k % 4 = 3 then 'internal' when k % 3 = 0 then 'inbound' else 'outbound' end)::interaction_direction,
               'perf', timestamptz '2026-11-19' - ((l.rn * 7 + k) % 100) * interval '1 day'
        from (select id, row_number() over (order by id) rn from leads where name like 'Perf %') l
        cross join generate_series(1, 3) k`);
      await tx.execute(sql`
        insert into reminders (lead_id, title, due_at)
        select id, 'Perf', timestamptz '2026-11-19 15:00:00+00' + ((rn % 21) - 7) * interval '1 day'
        from (select id, row_number() over (order by id) rn from leads where name like 'Perf %' and not do_not_contact) l
        where rn % 2 = 0`);
      await tx.execute(sql`analyze leads, deals, deal_stage_history, interactions, reminders`);

      const [c] = (
        await tx.execute(
          sql`select (select count(*) from leads) leads, (select count(*) from deals) deals, (select count(*) from interactions) interactions, (select count(*) from reminders) reminders`,
        )
      ).rows as Record<string, string>[];
      expect(Number(c!.leads)).toBeGreaterThanOrEqual(5000);
      expect(Number(c!.deals)).toBeGreaterThan(1500);
      expect(Number(c!.interactions)).toBeGreaterThan(14000);
      expect(Number(c!.reminders)).toBeGreaterThan(2000);

      const filters: DashboardFilters[] = [
        { period: 30 },
        { period: 'all' },
        { period: 7, niche: 3, region: 5 },
      ];
      for (const f of filters) {
        await getDashboard(tx, f, NOW); // aquece (plano, cache)
        const t0 = performance.now();
        const d = await getDashboard(tx, f, NOW);
        const ms = performance.now() - t0;
        console.info(`dashboard (${f.period}): ${ms.toFixed(0)} ms`);
        if (!f.niche) expect(d.kpis.newLeads).toBeGreaterThan(0);
        expect(ms).toBeLessThan(1500);
      }
    });
  }, 120_000);
});
