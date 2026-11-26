import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { toApiError } from '@/lib/api/errors';
import { saveDiagnosisOp, updateLeadOp } from '@/lib/api/ops';
import { type Db } from '@/lib/db';
import { updateLead } from '@/lib/services/leads';
import { settingDefaults, SettingError } from '@/lib/validation/settings';

import { inTx, schema } from './db';

const { auditLog, interactions, leads, niches, regions, settings } = schema;

async function world(tx: Db): Promise<string> {
  const [niche] = await tx.insert(niches).values({ name: 'N', ticket: 'high' }).returning();
  const [region] = await tx
    .insert(regions)
    .values({ state: 'PR', city: 'Curitiba', label: 'PR - Curitiba' })
    .returning();
  const [lead] = await tx
    .insert(leads)
    .values({
      name: 'Lead 1',
      nameNormalized: 'lead 1',
      nicheId: niche!.id,
      regionId: region!.id,
    })
    .returning();

  return lead!.id;
}

const ctx = (tx: Db) => ({ db: tx, actor: 'mcp:t' });
const audits = (tx: Db, id: string) =>
  tx
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityId, id), eq(auditLog.entity, 'lead')));

describe('crm_update_lead / crm_save_diagnosis', () => {
  it('grava o campo, recalcula o score e audita', async () => {
    await inTx(async (tx) => {
      const id = await world(tx);
      const r = (await updateLeadOp.run({ id, patch: { channel: 'WhatsApp' } }, ctx(tx))) as {
        channel: string;
      };
      const [row] = await tx.select().from(leads).where(eq(leads.id, id));

      expect(r.channel).toBe('WhatsApp');
      expect(row?.channel).toBe('WhatsApp');
      expect(row?.scoreComputedAt).not.toBeNull();
      expect(await audits(tx, id)).toHaveLength(1);
    });
  });

  it('patch vazio não grava nada e devolve o lead atual', async () => {
    await inTx(async (tx) => {
      const id = await world(tx);
      const [before] = await tx.select().from(leads).where(eq(leads.id, id));
      const r = (await updateLeadOp.run({ id, patch: {} }, ctx(tx))) as { id: string };
      const [after] = await tx.select().from(leads).where(eq(leads.id, id));

      expect(r.id).toBe(id);
      expect(after).toEqual(before);
      expect(await audits(tx, id)).toHaveLength(0);
    });
  });

  it('patch vazio com id inexistente é not_found', async () => {
    await inTx(async (tx) => {
      await expect(
        updateLeadOp.run({ id: '00000000-0000-4000-8000-000000000000', patch: {} }, ctx(tx)),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
  });

  it('salva o diagnóstico: campos, nota e score', async () => {
    await inTx(async (tx) => {
      const id = await world(tx);
      const r = (await saveDiagnosisOp.run(
        {
          id,
          patch: { website_status: 'good', session_url: 'https://claude.ai/x' },
          diagnosis: 'Site ok, sem anúncios.',
          advance: true,
        },
        ctx(tx),
      )) as { interactionId: null | string };
      const [row] = await tx.select().from(leads).where(eq(leads.id, id));
      const notes = await tx.select().from(interactions).where(eq(interactions.leadId, id));

      expect(row?.websiteStatus).toBe('good');
      expect(row?.sessionUrl).toBe('https://claude.ai/x');
      expect(row?.scoreComputedAt).not.toBeNull();
      expect(r.interactionId).not.toBeNull();
      expect(notes).toHaveLength(1);
    });
  });
});

describe('configuração guardada em formato antigo', () => {
  it('updateLead lança SettingError (internal_error), não ZodError', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await inTx(async (tx) => {
      const id = await world(tx);
      const old = {
        ...settingDefaults.score_thresholds,
        ticketPoints: { alto: 15, medio: 7.5, baixo: 0 },
      };

      await tx
        .insert(settings)
        .values({ key: 'score_thresholds', value: old })
        .onConflictDoUpdate({ target: settings.key, set: { value: old } });

      const err = await updateLead(tx, id, { notes: 'x' }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(SettingError);
      expect(toApiError(err).code).toBe('internal_error');
      expect(toApiError(err).message).toContain('score_thresholds');
    });
    spy.mockRestore();
  });
});
