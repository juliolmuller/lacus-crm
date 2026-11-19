import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { sha256 } from '@/lib/hash';
import { createDeal } from '@/lib/services/deals';
import {
  LeadError,
  createLead,
  deleteLead,
  findDuplicates,
  getLead,
  recomputeAllScores,
  resolveNiche,
  resolveRegion,
  setDoNotContact,
  updateLead,
} from '@/lib/services/leads';
import { inTx, schema } from './db';

const { leads, niches, reminders, deals, suppressionList, settings, dealStages } = schema;

async function setup(tx: Parameters<Parameters<typeof inTx>[0]>[0]) {
  const [niche] = await tx
    .insert(niches)
    .values({ name: 'Nicho de teste', ticket: 'alto' })
    .returning();
  const region = await resolveRegion(tx, {
    state: 'PR',
    city: 'Curitiba',
    neighborhood: 'Xaxim',
    label: 'PR - Curitiba - Xaxim',
  });
  await tx
    .insert(dealStages)
    .values([
      { key: 'to_diagnose', name: 'A diagnosticar', color: 'stage-1', sort: 1 },
      { key: 'lost', name: 'Perdido', color: 'stage-lost', sort: 7, isLost: true },
    ])
    .onConflictDoNothing();
  const make = (over: Record<string, unknown> = {}, force = false) =>
    createLead(
      tx,
      {
        values: {
          name: 'Clínica Sorriso',
          phone: '(41) 99999-0000',
          hasWhatsapp: true,
          websiteStatus: 'social_only',
          mapsRating: '5.0',
          mapsReviews: 83,
          strongLocalCompetition: true,
          ...over,
        },
        nicheId: niche!.id,
        regionId: region.id,
      },
      { force },
    );
  return { niche: niche!, region, make };
}

describe('createLead', () => {
  it('calcula score 85 e normalizações', async () => {
    await inTx(async (tx) => {
      const { make } = await setup(tx);
      const r = await make();
      expect(r.ok && r.lead).toMatchObject({
        score: 85,
        phoneE164: '+5541999990000',
        nameNormalized: 'clinica sorriso',
      });
    });
  });

  it('detecta duplicata por telefone, nome+região e place_id; force ignora', async () => {
    await inTx(async (tx) => {
      const { make } = await setup(tx);
      await make({ placeId: 'p1' });
      const byPhone = await make({ name: 'Outro nome', phone: '41 99999-0000' });
      expect(byPhone).toMatchObject({ ok: false, reason: 'duplicate' });
      const byName = await make({ name: 'CLÍNICA  sorriso!', phone: null });
      expect(
        byName.ok === false && byName.reason === 'duplicate' && byName.duplicates[0]!.reasons,
      ).toEqual(['nome + região']);
      const byPlace = await make({ name: 'X', phone: null, placeId: 'p1' });
      expect(byPlace).toMatchObject({ ok: false, reason: 'duplicate' });
      expect((await make({ name: 'Outro', phone: '41 98888-7777' })).ok).toBe(true);
      expect((await make({ placeId: 'p2' }, true)).ok).toBe(true);
    });
  });

  it('recusa lead que está na suppression_list', async () => {
    await inTx(async (tx) => {
      const { make } = await setup(tx);
      await tx
        .insert(suppressionList)
        .values({ phoneE164Hash: sha256('+5541999990000'), reason: 'opt_out' });
      expect(await make()).toEqual({ ok: false, reason: 'suppressed' });
    });
  });
});

describe('updateLead', () => {
  it('recalcula o score ao salvar e marca a mudança de status', async () => {
    await inTx(async (tx) => {
      const { make } = await setup(tx);
      const r = await make();
      if (!r.ok) throw new Error('create');
      const up = await updateLead(tx, r.lead.id, {
        websiteStatus: 'good',
        contactStatus: 'contacted',
      });
      expect(up.score).toBe(55);
      expect(up.contactStatusChangedAt).toBeTruthy();
      expect(up.scoreBreakdown).toMatchObject({ website: 0, reputation: 20 });
    });
  });
});

describe('setDoNotContact', () => {
  it('transação completa: lembretes, deals, status, motivo e suppression (opt-out)', async () => {
    await inTx(async (tx) => {
      const { make } = await setup(tx);
      const r = await make();
      if (!r.ok) throw new Error('create');
      const id = r.lead.id;
      const deal = await createDeal(tx, {
        leadId: id,
        title: 'D',
        stageKey: 'to_diagnose',
        source: 'ui',
      });
      await tx.insert(reminders).values([
        { leadId: id, title: 'sem evento', dueAt: new Date() },
        { leadId: id, title: 'com evento', dueAt: new Date(), googleEventId: 'ev1' },
      ]);
      await setDoNotContact(tx, id, { reason: 'Pediu para parar', optOut: true });

      const lead = (await getLead(tx, id))!.lead;
      expect(lead).toMatchObject({
        doNotContact: true,
        contactStatus: 'discarded',
        doNotContactReason: 'Pediu para parar',
      });
      expect(lead.doNotContactAt).toBeTruthy();
      const [d] = await tx.select().from(deals).where(eq(deals.id, deal!.id));
      expect(d).toMatchObject({ status: 'lost', lostReason: 'Não contatar' });
      const rs = await tx.select().from(reminders).where(eq(reminders.leadId, id));
      expect(rs.map((x) => [x.status, x.syncStatus]).sort()).toEqual([
        ['canceled', 'disabled'],
        ['canceled', 'pending'],
      ]);
      const [sup] = await tx.select().from(suppressionList);
      expect(sup).toMatchObject({
        phoneE164Hash: sha256('+5541999990000'),
        reason: 'opt_out: Pediu para parar',
      });
      await expect(setDoNotContact(tx, id, { reason: 'x', optOut: false })).rejects.toThrow(
        LeadError,
      );
    });
  });

  it('sem opt-out não grava suppression_list', async () => {
    await inTx(async (tx) => {
      const { make } = await setup(tx);
      const r = await make();
      if (!r.ok) throw new Error('create');
      await setDoNotContact(tx, r.lead.id, { reason: 'Fora do perfil', optOut: false });
      expect(await tx.select().from(suppressionList)).toHaveLength(0);
    });
  });
});

describe('deleteLead', () => {
  it('exige o nome exato, apaga em cascata e suprime', async () => {
    await inTx(async (tx) => {
      const { make } = await setup(tx);
      const r = await make();
      if (!r.ok) throw new Error('create');
      await createDeal(tx, {
        leadId: r.lead.id,
        title: 'D',
        stageKey: 'to_diagnose',
        source: 'ui',
      });
      await expect(deleteLead(tx, r.lead.id, 'clínica sorriso')).rejects.toMatchObject({
        code: 'NAME_MISMATCH',
      });
      await deleteLead(tx, r.lead.id, 'Clínica Sorriso');
      expect(await getLead(tx, r.lead.id)).toBeNull();
      expect(await tx.select().from(deals)).toHaveLength(0);
      expect((await tx.select().from(suppressionList))[0]!.reason).toBe('deleted');
      expect(await make()).toEqual({ ok: false, reason: 'suppressed' });
    });
  });
});

describe('recomputeAllScores', () => {
  it('muda os pesos e recalcula em lotes', async () => {
    await inTx(async (tx) => {
      const { make } = await setup(tx);
      for (let i = 0; i < 5; i++)
        await make({ name: `Lead ${i}`, phone: `41 9999${i}-0000`.replace('9999', '9111') });
      await tx
        .insert(settings)
        .values({
          key: 'score_weights',
          value: {
            website: 10,
            reputation: 20,
            marketing: 15,
            ticket: 15,
            directContact: 10,
            competition: 10,
          },
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: {
              website: 10,
              reputation: 20,
              marketing: 15,
              ticket: 15,
              directContact: 10,
              competition: 10,
            },
          },
        });
      expect(await recomputeAllScores(tx, 2)).toBeGreaterThanOrEqual(5);
      const all = await tx
        .select({ s: leads.score })
        .from(leads)
        .where(eq(leads.nicheId, (await resolveNiche(tx, 'Nicho de teste'))!.id));
      expect(new Set(all.map((x) => x.s))).toEqual(new Set([65]));
      expect(await recomputeAllScores(tx, 2)).toBe(0);
    });
  });
});

describe('findDuplicates', () => {
  it('ignora o próprio lead', async () => {
    await inTx(async (tx) => {
      const { make, region } = await setup(tx);
      const r = await make();
      if (!r.ok) throw new Error('create');
      const k = {
        nameNormalized: 'clinica sorriso',
        regionId: region.id,
        phoneE164: '+5541999990000',
      };
      expect(await findDuplicates(tx, k)).toHaveLength(1);
      expect(await findDuplicates(tx, k, r.lead.id)).toHaveLength(0);
    });
  });
});
