import { char, integer, pgTable, serial, text, unique } from 'drizzle-orm/pg-core';

import { createdAt, updatedAt } from './_helpers';
import { nicheOpenness, nicheTicket } from './enums';

export const niches = pgTable('niches', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  ticket: nicheTicket('ticket'),
  openness: nicheOpenness('openness'),
  whyBuys: text('why_buys'),
  firstOffer: text('first_offer'),
  priority: integer('priority'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const regions = pgTable(
  'regions',
  {
    id: serial('id').primaryKey(),
    state: char('state', { length: 2 }).notNull(),
    city: text('city').notNull(),
    neighborhood: text('neighborhood'),
    // "PR - Curitiba - Xaxim"; sem bairro: "PR - <Cidade>"
    label: text('label').notNull(),
    sourceSheetId: text('source_sheet_id'),
  },
  (t) => [unique('regions_label_unique').on(t.label)],
);
