import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { type Db } from '@/lib/db';
import { parseFilters } from '@/lib/leads/filters-server';
import { createDeal, moveDeal } from '@/lib/services/deals';
import { saveDiagnosis } from '@/lib/services/diagnosis';
import { listLeads } from '@/lib/services/lead-list';

import { inTx, schema } from './db';

const { dealStages, deals, interactions, leads, niches, regions } = schema;

const STAGES = [
  ['to_diagnose', 'A diagnosticar', 1, 'to_contact'],
  ['to_contact', 'A abordar', 2, 'to_contact'],
  ['contacted', 'Abordado', 3, 'contacted'],
  ['won', 'Ganho', 4, 'client'],
  ['lost', 'Perdido', 5, 'lost'],
] as const;

async function world(tx: Db, names: string[] = ['Lead 1']) {
  const [niche] = await tx.insert(niches).values({ name: 'N', ticket: 'high' }).returning();
  const [region] = await tx
    .insert(regions)
    .values({ state: 'PR', city: 'Curitiba', label: 'PR - Curitiba' })
    .returning();

  await tx.insert(dealStages).values(
    STAGES.map(([key, name, sort, leadStatus]) => ({
      color: 'stage-1',
      defaultProbability: 10,
      isLost: key === 'lost',
      isWon: key === 'won',
      key,
      leadStatus,
      name,
      sort,
    })),
  );

  return tx
    .insert(leads)
    .values(
      names.map((name) => ({
        name,
        nameNormalized: name.toLowerCase(),
        nicheId: niche!.id,
        regionId: region!.id,
      })),
    )
    .returning();
}

const stageKey = async (tx: Db, dealId: string): Promise<string> => {
  const [r] = await tx
    .select({ key: dealStages.key })
    .from(deals)
    .innerJoin(dealStages, eq(dealStages.id, deals.stageId))
    .where(eq(deals.id, dealId));

  return r!.key;
};

describe('saveDiagnosis', () => {
  it('grava os campos, registra a nota e move A diagnosticar para A abordar', () =>
    inTx(async (tx) => {
      const [lead] = await world(tx);
      const deal = await createDeal(tx, { leadId: lead!.id, source: 'ui' });
      const r = await saveDiagnosis(tx, {
        actor: 'mcp:teste',
        advance: true,
        diagnosis: 'Site sem HTTPS; Instagram ativo.',
        leadId: lead!.id,
        values: {
          complaints: 'Demora no retorno',
          instagramActive: true,
          ownerRepliesReviews: false,
        },
      });

      expect(r.lead).toMatchObject({
        complaints: 'Demora no retorno',
        contactStatus: 'to_contact',
        instagramActive: true,
        ownerRepliesReviews: false,
      });
      expect(r.dealMoved).toMatchObject({ dealId: deal.id, moved: true });
      expect(await stageKey(tx, deal.id)).toBe('to_contact');

      const [note] = await tx.select().from(interactions).where(eq(interactions.leadId, lead!.id));

      expect(note).toMatchObject({
        body: 'Site sem HTTPS; Instagram ativo.',
        direction: 'internal',
        id: r.interactionId,
        type: 'note',
      });
    }));

  it('com advance falso, não move a negociação', () =>
    inTx(async (tx) => {
      const [lead] = await world(tx);
      const deal = await createDeal(tx, { leadId: lead!.id, source: 'ui' });
      const r = await saveDiagnosis(tx, {
        actor: 'mcp:teste',
        advance: false,
        leadId: lead!.id,
        values: { pitch: 'Novo argumento' },
      });

      expect(r.dealMoved.moved).toBe(false);
      expect(r.interactionId).toBeNull();
      expect(await stageKey(tx, deal.id)).toBe('to_diagnose');
    }));

  it('só move quem está em A diagnosticar e explica quando não move', () =>
    inTx(async (tx) => {
      const [a, b] = await world(tx, ['Lead A', 'Lead B']);
      const deal = await createDeal(tx, { leadId: a!.id, source: 'ui' });
      const stages = await tx.select().from(dealStages);
      const contacted = stages.find((s) => s.key === 'contacted')!;

      await moveDeal(tx, { dealId: deal.id, stageId: contacted.id });

      const adv = await saveDiagnosis(tx, {
        actor: 'mcp:teste',
        advance: true,
        leadId: a!.id,
        values: {},
      });

      expect(adv.dealMoved).toMatchObject({
        moved: false,
        reason: expect.stringContaining('contacted'),
      });
      expect(await stageKey(tx, deal.id)).toBe('contacted');

      const none = await saveDiagnosis(tx, {
        actor: 'mcp:teste',
        advance: true,
        leadId: b!.id,
        values: {},
      });

      expect(none.dealMoved).toMatchObject({
        moved: false,
        reason: expect.stringContaining('negociação'),
      });
    }));
});

describe('busca por prioridade e link da sessão', () => {
  it('filtra e ordena pela menor prioridade', () =>
    inTx(async (tx) => {
      const [a, b, c] = await world(tx, ['Aaa', 'Bbb', 'Ccc']);

      await tx
        .update(leads)
        .set({ priority: 5, sessionUrl: 'https://claude.ai/x' })
        .where(eq(leads.id, a!.id));
      await tx.update(leads).set({ priority: 2 }).where(eq(leads.id, b!.id));

      const base = parseFilters({});
      const top = await listLeads(tx, { ...base, dir: 'asc', hasPriority: true, sort: 'priority' });

      expect(top.rows.map((r) => r.name)).toEqual(['Bbb', 'Aaa']);
      expect(top.rows.find((r) => r.name === 'Aaa')?.sessionUrl).toBe('https://claude.ai/x');

      const pending = await listLeads(tx, {
        ...base,
        dir: 'asc',
        hasPriority: true,
        hasSession: false,
        sort: 'priority',
      });

      expect(pending.rows.map((r) => r.name)).toEqual(['Bbb']);

      const noPrio = await listLeads(tx, { ...base, hasPriority: false });

      expect(noPrio.rows.map((r) => r.id)).toEqual([c!.id]);
    }));
});
