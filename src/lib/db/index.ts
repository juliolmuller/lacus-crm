import { Pool as NeonPool } from '@neondatabase/serverless';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzlePg, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { type PgDatabase } from 'drizzle-orm/pg-core';
import { Pool as PgPool } from 'pg';

import { getEnv } from '@/lib/env';

import * as schema from './schema';

/**
 * Neon usa o driver serverless (WebSocket, com transações); Postgres local usa
 * node-postgres.
 */
export const isNeon = (url: string): boolean => new URL(url).hostname.endsWith('.neon.tech');

function create() {
  const url = getEnv().DATABASE_URL;
  const pool = isNeon(url)
    ? new NeonPool({ connectionString: url })
    : new PgPool({ connectionString: url });

  attachDatabasePool(pool);

  return isNeon(url)
    ? drizzleNeon(pool as NeonPool, { schema })
    : drizzlePg(pool as PgPool, { schema });
}

/**
 * Banco ou transação: os serviços aceitam os dois (transaction() dentro de uma
 * transação vira SAVEPOINT).
 */
export type Db = PgDatabase<NodePgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __db?: Db };

/**
 * Singleton (sobrevive ao HMR em dev). Os dois drivers expõem a mesma API do
 * Drizzle.
 */
export const getDb = (): Db => (globalForDb.__db ??= create() as unknown as Db);
export { schema };
