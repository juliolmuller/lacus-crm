import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { getSetting, listTemplates } from './followup-settings';
import { getLead, getScoreSettings } from './leads';

const { interactions, deals, dealStages, reminders } = schema;

/** Tudo que o drawer/página do lead mostra, numa chamada. */
export async function getLeadDetail(db: Db, id: string) {
  const base = await getLead(db, id);
  if (!base) return null;
  const [timeline, dealRows, reminderRows, settings, templates, profile] = await Promise.all([
    db
      .select()
      .from(interactions)
      .where(eq(interactions.leadId, id))
      .orderBy(desc(interactions.occurredAt))
      .limit(100),
    db
      .select({ deal: deals, stage: dealStages })
      .from(deals)
      .innerJoin(dealStages, eq(dealStages.id, deals.stageId))
      .where(eq(deals.leadId, id))
      .orderBy(desc(deals.createdAt)),
    db
      .select()
      .from(reminders)
      .where(eq(reminders.leadId, id))
      .orderBy(desc(reminders.dueAt))
      .limit(50),
    getScoreSettings(db),
    listTemplates(db),
    getSetting(db, 'owner_profile'),
  ]);
  return {
    ...base,
    interactions: timeline,
    deals: dealRows,
    reminders: reminderRows,
    settings,
    templates: templates.filter((t) => t.active && t.channel === 'whatsapp'),
    profile,
  };
}
export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLeadDetail>>>;
