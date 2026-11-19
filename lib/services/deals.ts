import { and, desc, eq } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import type { ContactStatus } from '@/lib/leads/labels';

const { deals, dealStages, dealStageHistory } = schema;

/** PLAN D4: etapa equivalente ao status do lead. `discarded` não vira negociação. */
export const stageKeyForStatus = (s: ContactStatus) =>
  (
    ({
      new: 'to_diagnose',
      to_contact: 'to_diagnose',
      contacted: 'contacted',
      no_response: 'contacted',
      replied: 'talking',
      negotiating: 'negotiating',
      client: 'won',
      lost: 'lost',
      discarded: null,
    }) as const
  )[s];

/** Cria a negociação no fim da etapa e grava o histórico. Se o lead já tem uma aberta, não faz nada. */
export async function createDeal(
  db: Db,
  input: {
    leadId: string;
    title: string;
    stageKey: string;
    value?: string | null;
    source: 'ui' | 'mcp' | 'rule' | 'import';
  },
) {
  const [stage] = await db.select().from(dealStages).where(eq(dealStages.key, input.stageKey));
  if (!stage) throw new Error(`Etapa inexistente: ${input.stageKey}`);
  if (!stage.isWon && !stage.isLost) {
    // índice único parcial: uma aberta por lead
    const [open] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.leadId, input.leadId), eq(deals.status, 'open')))
      .limit(1);
    if (open) return null;
  }
  const [last] = await db
    .select({ position: deals.position })
    .from(deals)
    .where(eq(deals.stageId, stage.id))
    .orderBy(desc(deals.position))
    .limit(1);
  const now = new Date();
  const [deal] = await db
    .insert(deals)
    .values({
      leadId: input.leadId,
      stageId: stage.id,
      title: input.title,
      position: generateKeyBetween(last?.position ?? null, null),
      value: input.value ?? null,
      probability: stage.defaultProbability,
      status: stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open',
      wonAt: stage.isWon ? now : null,
      lostAt: stage.isLost ? now : null,
    })
    .returning();
  await db
    .insert(dealStageHistory)
    .values({ dealId: deal!.id, fromStageId: null, toStageId: stage.id, source: input.source });
  return deal!;
}
