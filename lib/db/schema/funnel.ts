import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, textC, tstz, updatedAt } from './_helpers';
import { actorSource, contactStatus, dealStatus } from './enums';
import { leads } from './leads';

export const dealStages = pgTable('deal_stages', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  color: text('color').notNull(), // token, ex.: stage-1
  sort: integer('sort').notNull(),
  isWon: boolean('is_won').notNull().default(false),
  isLost: boolean('is_lost').notNull().default(false),
  defaultProbability: integer('default_probability'),
  archivedAt: tstz('archived_at'),
  // PLAN D2/D3: status do lead aplicado ao entrar na etapa (só avança)
  leadStatus: contactStatus('lead_status'),
});

export const deals = pgTable(
  'deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    stageId: integer('stage_id')
      .notNull()
      .references(() => dealStages.id),
    title: text('title').notNull(),
    position: textC('position').notNull(),
    value: numeric('value', { precision: 12, scale: 2 }),
    probability: integer('probability'),
    serviceType: text('service_type'),
    expectedCloseOn: date('expected_close_on'),
    status: dealStatus('status').notNull().default('open'),
    lostReason: text('lost_reason'),
    wonAt: tstz('won_at'),
    lostAt: tstz('lost_at'),
    stageEnteredAt: tstz('stage_entered_at').defaultNow().notNull(),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('deals_stage_position_idx').on(t.stageId, t.position),
    index('deals_lead_id_idx').on(t.leadId),
    // no máximo uma negociação aberta por lead
    uniqueIndex('deals_one_open_per_lead_idx')
      .on(t.leadId)
      .where(sql`${t.status} = 'open'`),
  ],
);

export const dealStageHistory = pgTable('deal_stage_history', {
  id: serial('id').primaryKey(),
  dealId: uuid('deal_id')
    .notNull()
    .references(() => deals.id, { onDelete: 'cascade' }),
  fromStageId: integer('from_stage_id').references(() => dealStages.id),
  toStageId: integer('to_stage_id')
    .notNull()
    .references(() => dealStages.id),
  movedAt: tstz('moved_at').defaultNow().notNull(),
  source: actorSource('source').notNull().default('ui'),
});
