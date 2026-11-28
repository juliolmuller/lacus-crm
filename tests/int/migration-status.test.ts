import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  checkMigrationStatus,
  getMigrationStatus,
  ManualMigrationError,
  MigrationLockTimeoutError,
  MIGRATIONS_LOCK_ID,
  readJournal,
  runMigrations,
} from '../../src/lib/db/migrations';

const url = process.env.DATABASE_URL!;
const tmpDirs: string[] = [];
let client: Client;
let journalLength: number;

interface JournalFile {
  entries: Array<{ idx: number; tag: string; version: string; when: number }>;
}

/**
 * Copia a pasta real de migrations e deixa o journal editável pelo teste.
 */
async function copyFolder(edit: (journal: JournalFile) => void): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lacus-int-migrations-'));

  tmpDirs.push(dir);
  await cp('./drizzle', dir, { recursive: true });

  const path = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(path, 'utf8')) as JournalFile;

  edit(journal);
  await writeFile(path, JSON.stringify(journal));

  return dir;
}

async function appliedCount(): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    'SELECT count(*) AS n FROM drizzle.__drizzle_migrations',
  );

  return Number(rows[0]!.n);
}

beforeAll(async () => {
  client = new Client({ connectionString: url });
  await client.connect();
  journalLength = (await readJournal()).length;
});

afterAll(async () => {
  await client.end();
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('getMigrationStatus', () => {
  it('em dia com a pasta real', async () => {
    expect(await getMigrationStatus(client)).toEqual({
      kind: 'up-to-date',
      applied: journalLength,
    });
  });

  it('pendente quando o journal tem uma entrada nova', async () => {
    const folder = await copyFolder((j) =>
      j.entries.push({ idx: j.entries.length, version: '7', when: Date.now(), tag: '9999_fake' }),
    );
    const status = await getMigrationStatus(client, { folder });

    expect(status.kind).toBe('pending');
    expect(status.kind === 'pending' && status.pending.map((e) => e.tag)).toEqual(['9999_fake']);
  });

  it('à frente quando o banco tem migration que o journal não conhece', async () => {
    const folder = await copyFolder((j) => {
      j.entries.pop();
    });
    const status = await getMigrationStatus(client, { folder });

    expect(status.kind).toBe('ahead');
    expect(status.kind === 'ahead' && status.unknown).toHaveLength(1);
  });

  it('tudo pendente quando a tabela de controle não existe', async () => {
    const status = await getMigrationStatus(client, { schema: 'nonexistent_schema' });

    expect(status.kind).toBe('pending');
    expect(status.kind === 'pending' && status.pending).toHaveLength(journalLength);
  });
});

describe('checkMigrationStatus', () => {
  it('em dia no banco de teste', async () => {
    expect((await checkMigrationStatus(url)).kind).toBe('up-to-date');
  });

  it('não lança nem vaza credenciais quando o banco está inacessível', async () => {
    const status = await checkMigrationStatus('postgres://u:p@127.0.0.1:1/x', { timeoutMs: 500 });

    expect(status.kind).toBe('unreachable');
    expect(JSON.stringify(status)).not.toContain('u:p');
    expect(JSON.stringify(status)).not.toContain('postgres://');
  });

  it('URL malformada vira unreachable, sem lançar nem vazar credenciais', async () => {
    const status = await checkMigrationStatus('postgres://u:p@localhost:invalid/db', {
      timeoutMs: 500,
    });

    expect(status.kind).toBe('unreachable');
    expect(JSON.stringify(status)).not.toContain('u:p');
  });

  it('sem URL, avisa em vez de lançar', async () => {
    expect(await checkMigrationStatus(undefined)).toEqual({
      kind: 'unreachable',
      reason: 'DATABASE_URL não definida',
    });
  });

  it('pasta drizzle ausente vira unreachable, nunca exceção', async () => {
    const status = await checkMigrationStatus(url, { folder: '/nonexistent/drizzle' });

    expect(status.kind).toBe('unreachable');
  });
});

describe('runMigrations', () => {
  it('trava ocupada estoura o tempo e liberada deixa seguir', async () => {
    const holder = new Client({ connectionString: url });

    await holder.connect();
    await holder.query('SELECT pg_advisory_lock($1::bigint)', [String(MIGRATIONS_LOCK_ID)]);

    try {
      await expect(runMigrations({ url, deploy: false, lockTimeoutMs: 300 })).rejects.toThrow(
        MigrationLockTimeoutError,
      );
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1::bigint)', [String(MIGRATIONS_LOCK_ID)]);
      await holder.end();
    }

    await expect(runMigrations({ url, deploy: false, lockTimeoutMs: 300 })).resolves.toEqual([]);
  });

  it('duas execuções simultâneas terminam sem erro', async () => {
    await expect(
      Promise.all([
        runMigrations({ url, deploy: false, lockTimeoutMs: 5000 }),
        runMigrations({ url, deploy: false, lockTimeoutMs: 5000 }),
      ]),
    ).resolves.toEqual([[], []]);
  });

  it('em deploy, migration manual pendente falha antes de aplicar qualquer coisa', async () => {
    const folder = await copyFolder((j) =>
      j.entries.push({ idx: j.entries.length, version: '7', when: Date.now(), tag: '9999_fake' }),
    );

    await writeFile(join(folder, '9999_fake.sql'), '-- lacus:manual\nSELECT 1;\n');

    const before = await appliedCount();
    const error = await runMigrations({ url, folder, deploy: true, lockTimeoutMs: 1000 }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ManualMigrationError);
    expect((error as ManualMigrationError).tags).toEqual(['9999_fake']);
    expect(await appliedCount()).toBe(before);
  });

  it('em deploy, migration comum pendente é aplicada', async () => {
    const when = Date.now();
    const folder = await copyFolder((j) =>
      j.entries.push({ idx: j.entries.length, version: '7', when, tag: '9999_fake' }),
    );

    await writeFile(join(folder, '9999_fake.sql'), 'SELECT 1;\n');

    const before = await appliedCount();

    try {
      await expect(
        runMigrations({ url, folder, deploy: true, lockTimeoutMs: 1000 }),
      ).resolves.toEqual(['9999_fake']);
      expect(await appliedCount()).toBe(before + 1);
    } finally {
      // Apaga só a linha da migration falsa (pelo `when`): se ela não chegou a ser aplicada, nada é removido.
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1', [when]);
    }
  });

  it('migration com erro falha e não registra nada, e a trava é liberada', async () => {
    const folder = await copyFolder((j) =>
      j.entries.push({ idx: j.entries.length, version: '7', when: Date.now(), tag: '9999_fake' }),
    );

    await writeFile(join(folder, '9999_fake.sql'), 'SELECT * FROM tabela_que_nao_existe;\n');

    const before = await appliedCount();

    await expect(
      runMigrations({ url, folder, deploy: true, lockTimeoutMs: 1000 }),
    ).rejects.toThrow();
    expect(await appliedCount()).toBe(before);
    // A trava foi solta: outra execução passa sem estourar o tempo.
    await expect(runMigrations({ url, deploy: true, lockTimeoutMs: 300 })).resolves.toEqual([]);
  });

  it('fora de deploy, a mesma migration manual é aplicada (rodar à mão é o passo explícito)', async () => {
    const when = Date.now();
    const folder = await copyFolder((j) =>
      j.entries.push({ idx: j.entries.length, version: '7', when, tag: '9999_fake' }),
    );

    await writeFile(join(folder, '9999_fake.sql'), '-- lacus:manual\nSELECT 1;\n');

    const before = await appliedCount();

    try {
      await expect(
        runMigrations({ url, folder, deploy: false, lockTimeoutMs: 1000 }),
      ).resolves.toEqual(['9999_fake']);
      expect(await appliedCount()).toBe(before + 1);
    } finally {
      // Deixa o banco de teste como estava, para os outros arquivos.
      // Apaga só a linha da migration falsa (pelo `when`): se ela não chegou a ser aplicada, nada é removido.
      await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1', [when]);
    }

    expect(await appliedCount()).toBe(before);
  });
});
