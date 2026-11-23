import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, serial, text, uuid } from 'drizzle-orm/pg-core';

import { createdAt, tstz, updatedAt } from './_helpers';
import { niches } from './catalog';
import {
  followupTrigger,
  interactionCreatedBy,
  interactionDirection,
  interactionOutcome,
  interactionType,
  reminderSource,
  reminderStatus,
  syncStatus,
  templateChannel,
} from './enums';
import { deals, dealStages } from './funnel';
import { leads } from './leads';

export const followupRules = pgTable('followup_rules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  trigger: followupTrigger('trigger').notNull(),
  stageId: integer('stage_id').references(() => dealStages.id),
  interactionOutcome: interactionOutcome('interaction_outcome'),
  interactionDirection: interactionDirection('interaction_direction'),
  // PLAN D2: a cadência de proposta dispara por interação do tipo `proposal`
  interactionType: interactionType('interaction_type'),
  cadence: jsonb('cadence').notNull(), // [{offsetBusinessDays, time:"09:30", title, templateKey?}]
  cancelOn: jsonb('cancel_on').notNull().default({}), // ex.: {"inboundInteraction":true,"stageLeft":true}
  sort: integer('sort').notNull().default(0),
});

export const messageTemplates = pgTable('message_templates', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  channel: templateChannel('channel').notNull(),
  nicheId: integer('niche_id').references(() => niches.id),
  stageId: integer('stage_id').references(() => dealStages.id),
  body: text('body').notNull(),
  active: boolean('active').notNull().default(true),
});

export const interactions = pgTable(
  'interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    type: interactionType('type').notNull(),
    direction: interactionDirection('direction').notNull(),
    outcome: interactionOutcome('outcome'),
    summary: text('summary').notNull(),
    body: text('body'),
    occurredAt: tstz('occurred_at').defaultNow().notNull(),
    templateId: integer('template_id').references(() => messageTemplates.id, {
      onDelete: 'set null',
    }),
    createdBy: interactionCreatedBy('created_by').notNull().default('user'),
    createdAt: createdAt(),
  },
  (t) => [
    index('interactions_lead_occurred_idx').on(t.leadId, t.occurredAt.desc()),
    index('interactions_deal_occurred_idx').on(t.dealId, t.occurredAt.desc()),
  ],
);

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // com deal_id preenchido, o trigger força lead_id = deals.lead_id
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    dueAt: tstz('due_at').notNull(),
    durationMin: integer('duration_min').notNull().default(15),
    status: reminderStatus('status').notNull().default('open'),
    completedAt: tstz('completed_at'),
    snoozeCount: integer('snooze_count').notNull().default(0),
    source: reminderSource('source').notNull().default('manual'),
    ruleId: integer('rule_id').references(() => followupRules.id, { onDelete: 'set null' }),
    dedupeKey: text('dedupe_key').unique(),
    googleCalendarId: text('google_calendar_id'),
    googleEventId: text('google_event_id'),
    syncStatus: syncStatus('sync_status').notNull().default('pending'),
    syncAttempts: integer('sync_attempts').notNull().default(0),
    syncError: text('sync_error'),
    syncedAt: tstz('synced_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('reminders_status_due_idx').on(t.status, t.dueAt),
    index('reminders_lead_id_idx').on(t.leadId),
    index('reminders_sync_pending_idx')
      .on(t.syncStatus)
      .where(sql`${t.syncStatus} in ('pending','error')`),
  ],
);
