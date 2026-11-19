import type { Db } from '@/lib/db';

export type RuleEvent =
  | { type: 'deal_created'; dealId: string; leadId: string; stageId: number }
  | {
      type: 'deal_stage_entered';
      dealId: string;
      leadId: string;
      stageId: number;
      fromStageId: number | null;
    }
  | { type: 'interaction_logged'; interactionId: string; leadId: string; dealId: string | null };

/**
 * Ponto de encaixe do motor de follow-ups (fase 4). Roda na mesma transação do evento e devolve os
 * ids dos lembretes criados. Na fase 3 não faz nada.
 */
export async function applyRules(_tx: Db, _event: RuleEvent): Promise<string[]> {
  return [];
}
