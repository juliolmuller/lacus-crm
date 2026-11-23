import { config } from 'dotenv';
import { TransactionRollbackError } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll } from 'vitest';

import { type Db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

config({ path: '.env.local', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema }) as unknown as Db;

afterAll(() => pool.end());

/**
 * Cada teste roda numa transação revertida; os serviços abrem SAVEPOINTs dentro
 * dela.
 */
export async function inTx(fn: (tx: Db) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx as unknown as Db);
      tx.rollback();
    });
  } catch (e) {
    if (!(e instanceof TransactionRollbackError)) throw e;
  }
}
export { schema };
