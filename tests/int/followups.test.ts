import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { encrypt } from '@/lib/crypto';
import type { Db } from '@/lib/db';
import { createDeal, moveDeal, winDeal } from '@/lib/services/deals';
import {
  connectGoogle,
  getConnection,
  resyncAll,
  syncOverview,
  syncReminders,
} from '@/lib/services/calendar-sync';
import { logInteraction } from '@/lib/services/interactions';
import { runFollowupsJob } from '@/lib/services/jobs';
import {
  ReminderError,
  cancelReminder,
  completeReminder,
  createReminder,
  listReminders,
  snoozeReminder,
  updateReminder,
} from '@/lib/services/reminders';
import { applyRules } from '@/lib/services/rules';
import { setDoNotContact } from '@/lib/services/leads';
import { inTx, schema } from './db';
import { fakeGoogle, keys } from './google-fake';

const {
  leads,
  niches,
  regions,
  dealStages,
  deals,
  reminders,
  followupRules,
  jobRuns,
  googleConnections,
} = schema;

const step = (offsetBusinessDays: number, time: string, title: string, extra: object = {}) => ({
  offsetBusinessDays,
  time,
  title,
  ...extra,
});

async function world(tx: Db) {
  const [niche] = await tx.insert(niches).values({ name: 'N', ticket: 'alto' }).returning();
  const [region] = await tx
    .insert(regions)
    .values({ state: 'PR', city: 'Curitiba', label: 'PR - Curitiba' })
    .returning();
  const D2 = [
    ['to_diagnose', 1, 'to_contact'],
    ['to_contact', 2, 'to_contact'],
    ['contacted', 3, 'contacted'],
    ['talking', 4, 'replied'],
    ['negotiating', 5, 'negotiating'],
    ['won', 6, 'client'],
    ['lost', 7, 'lost'],
  ] as const;
  const stages = await tx
    .insert(dealStages)
    .values(
      D2.map(([key, sort, leadStatus]) => ({
        key,
        name: key,
        sort,
        leadStatus,
        color: 'stage-1',
        isWon: key === 'won',
        isLost: key === 'lost',
        defaultProbability: 10,
      })),
    )
    .returning();
  const won = stages.find((s) => s.key === 'won')!;
  const both = { inboundInteraction: true, stageLeft: true };
  await tx.insert(followupRules).values([
    {
      name: 'Sem resposta',
      trigger: 'interaction_logged',
      interactionDirection: 'outbound',
      cadence: [
        step(2, '09:30', 'Follow-up 1'),
        step(5, '09:30', 'Follow-up 2'),
        step(10, '09:30', 'Follow-up 3', { suggestStatus: 'no_response' }),
      ],
      cancelOn: both,
      sort: 1,
    },
    {
      name: 'Proposta',
      trigger: 'interaction_logged',
      interactionType: 'proposal',
      cadence: [
        step(2, '10:00', 'Proposta 1'),
        step(5, '10:00', 'Proposta 2'),
        step(10, '10:00', 'Proposta 3'),
      ],
      cancelOn: both,
      sort: 2,
    },
    {
      name: 'Retomar',
      trigger: 'interaction_logged',
      interactionOutcome: 'asked_later',
      cadence: [step(20, '09:30', 'Retomar contato')],
      cancelOn: { inboundInteraction: true },
      sort: 3,
    },
    {
      name: 'Ganho',
      trigger: 'deal_stage_entered',
      stageId: won.id,
      cadence: [step(1, '09:30', 'Onboarding')],
      cancelOn: {},
      sort: 4,
    },
  ]);
  const [lead] = await tx
    .insert(leads)
    .values({
      name: 'Lead 1',
      nameNormalized: 'lead 1',
      nicheId: niche!.id,
      regionId: region!.id,
      phoneE164: '+5541999990000',
    })
    .returning();
  const rems = (leadId = lead!.id) =>
    tx.select().from(reminders).where(eq(reminders.leadId, leadId)).orderBy(reminders.dueAt);
  return { lead: lead!, rems };
}

const MON = new Date('2026-11-16T15:00:00Z'); // segunda 12h em São Paulo

describe('motor de regras + lembretes', () => {
  it('interação Proposta cria 3 lembretes nos dias úteis certos (com feriado no meio)', () =>
    inTx(async (tx) => {
      const { lead, rems } = await world(tx);
      await createDeal(tx, { leadId: lead.id, source: 'ui' });
      const { reminderIds } = await logInteraction(tx, {
        leadId: lead.id,
        type: 'proposal',
        direction: 'outbound',
        summary: 'Proposta enviada',
        occurredAt: MON,
      });
      expect(reminderIds).toHaveLength(3);
      const rs = await rems();
      expect(rs.map((r) => r.dueAt.toISOString())).toEqual([
        '2026-11-18T13:00:00.000Z',
        '2026-11-24T13:00:00.000Z', // 20/11 (Consciência Negra) pulado
        '2026-12-01T13:00:00.000Z',
      ]);
      expect(rs.every((r) => r.source === 'rule' && r.syncStatus === 'pending' && r.dealId)).toBe(
        true,
      );
    }));

  it('inbound cancela os pendentes; mudar de etapa também', () =>
    inTx(async (tx) => {
      const { lead, rems } = await world(tx);
      await logInteraction(tx, {
        leadId: lead.id,
        type: 'whatsapp',
        direction: 'outbound',
        summary: 'Oi',
        occurredAt: MON,
      });
      expect((await rems()).filter((r) => r.status === 'open')).toHaveLength(3);
      await logInteraction(tx, {
        leadId: lead.id,
        type: 'whatsapp',
        direction: 'inbound',
        summary: 'Resposta',
      });
      const after = await rems();
      expect(after.every((r) => r.status === 'canceled' && r.syncStatus === 'pending')).toBe(true);

      // etapa deixada: proposta num deal; mover o deal cancela
      const deal = await createDeal(tx, { leadId: lead.id, source: 'ui' });
      await logInteraction(tx, {
        leadId: lead.id,
        type: 'proposal',
        direction: 'outbound',
        summary: 'P',
        occurredAt: MON,
      });
      expect((await rems()).filter((r) => r.status === 'open')).toHaveLength(3);
      const [talking] = await tx.select().from(dealStages).where(eq(dealStages.key, 'talking'));
      await moveDeal(tx, { dealId: deal.id, stageId: talking!.id });
      expect((await rems()).filter((r) => r.status === 'open')).toHaveLength(0);
    }));

  it('reaplicar a regra não duplica (nem com replay, nem repetindo o evento)', () =>
    inTx(async (tx) => {
      const { lead, rems } = await world(tx);
      const { interaction } = await logInteraction(tx, {
        leadId: lead.id,
        type: 'proposal',
        direction: 'outbound',
        summary: 'P',
        occurredAt: MON,
      });
      const ev = {
        type: 'interaction_logged',
        interactionId: interaction.id,
        leadId: lead.id,
        dealId: null,
      } as const;
      expect(await applyRules(tx, ev)).toEqual([]);
      expect(await applyRules(tx, ev, { replay: true })).toEqual([]);
      expect(await rems()).toHaveLength(3);
    }));

  it('ganho cria o onboarding; lead "Não contatar" não recebe lembretes; importação não dispara regras', () =>
    inTx(async (tx) => {
      const { lead, rems } = await world(tx);
      const deal = await createDeal(tx, { leadId: lead.id, source: 'ui' });
      await winDeal(tx, { dealId: deal.id });
      expect((await rems()).map((r) => r.title)).toEqual(['Onboarding']);
      await logInteraction(tx, {
        leadId: lead.id,
        type: 'whatsapp',
        direction: 'outbound',
        summary: 'x',
        createdBy: 'import',
      });
      expect(await rems()).toHaveLength(1);
      await setDoNotContact(tx, lead.id, { reason: 'pediu', optOut: true });
      const [only] = await rems();
      expect(only!.status).toBe('canceled');
    }));

  it('CRUD: adiar, editar, concluir (sugere sem resposta no último passo), cancelar; todos marcam pending', () =>
    inTx(async (tx) => {
      const { lead, rems } = await world(tx);
      await logInteraction(tx, {
        leadId: lead.id,
        type: 'whatsapp',
        direction: 'outbound',
        summary: 'Oi',
        occurredAt: MON,
      });
      const [f1, f2, f3] = await rems();
      await tx.update(reminders).set({ syncStatus: 'synced' }).where(eq(reminders.leadId, lead.id));
      const s = await snoozeReminder(tx, f1!.id, '1h', MON);
      expect(s.dueAt.toISOString()).toBe('2026-11-16T16:00:00.000Z');
      expect(s.snoozeCount).toBe(1);
      expect(s.syncStatus).toBe('pending');
      const tomorrow = await snoozeReminder(tx, f1!.id, 'tomorrow', MON);
      expect(tomorrow.dueAt.toISOString()).toBe('2026-11-17T12:30:00.000Z');
      const plus2 = await snoozeReminder(tx, f1!.id, 'plus2bd', MON);
      expect(plus2.dueAt.toISOString()).toBe('2026-11-18T12:30:00.000Z');
      const edited = await updateReminder(tx, f2!.id, { title: 'Novo título' });
      expect(edited.title).toBe('Novo título');
      const mid = await completeReminder(tx, f2!.id);
      expect(mid.suggestion).toBeNull();
      const last = await completeReminder(tx, f3!.id, {
        interaction: { type: 'note', direction: 'internal', summary: 'Tentei de novo' },
      });
      expect(last.suggestion).toEqual({ leadId: lead.id, status: 'no_response' });
      await expect(completeReminder(tx, f3!.id)).rejects.toMatchObject({ code: 'NOT_OPEN' });
      await cancelReminder(tx, f1!.id);
      expect((await rems()).map((r) => r.status).sort()).toEqual(['canceled', 'done', 'done']);
      const l = await listReminders(tx, 'done', MON);
      expect(l.rows).toHaveLength(2);
    }));

  it('lembrete manual de lead "Não contatar" vira erro de domínio', () =>
    inTx(async (tx) => {
      const { lead } = await world(tx);
      await setDoNotContact(tx, lead.id, { reason: 'x', optOut: false });
      await expect(
        createReminder(tx, { leadId: lead.id, title: 'x', dueAt: MON }),
      ).rejects.toBeInstanceOf(ReminderError);
    }));

  it('abas: atrasados, hoje e próximos', () =>
    inTx(async (tx) => {
      const { lead } = await world(tx);
      const at = (h: number) => new Date(MON.getTime() + h * 3_600_000);
      await createReminder(tx, { leadId: lead.id, title: 'a', dueAt: at(-2) });
      await createReminder(tx, { leadId: lead.id, title: 'b', dueAt: at(2) });
      await createReminder(tx, { leadId: lead.id, title: 'c', dueAt: at(48) });
      const t = async (tab: 'overdue' | 'today' | 'upcoming') =>
        (await listReminders(tx, tab, MON)).rows.map((r) => r.title);
      expect(await t('overdue')).toEqual(['a']);
      expect(await t('today')).toEqual(['b']);
      expect(await t('upcoming')).toEqual(['c']);
      expect((await listReminders(tx, 'today', MON)).counts).toEqual({ overdue: 1, today: 1 });
    }));
});

describe('job de follow-ups', () => {
  const ctx = (g = fakeGoogle()) => ({ deps: g.deps, keys, appUrl: 'http://localhost:3000' });

  it('mesma execução duas vezes: a segunda não faz nada', () =>
    inTx(async (tx) => {
      const { lead } = await world(tx);
      const first = await runFollowupsJob(tx, ctx(), { executionId: 'run-1', now: MON });
      const second = await runFollowupsJob(tx, ctx(), { executionId: 'run-1', now: MON });
      expect(first.duplicate).toBe(false);
      expect(second).toEqual({ duplicate: true });
      expect(await tx.select().from(jobRuns).where(eq(jobRuns.executionId, 'run-1'))).toHaveLength(
        1,
      );
      expect(lead.id).toBeTruthy();
    }));

  it('cria "Destravar negociação" uma vez por permanência na etapa (> 10 dias úteis, sem lembrete aberto)', () =>
    inTx(async (tx) => {
      const { lead, rems } = await world(tx);
      const deal = await createDeal(tx, { leadId: lead.id, source: 'ui' });
      const old = new Date('2026-10-30T15:00:00Z'); // 12 dias úteis antes de 17/11 (com feriados)
      await tx.update(deals).set({ stageEnteredAt: old }).where(eq(deals.id, deal.id));
      const now = new Date('2026-11-17T15:00:00Z');
      const r1 = await runFollowupsJob(tx, ctx(), { executionId: 'a', now });
      expect(r1.duplicate === false && r1.stats.stalled).toBe(1);
      expect((await rems()).map((r) => r.title)).toEqual(['Destravar negociação']);
      // concluir e rodar de novo: não recria (mesma permanência na etapa)
      await tx.update(reminders).set({ status: 'done' }).where(eq(reminders.leadId, lead.id));
      await runFollowupsJob(tx, ctx(), { executionId: 'b', now });
      expect(await rems()).toHaveLength(1);
      // negociação recente não é "parada"
      await tx
        .update(deals)
        .set({ stageEnteredAt: new Date('2026-11-13T15:00:00Z') })
        .where(eq(deals.id, deal.id));
      await tx.delete(reminders).where(eq(reminders.leadId, lead.id));
      await runFollowupsJob(tx, ctx(), { executionId: 'c', now });
      expect(await rems()).toHaveLength(0);
    }));

  it('reaplica regras de eventos recentes sem duplicar', () =>
    inTx(async (tx) => {
      const { lead, rems } = await world(tx);
      const now = new Date();
      await logInteraction(tx, {
        leadId: lead.id,
        type: 'proposal',
        direction: 'outbound',
        summary: 'P',
      });
      await tx.delete(reminders).where(eq(reminders.leadId, lead.id)); // simula falha do motor
      await runFollowupsJob(tx, ctx(), { executionId: 'r1', now });
      expect(await rems()).toHaveLength(3);
      await runFollowupsJob(tx, ctx(), { executionId: 'r2', now });
      expect(await rems()).toHaveLength(3);
    }));
});

describe('sincronização com o Google Calendar (mock)', () => {
  const setup = async (tx: Db, g = fakeGoogle()) => {
    const { lead, rems } = await world(tx);
    const sc = { deps: g.deps, keys, appUrl: 'http://localhost:3000' };
    await connectGoogle(tx, sc, {
      email: 'a@b.c',
      refreshToken: 'rt',
      accessToken: 'at',
      expiresAt: new Date(Date.now() + 3_600_000),
      scope: 's',
    });
    return { lead, rems, g, sc };
  };

  it('sem conexão os lembretes ficam disabled; ao conectar voltam para pending', () =>
    inTx(async (tx) => {
      const { lead, rems } = await world(tx);
      const g = fakeGoogle();
      const sc = { deps: g.deps, keys, appUrl: 'x' };
      await createReminder(tx, { leadId: lead.id, title: 't', dueAt: MON });
      expect(await syncReminders(tx, sc)).toMatchObject({ skipped: 'no_connection' });
      expect((await rems())[0]!.syncStatus).toBe('disabled');
      await connectGoogle(tx, sc, {
        email: 'a@b.c',
        refreshToken: 'rt',
        accessToken: 'at',
        expiresAt: new Date(Date.now() + 3_600_000),
        scope: 's',
      });
      expect((await rems())[0]!.syncStatus).toBe('pending');
      expect((await getConnection(tx))!.calendarId).toBe('cal-1');
    }));

  it('evento aparece, muda e some (criar → editar → concluir)', () =>
    inTx(async (tx) => {
      const { lead, rems, g, sc } = await setup(tx);
      const r = await createReminder(tx, {
        leadId: lead.id,
        title: 'Ligar',
        dueAt: MON,
        notes: 'n1',
      });
      await syncReminders(tx, sc);
      let [row] = await rems();
      expect(row).toMatchObject({ syncStatus: 'synced' });
      expect(g.events.size).toBe(1);
      const ev = [...g.events.values()][0]!;
      expect(ev.summary).toBe('Follow-up: Lead 1 – Ligar');
      expect(ev.description).toContain('https://wa.me/5541999990000');
      expect(ev.extendedProperties.private).toEqual({ crmReminderId: r.id, crmLeadId: lead.id });
      expect(ev.reminders.overrides).toEqual([
        { method: 'popup', minutes: 10 },
        { method: 'popup', minutes: 0 },
      ]);

      await updateReminder(tx, r.id, { title: 'Ligar de novo' });
      await syncReminders(tx, sc);
      expect([...g.events.values()][0]!.summary).toBe('Follow-up: Lead 1 – Ligar de novo');
      expect(g.events.size).toBe(1);

      await completeReminder(tx, r.id);
      await syncReminders(tx, sc);
      expect(g.events.size).toBe(0);
      [row] = await rems();
      expect(row).toMatchObject({ syncStatus: 'synced', googleEventId: null });
    }));

  it('evento apagado no Google (404) é recriado; cancelar um já apagado (410) não falha', () =>
    inTx(async (tx) => {
      const { lead, rems, g, sc } = await setup(tx);
      const r = await createReminder(tx, { leadId: lead.id, title: 'x', dueAt: MON });
      await syncReminders(tx, sc);
      g.events.clear();
      await updateReminder(tx, r.id, { title: 'y' });
      await syncReminders(tx, sc);
      expect(g.events.size).toBe(1);
      g.events.clear();
      await cancelReminder(tx, r.id);
      expect(await syncReminders(tx, sc)).toMatchObject({ errors: 0 });
      expect((await rems())[0]).toMatchObject({ syncStatus: 'synced', googleEventId: null });
    }));

  it('falha da API: error com attempts++ e backoff (1 min); o job tenta de novo', () =>
    inTx(async (tx) => {
      const { lead, rems, g, sc } = await setup(tx);
      const real = g.deps.fetch;
      g.deps.fetch = async (i, init) =>
        init?.method === 'POST' ? new Response('boom', { status: 500 }) : real(i, init);
      await createReminder(tx, { leadId: lead.id, title: 'x', dueAt: MON });
      const now = new Date();
      expect(await syncReminders(tx, sc, { mode: 'after', now })).toMatchObject({ errors: 1 });
      let [row] = await rems();
      expect(row).toMatchObject({ syncStatus: 'error', syncAttempts: 1 });
      expect(row!.syncError).toContain('500');
      // dentro do backoff, o after() não tenta
      expect(await syncReminders(tx, sc, { mode: 'after', now })).toMatchObject({
        errors: 0,
        synced: 0,
      });
      g.deps.fetch = real;
      expect(await syncReminders(tx, sc, { mode: 'job', now })).toMatchObject({ synced: 1 });
      [row] = await rems();
      expect(row).toMatchObject({ syncStatus: 'synced', syncAttempts: 0 });
    }));

  it('invalid_grant: conexão needs_reauth, lembretes continuam pending e o resumo avisa', () =>
    inTx(async (tx) => {
      const { lead, rems, sc } = await setup(tx, fakeGoogle({ failRefresh: true }));
      // access token vencido força o refresh
      await tx.update(googleConnections).set({
        accessTokenExpiresAt: new Date(Date.now() - 1000),
        accessTokenEnc: encrypt('old', keys),
      });
      await createReminder(tx, { leadId: lead.id, title: 'x', dueAt: MON });
      expect(await syncReminders(tx, sc)).toMatchObject({ skipped: 'needs_reauth' });
      expect((await getConnection(tx))!.status).toBe('needs_reauth');
      expect((await rems())[0]!.syncStatus).toBe('pending');
      expect(await syncOverview(tx)).toMatchObject({ status: 'needs_reauth', pending: 1 });
      // enquanto precisa reconectar, nada é tentado
      expect(await syncReminders(tx, sc)).toMatchObject({ skipped: 'needs_reauth' });
    }));

  it('re-sincronizar tudo adota o evento existente (privateExtendedProperty) e remove duplicatas', () =>
    inTx(async (tx) => {
      const { lead, rems, g, sc } = await setup(tx);
      const r = await createReminder(tx, { leadId: lead.id, title: 'x', dueAt: MON });
      // dois eventos já existem no Google para o mesmo lembrete, e o banco não conhece nenhum
      for (const id of ['old-1', 'old-2'])
        g.events.set(id, { id, extendedProperties: { private: { crmReminderId: r.id } } });
      const stats = await resyncAll(tx, sc);
      expect(stats.synced).toBe(1);
      expect(g.events.size).toBe(1);
      expect((await rems())[0]!.googleEventId).toBe('old-1');
      expect([...g.events.values()][0]!.summary).toBe('Follow-up: Lead 1 – x');
    }));

  it('reconectar reaproveita o calendário guardado', () =>
    inTx(async (tx) => {
      const { sc, g } = await setup(tx);
      const before = g.calls.filter((c) => c === 'POST /calendars').length;
      await connectGoogle(tx, sc, {
        email: 'a@b.c',
        refreshToken: 'rt2',
        accessToken: 'at2',
        expiresAt: new Date(Date.now() + 3_600_000),
        scope: 's',
      });
      expect(g.calls.filter((c) => c === 'POST /calendars').length).toBe(before);
    }));
});
