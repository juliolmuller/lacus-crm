import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findManualMigrations,
  formatMigrationStatus,
  readJournal,
  resolveDeployAction,
} from '../../src/lib/db/migrations';

const UNPOOLED = 'postgres://u:secret@db.example.com/main?sslmode=require';
const POOLED = 'postgres://u:secret@db-pooler.example.com/main?sslmode=require';

describe('resolveDeployAction', () => {
  it.each(['preview', 'development', undefined, ''])(
    'pula sem tocar no banco quando VERCEL_ENV=%s',
    (vercelEnv) => {
      const action = resolveDeployAction({
        VERCEL_ENV: vercelEnv,
        DATABASE_URL: POOLED,
        DATABASE_URL_UNPOOLED: UNPOOLED,
      });

      expect(action).toEqual({ action: 'skip', reason: 'not-production', vercelEnv });
      expect(JSON.stringify(action)).not.toContain('secret');
    },
  );

  it('pula com aviso quando SKIP_DB_MIGRATIONS=1 em produção', () => {
    expect(
      resolveDeployAction({
        VERCEL_ENV: 'production',
        SKIP_DB_MIGRATIONS: '1',
        DATABASE_URL_UNPOOLED: UNPOOLED,
      }),
    ).toEqual({ action: 'skip', reason: 'emergency' });
  });

  it('ignora SKIP_DB_MIGRATIONS fora de produção (o motivo continua sendo o ambiente)', () => {
    expect(resolveDeployAction({ VERCEL_ENV: 'preview', SKIP_DB_MIGRATIONS: '1' })).toEqual({
      action: 'skip',
      reason: 'not-production',
      vercelEnv: 'preview',
    });
  });

  it('falha em produção sem DATABASE_URL_UNPOOLED, mesmo com a URL com pooler', () => {
    const action = resolveDeployAction({ VERCEL_ENV: 'production', DATABASE_URL: POOLED });

    expect(action.action).toBe('error');
    expect(action).toHaveProperty('message', expect.stringContaining('DATABASE_URL_UNPOOLED'));
    expect(JSON.stringify(action)).not.toContain('secret');
  });

  it('migra em produção com a URL direta, ignorando a do pooler', () => {
    expect(
      resolveDeployAction({
        VERCEL_ENV: 'production',
        DATABASE_URL: POOLED,
        DATABASE_URL_UNPOOLED: UNPOOLED,
      }),
    ).toEqual({ action: 'migrate', url: UNPOOLED });
  });
});

describe('formatMigrationStatus', () => {
  it('banco em dia', () => {
    expect(formatMigrationStatus({ kind: 'up-to-date', applied: 6 })).toBe(
      'Banco em dia (6 migrations aplicadas).',
    );
  });

  it('migrations pendentes, com o comando a rodar', () => {
    expect(
      formatMigrationStatus({
        kind: 'pending',
        pending: [{ idx: 6, tag: '0006_a', when: 1 }],
      }),
    ).toBe('1 migration pendente: 0006_a. Rode `bun run db:migrate`.');
    expect(
      formatMigrationStatus({
        kind: 'pending',
        pending: [
          { idx: 6, tag: '0006_a', when: 1 },
          { idx: 7, tag: '0007_b', when: 2 },
        ],
      }),
    ).toBe('2 migrations pendentes: 0006_a, 0007_b. Rode `bun run db:migrate`.');
  });

  it('banco à frente do código', () => {
    expect(formatMigrationStatus({ kind: 'ahead', unknown: [123, 456] })).toBe(
      'O banco tem migrations que não existem neste código (123, 456): você está num branch mais antigo?',
    );
  });

  it('banco inacessível, sem URL na mensagem', () => {
    const text = formatMigrationStatus({ kind: 'unreachable', reason: 'ECONNREFUSED' });

    expect(text).toBe(
      'Não foi possível checar as migrations (ECONNREFUSED). Suba o Postgres com `docker compose up -d`.',
    );
  });
});

describe('findManualMigrations / readJournal', () => {
  const dirs: string[] = [];

  async function folder(
    entries: Array<{ sql: string; tag: string }>,
    journalOverride?: string,
  ): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'lacus-migrations-'));

    dirs.push(dir);
    await mkdir(join(dir, 'meta'));
    await writeFile(
      join(dir, 'meta', '_journal.json'),
      journalOverride
        ?? JSON.stringify({
          version: '7',
          dialect: 'postgresql',
          entries: entries.map((e, idx) => ({
            idx,
            version: '7',
            when: 1000 + idx,
            tag: e.tag,
            breakpoints: true,
          })),
        }),
    );
    for (const e of entries) await writeFile(join(dir, `${e.tag}.sql`), e.sql);

    return dir;
  }

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it('detecta o marcador -- lacus:manual e ignora migrations comuns', async () => {
    const dir = await folder([
      { tag: '0100_normal', sql: 'ALTER TABLE a ADD COLUMN b text;' },
      { tag: '0101_manual', sql: '-- lacus:manual\nUPDATE a SET b = 1;' },
      { tag: '0102_indented', sql: 'SELECT 1;\n--   lacus:manual   \nSELECT 2;' },
      { tag: '0103_mention', sql: "SELECT '-- lacus:manual';" },
    ]);

    expect(findManualMigrations(await readJournal(dir), dir)).toEqual([
      '0101_manual',
      '0102_indented',
    ]);
  });

  it('detecta a 0005_english_enum_values pela lista legada, mesmo sem marcador', async () => {
    const dir = await folder([{ tag: '0005_english_enum_values', sql: 'SELECT 1;' }]);

    expect(findManualMigrations(await readJournal(dir), dir)).toEqual(['0005_english_enum_values']);
  });

  it('lê o journal real do repositório', async () => {
    const entries = await readJournal();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toMatchObject({ idx: 0, tag: '0000_extensions' });
  });

  it('rejeita journal malformado', async () => {
    const dir = await folder([], JSON.stringify({ entries: [{ idx: 'x' }] }));

    await expect(readJournal(dir)).rejects.toThrow();
  });
});
