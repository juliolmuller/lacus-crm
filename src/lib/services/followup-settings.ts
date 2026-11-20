import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { schema } from '@/lib/db';
import { interactionTypes, outcomeLabel } from '@/lib/leads/labels';
import { cadence, cancelOn } from '@/lib/validation/followups';
import {
  parseSetting,
  settingDefaults,
  settingSchemas,
  type SettingKey,
} from '@/lib/validation/settings';

const { settings, followupRules, messageTemplates } = schema;

export async function getSetting<K extends SettingKey>(db: Db, key: K) {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return parseSetting(key, row?.value ?? settingDefaults[key]);
}

/** Valida com o Zod da chave e grava (upsert). */
export async function saveSetting<K extends SettingKey>(db: Db, key: K, value: unknown) {
  const parsed = settingSchemas[key].parse(value);
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed } });
}

export const ruleInput = z.object({
  name: z.string().trim().min(2, 'Dê um nome à regra'),
  active: z.boolean(),
  trigger: z.enum(['deal_created', 'deal_stage_entered', 'interaction_logged']),
  stageId: z.number().int().nullable(),
  interactionOutcome: z.enum(Object.keys(outcomeLabel) as [string, ...string[]]).nullable(),
  interactionDirection: z.enum(['outbound', 'inbound', 'internal']).nullable(),
  interactionType: z.enum([...interactionTypes, 'system']).nullable(),
  cadence,
  cancelOn,
});
export type RuleInput = z.infer<typeof ruleInput>;

export const listRules = (db: Db) =>
  db.select().from(followupRules).orderBy(asc(followupRules.sort), asc(followupRules.id));

export async function saveRule(db: Db, id: number | null, input: RuleInput) {
  // gatilhos de etapa não usam filtros de interação, e vice-versa
  const v =
    input.trigger === 'interaction_logged'
      ? { ...input, stageId: null }
      : { ...input, interactionOutcome: null, interactionDirection: null, interactionType: null };
  const values = {
    ...v,
    interactionOutcome:
      v.interactionOutcome as (typeof followupRules.$inferInsert)['interactionOutcome'],
  };
  if (id) await db.update(followupRules).set(values).where(eq(followupRules.id, id));
  else {
    const rows = await listRules(db);
    await db.insert(followupRules).values({ ...values, sort: (rows.at(-1)?.sort ?? 0) + 1 });
  }
}

export const deleteRule = async (db: Db, id: number) => {
  await db.delete(followupRules).where(eq(followupRules.id, id)); // lembretes ficam (rule_id vira null)
};

export const templateInput = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,40}$/, 'Chave: letras minúsculas, números e _'),
  name: z.string().trim().min(2, 'Dê um nome ao modelo'),
  channel: z.enum(['whatsapp', 'email', 'instagram']),
  body: z.string().trim().min(5, 'Escreva a mensagem'),
  active: z.boolean(),
});
export type TemplateInput = z.infer<typeof templateInput>;

export const listTemplates = (db: Db) =>
  db.select().from(messageTemplates).orderBy(asc(messageTemplates.id));

export async function saveTemplate(db: Db, id: number | null, input: TemplateInput) {
  if (id) {
    // a chave identifica o modelo nas regras: não muda
    const set = {
      name: input.name,
      channel: input.channel,
      body: input.body,
      active: input.active,
    };
    await db.update(messageTemplates).set(set).where(eq(messageTemplates.id, id));
  } else await db.insert(messageTemplates).values(input);
}

export const deleteTemplate = async (db: Db, id: number) => {
  await db.delete(messageTemplates).where(eq(messageTemplates.id, id));
};
