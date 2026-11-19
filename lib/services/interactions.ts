import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { syncedStatus } from '@/lib/funnel/status-sync';
import { advanceOpenDeal } from './deals';
import { LeadError, setDoNotContact } from './leads';
import { applyRules } from './rules';

const { interactions, leads, deals } = schema;

export type InteractionInput = {
  leadId: string;
  dealId?: string | null;
  type: (typeof interactions.$inferInsert)['type'];
  direction: (typeof interactions.$inferInsert)['direction'];
  outcome?: (typeof interactions.$inferInsert)['outcome'];
  summary: string;
  body?: string | null;
  occurredAt?: Date;
  templateId?: number | null;
  createdBy?: (typeof interactions.$inferInsert)['createdBy'];
  /** reunião marcada: data (AAAA-MM-DD) que ancora "Preparar diagnóstico" */
  meetingOn?: string;
  /** pediu para retomar depois: dias úteis até o lembrete (padrão da regra: 20) */
  resumeInDays?: number;
};

const channelLabel: Partial<Record<InteractionInput['type'], string>> = {
  whatsapp: 'WhatsApp',
  call: 'Ligação',
  email: 'E-mail',
  instagram_dm: 'Instagram',
  in_person: 'Presencial',
  meeting: 'Reunião',
};

/**
 * Registra a interação e aplica os efeitos do PLAN D3, tudo numa transação:
 * - outbound de contato: lead → Abordado (só avança), último contato e negociação → Abordado;
 * - inbound: lead → Respondeu (só avança) e negociação → Em conversa;
 * - resultado opt_out: fluxo "Não contatar" (SPEC 4.4).
 * `note` e `system` (internas) não mexem em nada.
 */
export async function logInteraction(db: Db, input: InteractionInput) {
  return db.transaction(async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId));
    if (!lead) throw new LeadError('NOT_FOUND', 'Lead não encontrado');
    // sem deal informado, a interação fica na negociação aberta do lead
    const dealId =
      input.dealId !== undefined
        ? input.dealId
        : ((
            await tx
              .select({ id: deals.id })
              .from(deals)
              .where(and(eq(deals.leadId, lead.id), eq(deals.status, 'open')))
          )[0]?.id ?? null);
    const occurredAt = input.occurredAt ?? new Date();
    const [row] = await tx
      .insert(interactions)
      .values({
        leadId: lead.id,
        dealId,
        type: input.type,
        direction: input.direction,
        outcome: input.outcome ?? null,
        summary: input.summary,
        body: input.body ?? null,
        occurredAt,
        templateId: input.templateId ?? null,
        createdBy: input.createdBy ?? 'user',
      })
      .returning();

    const contact = input.type !== 'note' && input.type !== 'system';
    if (contact && input.direction === 'outbound') {
      const status = syncedStatus(lead.contactStatus, 'contacted');
      await tx
        .update(leads)
        .set({
          lastContactAt: sql`greatest(${leads.lastContactAt}, ${occurredAt.toISOString()}::timestamptz)`,
          channel: channelLabel[input.type] ?? lead.channel,
          ...(status ? { contactStatus: status, contactStatusChangedAt: new Date() } : {}),
        })
        .where(eq(leads.id, lead.id));
      await advanceOpenDeal(tx, lead.id, 'contacted');
    } else if (contact && input.direction === 'inbound') {
      const status = syncedStatus(lead.contactStatus, 'replied');
      if (status)
        await tx
          .update(leads)
          .set({ contactStatus: status, contactStatusChangedAt: new Date() })
          .where(eq(leads.id, lead.id));
      await advanceOpenDeal(tx, lead.id, 'talking');
    }
    if (input.outcome === 'opt_out' && !lead.doNotContact)
      await setDoNotContact(tx, lead.id, { reason: input.summary, optOut: true });

    const reminderIds = await applyRules(tx, {
      type: 'interaction_logged',
      interactionId: row!.id,
      leadId: lead.id,
      dealId,
      meetingOn: input.meetingOn,
      resumeInDays: input.resumeInDays,
    });
    return { interaction: row!, reminderIds };
  });
}
