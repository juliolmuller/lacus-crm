import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { toApiError } from '@/lib/api/errors';
import { getLeadFull, logInteractionOp } from '@/lib/api/ops';
import { type Db } from '@/lib/db';

import { inTx, schema } from './db';

const { leads, niches, regions, interactions } = schema;

async function lead(tx: Db): Promise<string> {
  const [niche] = await tx.insert(niches).values({ name: 'N', ticket: 'high' }).returning();
  const [region] = await tx
    .insert(regions)
    .values({ state: 'PR', city: 'Curitiba', label: 'PR - Curitiba' })
    .returning();
  const [l] = await tx
    .insert(leads)
    .values({
      name: 'Lead 1',
      nameNormalized: 'lead 1',
      nicheId: niche!.id,
      regionId: region!.id,
    })
    .returning();

  return l!.id;
}

const base = { type: 'note', direction: 'internal', summary: 'Diagnóstico com Claude' };

interface Logged {
  interaction: { body: null | string };
}

const call = async (args: unknown, tx: Db): Promise<Logged> =>
  (await logInteractionOp.run(logInteractionOp.input.parse(args) as never, {
    db: tx,
    actor: 'mcp:test',
  })) as Logged;

describe('crm_log_interaction body', () => {
  it('saves the body and returns it from crm_get_lead', () =>
    inTx(async (tx) => {
      const leadId = await lead(tx);
      const body = 'Sessão: https://claude.ai/…\nDetalhe longo';
      const r = await call({ ...base, leadId, body }, tx);

      expect(r.interaction.body).toBe(body);

      const [row] = await tx.select().from(interactions).where(eq(interactions.leadId, leadId));

      expect(row?.body).toBe(body);

      const full = (await getLeadFull.run(getLeadFull.input.parse({ id: leadId }), {
        db: tx,
        actor: 'mcp:test',
      } as never)) as { interactions: Array<{ body: null | string }> };

      expect(full.interactions[0]?.body).toBe(body);
    }));

  it('stores null when body is missing, empty or blank', () =>
    inTx(async (tx) => {
      const leadId = await lead(tx);

      for (const extra of [{}, { body: '' }, { body: '   ' }, { body: null }]) {
        const r = await call({ ...base, leadId, ...extra }, tx);

        expect(r.interaction.body).toBeNull();
      }
    }));

  it('rejects bodies over 5000 characters as validation_error', () =>
    inTx(async (tx) => {
      const leadId = await lead(tx);
      const args = { ...base, leadId, body: 'x'.repeat(5001) };

      expect(() => logInteractionOp.input.parse(args)).toThrow(ZodError);

      try {
        logInteractionOp.input.parse(args);
      } catch (e) {
        expect(toApiError(e).code).toBe('validation_error');
      }

      const r = await call({ ...base, leadId, body: 'x'.repeat(5000) }, tx);

      expect(r.interaction.body).toHaveLength(5000);
    }));

  it('accepts the REST payload shape (path id merged into the body)', () =>
    inTx(async (tx) => {
      const leadId = await lead(tx);
      const payload = {
        type: 'whatsapp',
        direction: 'outbound',
        summary: 'Enviei a mensagem 1',
        body: 'Texto completo',
        leadId,
      };
      const r = await call(payload, tx);

      expect(r.interaction.body).toBe('Texto completo');
    }));
});
