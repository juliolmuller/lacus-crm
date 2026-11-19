import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';

/**
 * Os testes de integração rodam num banco próprio (`<nome>_test`), criado e migrado aqui.
 * Assim a base de desenvolvimento, com os dados reais importados, nunca é tocada.
 */
export default async function setup() {
  config({ path: '.env.local', quiet: true });
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL ausente (veja .env.example)');
  const url = new URL(base);
  const name = `${url.pathname.slice(1).replace(/_test$/, '')}_test`;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString(); // os workers herdam
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  await pool.end();
}
