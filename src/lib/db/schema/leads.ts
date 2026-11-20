import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, tstz, updatedAt } from './_helpers';
import { niches, regions } from './catalog';
import { contactStatus, websiteStatus } from './enums';

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    nicheId: integer('niche_id')
      .notNull()
      .references(() => niches.id),
    regionId: integer('region_id')
      .notNull()
      .references(() => regions.id),
    phone: text('phone'),
    hasWhatsapp: boolean('has_whatsapp').default(false),
    email: text('email'),
    decisionMakerContact: text('decision_maker_contact'),
    websiteUrl: text('website_url'),
    websiteStatus: websiteStatus('website_status').default('unknown'),
    instagram: text('instagram'),
    otherSocials: text('other_socials'),
    mapsUrl: text('maps_url'),
    mapsRating: numeric('maps_rating', { precision: 2, scale: 1 }),
    mapsReviews: integer('maps_reviews'),
    ownerRepliesReviews: boolean('owner_replies_reviews'),
    complaints: text('complaints'),
    cnpjOpenedAt: date('cnpj_opened_at'),
    yearsInBusiness: integer('years_in_business'),
    companySize: text('company_size'),
    hasActiveAds: boolean('has_active_ads').default(false),
    instagramActive: boolean('instagram_active').default(false),
    strongLocalCompetition: boolean('strong_local_competition').default(false),
    score: integer('score').notNull().default(0),
    contactStatus: contactStatus('contact_status').notNull().default('new'),
    lastContactAt: tstz('last_contact_at'),
    channel: text('channel'),
    responseOrObjection: text('response_or_objection'),
    nextAction: text('next_action'),
    proposalValue: numeric('proposal_value', { precision: 12, scale: 2 }),
    notes: text('notes'),
    includedAt: date('included_at').default(sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`),
    placeId: text('place_id').unique(),
    mapsCategory: text('maps_category'),
    address: text('address'),
    digitalSignals: text('digital_signals'),
    businessSummary: text('business_summary'),
    pitch: text('pitch'),
    priority: integer('priority'),
    sessionUrl: text('session_url'),
    doNotContact: boolean('do_not_contact').notNull().default(false),
    sourceSheet: text('source_sheet'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // acréscimos permitidos pelo contrato
    phoneE164: text('phone_e164'),
    nameNormalized: text('name_normalized'),
    scoreBreakdown: jsonb('score_breakdown'),
    scoreComputedAt: tstz('score_computed_at'),
    contactStatusChangedAt: tstz('contact_status_changed_at'),
    doNotContactReason: text('do_not_contact_reason'),
    doNotContactAt: tstz('do_not_contact_at'),
    dataSource: text('data_source'), // google_places | import_sheet | manual | mcp
  },
  (t) => [
    index('leads_contact_status_idx').on(t.contactStatus),
    index('leads_niche_id_idx').on(t.nicheId),
    index('leads_region_id_idx').on(t.regionId),
    index('leads_score_idx').on(t.score.desc()),
    index('leads_phone_e164_idx').on(t.phoneE164),
    index('leads_name_normalized_trgm_idx').using('gin', sql`${t.nameNormalized} gin_trgm_ops`),
    index('leads_updated_at_idx').on(t.updatedAt.desc()),
    index('leads_do_not_contact_idx')
      .on(t.id)
      .where(sql`${t.doNotContact}`),
  ],
);
