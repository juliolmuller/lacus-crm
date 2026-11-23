import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { suppressionKeys } from '@/lib/hash';
import { logUsage, usageToday } from '@/lib/services/api-usage';
import { resolveRegion, setDoNotContact } from '@/lib/services/leads';
import { claimNext, completeItem, LEASE_MS, markPending, skipItem } from '@/lib/services/queue';
import { createToken, verifyToken } from '@/lib/services/tokens';
import { UpsertError, upsertLeads } from '@/lib/services/upsert-leads';

import { inTx, schema } from './db';

const { leads, niches, prospectingQueue, apiUsageLog, auditLog, suppressionList, apiTokens } =
  schema;
type Tx = Parameters<Parameters<typeof inTx>[0]>[0];

const REGION = 'PR - Curitiba - Xaxim';

async function world(tx: Tx) {
  const [niche] = await tx.insert(niches).values({ name: 'Nicho MCP', ticket: 'alto' }).returning();
  const region = await resolveRegion(tx, {
    state: 'PR',
    city: 'Curitiba',
    neighborhood: 'Xaxim',
    label: REGION,
  });

  await tx.insert(prospectingQueue).values([
    { position: 9001, regionId: region.id, nicheId: niche!.id, sortOrder: -3 },
    { position: 9002, regionId: region.id, nicheId: (await other(tx)).id, sortOrder: -2 },
  ]);

  return { niche: niche!, region };
}
const other = async (tx: Tx) =>
  (await tx.insert(niches).values({ name: 'Outro nicho MCP', ticket: 'baixo' }).returning())[0]!;

const lead = (over: Record<string, unknown> = {}) => ({
  name: 'Clínica Alfa',
  nicheName: 'Nicho MCP',
  regionLabel: REGION,
  placeId: 'place-alfa',
  phone: '(41) 99999-1111',
  mapsRating: 4.5,
  mapsReviews: 10,
  websiteStatus: 'social_only' as const,
  ...over,
});
const run = (runId: string, leadsIn: Array<ReturnType<typeof lead>>) => ({ runId, leads: leadsIn });
const snapshot = async (tx: Tx) => ({
  leads: await tx.select().from(leads).orderBy(leads.name),
  usage: await tx.select().from(apiUsageLog).orderBy(apiUsageLog.runId),
  queue: await tx.select().from(prospectingQueue).orderBy(prospectingQueue.position),
  audit: (await tx.select().from(auditLog)).length,
});

describe('tokens', () => {
  it('guarda só o hash, valida, revoga e expira', async () => {
    await inTx(async (tx) => {
      const { token, row } = await createToken(tx, { name: 'T', scopes: ['read'] });

      expect(token).toMatch(/^lcrm_/);
      expect(row.tokenHash).not.toContain(token);
      expect(row.tokenPrefix).toBe(token.slice(0, 8));

      const ok = await verifyToken(tx, token);

      expect(ok).toMatchObject({ ok: true, token: { id: row.id, scopes: ['read'] } });
      expect(await verifyToken(tx, `${token}x`)).toEqual({ ok: false, reason: 'invalid' });

      const exp = await createToken(tx, { name: 'E', scopes: ['read'], expiresAt: new Date(1000) });

      expect(await verifyToken(tx, exp.token)).toEqual({ ok: false, reason: 'expired' });
      await tx.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, row.id));
      expect(await verifyToken(tx, token)).toEqual({ ok: false, reason: 'revoked' });
    });
  });

  it('last_used_at é regravado no máximo a cada minuto', async () => {
    await inTx(async (tx) => {
      const { token, row } = await createToken(tx, { name: 'T', scopes: ['read'] });
      const t0 = new Date('2026-01-01T12:00:00Z');

      await verifyToken(tx, token, t0);
      await verifyToken(tx, token, new Date(t0.getTime() + 30_000));

      const at = async (): Promise<Date | null> =>
        (await tx.select().from(apiTokens).where(eq(apiTokens.id, row.id)))[0]!.lastUsedAt;

      expect(await at()).toEqual(t0);
      await verifyToken(tx, token, new Date(t0.getTime() + 61_000));
      expect((await at())!.getTime()).toBe(t0.getTime() + 61_000);
    });
  });
});

describe('upsertLeads', () => {
  it('cria com data_source google_places e audit actor mcp:<id>', async () => {
    await inTx(async (tx) => {
      await world(tx);

      const r = await upsertLeads(tx, run('r1', [lead()]), 'mcp:tok');

      expect(r.created).toHaveLength(1);

      const [l] = await tx.select().from(leads).where(eq(leads.placeId, 'place-alfa'));

      expect(l).toMatchObject({ dataSource: 'google_places', phoneE164: '+5541999991111' });

      const [a] = await tx.select().from(auditLog).where(eq(auditLog.entityId, l!.id));

      expect(a).toMatchObject({ actor: 'mcp:tok', action: 'upsert_create' });
    });
  });

  it('repetir o mesmo lote não muda o estado nem duplica', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await upsertLeads(tx, run('r1', [lead()]), 'mcp:tok');

      const before = await snapshot(tx);
      const again = await upsertLeads(tx, run('r1', [lead()]), 'mcp:tok');

      expect(again.created).toHaveLength(0);
      expect(again.updated[0]!.changed).toEqual([]);
      expect(await snapshot(tx)).toEqual(before);
    });
  });

  it('só toca campos de máquina em lead existente', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await upsertLeads(tx, run('r1', [lead({ pitch: 'pitch original' })]), 'mcp:tok');
      await tx
        .update(leads)
        .set({
          contactStatus: 'negotiating',
          notes: 'minhas notas',
          nextAction: 'ligar',
          priority: 1,
        })
        .where(eq(leads.placeId, 'place-alfa'));

      const r = await upsertLeads(
        tx,
        run('r2', [
          lead({ mapsRating: 3.0, mapsReviews: 99, pitch: 'outro pitch', websiteStatus: 'good' }),
        ]),
        'mcp:tok',
      );

      expect(r.updated[0]!.changed).toEqual(expect.arrayContaining(['mapsRating', 'mapsReviews']));

      const [l] = await tx.select().from(leads).where(eq(leads.placeId, 'place-alfa'));

      expect(l).toMatchObject({
        mapsRating: '3.0',
        mapsReviews: 99,
        contactStatus: 'negotiating',
        notes: 'minhas notas',
        nextAction: 'ligar',
        priority: 1,
        pitch: 'pitch original', // preenche só se vazio
        websiteStatus: 'social_only', // só muda enquanto "unknown"
      });
    });
  });

  it('ignora suprimido e do_not_contact', async () => {
    await inTx(async (tx) => {
      const { region } = await world(tx);
      const k = suppressionKeys({
        phoneE164: null,
        nameNormalized: 'clinica sup',
        regionLabel: region.label,
      });

      await tx.insert(suppressionList).values({ placeId: 'place-sup', ...k, reason: 'teste' });
      await upsertLeads(
        tx,
        run('r1', [lead({ placeId: 'place-dnc', name: 'Clínica DNC', phone: '(41) 98888-0000' })]),
        'mcp:t',
      );

      const [dnc] = await tx.select().from(leads).where(eq(leads.placeId, 'place-dnc'));

      await tx.update(leads).set({ doNotContact: true }).where(eq(leads.id, dnc!.id));

      const r = await upsertLeads(
        tx,
        run('r2', [
          lead({ placeId: 'place-sup', name: 'Clínica Sup', phone: undefined }),
          lead({ placeId: 'place-dnc', name: 'Clínica DNC', mapsReviews: 500 }),
        ]),
        'mcp:t',
      );

      expect(r.skipped.map((s) => s.reason).sort()).toEqual(['do_not_contact', 'suppressed']);
      expect(r.created).toHaveLength(0);

      const [after] = await tx.select().from(leads).where(eq(leads.id, dnc!.id));

      expect(after!.mapsReviews).toBe(dnc!.mapsReviews);
    });
  });

  it('mesmo telefone ou nome+região com outro place_id é duplicado: ignora', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await upsertLeads(tx, run('r1', [lead()]), 'mcp:t');

      const r = await upsertLeads(
        tx,
        run('r2', [
          lead({ placeId: 'place-b', name: 'Outra', phone: '(41) 99999-1111' }),
          lead({ placeId: 'place-c', phone: '(41) 97777-0000' }),
        ]),
        'mcp:t',
      );

      expect(r.skipped.map((s) => s.reason)).toEqual(['duplicate_phone', 'duplicate_name']);
      expect(await tx.select().from(leads)).toHaveLength(1);
    });
  });

  it('nicho inexistente rejeita o lote inteiro', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await expect(
        upsertLeads(
          tx,
          run('r1', [lead(), lead({ nicheName: 'Não existe', placeId: 'x' })]),
          'mcp:t',
        ),
      ).rejects.toBeInstanceOf(UpsertError);
      expect(await tx.select().from(leads)).toHaveLength(0);
    });
  });
});

describe('fila e uso da API', () => {
  it('claim respeita sort_order, pula pulados e leases ativos', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await tx.execute(sql`delete from prospecting_queue where position not in (9001, 9002)`);

      const now = new Date('2026-03-01T12:00:00Z');

      await skipItem(tx, 9001, true);

      const a = await claimNext(tx, 'run-a', now);

      expect(a!.position).toBe(9002);
      expect(a!.niche.name).toBe('Outro nicho MCP');
      expect(await claimNext(tx, 'run-b', new Date(now.getTime() + 60_000))).toBeNull(); // lease ativo
      await skipItem(tx, 9001, false);
      expect((await claimNext(tx, 'run-b', now))!.position).toBe(9001);

      // lease vencido volta a ser elegível
      const late = new Date(now.getTime() + LEASE_MS + 1000);

      expect((await claimNext(tx, 'run-c', late))!.position).toBe(9001);
    });
  });

  it('claim e complete são idempotentes por runId', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await tx.execute(sql`delete from prospecting_queue where position <> 9001`);

      const a = await claimNext(tx, 'run-x');
      const b = await claimNext(tx, 'run-x');

      expect(b!.position).toBe(a!.position);
      expect(
        (await tx.select().from(prospectingQueue).where(eq(prospectingQueue.position, 9001)))[0]!
          .attempts,
      ).toBe(1);

      const t = new Date('2026-03-01T12:00:00Z');

      await completeItem(
        tx,
        { position: 9001, runId: 'run-x', status: 'done', leadsAdded: 3, notes: 'ok' },
        t,
      );

      const done = await completeItem(
        tx,
        { position: 9001, runId: 'run-x', status: 'done', leadsAdded: 9, notes: 'dup' },
        new Date(),
      );

      expect(done).toMatchObject({ status: 'done', leadsAdded: 3, notes: 'ok', executedAt: t });
      // refazer o claim depois de concluído não pega outro item
      expect((await claimNext(tx, 'run-x'))!.position).toBe(9001);
      await markPending(tx, 9001);
      expect((await claimNext(tx, 'run-y'))!.position).toBe(9001);
    });
  });

  it('uso: today soma o dia, log é único por runId', async () => {
    await inTx(async (tx) => {
      const now = new Date('2026-03-01T15:00:00Z');
      const first = await usageToday(tx, now);

      await logUsage(tx, { runId: 'u1', requests: 7, leadsSaved: 2 }, now);

      const again = await logUsage(tx, { runId: 'u1', requests: 99, leadsSaved: 9 }, now);

      expect(again).toMatchObject({ requests: 7, leadsSaved: 2 });

      const t = await usageToday(tx, now);

      expect(t.requestsToday).toBe(first.requestsToday + 7);
      expect(t.remaining).toBe(Math.max(0, t.budget - t.requestsToday));
      expect(
        await tx
          .select()
          .from(apiUsageLog)
          .where(and(eq(apiUsageLog.runId, 'u1'))),
      ).toHaveLength(1);
    });
  });

  it('fluxo da rotina rodado duas vezes com o mesmo runId deixa o banco idêntico', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await tx.execute(sql`delete from prospecting_queue where position <> 9001`);

      const runId = '2026-03-01T12-pos9001';
      const routine = async (): Promise<number> => {
        const item = await claimNext(tx, runId);
        const u = await usageToday(tx);
        const r = await upsertLeads(
          tx,
          {
            runId,
            queuePosition: item!.position,
            leads: [lead(), lead({ placeId: 'p2', name: 'Beta', phone: '(41) 96666-0000' })],
          },
          'mcp:t',
        );

        await logUsage(tx, {
          runId,
          queuePosition: item!.position,
          requests: 4,
          leadsSaved: r.created.length,
        });
        await completeItem(tx, {
          position: item!.position,
          runId,
          status: 'done',
          leadsAdded: r.created.length,
        });

        return u.remaining;
      };

      await routine();

      const before = await snapshot(tx);

      expect(before.leads).toHaveLength(2);
      await routine();
      expect(await snapshot(tx)).toEqual(before);
    });
  });

  it('setDoNotContact + upsert: não reabre', async () => {
    await inTx(async (tx) => {
      await world(tx);
      await upsertLeads(tx, run('r1', [lead()]), 'mcp:t');

      const [l] = await tx.select().from(leads);

      await setDoNotContact(tx, l!.id, { reason: 'x', optOut: true });

      const r = await upsertLeads(tx, run('r2', [lead()]), 'mcp:t');

      expect(r.skipped[0]!.reason).toBe('suppressed');
    });
  });
});
