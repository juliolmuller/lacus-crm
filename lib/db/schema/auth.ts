// Gerado com `pnpm dlx auth@latest generate` (Better Auth 1.7) e ajustado: timestamps com fuso e sem relations.
import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const pk = () =>
  uuid('id')
    .default(sql`pg_catalog.gen_random_uuid()`)
    .primaryKey();

export const auth_users = pgTable('auth_users', {
  id: pk(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: ts('created_at').defaultNow().notNull(),
  updatedAt: ts('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const auth_sessions = pgTable(
  'auth_sessions',
  {
    id: pk(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => auth_users.id, { onDelete: 'cascade' }),
  },
  (t) => [index('auth_sessions_userId_idx').on(t.userId)],
);

export const auth_accounts = pgTable(
  'auth_accounts',
  {
    id: pk(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => auth_users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('auth_accounts_userId_idx').on(t.userId)],
);

export const auth_verifications = pgTable(
  'auth_verifications',
  {
    id: pk(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').defaultNow().notNull(),
    updatedAt: ts('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('auth_verifications_identifier_idx').on(t.identifier)],
);
