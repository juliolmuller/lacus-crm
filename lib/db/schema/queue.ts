import { date, index, integer, pgTable, serial, text, time, unique } from 'drizzle-orm/pg-core';
import { tstz } from './_helpers';
import { niches, regions } from './catalog';
import { queueStatus } from './enums';

export const prospectingQueue = pgTable(
  'prospecting_queue',
  {
    position: integer('position').primaryKey(),
    regionId: integer('region_id')
      .notNull()
      .references(() => regions.id),
    nicheId: integer('niche_id')
      .notNull()
      .references(() => niches.id),
    status: queueStatus('status').notNull().default('pending'),
    executedAt: tstz('executed_at'),
    leadsAdded: integer('leads_added').default(0),
    notes: text('notes'),
    sortOrder: integer('sort_order').notNull(), // ordem de execução; reordenar mexe aqui, nunca em position
    skippedAt: tstz('skipped_at'),
    claimedAt: tstz('claimed_at'), // lease de 30 min
    attempts: integer('attempts').default(0),
  },
  (t) => [
    unique('prospecting_queue_region_niche_unique').on(t.regionId, t.nicheId),
    index('prospecting_queue_status_sort_idx').on(t.status, t.sortOrder),
  ],
);

export const apiUsageLog = pgTable(
  'api_usage_log',
  {
    id: serial('id').primaryKey(),
    day: date('day').notNull(),
    at: time('at').notNull(),
    queuePosition: integer('queue_position'),
    requests: integer('requests').notNull().default(0),
    leadsSaved: integer('leads_saved').notNull().default(0),
    note: text('note'),
    runId: text('run_id').unique(), // idempotência
  },
  (t) => [index('api_usage_log_day_idx').on(t.day)],
);
