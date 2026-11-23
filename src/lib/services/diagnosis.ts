import { and, eq } from 'drizzle-orm';

import { type Db, schema } from '@/lib/db';

import { audit } from './audit';
import { moveDeal } from './deals';
import { logInteraction } from './interactions';
import { type LeadValues, updateLead } from './leads';

const { dealStages, deals } = schema;

export interface DiagnosisInput {
  actor: string;
  /**
   * Leva a negociação aberta de "A diagnosticar" para "A abordar"
   */
  advance: boolean;
  /**
   * Texto completo do diagnóstico e do plano; vira nota interna na linha do
   * tempo.
   */
  diagnosis?: string;
  leadId: string;
  values: LeadValues;
}

/**
 * Salva o diagnóstico de um lead de uma vez só: grava os campos confirmados,
 * registra o texto como nota interna e, se a negociação aberta ainda está em "A
 * diagnosticar", move para "A abordar" (a sincronia D3 leva o status do lead
 * junto). Tudo na mesma transação.
 */
export async function saveDiagnosis(db: Db, input: DiagnosisInput) {
  return db.transaction(async (tx) => {
    const lead = await updateLead(tx, input.leadId, input.values);
    const note = input.diagnosis
      ? await logInteraction(tx, {
          body: input.diagnosis,
          createdBy: 'mcp',
          direction: 'internal',
          leadId: input.leadId,
          summary: 'Diagnóstico do lead',
          type: 'note',
        })
      : null;
    const move = await advanceToContact(tx, input);

    await audit(tx, {
      action: 'save_diagnosis',
      actor: input.actor,
      diff: { dealMoved: move.moved, fields: Object.keys(input.values), note: Boolean(note) },
      entity: 'lead',
      entityId: input.leadId,
    });

    return { dealMoved: move, interactionId: note?.interaction.id ?? null, lead };
  });
}

async function advanceToContact(
  tx: Db,
  input: DiagnosisInput,
): Promise<{ dealId: null | string; moved: boolean; reason?: string }> {
  if (!input.advance) return { dealId: null, moved: false, reason: 'advance desligado' };

  const [open] = await tx
    .select({ id: deals.id, stage: dealStages.key })
    .from(deals)
    .innerJoin(dealStages, eq(dealStages.id, deals.stageId))
    .where(and(eq(deals.leadId, input.leadId), eq(deals.status, 'open')));

  if (!open) return { dealId: null, moved: false, reason: 'o lead não tem negociação aberta' };

  if (open.stage !== 'to_diagnose')
    return { dealId: open.id, moved: false, reason: `a negociação já está em "${open.stage}"` };

  const [target] = await tx.select().from(dealStages).where(eq(dealStages.key, 'to_contact'));

  if (!target) return { dealId: open.id, moved: false, reason: 'etapa "A abordar" não existe' };

  await moveDeal(tx, { dealId: open.id, source: 'mcp', stageId: target.id });

  return { dealId: open.id, moved: true };
}
