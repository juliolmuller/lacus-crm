import { bigserial, boolean, index, integer, jsonb, pgTable, serial, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, tstz, updatedAt } from './_helpers';
import { googleStatus, viewScope } from './enums';

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
});

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  tokenPrefix: text('token_prefix').notNull(), // 8 caracteres, exibível
  tokenHash: text('token_hash').notNull().unique(), // SHA-256 hex
  scopes: text('scopes').array().notNull(), // read | write | prospecting
  lastUsedAt: tstz('last_used_at'),
  expiresAt: tstz('expires_at'),
  revokedAt: tstz('revoked_at'),
  createdAt: createdAt(),
});

export const googleConnections = pgTable('google_connections', {
  id: serial('id').primaryKey(),
  googleEmail: text('google_email').notNull(),
  refreshTokenEnc: text('refresh_token_enc').notNull(),
  accessTokenEnc: text('access_token_enc'),
  accessTokenExpiresAt: tstz('access_token_expires_at'),
  scope: text('scope'),
  calendarId: text('calendar_id'),
  status: googleStatus('status').notNull().default('active'),
  lastError: text('last_error'),
  connectedAt: tstz('connected_at').defaultNow().notNull(),
  updatedAt: updatedAt(),
});

export const jobRuns = pgTable('job_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  job: text('job').notNull(),
  executionId: text('execution_id').unique(),
  startedAt: tstz('started_at').defaultNow().notNull(),
  finishedAt: tstz('finished_at'),
  status: text('status').notNull().default('running'),
  stats: jsonb('stats'),
  error: text('error'),
});

export const savedViews = pgTable('saved_views', {
  id: serial('id').primaryKey(),
  scope: viewScope('scope').notNull(),
  name: text('name').notNull(),
  params: jsonb('params').notNull().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  sort: integer('sort').notNull().default(0),
});

export const suppressionList = pgTable(
  'suppression_list',
  {
    id: serial('id').primaryKey(),
    placeId: text('place_id'),
    phoneE164Hash: text('phone_e164_hash'),
    nameRegionHash: text('name_region_hash'),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('suppression_place_id_idx').on(t.placeId),
    index('suppression_phone_hash_idx').on(t.phoneE164Hash),
    index('suppression_name_region_hash_idx').on(t.nameRegionHash),
  ],
);

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  entity: text('entity').notNull(),
  entityId: text('entity_id').notNull(),
  action: text('action').notNull(),
  actor: text('actor').notNull(), // user | mcp:<tokenId> | rule | job
  diff: jsonb('diff'),
  at: tstz('at').defaultNow().notNull(),
});
