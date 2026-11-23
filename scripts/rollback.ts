// Desfaz migrations aplicadas: `bun run db:rollback` (última), `bun run db:rollback 2` (duas) ou `bun run db:rollback all`.
// Executa drizzle/down/<tag>.down.sql e remove o registro de drizzle.__drizzle_migrations, numa transação por migration.
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

config({ path: '.env.local', quiet: true });

const root = join(import.meta.dirname, '..', 'drizzle');
const journal: { entries: Array<{ tag: string; when: number }> } = JSON.parse(
  readFileSync(join(root, 'meta', '_journal.json'), 'utf8'),
);
const arg = process.argv[2] ?? '1';
const steps = arg === 'all' ? Infinity : Number(arg);

if (!(steps >= 1)) throw new Error(`Argumento inválido: "${arg}" (use um número ou "all")`);

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!url) throw new Error('DATABASE_URL não definida');

const client = new Client({ connectionString: url });

await client.connect();

try {
  for (let done = 0; done < steps; done++) {
    const { rows } = await client.query<{ created_at: string }>(
      'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    );

    if (!rows[0]) break;

    const entry = journal.entries.find((e) => e.when === Number(rows[0]!.created_at));

    if (!entry) throw new Error(`Migration aplicada (${rows[0].created_at}) não existe no journal`);

    const down = readFileSync(join(root, 'down', `${entry.tag}.down.sql`), 'utf8');

    await client.query('BEGIN');

    try {
      await client.query(down);
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1', [
        entry.when,
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    console.info(`rollback: ${entry.tag}`);
  }
} finally {
  await client.end();
}
