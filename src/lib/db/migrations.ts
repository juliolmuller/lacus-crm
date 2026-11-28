// Única fonte de verdade para "o banco está atrás do código?": usada por `db:status`,
// pelo aviso em desenvolvimento (instrumentation) e pelo passo de migration do deploy.
// Sem `server-only` e sem imports `@/`, para scripts Bun e instrumentation poderem importar.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client, type ClientBase } from 'pg';
import { z } from 'zod';

const journalSchema = z.object({
  entries: z.array(z.object({ idx: z.number(), tag: z.string(), when: z.number() })),
});

export type JournalEntry = z.infer<typeof journalSchema>['entries'][number];

export type MigrationStatus =
  | { applied: number; kind: 'up-to-date' }
  | { kind: 'ahead'; unknown: number[] }
  | { kind: 'pending'; pending: JournalEntry[] };

export type CheckedMigrationStatus = { kind: 'unreachable'; reason: string } | MigrationStatus;

/**
 * Chave do advisory lock que serializa migrations entre deploys simultâneos.
 */
export const MIGRATIONS_LOCK_ID = 7_283_104_592_017_361n;

/**
 * Migrations anteriores ao marcador `-- lacus:manual` que precisam de passo
 * manual. A 0005 reescreve dados e é incompatível com o código anterior; editar
 * migrations existentes está fora de questão.
 */
export const LEGACY_MANUAL_MIGRATIONS: readonly string[] = ['0005_english_enum_values'];

const MANUAL_MARKER = /^--\s*lacus:manual\b/m;

export class MigrationLockTimeoutError extends Error {
  public constructor() {
    super('Outra migração está em andamento (lock ocupado)');
    this.name = 'MigrationLockTimeoutError';
  }
}

export class ManualMigrationError extends Error {
  public readonly tags: string[];

  public constructor(tags: string[]) {
    super(`${tags.length} migration(s) manual(is) pendente(s): ${tags.join(', ')}`);
    this.name = 'ManualMigrationError';
    this.tags = tags;
  }
}

export async function readJournal(folder = 'drizzle'): Promise<JournalEntry[]> {
  const raw = await readFile(join(folder, 'meta', '_journal.json'), 'utf8');

  return journalSchema.parse(JSON.parse(raw)).entries;
}

function ident(name: string): string {
  if (!/^[A-Z_]\w*$/i.test(name)) throw new Error(`Identificador inválido: ${name}`);

  return `"${name}"`;
}

/**
 * Espelha o drizzle: pendente = entrada do journal mais nova que a última
 * aplicada.
 */
export async function getMigrationStatus(
  client: ClientBase,
  opts: { folder?: string; schema?: string; table?: string } = {},
): Promise<MigrationStatus> {
  const { folder, schema = 'drizzle', table = '__drizzle_migrations' } = opts;
  const journal = await readJournal(folder);
  const reg = await client.query<{ found: boolean }>(
    `SELECT to_regclass(format('%I.%I', $1::text, $2::text)) IS NOT NULL AS found`,
    [schema, table],
  );
  let applied: number[] = [];

  if (reg.rows[0]?.found) {
    const { rows } = await client.query<{ created_at: string }>(
      `SELECT created_at FROM ${ident(schema)}.${ident(table)} ORDER BY created_at`,
    );

    applied = rows.map((r) => Number(r.created_at));
  }

  const last = applied.length ? Math.max(...applied) : -Infinity;
  const pending = journal.filter((e) => e.when > last);

  if (pending.length) return { kind: 'pending', pending };

  const known = new Set(journal.map((e) => e.when));
  const unknown = applied.filter((when) => !known.has(when));

  if (unknown.length) return { kind: 'ahead', unknown };

  return { kind: 'up-to-date', applied: applied.length };
}

/**
 * Motivo seguro para mostrar: só código/mensagem do erro, nunca URL nem
 * credenciais.
 */
function safeReason(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown } | null;
  const raw =
    (typeof e?.code === 'string' && e.code)
    || (typeof e?.message === 'string' && e.message)
    || 'erro desconhecido';

  return raw.replace(/\S+:\/\/\S+/g, '[url]').slice(0, 120);
}

/**
 * Abre e fecha a própria conexão; nunca lança.
 */
export async function checkMigrationStatus(
  url: string | undefined,
  opts: { folder?: string; timeoutMs?: number } = {},
): Promise<CheckedMigrationStatus> {
  if (!url) return { kind: 'unreachable', reason: 'DATABASE_URL não definida' };

  const { timeoutMs = 3000, folder } = opts;

  try {
    await readJournal(folder);
  } catch (err) {
    return { kind: 'unreachable', reason: `journal de migrations ilegível: ${safeReason(err)}` };
  }

  let client: Client | undefined;

  try {
    // A construção também pode lançar (URL malformada), então fica dentro do try.
    client = new Client({
      connectionString: url,
      connectionTimeoutMillis: timeoutMs,
      query_timeout: timeoutMs,
    });
    client.on('error', () => {}); // queda de conexão ociosa não pode derrubar o processo
    await client.connect();

    return await getMigrationStatus(client, { folder });
  } catch (err) {
    return { kind: 'unreachable', reason: safeReason(err) };
  } finally {
    await client?.end().catch(() => {});
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatMigrationStatus(status: CheckedMigrationStatus): string {
  switch (status.kind) {
    case 'ahead':
      return `O banco tem migrations que não existem neste código (${status.unknown.join(', ')}): você está num branch mais antigo?`;
    case 'pending':
      return `${plural(status.pending.length, 'migration pendente', 'migrations pendentes')}: ${status.pending
        .map((e) => e.tag)
        .join(', ')}. Rode \`bun run db:migrate\`.`;
    case 'unreachable':
      return `Não foi possível checar as migrations (${status.reason}). Suba o Postgres com \`docker compose up -d\`.`;
    case 'up-to-date':
      return `Banco em dia (${plural(status.applied, 'migration aplicada', 'migrations aplicadas')}).`;
  }
}

/**
 * Tags pendentes que o deploy não aplica sozinho (marcador `-- lacus:manual` ou
 * lista legada).
 */
export function findManualMigrations(pending: JournalEntry[], folder = 'drizzle'): string[] {
  return pending
    .filter((entry) => {
      if (LEGACY_MANUAL_MIGRATIONS.includes(entry.tag)) return true;

      try {
        return MANUAL_MARKER.test(readFileSync(join(folder, `${entry.tag}.sql`), 'utf8'));
      } catch {
        return false; // sem o .sql o próprio migrator falha com mensagem melhor
      }
    })
    .map((entry) => entry.tag);
}

export async function withMigrationLock<T>(
  client: ClientBase,
  fn: () => Promise<T>,
  opts: { pollMs?: number; timeoutMs: number },
): Promise<T> {
  const { timeoutMs, pollMs = 1000 } = opts;
  const deadline = Date.now() + timeoutMs;
  const id = String(MIGRATIONS_LOCK_ID);

  for (;;) {
    const { rows } = await client.query<{ ok: boolean }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS ok',
      [id],
    );

    if (rows[0]?.ok) break;

    if (Date.now() >= deadline) throw new MigrationLockTimeoutError();

    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, deadline - Date.now())));
  }

  try {
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1::bigint)', [id]).catch(() => {});
  }
}

export type DeployAction =
  | { action: 'error'; message: string }
  | { action: 'migrate'; url: string }
  | { action: 'skip'; reason: 'emergency' }
  | { action: 'skip'; reason: 'not-production'; vercelEnv: string | undefined };

/**
 * Decide, sem tocar no banco, o que o passo de migration do build faz. Só
 * produção migra.
 */
export function resolveDeployAction(env: Record<string, string | undefined>): DeployAction {
  if (env.VERCEL_ENV !== 'production') {
    return { action: 'skip', reason: 'not-production', vercelEnv: env.VERCEL_ENV };
  }

  if (env.SKIP_DB_MIGRATIONS === '1') return { action: 'skip', reason: 'emergency' };

  if (!env.DATABASE_URL_UNPOOLED) {
    return {
      action: 'error',
      message:
        'DATABASE_URL_UNPOOLED é obrigatória no build de produção: a URL com pooler (PgBouncer) quebra o advisory lock das migrations.',
    };
  }

  return { action: 'migrate', url: env.DATABASE_URL_UNPOOLED };
}

/**
 * Aplica as migrations pendentes sob lock. Devolve as tags aplicadas.
 */
export async function runMigrations(opts: {
  deploy: boolean;
  folder?: string;
  lockTimeoutMs?: number;
  url: string;
}): Promise<string[]> {
  const { url, folder = './drizzle', deploy, lockTimeoutMs = 120_000 } = opts;
  const client = new Client({ connectionString: url });

  client.on('error', () => {});
  await client.connect();

  try {
    return await withMigrationLock(
      client,
      async () => {
        const before = await getMigrationStatus(client, { folder });

        if (before.kind !== 'pending') return [];

        if (deploy) {
          const manual = findManualMigrations(before.pending, folder);

          if (manual.length) throw new ManualMigrationError(manual);
        }

        const [{ drizzle }, { migrate }] = await Promise.all([
          import('drizzle-orm/node-postgres'),
          import('drizzle-orm/node-postgres/migrator'),
        ]);

        // O migrator do drizzle aplica todas as pendentes numa única transação.
        await migrate(drizzle(client), { migrationsFolder: folder });

        const after = await getMigrationStatus(client, { folder });
        const stillPending = new Set(
          after.kind === 'pending' ? after.pending.map((e) => e.tag) : [],
        );

        return before.pending.map((e) => e.tag).filter((tag) => !stillPending.has(tag));
      },
      { timeoutMs: lockTimeoutMs },
    );
  } finally {
    await client.end().catch(() => {});
  }
}
