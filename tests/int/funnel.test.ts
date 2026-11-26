import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { type Db } from '@/lib/db';
import {
  createDeal,
  DealError,
  listBoard,
  loseDeal,
  moveDeal,
  winDeal,
} from '@/lib/services/deals';
import { logInteraction } from '@/lib/services/interactions';
import { archiveStage, createStage, listStages } from '@/lib/services/stages';

import { inTx, schema } from './db';

const { leads, niches, regions, dealStages, deals, dealStageHistory, suppressionList } = schema;

const D2 = [
  ['to_diagnose', 'A diagnosticar', 1, 'to_contact'],
  ['to_contact', 'A abordar', 2, 'to_contact'],
  ['contacted', 'Abordado', 3, 'contacted'],
  ['talking', 'Em conversa', 4, 'replied'],
  ['negotiating', 'Em negociação', 5, 'negotiating'],
  ['won', 'Ganho', 6, 'client'],
  ['lost', 'Perdido', 7, 'lost'],
] as const;

async function world(tx: Db, n = 1) {
  const [niche] = await tx.insert(niches).values({ name: 'N', ticket: 'high' }).returning();
  const [region] = await tx
    .insert(regions)
    .values({ state: 'PR', city: 'Curitiba', label: 'PR - Curitiba' })
    .returning();

  await tx.insert(dealStages).values(
    D2.map(([key, name, sort, leadStatus]) => ({
      key,
      name,
      sort,
      leadStatus,
      color: key === 'won' ? 'stage-won' : key === 'lost' ? 'stage-lost' : 'stage-1',
      isWon: key === 'won',
      isLost: key === 'lost',
      defaultProbability: 10,
    })),
  );

  const ls = await tx
    .insert(leads)
    .values(
      Array.from({ length: n }, (_, i) => ({
        name: `Lead ${i + 1}`,
        nameNormalized: `lead ${i + 1}`,
        nicheId: niche!.id,
        regionId: region!.id,
      })),
    )
    .returning();
  const stage = async (key: string) =>
    (await tx.select().from(dealStages).where(eq(dealStages.key, key)))[0]!;
  const lead = async (id: string) => (await tx.select().from(leads).where(eq(leads.id, id)))[0]!;

  return { ls, stage, lead };
}

/**
 * Em sequência: as posições dependem da ordem de criação.
 */
async function openAll(tx: Db, ls: Array<{ id: string }>) {
  const out = [];
  for (const l of ls) out.push(await createDeal(tx, { leadId: l.id, source: 'ui' }));

  return out;
}

describe('createDeal', () => {
  it('abre em A diagnosticar, grava o histórico e leva o lead para A abordar (D3)', async () => {
    await inTx(async (tx) => {
      const { ls, stage, lead } = await world(tx);
      const d = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });

      expect(d).toMatchObject({
        stageId: (await stage('to_diagnose')).id,
        title: 'Lead 1',
        status: 'open',
      });

      const hist = await tx
        .select()
        .from(dealStageHistory)
        .where(eq(dealStageHistory.dealId, d.id));

      expect(hist).toMatchObject([{ fromStageId: null, source: 'ui' }]);
      expect((await lead(ls[0]!.id)).contactStatus).toBe('to_contact');
    });
  });

  it('importação não mexe no status do lead', async () => {
    await inTx(async (tx) => {
      const { ls, lead } = await world(tx);

      await createDeal(tx, { leadId: ls[0]!.id, source: 'import' });
      expect((await lead(ls[0]!.id)).contactStatus).toBe('new');
    });
  });

  it('uma negociação aberta por lead; depois de encerrada, pode abrir outra', async () => {
    await inTx(async (tx) => {
      const { ls } = await world(tx);
      const d = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });

      await expect(createDeal(tx, { leadId: ls[0]!.id, source: 'ui' })).rejects.toMatchObject({
        code: 'OPEN_EXISTS',
      });
      await loseDeal(tx, { dealId: d.id, reason: 'Timing' });
      await expect(createDeal(tx, { leadId: ls[0]!.id, source: 'ui' })).resolves.toBeTruthy();
    });
  });

  it('lead "Não contatar" é recusado com a mensagem do toast', async () => {
    await inTx(async (tx) => {
      const { ls } = await world(tx);

      await tx.update(leads).set({ doNotContact: true }).where(eq(leads.id, ls[0]!.id));
      await expect(createDeal(tx, { leadId: ls[0]!.id, source: 'ui' })).rejects.toMatchObject({
        code: 'DO_NOT_CONTACT',
        message: 'Este lead está marcado como Não contatar.',
      });
    });
  });
});

describe('moveDeal', () => {
  it('sincronia só para frente e histórico de cada passo', async () => {
    await inTx(async (tx) => {
      const { ls, stage, lead } = await world(tx);
      const d = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });

      await moveDeal(tx, { dealId: d.id, stageId: (await stage('contacted')).id });
      expect((await lead(ls[0]!.id)).contactStatus).toBe('contacted');
      await moveDeal(tx, { dealId: d.id, stageId: (await stage('to_contact')).id }); // volta: status não regride
      expect((await lead(ls[0]!.id)).contactStatus).toBe('contacted');
      await moveDeal(tx, { dealId: d.id, stageId: (await stage('talking')).id });
      expect((await lead(ls[0]!.id)).contactStatus).toBe('replied');

      const hist = await tx
        .select()
        .from(dealStageHistory)
        .where(eq(dealStageHistory.dealId, d.id))
        .orderBy(asc(dealStageHistory.id));
      const ids = [];
      for (const k of ['to_diagnose', 'contacted', 'to_contact', 'talking'])
        ids.push((await stage(k)).id);
      expect(hist.map((h) => h.toStageId)).toEqual(ids);
      expect(hist[2]!.fromStageId).toBe((await stage('contacted')).id);
    });
  });

  it('reordena entre vizinhos sem histórico e preserva a ordem', async () => {
    await inTx(async (tx) => {
      const { ls, stage } = await world(tx, 3);
      const [a, b, c] = await openAll(tx, ls);

      await moveDeal(tx, { dealId: c!.id, stageId: a!.stageId, prevId: a!.id, nextId: b!.id });

      const order = await tx
        .select({ id: deals.id })
        .from(deals)
        .where(eq(deals.stageId, (await stage('to_diagnose')).id))
        .orderBy(asc(deals.position));

      expect(order.map((o) => o.id)).toEqual([a!.id, c!.id, b!.id]);
      expect(
        await tx.select().from(dealStageHistory).where(eq(dealStageHistory.dealId, c!.id)),
      ).toHaveLength(1);
    });
  });

  it('chave acima de 50 caracteres rebalanceia a coluna sem trocar a ordem', async () => {
    await inTx(async (tx) => {
      const { ls, stage } = await world(tx, 3);
      const [a, b, c] = await openAll(tx, ls);
      const base = `a0${'V'.repeat(60)}`;

      await tx.update(deals).set({ position: base }).where(eq(deals.id, a!.id));
      await tx
        .update(deals)
        .set({ position: `${base}W` })
        .where(eq(deals.id, c!.id));
      await moveDeal(tx, { dealId: b!.id, stageId: a!.stageId, prevId: a!.id, nextId: c!.id });

      const rows = await tx
        .select({ id: deals.id, p: deals.position })
        .from(deals)
        .where(eq(deals.stageId, (await stage('to_diagnose')).id))
        .orderBy(asc(deals.position));

      expect(rows.map((r) => r.id)).toEqual([a!.id, b!.id, c!.id]);
      expect(rows.every((r) => r.p.length <= 50)).toBe(true);
    });
  });

  it('Ganho/Perdido exigem o diálogo; mover uma encerrada para etapa aberta reabre', async () => {
    await inTx(async (tx) => {
      const { ls, stage } = await world(tx);
      const d = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });

      await expect(
        moveDeal(tx, { dealId: d.id, stageId: (await stage('won')).id }),
      ).rejects.toBeInstanceOf(DealError);
      await loseDeal(tx, { dealId: d.id, reason: 'Sem orçamento', note: 'caro' });

      const reopened = await moveDeal(tx, { dealId: d.id, stageId: (await stage('contacted')).id });

      expect(reopened.deal).toMatchObject({ status: 'open', lostReason: null, lostAt: null });
    });
  });
});

describe('winDeal e loseDeal', () => {
  it('ganhar: valor, data, status do deal e lead vira cliente', async () => {
    await inTx(async (tx) => {
      const { ls, lead } = await world(tx);
      const d = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });
      const won = await winDeal(tx, {
        dealId: d.id,
        value: '1500.00',
        wonAt: new Date('2026-11-10T15:00:00Z'),
      });

      expect(won).toMatchObject({ status: 'won', value: '1500.00', probability: 10 });
      expect(won.wonAt?.toISOString()).toBe('2026-11-10T15:00:00.000Z');
      expect((await lead(ls[0]!.id)).contactStatus).toBe('client');
    });
  });

  it('perder: motivo + texto; lead vira perdido', async () => {
    await inTx(async (tx) => {
      const { ls, lead } = await world(tx);
      const d = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });
      const lost = await loseDeal(tx, {
        dealId: d.id,
        reason: 'Já tem fornecedor',
        note: 'agência X',
      });

      expect(lost).toMatchObject({ status: 'lost', lostReason: 'Já tem fornecedor: agência X' });
      expect((await lead(ls[0]!.id)).contactStatus).toBe('lost');
    });
  });

  it('perder com "Não contatar" roda o fluxo 4.4', async () => {
    await inTx(async (tx) => {
      const { ls, lead } = await world(tx);
      const d = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });

      await loseDeal(tx, { dealId: d.id, reason: 'Não contatar', note: 'pediu para parar' });
      expect(await lead(ls[0]!.id)).toMatchObject({
        doNotContact: true,
        contactStatus: 'discarded',
        doNotContactReason: 'pediu para parar',
      });
      expect(await tx.select().from(suppressionList)).toHaveLength(1);
      await expect(createDeal(tx, { leadId: ls[0]!.id, source: 'ui' })).rejects.toMatchObject({
        code: 'DO_NOT_CONTACT',
      });
    });
  });
});

describe('logInteraction (efeitos do D3)', () => {
  it('1º outbound: Abordado, último contato e negociação sai de A diagnosticar', async () => {
    await inTx(async (tx) => {
      const { ls, stage, lead } = await world(tx);
      const d = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });
      const at = new Date('2026-11-12T13:00:00Z');
      const { interaction } = await logInteraction(tx, {
        leadId: ls[0]!.id,
        type: 'whatsapp',
        direction: 'outbound',
        summary: 'Mensagem 1',
        occurredAt: at,
      });

      expect(interaction.dealId).toBe(d.id);

      const l = await lead(ls[0]!.id);

      expect(l).toMatchObject({ contactStatus: 'contacted', channel: 'WhatsApp' });
      expect(l.lastContactAt?.toISOString()).toBe(at.toISOString());

      const [moved] = await tx.select().from(deals).where(eq(deals.id, d.id));

      expect(moved!.stageId).toBe((await stage('contacted')).id);

      const hist = await tx
        .select()
        .from(dealStageHistory)
        .where(eq(dealStageHistory.dealId, d.id))
        .orderBy(asc(dealStageHistory.id));

      expect(hist.at(-1)).toMatchObject({ source: 'rule' });
    });
  });

  it('inbound: Respondeu + Em conversa; quem está mais adiante não regride', async () => {
    await inTx(async (tx) => {
      const { ls, stage, lead } = await world(tx, 2);
      const d1 = await createDeal(tx, { leadId: ls[0]!.id, source: 'ui' });

      await logInteraction(tx, {
        leadId: ls[0]!.id,
        type: 'whatsapp',
        direction: 'inbound',
        outcome: 'replied',
        summary: 'Respondeu',
      });
      expect((await lead(ls[0]!.id)).contactStatus).toBe('replied');
      expect((await tx.select().from(deals).where(eq(deals.id, d1.id)))[0]!.stageId).toBe(
        (await stage('talking')).id,
      );

      const d2 = await createDeal(tx, { leadId: ls[1]!.id, stageKey: 'negotiating', source: 'ui' });

      await logInteraction(tx, {
        leadId: ls[1]!.id,
        type: 'call',
        direction: 'inbound',
        summary: 'Ligou',
      });
      expect((await lead(ls[1]!.id)).contactStatus).toBe('negotiating');
      expect((await tx.select().from(deals).where(eq(deals.id, d2.id)))[0]!.stageId).toBe(
        (await stage('negotiating')).id,
      );
    });
  });

  it('nota não muda nada; outcome opt_out aplica "Não contatar"', async () => {
    await inTx(async (tx) => {
      const { ls, lead } = await world(tx);

      await logInteraction(tx, {
        leadId: ls[0]!.id,
        type: 'note',
        direction: 'internal',
        summary: 'anotação',
      });
      expect((await lead(ls[0]!.id)).contactStatus).toBe('new');
      await logInteraction(tx, {
        leadId: ls[0]!.id,
        type: 'whatsapp',
        direction: 'inbound',
        outcome: 'opt_out',
        summary: 'Não quero',
      });
      expect(await lead(ls[0]!.id)).toMatchObject({
        doNotContact: true,
        contactStatus: 'discarded',
      });
      expect(await tx.select().from(suppressionList)).toHaveLength(1);
    });
  });
});

describe('listBoard e etapas', () => {
  it('colunas em ordem com contagem, total e cartões por posição', async () => {
    await inTx(async (tx) => {
      const { ls } = await world(tx, 2);

      await createDeal(tx, { leadId: ls[0]!.id, value: '100.00', source: 'ui' });
      await createDeal(tx, { leadId: ls[1]!.id, value: '250.50', source: 'ui' });

      const { stages, cards } = await listBoard(tx);

      expect(stages.map((s) => s.key)).toEqual(D2.map((s) => s[0]));
      expect(stages[0]).toMatchObject({ count: 2, total: '350.50' });
      expect(cards.map((c) => c.leadName)).toEqual(['Lead 1', 'Lead 2']);
    });
  });

  it('nova etapa entra antes de Ganho; arquivar exige coluna vazia', async () => {
    await inTx(async (tx) => {
      const { ls } = await world(tx);
      const s = await createStage(tx, {
        name: 'Proposta enviada',
        color: 'stage-5',
        defaultProbability: 40,
        leadStatus: 'negotiating',
      });
      const all = await tx.select().from(dealStages).orderBy(asc(dealStages.sort));

      expect(all.map((x) => x.key).slice(-3)).toEqual(['proposta_enviada', 'won', 'lost']);

      const d = await createDeal(tx, { leadId: ls[0]!.id, stageKey: s.key, source: 'ui' });

      expect((await listStages(tx)).find((r) => r.stage.id === s.id)?.open).toBe(1);
      await expect(archiveStage(tx, s.id, true)).rejects.toBeInstanceOf(DealError);
      await moveDeal(tx, {
        dealId: d.id,
        stageId: (await tx.select().from(dealStages).where(eq(dealStages.key, 'contacted')))[0]!.id,
      });
      await archiveStage(tx, s.id, true);
      await expect(
        archiveStage(
          tx,
          (await tx.select().from(dealStages).where(eq(dealStages.key, 'won')))[0]!.id,
          true,
        ),
      ).rejects.toBeInstanceOf(DealError);
    });
  });
});
