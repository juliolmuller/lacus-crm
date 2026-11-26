import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { spawnSync } from 'node:child_process';
import { Client, Pool } from 'pg';

import { e2eDatabaseUrl } from './env';

/**
 * Recria `<banco>_e2e`: migra, roda o seed (etapas, settings, modelos, regras)
 * e grava só dados de fixture. O banco de desenvolvimento (com a planilha real)
 * nunca é lido nem escrito. Roda antes do servidor: `tsx tests/e2e/setup-db.ts
 * && next dev`.
 */
const url = e2eDatabaseUrl();
const name = new URL(url).pathname.slice(1);

if (!name.endsWith('_e2e')) throw new Error('banco e2e inválido');

// conecta no banco de manutenção, não no de desenvolvimento
const maintenance = new URL(url);
maintenance.pathname = '/postgres';
const admin = new Client({ connectionString: maintenance.toString() });

await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();

const pool = new Pool({ connectionString: url });

await migrate(drizzle(pool), { migrationsFolder: './drizzle' });

const env = {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  SEED_SKIP_NICHES: '1',
};
const seed = spawnSync('bun', ['scripts/seed.ts'], { env, stdio: 'inherit' });

if (seed.status !== 0) throw new Error('seed falhou');

// fixtures mínimas: leads, 1 negociação e 2 itens de fila tiram painel, lista, funil e fila do estado vazio;
// o resto cada teste cria e remove
await pool.query(`
  insert into niches (name, ticket) values ('Clínicas odontológicas', 'high'), ('Escritórios de advocacia', 'medium');
  insert into regions (state, city, neighborhood, label)
    values ('PR', 'Curitiba', 'Xaxim', 'PR - Curitiba - Xaxim'), ('PR', 'Curitiba', 'Batel', 'PR - Curitiba - Batel');
  insert into leads (name, name_normalized, niche_id, region_id, data_source, contact_status)
    select 'Base ' || n.name, lower('Base ' || n.name), n.id, r.id, 'manual', 'to_contact'
    from niches n cross join regions r where r.neighborhood = 'Xaxim';
  insert into deals (lead_id, stage_id, title, position)
    select l.id, (select id from deal_stages where key = 'to_diagnose'), l.name, 'a0'
    from leads l order by l.name limit 1;
  insert into prospecting_queue (position, region_id, niche_id, sort_order)
    select row_number() over (order by n.id), r.id, n.id, row_number() over (order by n.id)
    from niches n cross join regions r where r.neighborhood = 'Batel';
`);
await pool.end();
console.info(`Banco e2e pronto: ${name}`);
